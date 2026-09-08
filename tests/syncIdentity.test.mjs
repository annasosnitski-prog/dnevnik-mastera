import assert from 'node:assert/strict';
import test from 'node:test';

import { deriveSyncIdentity, isCodeTooWeak, MIN_CODE_LENGTH } from '../.test-dist/src/lib/syncIdentity.js';

test('один и тот же код всегда даёт одну и ту же личность — иначе устройства не встретятся', async () => {
  const a = await deriveSyncIdentity('correct-horse-battery');
  const b = await deriveSyncIdentity('correct-horse-battery');
  assert.deepEqual(a, b);
});

test('разные коды дают разную личность', async () => {
  const a = await deriveSyncIdentity('correct-horse-battery');
  const b = await deriveSyncIdentity('correct-horse-batteryX');
  assert.notEqual(a.email, b.email);
  assert.notEqual(a.password, b.password);
});

test('код нечувствителен к регистру и обрамляющим пробелам', async () => {
  const a = await deriveSyncIdentity('Correct-Horse-Battery');
  const b = await deriveSyncIdentity('  correct-horse-battery  ');
  assert.deepEqual(a, b);
});

test('внутренний пробел — другой код, а не тот же с опечаткой', async () => {
  const a = await deriveSyncIdentity('correct horse battery');
  const b = await deriveSyncIdentity('correcthorsebattery');
  assert.notEqual(a.email, b.email);
});

test('email похож на почту (нужно для Supabase Auth) и не содержит сам код', async () => {
  const identity = await deriveSyncIdentity('correct-horse-battery');
  assert.match(identity.email, /^d[0-9a-f]{32}@sync\.dnevnik-mastera\.local$/);
  assert.ok(!identity.email.includes('correct-horse-battery'));
});

test('пароль достаточно длинный для Supabase Auth и не содержит сам код', async () => {
  const identity = await deriveSyncIdentity('correct-horse-battery');
  assert.ok(identity.password.length >= 32);
  assert.ok(!identity.password.includes('correct-horse-battery'));
});

test('слабый код (короче порога) помечается предупреждением', () => {
  assert.equal(isCodeTooWeak('1234'), true);
  assert.equal(isCodeTooWeak('a'.repeat(MIN_CODE_LENGTH - 1)), true);
  assert.equal(isCodeTooWeak('a'.repeat(MIN_CODE_LENGTH)), false);
});

test('порог считает код после обрезки пробелов, не «сырую» длину', () => {
  assert.equal(isCodeTooWeak('  1234  '), true);
});
