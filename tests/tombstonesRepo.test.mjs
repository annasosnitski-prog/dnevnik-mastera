import assert from 'node:assert/strict';
import test from 'node:test';
import { indexedDB } from 'fake-indexeddb';

globalThis.indexedDB = indexedDB;

import {
  DELETIONS_STORE,
  recordDeletion,
  getAllTombstones,
  forgetDeletion,
  tombstoneKey,
} from '../.test-dist/src/storage/repos/tombstonesRepo.js';
import { deleteClientRecord, putClient, getAllClients } from '../.test-dist/src/storage/repos/clientsRepo.js';

let dbCounter = 0;

function openTestDb() {
  return new Promise((resolve, reject) => {
    dbCounter += 1;
    const request = indexedDB.open(`tombstones-test-${dbCounter}-${Date.now()}`, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('clients', { keyPath: 'id' });
      request.result.createObjectStore(DELETIONS_STORE, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

const done = (tx) => new Promise((resolve, reject) => {
  tx.oncomplete = resolve;
  tx.onerror = () => reject(tx.error);
});

const read = (db, run) => new Promise((resolve, reject) => {
  const request = run(db.transaction([ 'clients', DELETIONS_STORE ], 'readonly'));
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

test('ключ следа — «стор:id», поэтому повторное удаление не копит вторую отметку', async () => {
  const db = await openTestDb();
  assert.equal(tombstoneKey('clients', 'c1'), 'clients:c1');

  let tx = db.transaction(DELETIONS_STORE, 'readwrite');
  recordDeletion(tx, 'clients', 'c1', () => '2026-01-01T00:00:00.000Z');
  await done(tx);

  tx = db.transaction(DELETIONS_STORE, 'readwrite');
  recordDeletion(tx, 'clients', 'c1', () => '2026-02-02T00:00:00.000Z');
  await done(tx);

  const all = await read(db, (t) => getAllTombstones(t));
  assert.equal(all.length, 1);
  assert.equal(all[0].deletedAt, '2026-02-02T00:00:00.000Z');
});

test('удаление клиента стирает запись И оставляет след — одной транзакцией', async () => {
  const db = await openTestDb();
  let tx = db.transaction([ 'clients', DELETIONS_STORE ], 'readwrite');
  putClient(tx, { id: 'c1', name: 'Аня' });
  await done(tx);

  tx = db.transaction([ 'clients', DELETIONS_STORE ], 'readwrite');
  deleteClientRecord(tx, 'c1');
  await done(tx);

  // Запись именно СТЁРТА (её фото освободились), а не помечена.
  const clients = await read(db, (t) => getAllClients(t));
  assert.deepEqual(clients, []);

  // Но след остался — иначе синк вернул бы клиента с другого устройства.
  const tombstones = await read(db, (t) => getAllTombstones(t));
  assert.equal(tombstones.length, 1);
  assert.equal(tombstones[0].store, 'clients');
  assert.equal(tombstones[0].id, 'c1');
  assert.ok(!Number.isNaN(Date.parse(tombstones[0].deletedAt)));
});

test('восстановление записи снимает след — иначе синк удалит её снова', async () => {
  const db = await openTestDb();
  let tx = db.transaction([ 'clients', DELETIONS_STORE ], 'readwrite');
  putClient(tx, { id: 'c1' });
  await done(tx);

  tx = db.transaction([ 'clients', DELETIONS_STORE ], 'readwrite');
  deleteClientRecord(tx, 'c1');
  await done(tx);

  tx = db.transaction([ 'clients', DELETIONS_STORE ], 'readwrite');
  putClient(tx, { id: 'c1' }, { preserveUpdatedAt: true });
  forgetDeletion(tx, 'clients', 'c1');
  await done(tx);

  assert.deepEqual(await read(db, (t) => getAllTombstones(t)), []);
  assert.equal((await read(db, (t) => getAllClients(t))).length, 1);
});

test('следы разных сторов не путаются между собой', async () => {
  const db = await openTestDb();
  const tx = db.transaction(DELETIONS_STORE, 'readwrite');
  recordDeletion(tx, 'clients', 'x1');
  recordDeletion(tx, 'projects', 'x1');
  recordDeletion(tx, 'contentEntries', 'x1');
  await done(tx);

  const all = await read(db, (t) => getAllTombstones(t));
  assert.equal(all.length, 3);
  assert.deepEqual(all.map((t) => t.store).sort(), ['clients', 'contentEntries', 'projects']);
});
