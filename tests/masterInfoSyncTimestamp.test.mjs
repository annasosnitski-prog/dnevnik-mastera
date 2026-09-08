import assert from 'node:assert/strict';
import test from 'node:test';
import { indexedDB } from 'fake-indexeddb';

globalThis.indexedDB = indexedDB;

import { getMasterInfoRecord, putMasterInfoRecord } from '../.test-dist/src/storage/repos/masterInfoRepo.js';

let dbCounter = 0;

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(`master-sync-time-${++dbCounter}-${Date.now()}`, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('masterInfo', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function write(db, value, options) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('masterInfo', 'readwrite');
    putMasterInfoRecord(tx, value, options);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function read(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('masterInfo', 'readonly');
    const request = getMasterInfoRecord(tx);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

test('повторная запись того же кабинета сохраняет прежний updatedAt', async () => {
  const db = await openDb();
  const first = '2026-01-01T10:00:00.000Z';
  const later = '2026-09-08T23:00:00.000Z';

  await write(db, { name: 'Аня', bankDetails: 'реквизиты' }, { now: () => first });
  await write(db, { name: 'Аня', bankDetails: 'реквизиты' }, { now: () => later });

  assert.equal((await read(db)).updatedAt, first);
});

test('настоящая правка кабинета получает новый updatedAt', async () => {
  const db = await openDb();
  const first = '2026-01-01T10:00:00.000Z';
  const later = '2026-09-08T23:00:00.000Z';

  await write(db, { name: 'Аня', bankDetails: 'старые' }, { now: () => first });
  await write(db, { name: 'Аня', bankDetails: 'новые' }, { now: () => later });

  const stored = await read(db);
  assert.equal(stored.updatedAt, later);
  assert.equal(stored.bankDetails, 'новые');
});
