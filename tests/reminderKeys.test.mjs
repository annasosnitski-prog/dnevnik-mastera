import assert from 'node:assert/strict';
import test from 'node:test';

import {
  overdueReminderKey,
  overdueProjectSessionReminderKey,
  soonReminderKey,
  healingReminderKey,
  healingReminderKeysForSession,
} from '../.test-dist/src/reminders/reminderKeys.js';

function makeOverdueItem(overrides = {}) {
  return {
    client: { id: 'client-1', name: 'Анна' },
    kind: 'session',
    id: 'session-1',
    date: '2026-01-01',
    time: '',
    ...overrides,
  };
}

function makeProjectSessionItem(overrides = {}) {
  return {
    project: { id: 'project-1', title: 'Дракон' },
    sessionId: 'session-1',
    date: '2026-01-01',
    time: '',
    ...overrides,
  };
}

test('overdueReminderKey changes when the entry is rescheduled to a different (still past) date', () => {
  const before = overdueReminderKey(makeOverdueItem({ date: '2026-01-01' }));
  const after = overdueReminderKey(makeOverdueItem({ date: '2026-01-05' }));
  assert.notEqual(before, after);
});

test('overdueReminderKey is stable for the same id/kind/date', () => {
  const a = overdueReminderKey(makeOverdueItem({ date: '2026-01-01' }));
  const b = overdueReminderKey(makeOverdueItem({ date: '2026-01-01' }));
  assert.equal(a, b);
});

test('overdueProjectSessionReminderKey changes when the session is rescheduled to a different (still past) date', () => {
  const before = overdueProjectSessionReminderKey(makeProjectSessionItem({ date: '2026-01-01' }));
  const after = overdueProjectSessionReminderKey(makeProjectSessionItem({ date: '2026-01-05' }));
  assert.notEqual(before, after);
});

test('overdueProjectSessionReminderKey is stable for the same project/session/date', () => {
  const a = overdueProjectSessionReminderKey(makeProjectSessionItem({ date: '2026-01-01' }));
  const b = overdueProjectSessionReminderKey(makeProjectSessionItem({ date: '2026-01-01' }));
  assert.equal(a, b);
});

test('soonReminderKey is unaffected by this fix (unchanged shape)', () => {
  const key = soonReminderKey(makeOverdueItem({ kind: 'consultation', id: 'c-1' }));
  assert.equal(key, 'soon:consultation:c-1');
});

test('healingReminderKey changes between stages of the same session (day1 vs day4)', () => {
  const client = { id: 'client-1', name: 'Анна' };
  const day1 = healingReminderKey({ client, sessionId: 'session-1', date: '2026-01-01', stage: 'day1' });
  const day4 = healingReminderKey({ client, sessionId: 'session-1', date: '2026-01-01', stage: 'day4' });
  assert.notEqual(day1, day4);
});

test('healingReminderKeysForSession returns one key per stage, matching healingReminderKey for each', () => {
  const client = { id: 'client-1', name: 'Анна' };
  const keys = healingReminderKeysForSession('session-1');
  assert.equal(keys.length, 4);
  assert.deepEqual(
    keys,
    ['day1', 'day4', 'day15', 'day30'].map((stage) =>
      healingReminderKey({ client, sessionId: 'session-1', date: '2026-01-01', stage }),
    ),
  );
});

test('healingReminderKeysForSession is scoped to the given session only', () => {
  const keysA = healingReminderKeysForSession('session-a');
  const keysB = healingReminderKeysForSession('session-b');
  assert.equal(keysA.some((k) => keysB.includes(k)), false);
});
