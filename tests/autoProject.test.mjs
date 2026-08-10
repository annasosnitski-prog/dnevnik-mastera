import assert from 'node:assert/strict';
import test from 'node:test';

import { bucketProjectId, bucketProjectTitle, makeBucketProject } from '../.test-dist/src/lib/autoProject.js';

test('bucketProjectId is deterministic per client — same clientId always gives the same id', () => {
  assert.equal(bucketProjectId('client-1'), bucketProjectId('client-1'));
});

test('bucketProjectId differs between clients', () => {
  assert.notEqual(bucketProjectId('client-1'), bucketProjectId('client-2'));
});

test('bucketProjectId for null (client-less/master) is a stable, distinct id', () => {
  assert.equal(bucketProjectId(null), bucketProjectId(null));
  assert.notEqual(bucketProjectId(null), bucketProjectId('client-1'));
});

test('bucketProjectTitle uses the client\'s plain name, no decorative prefix', () => {
  const title = bucketProjectTitle({ name: 'Анна', surname: 'Соснитски' }, 'Мастер Имя');
  assert.equal(title, 'Анна Соснитски');
});

test('bucketProjectTitle falls back to "Клиент" when the client has no name/surname', () => {
  const title = bucketProjectTitle({ name: '', surname: '' }, 'Мастер Имя');
  assert.equal(title, 'Клиент');
});

test('bucketProjectTitle uses the master\'s own name for a client-less (null) owner', () => {
  const title = bucketProjectTitle(null, 'Мастер Имя');
  assert.equal(title, 'Мастер Имя');
});

test('bucketProjectTitle falls back to "Мастер" when the master\'s own name is blank', () => {
  const title = bucketProjectTitle(null, '   ');
  assert.equal(title, 'Мастер');
});

test('makeBucketProject produces a fully-formed, empty, active project ready to hold sessions/consultations', () => {
  const p = makeBucketProject('bucket-client-1', 'Анна Соснитски', '#B0413E', 'client-1');
  assert.equal(p.id, 'bucket-client-1');
  assert.equal(p.title, 'Анна Соснитски');
  assert.equal(p.color, '#B0413E');
  assert.equal(p.clientId, 'client-1');
  assert.equal(p.state, 'active');
  assert.deepEqual(p.sessions, []);
  assert.deepEqual(p.consultations, []);
});

test('makeBucketProject supports a null clientId (client-less/master bucket)', () => {
  const p = makeBucketProject('bucket-master', 'Мастер Имя', '#B0413E', null);
  assert.equal(p.clientId, null);
});
