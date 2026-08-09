import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAdminWorkSummary } from '../.test-dist/src/components/screens/adminWorkSummary.js';

// Local-date arithmetic, matching upcomingItems' own today/horizon handling
// (see src/domain/plannerSelectors.ts: today.setHours(0,0,0,0), horizon =
// today + days, compared against `new Date(date + 'T00:00:00')` — local,
// not UTC) so these fixtures land on the same side of the window boundary
// upcomingItems itself would compute, regardless of the machine's timezone.
function isoDaysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function makeSession(overrides = {}) {
  return {
    id: 's1', name: '', date: isoDaysFromNow(1), time: '', duration: '', style: '', area: '',
    colors: '', needles: '', skinReaction: '', note: '', photos: [],
    done: false, healed: false, cancelled: false, projectId: null, sourceConsultationId: null,
    ...overrides,
  };
}

function makeConsultation(overrides = {}) {
  return {
    id: 'c1', date: isoDaysFromNow(1), time: '', area: '', style: '', generalNotes: '', feeling: '',
    creative: '', inspirationSources: '', outcome: '', urgency: 'normal', photos: [],
    done: false, cancelled: false, status: 'active', convertedToSessionId: null,
    previousConsultationId: null, nextConsultationId: null, history: [], createdDate: '2026-01-01',
    projectId: null,
    ...overrides,
  };
}

function makeNote(overrides = {}) {
  return {
    id: 'n1', text: '', urgency: 'normal', done: false, createdDate: '2026-01-01', photos: [],
    projectId: null, dueDate: null,
    ...overrides,
  };
}

function makeClient(overrides = {}) {
  return {
    id: 'client-1', name: 'Анна', surname: 'Соснитски', color: '#3E7CA6', clientType: 'client',
    language: 'ru', note: '', masterNote: '', phone: '', skinType: '', skinTone: '', skinNotes: '',
    allergies: '', skinReactions: '', chatLinks: [], styles: [], style: '',
    sessions: [], consultations: [], documents: [], notes: [], createdDate: '2026-01-01',
    ...overrides,
  };
}

// 1. clientsCount равен количеству клиентов.
test('clientsCount equals the client count', () => {
  const clients = [makeClient({ id: 'a' }), makeClient({ id: 'b' }), makeClient({ id: 'c' })];
  const model = buildAdminWorkSummary(clients, [], 7);
  assert.equal(model.clientsCount, 3);
});

// 2. Сессии считаются только через upcomingItems.
test('plannedSessionsCount only counts sessions that upcomingItems would surface', () => {
  const client = makeClient({
    sessions: [makeSession({ id: 's-in', date: isoDaysFromNow(1) })],
  });
  const model = buildAdminWorkSummary([client], [], 7);
  assert.equal(model.plannedSessionsCount, 1);
});

// 3. Консультации считаются отдельно от сессий.
test('consultations are counted separately from sessions', () => {
  const client = makeClient({
    sessions: [makeSession({ id: 's1', date: isoDaysFromNow(1) }), makeSession({ id: 's2', date: isoDaysFromNow(2) })],
    consultations: [makeConsultation({ id: 'c1', date: isoDaysFromNow(1) })],
  });
  const model = buildAdminWorkSummary([client], [], 7);
  assert.equal(model.plannedSessionsCount, 2);
  assert.equal(model.plannedConsultationsCount, 1);
});

// 4. Выбранный windowDays влияет на оба счётчика нагрузки.
test('selected windowDays affects both load counters', () => {
  const client = makeClient({
    sessions: [makeSession({ id: 's1', date: isoDaysFromNow(5) })],
    consultations: [makeConsultation({ id: 'c1', date: isoDaysFromNow(5) })],
  });
  const narrow = buildAdminWorkSummary([client], [], 2);
  const wide = buildAdminWorkSummary([client], [], 7);
  assert.equal(narrow.plannedSessionsCount, 0);
  assert.equal(narrow.plannedConsultationsCount, 0);
  assert.equal(wide.plannedSessionsCount, 1);
  assert.equal(wide.plannedConsultationsCount, 1);
});

// 5. Запись за пределами периода не включается.
test('a record outside the window is not included', () => {
  const client = makeClient({
    sessions: [makeSession({ id: 's-out', date: isoDaysFromNow(10) })],
    consultations: [makeConsultation({ id: 'c-out', date: isoDaysFromNow(10) })],
  });
  const model = buildAdminWorkSummary([client], [], 3);
  assert.equal(model.plannedSessionsCount, 0);
  assert.equal(model.plannedConsultationsCount, 0);
});

// 6/7. Клиентские срочные/важные заметки считаются через urgencyCounts, раздельно.
test('client urgent and important notes are counted via urgencyCounts, separately', () => {
  const clients = [
    makeClient({ id: 'a', notes: [makeNote({ id: 'n1', urgency: 'urgent' }), makeNote({ id: 'n2', urgency: 'urgent' })] }),
    makeClient({ id: 'b', notes: [makeNote({ id: 'n3', urgency: 'important' })] }),
  ];
  const model = buildAdminWorkSummary(clients, [], 7);
  assert.equal(model.clientUrgentCount, 2);
  assert.equal(model.clientImportantCount, 1);
});

// 8/9. Личные срочные/важные заметки считаются через notesUrgencyCounts, раздельно.
test('personal urgent and important notes are counted via notesUrgencyCounts, separately', () => {
  const masterNotes = [
    makeNote({ id: 'p1', urgency: 'urgent' }),
    makeNote({ id: 'p2', urgency: 'important' }),
    makeNote({ id: 'p3', urgency: 'important' }),
  ];
  const model = buildAdminWorkSummary([], masterNotes, 7);
  assert.equal(model.personalUrgentCount, 1);
  assert.equal(model.personalImportantCount, 2);
});

// 10. Клиентские и личные значения не суммируются в одно число.
test('client and personal values are never summed together', () => {
  const clients = [makeClient({ notes: [makeNote({ id: 'n1', urgency: 'urgent' })] })];
  const masterNotes = [makeNote({ id: 'p1', urgency: 'urgent' }), makeNote({ id: 'p2', urgency: 'urgent' })];
  const model = buildAdminWorkSummary(clients, masterNotes, 7);
  assert.equal(model.clientUrgentCount, 1);
  assert.equal(model.personalUrgentCount, 2);
  assert.notEqual(model.clientUrgentCount, model.personalUrgentCount);
});

// 11. Пустые данные возвращают все нули.
test('empty data returns all zeros', () => {
  const model = buildAdminWorkSummary([], [], 7);
  assert.deepEqual(model, {
    clientsCount: 0,
    plannedSessionsCount: 0,
    plannedConsultationsCount: 0,
    clientUrgentCount: 0,
    clientImportantCount: 0,
    personalUrgentCount: 0,
    personalImportantCount: 0,
  });
});

// 12. View-model не мутирует входные массивы.
test('does not mutate the input clients or masterNotes arrays', () => {
  const clients = [
    makeClient({
      sessions: [makeSession({ id: 's1', date: isoDaysFromNow(1) })],
      consultations: [makeConsultation({ id: 'c1', date: isoDaysFromNow(1) })],
      notes: [makeNote({ id: 'n1', urgency: 'urgent' })],
    }),
  ];
  const masterNotes = [makeNote({ id: 'p1', urgency: 'important' })];
  const clientsBefore = JSON.parse(JSON.stringify(clients));
  const notesBefore = JSON.parse(JSON.stringify(masterNotes));

  buildAdminWorkSummary(clients, masterNotes, 7);

  assert.deepEqual(clients, clientsBefore);
  assert.deepEqual(masterNotes, notesBefore);
});

// 13. windowDays теперь — тот же общий период Админки, что и upcomingWindowDays
// (M5D объединил их в Prefs), но buildAdminWorkSummary как была чистой
// функцией, так и осталась: не читает и не возвращает upcomingWindowDays,
// не имеет побочных эффектов на переданные объекты.
test('buildAdminWorkSummary stays a pure function of windowDays — no leakage, no side effects', () => {
  const prefs = { upcomingWindowDays: 7 };
  const before = { ...prefs };
  buildAdminWorkSummary([], [], prefs.upcomingWindowDays);
  buildAdminWorkSummary([], [], 30);
  assert.deepEqual(prefs, before);

  const model = buildAdminWorkSummary([], [], 30);
  assert.equal('upcomingWindowDays' in model, false);
});

// 14. Неактивные/отменённые записи обрабатываются ровно так же, как их уже
// обрабатывает upcomingItems: done и cancelled сессии/консультации не входят
// в счётчики нагрузки, даже если их дата попадает в выбранный период.
test('done and cancelled sessions/consultations are excluded exactly as upcomingItems already excludes them', () => {
  const client = makeClient({
    sessions: [
      makeSession({ id: 's-done', date: isoDaysFromNow(1), done: true }),
      makeSession({ id: 's-cancelled', date: isoDaysFromNow(1), cancelled: true }),
      makeSession({ id: 's-active', date: isoDaysFromNow(1) }),
    ],
    consultations: [
      makeConsultation({ id: 'c-done', date: isoDaysFromNow(1), done: true }),
      makeConsultation({ id: 'c-cancelled', date: isoDaysFromNow(1), cancelled: true }),
      makeConsultation({ id: 'c-active', date: isoDaysFromNow(1) }),
    ],
  });
  const model = buildAdminWorkSummary([client], [], 7);
  assert.equal(model.plannedSessionsCount, 1);
  assert.equal(model.plannedConsultationsCount, 1);
});
