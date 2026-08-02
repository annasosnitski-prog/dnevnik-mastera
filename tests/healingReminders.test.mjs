import assert from 'node:assert/strict';
import test from 'node:test';

import { healingReminders } from '../.test-dist/src/reminders/buildReminders.js';
import { healingReminderKey } from '../.test-dist/src/reminders/reminderKeys.js';
import { healingReminderMessage } from '../.test-dist/src/lib/reminderMessages.js';

function makeClient(overrides = {}) {
  return {
    id: 'client-1',
    name: 'Анна',
    surname: 'Соснитски',
    color: '#3E7CA6',
    language: 'ru',
    styles: [],
    style: '',
    sessions: [],
    consultations: [],
    notes: [],
    ...overrides,
  };
}

function makeSession(overrides = {}) {
  return {
    id: 'session-1',
    name: 'Сессия',
    cancelled: false,
    date: '2026-01-01',
    time: '',
    duration: '',
    style: '',
    area: '',
    colors: '',
    needles: '',
    skinReaction: '',
    note: '',
    photos: [],
    done: true,
    healed: false,
    projectId: null,
    ...overrides,
  };
}

// now = session date + N days, at local midday (so daysSince rounds cleanly
// regardless of the machine's timezone).
function nowAfterDays(sessionDate, days) {
  const d = new Date(`${sessionDate}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d;
}

test('healing reminders stay silent before day 1', () => {
  const client = makeClient({ sessions: [makeSession({ date: '2026-01-01' })] });
  assert.deepEqual(healingReminders([client], nowAfterDays('2026-01-01', 0)), []);
});

test('healing reminders step through day1 -> day4 -> day15 -> day30 windows', () => {
  const client = makeClient({ sessions: [makeSession({ date: '2026-01-01' })] });
  const stageAt = (days) => {
    const result = healingReminders([client], nowAfterDays('2026-01-01', days));
    return result[0]?.stage ?? null;
  };
  assert.equal(stageAt(1), 'day1');
  assert.equal(stageAt(3), 'day1');
  assert.equal(stageAt(4), 'day4');
  assert.equal(stageAt(14), 'day4');
  assert.equal(stageAt(15), 'day15');
  assert.equal(stageAt(29), 'day15');
  assert.equal(stageAt(30), 'day30');
  assert.equal(stageAt(90), 'day30'); // day30 has no upper bound
});

test('a session marked healed produces no healing reminder at any stage', () => {
  const client = makeClient({ sessions: [makeSession({ date: '2026-01-01', healed: true })] });
  for (const days of [1, 4, 15, 30, 60]) {
    assert.deepEqual(healingReminders([client], nowAfterDays('2026-01-01', days)), []);
  }
});

test('a not-done session never produces a healing reminder', () => {
  const client = makeClient({ sessions: [makeSession({ date: '2026-01-01', done: false })] });
  assert.deepEqual(healingReminders([client], nowAfterDays('2026-01-01', 30)), []);
});

test('healingReminderKey is distinct per stage, so dismissing one stage does not hide the next', () => {
  const client = makeClient({ sessions: [makeSession({ date: '2026-01-01', id: 'session-9' })] });
  const keys = ['day1', 'day4', 'day15', 'day30'].map((stage) =>
    healingReminderKey({ client, sessionId: 'session-9', date: '2026-01-01', stage }),
  );
  assert.equal(new Set(keys).size, 4);
});

test('healingReminderMessage returns a distinct, non-empty text per stage and language', () => {
  for (const language of ['ru', 'en', 'he']) {
    const client = makeClient({ language });
    const texts = ['day1', 'day4', 'day15', 'day30'].map((stage) => healingReminderMessage(client, stage));
    for (const text of texts) assert.ok(text.length > 0);
    assert.equal(new Set(texts).size, 4);
  }
});
