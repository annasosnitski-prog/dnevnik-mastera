// ============================================================
// ДВИЖОК СИНКА — Шаг 5 синка (docs/SYNC_PLAN.md).
//
// Оркестрация: прочитать локальное и облачное, слить (mergeRecords.ts —
// Шаг 3), применить результат в обе стороны. Сам ввод-вывод (что такое
// «облако» технически) спрятан за интерфейсами RemoteCollection/
// RemoteMasterInfo — здесь их не создают, только используют. Поэтому
// весь риск слияния данных проверяется тестами без единого обращения к
// настоящей сети (см. tests/syncEngine.test.mjs); переходник к
// настоящему Supabase — отдельно, src/sync/supabaseRemote.ts.
// ============================================================

import {
  getAllTombstones,
  recordDeletion,
  tombstoneKey,
  DELETIONS_STORE,
  type DeletableStore,
  type Tombstone,
} from '../storage/repos/tombstonesRepo.js';
import { mergeRecords, type MergeableRecord } from '../storage/mergeRecords.js';
import { stampUpdatedAt } from '../storage/updatedAt.js';
import * as clientsRepo from '../storage/repos/clientsRepo.js';
import * as projectsRepo from '../storage/repos/projectsRepo.js';
import * as contentRepo from '../storage/repos/contentRepo.js';
import { getMasterInfoRecord, putMasterInfoRecord } from '../storage/repos/masterInfoRepo.js';
import { externalizePhotos, internalizePhotos, photoFieldsChanged, unionPhotoFields, type PhotoTransport } from './photoPayload.js';

export interface RemoteRow extends MergeableRecord {
  [key: string]: unknown;
}

export interface RemoteCollection {
  // Дёшево: id и updatedAt каждой строки, БЕЗ data — Postgres даже не
  // достаёт jsonb-колонку. Этого достаточно, чтобы решить, что вообще
  // разошлось (Шаг 7, docs/SYNC_PLAN.md): mergeRecords сравнивает только
  // updatedAt, поэтому на метаданных он даёт тот же ответ, что и на телах.
  listMetadata(): Promise<MergeableRecord[]>;
  // Тела — только тех записей, что реально понадобились по итогам
  // сравнения метаданных: обычная синхронизация — это горстка id, а не
  // вся библиотека.
  getByIds(ids: string[]): Promise<RemoteRow[]>;
  upsert(rows: RemoteRow[]): Promise<void>;
  // Убрать устаревшую строку из облака, когда туда уезжает более свежий
  // след удаления. Не обязательно для корректности слияния (след с более
  // поздним временем и так побеждает при следующей встрече устройств),
  // но без этого удалённое накапливалось бы в облаке навсегда.
  remove(ids: string[]): Promise<void>;
}

export interface RemoteTombstones {
  list(store: DeletableStore): Promise<Tombstone[]>;
  upsert(tombstones: Tombstone[]): Promise<void>;
}

export interface RemoteMasterInfo {
  get(): Promise<(Record<string, unknown> & MergeableRecord) | null>;
  put(record: Record<string, unknown> & { updatedAt: string }): Promise<void>;
}

export interface RemoteApi {
  // Файлы снимков. В Postgres уезжают только ссылки photo:<sha256>
  // (см. photoPayload.ts) — сами снимки лежат отдельно, в Storage.
  photos: PhotoTransport;
  clients: RemoteCollection;
  projects: RemoteCollection;
  contentEntries: RemoteCollection;
  masterInfo: RemoteMasterInfo;
  tombstones: RemoteTombstones;
}

interface CollectionAdapter {
  store: DeletableStore;
  put(tx: IDBTransaction, record: RemoteRow, options: { preserveUpdatedAt: true }): void;
  remove(tx: IDBTransaction, id: string): void;
}

const adapters: Record<'clients' | 'projects' | 'contentEntries', CollectionAdapter> = {
  clients: {
    store: 'clients',
    put: clientsRepo.putClient,
    remove: clientsRepo.removeClientRecordOnly,
  },
  projects: {
    store: 'projects',
    put: projectsRepo.putProject,
    remove: projectsRepo.removeProjectRecordOnly,
  },
  contentEntries: {
    store: 'contentEntries',
    put: contentRepo.putContentEntry,
    remove: contentRepo.removeContentEntryRecordOnly,
  },
};

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Метаданные локального стора одним курсором, а не getAll(). В базе нет ни
// одного индекса, только ключ id (см. storage/connection.ts), поэтому
// курсор всё равно достаёт каждую запись целиком — но по одной, и тут же
// отпускает: в памяти держится только { id, updatedAt } на N записей, а не
// N тел со снимками разом. Индекс по updatedAt (Шаг 7, docs/SYNC_PLAN.md)
// убрал бы и это чтение тела, но это отдельный шаг с миграцией версии базы.
function getLocalMetadata(tx: IDBTransaction, store: DeletableStore): Promise<MergeableRecord[]> {
  return new Promise((resolve, reject) => {
    const result: MergeableRecord[] = [];
    const request = tx.objectStore(store).openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve(result);
        return;
      }
      const value = cursor.value as RemoteRow;
      const updatedAt = value.updatedAt;
      result.push({ id: value.id as string, updatedAt: typeof updatedAt === 'string' ? updatedAt : undefined });
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
  });
}

// Локальное тело ОДНОЙ записи — точечным get(), а не getAll()/пакетом сразу
// по многим id. Локальные тела, в отличие от облачных (те лежат ссылками на
// снимки), несут настоящий base64 — пакетный запрос держал бы в памяти ВСЕ
// их разом, если делта большая (долгий офлайн, первая привязка нового
// устройства к уже большой библиотеке). Используется и для приезжающих
// записей (контрагент для unionPhotoFields), и для отправляемых (само тело,
// которое едет в облако) — см. Шаги 7Б и 7В, docs/SYNC_PLAN.md. Своя
// транзакция на каждый вызов: предыдущая уже могла закрыться (await на
// сеть — скачивание или отправка снимка — между вызовами).
function getLocalRecordById(db: IDBDatabase, store: DeletableStore, id: string): Promise<RemoteRow | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const request = tx.objectStore(store).get(id);
    request.onsuccess = () => resolve(request.result as RemoteRow | undefined);
    request.onerror = () => reject(request.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export interface CollectionSyncSummary {
  pulled: number;
  pushed: number;
  deletedLocally: number;
  tombstonesPulled: number;
  tombstonesPushed: number;
}

async function syncCollection(
  db: IDBDatabase,
  kind: 'clients' | 'projects' | 'contentEntries',
  remote: RemoteCollection,
  remoteTombstones: RemoteTombstones,
  photos: PhotoTransport,
  uploaded: Set<string>,
): Promise<CollectionSyncSummary> {
  const adapter = adapters[kind];

  // Шаг 7А (docs/SYNC_PLAN.md): сначала дёшево узнаём, что вообще
  // разошлось. Ни здесь, ни в облаке тела ещё не читаются — только
  // id/updatedAt, считаные килобайты даже на библиотеке в сотни мегабайт.
  const readTx = db.transaction([adapter.store, DELETIONS_STORE], 'readonly');
  const [localMeta, localTombstonesAll] = await Promise.all([
    getLocalMetadata(readTx, adapter.store),
    requestToPromise(getAllTombstones(readTx)),
  ]);
  const localTombstones = localTombstonesAll.filter((t) => t.store === adapter.store);

  const [remoteMeta, remoteTombstoneRows] = await Promise.all([remote.listMetadata(), remoteTombstones.list(adapter.store)]);

  const merged = mergeRecords({
    local: localMeta,
    remote: remoteMeta,
    localTombstones,
    remoteTombstones: remoteTombstoneRows,
  });

  // Теперь — тела, но только тех id, что реально разошлись. Обычная
  // синхронизация — это горстка записей, а не вся библиотека: именно
  // загрузка ВСЕЙ библиотеки разом (getAll/list целиком) убивала вкладку на
  // телефоне при заметном объёме данных.
  const pullIds = merged.toWriteLocally.map((r) => r.id);
  const pushIds = merged.toPushRemotely.map((r) => r.id);
  // Облачное тело нужно приезжающим (обязательно) и отправляемым (для
  // unionPhotoFields — только если там вообще есть что-то под этим id, иначе
  // спрашивать не о чем: частый случай — только что созданная запись, в
  // облаке её ещё никогда не было). Облачные тела лежат ссылками на снимки,
  // а не base64 — пакетный запрос здесь дёшев в любом случае (см. Шаг 7А).
  const remoteIdSet = new Set(remoteMeta.map((r) => r.id));
  const idsNeedingRemoteBody = pullIds.concat(pushIds.filter((id) => remoteIdSet.has(id)));
  const remoteBodies = await remote.getByIds(idsNeedingRemoteBody);
  // Облачные — под рукой для обеих сторон: приезжающим нужно само тело,
  // отправляемым — как контрагент, чтобы не потерять снимки, добавленные в
  // облако с ДРУГОГО устройства офлайн (unionPhotoFields).
  const remoteById = new Map(remoteBodies.map((record) => [record.id, record]));

  // Локальные тела — и приезжающих (контрагент для unionPhotoFields), и
  // отправляемых (само тело) — читаются по одной записи (getLocalRecordById),
  // НЕ пакетом. В отличие от облачных, локальные лежат настоящим base64:
  // пакетный запрос держал бы в памяти ВСЕ их разом, если делта большая
  // (долгий офлайн, первая привязка нового устройства к уже большой
  // библиотеке) — ровно то, от чего Шаги 7Б/7В (docs/SYNC_PLAN.md) уводят.
  //
  // Плата везде одна — идемпотентность вместо скорости: обрыв на записи N
  // оставляет 1..N-1 уже применёнными (каждая — своя завершённая
  // транзакция/отправка), а повторный синк заново решит на метаданных, что
  // осталось разошедшимся, и довезёт остальное без повторной работы.

  // ПРИЁМ — по одной записи. Снимки разворачиваются ДО открытия записи:
  // транзакция IndexedDB живёт до первого витка событий без запросов, а
  // скачивание файла — это await на сеть, который её гарантированно закроет.
  let pulledCount = 0;
  for (const id of pullIds) {
    const record = remoteById.get(id);
    // Запись пропала из облака между чтением метаданных и этим чтением (её
    // удалили с другого устройства ровно сейчас) — пропускаем, следующий
    // синк подтянет след удаления обычным путём.
    if (!record) continue;
    // Запись победила из облака, но локально по этому id могла быть своя
    // версия — офлайн-добавленные в неё снимки складываются, а не теряются
    // (см. unionPhotoFields).
    const localCounterpart = await getLocalRecordById(db, adapter.store, record.id);
    const unioned = await unionPhotoFields(kind, record, localCounterpart);
    const expanded = await internalizePhotos(kind, unioned, localCounterpart, photos);
    const writeTx = db.transaction(adapter.store, 'readwrite');
    adapter.put(writeTx, expanded, { preserveUpdatedAt: true });
    await txDone(writeTx);
    pulledCount += 1;
  }

  // ОТПРАВКА — тоже по одной записи: своё тело читается точечно, отправляется
  // в облако сразу после обработки — не копится в один pushRows и один
  // remote.upsert() на всю делту.
  let pushedCount = 0;
  for (const id of pushIds) {
    // Запись успели удалить локально между решением и чтением тела —
    // редкая гонка, не повод валить прогон: пропускаем, след удаления
    // обычным путём доедет до облака на следующем синке.
    const record0 = await getLocalRecordById(db, adapter.store, id);
    if (!record0) continue;
    // Записи, заведённые до появления updatedAt (Шаг 1 синка) и ни разу с
    // тех пор не пересохранённые, физически не имеют этого поля — put*
    // репозиториев штампует его на ЗАПИСИ, а не на чтении. Отправить такую
    // запись как есть значило бы отправить updated_at: undefined в столбец
    // NOT NULL — облако отказывает целиком. Тот же fallback на createdDate,
    // что и при восстановлении из бэкапа (см. updatedAt.ts).
    const record = stampUpdatedAt(record0, { preserveUpdatedAt: true });
    // Снимки, добавленные там офлайн на другом устройстве, дописываются в
    // отправляемую запись, а не затираются (unionPhotoFields).
    const unioned = await unionPhotoFields(kind, record, remoteById.get(record.id));
    // Если дописать было что, отправленная запись богаче, чем наша
    // собственная локальная копия. Записать это только в облако мало: раз мы
    // не меняем updatedAt (текст и так уже победил, время не при чём), при
    // следующем синке mergeRecords увидит РАВНЫЕ updatedAt у себя и в облаке
    // и ничего не сделает («ничего не делаем» при равенстве времени, см.
    // mergeRecords.ts) — устройство навсегда останется без снимка, который
    // само же отправило дальше. Поэтому обогащённая запись пишется и сюда
    // же, локально, тем же самым updatedAt — И ДО отправки: если оборвётся
    // между этой записью и отправкой, следующий синк увидит локальную копию
    // уже обогащённой и просто попробует отправить её снова, а обратный
    // порядок в этом случае навсегда лишил бы устройство собственного же
    // снимка (updatedAt совпал бы с обликом в облаке — «расхождения нет»).
    if (photoFieldsChanged(kind, record, unioned)) {
      const enriched = await internalizePhotos(kind, unioned, record, photos);
      const writeTx = db.transaction(adapter.store, 'readwrite');
      adapter.put(writeTx, enriched, { preserveUpdatedAt: true });
      await txDone(writeTx);
    }
    const pushRow = await externalizePhotos(kind, unioned, photos, uploaded);
    await remote.upsert([pushRow]);
    pushedCount += 1;
  }

  // Удаления и следы удаления — одной транзакцией на всю делту: это id и
  // время, без тел, батч здесь не опасен.
  if (merged.toDeleteLocally.length || merged.tombstonesToStore.length) {
    const writeTx = db.transaction([adapter.store, DELETIONS_STORE], 'readwrite');
    for (const id of merged.toDeleteLocally) adapter.remove(writeTx, id);
    // Время следа — из облака (когда там удалили), а не «сейчас»: устройство
    // могло быть офлайн неделю, и «сейчас» соврало бы о том, когда это
    // случилось на самом деле (см. removeClientRecordOnly и т.п.).
    for (const tombstone of merged.tombstonesToStore) {
      recordDeletion(writeTx, adapter.store, tombstone.id, () => tombstone.deletedAt);
    }
    await txDone(writeTx);
  }

  if (merged.tombstonesToPush.length) {
    await remoteTombstones.upsert(
      merged.tombstonesToPush.map((t) => ({ ...t, store: adapter.store, key: tombstoneKey(adapter.store, t.id) })),
    );
    await remote.remove(merged.tombstonesToPush.map((t) => t.id));
  }

  return {
    // Реально применённое, а не только решённое: если тело пропало из-за
    // гонки (см. фильтры выше), запись не в счёт — она просто не долетела в
    // этот раз, следующий синк доведёт дело до конца.
    pulled: pulledCount,
    pushed: pushedCount,
    deletedLocally: merged.toDeleteLocally.length,
    tombstonesPulled: merged.tombstonesToStore.length,
    tombstonesPushed: merged.tombstonesToPush.length,
  };
}

// Личный кабинет — одна запись без следов удаления (в дневнике её никогда
// не удаляют, только правят), поэтому здесь достаточно сравнить время
// правки напрямую — того усложнения, что в mergeRecords, не нужно.
async function syncMasterInfo(db: IDBDatabase, remote: RemoteMasterInfo): Promise<'pulled' | 'pushed' | 'unchanged'> {
  const readTx = db.transaction('masterInfo', 'readonly');
  const local = await requestToPromise(getMasterInfoRecord<Record<string, unknown> & MergeableRecord>(readTx));
  const remoteRecord = await remote.get();

  const localAt = local?.updatedAt ?? '';
  const remoteAt = remoteRecord?.updatedAt ?? '';

  if (remoteRecord && remoteAt > localAt) {
    const writeTx = db.transaction('masterInfo', 'readwrite');
    putMasterInfoRecord(writeTx, remoteRecord, { preserveUpdatedAt: true });
    await txDone(writeTx);
    return 'pulled';
  }
  if (local && localAt > remoteAt) {
    await remote.put(local as Record<string, unknown> & { updatedAt: string });
    return 'pushed';
  }
  return 'unchanged';
}

export interface SyncSummary {
  clients: CollectionSyncSummary;
  projects: CollectionSyncSummary;
  contentEntries: CollectionSyncSummary;
  masterInfo: 'pulled' | 'pushed' | 'unchanged';
}

export async function runFullSync(db: IDBDatabase, remote: RemoteApi): Promise<SyncSummary> {
  // Последовательно, не Promise.all: contentEntries может ссылаться на
  // clients/projects (link/clientId) — если что-то пойдёт не так на
  // клиентах, лучше остановиться, чем свести контент с наполовину слитыми
  // клиентами. Дороговизны здесь нет — раз в час, не в цикле рендера.
  // Один набор на весь прогон: копии одного снимка в разных сторах грузятся
  // в облако ровно один раз.
  const uploaded = new Set<string>();
  const clients = await syncCollection(db, 'clients', remote.clients, remote.tombstones, remote.photos, uploaded);
  const projects = await syncCollection(db, 'projects', remote.projects, remote.tombstones, remote.photos, uploaded);
  const contentEntries = await syncCollection(db, 'contentEntries', remote.contentEntries, remote.tombstones, remote.photos, uploaded);
  const masterInfo = await syncMasterInfo(db, remote.masterInfo);
  return { clients, projects, contentEntries, masterInfo };
}
