import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  canApplyRefreshResult,
  createCompletedContentEntry,
  CONTENT_INGEST_JOB_STORE,
  TATTO_DIARY_DB_VERSION,
} from '../.test-dist/src/lib/contentJobQueue.js';

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

test('database version 3 and technical content job store are wired', () => {
  assert.equal(TATTO_DIARY_DB_VERSION, 3);
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

test('root coordinator is mounted outside the conditional POSTiNKA screen', () => {
  const coordinator = diary.indexOf('startContentIngestJobCoordinator({');
  const contentScreen = diary.indexOf("{screen === 'content' && (");
  assert.ok(coordinator > 0 && contentScreen > 0 && coordinator < contentScreen);
});

test('create and refresh jobs are persisted instead of waiting for the long sendToContent promise', () => {
  const generate = diary.slice(diary.indexOf('const handleGenerate = async'), diary.indexOf('const regenerate = async'));
  const regenerate = diary.slice(diary.indexOf('const regenerate = async'), diary.indexOf('const copyContentDraft = async'));
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
  assert.match(diary, /deleteContentEntryAndRefreshJobs\(db, id\)/);
});

test('hidden documents pause polling and visible, focus, online wake it', () => {
  const queue = readFileSync(new URL('../src/lib/contentJobQueue.ts', import.meta.url), 'utf8');
  assert.match(queue, /visibilityState === 'hidden'/);
  assert.match(queue, /addEventListener\('visibilitychange'/);
  assert.match(queue, /addEventListener\('focus'/);
  assert.match(queue, /addEventListener\('online'/);
});
