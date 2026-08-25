import assert from 'node:assert/strict';
import test from 'node:test';

import { FIRST_SESSION_WINDOW_OPTIONS, findFirstSessionWindowOption } from '../.test-dist/src/domain/project.js';

test('the fixed list is exactly weeks 1-3 plus months 1-12, in that order', () => {
  assert.deepEqual(
    FIRST_SESSION_WINDOW_OPTIONS.map((o) => [o.amount, o.unit]),
    [
      [1, 'week'], [2, 'week'], [3, 'week'],
      [1, 'month'], [2, 'month'], [3, 'month'], [4, 'month'], [5, 'month'], [6, 'month'],
      [7, 'month'], [8, 'month'], [9, 'month'], [10, 'month'], [11, 'month'], [12, 'month'],
    ],
  );
});

test('every option has a unique key', () => {
  const keys = FIRST_SESSION_WINDOW_OPTIONS.map((o) => o.key);
  assert.equal(new Set(keys).size, keys.length);
});

test('month labels use correct Russian pluralization at the 1/2-4/5+ boundaries', () => {
  const labelFor = (amount) => FIRST_SESSION_WINDOW_OPTIONS.find((o) => o.unit === 'month' && o.amount === amount).label;
  assert.equal(labelFor(1), '1 месяц');
  assert.equal(labelFor(2), '2 месяца');
  assert.equal(labelFor(4), '4 месяца');
  assert.equal(labelFor(5), '5 месяцев');
  assert.equal(labelFor(12), '12 месяцев');
});

test('findFirstSessionWindowOption matches an existing amount/unit pair', () => {
  const o = findFirstSessionWindowOption(2, 'week');
  assert.equal(o.key, '2-week');
  assert.equal(o.label, '2 недели');
});

test('findFirstSessionWindowOption returns null when amount or unit is null/undefined ("не задано")', () => {
  assert.equal(findFirstSessionWindowOption(null, null), null);
  assert.equal(findFirstSessionWindowOption(undefined, undefined), null);
  assert.equal(findFirstSessionWindowOption(2, null), null);
  assert.equal(findFirstSessionWindowOption(null, 'week'), null);
});

test('findFirstSessionWindowOption returns null for a value outside the fixed list', () => {
  assert.equal(findFirstSessionWindowOption(13, 'month'), null);
  assert.equal(findFirstSessionWindowOption(4, 'week'), null);
});
