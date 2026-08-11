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

test('natural stones are polished round cabochons in oxidised silver, not faceted gold', () => {
  assert.match(stoneSource, /className="natural-stone-cabochon"/);
  assert.match(stoneSource, /<circle cx="32" cy="32" r=\{stoneR\}/);
  assert.match(stoneSource, /#080A0B/);
  assert.match(stoneSource, /#F8FBFC/);
  assert.doesNotMatch(stoneSource, /goldFace|quadrant|facet/);
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

test('light client tabs add a silver rod, fasteners and silver hardware reflections', () => {
  assert.match(css, /\.client-card-tabbar::before/);
  assert.match(css, /\.client-card-tabbar__tab:not\(:last-child\)::after/);
  assert.match(css, /\.jewel-wire-shadow/);
  assert.match(css, /\.jewel-wire-highlight/);
  assert.match(css, /#F7FAFB/);
});
