import assert from 'node:assert/strict';
import test from 'node:test';
import { isAuthLikeSyncError } from '../.test-dist/src/sync/syncRetryPolicy.js';

// PR #302 завёл повтор всего прогона на ЛЮБОЙ сбой — а прогон тяжёлый
// (поднимает в память все записи стора). Следующий PR сузил повтор до
// сбоев, похожих на ту самую причину, ради которой его вообще заводили:
// Supabase иногда отвечает 401 на первый запрос сразу после входа.

test('HTTP-статус авторизации — повторяем', () => {
  assert.equal(isAuthLikeSyncError({ status: 401 }), true);
  assert.equal(isAuthLikeSyncError({ status: 403 }), true);
});

test('другой статус — не считаем ошибкой авторизации', () => {
  assert.equal(isAuthLikeSyncError({ status: 500 }), false);
  assert.equal(isAuthLikeSyncError({ status: 400 }), false);
});

test('сообщение с признаками JWT/Unauthorized/not authenticated — повторяем', () => {
  assert.equal(isAuthLikeSyncError(new Error('JWT expired')), true);
  assert.equal(isAuthLikeSyncError(new Error('Unauthorized')), true);
  assert.equal(isAuthLikeSyncError('the request is not authenticated'), true);
  assert.equal(isAuthLikeSyncError(new Error('401 from server')), true);
});

test('обычный сбой (сеть, память, RLS) — НЕ повторяем', () => {
  assert.equal(isAuthLikeSyncError(new Error('Failed to fetch')), false);
  assert.equal(isAuthLikeSyncError(new Error('out of memory')), false);
  assert.equal(isAuthLikeSyncError(new Error('permission denied for table sync_content_entries')), false);
});

test('пустые/незнакомые значения не бросают и не считаются авторизацией', () => {
  assert.equal(isAuthLikeSyncError(null), false);
  assert.equal(isAuthLikeSyncError(undefined), false);
  assert.equal(isAuthLikeSyncError({}), false);
  assert.equal(isAuthLikeSyncError(''), false);
});
