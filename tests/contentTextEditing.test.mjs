import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  MAX_CONTENT_TEXT_CHARACTERS,
  contentTextLength,
  isContentTextDirty,
  saveContentTextEdit,
} from '../.test-dist/src/lib/contentTextEditing.js';
import { currentContentTranslation, isContentTranslationStale } from '../.test-dist/src/lib/contentTranslation.js';

const draftEntry = {
  id: 'entry-1',
  status: 'draft',
  textDraft: 'Первый абзац\n\nВторой абзац',
  textArchetype: 'Творец',
  photos: ['original-photo'],
  photoIds: ['photo-id'],
  contentDraft: [{ id: 'photo-id', technical_status: 'kept', selected: true, selection_role: 'cover' }],
  visualArchetype: 'creator',
  textTriad: { opens: 'creator', leads: 'sage', closes: 'lover' },
  sourceType: 'session',
  sourceId: 'session-1',
  isExemplar: false,
  createdDate: '2026-07-27T00:00:00.000Z',
  translations: {
    en: { sourceText: 'Первый абзац\n\nВторой абзац', translatedText: 'Old translation', translatedAt: 'earlier' },
  },
};

test('counts Unicode code points correctly, including emoji', () => {
  assert.equal(contentTextLength('A😀Б'), 3);
  assert.equal('A😀Б'.length, 4);
  assert.equal(MAX_CONTENT_TEXT_CHARACTERS, 650);
});

test('detects local editor changes without normalizing them', () => {
  assert.equal(isContentTextDirty('Текст', 'Текст'), false);
  assert.equal(isContentTextDirty('Текст', ' Текст '), true);
  assert.equal(isContentTextDirty('Абзац 1\n\nАбзац 2', 'Абзац 1\nАбзац 2'), true);
});

test('returns unchanged when the trimmed editor text matches the saved text', () => {
  const outcome = saveContentTextEdit(draftEntry, {
    baseText: draftEntry.textDraft,
    editedText: `  ${draftEntry.textDraft}  `,
  });
  assert.deepEqual(outcome, { status: 'unchanged', entry: draftEntry });
});

test('saves a manual edit to textDraft and removes only outer whitespace', () => {
  const outcome = saveContentTextEdit(draftEntry, {
    baseText: draftEntry.textDraft,
    editedText: '  Новый  текст\n\n  Второй абзац  ',
  });

  assert.equal(outcome.status, 'saved');
  assert.equal(outcome.entry.textDraft, 'Новый  текст\n\n  Второй абзац');
});

test('preserves internal line breaks and paragraphs', () => {
  const editedText = 'Первый\n\nВторой\n  строка с отступом';
  const outcome = saveContentTextEdit(draftEntry, { baseText: draftEntry.textDraft, editedText });
  assert.equal(outcome.status, 'saved');
  assert.equal(outcome.entry.textDraft, editedText);
});

test('rejects empty edited text', () => {
  assert.deepEqual(
    saveContentTextEdit(draftEntry, { baseText: draftEntry.textDraft, editedText: ' \n\t ' }),
    { status: 'empty' },
  );
});

test('allows exactly 650 Unicode characters', () => {
  const editedText = '😀'.repeat(650);
  const outcome = saveContentTextEdit(draftEntry, { baseText: draftEntry.textDraft, editedText });
  assert.equal(outcome.status, 'saved');
  assert.equal(contentTextLength(outcome.entry.textDraft), 650);
});

test('rejects 651 characters without truncating the source or edited text', () => {
  const editedText = 'я'.repeat(651);
  const snapshot = structuredClone(draftEntry);
  assert.deepEqual(
    saveContentTextEdit(draftEntry, { baseText: draftEntry.textDraft, editedText }),
    { status: 'too_long' },
  );
  assert.equal(editedText.length, 651);
  assert.deepEqual(draftEntry, snapshot);
});

test('does not edit a confirmed entry', () => {
  const confirmed = { ...draftEntry, status: 'confirmed' };
  assert.deepEqual(
    saveContentTextEdit(confirmed, { baseText: confirmed.textDraft, editedText: 'Новая версия' }),
    { status: 'locked' },
  );
});

test('detects a base-version conflict and does not overwrite newer text', () => {
  const newerEntry = { ...draftEntry, textDraft: 'Версия после другого действия' };
  assert.deepEqual(
    saveContentTextEdit(newerEntry, { baseText: draftEntry.textDraft, editedText: 'Локальная старая версия' }),
    { status: 'conflict' },
  );
  assert.equal(newerEntry.textDraft, 'Версия после другого действия');
});

test('does not mutate the original and preserves photos, selection and every other field', () => {
  const snapshot = structuredClone(draftEntry);
  const outcome = saveContentTextEdit(draftEntry, {
    baseText: draftEntry.textDraft,
    editedText: 'Отредактированный текст',
  });

  assert.equal(outcome.status, 'saved');
  assert.deepEqual(draftEntry, snapshot);
  assert.deepEqual(outcome.entry, { ...draftEntry, textDraft: 'Отредактированный текст' });
  assert.notEqual(outcome.entry, draftEntry);
});

test('an existing translation becomes stale after editing and only the new sourceText is current', () => {
  const outcome = saveContentTextEdit(draftEntry, {
    baseText: draftEntry.textDraft,
    editedText: 'Новая сохранённая версия',
  });
  assert.equal(outcome.status, 'saved');
  assert.equal(isContentTranslationStale(outcome.entry, 'en'), true);
  assert.equal(currentContentTranslation(outcome.entry, 'en'), undefined);

  const updatedTranslation = {
    ...outcome.entry,
    translations: {
      ...outcome.entry.translations,
      en: { sourceText: outcome.entry.textDraft, translatedText: 'New translation', translatedAt: 'now' },
    },
  };
  assert.equal(isContentTranslationStale(updatedTranslation, 'en'), false);
  assert.equal(currentContentTranslation(updatedTranslation, 'en').translatedText, 'New translation');
});

test('editor UI saves through the existing entry, blocks unsafe actions and never translates textarea state', () => {
  const source = readFileSync(new URL('../src/components/TattoDiary.tsx', import.meta.url), 'utf8');
  const styles = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
  const screen = source.slice(source.indexOf('function ContentINKAScreen({'), source.indexOf('function ContentPanel({'));
  const saveHandler = screen.slice(screen.indexOf('const saveTextEdit ='), screen.indexOf('const approveEntry ='));
  const cancelHandler = screen.slice(screen.indexOf('const cancelTextEdit ='), screen.indexOf('const saveTextEdit ='));
  const copyHandler = screen.slice(screen.indexOf('const copyContentDraft ='), screen.indexOf('const toggleTranslationMenu ='));
  const translateHandler = screen.slice(screen.indexOf('const translateEntry ='), screen.indexOf('const copyContentTranslation ='));

  assert.match(screen, /baseText: entry\.textDraft, editedText: entry\.textDraft/);
  assert.match(screen, /<textarea/);
  assert.doesNotMatch(screen, /contentEditable|contenteditable/);
  assert.match(screen, /contentTextLength\(textEditorsByEntry\[entry\.id\]\.editedText\.trim\(\)\)/);
  assert.match(screen, /Не сохранено/);
  assert.match(screen, /Сначала сохраните текст/);
  assert.match(screen, /Сначала сохраните или отмените правки/);
  assert.match(screen, /entry\.status === 'draft'.*textEditorsByEntry\[entry\.id\]/s);
  assert.match(screen, /entry\.status === 'draft'.*Редактировать/s);

  assert.match(saveHandler, /contentEntriesRef\.current\.find/);
  assert.match(saveHandler, /saveContentTextEdit\(currentEntry/);
  assert.match(saveHandler, /if \(outcome\.status === 'saved'\) saveEntryInWorkspace\(outcome\.entry\)/);
  assert.match(saveHandler, /Текст уже изменился\. Откройте редактор заново\./);
  assert.doesNotMatch(saveHandler, /createDraftContentEntry|translations:|photos:|contentDraft:/);

  assert.doesNotMatch(cancelHandler, /saveEntryInWorkspace|onSaveEntry|textDraft:/);
  assert.match(copyHandler, /copyTextToClipboard\(entry\.textDraft\)/);
  assert.doesNotMatch(copyHandler, /editedText|textEditorsByEntry/);
  assert.match(screen, /disabled=\{!entry\.textDraft\.trim\(\) \|\| hasUnsavedTextEdit\(entry\)\}/);
  assert.match(screen, /disabled=\{entry\.status === 'confirmed' \|\| refreshingEntryIds\.has\(entry\.id\) \|\| hasUnsavedTextEdit\(entry\)\}/);
  assert.match(screen, /disabled=\{refreshingEntryIds\.has\(entry\.id\) \|\| hasUnsavedTextEdit\(entry\)\}/);
  assert.match(translateHandler, /hasUnsavedTextEdit\(currentEntry\)/);
  assert.match(translateHandler, /translateContentText\(\{ sourceText: currentEntry\.textDraft/);
  assert.doesNotMatch(translateHandler, /editedText|textEditorsByEntry/);

  assert.match(styles, /\.content-text-editor textarea\s*\{[^}]*min-height:\s*180px/s);
  assert.match(styles, /\.content-text-output__body\s*\{[^}]*white-space:\s*pre-wrap/s);
});

test('the visible "N / 650" counter is removed from the editor while the 650 limit stays enforced', () => {
  const source = readFileSync(new URL('../src/components/TattoDiary.tsx', import.meta.url), 'utf8');
  const screen = source.slice(source.indexOf('function ContentINKAScreen({'), source.indexOf('function ContentPanel({'));

  assert.doesNotMatch(screen, /\{contentTextLength\([^)]*\)\}\s*\/\s*\{MAX_CONTENT_TEXT_CHARACTERS\}/);
  assert.doesNotMatch(screen, /is-over-limit/);

  // Ограничение и предупреждение о превышении остаются: aria-invalid,
  // блокировка «Сохранить» и текст ошибки при превышении лимита.
  assert.match(screen, /aria-invalid=\{contentTextLength\(textEditorsByEntry\[entry\.id\]\.editedText\.trim\(\)\) > MAX_CONTENT_TEXT_CHARACTERS\}/);
  assert.match(screen, /contentTextLength\(textEditorsByEntry\[entry\.id\]\.editedText\.trim\(\)\) > MAX_CONTENT_TEXT_CHARACTERS &&/);
  assert.match(screen, /Сократите текст вручную до 650 символов/);
});
