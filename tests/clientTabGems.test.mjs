import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const detailScreen = readFileSync(
  new URL('../src/components/screens/DetailScreen.tsx', import.meta.url),
  'utf8',
);
const gemSprite = readFileSync(new URL('../public/gem-icons.svg', import.meta.url), 'utf8');

test('each client tab crops exactly one tile from the shared gemstone sprite', () => {
  assert.doesNotMatch(detailScreen, /gem-icons\.svg#/);
  assert.match(detailScreen, /backgroundImage: 'url\(\/gem-icons\.svg\)'/);
  assert.match(
    detailScreen,
    /backgroundSize: `\$\{CLIENT_TAB_GEM_SIZE \* 5\}px \$\{CLIENT_TAB_GEM_SIZE\}px`/,
  );
  assert.match(
    detailScreen,
    /backgroundPosition: `\$\{-CLIENT_TAB_GEM_INDEX\[kind\] \* CLIENT_TAB_GEM_SIZE\}px 0`/,
  );
});

test('all five tabs keep the same order as the five tiles in gem-icons.svg', () => {
  assert.match(
    detailScreen,
    /const CLIENT_TAB_GEM_INDEX = \{\s*sessions: 0,\s*consultations: 1,\s*content: 2,\s*notes: 3,\s*info: 4,/s,
  );

  const tabBar = detailScreen.slice(
    detailScreen.indexOf('<div role="tablist"'),
    detailScreen.indexOf('{/* Sub-header'),
  );
  const calls = [...tabBar.matchAll(/gemMarker\('([^']+)', '([^']+)'\)/g)].map(
    ([, gem, tab]) => [gem, tab],
  );
  assert.deepEqual(calls, [
    ['sessions', 'sessions'],
    ['consultations', 'consultations'],
    ['content', 'content'],
    ['notes', 'extra'],
    ['info', 'info'],
  ]);

  assert.match(gemSprite, /width="320"[\s\S]*height="64"[\s\S]*viewBox="0 0 320 64"/);
  assert.match(gemSprite, /id="sessions-icon"/);
  assert.match(gemSprite, /id="consultations-icon"[\s\S]*transform="translate\(64 0\)"/);
  assert.match(gemSprite, /id="content-icon"[\s\S]*transform="translate\(128 0\)"/);
  assert.match(gemSprite, /id="notes-icon"[\s\S]*transform="translate\(192 0\)"/);
  assert.match(gemSprite, /id="info-icon"[\s\S]*transform="translate\(256 0\)"/);
});
