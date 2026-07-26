import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  contentComposerItemKey,
  findLinkedContentEntries,
  selectContentWorkspaceEntries,
} from '../.test-dist/src/lib/contentWorkspace.js';

const entries = [
  { id: 'session-new', sourceType: 'session', sourceId: 'shared-id', clientId: 'client-1', createdDate: '2026-07-26T12:00:00Z' },
  { id: 'consultation', sourceType: 'consultation', sourceId: 'shared-id', clientId: 'client-1', createdDate: '2026-07-26T11:00:00Z' },
  { id: 'session-old', sourceType: 'session', sourceId: 'shared-id', clientId: 'client-1', createdDate: '2026-07-25T12:00:00Z' },
  { id: 'freeform', sourceType: 'freeform', sourceId: null, clientId: null, createdDate: '2026-07-24T12:00:00Z' },
];

test('finds linked drafts by the exact sourceType + sourceId pair', () => {
  assert.deepEqual(
    findLinkedContentEntries(entries, { sourceType: 'session', sourceId: 'shared-id' }).map((entry) => entry.id),
    ['session-new', 'session-old'],
  );
});

test('does not treat the same sourceId from another sourceType as linked', () => {
  assert.deepEqual(
    findLinkedContentEntries(entries, { sourceType: 'consultation', sourceId: 'shared-id' }).map((entry) => entry.id),
    ['consultation'],
  );
});

test('open-linked keeps every matching draft and does not mutate existing entries', () => {
  const snapshot = structuredClone(entries);
  const selected = selectContentWorkspaceEntries({
    entries,
    clientFilter: 'all',
    focusedSource: { sourceType: 'session', sourceId: 'shared-id' },
  });

  assert.deepEqual(selected.map((entry) => entry.id), ['session-new', 'session-old']);
  assert.deepEqual(entries, snapshot);
});

test('ordinary workspace filters continue to include freeform entries without sourceId', () => {
  const all = selectContentWorkspaceEntries({ entries, clientFilter: 'all', focusedSource: null });
  const studio = selectContentWorkspaceEntries({ entries, clientFilter: 'studio', focusedSource: null });

  assert.equal(all.some((entry) => entry.id === 'freeform'), true);
  assert.deepEqual(studio.map((entry) => entry.id), ['freeform']);
});

test('composer item keys preserve source ids containing colons', () => {
  assert.equal(contentComposerItemKey({ sourceType: 'session', sourceId: 'client:session:42' }), 's:client:session:42');
  assert.equal(contentComposerItemKey({ sourceType: 'consultation', sourceId: 'client:consultation:42' }), 'c:client:consultation:42');
});

test('source previews expose only the compact ContentINKA hand-off block', () => {
  const source = readFileSync(new URL('../src/components/TattoDiary.tsx', import.meta.url), 'utf8');
  const panel = source.slice(source.indexOf('function ContentPanel({'), source.indexOf('function TimelineViewSheet({'));

  assert.match(panel, /findLinkedContentEntries\(entries, \{ sourceType, sourceId \}\)/);
  assert.match(panel, /Передать в ContentINKA/);
  assert.match(panel, /Открыть в ContentINKA/);
  assert.match(panel, /В ContentINKA/);
  assert.match(panel, /linkedEntries\.length > 1/);
  assert.doesNotMatch(panel, /sendToContent|textDraft|ARCHETYPE_CHIPS|shareContentEntry|onDeleteEntry|onSaveEntry|Обновить черновик|Копировать/);
});

test('compose and open-linked transitions are transient and applied by ContentINKAScreen', () => {
  const source = readFileSync(new URL('../src/components/TattoDiary.tsx', import.meta.url), 'utf8');
  const screen = source.slice(source.indexOf('function ContentINKAScreen({'), source.indexOf('function ContentPanel({'));

  assert.match(source, /useState<ContentWorkspaceNavigation \| null>\(null\)/);
  assert.match(source, /setContentNavigation\(navigation\)/);
  assert.match(source, /onNavigationApplied=\{\(\) => setContentNavigation\(null\)\}/);
  assert.match(screen, /navigation\.mode === 'compose'/);
  assert.match(screen, /setComposerClientId/);
  assert.match(screen, /setComposerItemKey\(contentComposerItemKey\(source\)\)/);
  assert.match(screen, /setComposerText\(sourceText\)/);
  assert.match(screen, /setComposerPhotos\(sourceItem \? \[\.\.\.sourceItem\.photos\] : \[\]\)/);
  assert.match(screen, /setFocusedSource\(source\)/);
  assert.match(screen, /onNavigationApplied\(\)/);
  assert.doesNotMatch(source, /localStorage\.setItem\([^\n]*contentNavigation|createObjectStore\(['"]contentNavigation/);
});

test('client Content tab uses the same compact hand-off surface', () => {
  const source = readFileSync(new URL('../src/components/TattoDiary.tsx', import.meta.url), 'utf8');
  const clientTab = source.slice(source.indexOf('function ClientContentTab({'), source.indexOf('// ── Info tab ──'));

  assert.match(source, /onTab\('content'\)/);
  assert.match(clientTab, /<ContentPanel/);
  assert.match(clientTab, /sourceType=\{source\.sourceType\}/);
  assert.doesNotMatch(clientTab, /textDraft|sendToContent|onSaveEntry|onDeleteEntry/);
});
