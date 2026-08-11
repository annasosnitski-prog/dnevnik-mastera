import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [stoneSource, navSource, tabSource, css] = await Promise.all([
  readFile(new URL('../src/components/navigation/NaturalStoneIcon.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/navigation/NavFab.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/client/ClientCardTabBar.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/index.css', import.meta.url), 'utf8'),
]);

test('light navigation assigns one natural cabochon to every product territory', () => {
  for (const stone of ['rhodonite', 'malachite', 'star-sapphire', 'fire-opal', 'honey-jadeite', 'turquoise']) {
    assert.match(stoneSource, new RegExp(`\\| '${stone}'|${stone}:`));
    assert.match(navSource + tabSource, new RegExp(`'${stone}'`));
  }
});

test('natural stones are polished round cabochons in patinated copper, not faceted gold', () => {
  assert.match(stoneSource, /className="natural-stone-cabochon"/);
  assert.match(stoneSource, /<circle cx="32" cy="32" r=\{stoneR\}/);
  assert.match(stoneSource, /copper-metal-/);
  assert.match(stoneSource, /#657C72/);
  assert.doesNotMatch(stoneSource, /goldFace|quadrant|facet/);
});

test('metal-only controls use a flat copper face with verdigris confined to recesses', () => {
  assert.match(stoneSource, /flat-copper-/);
  assert.match(stoneSource, /fill={`url\(#\$\{flatId\}\)`}/);
  assert.match(stoneSource, /stroke="#657C72"/);
  assert.doesNotMatch(stoneSource, /rx="11" ry="5\.5" fill="#FFFFFF"/);
});

test('copper matches the muted background ornaments and avoids the former red-orange metal', () => {
  for (const sampledTone of ['#94694E', '#A2775A', '#724C39', '#543323', '#CC9D75']) {
    assert.match(stoneSource + css, new RegExp(sampledTone));
  }
  assert.doesNotMatch(stoneSource + css, /#E4A66F|#A55C38|#B36B43/);
});

test('five revised stones use irregular mineral structure while malachite keeps its approved drawing', () => {
  assert.match(stoneSource, /<feTurbulence/);
  assert.match(stoneSource, /<feDisplacementMap/);
  assert.match(stoneSource, /opacity="\.44" style=\{\{ mixBlendMode: 'soft-light' \}\}/);
  assert.match(stoneSource, /stroke="#C7C5FF"/);
  assert.match(stoneSource, /stroke="#9CEB9F"/);
  assert.match(stoneSource, /fill="#6E5117" opacity="\.34"/);
  assert.match(stoneSource, /fill="#8DF3EC" transform="rotate\(-17 18 19\)"/);
  assert.match(stoneSource, /case 'malachite':[\s\S]*?rx="25" ry="15"[\s\S]*?stroke="#053D2B"/);
  assert.match(stoneSource, /case 'malachite':[\s\S]*?stroke="#3EBD78"/);
  assert.match(stoneSource, /case 'malachite':[\s\S]*?stroke="#7ED39D"/);
});

test('all cabochons use a dome-curved highlight with a soft band, sharp core and lower reflection', () => {
  assert.match(stoneSource, /function StoneSurfaceLight/);
  assert.match(stoneSource, /M14\.8 27\.6C17\.5 18\.4 26\.1 12\.4 35\.8 12\.9/);
  assert.match(stoneSource, /strokeWidth=\{medallion \? '1\.35' : '4\.8'\}/);
  assert.match(stoneSource, /strokeWidth=\{medallion \? '\.62' : '1\.65'\}/);
  assert.match(stoneSource, /strokeWidth=\{medallion \? '\.28' : '\.58'\}/);
  assert.match(stoneSource, /M47\.9 41\.8C44\.9 47\.3 39\.2 51 32\.9 52\.1/);
  assert.match(stoneSource, /fill=\{`url\(#\$\{depthId\}\)`\}/);
});

test('the light material layer swaps visually without duplicating navigation logic', () => {
  assert.match(css, /:root\[data-theme='light'\] \.theme-dark-jewel/);
  assert.match(css, /:root\[data-theme='light'\] \.theme-light-jewel/);
  assert.match(navSource, /<PendantIcon/);
  assert.match(navSource, /<NaturalStoneIcon/);
  assert.match(tabSource, /backgroundImage: 'url\(\/gem-icons\.svg\)'/);
  assert.match(tabSource, /<NaturalStoneIcon kind=\{GEM_NATURAL_STONE\[kind\]\}/);
});

test('light toolbar stones stay vivid and carry no navigation glyphs', () => {
  assert.match(navSource, /<NaturalStoneIcon kind=\{NATURAL_STONE_BY_ITEM\[item\.id\]\} size=\{ITEM_SIZE\} \/>/);
  assert.doesNotMatch(
    navSource,
    /<NaturalStoneIcon kind=\{NATURAL_STONE_BY_ITEM\[item\.id\]\}[^>]*>[\s\S]*?<GemGlyph/,
  );
  assert.match(css, /:root\[data-theme='light'\] \.nav-fab__item \.theme-light-jewel \{[\s\S]*?opacity: 1;[\s\S]*?brightness\(1\.08\)/);
  assert.doesNotMatch(css, /\.nav-fab__item:not\(\.nav-fab__item--current\) \.theme-light-jewel/);
});

test('current toolbar destination gets a stronger material-coloured halo in both themes', () => {
  assert.match(navSource, /filter: isCurrentItem[\s\S]*?drop-shadow\(0 0 28px/);
  assert.match(css, /:root\[data-theme='light'\] \.nav-fab__item--current::before/);
  assert.match(css, /drop-shadow\(0 0 26px color-mix/);
});

test('light client tabs add a patinated copper rod, fasteners and hardware reflections', () => {
  assert.match(css, /\.client-card-tabbar::before/);
  assert.match(css, /\.client-card-tabbar__tab:not\(:last-child\)::after/);
  assert.match(css, /\.jewel-wire-shadow/);
  assert.match(css, /\.jewel-wire-highlight/);
  assert.match(css, /#CC9D75/);
  assert.match(css, /#657C72/);
});

test('two-medallion tab bar uses three thin theme-aware rays joined at both jump rings', () => {
  assert.match(tabSource, /function TwoPendantRays\(\)/);
  assert.match(tabSource, /viewBox="0 0 1000 12"/);
  assert.match(tabSource, /M0 5 L0 7 L250 6\.3 L250 5\.7 Z/);
  assert.match(tabSource, /M250 5\.7 Q500 4\.6 750 5\.7/);
  assert.match(tabSource, /M750 5\.7 L750 6\.3 L1000 7 L1000 5 Z/);
  assert.match(tabSource, /data-two-pendant-rays=\{hasTwoPendantRays \? 'true' : undefined\}/);
  assert.match(css, /\.client-card-tabbar\[data-two-pendant-rays='true'\]::before/);
  assert.match(css, /left: 8px;[\s\S]*width: calc\(100% - 16px\)/);
  assert.match(css, /upper inside edge of each jump-ring opening[\s\S]*top: -13px/);
  assert.match(tabSource, /stopColor="var\(--two-pendant-ray-highlight\)"/);
  assert.match(css, /--two-pendant-ray-highlight: #FFF0B3/);
  assert.match(css, /:root\[data-theme='light'\][\s\S]*--two-pendant-ray-highlight: #CC9D75/);
  assert.match(css, /\[data-minimalism='true'\][\s\S]*\.client-card-tabbar__two-pendant-rays[\s\S]*display: none/);
});
