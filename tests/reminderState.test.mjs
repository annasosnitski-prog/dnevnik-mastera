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

const EMPTY = { dismissedIds: [], snoozed: {} };
const NOW = new Date('2026-02-01T12:00:00');

test('normalizeReminderState accepts the legacy plain-array format', () => {
  const state = normalizeReminderState(['a', 'b', 'a']);
  assert.deepEqual(state, { dismissedIds: ['a', 'b', 'a'], snoozed: {} });
});

test('normalizeReminderState accepts the current object format', () => {
  const state = normalizeReminderState({ dismissedIds: ['a'], snoozed: { b: '2026-03-01T00:00:00.000Z' } });
  assert.deepEqual(state, { dismissedIds: ['a'], snoozed: { b: '2026-03-01T00:00:00.000Z' } });
});

test('normalizeReminderState never throws on garbage input', () => {
  for (const bad of [null, undefined, 42, 'nope', { dismissedIds: 5, snoozed: 'nope' }]) {
    assert.deepEqual(normalizeReminderState(bad), EMPTY);
  }
});

test('dismissReminder adds the key once and is idempotent', () => {
  let state = dismissReminder(EMPTY, 'k1');
  assert.deepEqual(state.dismissedIds, ['k1']);
  state = dismissReminder(state, 'k1');
  assert.deepEqual(state.dismissedIds, ['k1']);
});

test('snoozeReminder sets showAfter and clears a prior dismiss on the same key', () => {
  let state = dismissReminder(EMPTY, 'k1');
  state = snoozeReminder(state, 'k1', '2026-03-01T00:00:00.000Z');
  assert.deepEqual(state.dismissedIds, []);
  assert.equal(state.snoozed.k1, '2026-03-01T00:00:00.000Z');
});

test('restoreReminder clears both dismissed and snoozed state for a key', () => {
  let state = dismissReminder(EMPTY, 'k1');
  state = snoozeReminder(state, 'k2', '2026-03-01T00:00:00.000Z');
  state = restoreReminder(state, 'k1');
  state = restoreReminder(state, 'k2');
  assert.deepEqual(state, EMPTY);
});

test('restoreReminder is a no-op (same reference) when the key is neither dismissed nor snoozed', () => {
  const state = dismissReminder(EMPTY, 'k1');
  assert.equal(restoreReminder(state, 'unrelated'), state);
});

test('restoreReminder only affects the given key, leaving others untouched', () => {
  let state = dismissReminder(EMPTY, 'k1');
  state = dismissReminder(state, 'k2');
  state = restoreReminder(state, 'k1');
  assert.deepEqual(state.dismissedIds, ['k2']);
});

test('isReminderSnoozed is true before showAfter and false after', () => {
  const state = snoozeReminder(EMPTY, 'k1', '2026-02-05T00:00:00.000Z');
  assert.equal(isReminderSnoozed(state, 'k1', new Date('2026-02-01T00:00:00')), true);
  assert.equal(isReminderSnoozed(state, 'k1', new Date('2026-02-10T00:00:00')), false);
});

test('isReminderSnoozed treats a corrupted showAfter as not-snoozed', () => {
  const state = { dismissedIds: [], snoozed: { k1: 'not-a-date' } };
  assert.equal(isReminderSnoozed(state, 'k1', NOW), false);
});

test('filterVisibleReminders excludes dismissed and currently-snoozed items, keeps the rest', () => {
  let state = dismissReminder(EMPTY, 'hidden');
  state = snoozeReminder(state, 'snoozed-future', '2026-03-01T00:00:00.000Z');
  const items = [{ id: 'hidden' }, { id: 'snoozed-future' }, { id: 'visible' }];
  const visible = filterVisibleReminders(items, (it) => it.id, state, NOW);
  assert.deepEqual(visible.map((it) => it.id), ['visible']);
});

test('filterVisibleReminders re-shows an item once its snooze window has passed', () => {
  const state = snoozeReminder(EMPTY, 'k1', '2026-01-15T00:00:00.000Z');
  const items = [{ id: 'k1' }];
  assert.deepEqual(filterVisibleReminders(items, (it) => it.id, state, NOW), items);
});

test('removeExpiredSnoozes drops only past showAfter entries, keeps future ones', () => {
  let state = snoozeReminder(EMPTY, 'past', '2026-01-01T00:00:00.000Z');
  state = snoozeReminder(state, 'future', '2026-03-01T00:00:00.000Z');
  const cleaned = removeExpiredSnoozes(state, NOW);
  assert.deepEqual(cleaned.snoozed, { future: '2026-03-01T00:00:00.000Z' });
});

test('removeExpiredSnoozes returns the same reference when nothing changed', () => {
  const state = snoozeReminder(EMPTY, 'future', '2026-03-01T00:00:00.000Z');
  assert.equal(removeExpiredSnoozes(state, NOW), state);
});

test('a dismiss+snooze+restore round trip never mutates the input state object', () => {
  const original = { dismissedIds: ['x'], snoozed: { y: '2026-03-01T00:00:00.000Z' } };
  const snapshot = JSON.parse(JSON.stringify(original));
  dismissReminder(original, 'z');
  snoozeReminder(original, 'x', '2026-04-01T00:00:00.000Z');
  restoreReminder(original, 'y');
  removeExpiredSnoozes(original, NOW);
  assert.deepEqual(original, snapshot);
});

test('isReminderDismissed only matches an exact key', () => {
  const state = dismissReminder(EMPTY, 'overdue:session:s1:2026-01-01');
  assert.equal(isReminderDismissed(state, 'overdue:session:s1:2026-01-01'), true);
  assert.equal(isReminderDismissed(state, 'overdue:session:s1:2026-01-02'), false);
});
