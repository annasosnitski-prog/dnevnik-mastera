import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeSession,
  normalizeClientNote,
  normalizeClient,
  normalizeProject,
} from '../.test-dist/src/lib/normalize.js';

// ── normalizeSession ──────────────────────────────────────────────

test('normalizeSession fills every field with a safe default from an empty record', () => {
  const s = normalizeSession({}, 0);
  assert.equal(s.name, '');
  assert.equal(s.date, '');
  assert.equal(s.done, true); // legacy sessions default to "done" — see comment in source
  assert.equal(s.healed, false);
  assert.equal(s.cancelled, false);
  assert.equal(s.projectId, null);
  assert.deepEqual(s.photos, []);
});

test('normalizeSession keeps a real id and does not touch other fields when the record is already valid', () => {
  const s = normalizeSession({ id: 'abc', name: 'Голубика', date: '2026-05-01', done: false }, 3);
  assert.equal(s.id, 'abc');
  assert.equal(s.name, 'Голубика');
  assert.equal(s.done, false);
});

test('normalizeSession falls back to area from legacy "proportions" field', () => {
  const s = normalizeSession({ proportions: 'Левое плечо' }, 0);
  assert.equal(s.area, 'Левое плечо');
});

test('normalizeSession joins a legacy array-shaped colors field into a string', () => {
  const s = normalizeSession({ colors: ['чёрный', 'красный'] }, 0);
  assert.equal(s.colors, 'чёрный, красный');
});

test('normalizeSession falls back to legacy "notes" and "photoUrl" fields', () => {
  const s = normalizeSession({ notes: 'старая заметка', photoUrl: 'data:img1' }, 0);
  assert.equal(s.note, 'старая заметка');
  assert.deepEqual(s.photos, ['data:img1']);
});

test('normalizeSession defaults sourceConsultationId to null', () => {
  const s = normalizeSession({}, 0);
  assert.equal(s.sourceConsultationId, null);
});

test('normalizeSession keeps an explicit sourceConsultationId', () => {
  const s = normalizeSession({ sourceConsultationId: 'consult-1' }, 0);
  assert.equal(s.sourceConsultationId, 'consult-1');
});

// ── normalizeClientNote ───────────────────────────────────────────

test('normalizeClientNote maps a legacy urgency value through LEGACY_URGENCY_MAP', () => {
  // 'high' is not a current URGENCY key — normalizeClient/normalizeClientNote
  // must route it through the legacy map rather than silently keeping it.
  const n = normalizeClientNote({ text: 'test', urgency: 'high' }, 0);
  assert.notEqual(n.urgency, 'high');
  assert.ok(['urgent', 'important', 'normal'].includes(n.urgency));
});

test('normalizeClientNote keeps a known-current urgency value unchanged', () => {
  const n = normalizeClientNote({ text: 'test', urgency: 'urgent' }, 0);
  assert.equal(n.urgency, 'urgent');
});

test('normalizeClientNote rejects an invalid dueDate instead of keeping garbage', () => {
  const n = normalizeClientNote({ text: 'test', dueDate: 'not-a-date' }, 0);
  assert.equal(n.dueDate, null);
});

test('normalizeClientNote keeps a valid ISO dueDate', () => {
  const n = normalizeClientNote({ text: 'test', dueDate: '2026-08-01' }, 0);
  assert.equal(n.dueDate, '2026-08-01');
});

// ── normalizeClient ───────────────────────────────────────────────

test('normalizeClient derives styles from the last session when styles/style are both missing', () => {
  const c = normalizeClient(
    {
      sessions: [
        { style: 'Дотворк' },
        { style: 'Треш-полька' },
      ],
    },
    0,
  );
  assert.deepEqual(c.styles, ['Треш-полька']);
});

test('normalizeClient prefers an explicit styles array over derived session style', () => {
  const c = normalizeClient(
    { styles: ['Реализм'], sessions: [{ style: 'Дотворк' }] },
    0,
  );
  assert.deepEqual(c.styles, ['Реализм']);
});

test('normalizeClient rejects an unknown clientType instead of keeping it', () => {
  const c = normalizeClient({ clientType: 'vip' }, 0);
  assert.equal(c.clientType, 'client');
});

test('normalizeClient rejects an unknown language and defaults to Russian', () => {
  const c = normalizeClient({ language: 'fr' }, 0);
  assert.equal(c.language, 'ru');
});

test('normalizeClient falls back to legacy "chatHistory" field for note', () => {
  const c = normalizeClient({ chatHistory: 'старый чат' }, 0);
  assert.equal(c.note, 'старый чат');
});

test('normalizeClient assigns a rotating accent color by index when none is stored', () => {
  const c0 = normalizeClient({}, 0);
  const c1 = normalizeClient({}, 1);
  assert.notEqual(c0.color, c1.color);
});

test('normalizeClient recursively normalizes nested sessions and notes', () => {
  const c = normalizeClient(
    { sessions: [{}], notes: [{ text: 'заметка' }] },
    0,
  );
  assert.equal(c.sessions.length, 1);
  assert.equal(c.sessions[0].done, true); // went through normalizeSession
  assert.equal(c.notes.length, 1);
  assert.equal(c.notes[0].text, 'заметка');
});

test('normalizeClient defaults an unrecognized consultation urgency to "normal"', () => {
  const c = normalizeClient({ consultations: [{ urgency: 'nonsense' }] }, 0);
  assert.equal(c.consultations[0].urgency, 'normal');
});

test('normalizeClient defaults a consultation with no status to "active", not converted', () => {
  const c = normalizeClient({ consultations: [{}] }, 0);
  assert.equal(c.consultations[0].status, 'active');
  assert.equal(c.consultations[0].convertedToSessionId, null);
});

test('normalizeClient rejects an unrecognized consultation status instead of keeping it', () => {
  const c = normalizeClient({ consultations: [{ status: 'nonsense' }] }, 0);
  assert.equal(c.consultations[0].status, 'active');
});

test('normalizeClient keeps a valid converted consultation and its session link', () => {
  const c = normalizeClient(
    { consultations: [{ status: 'converted', convertedToSessionId: 'session-1' }] },
    0,
  );
  assert.equal(c.consultations[0].status, 'converted');
  assert.equal(c.consultations[0].convertedToSessionId, 'session-1');
});

test('normalizeClient forces done:true on a converted consultation even if the raw record says otherwise', () => {
  // A converted consultation must never resurface as "not done" in
  // plannerSelectors.ts (upcomingItems/sessionSortKey) or overdueEntries —
  // see the comment on Consultation.done in domain/consultation.ts.
  const c = normalizeClient(
    { consultations: [{ status: 'converted', convertedToSessionId: 'session-1', done: false }] },
    0,
  );
  assert.equal(c.consultations[0].done, true);
});

test('normalizeClient drops convertedToSessionId for a non-converted consultation', () => {
  const c = normalizeClient(
    { consultations: [{ status: 'active', convertedToSessionId: 'session-1' }] },
    0,
  );
  assert.equal(c.consultations[0].convertedToSessionId, null);
});

// ── normalizeProject ──────────────────────────────────────────────

test('normalizeProject defaults every union field to its documented fallback', () => {
  const p = normalizeProject({}, 0);
  assert.equal(p.category, 'tattoo');
  assert.equal(p.stage, 'idea');
  assert.equal(p.state, 'active');
  assert.equal(p.waitingFor, 'none');
  assert.equal(p.priority, 'normal');
  assert.equal(p.nextActionType, null); // never guessed from nextActionText
  assert.equal(p.clientId, null);
});

test('normalizeProject does not invent a nextActionType from nextActionText', () => {
  const p = normalizeProject({ nextActionText: 'Позвонить клиенту насчёт эскиза' }, 0);
  assert.equal(p.nextActionType, null);
});

test('normalizeProject keeps a valid nextActionType unchanged', () => {
  const p = normalizeProject({ nextActionType: 'contact_client' }, 0);
  assert.equal(p.nextActionType, 'contact_client');
});

test('normalizeProject re-normalizes an already-valid record to the same value (idempotent)', () => {
  const once = normalizeProject({ stage: 'booked', priority: 'urgent' }, 0);
  const twice = normalizeProject(once, 0);
  assert.equal(twice.stage, 'booked');
  assert.equal(twice.priority, 'urgent');
});

test('normalizeProject normalizes project-owned sessions ("сессии без клиента") the same way as client sessions', () => {
  const p = normalizeProject({ sessions: [{ name: 'Без клиента' }] }, 0);
  assert.equal(p.sessions[0].name, 'Без клиента');
  assert.equal(p.sessions[0].done, true);
});
