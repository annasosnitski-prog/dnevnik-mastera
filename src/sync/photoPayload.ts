// ============================================================
// ФОТО НЕ ЕДУТ В ОБЛАКО — промежуточный шаг синка (docs/SYNC_PLAN.md).
//
// Фото лежат base64-строками ВНУТРИ записей. Отправить их «как есть»
// значит уложить фотобиблиотеку целиком в Postgres jsonb одним upsert'ом:
// база бесплатного тарифа этого не выдержит, а даже если бы выдержала —
// каждый снимок уехал бы столько раз, сколько у него копий в сторах (см.
// duplicateBytes в lib/storageBreakdown.ts).
//
// Пока фото не переехали в Supabase Storage, синк возит ВСЁ ОСТАЛЬНОЕ:
// клиентов, проекты, даты, заметки, связи, следы удаления. Фото остаются
// на том устройстве, где сняты.
//
// Правило простое и намеренно тупое:
//   отправляем  — фото-поля пустыми массивами;
//   принимаем   — фото-поля берём из СВОЕЙ локальной записи, не из облака.
//
// Поэтому облачная запись никогда не может затереть местные снимки, а
// подстановка «по позиции в массиве» (которая ломается, как только на
// другом устройстве фото переставили) не нужна вовсе.
//
// Слияние это не трогает: mergeRecords сравнивает только updatedAt, а он
// от снятия фото не меняется.
// ============================================================

import type { RemoteRow } from './syncEngine.js';

export type PhotoKind = 'clients' | 'projects' | 'contentEntries';

interface PhotoShape {
  // Массивы base64-строк прямо в записи.
  direct: string[];
  // Массивы объектов, у которых снимок лежит в одном поле.
  objects: { field: string; photoField: string }[];
  // Массивы вложенных записей (сессии, консультации), у каждой своё photos.
  nested: string[];
}

// Держать в согласии с measure*-функциями в lib/storageBreakdown.ts: там
// перечислены ровно те же места, и tests/photoPayload.test.mjs следит,
// чтобы новое фото-поле не появилось в одном списке и не появилось в другом.
export const PHOTO_SHAPES: Record<PhotoKind, PhotoShape> = {
  clients: {
    direct: [],
    objects: [{ field: 'documents', photoField: 'fileUrl' }],
    // Легаси-массивы после переезда записей на проекты. Дневник их не
    // читает, но пока они лежат в базе — весят, и в облако им тем более не надо.
    nested: ['sessions', 'consultations'],
  },
  projects: {
    direct: ['photos'],
    objects: [{ field: 'healingPhotos', photoField: 'url' }],
    nested: ['sessions', 'consultations'],
  },
  contentEntries: {
    direct: ['photos'],
    objects: [],
    nested: [],
  },
};

function isPhotoString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

// Снять снимки с записи, сохранив всё остальное. Клонируем только те
// уровни, которые меняем: запись целиком через structuredClone означало бы
// поднять в память ту самую фотобиблиотеку, от которой мы и уходим.
export function stripPhotos(kind: PhotoKind, record: RemoteRow): RemoteRow {
  const shape = PHOTO_SHAPES[kind];
  const out: RemoteRow = { ...record };

  for (const field of shape.direct) {
    if (Array.isArray(out[field])) out[field] = [];
  }

  for (const { field, photoField } of shape.objects) {
    const list = out[field];
    if (!Array.isArray(list)) continue;
    // Сам объект нужен (имя документа, дата заживления) — пустеет только снимок.
    out[field] = list.map((item) =>
      isPhotoString((item as Record<string, unknown> | null)?.[photoField])
        ? { ...(item as Record<string, unknown>), [photoField]: '' }
        : item,
    );
  }

  for (const field of shape.nested) {
    const list = out[field];
    if (!Array.isArray(list)) continue;
    out[field] = list.map((item) =>
      Array.isArray((item as Record<string, unknown> | null)?.photos)
        ? { ...(item as Record<string, unknown>), photos: [] }
        : item,
    );
  }

  return out;
}

// Вернуть в приехавшую запись СВОИ снимки. local отсутствует, когда запись
// на этом устройстве видят впервые — тогда фото просто нет, и это честно:
// они остались на том устройстве, где их сняли.
export function restorePhotos(kind: PhotoKind, incoming: RemoteRow, local: RemoteRow | undefined): RemoteRow {
  const shape = PHOTO_SHAPES[kind];
  const out: RemoteRow = { ...incoming };

  for (const field of shape.direct) {
    const mine = local?.[field];
    if (Array.isArray(out[field])) out[field] = Array.isArray(mine) ? mine : [];
  }

  for (const { field, photoField } of shape.objects) {
    const list = out[field];
    if (!Array.isArray(list)) continue;
    // Документы могли добавиться на другом устройстве, поэтому идём по
    // приехавшему списку, а снимок ищем по id своего.
    const mineById = byId(local?.[field]);
    out[field] = list.map((item) => {
      const record = item as Record<string, unknown> | null;
      if (!record) return item;
      const mine = mineById.get(String(record.id));
      return { ...record, [photoField]: isPhotoString(mine?.[photoField]) ? mine![photoField] : '' };
    });
  }

  for (const field of shape.nested) {
    const list = out[field];
    if (!Array.isArray(list)) continue;
    const mineById = byId(local?.[field]);
    out[field] = list.map((item) => {
      const record = item as Record<string, unknown> | null;
      if (!record) return item;
      const mine = mineById.get(String(record.id));
      return { ...record, photos: Array.isArray(mine?.photos) ? mine!.photos : [] };
    });
  }

  return out;
}

function byId(list: unknown): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  if (!Array.isArray(list)) return map;
  for (const item of list) {
    const record = item as Record<string, unknown> | null;
    if (record && record.id !== undefined) map.set(String(record.id), record);
  }
  return map;
}
