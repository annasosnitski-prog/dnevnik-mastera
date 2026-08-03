import assert from 'node:assert/strict';
import test from 'node:test';

import { upsertConsultation } from '../.test-dist/src/lib/consultationSave.js';

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
    createdDate: '2026-01-01T00:00:00.000Z',
    projectId: null,
    ...overrides,
  };
}

function makeConsultationData(overrides = {}) {
  return {
    date: '2026-02-01',
    time: '',
    area: 'Левое плечо',
    style: 'graphic',
    generalNotes: '',
    feeling: '',
    creative: '',
    inspirationSources: '',
    outcome: '',
    nextStep: '',
    urgency: 'important',
    photos: [],
    projectId: 'project-1',
    ...overrides,
  };
}

test('upsertConsultation appends a new consultation with no chain link by default', () => {
  const client = makeClient();
  const { client: updated, consultationId } = upsertConsultation(client, makeConsultationData(), null);

  assert.equal(updated.consultations.length, 1);
  assert.equal(updated.consultations[0].id, consultationId);
  assert.equal(updated.consultations[0].previousConsultationId, null);
  assert.equal(updated.consultations[0].nextConsultationId, null);
  assert.equal(updated.consultations[0].status, 'active');
  assert.equal(updated.consultations[0].history.length, 1);
});

test('upsertConsultation never replaces an existing consultation — the source stays in the array', () => {
  const source = makeConsultation({ id: 'consult-1' });
  const client = makeClient({ consultations: [source] });

  const { client: updated } = upsertConsultation(client, makeConsultationData(), null, 'consult-1');

  assert.equal(updated.consultations.length, 2);
  assert.ok(updated.consultations.some((c) => c.id === 'consult-1'));
});

test('upsertConsultation («Назначить следующую консультацию») links both sides of the chain', () => {
  const source = makeConsultation({ id: 'consult-1' });
  const client = makeClient({ consultations: [source] });

  const { client: updated, consultationId } = upsertConsultation(client, makeConsultationData(), null, 'consult-1');

  const previous = updated.consultations.find((c) => c.id === 'consult-1');
  const next = updated.consultations.find((c) => c.id === consultationId);
  assert.equal(previous.nextConsultationId, consultationId);
  assert.equal(next.previousConsultationId, 'consult-1');
});

test('upsertConsultation keeps the previous consultation\'s own date/status/notes untouched when chaining', () => {
  const source = makeConsultation({ id: 'consult-1', date: '2026-01-01', status: 'active', generalNotes: 'старые заметки' });
  const client = makeClient({ consultations: [source] });

  const { client: updated } = upsertConsultation(client, makeConsultationData({ date: '2026-02-01' }), null, 'consult-1');

  const previous = updated.consultations.find((c) => c.id === 'consult-1');
  assert.equal(previous.date, '2026-01-01');
  assert.equal(previous.status, 'active');
  assert.equal(previous.generalNotes, 'старые заметки');
});

test('upsertConsultation gives the new chained consultation its own blank notes/outcome/nextStep, not copied from the previous one', () => {
  const source = makeConsultation({ id: 'consult-1', generalNotes: 'старые заметки', outcome: 'старый итог' });
  const client = makeClient({ consultations: [source] });

  const { client: updated, consultationId } = upsertConsultation(client, makeConsultationData({ generalNotes: '', outcome: '' }), null, 'consult-1');

  const next = updated.consultations.find((c) => c.id === consultationId);
  assert.equal(next.generalNotes, '');
  assert.equal(next.outcome, '');
});

test('upsertConsultation editing an existing consultation keeps its id and does not touch previousConsultationId', () => {
  const existing = makeConsultation({ id: 'consult-9', previousConsultationId: 'consult-8', date: '2026-01-01' });
  const client = makeClient({ consultations: [existing] });

  const { client: updated, consultationId } = upsertConsultation(client, makeConsultationData({ date: '2026-05-05' }), 'consult-9');

  assert.equal(consultationId, 'consult-9');
  assert.equal(updated.consultations.length, 1);
  assert.equal(updated.consultations[0].date, '2026-05-05');
  assert.equal(updated.consultations[0].previousConsultationId, 'consult-8');
});

test('upsertConsultation editing an existing consultation appends a history entry', () => {
  const existing = makeConsultation({ id: 'consult-1', history: [{ id: 'h1', date: '2026-01-01T00:00:00.000Z', note: 'Консультация создана' }] });
  const client = makeClient({ consultations: [existing] });

  const { client: updated } = upsertConsultation(client, makeConsultationData(), 'consult-1');

  assert.equal(updated.consultations[0].history.length, 2);
});

test('upsertConsultation does not mutate the input client', () => {
  const source = makeConsultation({ id: 'consult-1' });
  const client = makeClient({ consultations: [source] });
  const snapshot = structuredClone(client);

  upsertConsultation(client, makeConsultationData(), null, 'consult-1');

  assert.deepEqual(client, snapshot);
});

test('upsertConsultation leaves unrelated consultations untouched when chaining', () => {
  const source = makeConsultation({ id: 'consult-1' });
  const unrelated = makeConsultation({ id: 'consult-2' });
  const client = makeClient({ consultations: [source, unrelated] });

  const { client: updated } = upsertConsultation(client, makeConsultationData(), null, 'consult-1');

  const stillUnrelated = updated.consultations.find((c) => c.id === 'consult-2');
  assert.equal(stillUnrelated.nextConsultationId, null);
  assert.equal(stillUnrelated.history.length, 0);
});
