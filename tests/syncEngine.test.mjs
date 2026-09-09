import assert from 'node:assert/strict';
import test from 'node:test';
import { indexedDB } from 'fake-indexeddb';

globalThis.indexedDB = indexedDB;

import { runFullSync } from '../.test-dist/src/sync/syncEngine.js';
import { putClient, getAllClients, deleteClientRecord } from '../.test-dist/src/storage/repos/clientsRepo.js';
import { putProject, getAllProjects } from '../.test-dist/src/storage/repos/projectsRepo.js';
import { putMasterInfoRecord, getMasterInfoRecord } from '../.test-dist/src/storage/repos/masterInfoRepo.js';
import { getAllTombstones } from '../.test-dist/src/storage/repos/tombstonesRepo.js';

let dbCounter = 0;

function openTestDb() {
  return new Promise((resolve, reject) => {
    dbCounter += 1;
    const request = indexedDB.open(`syncEngine-test-${dbCounter}-${Date.now()}`, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('clients', { keyPath: 'id' });
      db.createObjectStore('projects', { keyPath: 'id' });
      db.createObjectStore('contentEntries', { keyPath: 'id' });
      db.createObjectStore('masterInfo', { keyPath: 'id' });
      db.createObjectStore('deletions', { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Пишет одной транзакцией через переданный колбэк — так же, как это
// делают репозитории внутри компонента.
function write(db, stores, run) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, 'readwrite');
    run(tx);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

function read(db, stores, run) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, 'readonly');
    const request = run(tx);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Поддельное «облако»: те же формы данных, что и настоящие таблицы
// Supabase (id, data целиком, updatedAt), без сети.
function fakeRemote() {
  const collections = { clients: new Map(), projects: new Map(), contentEntries: new Map() };
  const tombstones = [];
  const photoFiles = new Map();
  let masterInfo = null;

  const makeCollection = (name) => ({
    async list() {
      return [...collections[name].values()];
    },
    async upsert(rows) {
      for (const row of rows) collections[name].set(row.id, row);
    },
    async remove(ids) {
      for (const id of ids) collections[name].delete(id);
    },
  });

  return {
    _collections: collections,
    _tombstones: tombstones,
    _photoFiles: photoFiles,
    photos: {
      async upload(hash, dataUrl) {
        photoFiles.set(hash, dataUrl);
      },
      async download(hash) {
        return photoFiles.get(hash) ?? null;
      },
    },
    clients: makeCollection('clients'),
    projects: makeCollection('projects'),
    contentEntries: makeCollection('contentEntries'),
    tombstones: {
      async list(store) {
        return tombstones.filter((t) => t.store === store);
      },
      async upsert(rows) {
        for (const row of rows) {
          const i = tombstones.findIndex((t) => t.store === row.store && t.id === row.id);
          if (i === -1) tombstones.push(row);
          else tombstones[i] = row;
        }
      },
    },
    masterInfo: {
      async get() {
        return masterInfo;
      },
      async put(record) {
        masterInfo = record;
      },
    },
  };
}

// ── Ради чего всё затевалось: непересекающиеся правки не теряются ────────

test('запись, добавленная локально, уезжает в облако; запись из облака приезжает сюда', async () => {
  const db = await openTestDb();
  await write(db, ['clients', 'deletions'], (tx) => putClient(tx, { id: 'local-1', name: 'Локальный' }));

  const remote = fakeRemote();
  await remote.clients.upsert([{ id: 'remote-1', name: 'Облачный', updatedAt: '2020-01-01T00:00:00.000Z' }]);

  await runFullSync(db, remote);

  const local = await read(db, ['clients'], (tx) => getAllClients(tx));
  assert.deepEqual(local.map((c) => c.id).sort(), ['local-1', 'remote-1']);
  assert.ok(remote._collections.clients.has('local-1'), 'локальная запись должна уехать в облако');
});

test('повторная синхронизация без изменений ничего не пересылает', async () => {
  const db = await openTestDb();
  await write(db, ['clients', 'deletions'], (tx) => putClient(tx, { id: 'c1', name: 'Аня' }));

  const remote = fakeRemote();
  await runFullSync(db, remote);
  const afterFirst = remote._collections.clients.get('c1').updatedAt;

  const summary = await runFullSync(db, remote);
  assert.equal(summary.clients.pushed, 0);
  assert.equal(summary.clients.pulled, 0);
  assert.equal(remote._collections.clients.get('c1').updatedAt, afterFirst);
});

// ── Удаления ───────────────────────────────────────────────────────────

test('удаление на этом устройстве доезжает до облака и снова не воскресает', async () => {
  const db = await openTestDb();
  await write(db, ['clients', 'deletions'], (tx) => putClient(tx, { id: 'c1' }));
  await write(db, ['clients', 'deletions'], (tx) => deleteClientRecord(tx, 'c1'));

  const remote = fakeRemote();
  // В облаке до этого лежала старая (уже удалённая) версия — как будто её
  // туда положило другое устройство до того, как узнало об удалении.
  await remote.clients.upsert([{ id: 'c1', updatedAt: '2020-01-01T00:00:00.000Z' }]);

  await runFullSync(db, remote);
  assert.ok(!remote._collections.clients.has('c1'), 'облако должно узнать об удалении');

  // Второй запуск — ничего не должно вернуться обратно.
  await runFullSync(db, remote);
  const local = await read(db, ['clients'], (tx) => getAllClients(tx));
  assert.deepEqual(local, []);
});

test('удаление в облаке применяется здесь, а время следа берётся из облака, не «сейчас»', async () => {
  const db = await openTestDb();
  await write(db, ['clients', 'deletions'], (tx) =>
    putClient(tx, { id: 'c1', updatedAt: '2020-01-01T00:00:00.000Z' }, { preserveUpdatedAt: true }),
  );

  const remote = fakeRemote();
  await remote.tombstones.upsert([
    { store: 'clients', id: 'c1', deletedAt: '2020-06-01T00:00:00.000Z', key: 'clients:c1' },
  ]);

  await runFullSync(db, remote);

  const local = await read(db, ['clients'], (tx) => getAllClients(tx));
  assert.deepEqual(local, []);

  const localTombstones = await read(db, ['deletions'], (tx) => getAllTombstones(tx));
  assert.equal(localTombstones.length, 1);
  assert.equal(localTombstones[0].deletedAt, '2020-06-01T00:00:00.000Z', 'время следа должно быть из облака');
});

// ── Личный кабинет: latest-wins по одной записи ──────────────────────────

test('карточка мастера тянется из облака, если там свежее', async () => {
  const db = await openTestDb();
  await write(db, ['masterInfo'], (tx) => putMasterInfoRecord(tx, { phone: 'старый' }, { now: () => '2020-01-01T00:00:00.000Z' }));

  const remote = fakeRemote();
  await remote.masterInfo.put({ id: 'master', phone: 'новый из облака', updatedAt: '2025-01-01T00:00:00.000Z' });

  const summary = await runFullSync(db, remote);
  assert.equal(summary.masterInfo, 'pulled');

  const local = await read(db, ['masterInfo'], (tx) => getMasterInfoRecord(tx));
  assert.equal(local.phone, 'новый из облака');
});

test('карточка мастера уезжает в облако, если здесь свежее', async () => {
  const db = await openTestDb();
  await write(db, ['masterInfo'], (tx) => putMasterInfoRecord(tx, { phone: 'свежий локальный' }));

  const remote = fakeRemote();
  await remote.masterInfo.put({ id: 'master', phone: 'старый облачный', updatedAt: '2020-01-01T00:00:00.000Z' });

  const summary = await runFullSync(db, remote);
  assert.equal(summary.masterInfo, 'pushed');
  const remoteAfter = await remote.masterInfo.get();
  assert.equal(remoteAfter.phone, 'свежий локальный');
});

// ── Несколько сторов за один прогон ──────────────────────────────────────

test('один прогон синхронизирует клиентов, проекты и контент одновременно', async () => {
  const db = await openTestDb();
  await write(db, ['clients', 'deletions'], (tx) => putClient(tx, { id: 'c1' }));
  await write(db, ['projects', 'deletions'], (tx) => putProject(tx, { id: 'p1' }));

  const remote = fakeRemote();
  const summary = await runFullSync(db, remote);

  assert.equal(summary.clients.pushed, 1);
  assert.equal(summary.projects.pushed, 1);
  assert.equal(summary.contentEntries.pushed, 0);
});


// ── Фото едут отдельно от записи ─────────────────────────────────────────

test('снимок уезжает файлом в Storage, а в облачной строке остаётся ссылка', async () => {
  // Ради этого шаг 6 и делался: base64 внутри записи уложил бы всю
  // фотобиблиотеку в Postgres jsonb, где для неё нет ни места, ни смысла.
  const db = await openTestDb();
  const shot = `data:image/jpeg;base64,${'A'.repeat(2000)}`;
  await write(db, ['projects', 'deletions'], (tx) => putProject(tx, { id: 'p1', title: 'Дракон', photos: [shot] }));

  const remote = fakeRemote();
  await runFullSync(db, remote);

  const row = remote._collections.projects.get('p1');
  assert.equal(row.title, 'Дракон');
  assert.match(row.photos[0], /^photo:[0-9a-f]{64}$/);
  // Сам снимок — в Storage, ровно один файл.
  assert.equal(remote._photoFiles.size, 1);
  assert.equal([...remote._photoFiles.values()][0], shot);
});

test('приехавшая из облака ссылка разворачивается в снимок прямо в базе', async () => {
  const db = await openTestDb();
  const shot = `data:image/jpeg;base64,${'B'.repeat(2000)}`;

  // Другое устройство уже отправило свой проект: сначала соберём облако его руками.
  const donor = await openTestDb();
  await write(donor, ['projects', 'deletions'], (tx) => putProject(tx, { id: 'p9', title: 'Пионы', photos: [shot] }));
  const remote = fakeRemote();
  await runFullSync(donor, remote);

  await runFullSync(db, remote);

  const stored = await read(db, 'projects', (tx) => getAllProjects(tx));
  const project = stored.find((p) => p.id === 'p9');
  assert.equal(project.title, 'Пионы');
  // В локальной базе снимок лежит как всегда — base64 внутри записи.
  // Ни один экран дневника не знает, что он куда-то ездил.
  assert.equal(project.photos[0], shot);
});
