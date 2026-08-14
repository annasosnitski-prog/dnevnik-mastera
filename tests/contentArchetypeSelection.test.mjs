import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { normalizeContentEntry } from '../.test-dist/src/lib/contentApproval.js';

test('composer defaults to Inka choice and persists the selected primary text archetype via the shared top toolbar', () => {
  const screenSource = readFileSync(new URL('../src/components/screens/ContentINKAScreen.tsx', import.meta.url), 'utf8');
  const screen = screenSource.slice(screenSource.indexOf('export function ContentINKAScreen({'));
  const topToolbar = screen.slice(screen.indexOf('{/* ── Верхний toolbar'), screen.indexOf('{/* ── Composer ── */}'));
  const composer = screen.slice(screen.indexOf('{/* ── Composer ── */}'), screen.indexOf('{/* ── Filter ── */}'));
  const generation = screen.slice(screen.indexOf('const handleGenerate ='), screen.indexOf('const regenerate ='));

  assert.match(screen, /useState\(''\).*composerTextArchetype|\[composerTextArchetype, setComposerTextArchetype\] = useState\(''\)/s);

  // Верхний toolbar — единственное место выбора основного архетипа новой
  // генерации, использует общий ARCHETYPE_CHIPS и общий ArchetypeToolbar.
  assert.match(topToolbar, /ArchetypeToolbar/);
  assert.match(topToolbar, /chips=\{ARCHETYPE_CHIPS\}/);
  assert.match(topToolbar, /value=\{composerTextArchetype \|\| null\}/);
  assert.match(topToolbar, /onSelect=\{setComposerTextArchetype\}/);
  assert.match(topToolbar, /allowClear/);
  assert.match(topToolbar, /Инка выберет сама/);

  // Композер новой записи не содержит второго набора архетипов — ни
  // старого select, ни повторного ARCHETYPE_CHIPS.map.
  assert.doesNotMatch(composer, /ARCHETYPE_CHIPS/);
  assert.doesNotMatch(composer, /Основной текстовый архетип/);
  assert.doesNotMatch(composer, /Инка выберет сама/);
  assert.doesNotMatch(composer, /<select[^>]*composerTextArchetype/);

  assert.match(generation, /ARCHETYPE_CHIPS\.find\(\(preset\) => preset\.label === composerTextArchetype\)/);
  assert.match(generation, /photos\.length > 0[\s\S]*buildInitialContentInstruction\(selectedTextArchetype\?\.instruction\)/);
  assert.match(generation, /masterInstruction,/);
  assert.match(generation, /textArchetype: selectedTextArchetype\?\.label \?\? null/);
  assert.match(screen, /const resetComposer = \(\) => \{[^}]*setComposerTextArchetype\(''\)/s);
});

test('the shared ArchetypeToolbar renders all seven chips, toggles selection off on repeat tap, and exposes aria attributes', () => {
  const toolbarSource = readFileSync(new URL('../src/components/content/ArchetypeToolbar.tsx', import.meta.url), 'utf8');

  assert.match(toolbarSource, /chips\.map/);
  assert.match(toolbarSource, /aria-pressed=\{isSelected\}/);
  assert.match(toolbarSource, /aria-label=\{chip\.label\}/);
  assert.match(toolbarSource, /disabled=\{disabled\}/);
  // Повторный тап по выбранному архетипу снимает выбор только когда
  // allowClear=true (composer); карточка перегенерации выбор не снимает.
  assert.match(toolbarSource, /onSelect\(allowClear && isSelected \? '' : chip\.label\)/);
});

test('the top composer toolbar and the card regeneration toolbar reuse the same ARCHETYPE_CHIPS list and icon set', () => {
  const screenSource = readFileSync(new URL('../src/components/screens/ContentINKAScreen.tsx', import.meta.url), 'utf8');
  const screen = screenSource.slice(screenSource.indexOf('export function ContentINKAScreen({'));
  const matches = [...screen.matchAll(/chips=\{ARCHETYPE_CHIPS\}/g)];
  // Composer + card regeneration toolbar — ровно два использования, оба
  // общего ARCHETYPE_CHIPS, второй набор данных не заведён.
  assert.equal(matches.length, 2);

  const cardToolbar = screen.slice(screen.indexOf('Голос текста — перегенерировать'), screen.indexOf('content-refresh-row'));
  assert.match(cardToolbar, /ArchetypeToolbar/);
  assert.match(cardToolbar, /value=\{selectedArchetypeByEntry\[entry\.id\] \?\? null\}/);
  assert.match(cardToolbar, /if \(preset\) contentCardActions\.regenerate\(entry, preset\.instruction, preset\.label\);/);
  assert.match(cardToolbar, /entry\.status === 'confirmed'/);
});

test('the saved archetype reuses the existing ingest instruction and survives normalization', () => {
  const componentSource = readFileSync(new URL('../src/components/screens/ContentINKAScreen.tsx', import.meta.url), 'utf8');
  const syncSource = readFileSync(new URL('../src/lib/contentSync.ts', import.meta.url), 'utf8');
  const screen = componentSource.slice(componentSource.indexOf('export function ContentINKAScreen({'));
  const refresh = screen.slice(screen.indexOf('const regenerate ='), screen.indexOf('const copyContentDraft ='));

  assert.match(refresh, /preset\.label === currentEntry\.textArchetype/);
  assert.match(refresh, /const masterInstruction = instruction \|\| primaryTextArchetype\?\.instruction/);
  assert.match(refresh, /createContentIngestJob\(params\)/);
  assert.match(refresh, /operation: 'refresh'/);
  assert.match(syncSource, /\/api\/ingest-jobs/);
  assert.match(syncSource, /master_instruction: params\.masterInstruction \?\? null/);
  assert.doesNotMatch(syncSource, /api\/archetype|api\/generate-text/);

  const entry = normalizeContentEntry({
    id: 'entry-1',
    textDraft: 'Текст',
    textArchetype: 'Мудрец',
  });
  assert.equal(entry.textArchetype, 'Мудрец');
});

test('the new archetype SVG icon set has no emoji and no external icon dependency', () => {
  const iconSource = readFileSync(new URL('../src/components/content/ArchetypeIcon.tsx', import.meta.url), 'utf8');
  const toolbarSource = readFileSync(new URL('../src/components/content/ArchetypeToolbar.tsx', import.meta.url), 'utf8');

  assert.match(iconSource, /viewBox: '0 0 24 24'/);
  assert.match(iconSource, /fill: 'none'/);
  assert.match(iconSource, /stroke: 'currentColor'/);
  assert.match(iconSource, /strokeWidth: 1\.6/);
  assert.match(iconSource, /'aria-hidden': true/);
  assert.doesNotMatch(iconSource, /from 'react-icons/);
  assert.doesNotMatch(toolbarSource, /from 'react-icons/);

  for (const emoji of ['🦊', '❤️', '🧭', '🦉', '🌹', '🎨', '🔄']) {
    assert.equal(iconSource.includes(emoji), false);
  }
});
