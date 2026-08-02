import assert from 'node:assert/strict';
import test from 'node:test';

import { overdueEntries } from '../.test-dist/src/reminders/buildReminders.js';

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

function makeConsultation(overrides = {}) {
  return {
    id: 'consult-1',
    date: '2026-01-01',
    time: '',
    area: '',
    style: '',
    generalNotes: '',
    feeling: '',
    creative: '',
    inspirationSources: '',
    urgency: 'normal',
    photos: [],
    done: false,
    cancelled: false,
    status: 'active',
    convertedToSessionId: null,
    createdDate: '2026-01-01',
    projectId: null,
    ...overrides,
  };
}

const NOW = new Date('2026-02-01T12:00:00');

test('an active past-due consultation is overdue', () => {
  const client = makeClient({ consultations: [makeConsultation({ date: '2026-01-01' })] });
  const result = overdueEntries([client], NOW);
  assert.equal(result.length, 1);
  assert.equal(result[0].kind, 'consultation');
});

test('a converted consultation never appears as overdue, even with done:false left over from before the fix', () => {
  const client = makeClient({
    consultations: [makeConsultation({ date: '2026-01-01', status: 'converted', convertedToSessionId: 'session-1', done: false })],
  });
  assert.deepEqual(overdueEntries([client], NOW), []);
});

test('a converted consultation with done:true (the normal case) never appears as overdue', () => {
  const client = makeClient({
    consultations: [makeConsultation({ date: '2026-01-01', status: 'converted', convertedToSessionId: 'session-1', done: true })],
  });
  assert.deepEqual(overdueEntries([client], NOW), []);
});
