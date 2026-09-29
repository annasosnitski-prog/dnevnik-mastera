import assert from 'node:assert/strict';
import test from 'node:test';

import { createMoodboardPhotoFile, prepareMoodboardShare } from '../.test-dist/src/lib/moodboardShare.js';

const photoItem = (id, bytes = '/9j/') => ({ id, kind: 'photo', src: `data:image/jpeg;base64,${bytes}`, url: '', hex: '', note: '' });
const linkItem = (id) => ({ id, kind: 'link', src: '', url: 'https://pinterest.com/x', hex: '', note: '' });

test('createMoodboardPhotoFile builds a named File from a data URL', () => {
  const file = createMoodboardPhotoFile('data:image/png;base64,iVBORw==', 'proj1', 2);
  assert.ok(file instanceof File);
  assert.equal(file.type, 'image/png');
  assert.equal(file.name, 'moodboard-proj1-2.png');
});

test('createMoodboardPhotoFile returns null for a non-image src (e.g. an empty link item)', () => {
  assert.equal(createMoodboardPhotoFile('', 'proj1', 0), null);
});

test('prepareMoodboardShare includes only photo items as files, ignoring link/color items', () => {
  const moodboard = { id: 'mb1', caption: '', status: 'draft', sentAt: null, approvedAt: null, updatedAt: '2026-01-01', items: [linkItem('l1'), photoItem('p1'), photoItem('p2')] };
  const { files, payload } = prepareMoodboardShare(moodboard, 'proj1');
  assert.equal(files.length, 2);
  assert.deepEqual(Object.keys(payload), ['files']);
});

test('prepareMoodboardShare attaches a non-empty caption as text alongside the files', () => {
  const moodboard = { id: 'mb1', caption: '  Для спины  ', status: 'draft', sentAt: null, approvedAt: null, updatedAt: '2026-01-01', items: [photoItem('p1')] };
  const { payload } = prepareMoodboardShare(moodboard, 'proj1');
  assert.equal(payload.text, 'Для спины');
});

test('prepareMoodboardShare falls back to text-only when there are no photos', () => {
  const moodboard = { id: 'mb1', caption: 'Только ссылка', status: 'draft', sentAt: null, approvedAt: null, updatedAt: '2026-01-01', items: [linkItem('l1')] };
  const { files, payload } = prepareMoodboardShare(moodboard, 'proj1');
  assert.equal(files.length, 0);
  assert.deepEqual(payload, { text: 'Только ссылка' });
});
