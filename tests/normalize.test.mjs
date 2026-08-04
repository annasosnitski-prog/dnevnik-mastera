import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeSession,
  normalizeClientNote,
  normalizeClient,
  normalizeProject,
} from '../.test-dist/src/lib/normalize.js';
import { isConsultationDeletable } from '../.test-dist/src/domain/consultation.js';

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

test('normalizeClient keeps a valid converted consultation with a correctly mutually-linked session', () => {
  const c = normalizeClient(
    {
      sessions: [{ id: 'session-1', sourceConsultationId: 'consult-1' }],
      consultations: [{ id: 'consult-1', status: 'converted', convertedToSessionId: 'session-1' }],
    },
    0,
  );
  assert.equal(c.consultations[0].status, 'converted');
  assert.equal(c.consultations[0].convertedToSessionId, 'session-1');
});

// «Повреждённые старые данные»: status:'converted' без корректной
// двусторонней связи с реально существующей сессией (см.
// hasLiveConvertedSession в domain/consultation.ts) не остаётся
// converted — иначе консультация становится навсегда неудаляемой
// (isConsultationDeletable), указывая на ничто. Разжалование: status →
// 'completed', convertedToSessionId → null, done остаётся true; запись в
// history НЕ добавляется (иначе она дублировалась бы при каждой загрузке —
// см. отдельный тест ниже).

// 2. convertedToSessionId указывает на отсутствующую сессию.
test('normalizeClient demotes a converted consultation to completed when convertedToSessionId points at a missing session', () => {
  const c = normalizeClient(
    { consultations: [{ id: 'consult-1', status: 'converted', convertedToSessionId: 'session-missing' }] },
    0,
  );
  assert.equal(c.consultations[0].status, 'completed');
  assert.equal(c.consultations[0].convertedToSessionId, null);
  assert.equal(c.consultations[0].done, true);
});

// 3. Сессия существует, но её sourceConsultationId указывает на другую консультацию.
test('normalizeClient demotes a converted consultation when the linked session points back at a different consultation', () => {
  const c = normalizeClient(
    {
      sessions: [{ id: 'session-1', sourceConsultationId: 'consult-OTHER' }],
      consultations: [{ id: 'consult-1', status: 'converted', convertedToSessionId: 'session-1' }],
    },
    0,
  );
  assert.equal(c.consultations[0].status, 'completed');
  assert.equal(c.consultations[0].convertedToSessionId, null);
  assert.equal(c.consultations[0].done, true);
});

// 4. Сессия указывает на консультацию, но консультация указывает на другую сессию.
test('normalizeClient demotes a converted consultation when it points at a different session than the one linking back', () => {
  const c = normalizeClient(
    {
      sessions: [{ id: 'session-1', sourceConsultationId: 'consult-1' }],
      consultations: [{ id: 'consult-1', status: 'converted', convertedToSessionId: 'session-OTHER' }],
    },
    0,
  );
  assert.equal(c.consultations[0].status, 'completed');
  assert.equal(c.consultations[0].convertedToSessionId, null);
});

// 5. Повреждённая консультация после нормализации удаляема.
test('normalizeClient produces a deletable consultation from a broken converted link', () => {
  const c = normalizeClient(
    { consultations: [{ id: 'consult-1', status: 'converted', convertedToSessionId: 'session-missing' }] },
    0,
  );
  assert.equal(isConsultationDeletable(c.consultations[0], c.sessions), true);
});

// 6. Нормализация не добавляет повторяющиеся записи истории — running it
// again on its own (already-normalized) output must not append a second
// «restoration» entry each time (there wasn't a real deletion event).
test('normalizeClient does not add a history entry when demoting, even across repeated normalization passes', () => {
  const once = normalizeClient(
    { consultations: [{ id: 'consult-1', status: 'converted', convertedToSessionId: 'session-missing' }] },
    0,
  );
  assert.deepEqual(once.consultations[0].history, []);
  const twice = normalizeClient(once, 0);
  assert.deepEqual(twice.consultations[0].history, []);
  assert.equal(twice.consultations[0].status, 'completed');
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

// ── Цепочка повторных консультаций (previousConsultationId/nextConsultationId/
// outcome/history) — старые бэкапы/IndexedDB-записи не содержат этих полей,
// они должны получать безопасные дефолты, а не падать нормализацию.
test('normalizeClient defaults a pre-chain consultation (no previous/next link) to null on both ends', () => {
  const c = normalizeClient({ consultations: [{}] }, 0);
  assert.equal(c.consultations[0].previousConsultationId, null);
  assert.equal(c.consultations[0].nextConsultationId, null);
});

test('normalizeClient defaults missing outcome/history to empty', () => {
  const c = normalizeClient({ consultations: [{}] }, 0);
  assert.equal(c.consultations[0].outcome, '');
  assert.deepEqual(c.consultations[0].history, []);
});

test('normalizeClient keeps an explicit chain link and history from a backup file', () => {
  const c = normalizeClient(
    {
      consultations: [
        {
          id: 'consult-2',
          previousConsultationId: 'consult-1',
          nextConsultationId: 'consult-3',
          outcome: 'Договорились на сессию',
          history: [{ id: 'h1', date: '2026-01-01T00:00:00.000Z', note: 'Консультация создана' }],
        },
      ],
    },
    0,
  );
  assert.equal(c.consultations[0].previousConsultationId, 'consult-1');
  assert.equal(c.consultations[0].nextConsultationId, 'consult-3');
  assert.equal(c.consultations[0].outcome, 'Договорились на сессию');
  assert.equal(c.consultations[0].history.length, 1);
  assert.equal(c.consultations[0].history[0].note, 'Консультация создана');
});

// Consultation.nextStep убрано из модели (PR #208 добавил его по ошибке —
// next step существует ровно один, на Project). Старые backup/IndexedDB-
// записи всё ещё могут содержать этот ключ в сыром JSON — нормализация не
// должна падать на нём, а итоговый объект не должен его выставлять.
test('normalizeClient tolerates a legacy nextStep key without failing and drops it from the result', () => {
  const c = normalizeClient(
    { consultations: [{ id: 'consult-1', outcome: 'Итог остался', nextStep: 'Старое значение из бэкапа' }] },
    0,
  );
  assert.equal(c.consultations[0].outcome, 'Итог остался');
  assert.ok(!('nextStep' in c.consultations[0]));
});

test('normalizeClient drops a malformed history entry instead of keeping garbage', () => {
  const c = normalizeClient({ consultations: [{ history: [{ note: 'ok' }, { garbage: true }, null] }] }, 0);
  assert.equal(c.consultations[0].history.length, 1);
  assert.equal(c.consultations[0].history[0].note, 'ok');
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
