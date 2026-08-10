import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Каркас вкладок вынесен в общий модуль (PR «карточка клиента ↔ Личный
// кабинет мастера») — используется и DetailScreen'ом, и MasterDashboardScreen
// (TattoDiary.tsx), поэтому сама sprite-математика теперь читается оттуда, а
// не из DetailScreen.tsx.
const tabBarModule = readFileSync(
  new URL('../src/components/client/ClientCardTabBar.tsx', import.meta.url),
  'utf8',
);
const detailScreen = readFileSync(
  new URL('../src/components/screens/DetailScreen.tsx', import.meta.url),
  'utf8',
);
const tattoDiary = readFileSync(new URL('../src/components/TattoDiary.tsx', import.meta.url), 'utf8');
const gemSprite = readFileSync(new URL('../public/gem-icons.svg', import.meta.url), 'utf8');

test('each client tab crops exactly one tile from the shared gemstone sprite', () => {
  assert.doesNotMatch(tabBarModule, /gem-icons\.svg#/);
  assert.match(tabBarModule, /backgroundImage: 'url\(\/gem-icons\.svg\)'/);
  assert.match(tabBarModule, /backgroundSize: `\$\{GEM_SIZE \* 6\}px \$\{GEM_SIZE\}px`/);
  // gemKind (defaults to kind) — the sprite slot; kind alone still drives
  // colour/Минимализм icon (see «карточка клиента swaps only its ornate
  // gem» below).
  assert.match(tabBarModule, /backgroundPosition: `\$\{-GEM_INDEX\[gemKind\] \* GEM_SIZE\}px 0`/);
});

test('only the client card swaps its ornate Инфо/Проекты gems — Минимализм colour/icon and Личный кабинет stay unswapped', () => {
  assert.match(
    tabBarModule,
    /function clientOrnateGemKind\(kind: ClientTabIconName, clientTabs: boolean\): ClientTabIconName \{\s*if \(!clientTabs\) return kind;\s*if \(kind === 'projects'\) return 'info';\s*if \(kind === 'info'\) return 'projects';\s*return kind;\s*\}/,
  );
  assert.match(tabBarModule, /const clientTabs = ariaLabel === 'Разделы клиента';/);
  // Минимализм's icon/colour always key off kind, never the swapped gemKind.
  assert.match(tabBarModule, /const color = GEM_COLOR\[kind\];/);
  assert.match(tabBarModule, /<ClientTabIcon name=\{kind\} size=\{26\} \/>/);
});

test('all six tabs keep the same order as the six tiles in gem-icons.svg', () => {
  assert.match(
    tabBarModule,
    /const GEM_INDEX: Record<ClientTabIconName, number> = \{\s*sessions: 0,\s*consultations: 1,\s*content: 2,\s*notes: 3,\s*info: 4,\s*projects: 5,/s,
  );

  assert.match(gemSprite, /width="384"[\s\S]*height="64"[\s\S]*viewBox="0 0 384 64"/);
  assert.match(gemSprite, /id="sessions-icon"/);
  assert.match(gemSprite, /id="consultations-icon"[\s\S]*transform="translate\(64 0\)"/);
  assert.match(gemSprite, /id="content-icon"[\s\S]*transform="translate\(128 0\)"/);
  assert.match(gemSprite, /id="notes-icon"[\s\S]*transform="translate\(192 0\)"/);
  assert.match(gemSprite, /id="info-icon"[\s\S]*transform="translate\(256 0\)"/);
  assert.match(gemSprite, /id="projects-icon"[\s\S]*transform="translate\(320 0\)"/);
});

test('the client card wires its six tabs (Проекты included) in gem order via the shared tab bar', () => {
  assert.match(detailScreen, /<ClientCardTabBar tabs=\{CLIENT_TABS\} activeTab=\{activeTab\} onTab=\{onTab\}/);
  const listMatch = detailScreen.match(/const CLIENT_TABS: ClientCardTabDef<[^>]+>\[\] = \[([\s\S]*?)\];/);
  assert.ok(listMatch, 'CLIENT_TABS array not found');
  const ids = [...listMatch[1].matchAll(/\{ id: '([^']+)', kind: '([^']+)'/g)].map(([, id, kind]) => [id, kind]);
  assert.deepEqual(ids, [
    ['sessions', 'sessions'],
    ['consultations', 'consultations'],
    ['content', 'content'],
    ['extra', 'notes'],
    ['info', 'info'],
    ['projects', 'projects'],
  ]);
});

test('Личный кабинет мастера reuses the same shared tab bar (Инфо/Проекты)', () => {
  assert.match(tattoDiary, /<ClientCardTabBar tabs=\{MASTER_TABS\} activeTab=\{tab\} onTab=\{setTab\}/);
  const listMatch = tattoDiary.match(/const MASTER_TABS: ClientCardTabDef<[^>]+>\[\] = \[([\s\S]*?)\];/);
  assert.ok(listMatch, 'MASTER_TABS array not found');
  const ids = [...listMatch[1].matchAll(/\{ id: '([^']+)', kind: '([^']+)'/g)].map(([, id, kind]) => [id, kind]);
  assert.deepEqual(ids, [
    ['info', 'info'],
    ['projects', 'projects'],
  ]);
});
