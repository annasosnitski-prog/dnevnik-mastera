import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [stoneSource, bronzeCss, navSource, tabSource, css, stoneSprite] = await Promise.all([
  readFile(new URL('../src/components/navigation/NaturalStoneIcon.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/navigation/NaturalStoneIcon.css', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/navigation/NavFab.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/client/ClientCardTabBar.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/index.css', import.meta.url), 'utf8'),
  readFile(new URL('../public/mineral-cabochons.webp', import.meta.url)),
]);

const lightJewelryCss = css + bronzeCss;

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

test('polished bronze uses warm high-contrast highlights with minimal patina', () => {
  for (const sampledTone of ['#A86531', '#F4CB91', '#E2A35F', '#663317', '#F3C98F']) {
    assert.match(stoneSource + bronzeCss, new RegExp(sampledTone));
  }
  assert.match(bronzeCss, /jewel-wire-patina[\s\S]*#63361D/);
  assert.doesNotMatch(bronzeCss, /#657C72/);
});

test('cabochons use six supplied mineral samples and strengthen saturation without synthetic textures', () => {
  assert.match(stoneSource, /href="\/mineral-cabochons\.webp"/);
  assert.match(stoneSource, /rhodonite: 0, \/\/ rose quartz/);
  assert.match(stoneSource, /malachite: 1/);
  assert.match(stoneSource, /'star-sapphire': 2, \/\/ amethyst/);
  assert.match(stoneSource, /'fire-opal': 3, \/\/ amber/);
  assert.match(stoneSource, /'honey-jadeite': 4, \/\/ tiger's eye/);
  assert.match(stoneSource, /turquoise: 5, \/\/ blue agate/);
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
  assert.match(navSource, /<NaturalStoneIcon kind=\{NATURAL_STONE_BY_ITEM\[item\.id\]\} size=\{ITEM_SIZE\} \/>/);
  assert.doesNotMatch(
    navSource,
    /<NaturalStoneIcon kind=\{NATURAL_STONE_BY_ITEM\[item\.id\]\}[^>]*>[\s\S]*?<GemGlyph/,
  );
});

test('the light-theme home plate alone gets a clipped diagonal top-right to bottom-left travelling shine', () => {
  assert.match(stoneSource, /const isHomePlate = plate && !children/);
  assert.match(stoneSource, /className="natural-stone-home-shine"/);
  assert.match(stoneSource, /transform="rotate\(-45 32 32\)"/);
  assert.match(stoneSource, /values="78;78;-34;-34"/);
  assert.match(stoneSource, /clipPath=\{`url\(#\$\{plateClipId\}\)`\}/);
  assert.match(bronzeCss, /prefers-reduced-motion[\s\S]*natural-stone-home-shine/);
});

test('light client tabs use polished bronze rods, fasteners, wire and hardware reflections', () => {
  assert.match(lightJewelryCss, /\.client-card-tabbar::before/);
  assert.match(lightJewelryCss, /\.client-card-tabbar__tab:not\(:last-child\)::after/);
  assert.match(bronzeCss, /\.jewel-wire-shadow/);
  assert.match(bronzeCss, /\.jewel-wire-highlight/);
  assert.match(bronzeCss, /#F3C98F/);
});

test('two-medallion tab bar keeps three theme-aware rays joined at both jump rings', () => {
  assert.match(tabSource, /function TwoPendantRays\(\)/);
  assert.match(tabSource, /viewBox="0 0 1000 12"/);
  assert.match(tabSource, /M0 5 L0 7 L250 6\.3 L250 5\.7 Z/);
  assert.match(tabSource, /M250 5\.7 Q500 4\.6 750 5\.7/);
  assert.match(tabSource, /M750 5\.7 L750 6\.3 L1000 7 L1000 5 Z/);
  assert.match(tabSource, /data-two-pendant-rays=\{hasTwoPendantRays \? 'true' : undefined\}/);
  assert.match(tabSource, /stopColor="var\(--two-pendant-ray-highlight\)"/);
  assert.match(bronzeCss, /--two-pendant-ray-highlight: #F7D39F/);
  assert.match(css, /\[data-minimalism='true'\][\s\S]*\.client-card-tabbar__two-pendant-rays[\s\S]*display: none/);
});
