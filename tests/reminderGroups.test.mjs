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

// ── forceOpen: динамический переход к единственной непустой группе ─────────
// Блокирующая дыра из ревью: useState(defaultOpen) применяется только при
// монтировании, поэтому уже смонтированная секция (сосед которой опустел)
// не раскрывалась бы сама по себе только через defaultOpen. RemindersSection
// пересчитывает `forceOpen = visibleGroups.length === 1` на каждый рендер —
// этот блок тестирует именно эту производную величину (то же выражение, что
// использует компонент) на смене counts между рендерами, эмулируя переход
// «healing+stale видимы» → «stale исчез» → «healing одна».
function forceOpenFor(counts) {
  return buildVisibleReminderGroups(counts).length === 1;
}

test('dynamic scenario: healing+stale visible with normal defaultOpen=false, then stale disappears — healing alone gets forceOpen=true', () => {
  const before = buildVisibleReminderGroups({ ...EMPTY_COUNTS, healing: 1, stale: 1 });
  assert.deepEqual(Object.fromEntries(before.map((g) => [g.id, g.defaultOpen])), { healing: false, stale: false });
  assert.equal(forceOpenFor({ ...EMPTY_COUNTS, healing: 1, stale: 1 }), false);

  // stale's only card gets hidden — its count drops to 0.
  const after = buildVisibleReminderGroups({ ...EMPTY_COUNTS, healing: 1, stale: 0 });
  assert.deepEqual(after.map((g) => g.id), ['healing']);
  assert.equal(forceOpenFor({ ...EMPTY_COUNTS, healing: 1, stale: 0 }), true);
});

// 1. Единственная stale раскрыта.
test('forceOpen is true when stale is the sole visible group', () => {
  assert.equal(forceOpenFor({ ...EMPTY_COUNTS, stale: 2 }), true);
});

// 2. Единственная healing раскрыта.
test('forceOpen is true when healing is the sole visible group', () => {
  assert.equal(forceOpenFor({ ...EMPTY_COUNTS, healing: 4 }), true);
});

// 3. При двух группах forceOpen=false.
test('forceOpen is false whenever two or more groups are visible', () => {
  assert.equal(forceOpenFor({ ...EMPTY_COUNTS, action: 1, tasks: 1 }), false);
  assert.equal(forceOpenFor({ action: 1, tasks: 1, soon: 1, healing: 1, stale: 1 }), false);
});

test('forceOpen is false when nothing is visible', () => {
  assert.equal(forceOpenFor(EMPTY_COUNTS), false);
});

// 6. Переход 1 группа → 2 группы: forceOpen становится false снова — сам по
// себе этот пересчёт не "закрывает" уже раскрытую секцию (это гарантирует
// effectiveOpen = forceOpen || open в компоненте — open остаётся true,
// выставленный эффектом на предыдущем рендере; здесь фиксируем только то,
// что forceOpen корректно возвращается к false, когда появляется сосед).
test('dynamic scenario: a second group appearing turns forceOpen back to false (component keeps the group open via its own `open` state, not tested here)', () => {
  assert.equal(forceOpenFor({ ...EMPTY_COUNTS, healing: 1 }), true);
  assert.equal(forceOpenFor({ ...EMPTY_COUNTS, healing: 1, stale: 1 }), false);
});
