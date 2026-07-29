import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function readSource(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n?/g, '\n');
}

const navSource = readSource('../src/components/navigation/NavFab.tsx');
const iconSource = readSource('../src/components/navigation/ToolbarIcons.tsx');
const appSource = readSource('../src/components/TattoDiary.tsx');
const cssSource = readSource('../src/index.css');

test('NavFab uses one radius and equal spacing across a semicircle', () => {
  assert.match(navSource, /const ARC_SPAN_DEG = 180/);
  assert.match(navSource, /const FAN_RADIUS = 128/);
  assert.match(navSource, /ARC_SPAN_DEG - i \* \(ARC_SPAN_DEG \/ \(fanEntries\.length - 1\)\)/);
  assert.match(navSource, /arcOffset\(angleDeg, FAN_RADIUS\)/);
});

test('NavFab exposes the renamed destinations', () => {
  assert.match(navSource, /label: "Личный кабинет"/);
  assert.match(navSource, /label: "Проекты"/);
  assert.match(navSource, /label: "Клиенты"/);
  assert.match(navSource, /label: "Админка"/);
  assert.match(appSource, />\s*Личный кабинет\s*<\/div>/);
});

test('the four navigation buttons use the requested SVG pictograms', () => {
  assert.match(iconSource, /case "profile":\s*return <JewelryTattooMachineIcon/);
  assert.match(iconSource, /case "gear":\s*return <JewelryKeyIcon/);
  assert.match(iconSource, /case "clients":\s*return <JewelryPersonIcon/);
  assert.match(iconSource, /case "brush":\s*return <JewelryAtomIcon/);
});

test('the horizontal fan buttons stay above the bottom viewport edge', () => {
  assert.match(cssSource, /\.nav-fab \{[\s\S]*?bottom: calc\(70px \+ env\(safe-area-inset-bottom, 0px\)\)/);
});
