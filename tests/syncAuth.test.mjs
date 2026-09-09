import assert from 'node:assert/strict';
import test from 'node:test';

import { pairDeviceWithCode, unpairDevice, isPaired } from '../.test-dist/src/lib/syncAuth.js';

// Поддельный клиент — без сети и без настоящего Supabase. Проверяем
// именно решение «вход или регистрация», а не саму библиотеку.
function fakeClient({ signInError, signUpError, signUpSession = { user: { id: 'u1' } } } = {}) {
  const calls = [];
  return {
    calls,
    auth: {
      async signInWithPassword(identity) {
        calls.push(['signIn', identity]);
        return signInError ? { error: signInError } : { error: null };
      },
      async signUp(identity) {
        calls.push(['signUp', identity]);
        return signUpError ? { error: signUpError, data: { session: null } } : { error: null, data: { session: signUpSession } };
      },
      async signOut() {
        calls.push(['signOut']);
      },
      async getSession() {
        return { data: { session: this._session ?? null } };
      },
    },
  };
}

test('первое устройство: входа ещё нет — регистрируется той же парой и получает сессию', async () => {
  const client = fakeClient({ signInError: { message: 'Invalid login credentials', status: 400 } });
  const result = await pairDeviceWithCode(client, 'correct-horse-battery');
  assert.deepEqual(result, { ok: true, created: true });
  assert.deepEqual(client.calls.map((c) => c[0]), ['signIn', 'signUp']);
  assert.deepEqual(client.calls[0][1], client.calls[1][1]);
});

test('signUp без сессии не выдаётся за успешную привязку', async () => {
  const client = fakeClient({
    signInError: { message: 'Invalid login credentials', status: 400 },
    signUpSession: null,
  });
  const result = await pairDeviceWithCode(client, 'correct-horse-battery');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'confirmation-required');
});

test('второе устройство: вход сразу удаётся, регистрация не пробуется', async () => {
  const client = fakeClient();
  const result = await pairDeviceWithCode(client, 'correct-horse-battery');
  assert.deepEqual(result, { ok: true, created: false });
  assert.deepEqual(client.calls.map((c) => c[0]), ['signIn']);
});

test('сбой сети на регистрации — понятная причина, не «неизвестная ошибка»', async () => {
  const client = fakeClient({
    signInError: { message: 'Invalid login credentials', status: 400 },
    signUpError: { message: 'fetch failed', status: 0 },
  });
  const result = await pairDeviceWithCode(client, 'correct-horse-battery');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'network');
});

test('прочий сбой регистрации помечен как unknown, а не выдаётся за network', async () => {
  const client = fakeClient({
    signInError: { message: 'Invalid login credentials', status: 400 },
    signUpError: { message: 'Something odd', status: 422 },
  });
  const result = await pairDeviceWithCode(client, 'correct-horse-battery');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'unknown');
});

test('unpairDevice выходит из сессии', async () => {
  const client = fakeClient();
  await unpairDevice(client);
  assert.deepEqual(client.calls, [['signOut']]);
});

test('isPaired смотрит на текущую сессию', async () => {
  const paired = fakeClient();
  paired.auth._session = { user: { id: 'u1' } };
  assert.equal(await isPaired(paired), true);

  const notPaired = fakeClient();
  assert.equal(await isPaired(notPaired), false);
});
