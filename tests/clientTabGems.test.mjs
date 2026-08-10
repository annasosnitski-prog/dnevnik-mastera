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
const navFab = readFileSync(new URL('../src/components/navigation/NavFab.tsx', import.meta.url), 'utf8');
const designTokens = readFileSync(new URL('../src/components/ui/designTokens.ts', import.meta.url), 'utf8');

test('each client tab crops exactly one tile from the shared gemstone sprite', () => {
  assert.doesNotMatch(tabBarModule, /gem-icons\.svg#/);
  assert.match(tabBarModule, /backgroundImage: 'url\(\/gem-icons\.svg\)'/);
  assert.match(tabBarModule, /backgroundSize: `\$\{GEM_SIZE \* 6\}px \$\{GEM_SIZE\}px`/);
  assert.match(tabBarModule, /backgroundPosition: `\$\{-GEM_INDEX\[kind\] \* GEM_SIZE\}px 0`/);
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

test('toolbar and client tabs share one semantic colour palette', () => {
  assert.match(designTokens, /clients: '#5CFF24'/);
  assert.match(designTokens, /personal: '#FFE000'/);
  assert.match(designTokens, /content: '#C12FFF'/);
  assert.match(designTokens, /projects: '#0047AB'/);
  assert.match(designTokens, /notes: '#FF8900'/);
  assert.match(designTokens, /admin: '#FF3342'/);

  assert.match(navFab, /label: "Проекты"[\s\S]*?color: TERRITORY_COLORS\.projects/);
  assert.match(tabBarModule, /sessions: TERRITORY_COLORS\.admin/);
  assert.match(tabBarModule, /consultations: TERRITORY_COLORS\.clients/);
  assert.match(tabBarModule, /info: TERRITORY_COLORS\.personal/);
  assert.match(tabBarModule, /projects: TERRITORY_COLORS\.projects/);
  assert.doesNotMatch(tabBarModule, /clientOrnateGemKind|gemKind/);
});

test('ornate tabs use the main-button gold material and a one-sixth centre stone', () => {
  assert.match(gemSprite, /id="gold-face"[\s\S]*stop-color="#FFF8D7"[\s\S]*stop-color="#431A00"/);
  assert.match(gemSprite, /id="gold-medallion"[\s\S]*scale\(\.724138\)[\s\S]*r="29" fill="url\(#gold-face\)"/);
  assert.equal((gemSprite.match(/r="5\.333333"/g) ?? []).length, 3);
  assert.match(gemSprite, /id="sessions-icon" color="#FF3342"/);
  assert.match(gemSprite, /id="consultations-icon" color="#5CFF24"/);
  assert.match(gemSprite, /id="info-icon" color="#FFE000"/);
  assert.match(gemSprite, /id="projects-icon" color="#0047AB"/);
});

test('tab medallions shrink inside their fixed slots without an active underline', () => {
  assert.match(tabBarModule, /const GEM_SIZE = 54/);
  assert.match(tabBarModule, /width: GEM_SIZE,[\s\S]*height: GEM_SIZE/);
  assert.doesNotMatch(tabBarModule, /borderBottom:\s*isActive/);
  assert.doesNotMatch(tabBarModule, /tabButtonStyle\(activeTab === tab\.id\)/);
});

test('client tabs hang from a gold tube carrying the client-colour reflection', () => {
  assert.match(detailScreen, /height: 8,[\s\S]*borderRadius: 999/);
  assert.match(detailScreen, /#FFD777[\s\S]*#FFF8D7[\s\S]*#431A00/);
  assert.match(detailScreen, /color-mix\(in srgb, \$\{client\.color\}[\s\S]*mixBlendMode: 'screen'/);
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
