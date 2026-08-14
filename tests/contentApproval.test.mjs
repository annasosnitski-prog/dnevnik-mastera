import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  confirmContentEntry,
  createDraftContentEntry,
  normalizeContentEntry,
  setContentEntryExemplar,
} from '../.test-dist/src/lib/contentApproval.js';

const completeEntry = {
  id: 'entry-1',
  createdDate: '2026-07-26T12:00:00.000Z',
  clientId: 'client-1',
  sourceType: 'session',
  sourceId: 'session-1',
  format: 'post',
  text: 'Исходная заметка',
  context: { client: 'Анна', work: 'Рукав', zone: 'рука', style: 'графика', description: 'Контекст' },
  photos: ['photo-a'],
  contentDraft: [{ id: 'photo-a', technical_status: 'kept' }],
  visualArchetype: 'creator',
  textTriad: { opens: 'creator', leads: 'sage', closes: 'lover' },
  textDraft: 'Готовый текст',
  status: 'draft',
  isExemplar: false,
  translations: {
    en: { sourceText: 'Готовый текст', translatedText: 'Ready text', translatedAt: 'now' },
  },
};

test('approval changes only status and preserves every other field including translations', () => {
  const original = structuredClone(completeEntry);
  const confirmed = confirmContentEntry(completeEntry);

  assert.deepEqual(confirmed, { ...completeEntry, status: 'confirmed' });
  assert.deepEqual(completeEntry, original);
  assert.equal(confirmed.id, completeEntry.id);
  assert.equal(confirmed.textDraft, completeEntry.textDraft);
  assert.deepEqual(confirmed.photos, completeEntry.photos);
  assert.deepEqual(confirmed.contentDraft, completeEntry.contentDraft);
  assert.equal(confirmed.visualArchetype, completeEntry.visualArchetype);
  assert.deepEqual(confirmed.textTriad, completeEntry.textTriad);
  assert.deepEqual(confirmed.translations, completeEntry.translations);
  assert.deepEqual(confirmed.context, completeEntry.context);
});

test('exemplar can change only for a confirmed entry', () => {
  const draft = { ...completeEntry };
  assert.equal(setContentEntryExemplar(draft, true), draft);
  assert.equal(draft.isExemplar, false);

  const confirmed = confirmContentEntry(draft);
  const exemplar = setContentEntryExemplar(confirmed, true);
  assert.equal(exemplar.isExemplar, true);
  assert.equal(confirmed.isExemplar, false);
  assert.deepEqual(setContentEntryExemplar(exemplar, false), { ...confirmed, isExemplar: false });
});

test('legacy and unknown persisted values normalize safely', () => {
  assert.deepEqual(normalizeContentEntry({ id: 'legacy' }), {
    id: 'legacy',
    status: 'draft',
    isExemplar: false,
  });
  assert.deepEqual(normalizeContentEntry({ id: 'unknown', status: 'published', isExemplar: 'yes' }), {
    id: 'unknown',
    status: 'draft',
    isExemplar: false,
  });
  assert.deepEqual(normalizeContentEntry({ id: 'confirmed', status: 'confirmed', isExemplar: true }), {
    id: 'confirmed',
    status: 'confirmed',
    isExemplar: true,
  });
});

test('a new generation for the same source creates a separate draft', () => {
  const confirmed = { ...completeEntry, id: '1000', status: 'confirmed', isExemplar: true };
  const before = structuredClone(confirmed);
  const draft = createDraftContentEntry(
    {
      sourceType: confirmed.sourceType,
      sourceId: confirmed.sourceId,
      textDraft: 'Другой вариант',
      translations: undefined,
    },
    [confirmed],
    () => 1000,
  );

  assert.equal(draft.id, '1000-1');
  assert.notEqual(draft.id, confirmed.id);
  assert.equal(draft.sourceId, confirmed.sourceId);
  assert.equal(draft.status, 'draft');
  assert.equal(draft.isExemplar, false);
  assert.deepEqual(confirmed, before);
});

test('approval UI persists through the existing contentEntries store and locks regeneration controls', () => {
  const source = readFileSync(new URL('../src/components/TattoDiary.tsx', import.meta.url), 'utf8');
  const screen = readFileSync(new URL('../src/components/screens/ContentINKAScreen.tsx', import.meta.url), 'utf8');

  assert.match(source, /request\.result \|\| \[\]\)\.map\(\(entry\) => normalizeContentEntry\(entry\)\)/);
  assert.match(screen, /saveEntryInWorkspace\(confirmContentEntry\(currentEntry\)\)/);
  assert.match(screen, /saveEntryInWorkspace\(setContentEntryExemplar\(currentEntry, isExemplar\)\)/);
  assert.match(source, /setContentEntries\(\(current\) => \[entry, \.\.\.current\.filter/);
  assert.match(source, /tx\.objectStore\('contentEntries'\)\.put\(entry\)/);
  assert.match(screen, /Одобрить текст/);
  assert.match(screen, /Одобрено/);
  assert.match(screen, /Эталон/);
  assert.match(screen, /entry\.status === 'confirmed'/);
  assert.match(screen, /entry\.status === 'draft' && \(/);
  // Confirmed-записи не перегенерируются — общий ArchetypeToolbar получает
  // disabled=true вместо отдельной статичной разметки чипов.
  assert.match(screen, /disabled=\{entry\.status === 'confirmed' \|\| refreshingEntryIds\.has\(entry\.id\) \|\| hasUnsavedTextEdit\(entry\)\}/);
  assert.match(source, /Перевести/);
  assert.match(screen, /Копировать текст/);
});
