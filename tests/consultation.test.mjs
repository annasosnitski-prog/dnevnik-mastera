import assert from 'node:assert/strict';
import test from 'node:test';

import { hasLiveConvertedSession, isConsultationDeletable } from '../.test-dist/src/domain/consultation.js';

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
    createdDate: '2026-01-01T00:00:00.000Z',
    projectId: null,
    ...overrides,
  };
}

function makeSession(overrides = {}) {
  return {
    id: 'session-1',
    name: '',
    date: '2026-01-05',
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
    cancelled: false,
    projectId: null,
    sourceConsultationId: null,
    ...overrides,
  };
}

// Единственный источник истины для двух независимых мест защиты
// (ConsultationRow в DetailScreen.tsx и deleteConsultation в TattoDiary.tsx)
// — конвертированную консультацию нельзя удалить, пока существует
// *корректно* двусторонне связанная сессия (см. domain/consultation.ts).
// status/convertedToSessionId сами по себе недостаточны — см. сценарии ниже.

// 1. converted + корректная взаимная связь — консультацию удалить нельзя.
test('isConsultationDeletable is false for a converted consultation with a correctly mutually-linked session', () => {
  const consultation = makeConsultation({ status: 'converted', convertedToSessionId: 'session-1' });
  const session = makeSession({ id: 'session-1', sourceConsultationId: 'consult-1' });
  assert.equal(hasLiveConvertedSession(consultation, [session]), true);
  assert.equal(isConsultationDeletable(consultation, [session]), false);
});

// 2. convertedToSessionId указывает на отсутствующую сессию — связь
// повреждена (нормализация приводит такую консультацию к 'completed' — см.
// normalize.test.mjs; здесь проверяется сам предикат).
test('hasLiveConvertedSession is false when convertedToSessionId points at a missing session', () => {
  const consultation = makeConsultation({ status: 'converted', convertedToSessionId: 'session-missing' });
  assert.equal(hasLiveConvertedSession(consultation, []), false);
  assert.equal(isConsultationDeletable(consultation, []), true);
});

// 3. Сессия существует, но её sourceConsultationId указывает на другую
// консультацию — связь считается повреждённой.
test('hasLiveConvertedSession is false when the session points back at a different consultation', () => {
  const consultation = makeConsultation({ id: 'consult-1', status: 'converted', convertedToSessionId: 'session-1' });
  const session = makeSession({ id: 'session-1', sourceConsultationId: 'consult-OTHER' });
  assert.equal(hasLiveConvertedSession(consultation, [session]), false);
  assert.equal(isConsultationDeletable(consultation, [session]), true);
});

// 4. Сессия указывает на консультацию, но консультация указывает на другую
// сессию — связь тоже повреждена (несимметричная в другую сторону).
test('hasLiveConvertedSession is false when the consultation points at a different session', () => {
  const consultation = makeConsultation({ id: 'consult-1', status: 'converted', convertedToSessionId: 'session-OTHER' });
  const session = makeSession({ id: 'session-1', sourceConsultationId: 'consult-1' });
  assert.equal(hasLiveConvertedSession(consultation, [session]), false);
  assert.equal(isConsultationDeletable(consultation, [session]), true);
});

test('isConsultationDeletable is true for an active consultation', () => {
  assert.equal(isConsultationDeletable(makeConsultation({ status: 'active' }), []), true);
});

test('isConsultationDeletable is true for a completed consultation (e.g. after its session was deleted)', () => {
  assert.equal(isConsultationDeletable(makeConsultation({ status: 'completed', convertedToSessionId: null }), []), true);
});

test('isConsultationDeletable is true for a cancelled consultation', () => {
  assert.equal(isConsultationDeletable(makeConsultation({ status: 'cancelled', cancelled: true }), []), true);
});

test('hasLiveConvertedSession is false for a non-converted status even with a matching convertedToSessionId', () => {
  const consultation = makeConsultation({ status: 'active', convertedToSessionId: 'session-1' });
  const session = makeSession({ id: 'session-1', sourceConsultationId: 'consult-1' });
  assert.equal(hasLiveConvertedSession(consultation, [session]), false);
});
