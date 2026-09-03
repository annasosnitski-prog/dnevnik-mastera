import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  canApplyRefreshResult,
  createCompletedContentEntry,
  CONTENT_INGEST_JOB_STORE,
  ContentJobDbUnavailableError,
  TATTO_DIARY_DB_VERSION,
  loadContentIngestJobs,
  putContentIngestJob,
  startContentIngestJobCoordinator,
  wakeContentIngestJobCoordinator,
} from '../.test-dist/src/lib/contentJobQueue.js';
import { ContentSyncError, createContentIngestJob, getContentIngestJob } from '../.test-dist/src/lib/contentSync.js';

const diary = readFileSync(new URL('../src/components/TattoDiary.tsx', import.meta.url), 'utf8');
const sync = readFileSync(new URL('../src/lib/contentSync.ts', import.meta.url), 'utf8');

const createRecord = {
  id: 'create:entry-1',
  jobId: 'job-1',
  operation: 'create',
  state: 'running',
  createdAt: '2026-07-29T00:00:00.000Z',
  updatedAt: '2026-07-29T00:00:00.000Z',
  request: {
    sessionId: 'freeform-1',
    sourceType: 'freeform',
    session: { client: '', zone: '', style: '', description: 'note' },
    mediaIds: ['photo-1'],
  },
  entry: {
    id: 'entry-1',
    createdDate: '2026-07-29T00:00:00.000Z',
    clientId: null,
    sourceType: 'freeform',
    sourceId: null,
    format: null,
    text: 'note',
    context: { client: '', zone: '', style: '', description: 'note' },
    textArchetype: null,
    photos: ['data:image/jpeg;base64,original'],
    photoIds: ['photo-1'],
  },
};

const result = {
  media: [{ id: 'photo-1', technical_status: 'kept' }],
  visual_archetype: 'Творец',
  text_triad: { opens: 'Трикстер', leads: 'Исследователь', closes: 'Женщина/Тепло' },
  text_draft: 'Готовый текст',
};

// Версия 4: добавился стор masterInfo — Личный кабинет переехал из
// localStorage, где ему не хватало квоты под фото в задачах.
test('database version 4 and technical content job store are wired', () => {
  assert.equal(TATTO_DIARY_DB_VERSION, 4);
  assert.equal(CONTENT_INGEST_JOB_STORE, 'contentIngestJobs');
  assert.match(diary, /indexedDB\.open\('TattoDiaryDB', TATTO_DIARY_DB_VERSION\)/);
  assert.match(diary, /ensureContentIngestJobStore\(db\)/);
});

test('completed create uses the preallocated entry id and keeps original photos', () => {
  const entry = createCompletedContentEntry(createRecord, result);
  assert.equal(entry.id, 'entry-1');
  assert.deepEqual(entry.photos, createRecord.entry.photos);
  assert.equal(entry.textDraft, 'Готовый текст');
  assert.equal(entry.status, 'draft');
});

test('refresh result is guarded by draft status and exact base text', () => {
  const record = {
    ...createRecord,
    operation: 'refresh',
    entryId: 'entry-1',
    baseTextDraft: 'Старая версия',
    requestedArchetype: null,
  };
  assert.equal(canApplyRefreshResult(record, { status: 'draft', textDraft: 'Старая версия' }), true);
  assert.equal(canApplyRefreshResult(record, { status: 'confirmed', textDraft: 'Старая версия' }), false);
  assert.equal(canApplyRefreshResult(record, { status: 'draft', textDraft: 'Изменено вручную' }), false);
  assert.equal(canApplyRefreshResult(record, null), false);
});

test('durable flow splits create and one-shot status GET while retaining sendToContent wrapper', () => {
  assert.match(sync, /export async function createContentIngestJob/);
  assert.match(sync, /export async function getContentIngestJob/);
  assert.match(sync, /export async function sendToContent/);
  assert.doesNotMatch(sync, /\/api\/ingest(?:['\"`])/);
});

test('root coordinator is mounted outside the conditional ContentINKA screen', () => {
  const coordinator = diary.indexOf('startContentIngestJobCoordinator({');
  const contentScreen = diary.indexOf("{screen === 'content' && masterInfo.modules.content && (");
  assert.ok(coordinator > 0 && contentScreen > 0 && coordinator < contentScreen);
});

test('create and refresh jobs are persisted instead of waiting for the long sendToContent promise', () => {
  const screen = readFileSync(new URL('../src/components/screens/ContentINKAScreen.tsx', import.meta.url), 'utf8');
  const generate = screen.slice(screen.indexOf('const handleGenerate = async'), screen.indexOf('const regenerate = async'));
  const regenerate = screen.slice(screen.indexOf('const regenerate = async'), screen.indexOf('const copyContentDraft = async'));
  assert.match(generate, /createContentIngestJob\(/);
  assert.match(generate, /await onSaveContentIngestJob\(/);
  assert.doesNotMatch(generate, /await sendToContent\(/);
  assert.match(regenerate, /createContentIngestJob\(/);
  assert.match(regenerate, /await onSaveContentIngestJob\(/);
  assert.doesNotMatch(regenerate, /refreshRunner\.run/);
});

test('full import clears technical jobs but backup props do not expose them', () => {
  const replace = diary.slice(diary.indexOf('const replaceAllData ='), diary.indexOf('const importClients ='));
  assert.match(replace, /CONTENT_INGEST_JOB_STORE/);
  assert.match(replace, /\.clear\(\)/);
  const adminUsage = diary.slice(diary.indexOf('<AdminDashboardScreen'), diary.indexOf('/>', diary.indexOf('<AdminDashboardScreen')) + 2);
  assert.doesNotMatch(adminUsage, /contentIngestJobs/);
});

test('deleting an entry also removes its queued refresh jobs', () => {
  assert.match(diary, /deleteContentEntryAndRefreshJobs\(database, id\)/);
});

test('hidden documents pause polling and visible, focus, online wake it', () => {
  const queue = readFileSync(new URL('../src/lib/contentJobQueue.ts', import.meta.url), 'utf8');
  assert.match(queue, /visibilityState === 'hidden'/);
  assert.match(queue, /addEventListener\('visibilitychange'/);
  assert.match(queue, /addEventListener\('focus'/);
  assert.match(queue, /addEventListener\('online'/);
});

test('idle content coordinator schedules no timer and wakes on demand', async () => {
  const listeners = new Map();
  const documentRef = {
    visibilityState: 'visible',
    addEventListener(name, listener) { listeners.set(`document:${name}`, listener); },
    removeEventListener(name) { listeners.delete(`document:${name}`); },
  };
  const windowRef = {
    addEventListener(name, listener) { listeners.set(`window:${name}`, listener); },
    removeEventListener(name) { listeners.delete(`window:${name}`); },
  };
  const db = {};
  let loads = 0;
  let timers = 0;
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  const stop = startContentIngestJobCoordinator({
    db,
    onChanged() {},
    documentRef,
    windowRef,
    loadJobs: async () => {
      loads += 1;
      return [];
    },
    setTimer: () => {
      timers += 1;
      return 1;
    },
    clearTimer() {},
  });

  await flush();
  assert.equal(loads, 1);
  assert.equal(timers, 0);

  wakeContentIngestJobCoordinator(db);
  await flush();
  assert.equal(loads, 2);
  assert.equal(timers, 0);

  listeners.get('window:focus')();
  await flush();
  assert.equal(loads, 3);
  listeners.get('window:online')();
  await flush();
  assert.equal(loads, 4);

  documentRef.visibilityState = 'hidden';
  listeners.get('document:visibilitychange')();
  documentRef.visibilityState = 'visible';
  listeners.get('document:visibilitychange')();
  await flush();
  assert.equal(loads, 5);
  assert.equal(timers, 0);

  stop();
  wakeContentIngestJobCoordinator(db);
  await flush();
  assert.equal(loads, 5);
});


test('a closed IndexedDB connection surfaces as ContentJobDbUnavailableError, not a raw exception', async () => {
  const closedDb = {
    transaction() {
      throw new Error('The database connection is closing.');
    },
  };
  await assert.rejects(loadContentIngestJobs(closedDb), (error) => error instanceof ContentJobDbUnavailableError);
  await assert.rejects(putContentIngestJob(closedDb, createRecord), (error) => error instanceof ContentJobDbUnavailableError);
});

test('the db-unavailable banner is mounted once at the shell root, not inside the list screen panel', () => {
  const listScreenIndex = diary.indexOf("{/* ═══════════ LIST SCREEN ═══════════ */}");
  const shellRoot = diary.slice(diary.indexOf('className="app-shell"'), listScreenIndex);
  assert.match(shellRoot, /\{dbError && \(/);
  assert.match(shellRoot, /Повторить/);
  // Exactly one banner in the whole component — no leftover duplicate inside
  // any per-screen panel (list, content, etc.) from before it was hoisted out.
  assert.equal(diary.split('{dbError && (').length - 1, 1);
});

test('provider response bodies and backend failure details never reach the UI error', async () => {
  const settings = { enabled: true, endpoint: 'https://postinka.example', secret: 'secret' };
  await assert.rejects(
    createContentIngestJob(
      {
        sessionId: 'session-1',
        sourceType: 'freeform',
        session: { client: '', zone: '', style: '', description: 'note' },
        media: [],
      },
      { readSettings: () => settings, fetch: async () => ({ status: 500, text: async () => 'provider content-secret' }) },
    ),
    (error) => error instanceof ContentSyncError && error.message === 'ContentINKA ответила ошибкой (500).' && !error.message.includes('content-secret'),
  );
  const failed = await getContentIngestJob('job-1', {
    readSettings: () => settings,
    fetch: async () => ({ status: 200, ok: true, json: async () => ({ job_id: 'job-1', status: 'failed', error: 'provider content-secret' }) }),
  });
  assert.deepEqual(failed, { status: 'failed', error: 'ContentINKA не смогла собрать материал.' });
});

test('completed jobs reject malformed media and mismatched job ids', async () => {
  const settings = { enabled: true, endpoint: 'https://postinka.example', secret: 'secret' };
  await assert.rejects(
    getContentIngestJob('job-1', {
      readSettings: () => settings,
      fetch: async () => ({ status: 200, ok: true, json: async () => ({ job_id: 'job-1', status: 'completed', result: { media: [{ id: 'photo-1' }], visual_archetype: null, text_triad: null, text_draft: 'Текст' } }) }),
    }),
    (error) => error instanceof ContentSyncError && error.message === 'ContentINKA вернула повреждённый результат.',
  );
  await assert.rejects(
    getContentIngestJob('job-1', {
      readSettings: () => settings,
      fetch: async () => ({ status: 200, ok: true, json: async () => ({ job_id: 'job-other', status: 'running' }) }),
    }),
    (error) => error instanceof ContentSyncError && error.message === 'ContentINKA вернула неожиданный ответ.',
  );
});

test('terminal create jobs stay retryable and failed refresh jobs are cleaned after confirmation', () => {
  const queue = readFileSync(new URL('../src/lib/contentJobQueue.ts', import.meta.url), 'utf8');
  assert.match(queue, /retryable: currentRecord\.operation === 'create'/);
  assert.match(queue, /record\.state === 'failed'[\s\S]*record\.operation === 'refresh'[\s\S]*entry\.status !== 'draft'/);
});
