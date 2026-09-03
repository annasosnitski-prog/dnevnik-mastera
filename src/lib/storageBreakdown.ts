// ============================================================
// КУДА УШЛО МЕСТО
//
// Настройки уже показывают общую цифру «занято N МБ» — её даёт браузер. Но
// на вопрос «что удалить, чтобы дневник перестал падать» она не отвечает
// никак: мастер видит 140 МБ и не знает, это фото работ, которые терять
// нельзя, или копии, которые никому не нужны.
//
// Фото хранятся base64-строками ВНУТРИ записей, и у одного снимка бывает до
// трёх копий в разных сторах. Здесь они разложены по смыслу:
//
//   works      — фото работ: сессии, консультации, референсы проекта,
//                заживление. ЭТО и есть дневник, тут удалять нечего.
//   documents  — документы и фото в карточках клиентов (согласия, эскизы).
//   content    — вторые копии в черновиках контента. Копия осознанная (уже
//                готовый пост не должен уехать вслед за правкой сессии), но
//                опубликованный черновик её больше не оправдывает.
//   jobs       — третьи копии в незавершённых задачах ContentINKA. Уходят
//                сами, когда задача доработает.
//   legacy     — копии, оставшиеся в карточках клиентов после переезда
//                записей на проекты (Этап 2). Приложение их НЕ читает: они
//                лежали страховкой на случай, если переезд что-то положил
//                неверно. Для мастера, работавшей в дневнике до переезда,
//                это самый большой мёртвый вес.
//
// Замер обязан быть дешёвым по памяти: считать объём фотобиблиотеки, подняв
// её в память целиком, — это ровно та беда, которую мы измеряем. Поэтому
// сторы читаются курсором, запись за записью, и каждая тут же выбрасывается
// (см. measureStorageBreakdown ниже). В памяти всегда одна запись.
// ============================================================

export interface StorageBreakdown {
  works: PhotoBucket;
  documents: PhotoBucket;
  content: PhotoBucket;
  jobs: PhotoBucket;
  legacy: PhotoBucket;
  // Сколько записей просмотрено — чтобы отличить «фото нет» от «замер не
  // дошёл до стора».
  records: number;
}

export interface PhotoBucket {
  bytes: number;
  count: number;
}

const emptyBucket = (): PhotoBucket => ({ bytes: 0, count: 0 });

export function emptyBreakdown(): StorageBreakdown {
  return {
    works: emptyBucket(),
    documents: emptyBucket(),
    content: emptyBucket(),
    jobs: emptyBucket(),
    legacy: emptyBucket(),
    records: 0,
  };
}

// Вес одной картинки. base64 — ASCII, поэтому длина строки и есть примерное
// число байт; точность здесь не нужна, нужна пропорция между разделами.
// Всё, что не строка и не похоже на данные, считается нулём: замер не имеет
// права упасть на неожиданной записи.
export function photoBytes(value: unknown): number {
  return typeof value === 'string' ? value.length : 0;
}

function addPhotos(bucket: PhotoBucket, values: unknown): void {
  if (!Array.isArray(values)) return;
  for (const value of values) {
    const bytes = photoBytes(value);
    if (bytes === 0) continue;
    bucket.bytes += bytes;
    bucket.count += 1;
  }
}

// Фото в объектах с полем url (HealingPhoto) или fileUrl (документ клиента).
function addPhotoObjects(bucket: PhotoBucket, values: unknown, field: 'url' | 'fileUrl'): void {
  if (!Array.isArray(values)) return;
  for (const value of values) {
    const bytes = photoBytes((value as Record<string, unknown> | null)?.[field]);
    if (bytes === 0) continue;
    bucket.bytes += bytes;
    bucket.count += 1;
  }
}

// Записи (сессии/консультации) внутри проекта — живые фото работ.
function addRecordPhotos(bucket: PhotoBucket, records: unknown): void {
  if (!Array.isArray(records)) return;
  for (const record of records) addPhotos(bucket, (record as Record<string, unknown> | null)?.photos);
}

// ── Замер одной записи каждого вида ──────────────────────────────────────
// Отдельно от обхода базы, чтобы правила раскладки проверялись тестом без
// IndexedDB вообще.

export function measureClient(raw: unknown, into: StorageBreakdown): void {
  const client = (raw ?? {}) as Record<string, unknown>;
  into.records += 1;
  addPhotoObjects(into.documents, client.documents, 'fileUrl');
  // Легаси-массивы: после Этапа 2 записи живут на проектах, а эти остались
  // страховкой и приложением не читаются.
  addRecordPhotos(into.legacy, client.sessions);
  addRecordPhotos(into.legacy, client.consultations);
}

export function measureProject(raw: unknown, into: StorageBreakdown): void {
  const project = (raw ?? {}) as Record<string, unknown>;
  into.records += 1;
  addPhotos(into.works, project.photos);
  addPhotoObjects(into.works, project.healingPhotos, 'url');
  addRecordPhotos(into.works, project.sessions);
  addRecordPhotos(into.works, project.consultations);
}

export function measureContentEntry(raw: unknown, into: StorageBreakdown): void {
  const entry = (raw ?? {}) as Record<string, unknown>;
  into.records += 1;
  addPhotos(into.content, entry.photos);
}

export function measureJob(raw: unknown, into: StorageBreakdown): void {
  const job = (raw ?? {}) as Record<string, unknown>;
  into.records += 1;
  const entry = job.entry as Record<string, unknown> | undefined;
  addPhotos(into.jobs, entry?.photos);
}

// ── Итоги и человеческий текст ───────────────────────────────────────────

export function totalPhotoBytes(breakdown: StorageBreakdown): number {
  return (
    breakdown.works.bytes +
    breakdown.documents.bytes +
    breakdown.content.bytes +
    breakdown.jobs.bytes +
    breakdown.legacy.bytes
  );
}

// Сколько можно освободить, ничего не потеряв: легаси-копии приложение не
// читает вообще. Копии в контенте сюда НЕ входят — они нужны, пока черновик
// не опубликован, и решать по ним мастеру.
export function reclaimableBytes(breakdown: StorageBreakdown): number {
  return breakdown.legacy.bytes;
}

export interface BreakdownLine {
  label: string;
  bucket: PhotoBucket;
  // Пояснение — только там, где без него непонятно, можно ли это удалять.
  hint?: string;
}

// Порядок — по смыслу для мастера: сначала то, что трогать нельзя, потом то,
// что можно. Пустые разделы отбрасывает вызывающая сторона.
export function breakdownLines(breakdown: StorageBreakdown): BreakdownLine[] {
  return [
    { label: 'Фото работ', bucket: breakdown.works, hint: 'Сессии, консультации, референсы, заживление — это сам дневник.' },
    { label: 'Документы клиентов', bucket: breakdown.documents },
    {
      label: 'Копии в черновиках контента',
      bucket: breakdown.content,
      hint: 'У каждого черновика своя копия фото. Опубликованные черновики можно удалить в ContentINKA.',
    },
    {
      label: 'Копии в незавершённых задачах',
      bucket: breakdown.jobs,
      hint: 'Уйдут сами, когда задачи доработают.',
    },
    {
      label: 'Старые копии после переноса',
      bucket: breakdown.legacy,
      hint: 'Остались в карточках клиентов, когда записи переехали на проекты. Дневник их не читает — это можно удалить.',
    },
  ];
}


// ── Обход базы ───────────────────────────────────────────────────────────

type Measure = (raw: unknown, into: StorageBreakdown) => void;

const STORE_MEASURES: Array<{ store: string; measure: Measure }> = [
  { store: 'clients', measure: measureClient },
  { store: 'projects', measure: measureProject },
  { store: 'contentEntries', measure: measureContentEntry },
  { store: 'contentIngestJobs', measure: measureJob },
];

// Курсор, а не getAll. Это не стилистика: getAll по стору проектов поднимает
// в память всю фотобиблиотеку целиком — то самое, из-за чего браузер
// закрывает соединение. Замер, устроенный так же, ронял бы дневник ровно в
// тот момент, когда мастер пытается понять, почему он падает.
//
// cursor.value читается, складывается в счётчики и больше нигде не хранится:
// в памяти всегда ровно одна запись.
export function measureStorageBreakdown(db: IDBDatabase): Promise<StorageBreakdown> {
  const into = emptyBreakdown();
  // Сторов может не быть (старая база, задачи появились позже) — считаем
  // только существующие, отсутствие стора это не ошибка.
  const stores = STORE_MEASURES.filter(({ store }) => db.objectStoreNames.contains(store));
  if (stores.length === 0) return Promise.resolve(into);

  return new Promise((resolve, reject) => {
    let tx: IDBTransaction;
    try {
      tx = db.transaction(
        stores.map(({ store }) => store),
        'readonly',
      );
    } catch (error) {
      reject(error);
      return;
    }
    tx.oncomplete = () => resolve(into);
    tx.onerror = () => reject(tx.error ?? new Error('не удалось прочитать объём хранилища'));
    tx.onabort = () => reject(tx.error ?? new Error('чтение объёма прервано'));

    for (const { store, measure } of stores) {
      const request = tx.objectStore(store).openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        measure(cursor.value, into);
        cursor.continue();
      };
    }
  });
}
