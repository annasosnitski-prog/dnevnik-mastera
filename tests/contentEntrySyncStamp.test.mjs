import assert from 'node:assert/strict';
import test from 'node:test';
import { indexedDB } from 'fake-indexeddb';

globalThis.indexedDB = indexedDB;

import { applyCompletedContentIngestJob } from '../.test-dist/src/lib/contentJobQueue.js';

let dbCounter = 0;

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(`content-sync-stamp-${++dbCounter}-${Date.now()}`, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('contentEntries', { keyPath: 'id' });
      request.result.createObjectStore('contentIngestJobs', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function readEntry(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('contentEntries', 'readonly');
    const request = tx.objectStore('contentEntries').get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function putRawEntry(db, entry) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('contentEntries', 'readwrite');
    tx.objectStore('contentEntries').put(entry);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

const result = {
  media: [],
  visual_archetype: null,
  text_triad: null,
  text_draft: 'Готовый текст',
};

const createJob = {
  id: 'create:entry-1',
  jobId: 'job-1',
  operation: 'create',
  state: 'running',
  createdAt: '2026-09-08T00:00:00.000Z',
  updatedAt: '2026-09-08T00:00:00.000Z',
  request: {
    sessionId: 'freeform-1',
    sourceType: 'freeform',
    session: { client: '', zone: '', style: '', description: 'note' },
    mediaIds: [],
  },
  entry: {
    id: 'entry-1',
    createdDate: '2026-09-08T00:00:00.000Z',
    clientId: null,
    sourceType: 'freeform',
    sourceId: null,
    format: null,
    text: 'note',
    context: { client: '', zone: '', style: '', description: 'note' },
    textArchetype: null,
    photos: [],
    photoIds: [],
  },
};

test('готовый новый черновик ContentINKA получает updatedAt для device sync', async () => {
  const db = await openDb();
  await applyCompletedContentIngestJob(db, createJob, result);
  const stored = await readEntry(db, 'entry-1');

  assert.equal(stored.textDraft, 'Готовый текст');
  assert.equal(typeof stored.updatedAt, 'string');
  assert.ok(stored.updatedAt.length > 0);
});

test('перегенерация текста двигает updatedAt, чтобы новое ушло на другое устройство', async () => {
  const db = await openDb();
  const oldAt = '2020-01-01T00:00:00.000Z';
  await putRawEntry(db, {
    id: 'entry-2',
    status: 'draft',
    textDraft: 'Старый текст',
    updatedAt: oldAt,
  });

  const refreshJob = {
    ...createJob,
    id: 'refresh:entry-2',
    jobId: 'job-2',
    operation: 'refresh',
    entryId: 'entry-2',
    baseTextDraft: 'Старый текст',
    requestedArchetype: null,
  };

  await applyCompletedContentIngestJob(db, refreshJob, { ...result, text_draft: 'Новый текст' });
  const stored = await readEntry(db, 'entry-2');

  assert.equal(stored.textDraft, 'Новый текст');
  assert.ok(stored.updatedAt > oldAt, 'refresh должен считаться новой правкой для mergeRecords');
});
