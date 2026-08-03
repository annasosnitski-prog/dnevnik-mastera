import assert from 'node:assert/strict';
import test from 'node:test';

import { upsertClientSession, upsertProjectSession, applyConsultationConversion } from '../.test-dist/src/lib/sessionSave.js';

function makeClient(overrides = {}) {
  return {
    id: 'client-1',
    name: 'Анна',
    surname: 'Соснитски',
    color: '#3E7CA6',
    styles: [],
    style: '',
    sessions: [],
    consultations: [],
    ...overrides,
  };
}

function makeProject(overrides = {}) {
  return {
    id: 'project-1',
    title: 'Дракон',
    color: '#B0413E',
    category: 'tattoo',
    clientId: null,
    stage: 'idea',
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
    ...overrides,
  };
}

function makeSessionData(overrides = {}) {
  return {
    name: 'Первая',
    date: '2026-02-01',
    time: '',
    duration: '',
    style: 'graphic',
    area: 'Левое плечо',
    colors: '',
    needles: '',
    skinReaction: '',
    note: '',
    photos: [],
    done: true,
    healed: false,
    projectId: 'project-1',
    ...overrides,
  };
}

test('upsertClientSession appends a new session to client.sessions with the given projectId', () => {
  const client = makeClient();
  const { client: updated, sessionId } = upsertClientSession(client, makeSessionData(), null);

  assert.equal(updated.sessions.length, 1);
  assert.equal(updated.sessions[0].id, sessionId);
  assert.equal(updated.sessions[0].projectId, 'project-1');
  assert.equal(updated.sessions[0].name, 'Первая');
  assert.equal(updated.sessions[0].cancelled, false);
});

test('upsertClientSession never touches Project.sessions — client and project ownership stay separate', () => {
  const client = makeClient();
  const { client: updated } = upsertClientSession(client, makeSessionData(), null);
  assert.ok(!('sessions' in makeProject()) || makeProject().sessions.length === 0);
  assert.equal(updated.sessions.length, 1);
});

test('upsertClientSession merges a new style into client.styles, matching handleAddSession', () => {
  const client = makeClient({ styles: ['dotwork'], style: 'dotwork' });
  const { client: updated } = upsertClientSession(client, makeSessionData({ style: 'graphic' }), null);
  assert.deepEqual(updated.styles, ['dotwork', 'graphic']);
  assert.equal(updated.style, 'dotwork · graphic');
});

test('upsertClientSession editing an existing session keeps its id and does not duplicate it', () => {
  const existing = { id: 'session-1', name: 'Старая', cancelled: false, date: '2026-01-01', time: '', duration: '', style: '', area: '', colors: '', needles: '', skinReaction: '', note: '', photos: [], done: false, healed: false, projectId: null };
  const client = makeClient({ sessions: [existing] });
  const { client: updated, sessionId } = upsertClientSession(client, makeSessionData({ name: 'Обновлённая' }), 'session-1');

  assert.equal(sessionId, 'session-1');
  assert.equal(updated.sessions.length, 1);
  assert.equal(updated.sessions[0].name, 'Обновлённая');
});

test('upsertProjectSession appends a new session to project.sessions, not client.sessions', () => {
  const project = makeProject();
  const { project: updated, sessionId } = upsertProjectSession(project, makeSessionData(), null);

  assert.equal(updated.sessions.length, 1);
  assert.equal(updated.sessions[0].id, sessionId);
  assert.equal(updated.sessions[0].projectId, 'project-1');
});

test('upsertProjectSession editing an existing session keeps its id', () => {
  const existing = { id: 'session-9', name: 'Старая', cancelled: false, date: '2026-01-01', time: '', duration: '', style: '', area: '', colors: '', needles: '', skinReaction: '', note: '', photos: [], done: false, healed: false, projectId: 'project-1' };
  const project = makeProject({ sessions: [existing] });
  const { project: updated, sessionId } = upsertProjectSession(project, makeSessionData({ name: 'Обновлённая' }), 'session-9');

  assert.equal(sessionId, 'session-9');
  assert.equal(updated.sessions.length, 1);
  assert.equal(updated.sessions[0].name, 'Обновлённая');
});

test('upsertClientSession defaults a new session\'s sourceConsultationId to null', () => {
  const client = makeClient();
  const { client: updated } = upsertClientSession(client, makeSessionData(), null);
  assert.equal(updated.sessions[0].sourceConsultationId, null);
});

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
    nextStep: '',
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
    projectId: null,
    ...overrides,
  };
}

test('applyConsultationConversion links the session back to the consultation and marks the consultation converted', () => {
  const consultation = makeConsultation();
  const session = { id: 'session-1', name: '', cancelled: false, date: '2026-02-01', time: '', duration: '', style: '', area: '', colors: '', needles: '', skinReaction: '', note: '', photos: [], done: true, healed: false, projectId: null, sourceConsultationId: null };
  const client = makeClient({ sessions: [session], consultations: [consultation] });

  const updated = applyConsultationConversion(client, 'session-1', 'consult-1');

  assert.equal(updated.sessions[0].sourceConsultationId, 'consult-1');
  assert.equal(updated.consultations[0].status, 'converted');
  assert.equal(updated.consultations[0].convertedToSessionId, 'session-1');
  assert.equal(updated.consultations[0].done, true);
  assert.equal(updated.consultations[0].history.length, 1);
  assert.match(updated.consultations[0].history[0].note, /сессию/);
});

test('applyConsultationConversion does not mutate the input client', () => {
  const consultation = makeConsultation();
  const session = { id: 'session-1', name: '', cancelled: false, date: '2026-02-01', time: '', duration: '', style: '', area: '', colors: '', needles: '', skinReaction: '', note: '', photos: [], done: true, healed: false, projectId: null, sourceConsultationId: null };
  const client = makeClient({ sessions: [session], consultations: [consultation] });
  const snapshot = structuredClone(client);

  applyConsultationConversion(client, 'session-1', 'consult-1');

  assert.deepEqual(client, snapshot);
});

test('applyConsultationConversion leaves unrelated sessions/consultations untouched', () => {
  const consultation = makeConsultation({ id: 'consult-1' });
  const otherConsultation = makeConsultation({ id: 'consult-2' });
  const session = { id: 'session-1', name: '', cancelled: false, date: '2026-02-01', time: '', duration: '', style: '', area: '', colors: '', needles: '', skinReaction: '', note: '', photos: [], done: true, healed: false, projectId: null, sourceConsultationId: null };
  const otherSession = { ...session, id: 'session-2' };
  const client = makeClient({ sessions: [session, otherSession], consultations: [consultation, otherConsultation] });

  const updated = applyConsultationConversion(client, 'session-1', 'consult-1');

  assert.equal(updated.sessions[1].sourceConsultationId, null);
  assert.equal(updated.consultations[1].status, 'active');
});

test('neither helper mutates the input client/project', () => {
  const client = makeClient();
  const project = makeProject();
  const clientSnapshot = structuredClone(client);
  const projectSnapshot = structuredClone(project);

  upsertClientSession(client, makeSessionData(), null);
  upsertProjectSession(project, makeSessionData(), null);

  assert.deepEqual(client, clientSnapshot);
  assert.deepEqual(project, projectSnapshot);
});
