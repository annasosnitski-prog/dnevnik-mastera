import assert from 'node:assert/strict';
import test from 'node:test';
import { indexedDB } from 'fake-indexeddb';

globalThis.indexedDB = indexedDB;

import { getAllProjects, putProject, deleteProjectRecord, clearProjects } from '../.test-dist/src/storage/repos/projectsRepo.js';

let dbCounter = 0;

function openTestDb() {
  return new Promise((resolve, reject) => {
    dbCounter += 1;
    const request = indexedDB.open(`projectsRepo-test-${dbCounter}-${Date.now()}`, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('projects', { keyPath: 'id' });
      // delete* пишет след удаления в ту же транзакцию (Шаг 2 синка).
      request.result.createObjectStore('deletions', { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function tx(db, mode = 'readwrite') {
  return db.transaction(['projects', 'deletions'], mode);
}

test('putProject сохраняет запись, доступную следующим чтением', async () => {
  const db = await openTestDb();
  await new Promise((resolve, reject) => {
    const t = tx(db);
    putProject(t, { id: 'c1', name: 'Проект А' });
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
  });
  const readTx = tx(db, 'readonly');
  const all = await new Promise((resolve, reject) => {
    const request = getAllProjects(readTx);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  // updatedAt проставляет сам репозиторий (Шаг 1 синка) — сверяем поля записи.
  assert.equal(all.length, 1);
  assert.equal(all[0].id, 'c1');
  assert.equal(all[0].name, 'Проект А');
});

test('повторный putProject с тем же id заменяет запись (апсерт)', async () => {
  const db = await openTestDb();
  const write = (record) =>
    new Promise((resolve, reject) => {
      const t = tx(db);
      putProject(t, record);
      t.oncomplete = resolve;
      t.onerror = () => reject(t.error);
    });
  await write({ id: 'c1', name: 'Проект А' });
  await write({ id: 'c1', name: 'Проект А (правка)' });

  const readTx = tx(db, 'readonly');
  const all = await new Promise((resolve, reject) => {
    const request = getAllProjects(readTx);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  assert.equal(all.length, 1);
  assert.equal(all[0].name, 'Проект А (правка)');
});

test('deleteProjectRecord убирает запись по id, не трогая остальные', async () => {
  const db = await openTestDb();
  const write = (record) =>
    new Promise((resolve, reject) => {
      const t = tx(db);
      putProject(t, record);
      t.oncomplete = resolve;
      t.onerror = () => reject(t.error);
    });
  await write({ id: 'c1', name: 'Проект А' });
  await write({ id: 'c2', name: 'Проект Б' });

  await new Promise((resolve, reject) => {
    const t = tx(db);
    deleteProjectRecord(t, 'c1');
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
  });

  const readTx = tx(db, 'readonly');
  const all = await new Promise((resolve, reject) => {
    const request = getAllProjects(readTx);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  assert.deepEqual(all.map((c) => c.id), ['c2']);
});

test('getAllProjects на пустом сторе отдаёт пустой массив, не null/undefined', async () => {
  const db = await openTestDb();
  const readTx = tx(db, 'readonly');
  const all = await new Promise((resolve, reject) => {
    const request = getAllProjects(readTx);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  assert.deepEqual(all, []);
});

test('clearProjects опустошает стор целиком', async () => {
  const db = await openTestDb();
  await new Promise((resolve, reject) => {
    const t = tx(db);
    putProject(t, { id: 'p1' });
    putProject(t, { id: 'p2' });
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
  });
  await new Promise((resolve, reject) => {
    const t = tx(db);
    clearProjects(t);
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
  });
  const readTx = tx(db, 'readonly');
  const all = await new Promise((resolve, reject) => {
    const request = getAllProjects(readTx);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  assert.deepEqual(all, []);
});
