import assert from 'node:assert/strict';
import test from 'node:test';

import {
  overdueReminderKey,
  soonReminderKey,
  overdueProjectSessionReminderKey,
  soonProjectSessionReminderKey,
  healingReminderKey,
  healingReminderKeysForSession,
} from '../.test-dist/src/reminders/reminderKeys.js';
import { HEALING_STAGES } from '../.test-dist/src/reminders/buildReminders.js';

const client = { id: 'client-1', name: 'Анна' };
const project = { id: 'project-1', title: 'Дракон' };

test('overdueReminderKey carries the entry date, so rescheduling produces a different key', () => {
  const before = overdueReminderKey({ client, kind: 'session', id: 'session-1', date: '2026-01-10', time: '' });
  const after = overdueReminderKey({ client, kind: 'session', id: 'session-1', date: '2026-01-20', time: '' });
  assert.notEqual(before, after);
});

test('overdueReminderKey is stable for the same session/consultation and date', () => {
  const a = overdueReminderKey({ client, kind: 'consultation', id: 'consult-1', date: '2026-01-10', time: '' });
  const b = overdueReminderKey({ client, kind: 'consultation', id: 'consult-1', date: '2026-01-10', time: '' });
  assert.equal(a, b);
});

test('soonReminderKey carries date AND time, so rescheduling either produces a different key', () => {
  const base = { client, kind: 'session', id: 'session-1', date: '2026-01-10', time: '14:00' };
  const key = soonReminderKey(base);
  assert.notEqual(key, soonReminderKey({ ...base, date: '2026-01-11' }));
  assert.notEqual(key, soonReminderKey({ ...base, time: '15:00' }));
  assert.equal(key, soonReminderKey({ ...base }));
});

test('overdueProjectSessionReminderKey carries the session date', () => {
  const before = overdueProjectSessionReminderKey({ project, sessionId: 'session-1', date: '2026-01-10', time: '' });
  const after = overdueProjectSessionReminderKey({ project, sessionId: 'session-1', date: '2026-01-20', time: '' });
  assert.notEqual(before, after);
});

test('soonProjectSessionReminderKey carries date and time', () => {
  const base = { project, sessionId: 'session-1', date: '2026-01-10', time: '14:00' };
  const key = soonProjectSessionReminderKey(base);
  assert.notEqual(key, soonProjectSessionReminderKey({ ...base, date: '2026-01-11' }));
  assert.notEqual(key, soonProjectSessionReminderKey({ ...base, time: '15:00' }));
});

test('healingReminderKey stays per-stage (unchanged shape)', () => {
  const key = healingReminderKey({ client, sessionId: 'session-9', date: '2026-01-01', stage: 'day4' });
  assert.equal(key, healingReminderKey({ client, sessionId: 'session-9', date: '2099-12-31', stage: 'day4' }));
  assert.notEqual(key, healingReminderKey({ client, sessionId: 'session-9', date: '2026-01-01', stage: 'day15' }));
});

test('healingReminderKeysForSession returns one distinct key per HEALING_STAGES stage', () => {
  const keys = healingReminderKeysForSession('session-9');
  assert.equal(keys.length, HEALING_STAGES.length);
  assert.equal(new Set(keys).size, keys.length);
});

test('healingReminderKeysForSession keys match healingReminderKey for the same session/stage', () => {
  const keys = healingReminderKeysForSession('session-9');
  for (const { stage } of HEALING_STAGES) {
    const expected = healingReminderKey({ client, sessionId: 'session-9', date: '2026-01-01', stage });
    assert.ok(keys.includes(expected), `missing key for stage ${stage}`);
  }
});

test('healingReminderKeysForSession is scoped to the given session only', () => {
  const a = healingReminderKeysForSession('session-a');
  const b = healingReminderKeysForSession('session-b');
  assert.equal(a.filter((k) => b.includes(k)).length, 0);
});
