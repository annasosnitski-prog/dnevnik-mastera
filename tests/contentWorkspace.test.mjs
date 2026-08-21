import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  contentComposerItemKey,
  findLinkedContentEntries,
  selectContentWorkspaceEntries,
  resolveContentFocusEntry,
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
  const screen = readFileSync(new URL('../src/components/screens/ContentINKAScreen.tsx', import.meta.url), 'utf8');

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

test('resolveContentFocusEntry finds the entry by id regardless of sourceType/clientId', () => {
  const found = resolveContentFocusEntry(entries, 'freeform');
  assert.equal(found?.id, 'freeform');
});

test('resolveContentFocusEntry returns null for a null focusEntryId (nothing requested)', () => {
  assert.equal(resolveContentFocusEntry(entries, null), null);
});

test('resolveContentFocusEntry returns null for a deleted/missing entry id (safe fallback)', () => {
  assert.equal(resolveContentFocusEntry(entries, 'entry-does-not-exist'), null);
});

test('resolveContentFocusEntry does not mutate the entries array', () => {
  const snapshot = structuredClone(entries);
  resolveContentFocusEntry(entries, 'session-old');
  assert.deepEqual(entries, snapshot);
});

test('a click on a project-content card passes the entry.id as a focus target, and ContentINKAScreen applies it', () => {
  const source = readFileSync(new URL('../src/components/TattoDiary.tsx', import.meta.url), 'utf8');
  const screen = readFileSync(new URL('../src/components/screens/ContentINKAScreen.tsx', import.meta.url), 'utf8');

  // ProjectViewSheet passes the clicked entry's own id, not just a generic
  // "open the content screen" call.
  assert.match(source, /onOpenContentEntry=\{\(entry\) => \{[\s\S]*?setContentFocusEntryId\(entry\.id\)/);
  // ContentINKAScreen receives it, resolves it via the shared pure helper
  // (not a second ad-hoc lookup), and clears it back to null once applied —
  // same transient, non-persisted pattern as ContentWorkspaceNavigation.
  assert.match(screen, /resolveContentFocusEntry\(contentEntries, focusEntryId\)/);
  assert.match(screen, /onFocusEntryApplied\(\)/);
  assert.match(source, /onFocusEntryApplied=\{\(\) => setContentFocusEntryId\(null\)\}/);
  // The ordinary "open the ContentINKA section" entry points (dashboard,
  // ContentPanel hand-off) are untouched — they still only flip the screen.
  assert.match(source, /onOpenContent=\{\(\) => setScreen\('content'\)\}/);
});

test('opening a removed-from-workspace entry via focusEntryId keeps it visible after the one-shot command is cleared', () => {
  // Regression test: focusEntryId is a one-shot command that the parent
  // clears (onFocusEntryApplied → setContentFocusEntryId(null)) in the same
  // React 18 update batch as the effect's own setState calls below — so a
  // workspaceEntries filter keyed only on the live focusEntryId prop loses
  // the just-revealed entry in the very render meant to show it. A deleted-
  // but-linked entry opened from its project/session card (see previous
  // test) would therefore never actually appear — POSTiNKA just showed an
  // empty "new entry" composer instead, which is what this bug looked like
  // to a master who had deleted that content from her feed first.
  const screen = readFileSync(new URL('../src/components/screens/ContentINKAScreen.tsx', import.meta.url), 'utf8');
  const focusEffect = screen.slice(
    screen.indexOf('useEffect(() => {\n    if (!focusEntryId) return;'),
    screen.indexOf('}, [contentEntries, focusEntryId, onFocusEntryApplied]);'),
  );

  // The effect must record the resolved target into state that survives
  // focusEntryId being reset to null, not just the transient highlight.
  assert.match(focusEffect, /set\w*(?:Reveal|Focus)\w*Id\(target\.id\)/);

  const revealStateSetterMatch = focusEffect.match(/set(\w*(?:Reveal|Focus)\w*Id)\(target\.id\)/);
  assert.ok(revealStateSetterMatch, 'expected the effect to persist the resolved target id into its own state');
  const revealStateName = revealStateSetterMatch[1][0].toLowerCase() + revealStateSetterMatch[1].slice(1);

  // workspaceEntries must keep a removedFromWorkspace entry visible via that
  // durable state, not only via the live (already-cleared) focusEntryId prop.
  const workspaceEntriesLine = screen.slice(
    screen.indexOf('const workspaceEntries = contentEntries.filter('),
    screen.indexOf(');', screen.indexOf('const workspaceEntries = contentEntries.filter(')),
  );
  assert.match(workspaceEntriesLine, /entry\.id === focusEntryId/);
  assert.match(workspaceEntriesLine, new RegExp(`entry\\.id === ${revealStateName}`));
});

test('client Content tab uses the same compact hand-off surface', () => {
  // DetailScreen и его вкладки (включая ClientContentTab) вынесены в
  // отдельный модуль (PR 11 рефакторинга) — читаем оттуда.
  const source = readFileSync(new URL('../src/components/screens/DetailScreen.tsx', import.meta.url), 'utf8');
  const clientTab = source.slice(source.indexOf('function ClientContentTab({'), source.indexOf('// ── Info tab ──'));

  // Строка вкладок теперь строится из данных (см. clientTabGems.test.mjs) —
  // «Контент» задаётся записью в CLIENT_TABS, а не отдельным onClick.
  assert.match(source, /\{ id: 'content', kind: 'content', label: 'Контент' \}/);
  assert.match(clientTab, /<ContentPanel/);
  assert.match(clientTab, /sourceType=\{source\.sourceType\}/);
  assert.doesNotMatch(clientTab, /textDraft|sendToContent|onSaveEntry|onDeleteEntry/);
});
