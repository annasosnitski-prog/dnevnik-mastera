import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { downsizePhotosSequentially } from '../.test-dist/src/lib/imagePreview.js';

const diary = readFileSync(new URL('../src/components/TattoDiary.tsx', import.meta.url), 'utf8');

test('photo archive grid is absent until the explicit archive toggle is open', () => {
  const gallery = diary.slice(diary.indexOf('function ContentPhotoGallery'), diary.indexOf('type ContentEntryCardProps'));
  assert.match(gallery, /const \[archiveOpen, setArchiveOpen\] = useState\(false\)/);
  assert.match(gallery, /aria-expanded=\{archiveOpen\}/);
  assert.match(gallery, /archiveOpen && allPhotos\.length > 0/);
  assert.doesNotMatch(gallery, /<details|<summary/);
});

test('content workspace starts with eight entries, shows eight more, and filters reset the limit', () => {
  assert.match(diary, /const CONTENT_ENTRY_PAGE_SIZE = 8/);
  assert.match(diary, /visibleEntries\.slice\(0, visibleEntryLimit\)/);
  assert.match(diary, /current \+ CONTENT_ENTRY_PAGE_SIZE/);
  assert.match(diary, />\s*\u041fоказать ещё\s*</);
  const filters = diary.slice(diary.indexOf('aria-label="Фильтр записей"'), diary.indexOf('{/* ── List ── */}'));
  assert.equal((filters.match(/setVisibleEntryLimit\(CONTENT_ENTRY_PAGE_SIZE\)/g) ?? []).length, 3);
});

test('content cards are memoized independently from composer input state', () => {
  assert.match(diary, /const ContentEntryCard = memo\(/);
  assert.match(diary, /pagedVisibleEntries\.map\(\(entry\)/);
  assert.match(diary, /<ContentEntryCard/);
});

test('photo previews are downsized sequentially and preserve their order', async () => {
  let active = 0;
  let maximumActive = 0;
  const started = [];
  const result = await downsizePhotosSequentially(
    ['photo-a', 'photo-b', 'photo-c'],
    ['id-a', 'id-b', 'id-c'],
    async (photo) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      started.push(photo);
      await new Promise((resolve) => setImmediate(resolve));
      active -= 1;
      return `preview:${photo}`;
    },
  );

  assert.equal(maximumActive, 1);
  assert.deepEqual(started, ['photo-a', 'photo-b', 'photo-c']);
  assert.deepEqual(result, [
    { id: 'id-a', preview_data_url: 'preview:photo-a' },
    { id: 'id-b', preview_data_url: 'preview:photo-b' },
    { id: 'id-c', preview_data_url: 'preview:photo-c' },
  ]);
});
