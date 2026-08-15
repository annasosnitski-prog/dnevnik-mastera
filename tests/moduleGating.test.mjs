import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Слой активации модулей (см. modules/registry.ts, docs-задача «Module
// Registry»). Опасность здесь — источник тех же тихих поломок, что и у
// остальных source-grep тестов в проекте: если экран перестанет быть
// прогейтен флагом, отключение модуля перестанет прятать его lazy-чанк.

function readSource(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n?/g, '\n');
}

const app = readSource('../src/components/TattoDiary.tsx');
const navFab = readSource('../src/components/navigation/NavFab.tsx');
const settings = readSource('../src/components/screens/SettingsScreen.tsx');

test('экраны-модули не рендерятся, пока их флаг выключен', () => {
  assert.match(app, /screen === 'content' && masterInfo\.modules\.content && \(/);
  assert.match(app, /screen === 'admin' && masterInfo\.modules\.adminka && \(/);
  assert.match(app, /screen === 'workshop' && masterInfo\.modules\.workshop && \(/);
  assert.match(app, /screen === 'summary' && masterInfo\.modules\.planner && \(/);
});

test('«Личный кабинет» не гасится флагом adminka — это единственная дверь к «Настройкам»', () => {
  // Иначе выключение admINKA лишило бы мастера способа снова его включить:
  // тогглы модулей живут в SettingsScreen, а туда попадают только отсюда.
  assert.match(app, /screen === 'master' && \(/);
  assert.doesNotMatch(app, /screen === 'master' && masterInfo\.modules/);
});

test('NavFab прячет вкладку выключенного модуля и не трогает ядро', () => {
  const items = navFab.slice(navFab.indexOf('const NAV_ITEMS = ['), navFab.indexOf('] as const;'));
  assert.match(items, /id: "clients"[\s\S]*?moduleKey: null/);
  assert.match(items, /id: "gear"[\s\S]*?moduleKey: null/);
  assert.match(items, /id: "content"[\s\S]*?moduleKey: "content"/);
  assert.match(items, /id: "brush"[\s\S]*?moduleKey: "workshop"/);
  assert.match(items, /id: "sketchbook"[\s\S]*?moduleKey: "planner"/);
  assert.match(items, /id: "profile"[\s\S]*?moduleKey: "adminka"/);
  assert.match(navFab, /const fanEntries: FanEntry\[\] = allFanEntries\.filter\(\(entry\) => entry\.kind !== "nav" \|\| isNavItemVisible\(entry\.item\)\)/);
  assert.match(app, /moduleFlags=\{masterInfo\.modules\}/);
});

test('тогглы модулей в «Настройках» читают и пишут через masterInfo.modules', () => {
  assert.match(settings, /MODULE_REGISTRY\.map\(\(m\) => \{/);
  assert.match(settings, /const active = masterInfo\.modules\[m\.key\]/);
  assert.match(settings, /onChangeMasterInfo\(\{ \.\.\.masterInfo, modules: \{ \.\.\.masterInfo\.modules, \[m\.key\]: !active \} \}\)/);
  assert.match(app, /onChangeMasterInfo=\{setMasterInfo\}/);
});

test('ядро (клиенты → проекты → сессии → консультации) не входит в реестр модулей', () => {
  const registry = readSource('../src/modules/registry.ts');
  assert.doesNotMatch(registry, /'core'|"core"/);
});
