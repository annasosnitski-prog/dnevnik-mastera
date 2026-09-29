import assert from 'node:assert/strict';
import test from 'node:test';

import { collageGridSize } from '../.test-dist/src/lib/moodboardCollage.js';

test('collageGridSize keeps a single photo at 1×1', () => {
  assert.deepEqual(collageGridSize(0), { cols: 1, rows: 1 });
  assert.deepEqual(collageGridSize(1), { cols: 1, rows: 1 });
});

test('collageGridSize lays two photos side by side, not stacked', () => {
  assert.deepEqual(collageGridSize(2), { cols: 2, rows: 1 });
});

test('collageGridSize rounds up to a square-ish grid for larger counts', () => {
  assert.deepEqual(collageGridSize(3), { cols: 2, rows: 2 });
  assert.deepEqual(collageGridSize(4), { cols: 2, rows: 2 });
  assert.deepEqual(collageGridSize(5), { cols: 3, rows: 2 });
  assert.deepEqual(collageGridSize(9), { cols: 3, rows: 3 });
});

test('collageGridSize never leaves a cell short — cols*rows always covers count', () => {
  for (let count = 1; count <= 20; count += 1) {
    const { cols, rows } = collageGridSize(count);
    assert.ok(cols * rows >= count, `count=${count}`);
  }
});
