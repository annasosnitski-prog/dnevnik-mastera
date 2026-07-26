import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { normalizeContentEntry } from '../.test-dist/src/lib/contentApproval.js';

test('composer defaults to Inka choice and persists the selected primary text archetype', () => {
  const source = readFileSync(new URL('../src/components/TattoDiary.tsx', import.meta.url), 'utf8');
  const screen = source.slice(source.indexOf('function ContentINKAScreen({'), source.indexOf('function ContentPanel({'));
  const composer = screen.slice(screen.indexOf('{/* ── Composer ── */}'), screen.indexOf('{/* ── Filter ── */}'));
  const generation = screen.slice(screen.indexOf('const handleGenerate ='), screen.indexOf('const regenerate ='));

  assert.match(screen, /useState\(''\).*composerTextArchetype|\[composerTextArchetype, setComposerTextArchetype\] = useState\(''\)/s);
  assert.match(composer, /Основной текстовый архетип/);
  assert.match(composer, /<option value="">Инка выберет сама<\/option>/);
  assert.match(composer, /ARCHETYPE_CHIPS\.map/);
  assert.ok(composer.indexOf('content-primary-archetype-field') < composer.indexOf('className="inka-submit"'));

  assert.match(generation, /ARCHETYPE_CHIPS\.find\(\(preset\) => preset\.label === composerTextArchetype\)/);
  assert.match(generation, /masterInstruction: selectedTextArchetype\?\.instruction/);
  assert.match(generation, /textArchetype: selectedTextArchetype\?\.label \?\? null/);
  assert.match(screen, /const resetComposer = \(\) => \{[^}]*setComposerTextArchetype\(''\)/s);
});

test('the saved archetype reuses the existing ingest instruction and survives normalization', () => {
  const componentSource = readFileSync(new URL('../src/components/TattoDiary.tsx', import.meta.url), 'utf8');
  const syncSource = readFileSync(new URL('../src/lib/contentSync.ts', import.meta.url), 'utf8');
  const screen = componentSource.slice(componentSource.indexOf('function ContentINKAScreen({'), componentSource.indexOf('function ContentPanel({'));
  const refresh = screen.slice(screen.indexOf('const regenerate ='), screen.indexOf('const copyContentDraft ='));

  assert.match(refresh, /preset\.label === currentEntry\.textArchetype/);
  assert.match(refresh, /masterInstruction: instruction \|\| primaryTextArchetype\?\.instruction/);
  assert.match(syncSource, /\/api\/ingest/);
  assert.match(syncSource, /master_instruction: params\.masterInstruction \?\? null/);
  assert.doesNotMatch(syncSource, /api\/archetype|api\/generate-text/);

  const entry = normalizeContentEntry({
    id: 'entry-1',
    textDraft: 'Текст',
    textArchetype: 'Мудрец',
  });
  assert.equal(entry.textArchetype, 'Мудрец');
});
