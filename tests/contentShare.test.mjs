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

test('Instagram payload contains exactly one real image File and no text fields', () => {
  const preparation = prepareInstagramContentShare({
    entryId: 'entry-1',
    savedText: 'saved text',
    photos: [jpeg(3), png(8)],
  });

  assert.equal(preparation.status, 'ready');
  assert.deepEqual(Object.keys(preparation.payload), ['files']);
  assert.equal(preparation.payload.files.length, 1);
  assert.ok(preparation.payload.files[0] instanceof File);
  assert.equal(preparation.payload.files[0].type, 'image/jpeg');
  assert.equal(preparation.payload.files[0].name, 'contentinka-entry-1-3.jpg');
  assert.equal('text' in preparation.payload, false);
  assert.equal('title' in preparation.payload, false);
  assert.equal('url' in preparation.payload, false);
});

test('Instagram uses the first final photo when no separate photo is selected', () => {
  const preparation = prepareInstagramContentShare({
    entryId: 'entry-2',
    savedText: 'saved',
    photos: [png(7), jpeg(1)],
  });

  assert.equal(preparation.status, 'ready');
  assert.equal(preparation.photo.originalIndex, 7);
  assert.equal(preparation.file.name, 'contentinka-entry-2-7.png');
  assert.equal(preparation.file.type, 'image/png');
});

test('a separately selected current photo takes precedence when provided', () => {
  const preparation = prepareInstagramContentShare({
    entryId: 'entry-3',
    savedText: 'saved',
    photos: [jpeg(0), png(1)],
    selectedPhoto: png(1),
  });

  assert.equal(preparation.status, 'ready');
  assert.equal(preparation.photo.originalIndex, 1);
});

test('WebP originals keep a shareable MIME type and normal extension', () => {
  const preparation = prepareInstagramContentShare({
    entryId: 'entry-webp',
    savedText: 'saved',
    photos: [webp(5)],
  });

  assert.equal(preparation.status, 'ready');
  assert.equal(preparation.file.type, 'image/webp');
  assert.equal(preparation.file.name, 'contentinka-entry-webp-5.webp');
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
    photos: [jpeg(0)],
  });

  assert.equal(canShareInstagramContent(preparation, undefined), false);
  assert.equal(canShareInstagramContent(preparation, () => false), false);
  assert.equal(canShareInstagramContent(preparation, () => { throw new Error('unsupported'); }), false);
  assert.equal(canShareInstagramContent(preparation, (payload) => payload.files?.length === 1), true);
});
