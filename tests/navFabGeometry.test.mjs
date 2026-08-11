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

// Веер раскрывается полным кругом вокруг хаба (PR #238 «Круглые gem-вкладки»),
// а не полуэллипсом, как в первой версии: один радиус вместо пары X/Y, шаг —
// полный оборот, делённый на число пунктов, старт — от «12 часов» (-90°).
// Раньше тест описывал именно ту, уже заменённую геометрию (ARC_SPAN_DEG 180,
// FAN_RADIUS_X/Y 128×172, arcOffset) и с #238 висел красным.
test('NavFab spreads the fan evenly around a full circle at one radius', () => {
  assert.match(navSource, /const FAN_RADIUS = \d+/);
  // Равномерный шаг по всему кругу: 2π, делённые на общее число пунктов.
  assert.match(navSource, /const angle = -Math\.PI \/ 2 \+ \(index \* Math\.PI \* 2\) \/ total/);
  // Одна и та же величина по обеим осям — круг, а не эллипс.
  assert.match(navSource, /dx: Math\.round\(Math\.cos\(angle\) \* FAN_RADIUS\)/);
  assert.match(navSource, /dy: Math\.round\(Math\.sin\(angle\) \* FAN_RADIUS\)/);
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

test('the hub sits near the bottom viewport edge without clipping off it', () => {
  // 34px clears the closed hub's own 27px radius (plus its glow) by a few
  // px — enough to stay fully on-screen while still reading as pinned to
  // the very bottom, with the device safe area added on top of that.
  assert.match(cssSource, /\.nav-fab \{[\s\S]*?bottom: calc\(34px \+ env\(safe-area-inset-bottom, 0px\)\)/);
});
