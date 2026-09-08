import assert from 'node:assert/strict';
import test from 'node:test';
import { indexedDB } from 'fake-indexeddb';

globalThis.indexedDB = indexedDB;

import { getMasterInfoRecord, putMasterInfoRecord } from '../.test-dist/src/storage/repos/masterInfoRepo.js';
import { MASTER_INFO_STORE, MASTER_INFO_RECORD_ID } from '../.test-dist/src/lib/masterInfoStore.js';

let dbCounter = 0;

function openTestDb() {
  return new Promise((resolve, reject) => {
    dbCounter += 1;
    const request = indexedDB.open(`masterInfoRepo-test-${dbCounter}-${Date.now()}`, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(MASTER_INFO_STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function tx(db, mode = 'readwrite') {
  return db.transaction(MASTER_INFO_STORE, mode);
}

test('putMasterInfoRecord всегда пишет под фиксированным id, независимо от переданного', async () => {
  const db = await openTestDb();
  await new Promise((resolve, reject) => {
    const t = tx(db);
    putMasterInfoRecord(t, { phone: '+7...', id: 'что-то другое' });
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
  });
  const readTx = tx(db, 'readonly');
  const record = await new Promise((resolve, reject) => {
    const request = getMasterInfoRecord(readTx);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  assert.equal(record.id, MASTER_INFO_RECORD_ID);
  assert.equal(record.phone, '+7...');
});

test('повторный putMasterInfoRecord заменяет единственную запись, а не добавляет вторую', async () => {
  const db = await openTestDb();
  const write = (value) =>
    new Promise((resolve, reject) => {
      const t = tx(db);
      putMasterInfoRecord(t, value);
      t.oncomplete = resolve;
      t.onerror = () => reject(t.error);
    });
  await write({ phone: '111' });
  await write({ phone: '222' });

  const readTx = tx(db, 'readonly');
  const all = await new Promise((resolve, reject) => {
    const request = readTx.objectStore(MASTER_INFO_STORE).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  assert.equal(all.length, 1);
  assert.equal(all[0].phone, '222');
});

test('getMasterInfoRecord на пустом сторе отдаёт undefined, не бросает', async () => {
  const db = await openTestDb();
  const readTx = tx(db, 'readonly');
  const record = await new Promise((resolve, reject) => {
    const request = getMasterInfoRecord(readTx);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  assert.equal(record, undefined);
});
