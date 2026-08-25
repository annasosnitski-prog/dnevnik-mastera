import assert from 'node:assert/strict';
import test from 'node:test';

import { overdueProjectConsultations, upcomingSoonProjectConsultations } from '../.test-dist/src/reminders/buildReminders.js';

// Зеркало теста для overdueProjectSessions/upcomingSoonProjectSessions —
// консультации без клиента (Project.consultations), тот же паттерн
// параллельных реализаций сессии/консультации, что и в самом buildReminders.ts.

function makeProject(overrides = {}) {
  return {
    id: 'project-1',
    title: 'Дракон',
    color: '#B0413E',
    category: 'tattoo',
    clientId: null,
    status: 'active',
    state: 'active',
    waitingFor: 'none',
    nextActionText: '',
    nextActionDate: null,
    nextActionType: null,
    priority: 'normal',
    area: '',
    style: '',
    generalNotes: '',
    feeling: '',
    creative: '',
    inspirationSources: '',
    photos: [],
    createdDate: '2026-01-01',
    sessions: [],
    consultations: [],
    lastMeaningfulActivityAt: '2026-01-01',
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
    outcome: '',
    urgency: 'normal',
    photos: [],
    done: false,
    cancelled: false,
    status: 'active',
    convertedToSessionId: null,
    previousConsultationId: null,
    nextConsultationId: null,
    history: [],
    createdDate: '2026-01-01',
    projectId: 'project-1',
    ...overrides,
  };
}

const NOW = new Date('2026-02-01T12:00:00');

test('overdueProjectConsultations: an active past-due client-less consultation is overdue', () => {
  const project = makeProject({ consultations: [makeConsultation({ date: '2026-01-01' })] });
  const result = overdueProjectConsultations([project], NOW);
  assert.equal(result.length, 1);
  assert.equal(result[0].project.id, 'project-1');
  assert.equal(result[0].consultationId, 'consult-1');
});

test('overdueProjectConsultations: a client-tied project (clientId set) is ignored — reminders come from client.consultations instead', () => {
  const project = makeProject({ clientId: 'client-1', consultations: [makeConsultation({ date: '2026-01-01' })] });
  assert.deepEqual(overdueProjectConsultations([project], NOW), []);
});

test('overdueProjectConsultations: done consultations are not overdue', () => {
  const project = makeProject({ consultations: [makeConsultation({ date: '2026-01-01', done: true })] });
  assert.deepEqual(overdueProjectConsultations([project], NOW), []);
});

test('overdueProjectConsultations: cancelled consultations are not overdue', () => {
  const project = makeProject({ consultations: [makeConsultation({ date: '2026-01-01', cancelled: true })] });
  assert.deepEqual(overdueProjectConsultations([project], NOW), []);
});

test('overdueProjectConsultations: a converted consultation is not overdue (it lives on as its session now)', () => {
  const project = makeProject({ consultations: [makeConsultation({ date: '2026-01-01', status: 'converted', done: true })] });
  assert.deepEqual(overdueProjectConsultations([project], NOW), []);
});

test('overdueProjectConsultations: a future-dated consultation is not overdue', () => {
  const project = makeProject({ consultations: [makeConsultation({ date: '2026-03-01' })] });
  assert.deepEqual(overdueProjectConsultations([project], NOW), []);
});

test('upcomingSoonProjectConsultations: a client-less consultation 40 hours out is soon', () => {
  const project = makeProject({ consultations: [makeConsultation({ date: '2026-02-03', time: '04:00' })] });
  const result = upcomingSoonProjectConsultations([project], NOW);
  assert.equal(result.length, 1);
  assert.equal(result[0].consultationId, 'consult-1');
});

test('upcomingSoonProjectConsultations: a client-tied project (clientId set) is ignored', () => {
  const project = makeProject({ clientId: 'client-1', consultations: [makeConsultation({ date: '2026-02-03', time: '04:00' })] });
  assert.deepEqual(upcomingSoonProjectConsultations([project], NOW), []);
});

test('upcomingSoonProjectConsultations: outside the 36-48h window is not soon', () => {
  const project = makeProject({ consultations: [makeConsultation({ date: '2026-02-10', time: '12:00' })] });
  assert.deepEqual(upcomingSoonProjectConsultations([project], NOW), []);
});
