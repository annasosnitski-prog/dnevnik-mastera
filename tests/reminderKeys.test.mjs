import assert from 'node:assert/strict';
import test from 'node:test';

import {
  overdueReminderKey,
  overdueProjectSessionReminderKey,
  soonReminderKey,
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
