import assert from 'node:assert/strict';
import test from 'node:test';

import { addHiddenBanner, removeHiddenBanner } from '../.test-dist/src/reminders/hiddenReminderBanners.js';
import { healingReminderKeysForSession } from '../.test-dist/src/reminders/reminderKeys.js';

// RemindersSection.tsx wires these pure list operations to React state +
// per-banner setTimeout (one closure per id, stored keyed by id — see the
// component) — these tests exercise exactly the same list logic the
// component's showHiddenBanner/dismissHiddenBanner/restoreHiddenBanner
// drive, without needing a DOM renderer.

// 1. Быстро скрыты два разных напоминания — отображаются две возможности «Вернуть».
test('hiding two different reminders in quick succession produces two independent banners', () => {
  let banners = [];
  banners = addHiddenBanner(banners, 'banner-1', ['overdue:session:s1:2026-01-01:'], 1000);
  banners = addHiddenBanner(banners, 'banner-2', ['soon:session:s2:2026-01-02:10:00'], 1001);

  assert.equal(banners.length, 2);
  assert.deepEqual(
    banners.map((b) => b.id),
    ['banner-1', 'banner-2'],
  );
});

// 2. Возврат первого не восстанавливает второе.
test('restoring the first banner does not remove or affect the second', () => {
  let banners = [];
  banners = addHiddenBanner(banners, 'banner-1', ['key-1'], 1000);
  banners = addHiddenBanner(banners, 'banner-2', ['key-2'], 1001);

  const afterRestoringFirst = removeHiddenBanner(banners, 'banner-1');

  assert.equal(afterRestoringFirst.length, 1);
  assert.equal(afterRestoringFirst[0].id, 'banner-2');
  assert.deepEqual(afterRestoringFirst[0].keys, ['key-2']);
});

// 3. Возврат второго не восстанавливает первое.
test('restoring the second banner does not remove or affect the first', () => {
  let banners = [];
  banners = addHiddenBanner(banners, 'banner-1', ['key-1'], 1000);
  banners = addHiddenBanner(banners, 'banner-2', ['key-2'], 1001);

  const afterRestoringSecond = removeHiddenBanner(banners, 'banner-2');

  assert.equal(afterRestoringSecond.length, 1);
  assert.equal(afterRestoringSecond[0].id, 'banner-1');
  assert.deepEqual(afterRestoringSecond[0].keys, ['key-1']);
});

// 4. Истечение таймера одного баннера не удаляет другой — the timeout
// callback calls exactly this same removeHiddenBanner(banners, id), so this
// is the same assertion as scenarios 2/3 from the timer's point of view.
test('one banner timing out (removeHiddenBanner by its own id) leaves every other banner untouched', () => {
  let banners = [];
  banners = addHiddenBanner(banners, 'banner-1', ['key-1'], 1000);
  banners = addHiddenBanner(banners, 'banner-2', ['key-2'], 1001);
  banners = addHiddenBanner(banners, 'banner-3', ['key-3'], 1002);

  const afterFirstExpires = removeHiddenBanner(banners, 'banner-1');

  assert.equal(afterFirstExpires.length, 2);
  assert.deepEqual(
    afterFirstExpires.map((b) => b.id),
    ['banner-2', 'banner-3'],
  );
});

// 5. Баннер для четырёх стадий заживления восстанавливает именно свои четыре ключа.
test('a healing "не напоминать больше" banner carries exactly its own session\'s four stage keys', () => {
  let banners = [];
  const keys = healingReminderKeysForSession('session-42');
  banners = addHiddenBanner(banners, 'banner-healing', keys, 1000);

  assert.equal(keys.length, 4);
  assert.deepEqual(banners[0].keys, keys);
  assert.ok(banners[0].keys.every((k) => k.includes('session-42')));
});

// 6. Одновременный баннер заживления и обычный баннер работают независимо.
test('a simultaneous healing banner and a plain single-key banner stay independent', () => {
  let banners = [];
  const healingKeys = healingReminderKeysForSession('session-42');
  banners = addHiddenBanner(banners, 'banner-healing', healingKeys, 1000);
  banners = addHiddenBanner(banners, 'banner-plain', ['overdue:session:other:2026-01-01:'], 1001);

  assert.equal(banners.length, 2);

  // Restoring the plain one leaves the healing banner (and its own four
  // keys) completely intact.
  const afterPlainRestored = removeHiddenBanner(banners, 'banner-plain');
  assert.equal(afterPlainRestored.length, 1);
  assert.equal(afterPlainRestored[0].id, 'banner-healing');
  assert.deepEqual(afterPlainRestored[0].keys, healingKeys);

  // And the reverse: restoring the healing one first leaves the plain banner intact.
  const afterHealingRestored = removeHiddenBanner(banners, 'banner-healing');
  assert.equal(afterHealingRestored.length, 1);
  assert.equal(afterHealingRestored[0].id, 'banner-plain');
  assert.deepEqual(afterHealingRestored[0].keys, ['overdue:session:other:2026-01-01:']);
});

test('addHiddenBanner does not mutate the input array', () => {
  const original = [];
  const updated = addHiddenBanner(original, 'banner-1', ['key-1'], 1000);
  assert.deepEqual(original, []);
  assert.equal(updated.length, 1);
});

test('removeHiddenBanner is a no-op (new array, same contents) for an unknown id', () => {
  const banners = [{ id: 'banner-1', keys: ['key-1'], createdAt: 1000 }];
  const result = removeHiddenBanner(banners, 'unknown');
  assert.deepEqual(result, banners);
});
