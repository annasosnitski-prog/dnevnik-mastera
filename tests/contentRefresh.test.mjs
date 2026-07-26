import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createContentRefreshRunner } from '../.test-dist/src/lib/contentRefresh.js';

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

test('refresh UI reports success locally and disables repeated actions while loading', () => {
  const source = readFileSync(new URL('../src/components/TattoDiary.tsx', import.meta.url), 'utf8');
  const refreshImplementation = source.slice(source.indexOf('const regenerate ='), source.indexOf('const visibleEntries'));

  assert.match(refreshImplementation, /refreshRunner\.isRunning\(entry\.id\)/);
  assert.match(refreshImplementation, /kind: 'success', message: 'Черновик обновлён'/);
  assert.doesNotMatch(refreshImplementation, /setError\(/);
  assert.match(source, /disabled=\{refreshingEntryId === entry\.id\}/);
  assert.match(source, /Обновляю…/);
  assert.match(source, /Обновить черновик/);
});

test('archetype controls use the existing labels as wrapping text chips without emoji', () => {
  const source = readFileSync(new URL('../src/components/TattoDiary.tsx', import.meta.url), 'utf8');
  const styles = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
  const presets = source.slice(source.indexOf('const ARCHETYPE_CHIPS'), source.indexOf('function ContentINKAScreen'));

  for (const label of ['Трикстер', 'Женщина/Тепло', 'Исследователь', 'Мудрец', 'Дурак', 'Lover', 'Творец']) {
    assert.match(presets, new RegExp(label.replace('/', '\\/')));
  }
  for (const emoji of ['🦊', '❤️', '🧭', '🦉', '🌹', '🎨', '🔄']) {
    assert.equal(presets.includes(emoji), false);
  }

  assert.match(source, /className="content-archetype-chips"/);
  assert.match(source, /\{preset\.label\}/);
  assert.match(source, /aria-pressed=\{isSelected\}/);
  assert.match(source, /Визуальный архетип/);
  assert.match(source, /Текстовая триада/);
  assert.match(styles, /\.content-archetype-chips\s*\{[^}]*flex-wrap:\s*wrap/s);
  assert.match(styles, /\.content-archetype-chip\.is-selected/);
  assert.match(styles, /\.content-archetype-chip:active:not\(:disabled\)/);
  assert.match(styles, /overflow-wrap:\s*anywhere/);
});
