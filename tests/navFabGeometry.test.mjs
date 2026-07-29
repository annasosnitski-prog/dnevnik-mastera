import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function readSource(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n?/g, '\n');
}

const navSource = readSource('../src/components/navigation/NavFab.tsx');
const iconSource = readSource('../src/components/navigation/ToolbarIcons.tsx');
const cssSource = readSource('../src/index.css');

test('NavFab keeps the fixed right-handed 180-degree crown', () => {
  assert.match(navSource, /gear: \{ angleDeg: 180, radius: 116 \}/);
  assert.match(navSource, /clients: \{ angleDeg: 155, radius: 170 \}/);
  assert.match(navSource, /brush: \{ angleDeg: 135, radius: 220 \}/);
  assert.match(navSource, /create: \{ angleDeg: 110, radius: 0 \}/);
  assert.match(navSource, /profile: \{ angleDeg: 60, radius: 150 \}/);
  assert.match(navSource, /sketchbook: \{ angleDeg: 35, radius: 116 \}/);
  assert.match(navSource, /content: \{ angleDeg: 0, radius: 82 \}/);
});

test('NavFab exposes the agreed destination names in crown order', () => {
  for (const label of ['Личный кабинет', 'Клиенты', 'Проекты', 'Админка', 'Заметки', 'Бот']) {
    assert.match(navSource, new RegExp(`label: "${label}"`));
  }
  assert.match(navSource, /<span className="nav-fab__main-label">МЕНЮ<\/span>/);
});

test('the four navigation buttons use the agreed pictograms', () => {
  assert.match(iconSource, /case "profile":\s*return <JewelryTattooMachineIcon/);
  assert.match(iconSource, /case "gear":\s*return <JewelryKeyIcon/);
  assert.match(iconSource, /case "clients":\s*return <JewelryPersonIcon/);
  assert.match(iconSource, /case "brush":\s*return <JewelryAtomIcon/);
});

test('the long create ray adapts to height and stays inside narrow screens', () => {
  assert.match(navSource, /const CREATE_VERTICAL_REACH = 0\.62/);
  assert.match(navSource, /viewport\.height \* CREATE_VERTICAL_REACH/);
  assert.match(navSource, /viewport\.width \/ 2 - ITEM_HALF - FAN_EDGE_GAP/);
});

test('the hub stays centred above the system home safe area', () => {
  assert.match(cssSource, /\.nav-fab \{[\s\S]*?left: 50%;[\s\S]*?bottom: calc\(58px \+ env\(safe-area-inset-bottom, 0px\)\);/);
});
