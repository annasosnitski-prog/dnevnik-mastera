import assert from 'node:assert/strict';
import test from 'node:test';

import {
  backupAgeDays,
  backupStatus,
  backupStatusText,
  persistenceText,
  formatMegabytes,
  BACKUP_REMINDER_AFTER_DAYS,
} from '../.test-dist/src/lib/storageHealth.js';

const at = (iso) => new Date(iso);

test('возраст копии считается по границам суток, а не по «ровно 24 часа»', () => {
  // Копия вчера поздно вечером — это «вчера», а не «сегодня, 0 дней».
  assert.equal(backupAgeDays('2026-08-13T23:00:00.000Z', at('2026-08-14T09:00:00.000Z')), 1);
  assert.equal(backupAgeDays('2026-08-14T01:00:00.000Z', at('2026-08-14T23:00:00.000Z')), 0);
  assert.equal(backupAgeDays('2026-08-01T12:00:00.000Z', at('2026-08-14T12:00:00.000Z')), 13);
});

test('«копию не делали» — отдельное состояние, а не ноль дней', () => {
  assert.equal(backupAgeDays(null, at('2026-08-14T12:00:00.000Z')), null);
  assert.equal(backupAgeDays('', at('2026-08-14T12:00:00.000Z')), null);
  assert.equal(backupAgeDays('не дата', at('2026-08-14T12:00:00.000Z')), null);
  assert.deepEqual(backupStatus(null, at('2026-08-14T12:00:00.000Z')), { kind: 'never' });
});

test('отметка из будущего не выдаёт отрицательный возраст', () => {
  // Переставленные часы или копия с другого устройства — не повод считать,
  // что копии нет вовсе.
  assert.equal(backupAgeDays('2026-09-01T12:00:00.000Z', at('2026-08-14T12:00:00.000Z')), 0);
});

test('напоминать начинаем ровно на пороге, не раньше', () => {
  const now = at('2026-08-14T12:00:00.000Z');
  const daysAgo = (n) => new Date(Date.UTC(2026, 7, 14 - n, 12)).toISOString();

  assert.equal(backupStatus(daysAgo(BACKUP_REMINDER_AFTER_DAYS - 1), now).kind, 'fresh');
  assert.equal(backupStatus(daysAgo(BACKUP_REMINDER_AFTER_DAYS), now).kind, 'stale');
  assert.equal(backupStatus(daysAgo(BACKUP_REMINDER_AFTER_DAYS + 30), now).kind, 'stale');
});

test('порог можно задать явно — правило одно, число настраивается', () => {
  const now = at('2026-08-14T12:00:00.000Z');
  const threeDaysAgo = new Date(Date.UTC(2026, 7, 11, 12)).toISOString();
  assert.equal(backupStatus(threeDaysAgo, now, 3).kind, 'stale');
  assert.equal(backupStatus(threeDaysAgo, now, 7).kind, 'fresh');
});

test('подпись про копию читается человеком', () => {
  assert.equal(backupStatusText({ kind: 'never' }), 'Копию ещё ни разу не делали');
  assert.equal(backupStatusText({ kind: 'fresh', days: 0 }), 'Последняя копия — сегодня');
  assert.equal(backupStatusText({ kind: 'fresh', days: 1 }), 'Последняя копия — вчера');
  assert.equal(backupStatusText({ kind: 'stale', days: 20 }), 'Последняя копия — 20 дн. назад');
});

test('«браузер не умеет» — не то же самое, что «отказал»', () => {
  assert.match(persistenceText('persisted'), /запрещено удалять/);
  assert.match(persistenceText('not-persisted'), /может удалить/);
  assert.match(persistenceText('unsupported'), /не сообщает/);
  // Неизвестность не должна пугать словом «может удалить».
  assert.doesNotMatch(persistenceText('unsupported'), /может удалить/);
});

test('объём показывается в мегабайтах и не завышается', () => {
  assert.equal(formatMegabytes(0), 'меньше 0,1 МБ');
  assert.equal(formatMegabytes(1024 * 1024), '1 МБ');
  // 1.99 МБ округляется вниз до 1,9 — показать больше, чем есть, хуже.
  assert.equal(formatMegabytes(Math.round(1.99 * 1024 * 1024)), '1,9 МБ');
  assert.equal(formatMegabytes(undefined), null);
  assert.equal(formatMegabytes(-5), null);
  assert.equal(formatMegabytes(Number.NaN), null);
});
