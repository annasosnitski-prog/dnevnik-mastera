import assert from 'node:assert/strict';
import test from 'node:test';
import { indexedDB } from 'fake-indexeddb';

globalThis.indexedDB = indexedDB;

import { getAllClients, putClient, deleteClientRecord, clearClients } from '../.test-dist/src/storage/repos/clientsRepo.js';

let dbCounter = 0;

function openTestDb() {
  return new Promise((resolve, reject) => {
    dbCounter += 1;
    const request = indexedDB.open(`clientsRepo-test-${dbCounter}-${Date.now()}`, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('clients', { keyPath: 'id' });
      // delete* пишет след удаления в ту же транзакцию (Шаг 2 синка).
      request.result.createObjectStore('deletions', { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function tx(db, mode = 'readwrite') {
  return db.transaction(['clients', 'deletions'], mode);
}

test('putClient сохраняет запись, доступную следующим чтением', async () => {
  const db = await openTestDb();
  await new Promise((resolve, reject) => {
    const t = tx(db);
    putClient(t, { id: 'c1', name: 'Аня' });
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
  });
  const readTx = tx(db, 'readonly');
  const all = await new Promise((resolve, reject) => {
    const request = getAllClients(readTx);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  // updatedAt проставляет сам репозиторий (Шаг 1 синка) — сверяем поля записи.
  assert.equal(all.length, 1);
  assert.equal(all[0].id, 'c1');
  assert.equal(all[0].name, 'Аня');
});

test('повторный putClient с тем же id заменяет запись (апсерт)', async () => {
  const db = await openTestDb();
  const write = (record) =>
    new Promise((resolve, reject) => {
      const t = tx(db);
      putClient(t, record);
      t.oncomplete = resolve;
      t.onerror = () => reject(t.error);
    });
  await write({ id: 'c1', name: 'Аня' });
  await write({ id: 'c1', name: 'Аня (правка)' });

  const readTx = tx(db, 'readonly');
  const all = await new Promise((resolve, reject) => {
    const request = getAllClients(readTx);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  assert.equal(all.length, 1);
  assert.equal(all[0].name, 'Аня (правка)');
});

test('deleteClientRecord убирает запись по id, не трогая остальные', async () => {
  const db = await openTestDb();
  const write = (record) =>
    new Promise((resolve, reject) => {
      const t = tx(db);
      putClient(t, record);
      t.oncomplete = resolve;
      t.onerror = () => reject(t.error);
    });
  await write({ id: 'c1', name: 'Аня' });
  await write({ id: 'c2', name: 'Борис' });

  await new Promise((resolve, reject) => {
    const t = tx(db);
    deleteClientRecord(t, 'c1');
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
  });

  const readTx = tx(db, 'readonly');
  const all = await new Promise((resolve, reject) => {
    const request = getAllClients(readTx);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  assert.deepEqual(all.map((c) => c.id), ['c2']);
});

test('getAllClients на пустом сторе отдаёт пустой массив, не null/undefined', async () => {
  const db = await openTestDb();
  const readTx = tx(db, 'readonly');
  const all = await new Promise((resolve, reject) => {
    const request = getAllClients(readTx);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  assert.deepEqual(all, []);
});

test('clearClients опустошает стор целиком', async () => {
  const db = await openTestDb();
  await new Promise((resolve, reject) => {
    const t = tx(db);
    putClient(t, { id: 'c1' });
    putClient(t, { id: 'c2' });
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
  });
  await new Promise((resolve, reject) => {
    const t = tx(db);
    clearClients(t);
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
  });
  const readTx = tx(db, 'readonly');
  const all = await new Promise((resolve, reject) => {
    const request = getAllClients(readTx);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  assert.deepEqual(all, []);
});

test('putClient проставляет время правки — без него слияние устройств сравнивать нечем', async () => {
  const db = await openTestDb();
  await new Promise((resolve, reject) => {
    const t = tx(db);
    putClient(t, { id: 'c1', name: 'Аня' });
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
  });
  const readTx = tx(db, 'readonly');
  const all = await new Promise((resolve, reject) => {
    const request = getAllClients(readTx);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  assert.ok(all[0].updatedAt, 'у записи нет updatedAt');
  assert.ok(!Number.isNaN(Date.parse(all[0].updatedAt)));
});

test('putClient с preserveUpdatedAt не перебивает время из копии', async () => {
  const db = await openTestDb();
  await new Promise((resolve, reject) => {
    const t = tx(db);
    putClient(t, { id: 'c1', updatedAt: '2025-05-05T10:00:00.000Z' }, { preserveUpdatedAt: true });
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
  });
  const readTx = tx(db, 'readonly');
  const all = await new Promise((resolve, reject) => {
    const request = getAllClients(readTx);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  assert.equal(all[0].updatedAt, '2025-05-05T10:00:00.000Z');
});
