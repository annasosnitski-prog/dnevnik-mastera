import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createContentRefreshRunner } from '../.test-dist/src/lib/contentRefresh.js';

test('locks a confirmed entry before request or save and leaves its text unchanged', async () => {
  const runner = createContentRefreshRunner();
  const entry = {
    id: 'confirmed-entry',
    status: 'confirmed',
    contentDraft: [],
    visualArchetype: 'creator',
    textTriad: null,
    textDraft: 'Одобренный текст',
  };
  let requestCount = 0;
  let saveCount = 0;

  const outcome = await runner.run({
    entry,
    request: async () => {
      requestCount += 1;
      return { text_draft: 'Нельзя сохранить' };
    },
    save: () => {
      saveCount += 1;
    },
  });

  assert.deepEqual(outcome, { status: 'locked' });
  assert.equal(requestCount, 0);
  assert.equal(saveCount, 0);
  assert.equal(entry.textDraft, 'Одобренный текст');
  assert.equal(runner.isRunning(entry.id), false);
});

test('does not save a refresh if the entry is confirmed while the request is in flight', async () => {
  const runner = createContentRefreshRunner();
  const entry = {
    id: 'entry-1',
    status: 'draft',
    contentDraft: [],
    visualArchetype: null,
    textTriad: null,
    textDraft: 'Исходный текст',
  };
  let currentEntry = entry;
  let releaseRequest;
  const pending = new Promise((resolve) => {
    releaseRequest = resolve;
  });
  let saveCount = 0;

  const run = runner.run({
    entry,
    getCurrentEntry: () => currentEntry,
    request: async () => {
      await pending;
      return { text_draft: 'Новая версия' };
    },
    save: () => {
      saveCount += 1;
    },
  });
  currentEntry = { ...entry, status: 'confirmed' };
  releaseRequest();

  assert.deepEqual(await run, { status: 'locked' });
  assert.equal(saveCount, 0);
  assert.equal(currentEntry.textDraft, 'Исходный текст');
});

test('blocks a second refresh while the same entry is in flight', async () => {
  const runner = createContentRefreshRunner();
  const entry = {
    id: 'entry-1',
    contentDraft: [],
    visualArchetype: 'creator',
    textTriad: { opens: 'creator', leads: 'sage', closes: 'lover' },
    textDraft: 'Предыдущий текст',
    photos: ['photo'],
    clientId: 'client-1',
  };

  let releaseRequest;
  const pendingRequest = new Promise((resolve) => {
    releaseRequest = resolve;
  });
  let requestCount = 0;
  const request = async () => {
    requestCount += 1;
    await pendingRequest;
    return {
      media: [],
      visual_archetype: 'creator',
      text_triad: entry.textTriad,
      text_draft: 'Обновлённый текст',
    };
  };

  const first = runner.run({ entry, request, save: () => undefined });
  const second = runner.run({ entry, request, save: () => undefined });
  releaseRequest();
  const [, secondOutcome] = await Promise.all([first, second]);

  assert.equal(requestCount, 1);
  assert.deepEqual(secondOutcome, { status: 'ignored' });
  assert.equal(runner.isRunning(entry.id), false);
});

test('tracks parallel refreshes for different entries independently', async () => {
  const runner = createContentRefreshRunner();
  const firstEntry = {
    id: 'entry-1',
    contentDraft: [],
    visualArchetype: null,
    textTriad: null,
    textDraft: 'Первый текст',
  };
  const secondEntry = { ...firstEntry, id: 'entry-2', textDraft: 'Второй текст' };

  let releaseFirst;
  let releaseSecond;
  const firstPending = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  const secondPending = new Promise((resolve) => {
    releaseSecond = resolve;
  });

  const firstRun = runner.run({
    entry: firstEntry,
    request: async () => {
      await firstPending;
      return { text_draft: 'Первый обновлён' };
    },
    save: () => undefined,
  });
  const secondRun = runner.run({
    entry: secondEntry,
    request: async () => {
      await secondPending;
      return { text_draft: 'Второй обновлён' };
    },
    save: () => undefined,
  });

  assert.equal(runner.isRunning(firstEntry.id), true);
  assert.equal(runner.isRunning(secondEntry.id), true);

  releaseFirst();
  await firstRun;
  assert.equal(runner.isRunning(firstEntry.id), false);
  assert.equal(runner.isRunning(secondEntry.id), true);

  releaseSecond();
  await secondRun;
  assert.equal(runner.isRunning(secondEntry.id), false);
});

test('updates the existing entry text without changing its other data', async () => {
  const runner = createContentRefreshRunner();
  const entry = {
    id: 'entry-1',
    createdDate: '2026-07-26T10:00:00.000Z',
    clientId: 'client-1',
    sourceType: 'session',
    sourceId: 'session-1',
    photos: ['photo-a', 'photo-b'],
    contentDraft: [{ id: 'photo-a', technical_status: 'kept' }],
    visualArchetype: 'creator',
    textTriad: { opens: 'creator', leads: 'sage', closes: 'lover' },
    textDraft: 'Предыдущий текст',
    translations: {
      en: { sourceText: 'Предыдущий текст', translatedText: 'Previous text', translatedAt: '2026-07-26T10:05:00.000Z' },
    },
    status: 'draft',
  };
  const saved = [];

  const outcome = await runner.run({
    entry,
    request: async () => ({
      text_draft: 'Обновлённый текст',
      media: [{ id: 'changed' }],
      visual_archetype: 'trickster',
      text_triad: { opens: 'trickster', leads: 'fool', closes: 'lover' },
    }),
    save: (updated) => saved.push(updated),
  });

  assert.equal(outcome.status, 'updated');
  assert.equal(saved.length, 1);
  assert.deepEqual(saved[0], { ...entry, textDraft: 'Обновлённый текст' });
  assert.equal(saved[0].id, entry.id);
  assert.deepEqual(saved[0].photos, entry.photos);
  assert.equal(saved[0].clientId, entry.clientId);
  assert.deepEqual(saved[0].contentDraft, entry.contentDraft);
  assert.equal(saved[0].visualArchetype, entry.visualArchetype);
  assert.deepEqual(saved[0].textTriad, entry.textTriad);
});

test('keeps the previous text and unlocks refresh after a real error', async () => {
  const runner = createContentRefreshRunner();
  const entry = {
    id: 'entry-1',
    contentDraft: [],
    visualArchetype: null,
    textTriad: null,
    textDraft: 'Предыдущий текст',
  };
  let saveCount = 0;

  await assert.rejects(
    runner.run({
      entry,
      request: async () => {
        throw new Error('network failed');
      },
      save: () => {
        saveCount += 1;
      },
    }),
    /network failed/,
  );

  assert.equal(saveCount, 0);
  assert.equal(entry.textDraft, 'Предыдущий текст');
  assert.equal(runner.isRunning(entry.id), false);

  const retry = await runner.run({
    entry,
    request: async () => ({ text_draft: 'Повтор успешен' }),
    save: () => undefined,
  });
  assert.equal(retry.status, 'updated');
});

test('refresh UI keeps loading and feedback local to each entry', () => {
  const source = readFileSync(new URL('../src/components/screens/ContentINKAScreen.tsx', import.meta.url), 'utf8');
  const refreshImplementation = source.slice(source.indexOf('const regenerate ='), source.indexOf('const visibleEntries'));
  const refreshCatch = refreshImplementation.slice(refreshImplementation.indexOf('} catch (refreshError)'), refreshImplementation.indexOf('const retryContentJob'));

  assert.match(refreshImplementation, /currentEntry\.status === 'confirmed'/);
  assert.match(refreshImplementation, /isEntryRefreshing\(currentEntry\.id\)/);
  assert.match(refreshImplementation, /setError\(null\)/);
  assert.match(refreshImplementation, /createContentIngestJob\(params\)/);
  assert.match(refreshImplementation, /onSaveContentIngestJob/);
  assert.match(refreshImplementation, /operation: 'refresh'/);
  assert.match(refreshImplementation, /baseTextDraft: currentEntry\.textDraft/);
  assert.match(refreshImplementation, /requestedArchetype: selectedArchetype \?\? null/);
  assert.match(refreshCatch, /setRefreshFeedbackByEntry/);
  assert.match(refreshCatch, /kind: 'error'/);
  assert.doesNotMatch(refreshCatch, /setError\(/);
  assert.match(source, /refreshFeedbackByEntry\[entry\.id\]/);
  assert.match(source, /contentINKA обновляет черновик…/);
  assert.match(source, /Обновить черновик/);
  assert.match(source, /isEntryRefreshing\(entry\.id\)/);
});

test('archetype controls use the existing labels through the shared icon toolbar without emoji', () => {
  const source = readFileSync(new URL('../src/components/screens/ContentINKAScreen.tsx', import.meta.url), 'utf8');
  const toolbarSource = readFileSync(new URL('../src/components/content/ArchetypeToolbar.tsx', import.meta.url), 'utf8');
  const styles = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
  const presets = source.slice(source.indexOf('const ARCHETYPE_CHIPS'), source.indexOf('function ContentINKAScreen'));

  for (const label of ['Трикстер', 'Женщина/Тепло', 'Исследователь', 'Мудрец', 'Дурак', 'Lover', 'Творец']) {
    assert.match(presets, new RegExp(label.replace('/', '\\/')));
  }
  for (const emoji of ['🦊', '❤️', '🧭', '🦉', '🌹', '🎨', '🔄']) {
    assert.equal(presets.includes(emoji), false);
  }

  assert.match(toolbarSource, /className="archetype-toolbar"/);
  assert.match(source, /<ArchetypeToolbar/);
  assert.match(toolbarSource, /aria-pressed=\{isSelected\}/);
  assert.match(source, /Визуальный архетип/);
  assert.match(source, /Текстовая триада/);
  assert.match(styles, /\.archetype-toolbar\s*\{[^}]*overflow-x:\s*auto/s);
  assert.match(styles, /\.archetype-toolbar__button\.is-selected/);
  assert.match(styles, /\.archetype-toolbar__button:active:not\(:disabled\)/);
  assert.match(styles, /overflow-wrap:\s*anywhere/);
});
