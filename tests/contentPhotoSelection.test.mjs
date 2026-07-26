import assert from 'node:assert/strict';
import test from 'node:test';

import {
  contentSelectionRoleLabel,
  hasContentPhotoSelectionContract,
  resolveAllContentPhotos,
  resolveContentPhotoSelection,
} from '../.test-dist/src/lib/contentPhotoSelection.js';
import { normalizeContentEntry } from '../.test-dist/src/lib/contentApproval.js';

const photos = ['original-a', 'original-b', 'original-c'];
const photoIds = ['photo-a', 'photo-b', 'photo-c'];
const kept = (values) => ({ technical_status: 'kept', ...values });

test('matches selected backend media to originals by stable photo ID', () => {
  const resolved = resolveContentPhotoSelection({
    photos,
    photoIds,
    contentDraft: [kept({ id: 'photo-c', selected: true }), kept({ id: 'photo-a', selected: true })],
  });

  assert.deepEqual(resolved.map(({ id, src, originalIndex }) => ({ id, src, originalIndex })), [
    { id: 'photo-a', src: 'original-a', originalIndex: 0 },
    { id: 'photo-c', src: 'original-c', originalIndex: 2 },
  ]);
});

test('sorts selected photos by order_index and then original index', () => {
  const resolved = resolveContentPhotoSelection({
    photos,
    photoIds,
    contentDraft: [
      kept({ id: 'photo-c', selected: true, order_index: 1 }),
      kept({ id: 'photo-b', selected: true, order_index: 0 }),
      kept({ id: 'photo-a', selected: true, order_index: 1 }),
    ],
  });

  assert.deepEqual(resolved.map((photo) => photo.id), ['photo-b', 'photo-a', 'photo-c']);
});

test('preserves original order when order_index is equal or absent', () => {
  const resolved = resolveContentPhotoSelection({
    photos,
    photoIds,
    contentDraft: [
      kept({ id: 'photo-c', selected: true }),
      kept({ id: 'photo-a', selected: true }),
      kept({ id: 'photo-b', selected: true }),
    ],
  });

  assert.deepEqual(resolved.map((photo) => photo.id), photoIds);
});

test('excludes rejected and explicit selected false media from the selection', () => {
  const resolved = resolveContentPhotoSelection({
    photos,
    photoIds,
    contentDraft: [
      { id: 'photo-a', technical_status: 'rejected', selected: true },
      kept({ id: 'photo-b', selected: false }),
      kept({ id: 'photo-c', selected: true }),
    ],
  });

  assert.deepEqual(resolved.map((photo) => photo.id), ['photo-c']);
});

test('ignores unknown media IDs and never returns one original twice', () => {
  const resolved = resolveContentPhotoSelection({
    photos,
    photoIds,
    contentDraft: [
      kept({ id: 'unknown', selected: true }),
      kept({ id: 'photo-b', selected: true }),
      kept({ id: 'photo-b', selected: true, order_index: -1 }),
    ],
  });

  assert.deepEqual(resolved.map((photo) => photo.id), ['photo-b']);
});

test('duplicate_group neither filters output nor leaks into resolved results', () => {
  const resolved = resolveContentPhotoSelection({
    photos,
    photoIds,
    contentDraft: [
      kept({ id: 'photo-a', selected: true, duplicate_group: 'same' }),
      kept({ id: 'photo-b', selected: true, duplicate_group: 'same' }),
    ],
  });

  assert.deepEqual(resolved.map((photo) => photo.id), ['photo-a', 'photo-b']);
  assert.equal('duplicate_group' in resolved[0], false);
});

test('a new contract with zero selected photos does not substitute all originals', () => {
  const contentDraft = [kept({ id: 'photo-a', selected: false }), kept({ id: 'photo-b', selected: false })];
  assert.equal(hasContentPhotoSelectionContract(contentDraft), true);
  assert.deepEqual(resolveContentPhotoSelection({ photos, photoIds, contentDraft }), []);
});

test('a legacy contract without selected shows every photo in original order', () => {
  const contentDraft = [kept({ id: 'photo-c' }), kept({ id: 'photo-a' })];
  assert.equal(hasContentPhotoSelectionContract(contentDraft), false);
  assert.deepEqual(
    resolveContentPhotoSelection({ photos, photoIds, contentDraft }).map((photo) => photo.src),
    photos,
  );
});

test('legacy entries without photoIds fall back to contentDraft order', () => {
  const resolved = resolveContentPhotoSelection({
    photos,
    contentDraft: [
      kept({ id: 'legacy-a', selection_role: 'cover' }),
      kept({ id: 'legacy-b', selection_role: 'detail' }),
    ],
  });

  assert.deepEqual(resolved.map((photo) => photo.id), ['legacy-a', 'legacy-b', 'photo-2']);
  assert.deepEqual(resolved.map((photo) => photo.src), photos);
  assert.deepEqual(resolved.map((photo) => photo.selectionRole), ['cover', 'detail', undefined]);
});

test('archive resolver retains every original, including rejected photos', () => {
  const resolved = resolveAllContentPhotos({
    photos,
    photoIds,
    contentDraft: [
      { id: 'photo-a', technical_status: 'rejected', selected: true },
      kept({ id: 'photo-b', selected: true }),
    ],
  });

  assert.deepEqual(resolved.map((photo) => photo.src), photos);
  assert.deepEqual(resolved.map((photo) => photo.selected), [false, true, false]);
});

test('selection role labels use the required Russian names', () => {
  assert.deepEqual(
    Object.fromEntries(['cover', 'placement', 'detail', 'before', 'after', 'process', 'transition', 'atmosphere', 'background']
      .map((role) => [role, contentSelectionRoleLabel(role)])),
    {
      cover: 'Обложка',
      placement: 'На теле',
      detail: 'Деталь',
      before: 'До',
      after: 'После',
      process: 'Процесс',
      transition: 'Переход',
      atmosphere: 'Атмосфера',
      background: 'Фон',
    },
  );
});

test('consultation and freeform legacy entries still resolve all photos', () => {
  for (const sourceType of ['consultation', 'freeform']) {
    const entry = { sourceType, photos, contentDraft: null };
    assert.deepEqual(resolveContentPhotoSelection(entry).map((photo) => photo.src), photos);
  }
});

test('photoIds and backend selection fields survive ContentEntry normalization', () => {
  const entry = {
    id: 'entry',
    photos,
    photoIds,
    contentDraft: [kept({
      id: 'photo-a',
      selected: true,
      selection_role: 'cover',
      duplicate_group: 'group-a',
    })],
  };

  assert.deepEqual(normalizeContentEntry(entry), { ...entry, status: 'draft', isExemplar: false });
});
