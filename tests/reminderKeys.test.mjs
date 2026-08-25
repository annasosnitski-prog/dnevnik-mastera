import assert from 'node:assert/strict';
import test from 'node:test';

import {
  overdueReminderKey,
  soonReminderKey,
  overdueProjectSessionReminderKey,
  soonProjectSessionReminderKey,
  overdueProjectConsultationReminderKey,
  soonProjectConsultationReminderKey,
  healingReminderKey,
  healingReminderKeysForSession,
  staleProjectReminderKey,
} from '../.test-dist/src/reminders/reminderKeys.js';
import { HEALING_STAGES } from '../.test-dist/src/reminders/buildReminders.js';
import { dismissReminder, filterVisibleReminders } from '../.test-dist/src/reminders/reminderState.js';

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

test('overdueProjectConsultationReminderKey carries the consultation date', () => {
  const before = overdueProjectConsultationReminderKey({ project, consultationId: 'consult-1', date: '2026-01-10', time: '' });
  const after = overdueProjectConsultationReminderKey({ project, consultationId: 'consult-1', date: '2026-01-20', time: '' });
  assert.notEqual(before, after);
});

test('soonProjectConsultationReminderKey carries date and time', () => {
  const base = { project, consultationId: 'consult-1', date: '2026-01-10', time: '14:00' };
  const key = soonProjectConsultationReminderKey(base);
  assert.notEqual(key, soonProjectConsultationReminderKey({ ...base, date: '2026-01-11' }));
  assert.notEqual(key, soonProjectConsultationReminderKey({ ...base, time: '15:00' }));
});

// @deprecated-ключи старого пути заживления (см. tests/healingReminders.test.mjs).
// Ключи нового цикла проверяются в tests/healingCycle.test.mjs.
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

test('staleProjectReminderKey carries lastActivityDate, so fresh activity produces a different key', () => {
  const before = staleProjectReminderKey({ project, lastActivityDate: '2026-01-01', daysSince: 21 });
  const after = staleProjectReminderKey({ project, lastActivityDate: '2026-02-15', daysSince: 3 });
  assert.notEqual(before, after);
});

test('staleProjectReminderKey is stable for the same project and lastActivityDate', () => {
  const a = staleProjectReminderKey({ project, lastActivityDate: '2026-01-01', daysSince: 21 });
  const b = staleProjectReminderKey({ project, lastActivityDate: '2026-01-01', daysSince: 40 });
  assert.equal(a, b);
});

// Скрытие карточки застоя за один период не должно скрывать карточку за
// следующий, более поздний период застоя того же проекта (M4, scenario 22) —
// тот же принцип, что overdueReminderKey/soonReminderKey уже используют
// для даты сессии/консультации.
test('dismissing a stale-project reminder for one period does not hide it for a later, different period', () => {
  const firstPeriod = { project, lastActivityDate: '2026-01-01', daysSince: 30 };
  const dismissedState = dismissReminder({ dismissedIds: [], snoozed: {} }, staleProjectReminderKey(firstPeriod));

  // The project moved, then stalled again later — a NEW lastActivityDate.
  const secondPeriod = { project, lastActivityDate: '2026-04-01', daysSince: 30 };
  const visible = filterVisibleReminders([secondPeriod], staleProjectReminderKey, dismissedState, new Date('2026-05-01'));

  assert.deepEqual(visible, [secondPeriod]);
});

test('dismissing a stale-project reminder still hides the exact same period if it recurs unchanged', () => {
  const period = { project, lastActivityDate: '2026-01-01', daysSince: 30 };
  const dismissedState = dismissReminder({ dismissedIds: [], snoozed: {} }, staleProjectReminderKey(period));

  const visible = filterVisibleReminders([period], staleProjectReminderKey, dismissedState, new Date('2026-05-01'));

  assert.deepEqual(visible, []);
});
