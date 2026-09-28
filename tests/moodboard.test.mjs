import assert from 'node:assert/strict';
import test from 'node:test';

import { hasMoodboardContent } from '../.test-dist/src/domain/project.js';

// hasMoodboardContent — «есть ли что показать», а не «заведён ли мудборд»:
// null (не заведён) и заведённый-но-пустой (0 items) обе читаются как
// «нечего показать», но это разные состояния для UI (см. domain/project.ts).

test('hasMoodboardContent is false when the project has no moodboard at all', () => {
  assert.equal(hasMoodboardContent(null), false);
});

test('hasMoodboardContent is false for a moodboard created but with no items yet', () => {
  assert.equal(hasMoodboardContent({ id: 'mb1', items: [], caption: '', status: 'draft', sentAt: null, approvedAt: null, updatedAt: '2026-01-01' }), false);
});

test('hasMoodboardContent is true once at least one item is on the board', () => {
  const moodboard = {
    id: 'mb1',
    items: [{ id: 'i1', kind: 'photo', src: 'data:x', url: '', hex: '', note: '' }],
    caption: '',
    status: 'draft',
    sentAt: null,
    approvedAt: null,
    updatedAt: '2026-01-01',
  };
  assert.equal(hasMoodboardContent(moodboard), true);
});
