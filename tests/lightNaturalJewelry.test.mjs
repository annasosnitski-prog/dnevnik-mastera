import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [stoneSource, stoneCss, jewelryThemeCss, tabCss, navSource, navRevealCss, tabSource, mainSource, css, stoneSprite] = await Promise.all([
  readFile(new URL('../src/components/navigation/NaturalStoneIcon.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/navigation/NaturalStoneIcon.css', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/ui/LightJewelryTheme.css', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/client/ClientCardTabBar.css', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/navigation/NavFab.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/navigation/NavFabReveal.css', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/client/ClientCardTabBar.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/main.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/index.css', import.meta.url), 'utf8'),
  readFile(new URL('../public/mineral-cabochons.webp', import.meta.url)),
]);

const bronzeSource = stoneSource + jewelryThemeCss + tabCss;

test('light navigation assigns one natural stone to every product territory', () => {
  for (const stone of ['rhodonite', 'malachite', 'star-sapphire', 'fire-opal', 'honey-jadeite', 'turquoise']) {
    assert.match(stoneSource, new RegExp(`\\| '${stone}'|${stone}:`));
    assert.match(navSource + tabSource, new RegExp(`'${stone}'`));
  }
});

test('natural stones are round concave inserts in polished bronze, not faceted gold', () => {
  assert.match(stoneSource, /natural-stone-cabochon--concave/);
  assert.match(stoneSource, /<circle cx="32" cy="32" r=\{stoneR\}/);
  assert.match(stoneSource, /bronze-metal-/);
  assert.match(stoneSource, /flat-bronze-/);
  assert.match(stoneSource, /stone-tone-/);
  assert.doesNotMatch(stoneSource, /goldFace|quadrant|facet/);
});

test('polished bronze has one canonical light-theme token file loaded after base css', () => {
  for (const sampledTone of ['#986039', '#E9C08D', '#D29C68', '#F4D4A7', '#5B3924']) {
    assert.match(jewelryThemeCss, new RegExp(sampledTone));
  }
  const baseImport = mainSource.indexOf("import './index.css';");
  const jewelryImport = mainSource.indexOf("import './components/ui/LightJewelryTheme.css';");
  assert.ok(baseImport >= 0 && jewelryImport > baseImport, 'canonical light jewelry tokens must load after the base theme');
  assert.doesNotMatch(stoneCss, /--nav-metal\s*:|--bronze-[\w-]+\s*:/);
  assert.match(tabCss, /var\(--bronze-highlight\)/);
  assert.match(tabCss, /var\(--bronze-patina\)/);
  assert.doesNotMatch(jewelryThemeCss + tabCss, /#657C72/);
});

test('stone css does not own client-card tab-bar styling', () => {
  assert.doesNotMatch(stoneCss, /client-card-tabbar/);
  assert.match(tabSource, /import '\.\/ClientCardTabBar\.css'/);
  assert.match(tabCss, /\.client-card-tabbar::before/);
  assert.match(tabCss, /\.client-card-tabbar__tab:not\(:last-child\)::after/);
  assert.match(tabCss, /\.jewel-wire-shadow/);
  assert.match(tabCss, /\.jewel-wire-highlight/);
});

test('cabochons use six supplied mineral samples and strengthen saturation without synthetic textures', () => {
  assert.match(stoneSource, /href="\/mineral-cabochons\.webp"/);
  assert.match(stoneSource, /rhodonite: 0/);
  assert.match(stoneSource, /malachite: 1/);
  assert.match(stoneSource, /'star-sapphire': 2/);
  assert.match(stoneSource, /'fire-opal': 3/);
  assert.match(stoneSource, /'honey-jadeite': 4/);
  assert.match(stoneSource, /turquoise: 5/);
  assert.match(stoneSource, /type="saturate" values="1\.42"/);
  assert.match(stoneSource, /intercept="-\.11"/);
  assert.equal(stoneSprite.subarray(0, 4).toString(), 'RIFF');
  assert.ok(stoneSprite.length < 100_000, 'toolbar texture sprite should stay lightweight');
  assert.doesNotMatch(stoneSource, /<feTurbulence|<feDisplacementMap/);
});

test('concavity is reinforced by a bright upper inner wall, dark lower wall and floor reflection', () => {
  assert.match(stoneSource, /function StoneSurfaceLight/);
  assert.match(stoneSource, /const bevelStroke = medallion \? 1\.82 : 6\.25/);
  assert.match(stoneSource, /opacity=\{medallion \? '\.68' : '\.64'\}/);
  assert.match(stoneSource, /stone-floor-light-/);
  assert.match(stoneSource, /fill=\{`url\(#\$\{depthId\}\)`\}/);
  assert.match(stoneSource, /fill=\{`url\(#\$\{floorLightId\}\)`\}/);
});

test('the light material layer swaps visually without duplicating navigation logic', () => {
  assert.match(css, /:root\[data-theme='light'\] \.theme-dark-jewel/);
  assert.match(css, /:root\[data-theme='light'\] \.theme-light-jewel/);
  assert.match(navSource, /<PendantIcon/);
  assert.match(navSource, /<NaturalStoneIcon/);
  assert.match(tabSource, /<NaturalStoneIcon kind=\{GEM_NATURAL_STONE\[kind\]\}/);
});

test('light toolbar stones carry no navigation glyphs', () => {
  assert.match(navSource, /<NaturalStoneIcon[\s\S]*kind=\{NATURAL_STONE_BY_ITEM\[item\.id\]\}[\s\S]*size=\{ITEM_SIZE\}[\s\S]*\/>/);
  assert.doesNotMatch(navSource, /<NaturalStoneIcon[^>]*kind=\{NATURAL_STONE_BY_ITEM\[item\.id\]\}[^>]*>[\s\S]*?<GemGlyph/);
});

// The shine sweep moved off the hub/current-item and onto the engraved
// «Создать» plate only — it now lives in the fan (see NavFab.tsx), which is
// only mounted while the fan is open, instead of animating indefinitely
// behind every idle screen.
test('create plate shine follows the plate relief and only runs while the fan is open', () => {
  assert.match(stoneSource, /const isEngravedPlate = plate && Boolean\(children\)/);
  assert.match(stoneSource, /const plateShineMaskId = `bronze-plate-shine-mask-\$\{rawId\}`/);
  assert.match(stoneSource, /className="natural-stone-create-shine"/);
  assert.match(stoneSource, /<mask id=\{plateShineMaskId\}[\s\S]*r=\{outerR - 5\.55\} fill="white"/);
  assert.match(stoneSource, /<rect x="-50" y="-24" width="19" height="112"/);
  assert.match(stoneSource, /values="-50;92;92"/);
  assert.match(stoneSource, /keyTimes="0;0\.56;1"/);
  assert.match(stoneSource, /begin=\{shineDelay\}/);
  assert.match(stoneSource, /dur="9s"/);
  assert.match(stoneSource, /attributeName="opacity"[\s\S]*values="0;1;1;0;0"/);
  assert.match(stoneSource, /keyTimes="0;\.04;\.52;\.57;1"/);
  assert.match(stoneSource, /shineDelay = '0s'/);
  assert.match(stoneCss, /\.natural-stone-create-shine rect[\s\S]*filter: blur\(0\.62px\)/);
  assert.match(stoneCss, /clip-path: ellipse\(50% 90% at 50% 50%\)/);
  assert.match(stoneCss, /@keyframes natural-stone-create-spindle/);
  assert.match(stoneCss, /28%[\s\S]*transform: scaleX\(1\.16\)/);
  assert.match(stoneCss, /56%,[\s\S]*100%[\s\S]*transform: scaleX\(0\.88\)/);
  assert.match(stoneCss, /var\(--shine-delay, 0s\)/);
  assert.doesNotMatch(stoneSource, /natural-stone-home-shine|natural-stone-active-shine|activeShine/);
  assert.doesNotMatch(stoneCss, /natural-stone-home-shine|natural-stone-active-shine|--active-shine-delay/);
  assert.match(navSource, /<NaturalStoneIcon size=\{ITEM_SIZE\} plate shineDelay=\{`\$\{\(travelDelayMs \+ durationMs \+ 180\) \/ 1000\}s`\}>/);
});

test('only the current toolbar destination reads as lit — the rest sit dimmed like an unlit gem', () => {
  assert.match(css, /:root\[data-theme='light'\] \.nav-fab__item \.theme-light-jewel[\s\S]{0,80}opacity: 0\.5;[\s\S]{0,80}filter: saturate\(0\.65\) brightness\(0\.82\) contrast\(0\.96\)/);
  assert.match(css, /:root\[data-theme='light'\] \.nav-fab__item--current \.theme-light-jewel[\s\S]{0,40}opacity: 1;[\s\S]*drop-shadow\(0 0 6px color-mix/);
  assert.match(css, /:root\[data-theme='light'\] \.nav-fab__item--create \.theme-light-jewel[\s\S]{0,40}opacity: 1;[\s\S]{0,80}filter: saturate\(1\.16\) brightness\(1\.08\) contrast\(1\.05\);/);
});

test('light Create plus is engraved into the bronze plate instead of drawn as a flat glyph', () => {
  assert.match(stoneSource, /const isEngravedPlate = plate && Boolean\(children\)/);
  assert.match(stoneSource, /natural-stone-glyph--engraved/);
  assert.match(navSource, /stroke="var\(--bronze-engrave-groove\)" strokeWidth="3\.4"/);
  assert.match(navSource, /stroke="var\(--bronze-engrave-highlight\)" strokeWidth="\.72"/);
  assert.match(navSource, /stroke="var\(--bronze-engrave-shadow\)" strokeWidth="\.76"/);
  assert.match(jewelryThemeCss, /--bronze-engrave-groove:/);
  assert.match(jewelryThemeCss, /--bronze-engrave-highlight:/);
});

test('light closed hub removes the legacy rotating conic arrow layer', () => {
  assert.match(navRevealCss, /\.nav-fab:not\(\.nav-fab--open\) \.nav-fab__main--gold::after/);
  assert.match(navRevealCss, /conic-gradient/);
  assert.match(navRevealCss, /nav-fab-brushed-gold/);
  assert.match(jewelryThemeCss, /:root\[data-theme='light'\][\s\S]*\.nav-fab:not\(\.nav-fab--open\)[\s\S]*\.nav-fab__main--gold::after[\s\S]*content: none !important;[\s\S]*display: none !important;[\s\S]*background: none !important;[\s\S]*animation: none !important;/);
});

test('light client tabs use polished bronze rods, fasteners, wire and hardware reflections', () => {
  assert.match(tabCss, /\.client-card-tabbar::before/);
  assert.match(tabCss, /\.client-card-tabbar__tab:not\(:last-child\)::after/);
  assert.match(tabCss, /\.jewel-wire-shadow/);
  assert.match(tabCss, /\.jewel-wire-highlight/);
  assert.match(bronzeSource, /#E9C08D/);
});

test('master two-pendant geometry is explicit and gradient ids are instance-safe', () => {
  assert.match(tabSource, /function isMasterDashboardPair/);
  assert.match(tabSource, /tabs\[0\]\?\.kind === 'info'/);
  assert.match(tabSource, /tabs\[1\]\?\.kind === 'projects'/);
  assert.match(tabSource, /const hasTwoPendantRays = isMasterDashboardPair\(tabs\)/);
  assert.match(tabSource, /function TwoPendantRays\(\)/);
  assert.match(tabSource, /const rawId = useId\(\)\.replace\(\/:\/g, ''\)/);
  assert.match(tabSource, /two-pendant-ray-metal-\$\{rawId\}/);
  assert.match(tabSource, /two-pendant-ray-sheen-\$\{rawId\}/);
  assert.doesNotMatch(tabSource, /id="twoPendantRayMetal"|id="twoPendantRaySheen"/);
  assert.match(tabSource, /style=\{\{ fill: `url\(#\$\{metalId\}\)` \}\}/);
  assert.match(tabSource, /style=\{\{ fill: `url\(#\$\{sheenId\}\)` \}\}/);
  assert.match(tabSource, /viewBox="0 0 1000 12"/);
  assert.match(tabSource, /M0 5 L0 7 L250 6\.3 L250 5\.7 Z/);
  assert.match(tabSource, /M250 5\.7 Q500 4\.6 750 5\.7/);
  assert.match(tabSource, /M750 5\.7 L750 6\.3 L1000 7 L1000 5 Z/);
  assert.match(tabSource, /data-two-pendant-rays=\{hasTwoPendantRays \? 'true' : undefined\}/);
  assert.match(jewelryThemeCss, /--two-pendant-ray-highlight: var\(--bronze-specular\)/);
  assert.match(css, /\[data-minimalism='true'\][\s\S]*\.client-card-tabbar__two-pendant-rays[\s\S]*display: none/);
});
