import assert from 'node:assert/strict';
import test from 'node:test';

import { buildBackupBlobParts } from '../.test-dist/src/lib/backupSerialize.js';

async function partsToJSON(parts) {
  const text = await new Blob(parts).text();
  return JSON.parse(text);
}

test('reassembled parts equal the original payload', async () => {
  const payload = {
    version: 5,
    clients: [
      {
        id: 'c1',
        name: 'Аня',
        sessions: [{ id: 's1', photos: ['data:image/jpeg;base64,AAA', 'data:image/jpeg;base64,BBB'] }],
      },
    ],
    masterInfo: { name: 'Master', tasks: [{ id: 't1', photos: [] }] },
  };
  const parts = buildBackupBlobParts(payload);
  assert.deepEqual(await partsToJSON(parts), payload);
});

test('photo strings become their own blob parts, not glued into the shell string', () => {
  const bigPhoto = 'data:image/jpeg;base64,' + 'A'.repeat(5000);
  const payload = { clients: [{ id: 'c1', sessions: [{ id: 's1', photos: [bigPhoto] }] }] };
  const parts = buildBackupBlobParts(payload);
  // No single part should carry the whole photo glued together with the
  // rest of the JSON — that's exactly the giant-single-string problem this
  // function exists to avoid.
  for (const part of parts) {
    assert.ok(typeof part === 'string');
    if (part.includes(bigPhoto)) {
      assert.ok(part.length < bigPhoto.length + 4, 'photo part should not carry extra shell JSON glued on');
    }
  }
  const photoParts = parts.filter((p) => typeof p === 'string' && p.includes(bigPhoto));
  assert.equal(photoParts.length, 1);
});

test('a value that merely looks like our placeholder token in user text is left untouched', async () => {
  const payload = { clients: [{ id: 'c1', notes: 'texted client about @@fake-marker_0@@ price' }] };
  const parts = buildBackupBlobParts(payload);
  assert.deepEqual(await partsToJSON(parts), payload);
});

test('non-string entries in a "photos" array are left to normal JSON serialization', async () => {
  // Defensive: only touch arrays that are actually all strings — anything
  // else falls through untouched rather than risk mangling unexpected data.
  const payload = { weird: { photos: [1, 2, 3] } };
  const parts = buildBackupBlobParts(payload);
  assert.deepEqual(await partsToJSON(parts), payload);
});

test('empty photos array round-trips with no tokens inserted', async () => {
  const payload = { sessions: [{ id: 's1', photos: [] }] };
  const parts = buildBackupBlobParts(payload);
  assert.deepEqual(await partsToJSON(parts), payload);
});
