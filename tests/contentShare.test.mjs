import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  canShareInstagramContent,
  isShareAbortError,
  prepareInstagramContentShare,
  prepareStandardContentShare,
} from '../.test-dist/src/lib/contentShare.js';

const jpeg = (originalIndex, bytes = '/9j/') => ({
  src: `data:image/jpeg;base64,${bytes}`,
  originalIndex,
});
const png = (originalIndex) => ({
  src: 'data:image/png;base64,iVBORw==',
  originalIndex,
});
const webp = (originalIndex) => ({
  src: 'data:image/webp;base64,UklGRg==',
  originalIndex,
});

test('Instagram payload contains every real image File and no text fields', () => {
  const preparation = prepareInstagramContentShare({
    entryId: 'entry-1',
    savedText: 'saved text',
    photos: [jpeg(3), png(8)],
  });

  assert.equal(preparation.status, 'ready');
  assert.deepEqual(Object.keys(preparation.payload), ['files']);
  assert.equal(preparation.payload.files.length, 2);
  assert.ok(preparation.payload.files.every((file) => file instanceof File));
  assert.equal(preparation.payload.files[0].type, 'image/jpeg');
  assert.equal(preparation.payload.files[0].name, 'contentinka-entry-1-3.jpg');
  assert.equal(preparation.payload.files[1].type, 'image/png');
  assert.equal(preparation.payload.files[1].name, 'contentinka-entry-1-8.png');
  assert.equal('text' in preparation.payload, false);
  assert.equal('title' in preparation.payload, false);
  assert.equal('url' in preparation.payload, false);
});

test('Instagram preserves all nine final photos in their current order', () => {
  const photos = [png(7), jpeg(1), webp(9), jpeg(4), png(2), jpeg(8), webp(3), png(6), jpeg(5)];
  const preparation = prepareInstagramContentShare({
    entryId: 'entry-nine',
    savedText: 'saved',
    photos,
  });

  assert.equal(preparation.status, 'ready');
  assert.equal(preparation.files.length, 9);
  assert.deepEqual(preparation.photos.map((photo) => photo.originalIndex), [7, 1, 9, 4, 2, 8, 3, 6, 5]);
  assert.deepEqual(
    preparation.files.map((file) => file.name),
    [
      'contentinka-entry-nine-7.png',
      'contentinka-entry-nine-1.jpg',
      'contentinka-entry-nine-9.webp',
      'contentinka-entry-nine-4.jpg',
      'contentinka-entry-nine-2.png',
      'contentinka-entry-nine-8.jpg',
      'contentinka-entry-nine-3.webp',
      'contentinka-entry-nine-6.png',
      'contentinka-entry-nine-5.jpg',
    ],
  );
  assert.deepEqual(preparation.payload.files, preparation.files);
});

test('Instagram does not silently discard a later invalid photo', () => {
  const preparation = prepareInstagramContentShare({
    entryId: 'entry-invalid-later',
    savedText: 'saved',
    photos: [jpeg(0), { src: 'https://example.com/photo.jpg', originalIndex: 1 }, png(2)],
  });

  assert.deepEqual(preparation, { status: 'invalid_photo' });
});

test('WebP originals keep a shareable MIME type and normal extension', () => {
  const preparation = prepareInstagramContentShare({
    entryId: 'entry-webp',
    savedText: 'saved',
    photos: [webp(5)],
  });

  assert.equal(preparation.status, 'ready');
  assert.equal(preparation.files[0].type, 'image/webp');
  assert.equal(preparation.files[0].name, 'contentinka-entry-webp-5.webp');
});

test('standard share preserves all valid photos together with saved text', () => {
  const preparation = prepareStandardContentShare({
    entryId: 'entry-standard',
    savedText: 'persisted copy',
    photos: [jpeg(0), png(1)],
  });

  assert.equal(preparation.files.length, 2);
  assert.equal(preparation.payload.text, 'persisted copy');
  assert.deepEqual(preparation.payload.files, preparation.files);
});

test('share integration reads persisted textDraft and never textarea editor state', () => {
  const source = readFileSync(new URL('../src/components/TattoDiary.tsx', import.meta.url), 'utf8');
  const screen = source.slice(source.indexOf('function ContentINKAScreen({'), source.indexOf('function ContentPanel({'));
  const instagramHandler = screen.slice(
    screen.indexOf('const shareContentToInstagram ='),
    screen.indexOf('const shareContentToOtherApps ='),
  );
  const standardHandler = screen.slice(
    screen.indexOf('const shareContentToOtherApps ='),
    screen.indexOf('const visibleEntries ='),
  );

  assert.match(instagramHandler, /savedText: currentEntry\.textDraft/);
  assert.match(instagramHandler, /copyTextToClipboard\(preparation\.clipboardText\)/);
  assert.match(instagramHandler, /nav\.share\(preparation\.payload\)/);
  assert.doesNotMatch(instagramHandler, /editedText|textEditorsByEntry|textarea/);
  assert.match(standardHandler, /currentEntry\.photos, currentEntry\.textDraft/);
  assert.doesNotMatch(standardHandler, /editedText|textEditorsByEntry|textarea/);
});

test('AbortError is a cancellation rather than a user-facing share error', () => {
  assert.equal(isShareAbortError(new DOMException('cancelled', 'AbortError')), true);
  assert.equal(isShareAbortError({ name: 'AbortError' }), true);
  assert.equal(isShareAbortError(new Error('network')), false);
  assert.equal(isShareAbortError(null), false);
});

test('missing and invalid photos stop Instagram share preparation safely', () => {
  assert.deepEqual(
    prepareInstagramContentShare({ entryId: 'empty', savedText: 'saved', photos: [] }),
    { status: 'no_photo' },
  );
  assert.deepEqual(
    prepareInstagramContentShare({
      entryId: 'invalid',
      savedText: 'saved',
      photos: [{ src: 'https://example.com/photo.jpg', originalIndex: 0 }],
    }),
    { status: 'invalid_photo' },
  );
});

test('unsupported or throwing file-share capability is handled safely', () => {
  const preparation = prepareInstagramContentShare({
    entryId: 'entry-4',
    savedText: 'saved',
    photos: [jpeg(0), png(1)],
  });

  assert.equal(canShareInstagramContent(preparation, undefined), false);
  assert.equal(canShareInstagramContent(preparation, () => false), false);
  assert.equal(canShareInstagramContent(preparation, () => { throw new Error('unsupported'); }), false);
  assert.equal(canShareInstagramContent(preparation, (payload) => payload.files?.length === 2), true);
});
