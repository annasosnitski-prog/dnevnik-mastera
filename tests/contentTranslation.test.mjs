import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { ContentSyncError, translateContentText } from '../.test-dist/src/lib/contentSync.js';
import {
  contentTranslationKey,
  createContentTranslationRunner,
  currentContentTranslation,
  isContentTranslationStale,
  saveContentTranslation,
} from '../.test-dist/src/lib/contentTranslation.js';

const settings = { enabled: true, endpoint: 'https://content.example/', secret: 'content-secret' };

test('translation uses the existing endpoint and Bearer secret for /api/translate', async () => {
  const requests = [];
  const result = await translateContentText(
    { sourceText: '  Первый абзац\n\nВторой абзац  ', targetLanguage: 'he' },
    {
      readSettings: () => settings,
      fetch: async (url, init) => {
        requests.push({ url, init });
        return {
          ok: true,
          json: async () => ({ target_language: 'he', translated_text: 'תרגום' }),
        };
      },
    },
  );

  assert.deepEqual(result, { targetLanguage: 'he', translatedText: 'תרגום' });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://content.example/api/translate');
  assert.equal(requests[0].init.method, 'POST');
  assert.equal(requests[0].init.headers.Authorization, 'Bearer content-secret');
  assert.deepEqual(JSON.parse(requests[0].init.body), {
    source_text: '  Первый абзац\n\nВторой абзац  ',
    target_language: 'he',
  });
});

test('translation supports both Hebrew and English without calling ingest', async () => {
  const urls = [];
  for (const language of ['he', 'en']) {
    const result = await translateContentText(
      { sourceText: 'Точный исходник', targetLanguage: language },
      {
        readSettings: () => settings,
        fetch: async (url) => {
          urls.push(url);
          return {
            ok: true,
            json: async () => ({ target_language: language, translated_text: `${language}-translation` }),
          };
        },
      },
    );
    assert.equal(result.targetLanguage, language);
  }

  assert.deepEqual(urls, ['https://content.example/api/translate', 'https://content.example/api/translate']);
  assert.equal(urls.some((url) => url.includes('/api/ingest')), false);
});

test('empty source text is rejected before the API call', async () => {
  let requestCount = 0;
  await assert.rejects(
    translateContentText(
      { sourceText: ' \n\t ', targetLanguage: 'en' },
      {
        readSettings: () => settings,
        fetch: async () => {
          requestCount += 1;
          throw new Error('must not run');
        },
      },
    ),
    (error) => error instanceof ContentSyncError && error.message === 'Не удалось перевести текст.',
  );
  assert.equal(requestCount, 0);
});

test('translation errors are safe and never expose provider responses or secrets', async () => {
  await assert.rejects(
    translateContentText(
      { sourceText: 'Текст', targetLanguage: 'en' },
      {
        readSettings: () => settings,
        fetch: async () => ({ ok: false, status: 500, text: async () => 'raw provider error content-secret' }),
      },
    ),
    (error) =>
      error instanceof ContentSyncError &&
      error.message === 'ContentINKA ответила ошибкой.' &&
      !error.message.includes('content-secret') &&
      !error.message.includes('provider'),
  );

  await assert.rejects(
    translateContentText(
      { sourceText: 'Текст', targetLanguage: 'he' },
      { readSettings: () => settings, fetch: async () => { throw new Error('network details'); } },
    ),
    (error) => error instanceof ContentSyncError && error.message === 'Не удалось связаться с ContentINKA.',
  );
});

test('missing existing ContentINKA settings produces the local configuration error', async () => {
  await assert.rejects(
    translateContentText(
      { sourceText: 'Текст', targetLanguage: 'he' },
      { readSettings: () => ({ enabled: false, endpoint: '', secret: '' }) },
    ),
    (error) => error instanceof ContentSyncError && error.message === 'ContentINKA не настроена.',
  );
});

test('saving a translation preserves textDraft and remains backward compatible', () => {
  const legacyEntry = { id: 'entry-1', textDraft: 'Оригинал', status: 'draft' };
  assert.equal(currentContentTranslation(legacyEntry, 'he'), undefined);
  assert.equal(isContentTranslationStale(legacyEntry, 'he'), false);

  const updated = saveContentTranslation({
    entry: legacyEntry,
    language: 'he',
    sourceText: legacyEntry.textDraft,
    translatedText: 'תרגום',
    translatedAt: '2026-07-26T12:00:00.000Z',
  });

  assert.equal(updated.textDraft, 'Оригинал');
  assert.deepEqual(updated.translations.he, {
    sourceText: 'Оригинал',
    translatedText: 'תרגום',
    translatedAt: '2026-07-26T12:00:00.000Z',
  });
  assert.deepEqual(JSON.parse(JSON.stringify(updated)).translations, updated.translations);
  assert.equal('translations' in legacyEntry, false);
});

test('a translation with another sourceText is marked as the previous version', () => {
  const entry = {
    id: 'entry-1',
    textDraft: 'Новый оригинал',
    translations: {
      en: { sourceText: 'Старый оригинал', translatedText: 'Old translation', translatedAt: 'earlier' },
    },
  };

  assert.equal(currentContentTranslation(entry, 'en'), undefined);
  assert.equal(isContentTranslationStale(entry, 'en'), true);
});

test('updating a stale translation stores the new sourceText without replacing the original', async () => {
  const entry = {
    id: 'entry-1',
    textDraft: 'Новая версия',
    translations: {
      en: { sourceText: 'Старая версия', translatedText: 'Old', translatedAt: 'earlier' },
    },
  };
  const saved = [];
  const runner = createContentTranslationRunner();
  const outcome = await runner.run({
    entry,
    language: 'en',
    request: async () => ({ targetLanguage: 'en', translatedText: 'New' }),
    save: (updated) => saved.push(updated),
    now: () => 'now',
  });

  assert.equal(outcome.status, 'updated');
  assert.equal(saved[0].textDraft, 'Новая версия');
  assert.deepEqual(saved[0].translations.en, {
    sourceText: 'Новая версия',
    translatedText: 'New',
    translatedAt: 'now',
  });
});

test('a confirmed entry can still be translated', async () => {
  const entry = {
    id: 'confirmed-entry',
    status: 'confirmed',
    isExemplar: true,
    textDraft: 'Одобренный оригинал',
  };
  const saved = [];
  const outcome = await createContentTranslationRunner().run({
    entry,
    language: 'he',
    request: async () => ({ targetLanguage: 'he', translatedText: 'תרגום מאושר' }),
    save: (updated) => saved.push(updated),
    now: () => 'now',
  });

  assert.equal(outcome.status, 'updated');
  assert.equal(saved[0].status, 'confirmed');
  assert.equal(saved[0].isExemplar, true);
  assert.equal(saved[0].textDraft, 'Одобренный оригинал');
  assert.equal(saved[0].translations.he.translatedText, 'תרגום מאושר');
});

test('a current saved translation skips another API request', async () => {
  const entry = {
    id: 'entry-1',
    textDraft: 'Оригинал',
    translations: {
      he: { sourceText: 'Оригинал', translatedText: 'תרגום', translatedAt: 'now' },
    },
  };
  let requestCount = 0;
  const outcome = await createContentTranslationRunner().run({
    entry,
    language: 'he',
    request: async () => {
      requestCount += 1;
      return { targetLanguage: 'he', translatedText: 'Другой' };
    },
    save: () => undefined,
  });

  assert.deepEqual(outcome, { status: 'ignored' });
  assert.equal(requestCount, 0);
});

test('translation requests are isolated by entry id and language', async () => {
  const runner = createContentTranslationRunner();
  const releases = new Map();
  const calls = [];
  const request = (key, language) => async () => {
    calls.push(key);
    await new Promise((resolve) => releases.set(key, resolve));
    return { targetLanguage: language, translatedText: `${key}-translated` };
  };
  const base = { textDraft: 'Оригинал' };

  const first = runner.run({ entry: { ...base, id: 'entry-1' }, language: 'he', request: request('entry-1:he', 'he'), save: () => undefined });
  const duplicate = runner.run({ entry: { ...base, id: 'entry-1' }, language: 'he', request: request('duplicate', 'he'), save: () => undefined });
  const otherLanguage = runner.run({ entry: { ...base, id: 'entry-1' }, language: 'en', request: request('entry-1:en', 'en'), save: () => undefined });
  const otherEntry = runner.run({ entry: { ...base, id: 'entry-2' }, language: 'he', request: request('entry-2:he', 'he'), save: () => undefined });

  assert.equal(runner.isRunning('entry-1', 'he'), true);
  assert.equal(runner.isRunning('entry-1', 'en'), true);
  assert.equal(runner.isRunning('entry-2', 'he'), true);
  assert.deepEqual(await duplicate, { status: 'ignored' });
  assert.deepEqual(calls.sort(), ['entry-1:en', 'entry-1:he', 'entry-2:he']);

  for (const release of releases.values()) release();
  await Promise.all([first, otherLanguage, otherEntry]);
});

test('parallel languages merge into the same latest ContentEntry', async () => {
  const runner = createContentTranslationRunner();
  let current = { id: 'entry-1', textDraft: 'Оригинал' };
  let releaseHebrew;
  let releaseEnglish;
  const save = (entry) => { current = entry; };
  const getCurrentEntry = () => current;

  const hebrew = runner.run({
    entry: current,
    language: 'he',
    request: async () => {
      await new Promise((resolve) => { releaseHebrew = resolve; });
      return { targetLanguage: 'he', translatedText: 'תרגום' };
    },
    getCurrentEntry,
    save,
    now: () => 'he-time',
  });
  const english = runner.run({
    entry: current,
    language: 'en',
    request: async () => {
      await new Promise((resolve) => { releaseEnglish = resolve; });
      return { targetLanguage: 'en', translatedText: 'Translation' };
    },
    getCurrentEntry,
    save,
    now: () => 'en-time',
  });

  releaseHebrew();
  await hebrew;
  releaseEnglish();
  await english;

  assert.equal(current.translations.he.translatedText, 'תרגום');
  assert.equal(current.translations.en.translatedText, 'Translation');
});

test('completion merges into the latest entry and never restores an older textDraft', async () => {
  const original = { id: 'entry-1', textDraft: 'Версия до refresh' };
  const refreshed = { ...original, textDraft: 'Версия после refresh' };
  const saved = [];

  await createContentTranslationRunner().run({
    entry: original,
    language: 'en',
    request: async () => ({ targetLanguage: 'en', translatedText: 'Translation of old version' }),
    getCurrentEntry: () => refreshed,
    save: (entry) => saved.push(entry),
    now: () => 'now',
  });

  assert.equal(saved[0].textDraft, 'Версия после refresh');
  assert.equal(saved[0].translations.en.sourceText, 'Версия до refresh');
  assert.equal(isContentTranslationStale(saved[0], 'en'), true);
});

test('empty input and errors do not save or remove original and previous translations', async () => {
  const entry = {
    id: 'entry-1',
    textDraft: 'Оригинал',
    translations: { en: { sourceText: 'Оригинал', translatedText: 'Saved', translatedAt: 'now' } },
  };
  const snapshot = structuredClone(entry);
  let saveCount = 0;

  await assert.rejects(
    createContentTranslationRunner().run({
      entry: { ...entry, translations: { he: { sourceText: 'Старый', translatedText: 'ישן', translatedAt: 'earlier' } } },
      language: 'he',
      request: async () => { throw new Error('failed'); },
      save: () => { saveCount += 1; },
    }),
    /failed/,
  );

  let emptyRequestCount = 0;
  const emptyOutcome = await createContentTranslationRunner().run({
    entry: { id: 'empty', textDraft: '   ' },
    language: 'en',
    request: async () => { emptyRequestCount += 1; return { targetLanguage: 'en', translatedText: 'x' }; },
    save: () => { saveCount += 1; },
  });

  assert.deepEqual(emptyOutcome, { status: 'ignored' });
  assert.equal(emptyRequestCount, 0);
  assert.equal(saveCount, 0);
  assert.deepEqual(entry, snapshot);
});

test('disposing the runner prevents a completed request from updating saved state', async () => {
  const runner = createContentTranslationRunner();
  let release;
  let saveCount = 0;
  const pending = runner.run({
    entry: { id: 'entry-1', textDraft: 'Оригинал' },
    language: 'he',
    request: async () => {
      await new Promise((resolve) => { release = resolve; });
      return { targetLanguage: 'he', translatedText: 'תרגום' };
    },
    save: () => { saveCount += 1; },
  });

  runner.dispose();
  release();
  assert.deepEqual(await pending, { status: 'ignored' });
  assert.equal(saveCount, 0);
});

test('translation UI has correct direction, language, paragraphs and local controls', () => {
  const screen = readFileSync(new URL('../src/components/screens/ContentINKAScreen.tsx', import.meta.url), 'utf8');
  const styles = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
  const translateHandler = screen.slice(screen.indexOf('const translateEntry ='), screen.indexOf('const copyContentTranslation ='));
  const translationCopy = screen.slice(screen.indexOf('const copyContentTranslation ='), screen.indexOf('const deleteContentEntry ='));

  assert.match(screen, /\{ language: 'he', actionLabel: 'На иврит'.*dir: 'rtl' \}/);
  assert.match(screen, /\{ language: 'en', actionLabel: 'На английский'.*dir: 'ltr' \}/);
  assert.match(screen, /dir=\{option\.dir\}/);
  assert.match(screen, /lang=\{option\.language\}/);
  assert.match(styles, /\.content-translation-block__text\s*\{[^}]*white-space:\s*pre-wrap/s);
  assert.match(screen, /Перевод предыдущей версии/);
  assert.match(screen, /Обновить перевод/);
  assert.match(screen, /disabled=\{!entry\.textDraft\.trim\(\)\}/);
  assert.match(translateHandler, /contentTranslationKey\(currentEntry\.id, language\)/);
  assert.match(translateHandler, /translationRunner\.isRunning\(currentEntry\.id, language\)/);
  assert.equal((screen.match(/translateContentText\(/g) ?? []).length, 1);
  assert.doesNotMatch(translateHandler, /setError\(/);
  assert.match(translationCopy, /copyTextToClipboard\(translation\.translatedText\)/);
  assert.doesNotMatch(translationCopy, /navigator\.clipboard|execCommand|textDraft/);
});

test('translation operation keys keep entry and language pairs independent', () => {
  assert.notEqual(contentTranslationKey('entry-1', 'he'), contentTranslationKey('entry-1', 'en'));
  assert.notEqual(contentTranslationKey('entry-1', 'he'), contentTranslationKey('entry-2', 'he'));
});
