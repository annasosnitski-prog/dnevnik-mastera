import assert from 'node:assert/strict';
import test from 'node:test';

import { stampUpdatedAt } from '../.test-dist/src/storage/updatedAt.js';

const now = () => '2026-09-08T12:00:00.000Z';

test('обычная запись получает время правки «сейчас»', () => {
  const stamped = stampUpdatedAt({ id: 'c1', name: 'Аня' }, { now });
  assert.equal(stamped.updatedAt, '2026-09-08T12:00:00.000Z');
  assert.equal(stamped.name, 'Аня');
});

test('повторная запись сдвигает время правки вперёд', () => {
  const first = stampUpdatedAt({ id: 'c1' }, { now: () => '2026-01-01T00:00:00.000Z' });
  const second = stampUpdatedAt(first, { now });
  assert.equal(second.updatedAt, '2026-09-08T12:00:00.000Z');
});

test('исходная запись не меняется — штамп возвращает копию', () => {
  const original = { id: 'c1' };
  stampUpdatedAt(original, { now });
  assert.equal('updatedAt' in original, false);
});

// ── Восстановление из копии ──────────────────────────────────────────────
// Здесь и живёт вся опасность: проштампованная «сейчас» старая запись
// выиграет слияние и затрёт то, что на другом устройстве реально новее.

test('при восстановлении из копии время правки сохраняется, а не становится «сейчас»', () => {
  const fromBackup = { id: 'c1', updatedAt: '2025-05-05T10:00:00.000Z' };
  const stamped = stampUpdatedAt(fromBackup, { preserveUpdatedAt: true, now });
  assert.equal(stamped.updatedAt, '2025-05-05T10:00:00.000Z');
});

test('старая копия без поля берёт время создания записи, а не «сейчас»', () => {
  // Копии, сделанные до появления поля. «Сейчас» тут неправда: эту запись
  // никто только что не правил.
  const old = { id: 'c1', createdDate: '2024-03-01T09:00:00.000Z' };
  const stamped = stampUpdatedAt(old, { preserveUpdatedAt: true, now });
  assert.equal(stamped.updatedAt, '2024-03-01T09:00:00.000Z');
});

test('если нет ни поля, ни даты создания — остаётся «сейчас» как последнее средство', () => {
  const stamped = stampUpdatedAt({ id: 'c1' }, { preserveUpdatedAt: true, now });
  assert.equal(stamped.updatedAt, '2026-09-08T12:00:00.000Z');
});

test('пустая строка в createdDate не считается датой', () => {
  const stamped = stampUpdatedAt({ id: 'c1', createdDate: '' }, { preserveUpdatedAt: true, now });
  assert.equal(stamped.updatedAt, '2026-09-08T12:00:00.000Z');
});
