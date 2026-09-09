// ============================================================
// ПЕРЕХОДНИК К НАСТОЯЩЕМУ SUPABASE — Шаг 5 синка (docs/SYNC_PLAN.md).
//
// Реализует интерфейсы из syncEngine.ts поверх реальных таблиц (см.
// docs/sync/schema.sql). Кода здесь ровно столько, сколько нужно, чтобы
// превратить вызов supabase-js в форму, которую понимает движок — сама
// логика слияния (риск, который стоило проверять тестами) уже в
// syncEngine.ts и не трогается.
//
// owner_id берём из ТЕКУЩЕЙ авторизованной сессии и отправляем явно.
// RLS всё равно проверяет owner_id = auth.uid(), поэтому подменить владельца
// клиент не может. Это убирает хрупкую зависимость от отдельного
// schema_update_1.sql с DEFAULT auth.uid().
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type { RemoteApi, RemoteRow } from './syncEngine.js';
import type { PhotoTransport } from './photoPayload.js';
import type { DeletableStore, Tombstone } from '../storage/repos/tombstonesRepo.js';

const TABLE_BY_STORE: Record<'clients' | 'projects' | 'contentEntries', string> = {
  clients: 'sync_clients',
  projects: 'sync_projects',
  contentEntries: 'sync_content_entries',
};

function makeCollection(client: SupabaseClient, ownerId: string, kind: 'clients' | 'projects' | 'contentEntries') {
  const table = TABLE_BY_STORE[kind];
  return {
    async list(): Promise<RemoteRow[]> {
      const { data, error } = await client.from(table).select('id, data, updated_at');
      if (error) throw error;
      return (data ?? []).map((row) => row.data as RemoteRow);
    },
    async upsert(rows: RemoteRow[]): Promise<void> {
      if (rows.length === 0) return;
      const { error } = await client.from(table).upsert(
        rows.map((row) => ({ owner_id: ownerId, id: row.id, data: row, updated_at: row.updatedAt })),
      );
      if (error) throw error;
    },
    async remove(ids: string[]): Promise<void> {
      if (ids.length === 0) return;
      const { error } = await client.from(table).delete().eq('owner_id', ownerId).in('id', ids);
      if (error) throw error;
    },
  };
}

function makeTombstones(client: SupabaseClient, ownerId: string) {
  return {
    async list(store: DeletableStore): Promise<Tombstone[]> {
      const { data, error } = await client
        .from('sync_deletions')
        .select('store, id, deleted_at')
        .eq('owner_id', ownerId)
        .eq('store', store);
      if (error) throw error;
      return (data ?? []).map((row) => ({
        key: `${row.store}:${row.id}`,
        store: row.store as DeletableStore,
        id: row.id as string,
        deletedAt: row.deleted_at as string,
      }));
    },
    async upsert(rows: (Tombstone & { store: DeletableStore })[]): Promise<void> {
      if (rows.length === 0) return;
      const { error } = await client
        .from('sync_deletions')
        .upsert(rows.map((row) => ({ owner_id: ownerId, store: row.store, id: row.id, deleted_at: row.deletedAt })));
      if (error) throw error;
    },
  };
}

function makeMasterInfo(client: SupabaseClient, ownerId: string) {
  return {
    async get() {
      const { data, error } = await client
        .from('sync_master_info')
        .select('data, updated_at')
        .eq('owner_id', ownerId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return data.data as Record<string, unknown> & { id: string; updatedAt: string };
    },
    async put(record: Record<string, unknown> & { updatedAt: string }): Promise<void> {
      const { error } = await client
        .from('sync_master_info')
        .upsert({ owner_id: ownerId, data: record, updated_at: record.updatedAt });
      if (error) throw error;
    },
  };
}

// Файлы снимков. Имя файла — sha256 его содержимого (photoRefs.ts), поэтому
// одинаковые копии одного фото занимают в облаке место один раз, а «уже
// есть такой файл» — не ошибка, а штатный и самый частый исход загрузки.
const PHOTO_BUCKET = 'sync-photos';

function makePhotos(client: SupabaseClient, ownerId: string): PhotoTransport {
  const pathOf = (hash: string) => `${ownerId}/${hash}`;

  return {
    async upload(hash, dataUrl) {
      const blob = dataUrlToBlob(dataUrl);
      // upsert: true, а не ловля «уже существует» по тексту ошибки. Имя
      // файла — хэш его содержимого, поэтому перезаписать существующий файл
      // с тем же именем значит записать ТЕ ЖЕ САМЫЕ байты поверх себя же —
      // безопасно всегда, и то, что реально происходит при каждом повторном
      // синке того же снимка (набор uploaded общий только на один прогон,
      // см. syncEngine.ts, — при следующем прогоне снимок пробуют залить снова).
      //
      // Раньше здесь ловили конфликт по upsert:false и тексту ошибки
      // («exists»/«duplicate»). На реальном Supabase конфликт иногда
      // приходит сырой ошибкой Postgres («duplicate key value violates
      // unique constraint», код 23505) под HTTP 400, а не ожидаемым 409 —
      // и не всегда с тем текстом, который проверка ждала. Один
      // непойманный случай ронял синк целиком: sync падал каждый раз на
      // объёмной библиотеке, где почти все снимки уже лежат в Storage
      // с прошлой попытки.
      const { error } = await client.storage.from(PHOTO_BUCKET).upload(pathOf(hash), blob, { contentType: blob.type, upsert: true });
      if (error) throw error;
    },

    async download(hash) {
      const { data, error } = await client.storage.from(PHOTO_BUCKET).download(pathOf(hash));
      // Нет файла — не повод валить весь синк: запись приедет со ссылкой,
      // и снимок подтянется на следующем разе (см. internalizePhotos).
      if (error || !data) return null;
      return await blobToDataUrl(data);
    },
  };
}

// base64-строка ↔ файл. Через Blob, а не через ручную сборку байтов:
// снимок уходит на сервер бинарно, без лишней трети веса от base64.
function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(',');
  const header = dataUrl.slice(0, comma);
  const type = header.slice(5, header.indexOf(';') === -1 ? undefined : header.indexOf(';')) || 'image/jpeg';
  const binary = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('не удалось прочитать снимок из облака'));
    reader.readAsDataURL(blob);
  });
}

export async function createSupabaseRemote(client: SupabaseClient): Promise<RemoteApi> {
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  const ownerId = data.session?.user.id;
  if (!ownerId) {
    throw new Error('Синк не авторизован: Supabase не выдал сессию. Проверьте настройку Confirm email.');
  }

  return {
    photos: makePhotos(client, ownerId),
    clients: makeCollection(client, ownerId, 'clients'),
    projects: makeCollection(client, ownerId, 'projects'),
    contentEntries: makeCollection(client, ownerId, 'contentEntries'),
    tombstones: makeTombstones(client, ownerId),
    masterInfo: makeMasterInfo(client, ownerId),
  };
}
