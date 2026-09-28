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

// Тела ПО СПИСКУ id — точечными get(), а не getAll() всего стора. Своя
// транзакция: readTx выше к этому моменту уже мог закрыться (await на сеть
// между метаданными и этим вызовом — см. комментарий у SYNC_IN_PROGRESS_KEY
// в useSyncDriver.ts про ту же западню с IndexedDB).
function getLocalRecordsByIds(db: IDBDatabase, store: DeletableStore, ids: string[]): Promise<RemoteRow[]> {
  if (ids.length === 0) return Promise.resolve([]);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const objectStore = tx.objectStore(store);
    const result: RemoteRow[] = [];
    let pending = ids.length;
    for (const id of ids) {
      const request = objectStore.get(id);
      request.onsuccess = () => {
        // Запись могла исчезнуть между чтением метаданных и этим чтением
        // (мастер удалила её ровно в этот момент) — редкая гонка, не повод
        // валить прогон: пропускаем, след удаления обычным путём доедет до
        // облака на следующем синке.
        if (request.result) result.push(request.result as RemoteRow);
        pending -= 1;
        if (pending === 0) resolve(result);
      };
      request.onerror = () => reject(request.error);
    }
  });
}

// Один локальный контрагент — для unionPhotoFields при пуле ОДНОЙ приезжающей
// записи, не пакетом со всеми pullIds сразу. Если у устройства уже была
// большая библиотека и после долгого офлайна побеждает облако сразу у многих
// записей, пакетный запрос держал бы в памяти ВСЕ их старые тела со снимками
// разом — ту же беду, от которой Шаг 7Б (docs/SYNC_PLAN.md) уводит сами
// приезжающие тела. Своя транзакция на каждый вызов: предыдущая уже могла
// закрыться (await на сеть — скачивание снимка — между вызовами).
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
  // На отправляемую запись тело из облака нужно, только если там вообще
  // есть что-то под этим id — иначе объединять со снимками не с чем, и
  // спрашивать облако не о чем (частый случай: только что созданный
  // клиент/проект, которого в облаке ещё никогда не было).
  const remoteIdSet = new Set(remoteMeta.map((r) => r.id));
  const idsNeedingRemoteBody = pullIds.concat(pushIds.filter((id) => remoteIdSet.has(id)));
  // Локально пакетом — ТОЛЬКО то, что реально нужно отправить (pushIds): эти
  // тела всё равно едут в облако целиком, батч их не размножает. Контрагент
  // для приезжающих записей (pullIds) читается по одному, внутри цикла ниже
  // (getLocalRecordById) — см. комментарий там.
  const idsNeedingLocalBody = pushIds;

  const [remoteBodies, localBodies] = await Promise.all([
    remote.getByIds(idsNeedingRemoteBody),
    getLocalRecordsByIds(db, adapter.store, idsNeedingLocalBody),
  ]);
  // Свои записи под рукой: нужны для отправки (pushIds) и как контрагент для
  // unionPhotoFields на стороне облака (см. remoteIdSet выше).
  const localById = new Map(localBodies.map((record) => [record.id, record]));
  // Облачные — под рукой для обратного случая: победила локальная правка,
  // но снимки, добавленные с ДРУГОГО устройства офлайн, не должны потеряться.
  const remoteById = new Map(remoteBodies.map((record) => [record.id, record]));

  // Шаг 7Б (docs/SYNC_PLAN.md): каждая приезжающая запись разворачивается и
  // пишется СВОЕЙ транзакцией — по одной, не Promise.all и не один большой
  // writeTx на всю делту. Если делта размером во всю библиотеку (первая
  // привязка нового устройства к уже большой библиотеке, очень долгий
  // офлайн), это единственное, что не даёт всем её снимкам оказаться в
  // памяти разом — снимки лежат base64-строками внутри записей, и именно
  // это убивало вкладку на телефоне.
  //
  // Плата — идемпотентность вместо скорости: обрыв на записи N оставляет
  // 1..N-1 уже применёнными (каждая — отдельная завершённая транзакция), а
  // повторный синк заново решит на метаданных, что осталось разошедшимся, и
  // довезёт остальное без повторной работы над уже приехавшим.
  //
  // Снимки разворачиваются ДО открытия записи: транзакция IndexedDB живёт
  // до первого витка событий без запросов, а скачивание файла — это await
  // на сеть, который её гарантированно закроет.
  let pulledCount = 0;
  for (const id of pullIds) {
    const record = remoteById.get(id);
    // Запись пропала из облака между чтением метаданных и этим чтением (её
    // удалили с другого устройства ровно сейчас) — пропускаем, следующий
    // синк подтянет след удаления обычным путём.
    if (!record) continue;
    // Запись победила из облака, но локально по этому id могла быть своя
    // версия — офлайн-добавленные в неё снимки складываются, а не теряются
    // (см. unionPhotoFields). Читаем контрагента здесь же, по одному
    // (getLocalRecordById), а не из общего localById — см. комментарий у
    // idsNeedingLocalBody выше.
    const localCounterpart = await getLocalRecordById(db, adapter.store, record.id);
    const unioned = await unionPhotoFields(kind, record, localCounterpart);
    const expanded = await internalizePhotos(kind, unioned, localCounterpart, photos);
    const writeTx = db.transaction(adapter.store, 'readwrite');
    adapter.put(writeTx, expanded, { preserveUpdatedAt: true });
    await txDone(writeTx);
    pulledCount += 1;
  }

  // Локальная правка победила, но в облаке по этому id уже могла лежать
  // своя версия — снимки, добавленные там офлайн на другом устройстве,
  // дописываются в отправляемую запись, а не затираются (unionPhotoFields).
  //
  // Если дописать было что, отправленная запись богаче, чем наша
  // собственная локальная копия. Записать это только в облако мало: раз мы
  // не меняем updatedAt (текст и так уже победил, время не при чём), при
  // следующем синке mergeRecords увидит РАВНЫЕ updatedAt у себя и в облаке
  // и ничего не сделает («ничего не делаем» при равенстве времени, см.
  // mergeRecords.ts) — устройство навсегда останется без снимка, который
  // само же отправило дальше. Поэтому обогащённая запись пишется и сюда же,
  // локально, тем же самым updatedAt.
  const pushRows: RemoteRow[] = [];
  const photoEnrichedLocally: RemoteRow[] = [];
  for (const id of pushIds) {
    // Запись успели удалить локально между решением и чтением тела —
    // редкая гонка, не повод валить прогон: пропускаем, след удаления
    // обычным путём доедет до облака на следующем синке.
    const record0 = localById.get(id);
    if (!record0) continue;
    // Записи, заведённые до появления updatedAt (Шаг 1 синка) и ни разу с
    // тех пор не пересохранённые, физически не имеют этого поля — put*
    // репозиториев штампует его на ЗАПИСИ, а не на чтении. Отправить такую
    // запись как есть значило бы отправить updated_at: undefined в столбец
    // NOT NULL — облако отказывает целиком. Тот же fallback на createdDate,
    // что и при восстановлении из бэкапа (см. updatedAt.ts).
    const record = stampUpdatedAt(record0, { preserveUpdatedAt: true });
    const unioned = await unionPhotoFields(kind, record, remoteById.get(record.id));
    // Последовательно, не Promise.all: параллельная отправка всех записей
    // разом подняла бы в память столько снимков, сколько их набралось за
    // офлайн — ровно та беда, от которой уходим.
    pushRows.push(await externalizePhotos(kind, unioned, photos, uploaded));
    if (photoFieldsChanged(kind, record, unioned)) {
      photoEnrichedLocally.push(await internalizePhotos(kind, unioned, record, photos));
    }
  }

  // Записи из PUSH-направления (photoEnrichedLocally) и удаления — по-прежнему
  // одной транзакцией: ни те, ни другие не тянут за собой чужой фотобиблиотеки
  // (удаление — это id и след, без тела; photoEnrichedLocally придёт по одной
  // записи вместо пакета в Шаге 7В), так что батч здесь не опасен.
  if (merged.toDeleteLocally.length || merged.tombstonesToStore.length || photoEnrichedLocally.length) {
    const writeTx = db.transaction([adapter.store, DELETIONS_STORE], 'readwrite');
    for (const record of photoEnrichedLocally) adapter.put(writeTx, record, { preserveUpdatedAt: true });
    for (const id of merged.toDeleteLocally) adapter.remove(writeTx, id);
    // Время следа — из облака (когда там удалили), а не «сейчас»: устройство
    // могло быть офлайн неделю, и «сейчас» соврало бы о том, когда это
    // случилось на самом деле (см. removeClientRecordOnly и т.п.).
    for (const tombstone of merged.tombstonesToStore) {
      recordDeletion(writeTx, adapter.store, tombstone.id, () => tombstone.deletedAt);
    }
    await txDone(writeTx);
  }

  if (pushRows.length) await remote.upsert(pushRows);
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
    pushed: pushRows.length,
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
