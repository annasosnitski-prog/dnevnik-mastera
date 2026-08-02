import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeReminderState,
  isReminderDismissed,
  isReminderSnoozed,
  filterVisibleReminders,
  dismissReminder,
  snoozeReminder,
  restoreReminder,
  removeExpiredSnoozes,
} from '../.test-dist/src/reminders/reminderState.js';

test('dismissReminder adds the key once, restoreReminder removes it again', () => {
  let state = { dismissedIds: [], snoozed: {} };
  state = dismissReminder(state, 'overdue:session:1:2026-01-01');
  assert.equal(isReminderDismissed(state, 'overdue:session:1:2026-01-01'), true);
  state = restoreReminder(state, 'overdue:session:1:2026-01-01');
  assert.equal(isReminderDismissed(state, 'overdue:session:1:2026-01-01'), false);
});

test('restoreReminder also clears a snooze on the same key', () => {
  let state = { dismissedIds: [], snoozed: {} };
  state = snoozeReminder(state, 'task:1', new Date('2099-01-01').toISOString());
  assert.equal(isReminderSnoozed(state, 'task:1', new Date('2026-01-01')), true);
  state = restoreReminder(state, 'task:1');
  assert.equal(isReminderSnoozed(state, 'task:1', new Date('2026-01-01')), false);
  assert.equal('task:1' in state.snoozed, false);
});

test('restoreReminder on a key that is neither dismissed nor snoozed is a no-op (same reference)', () => {
  const state = { dismissedIds: ['other'], snoozed: {} };
  assert.strictEqual(restoreReminder(state, 'not-there'), state);
});

test('snoozeReminder clears a prior dismiss on the same key', () => {
  let state = { dismissedIds: ['x'], snoozed: {} };
  state = snoozeReminder(state, 'x', new Date('2099-01-01').toISOString());
  assert.equal(isReminderDismissed(state, 'x'), false);
  assert.equal(isReminderSnoozed(state, 'x', new Date('2026-01-01')), true);
});

test('filterVisibleReminders drops dismissed and snoozed items, keeps the rest', () => {
  const state = dismissReminder({ dismissedIds: [], snoozed: { b: new Date('2099-01-01').toISOString() } }, 'a');
  const items = ['a', 'b', 'c'];
  const visible = filterVisibleReminders(items, (x) => x, state, new Date('2026-01-01'));
  assert.deepEqual(visible, ['c']);
});

test('removeExpiredSnoozes drops only snoozes whose showAfter has passed', () => {
  const state = {
    dismissedIds: [],
    snoozed: { past: new Date('2020-01-01').toISOString(), future: new Date('2099-01-01').toISOString() },
  };
  const cleaned = removeExpiredSnoozes(state, new Date('2026-01-01'));
  assert.deepEqual(Object.keys(cleaned.snoozed), ['future']);
});

test('normalizeReminderState upgrades the legacy string-array format', () => {
  const state = normalizeReminderState(['legacy-key']);
  assert.deepEqual(state, { dismissedIds: ['legacy-key'], snoozed: {} });
});

test('normalizeReminderState falls back to empty state for garbage input', () => {
  assert.deepEqual(normalizeReminderState(42), { dismissedIds: [], snoozed: {} });
  assert.deepEqual(normalizeReminderState(null), { dismissedIds: [], snoozed: {} });
});
