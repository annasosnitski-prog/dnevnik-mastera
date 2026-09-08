import assert from 'node:assert/strict';
import test from 'node:test';
import { indexedDB } from 'fake-indexeddb';

globalThis.indexedDB = indexedDB;

import { getAllContentEntries, putContentEntry, clearContentEntries } from '../.test-dist/src/storage/repos/contentRepo.js';

let dbCounter = 0;

function openTestDb() {
  return new Promise((resolve, reject) => {
    dbCounter += 1;
    const request = indexedDB.open(`contentRepo-test-${dbCounter}-${Date.now()}`, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('contentEntries', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function tx(db, mode = 'readwrite') {
  return db.transaction('contentEntries', mode);
}

test('putContentEntry сохраняет запись, доступную следующим чтением', async () => {
  const db = await openTestDb();
  await new Promise((resolve, reject) => {
    const t = tx(db);
    putContentEntry(t, { id: 'e1', textDraft: 'Черновик' });
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
  });
  const readTx = tx(db, 'readonly');
  const all = await new Promise((resolve, reject) => {
    const request = getAllContentEntries(readTx);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  // updatedAt проставляет сам репозиторий (Шаг 1 синка) — сверяем поля записи.
  assert.equal(all.length, 1);
  assert.equal(all[0].id, 'e1');
  assert.equal(all[0].textDraft, 'Черновик');
});

test('повторный putContentEntry с тем же id заменяет запись (апсерт)', async () => {
  const db = await openTestDb();
  const write = (record) =>
    new Promise((resolve, reject) => {
      const t = tx(db);
      putContentEntry(t, record);
      t.oncomplete = resolve;
      t.onerror = () => reject(t.error);
    });
  await write({ id: 'e1', textDraft: 'Черновик' });
  await write({ id: 'e1', textDraft: 'Перегенерированный текст' });

  const readTx = tx(db, 'readonly');
  const all = await new Promise((resolve, reject) => {
    const request = getAllContentEntries(readTx);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  assert.equal(all.length, 1);
  assert.equal(all[0].textDraft, 'Перегенерированный текст');
});

test('getAllContentEntries на пустом сторе отдаёт пустой массив', async () => {
  const db = await openTestDb();
  const readTx = tx(db, 'readonly');
  const all = await new Promise((resolve, reject) => {
    const request = getAllContentEntries(readTx);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  assert.deepEqual(all, []);
});

test('clearContentEntries опустошает стор целиком', async () => {
  const db = await openTestDb();
  await new Promise((resolve, reject) => {
    const t = tx(db);
    putContentEntry(t, { id: 'e1' });
    putContentEntry(t, { id: 'e2' });
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
  });
  await new Promise((resolve, reject) => {
    const t = tx(db);
    clearContentEntries(t);
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
  });
  const readTx = tx(db, 'readonly');
  const all = await new Promise((resolve, reject) => {
    const request = getAllContentEntries(readTx);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  assert.deepEqual(all, []);
});
