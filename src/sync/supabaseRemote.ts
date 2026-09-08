// ============================================================
// ПЕРЕХОДНИК К НАСТОЯЩЕМУ SUPABASE — Шаг 5 синка (docs/SYNC_PLAN.md).
//
// Реализует интерфейсы из syncEngine.ts поверх реальных таблиц (см.
// docs/sync/schema.sql). Кода здесь ровно столько, сколько нужно, чтобы
// превратить вызов supabase-js в форму, которую понимает движок — сама
// логика слияния (риск, который стоило проверять тестами) уже в
// syncEngine.ts и не трогается.
//
// owner_id нигде не отправляется явно — база проставляет его сама через
// DEFAULT auth.uid() (см. docs/sync/schema_update_1.sql), поэтому
// подделать его с этой стороны невозможно даже случайно.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type { RemoteApi, RemoteRow } from './syncEngine.js';
import type { DeletableStore, Tombstone } from '../storage/repos/tombstonesRepo.js';

const TABLE_BY_STORE: Record<'clients' | 'projects' | 'contentEntries', string> = {
  clients: 'sync_clients',
  projects: 'sync_projects',
  contentEntries: 'sync_content_entries',
};

function makeCollection(client: SupabaseClient, kind: 'clients' | 'projects' | 'contentEntries') {
  const table = TABLE_BY_STORE[kind];
  return {
    async list(): Promise<RemoteRow[]> {
      const { data, error } = await client.from(table).select('id, data, updated_at');
      if (error) throw error;
      // data.data несёт запись целиком (включая её собственные id/updatedAt);
      // колонки id/updated_at — те же значения отдельно, для индекса и RLS.
      // Берём из data, а не из колонок: это и есть настоящая запись.
      return (data ?? []).map((row) => row.data as RemoteRow);
    },
    async upsert(rows: RemoteRow[]): Promise<void> {
      if (rows.length === 0) return;
      const { error } = await client.from(table).upsert(
        rows.map((row) => ({ id: row.id, data: row, updated_at: row.updatedAt })),
      );
      if (error) throw error;
    },
    async remove(ids: string[]): Promise<void> {
      if (ids.length === 0) return;
      const { error } = await client.from(table).delete().in('id', ids);
      if (error) throw error;
    },
  };
}

function makeTombstones(client: SupabaseClient) {
  return {
    async list(store: DeletableStore): Promise<Tombstone[]> {
      const { data, error } = await client.from('sync_deletions').select('store, id, deleted_at').eq('store', store);
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
        .upsert(rows.map((row) => ({ store: row.store, id: row.id, deleted_at: row.deletedAt })));
      if (error) throw error;
    },
  };
}

function makeMasterInfo(client: SupabaseClient) {
  return {
    async get() {
      const { data, error } = await client.from('sync_master_info').select('data, updated_at').maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return data.data as Record<string, unknown> & { id: string; updatedAt: string };
    },
    async put(record: Record<string, unknown> & { updatedAt: string }): Promise<void> {
      const { error } = await client
        .from('sync_master_info')
        .upsert({ data: record, updated_at: record.updatedAt });
      if (error) throw error;
    },
  };
}

export function createSupabaseRemote(client: SupabaseClient): RemoteApi {
  return {
    clients: makeCollection(client, 'clients'),
    projects: makeCollection(client, 'projects'),
    contentEntries: makeCollection(client, 'contentEntries'),
    tombstones: makeTombstones(client),
    masterInfo: makeMasterInfo(client),
  };
}
