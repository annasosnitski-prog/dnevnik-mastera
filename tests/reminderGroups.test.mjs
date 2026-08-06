import assert from 'node:assert/strict';
import test from 'node:test';

import {
  REMINDER_GROUPS,
  buildVisibleReminderGroups,
  totalReminderCount,
} from '../.test-dist/src/components/reminders/reminderGroups.js';

const EMPTY_COUNTS = { action: 0, tasks: 0, soon: 0, healing: 0, stale: 0 };

// 7. Пустые группы не отображаются.
test('buildVisibleReminderGroups excludes every empty group', () => {
  const groups = buildVisibleReminderGroups(EMPTY_COUNTS);
  assert.deepEqual(groups, []);
});

test('buildVisibleReminderGroups includes only the non-empty groups', () => {
  const groups = buildVisibleReminderGroups({ ...EMPTY_COUNTS, action: 2, healing: 1 });
  assert.deepEqual(groups.map((g) => g.id), ['action', 'healing']);
});

// 8. Порядок групп фиксирован: Требует действия → Задачи → Скоро →
// Контроль заживления → Давно не двигалось — независимо от того, в каком
// порядке заполнены counts.
test('buildVisibleReminderGroups keeps the fixed order regardless of which groups are non-empty', () => {
  const groups = buildVisibleReminderGroups({ action: 1, tasks: 1, soon: 1, healing: 1, stale: 1 });
  assert.deepEqual(groups.map((g) => g.id), ['action', 'tasks', 'soon', 'healing', 'stale']);
});

test('REMINDER_GROUPS itself is defined in the required fixed order with the required titles', () => {
  assert.deepEqual(REMINDER_GROUPS.map((g) => g.id), ['action', 'tasks', 'soon', 'healing', 'stale']);
  assert.deepEqual(REMINDER_GROUPS.map((g) => g.title), [
    'Требует действия',
    'Задачи',
    'Скоро',
    'Контроль заживления',
    'Давно не двигалось',
  ]);
});

// 9. Общий счётчик равен сумме пяти видимых групп.
test('totalReminderCount sums all five groups', () => {
  const counts = { action: 3, tasks: 1, soon: 2, healing: 0, stale: 4 };
  assert.equal(totalReminderCount(counts), 10);
});

test('totalReminderCount is 0 when every group is empty', () => {
  assert.equal(totalReminderCount(EMPTY_COUNTS), 0);
});

// Group definitions default open/collapsed per spec (M5A, п. 4): action,
// tasks, soon default open; healing, stale default collapsed.
test('default openness matches the required groups: action/tasks/soon open, healing/stale collapsed', () => {
  const counts = { action: 1, tasks: 1, soon: 1, healing: 1, stale: 1 };
  const groups = buildVisibleReminderGroups(counts);
  const openById = Object.fromEntries(groups.map((g) => [g.id, g.defaultOpen]));
  assert.deepEqual(openById, { action: true, tasks: true, soon: true, healing: false, stale: false });
});

// 12. При одной непустой группе она раскрыта автоматически, даже если её
// обычный defaultOpen — false (healing/stale).
test('a single non-empty group is open by default even if its usual defaultOpen is false', () => {
  const groups = buildVisibleReminderGroups({ ...EMPTY_COUNTS, healing: 3 });
  assert.equal(groups.length, 1);
  assert.equal(groups[0].id, 'healing');
  assert.equal(groups[0].defaultOpen, true);
});

test('a single non-empty group (stale) is also forced open', () => {
  const groups = buildVisibleReminderGroups({ ...EMPTY_COUNTS, stale: 1 });
  assert.equal(groups[0].defaultOpen, true);
});

test('two or more non-empty groups keep their own normal defaultOpen (no forcing)', () => {
  const groups = buildVisibleReminderGroups({ ...EMPTY_COUNTS, healing: 1, stale: 1 });
  const openById = Object.fromEntries(groups.map((g) => [g.id, g.defaultOpen]));
  assert.deepEqual(openById, { healing: false, stale: false });
});

test('buildVisibleReminderGroups carries the count through unchanged', () => {
  const groups = buildVisibleReminderGroups({ ...EMPTY_COUNTS, action: 5 });
  assert.equal(groups[0].count, 5);
});

// 10. Undo-баннеры не входят в общий счётчик — структурно гарантировано:
// ReminderGroupCounts не содержит поля для баннеров вовсе, totalReminderCount
// суммирует только пять групп.
test('totalReminderCount has no notion of hidden banners at all', () => {
  // Banners aren't part of ReminderGroupCounts — passing only the five group
  // counts (no banners field) already proves this structurally; this test
  // just pins the sum so a future refactor can't silently add one in.
  assert.equal(totalReminderCount({ action: 1, tasks: 0, soon: 0, healing: 0, stale: 0 }), 1);
});
