import assert from 'node:assert/strict';
import test from 'node:test';

import { hasMoodboardContent, moodboardPhotoSrcs, withMoodboardPhotoSrcs } from '../.test-dist/src/domain/project.js';

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

// ── moodboardPhotoSrcs / withMoodboardPhotoSrcs ────────────────────

test('moodboardPhotoSrcs returns an empty array when there is no moodboard', () => {
  assert.deepEqual(moodboardPhotoSrcs(null), []);
});

test('moodboardPhotoSrcs returns only photo items, in order, ignoring link/color items', () => {
  const moodboard = {
    id: 'mb1', caption: '', status: 'draft', sentAt: null, approvedAt: null, updatedAt: '2026-01-01',
    items: [
      { id: 'i1', kind: 'link', src: '', url: 'https://pinterest.com', hex: '', note: '' },
      { id: 'i2', kind: 'photo', src: 'data:a', url: '', hex: '', note: '' },
      { id: 'i3', kind: 'color', src: '', url: '', hex: '#000', note: '' },
      { id: 'i4', kind: 'photo', src: 'data:b', url: '', hex: '', note: '' },
    ],
  };
  assert.deepEqual(moodboardPhotoSrcs(moodboard), ['data:a', 'data:b']);
});

test('withMoodboardPhotoSrcs stays null when there is nothing to create from', () => {
  assert.equal(withMoodboardPhotoSrcs(null, []), null);
});

test('withMoodboardPhotoSrcs creates a fresh draft moodboard from the first photos', () => {
  const mb = withMoodboardPhotoSrcs(null, ['data:a', 'data:b']);
  assert.equal(mb.status, 'draft');
  assert.equal(mb.caption, '');
  assert.deepEqual(mb.items.map((it) => it.src), ['data:a', 'data:b']);
  assert.ok(mb.items.every((it) => it.kind === 'photo' && it.id));
});

test('withMoodboardPhotoSrcs keeps the same item id for an unchanged photo (reconciles by src)', () => {
  const once = withMoodboardPhotoSrcs(null, ['data:a', 'data:b']);
  const twice = withMoodboardPhotoSrcs(once, ['data:a', 'data:b']);
  assert.deepEqual(twice.items.map((it) => it.id), once.items.map((it) => it.id));
});

test('withMoodboardPhotoSrcs assigns a new id only to a genuinely new photo', () => {
  const once = withMoodboardPhotoSrcs(null, ['data:a']);
  const twice = withMoodboardPhotoSrcs(once, ['data:a', 'data:c']);
  assert.equal(twice.items[0].id, once.items[0].id);
  assert.notEqual(twice.items[1].id, once.items[0].id);
});

test('withMoodboardPhotoSrcs leaves non-photo items untouched', () => {
  const moodboard = {
    id: 'mb1', caption: 'Для спины', status: 'sent', sentAt: '2026-01-01T00:00:00Z', approvedAt: null, updatedAt: '2026-01-01',
    items: [{ id: 'link1', kind: 'link', src: '', url: 'https://pinterest.com', hex: '', note: '' }],
  };
  const next = withMoodboardPhotoSrcs(moodboard, ['data:a']);
  assert.deepEqual(next.items.map((it) => it.kind), ['link', 'photo']);
  assert.equal(next.items[0].id, 'link1');
  assert.equal(next.caption, 'Для спины');
  assert.equal(next.status, 'sent');
});

test('withMoodboardPhotoSrcs collapses back to null once the last photo is removed from a plain draft', () => {
  const withPhoto = withMoodboardPhotoSrcs(null, ['data:a']);
  assert.equal(withMoodboardPhotoSrcs(withPhoto, []), null);
});

test('withMoodboardPhotoSrcs keeps an empty-but-meaningful moodboard alive (sent status survives photo removal)', () => {
  const moodboard = { id: 'mb1', caption: '', status: 'sent', sentAt: '2026-01-01T00:00:00Z', approvedAt: null, updatedAt: '2026-01-01', items: [{ id: 'i1', kind: 'photo', src: 'data:a', url: '', hex: '', note: '' }] };
  const next = withMoodboardPhotoSrcs(moodboard, []);
  assert.notEqual(next, null);
  assert.equal(next.status, 'sent');
  assert.deepEqual(next.items, []);
});
