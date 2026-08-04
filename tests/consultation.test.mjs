import assert from 'node:assert/strict';
import test from 'node:test';

import { isConsultationDeletable } from '../.test-dist/src/domain/consultation.js';

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

// Единственный источник истины для двух независимых мест защиты
// (ConsultationRow в DetailScreen.tsx и deleteConsultation в TattoDiary.tsx)
// — конвертированную консультацию нельзя удалить, пока существует связанная
// сессия (см. domain/consultation.ts).
test('isConsultationDeletable is false for a converted consultation', () => {
  const consultation = makeConsultation({ status: 'converted', convertedToSessionId: 'session-1' });
  assert.equal(isConsultationDeletable(consultation), false);
});

test('isConsultationDeletable is true for an active consultation', () => {
  assert.equal(isConsultationDeletable(makeConsultation({ status: 'active' })), true);
});

test('isConsultationDeletable is true for a completed consultation (e.g. after its session was deleted)', () => {
  assert.equal(isConsultationDeletable(makeConsultation({ status: 'completed', convertedToSessionId: null })), true);
});

test('isConsultationDeletable is true for a cancelled consultation', () => {
  assert.equal(isConsultationDeletable(makeConsultation({ status: 'cancelled', cancelled: true })), true);
});
