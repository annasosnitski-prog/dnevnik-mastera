import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildProjectFolders,
  getConsultationSequence,
  getConsultationNumber,
  getProjectLastActivityDate,
  hasScheduledWork,
  hasOverdueWork,
} from '../.test-dist/src/domain/projectSelectors.js';

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
    lastMeaningfulActivityAt: '2026-01-01',
    ...overrides,
  };
}

function makeSession(overrides = {}) {
  return {
    id: 'session-1',
    name: '',
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
    done: false,
    healed: false,
    cancelled: false,
    projectId: null,
    sourceConsultationId: null,
    ...overrides,
  };
}

function makeClient(overrides = {}) {
  return {
    id: 'client-1',
    name: 'Анна',
    surname: 'Соснитски',
    color: '#3E7CA6',
    ...overrides,
  };
}

test('client with two projects gives one folder with two projects', () => {
  const client = makeClient();
  const projects = [
    makeProject({ id: 'p1', clientId: client.id }),
    makeProject({ id: 'p2', clientId: client.id }),
  ];

  const folders = buildProjectFolders(projects, [client]);

  assert.equal(folders.length, 1);
  assert.equal(folders[0].id, 'client:client-1');
  assert.equal(folders[0].projectCount, 2);
  assert.deepEqual(folders[0].projects, projects);
});

test('client with one project still gets a folder', () => {
  const client = makeClient();
  const projects = [makeProject({ id: 'p1', clientId: client.id })];

  const folders = buildProjectFolders(projects, [client]);

  assert.equal(folders.length, 1);
  assert.equal(folders[0].type, 'client');
  assert.equal(folders[0].projectCount, 1);
});

test('two different clients give two distinct folders', () => {
  const clientA = makeClient({ id: 'client-a', name: 'Анна', surname: 'А' });
  const clientB = makeClient({ id: 'client-b', name: 'Борис', surname: 'Б' });
  const projects = [
    makeProject({ id: 'p1', clientId: clientA.id }),
    makeProject({ id: 'p2', clientId: clientB.id }),
  ];

  const folders = buildProjectFolders(projects, [clientA, clientB]);

  assert.equal(folders.length, 2);
  assert.deepEqual(folders.map((f) => f.id), ['client:client-a', 'client:client-b']);
});

test('client folders follow the order of clients, not projects', () => {
  const clientA = makeClient({ id: 'client-a' });
  const clientB = makeClient({ id: 'client-b' });
  // projects mention client-b first, but clients array lists client-a first
  const projects = [
    makeProject({ id: 'p1', clientId: clientB.id }),
    makeProject({ id: 'p2', clientId: clientA.id }),
  ];

  const folders = buildProjectFolders(projects, [clientA, clientB]);

  assert.deepEqual(folders.map((f) => f.id), ['client:client-a', 'client:client-b']);
});

test('projects inside a folder keep the order of the projects array', () => {
  const client = makeClient();
  const p1 = makeProject({ id: 'p1', clientId: client.id });
  const p2 = makeProject({ id: 'p2', clientId: client.id });
  const p3 = makeProject({ id: 'p3', clientId: client.id });

  const folders = buildProjectFolders([p2, p3, p1], [client]);

  assert.deepEqual(folders[0].projects.map((p) => p.id), ['p2', 'p3', 'p1']);
});

test('all clientId === null projects land only in the master folder', () => {
  const client = makeClient();
  const projects = [
    makeProject({ id: 'p1', clientId: null }),
    makeProject({ id: 'p2', clientId: null }),
    makeProject({ id: 'p3', clientId: client.id }),
  ];

  const folders = buildProjectFolders(projects, [client]);

  const master = folders.find((f) => f.id === 'master');
  assert.ok(master);
  assert.equal(master.type, 'master');
  assert.equal(master.clientId, null);
  assert.equal(master.title, 'Проекты мастера');
  assert.deepEqual(master.projects.map((p) => p.id), ['p1', 'p2']);
  assert.equal(folders.filter((f) => f.type === 'master').length, 1);
});

test('projects are not duplicated across folders', () => {
  const client = makeClient();
  const projects = [
    makeProject({ id: 'p1', clientId: client.id }),
    makeProject({ id: 'p2', clientId: null }),
  ];

  const folders = buildProjectFolders(projects, [client]);
  const allProjectIds = folders.flatMap((f) => f.projects.map((p) => p.id));

  assert.deepEqual(allProjectIds.sort(), ['p1', 'p2']);
});

test('empty folders are not shown', () => {
  const clientWithProjects = makeClient({ id: 'client-a' });
  const clientWithoutProjects = makeClient({ id: 'client-b' });
  const projects = [makeProject({ id: 'p1', clientId: clientWithProjects.id })];

  const folders = buildProjectFolders(projects, [clientWithProjects, clientWithoutProjects]);

  assert.equal(folders.length, 1);
  assert.equal(folders[0].id, 'client:client-a');
});

test('a missing client creates a safe fallback folder without altering the project', () => {
  const projects = [makeProject({ id: 'p1', clientId: 'ghost-client' })];
  const originalProjects = structuredClone(projects);

  const folders = buildProjectFolders(projects, []);

  assert.equal(folders.length, 1);
  assert.equal(folders[0].id, 'client:ghost-client');
  assert.equal(folders[0].type, 'client');
  assert.equal(folders[0].clientId, 'ghost-client');
  assert.equal(folders[0].title, 'Клиент не найден');
  assert.deepEqual(projects, originalProjects);
  // The orphaned project must not be swept into the master folder.
  assert.ok(!folders.some((f) => f.type === 'master'));
});

test('missing-client fallback folders are ordered by first appearance in projects', () => {
  const projects = [
    makeProject({ id: 'p1', clientId: 'ghost-b' }),
    makeProject({ id: 'p2', clientId: 'ghost-a' }),
    makeProject({ id: 'p3', clientId: 'ghost-b' }),
  ];

  const folders = buildProjectFolders(projects, []);

  assert.deepEqual(folders.map((f) => f.id), ['client:ghost-b', 'client:ghost-a']);
});

test('input arrays and objects are not mutated', () => {
  const client = makeClient();
  const projects = [makeProject({ id: 'p1', clientId: client.id }), makeProject({ id: 'p2', clientId: null })];
  const clients = [client];
  const projectsSnapshot = structuredClone(projects);
  const clientsSnapshot = structuredClone(clients);

  buildProjectFolders(projects, clients);

  assert.deepEqual(projects, projectsSnapshot);
  assert.deepEqual(clients, clientsSnapshot);
});

// ── getConsultationSequence / getConsultationNumber ──────────────────────
// «Консультация 1/2/3» (milestone «цепочка повторных консультаций», п. 5) —
// номер вычисляется по дате внутри проекта, а не хранится и не читается из
// previousConsultationId (та связь используется только для UI-навигации).

function makeConsultation(overrides = {}) {
  return {
    id: 'consult-1',
    date: '',
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

test('getConsultationSequence orders a project\'s consultations by date, earliest first', () => {
  const c1 = makeConsultation({ id: 'c1', projectId: 'p1', date: '2026-03-01' });
  const c2 = makeConsultation({ id: 'c2', projectId: 'p1', date: '2026-01-01' });
  const c3 = makeConsultation({ id: 'c3', projectId: 'p1', date: '2026-02-01' });

  const sequence = getConsultationSequence([c1, c2, c3], 'p1');

  assert.deepEqual(sequence.map((c) => c.id), ['c2', 'c3', 'c1']);
});

test('getConsultationSequence excludes consultations from other projects', () => {
  const c1 = makeConsultation({ id: 'c1', projectId: 'p1', date: '2026-01-01' });
  const other = makeConsultation({ id: 'c2', projectId: 'p2', date: '2026-01-02' });

  const sequence = getConsultationSequence([c1, other], 'p1');

  assert.deepEqual(sequence.map((c) => c.id), ['c1']);
});

test('getConsultationSequence breaks a same-date tie by createdDate', () => {
  const first = makeConsultation({ id: 'c1', projectId: 'p1', date: '2026-01-01', createdDate: '2026-01-01T09:00:00.000Z' });
  const second = makeConsultation({ id: 'c2', projectId: 'p1', date: '2026-01-01', createdDate: '2026-01-01T10:00:00.000Z' });

  const sequence = getConsultationSequence([second, first], 'p1');

  assert.deepEqual(sequence.map((c) => c.id), ['c1', 'c2']);
});

test('getConsultationNumber returns the 1-based position within the project', () => {
  const c1 = makeConsultation({ id: 'c1', projectId: 'p1', date: '2026-01-01' });
  const c2 = makeConsultation({ id: 'c2', projectId: 'p1', date: '2026-02-01' });
  const all = [c1, c2];

  assert.equal(getConsultationNumber(all, c1), 1);
  assert.equal(getConsultationNumber(all, c2), 2);
});

test('getConsultationNumber returns null for a consultation without a project', () => {
  const c = makeConsultation({ id: 'c1', projectId: null });
  assert.equal(getConsultationNumber([c], c), null);
});

test('getConsultationNumber keeps later numbers stable after an earlier consultation in the chain is deleted', () => {
  const c1 = makeConsultation({ id: 'c1', projectId: 'p1', date: '2026-01-01' });
  const c2 = makeConsultation({ id: 'c2', projectId: 'p1', date: '2026-02-01', previousConsultationId: 'c1' });
  const c3 = makeConsultation({ id: 'c3', projectId: 'p1', date: '2026-03-01', previousConsultationId: 'c2' });

  assert.equal(getConsultationNumber([c1, c2, c3], c3), 3);
  // c1 удалена (milestone п. 11 — не должна каскадно удалять остальные) —
  // оставшиеся просто пересчитываются по своей новой позиции, без «дыр».
  assert.equal(getConsultationNumber([c2, c3], c3), 2);
});

// ── getProjectLastActivityDate (M4) ───────────────────────────────────────
// «Последняя реальная активность» — производная величина: только достоверные
// сигналы (lastMeaningfulActivityAt, выполненные сессии, история консультаций
// проекта), максимум по датам (границы дня). НЕ включает project.createdDate
// — легаси-проект без ни одного достоверного сигнала возвращает null, а не
// дату создания записи (см. domain/projectSelectors.ts).

test('getProjectLastActivityDate returns null for a legacy project with no stored value and no other signal (scenario 5, 7)', () => {
  const p = makeProject({ createdDate: '2026-01-05', lastMeaningfulActivityAt: null });
  assert.equal(getProjectLastActivityDate(p, [], []), null);
});

test('getProjectLastActivityDate does NOT fall back to createdDate even when createdDate is recent (scenario 7)', () => {
  const p = makeProject({ createdDate: '2026-07-30', lastMeaningfulActivityAt: null });
  assert.equal(getProjectLastActivityDate(p, [], []), null);
});

test('getProjectLastActivityDate picks up a stored lastMeaningfulActivityAt once set (scenario 6 — "first meaningful change")', () => {
  const legacy = makeProject({ createdDate: '2026-01-05', lastMeaningfulActivityAt: null });
  assert.equal(getProjectLastActivityDate(legacy, [], []), null);
  const afterFirstChange = { ...legacy, lastMeaningfulActivityAt: '2026-07-20T12:00:00.000Z' };
  assert.equal(getProjectLastActivityDate(afterFirstChange, [], []), '2026-07-20');
});

test('getProjectLastActivityDate picks up a later stored lastMeaningfulActivityAt', () => {
  const p = makeProject({ createdDate: '2026-01-05', lastMeaningfulActivityAt: '2026-02-10' });
  assert.equal(getProjectLastActivityDate(p, [], []), '2026-02-10');
});

test('getProjectLastActivityDate counts a done session linked to the project as real activity (scenario 8)', () => {
  const p = makeProject({ id: 'p1', lastMeaningfulActivityAt: null });
  const session = makeSession({ projectId: 'p1', date: '2026-03-01', done: true });
  assert.equal(getProjectLastActivityDate(p, [session], []), '2026-03-01');
});

test('getProjectLastActivityDate ignores a not-done session (only scheduled, no real event yet)', () => {
  const p = makeProject({ id: 'p1', lastMeaningfulActivityAt: null });
  const session = makeSession({ projectId: 'p1', date: '2026-06-01', done: false });
  assert.equal(getProjectLastActivityDate(p, [session], []), null);
});

test('getProjectLastActivityDate ignores a done session linked to a different project (scenario 18)', () => {
  const p = makeProject({ id: 'p1', lastMeaningfulActivityAt: '2026-01-01' });
  const session = makeSession({ projectId: 'other-project', date: '2026-06-01', done: true });
  assert.equal(getProjectLastActivityDate(p, [session], []), '2026-01-01');
});

test('getProjectLastActivityDate counts consultation history as real activity (scenario 9)', () => {
  const p = makeProject({ id: 'p1', lastMeaningfulActivityAt: null });
  const consultation = makeConsultation({
    id: 'c1',
    projectId: 'p1',
    history: [
      { id: 'h1', date: '2026-01-10T10:00:00.000Z', note: 'создана' },
      { id: 'h2', date: '2026-04-20T10:00:00.000Z', note: 'переведена в сессию' },
    ],
  });
  assert.equal(getProjectLastActivityDate(p, [], [consultation]), '2026-04-20');
});

test('getProjectLastActivityDate ignores history from a consultation of a different project (scenario 19)', () => {
  const p = makeProject({ id: 'p1', lastMeaningfulActivityAt: '2026-01-01' });
  const consultation = makeConsultation({
    id: 'c1',
    projectId: 'other-project',
    history: [{ id: 'h1', date: '2026-05-01T10:00:00.000Z', note: 'создана' }],
  });
  assert.equal(getProjectLastActivityDate(p, [], [consultation]), '2026-01-01');
});

test('getProjectLastActivityDate takes the max across every signal at once', () => {
  const p = makeProject({ id: 'p1', lastMeaningfulActivityAt: '2026-02-01' });
  const session = makeSession({ projectId: 'p1', date: '2026-03-15', done: true });
  const consultation = makeConsultation({
    id: 'c1',
    projectId: 'p1',
    history: [{ id: 'h1', date: '2026-05-05T00:00:00.000Z', note: 'создана' }],
  });
  assert.equal(getProjectLastActivityDate(p, [session], [consultation]), '2026-05-05');
});

// ── hasScheduledWork (M4) ──────────────────────────────────────────────────
// Проект уже в движении (назначено будущее действие) — застой показывать
// не нужно.

const TODAY = '2026-08-05';

test('hasScheduledWork is true for a future dated next step (scenario 12)', () => {
  const p = makeProject({ id: 'p1', nextActionText: 'Отправить эскиз', nextActionDate: '2026-08-10' });
  assert.equal(hasScheduledWork(p, [], [], TODAY), true);
});

test('hasScheduledWork is true when the next step date is today', () => {
  const p = makeProject({ id: 'p1', nextActionText: 'Отправить эскиз', nextActionDate: TODAY });
  assert.equal(hasScheduledWork(p, [], [], TODAY), true);
});

test('hasScheduledWork ignores a next step date without text (matches overdueProjects\' own guard)', () => {
  const p = makeProject({ id: 'p1', nextActionText: '', nextActionDate: '2026-08-10' });
  assert.equal(hasScheduledWork(p, [], [], TODAY), false);
});

test('hasScheduledWork is true for a future open session on the project (scenario 10)', () => {
  const p = makeProject({ id: 'p1' });
  const session = makeSession({ projectId: 'p1', date: '2026-08-20', done: false, cancelled: false });
  assert.equal(hasScheduledWork(p, [session], [], TODAY), true);
});

test('hasScheduledWork is true for a future open consultation on the project (scenario 11)', () => {
  const p = makeProject({ id: 'p1' });
  const consultation = makeConsultation({ projectId: 'p1', date: '2026-08-20', done: false, cancelled: false, status: 'active' });
  assert.equal(hasScheduledWork(p, [], [consultation], TODAY), true);
});

test('hasScheduledWork ignores a cancelled future session (scenario 16)', () => {
  const p = makeProject({ id: 'p1' });
  const session = makeSession({ projectId: 'p1', date: '2026-08-20', done: false, cancelled: true });
  assert.equal(hasScheduledWork(p, [session], [], TODAY), false);
});

test('hasScheduledWork ignores a cancelled future consultation (scenario 16)', () => {
  const p = makeProject({ id: 'p1' });
  const consultation = makeConsultation({ projectId: 'p1', date: '2026-08-20', cancelled: true, status: 'cancelled' });
  assert.equal(hasScheduledWork(p, [], [consultation], TODAY), false);
});

test('hasScheduledWork ignores a done session even with a future/erroneous date — not a schedule item (scenario 17)', () => {
  const p = makeProject({ id: 'p1' });
  const session = makeSession({ projectId: 'p1', date: '2026-08-20', done: true });
  assert.equal(hasScheduledWork(p, [session], [], TODAY), false);
});

test('hasScheduledWork ignores a converted future consultation — already moved into a session (scenario 17)', () => {
  const p = makeProject({ id: 'p1' });
  const consultation = makeConsultation({ projectId: 'p1', date: '2026-08-20', status: 'converted', done: true });
  assert.equal(hasScheduledWork(p, [], [consultation], TODAY), false);
});

test('hasScheduledWork ignores a past session/consultation — not scheduled, it already happened or is overdue', () => {
  const p = makeProject({ id: 'p1' });
  const session = makeSession({ projectId: 'p1', date: '2026-08-01', done: false, cancelled: false });
  assert.equal(hasScheduledWork(p, [session], [], TODAY), false);
});

test('hasScheduledWork ignores a future session belonging to a different project (scenario 18)', () => {
  const p = makeProject({ id: 'p1' });
  const session = makeSession({ projectId: 'other-project', date: '2026-08-20', done: false, cancelled: false });
  assert.equal(hasScheduledWork(p, [session], [], TODAY), false);
});

test('hasScheduledWork ignores a future consultation belonging to a different project (scenario 19)', () => {
  const p = makeProject({ id: 'p1' });
  const consultation = makeConsultation({ projectId: 'other-project', date: '2026-08-20', status: 'active' });
  assert.equal(hasScheduledWork(p, [], [consultation], TODAY), false);
});

// ── hasOverdueWork (M4) ─────────────────────────────────────────────────────
// Уже есть конкретная просрочка — её показывает overdueProjects/overdueEntries
// собственной карточкой, мягкий застой её дублировать не должен.

test('hasOverdueWork is true for an overdue next step (scenario 13)', () => {
  const p = makeProject({ id: 'p1', nextActionText: 'Отправить эскиз', nextActionDate: '2026-07-01' });
  assert.equal(hasOverdueWork(p, [], [], TODAY), true);
});

test('hasOverdueWork is true for an overdue open session (scenario 14)', () => {
  const p = makeProject({ id: 'p1' });
  const session = makeSession({ projectId: 'p1', date: '2026-07-01', done: false, cancelled: false });
  assert.equal(hasOverdueWork(p, [session], [], TODAY), true);
});

test('hasOverdueWork is true for an overdue open consultation (scenario 15)', () => {
  const p = makeProject({ id: 'p1' });
  const consultation = makeConsultation({ projectId: 'p1', date: '2026-07-01', done: false, cancelled: false, status: 'active' });
  assert.equal(hasOverdueWork(p, [], [consultation], TODAY), true);
});

test('hasOverdueWork ignores a done past session — already resolved, not overdue', () => {
  const p = makeProject({ id: 'p1' });
  const session = makeSession({ projectId: 'p1', date: '2026-07-01', done: true });
  assert.equal(hasOverdueWork(p, [session], [], TODAY), false);
});

test('hasOverdueWork ignores an overdue session/consultation belonging to a different project (scenario 18, 19)', () => {
  const p = makeProject({ id: 'p1' });
  const session = makeSession({ projectId: 'other-project', date: '2026-07-01', done: false, cancelled: false });
  const consultation = makeConsultation({ projectId: 'another-project', date: '2026-07-01', status: 'active' });
  assert.equal(hasOverdueWork(p, [session], [consultation], TODAY), false);
});

test('hasOverdueWork is false when the project has no next step, sessions or consultations', () => {
  const p = makeProject({ id: 'p1' });
  assert.equal(hasOverdueWork(p, [], [], TODAY), false);
});
