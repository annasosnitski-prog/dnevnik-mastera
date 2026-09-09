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
import * as clientsRepo from '../storage/repos/clientsRepo.js';
import * as projectsRepo from '../storage/repos/projectsRepo.js';
import * as contentRepo from '../storage/repos/contentRepo.js';
import { getMasterInfoRecord, putMasterInfoRecord } from '../storage/repos/masterInfoRepo.js';
import { externalizePhotos, internalizePhotos, unionPhotoFields, type PhotoTransport } from './photoPayload.js';

export interface RemoteRow extends MergeableRecord {
  [key: string]: unknown;
}

export interface RemoteCollection {
  list(): Promise<RemoteRow[]>;
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
  getAll(tx: IDBTransaction): IDBRequest<RemoteRow[]>;
  put(tx: IDBTransaction, record: RemoteRow, options: { preserveUpdatedAt: true }): void;
  remove(tx: IDBTransaction, id: string): void;
}

const adapters: Record<'clients' | 'projects' | 'contentEntries', CollectionAdapter> = {
  clients: {
    store: 'clients',
    getAll: clientsRepo.getAllClients,
    put: clientsRepo.putClient,
    remove: clientsRepo.removeClientRecordOnly,
  },
  projects: {
    store: 'projects',
    getAll: projectsRepo.getAllProjects,
    put: projectsRepo.putProject,
    remove: projectsRepo.removeProjectRecordOnly,
  },
  contentEntries: {
    store: 'contentEntries',
    getAll: contentRepo.getAllContentEntries,
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

  const readTx = db.transaction([adapter.store, DELETIONS_STORE], 'readonly');
  const [local, localTombstonesAll] = await Promise.all([
    requestToPromise(adapter.getAll(readTx)),
    requestToPromise(getAllTombstones(readTx)),
  ]);
  const localTombstones = localTombstonesAll.filter((t) => t.store === adapter.store);

  const [remoteRecords, remoteTombstoneRows] = await Promise.all([remote.list(), remoteTombstones.list(adapter.store)]);

  const merged = mergeRecords({
    local,
    remote: remoteRecords,
    localTombstones,
    remoteTombstones: remoteTombstoneRows,
  });

  // Свои записи под рукой: приехавшая ссылка на снимок чаще всего
  // разворачивается из собственного фото, а не скачиванием (photoPayload.ts).
  const localById = new Map(local.map((record) => [record.id, record]));
  // Облачные — под рукой для обратного случая: победила локальная правка,
  // но снимки, добавленные с ДРУГОГО устройства офлайн, не должны потеряться.
  const remoteById = new Map(remoteRecords.map((record) => [record.id, record]));

  // Снимки разворачиваются ДО открытия записи: транзакция IndexedDB живёт
  // до первого витка событий без запросов, а скачивание файла — это await
  // на сеть, который её гарантированно закроет.
  const toWriteLocally = await Promise.all(
    merged.toWriteLocally.map(async (record) => {
      // Запись победила из облака, но локально по этому id могла быть своя
      // версия — офлайн-добавленные в неё снимки складываются, а не теряются
      // (см. unionPhotoFields).
      const unioned = await unionPhotoFields(kind, record, localById.get(record.id));
      return internalizePhotos(kind, unioned, localById.get(record.id), photos);
    }),
  );

  if (merged.toWriteLocally.length || merged.toDeleteLocally.length || merged.tombstonesToStore.length) {
    const writeTx = db.transaction([adapter.store, DELETIONS_STORE], 'readwrite');
    for (const record of toWriteLocally) adapter.put(writeTx, record, { preserveUpdatedAt: true });
    for (const id of merged.toDeleteLocally) adapter.remove(writeTx, id);
    // Время следа — из облака (когда там удалили), а не «сейчас»: устройство
    // могло быть офлайн неделю, и «сейчас» соврало бы о том, когда это
    // случилось на самом деле (см. removeClientRecordOnly и т.п.).
    for (const tombstone of merged.tombstonesToStore) {
      recordDeletion(writeTx, adapter.store, tombstone.id, () => tombstone.deletedAt);
    }
    await txDone(writeTx);
  }

  if (merged.toPushRemotely.length) {
    const rows = [];
    // Последовательно, не Promise.all: параллельная отправка всех записей
    // разом подняла бы в память столько снимков, сколько их набралось за
    // офлайн — ровно та беда, от которой уходим.
    for (const record of merged.toPushRemotely) {
      // Победила локальная версия, но в облаке по этому id уже могла лежать
      // своя — снимки, добавленные там офлайн на другом устройстве, дописываются,
      // а не затираются локальной версией целиком (см. unionPhotoFields).
      const unioned = await unionPhotoFields(kind, record, remoteById.get(record.id));
      rows.push(await externalizePhotos(kind, unioned, photos, uploaded));
    }
    await remote.upsert(rows);
  }
  if (merged.tombstonesToPush.length) {
    await remoteTombstones.upsert(
      merged.tombstonesToPush.map((t) => ({ ...t, store: adapter.store, key: tombstoneKey(adapter.store, t.id) })),
    );
    await remote.remove(merged.tombstonesToPush.map((t) => t.id));
  }

  return {
    pulled: merged.toWriteLocally.length,
    pushed: merged.toPushRemotely.length,
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
