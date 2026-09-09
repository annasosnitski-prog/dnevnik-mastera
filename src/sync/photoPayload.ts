// ============================================================
// ФОТО НА ГРАНИЦЕ ОБЛАКА — Шаг 6 синка (docs/SYNC_PLAN.md).
//
// Фото лежат base64-строками ВНУТРИ записей. Отправить их «как есть»
// значило бы уложить фотобиблиотеку целиком в Postgres jsonb одним
// upsert'ом: база бесплатного тарифа этого не выдержит, а даже если бы
// выдержала — каждый снимок уехал бы столько раз, сколько у него копий в
// сторах (см. duplicateBytes в lib/storageBreakdown.ts).
//
// Поэтому здесь запись выворачивается наизнанку ровно на время передачи:
//   отправляем — снимок уходит файлом в Storage, в строке остаётся
//                ссылка photo:<sha256> (см. photoRefs.ts);
//   принимаем  — ссылка разворачивается обратно в base64.
//
// Локальная база не меняется ничем: на устройстве снимок как был
// base64-строкой внутри записи, так и остался, и ни один экран не знает,
// что синк существует.
//
// Ключевая экономия на приёме: прежде чем качать файл, смотрим в СВОЮ
// запись с тем же id. Если снимок на месте и его хэш совпал со ссылкой —
// качать нечего. Обычная синхронизация (правку текста прислали, фото не
// трогали) не скачивает ни байта.
//
// Слияние это не трогает: mergeRecords сравнивает только updatedAt, а он
// от подмены снимка ссылкой не меняется.
// ============================================================

import type { RemoteRow } from './syncEngine.js';
import { hashToRef, isInlinePhoto, isPhotoRef, photoContentHash, refToHash } from './photoRefs.js';

// Куда синк складывает и откуда берёт файлы снимков. Настоящая реализация —
// Supabase Storage (supabaseRemote.ts); тесты подставляют свою и проверяют
// всю логику выноса и возврата без единого обращения к сети.
export interface PhotoTransport {
  // Загрузить снимок под его хэшем. Файл с таким адресом уже может лежать —
  // это не ошибка, а ровно то, ради чего адрес и есть хэш содержимого.
  upload(hash: string, dataUrl: string): Promise<void>;
  download(hash: string): Promise<string | null>;
}

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



// ── Отправка: снимок уходит в Storage, в записи остаётся ссылка ──────────

export async function externalizePhotos(
  kind: PhotoKind,
  record: RemoteRow,
  transport: PhotoTransport,
  uploaded: Set<string>,
): Promise<RemoteRow> {
  const shape = PHOTO_SHAPES[kind];
  // Клонируем только те уровни, которые меняем: structuredClone всей записи
  // поднял бы в память ту самую фотобиблиотеку, от которой мы и уходим.
  const out: RemoteRow = { ...record };

  const toRef = async (value: unknown): Promise<unknown> => {
    if (!isInlinePhoto(value)) return value;
    const hash = await photoContentHash(value);
    // uploaded общий на весь прогон синка: одинаковые копии одного снимка
    // грузятся один раз, даже если лежат в разных сторах.
    if (!uploaded.has(hash)) {
      await transport.upload(hash, value);
      uploaded.add(hash);
    }
    return hashToRef(hash);
  };

  for (const field of shape.direct) {
    const list = out[field];
    if (!Array.isArray(list)) continue;
    out[field] = await Promise.all(list.map(toRef));
  }

  for (const { field, photoField } of shape.objects) {
    const list = out[field];
    if (!Array.isArray(list)) continue;
    out[field] = await Promise.all(
      list.map(async (item) => {
        const item0 = item as Record<string, unknown> | null;
        if (!item0) return item;
        // Сам объект нужен целиком (имя документа, день заживления) —
        // подменяется только снимок.
        return { ...item0, [photoField]: await toRef(item0[photoField]) };
      }),
    );
  }

  for (const field of shape.nested) {
    const list = out[field];
    if (!Array.isArray(list)) continue;
    out[field] = await Promise.all(
      list.map(async (item) => {
        const item0 = item as Record<string, unknown> | null;
        if (!item0 || !Array.isArray(item0.photos)) return item;
        return { ...item0, photos: await Promise.all(item0.photos.map(toRef)) };
      }),
    );
  }

  return out;
}

// ── Приём: ссылка разворачивается обратно в снимок ───────────────────────

export async function internalizePhotos(
  kind: PhotoKind,
  incoming: RemoteRow,
  local: RemoteRow | undefined,
  transport: PhotoTransport,
): Promise<RemoteRow> {
  const shape = PHOTO_SHAPES[kind];
  const out: RemoteRow = { ...incoming };

  // Снимки, уже развёрнутые в этой записи: у одного фото бывает несколько
  // мест в одной записи, качать его дважды незачем.
  const cache = new Map<string, string | null>();

  const fromRef = async (value: unknown, mine: unknown): Promise<unknown> => {
    if (!isPhotoRef(value)) return value;
    const hash = refToHash(value);

    // Свой снимок на том же месте — самый частый случай: прислали правку
    // текста, фото не трогали. Сверяем хэш и не идём в сеть вовсе.
    if (isInlinePhoto(mine) && (await photoContentHash(mine)) === hash) return mine;

    if (!cache.has(hash)) cache.set(hash, await transport.download(hash));
    // Файла нет (не догрузился, вычищен) — оставляем ссылку как есть, а не
    // подставляем пустоту: иначе следующая отправка увезла бы в облако
    // «фото удалили», хотя его никто не удалял.
    return cache.get(hash) ?? value;
  };

  const mineAt = (field: string) => (local?.[field] as unknown[] | undefined) ?? [];

  for (const field of shape.direct) {
    const list = out[field];
    if (!Array.isArray(list)) continue;
    const mine = mineAt(field);
    // По позиции здесь можно: это лишь ПОДСКАЗКА, где искать свой снимок.
    // Не совпало — сверка хэша это заметит и снимок просто скачается.
    out[field] = await Promise.all(list.map((value, index) => fromRef(value, mine[index])));
  }

  for (const { field, photoField } of shape.objects) {
    const list = out[field];
    if (!Array.isArray(list)) continue;
    const mineById = byId(local?.[field]);
    out[field] = await Promise.all(
      list.map(async (item) => {
        const item0 = item as Record<string, unknown> | null;
        if (!item0) return item;
        const mine = mineById.get(String(item0.id));
        return { ...item0, [photoField]: await fromRef(item0[photoField], mine?.[photoField]) };
      }),
    );
  }

  for (const field of shape.nested) {
    const list = out[field];
    if (!Array.isArray(list)) continue;
    const mineById = byId(local?.[field]);
    out[field] = await Promise.all(
      list.map(async (item) => {
        const item0 = item as Record<string, unknown> | null;
        if (!item0 || !Array.isArray(item0.photos)) return item;
        const minePhotos = (mineById.get(String(item0.id))?.photos as unknown[] | undefined) ?? [];
        return { ...item0, photos: await Promise.all(item0.photos.map((value, index) => fromRef(value, minePhotos[index]))) };
      }),
    );
  }

  return out;
}

// ── Слияние конфликтующих фото — сверх выбора «чья версия победила» ──────
//
// mergeRecords.ts решает победителя между двумя версиями ОДНОЙ И ТОЙ ЖЕ
// записи по updatedAt — целиком, вся запись разом (см. его собственный
// комментарий про то, почему не «последний победил» по всему набору).
// У списков фото есть случай, который это не покрывает: оба устройства
// были офлайн и НЕЗАВИСИМО добавили в один и тот же проект РАЗНЫЕ снимки.
// Взять только версию победителя значило бы молча потерять снимки
// проигравшего устройства — то самое «синк съел фото».
//
// Здесь версии не выбирают, а СКЛАДЫВАЮТ: списки фото объединяются (по
// содержимому — совпадающие ложатся один раз), элементы с id (документы,
// заживление) — по id. Текст, даты и связи по-прежнему решает только
// updatedAt-победитель — это делает mergeRecords, здесь не трогается.
//
// Сравнение работает с ОБЕИХ форм снимка сразу: local ещё хранит base64,
// remote уже прислал ссылку photo:<hash> — идентичность в обоих случаях
// сводится к одному и тому же hash, поэтому сравнивать можно, не скачивая
// файл заранее.
export async function unionPhotoFields(kind: PhotoKind, winner: RemoteRow, loser: RemoteRow | undefined): Promise<RemoteRow> {
  if (!loser) return winner;
  const shape = PHOTO_SHAPES[kind];
  const out: RemoteRow = { ...winner };

  for (const field of shape.direct) {
    out[field] = await unionPhotoList(out[field], loser[field]);
  }
  for (const { field } of shape.objects) {
    out[field] = unionById(out[field], loser[field]);
  }
  for (const field of shape.nested) {
    out[field] = await unionNestedPhotos(out[field], loser[field]);
  }
  return out;
}

async function photoIdentity(value: unknown): Promise<string | null> {
  if (isPhotoRef(value)) return refToHash(value);
  if (isInlinePhoto(value)) return photoContentHash(value);
  return null;
}

// Список голых base64/ссылок (project.photos, вложенное item.photos):
// объединение по содержимому, порядок победителя сохраняется, новые снимки
// проигравшего дописываются в конец.
async function unionPhotoList(winnerList: unknown, loserList: unknown): Promise<unknown> {
  if (!Array.isArray(winnerList) && !Array.isArray(loserList)) return winnerList;
  const winner = Array.isArray(winnerList) ? winnerList : [];
  const loser = Array.isArray(loserList) ? loserList : [];
  if (loser.length === 0) return winnerList;

  const seen = new Set<string>();
  for (const value of winner) {
    const id = await photoIdentity(value);
    if (id) seen.add(id);
  }
  const extra: unknown[] = [];
  for (const value of loser) {
    const id = await photoIdentity(value);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    extra.push(value);
  }
  return extra.length ? [...winner, ...extra] : winnerList;
}

// Список объектов с собственным id (документы клиента, кадры заживления):
// новый элемент — это добавленный документ/кадр, а не правка существующего,
// поэтому объединение по id, без сравнения содержимого снимка внутри.
export function unionById(winnerList: unknown, loserList: unknown): unknown {
  if (!Array.isArray(winnerList) && !Array.isArray(loserList)) return winnerList;
  const winner = Array.isArray(winnerList) ? winnerList : [];
  const loser = Array.isArray(loserList) ? loserList : [];
  if (loser.length === 0) return winnerList;

  const ids = new Set(winner.map((item) => String((item as Record<string, unknown> | null)?.id)));
  const extra = loser.filter((item) => !ids.has(String((item as Record<string, unknown> | null)?.id)));
  return extra.length ? [...winner, ...extra] : winnerList;
}

// Сессии/консультации: сама пара «какие сессии есть» — отдельная, более
// широкая проблема (не только фото), её эта функция не решает. Но фото
// ВНУТРИ сессии, которая есть по обе стороны, объединяются как обычный
// список — если в одной и той же сессии на двух устройствах добавили
// разные снимки, обе версии остаются.
async function unionNestedPhotos(winnerList: unknown, loserList: unknown): Promise<unknown> {
  if (!Array.isArray(winnerList)) return winnerList;
  const loserById = byId(loserList);
  if (loserById.size === 0) return winnerList;

  return Promise.all(
    winnerList.map(async (item) => {
      const item0 = item as Record<string, unknown> | null;
      if (!item0 || !Array.isArray(item0.photos)) return item;
      const loserItem = loserById.get(String(item0.id));
      if (!loserItem) return item;
      const photos = await unionPhotoList(item0.photos, loserItem.photos);
      return photos === item0.photos ? item : { ...item0, photos };
    }),
  );
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
