import assert from 'node:assert/strict';
import test from 'node:test';

import {
  migrateClientRecordsIntoProjects,
  unsortedProjectId,
  UNSORTED_PROJECT_TITLE,
} from '../.test-dist/src/lib/clientRecordsMigration.js';

function makeProject(overrides = {}) {
  return {
    id: 'project-1',
    title: 'Дракон',
    color: '#B0413E',
    category: 'tattoo',
    clientId: null,
    status: 'waiting_deposit',
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

function makeClient(overrides = {}) {
  return {
    id: 'client-1',
    name: 'Анна',
    surname: 'Соснитски',
    color: '#3E7CA6',
    sessions: [],
    consultations: [],
    ...overrides,
  };
}

function makeSession(overrides = {}) {
  return { id: 'session-1', date: '2026-01-01', projectId: null, ...overrides };
}

function makeConsultation(overrides = {}) {
  return { id: 'consult-1', date: '2026-01-01', projectId: null, ...overrides };
}

// ── Основной путь: запись уезжает в свой проект ────────────────────────────

test('a session with a valid projectId moves into that project', () => {
  const project = makeProject({ id: 'p1', clientId: 'client-1' });
  const client = makeClient({ sessions: [makeSession({ id: 's1', projectId: 'p1' })] });

  const result = migrateClientRecordsIntoProjects([client], [project]);

  const target = result.projects.find((p) => p.id === 'p1');
  assert.equal(target.sessions.length, 1);
  assert.equal(target.sessions[0].id, 's1');
  assert.equal(result.movedSessions, 1);
  assert.equal(result.createdUnsortedProjects, 0);
});

test('a consultation with a valid projectId moves into that project', () => {
  const project = makeProject({ id: 'p1', clientId: 'client-1' });
  const client = makeClient({ consultations: [makeConsultation({ id: 'c1', projectId: 'p1' })] });

  const result = migrateClientRecordsIntoProjects([client], [project]);

  const target = result.projects.find((p) => p.id === 'p1');
  assert.equal(target.consultations.length, 1);
  assert.equal(target.consultations[0].id, 'c1');
  assert.equal(result.movedConsultations, 1);
});

// ── «Неразобранный проект» ────────────────────────────────────────────────

test('a record with no projectId lands in the client\'s «Неразобранный проект»', () => {
  const client = makeClient({ sessions: [makeSession({ id: 's1', projectId: null })] });

  const result = migrateClientRecordsIntoProjects([client], []);

  const unsorted = result.projects.find((p) => p.id === unsortedProjectId('client-1'));
  assert.ok(unsorted, 'должен появиться Неразобранный проект');
  assert.equal(unsorted.title, UNSORTED_PROJECT_TITLE);
  assert.equal(unsorted.clientId, 'client-1');
  assert.equal(unsorted.sessions.length, 1);
  assert.equal(result.createdUnsortedProjects, 1);
});

test('a record pointing at a deleted project lands in «Неразобранный», not lost', () => {
  const client = makeClient({ sessions: [makeSession({ id: 's1', projectId: 'ghost-project' })] });

  const result = migrateClientRecordsIntoProjects([client], []);

  const unsorted = result.projects.find((p) => p.id === unsortedProjectId('client-1'));
  assert.equal(unsorted.sessions.length, 1);
  assert.equal(unsorted.sessions[0].id, 's1');
});

test('a record pointing at ANOTHER client\'s project lands in its own «Неразобранный», not the stranger project', () => {
  const strangerProject = makeProject({ id: 'p-other', clientId: 'client-2' });
  const client = makeClient({ sessions: [makeSession({ id: 's1', projectId: 'p-other' })] });

  const result = migrateClientRecordsIntoProjects([client], [strangerProject]);

  assert.equal(result.projects.find((p) => p.id === 'p-other').sessions.length, 0);
  assert.equal(result.projects.find((p) => p.id === unsortedProjectId('client-1')).sessions.length, 1);
});

test('one «Неразобранный» per client holds all of that client\'s orphans', () => {
  const client = makeClient({
    sessions: [makeSession({ id: 's1' }), makeSession({ id: 's2' })],
    consultations: [makeConsultation({ id: 'c1' })],
  });

  const result = migrateClientRecordsIntoProjects([client], []);

  assert.equal(result.createdUnsortedProjects, 1);
  const unsorted = result.projects.find((p) => p.id === unsortedProjectId('client-1'));
  assert.deepEqual(unsorted.sessions.map((s) => s.id), ['s1', 's2']);
  assert.deepEqual(unsorted.consultations.map((c) => c.id), ['c1']);
});

test('«Неразобранный» is only created when there is actually something to put in it', () => {
  const project = makeProject({ id: 'p1', clientId: 'client-1' });
  const client = makeClient({ sessions: [makeSession({ id: 's1', projectId: 'p1' })] });

  const result = migrateClientRecordsIntoProjects([client], [project]);

  assert.equal(result.createdUnsortedProjects, 0);
  assert.ok(!result.projects.some((p) => p.id === unsortedProjectId('client-1')));
});

// ── Идемпотентность (критично: легаси-массивы клиента остаются в базе) ─────

test('running twice does not duplicate records', () => {
  const project = makeProject({ id: 'p1', clientId: 'client-1' });
  const client = makeClient({ sessions: [makeSession({ id: 's1', projectId: 'p1' })] });

  const first = migrateClientRecordsIntoProjects([client], [project]);
  const second = migrateClientRecordsIntoProjects([client], first.projects);

  assert.equal(second.movedSessions, 0);
  assert.equal(second.projects.find((p) => p.id === 'p1').sessions.length, 1);
});

test('a second run reports nothing to do and returns the very same projects reference', () => {
  const project = makeProject({ id: 'p1', clientId: 'client-1' });
  const client = makeClient({ sessions: [makeSession({ id: 's1', projectId: 'p1' })] });

  const first = migrateClientRecordsIntoProjects([client], [project]);
  const second = migrateClientRecordsIntoProjects([client], first.projects);

  assert.equal(second.changedProjectIds.length, 0);
  assert.equal(second.projects, first.projects);
});

test('a record the master moved by hand after migration is not dragged back', () => {
  // s1 перенесена в «Неразобранный», затем мастер руками перекинула её в p1.
  const realProject = makeProject({ id: 'p1', clientId: 'client-1', sessions: [makeSession({ id: 's1', projectId: 'p1' })] });
  const emptyUnsorted = makeProject({ id: unsortedProjectId('client-1'), clientId: 'client-1', title: UNSORTED_PROJECT_TITLE });
  // Легаси-массив клиента всё ещё содержит исходную запись без проекта.
  const client = makeClient({ sessions: [makeSession({ id: 's1', projectId: null })] });

  const result = migrateClientRecordsIntoProjects([client], [realProject, emptyUnsorted]);

  assert.equal(result.movedSessions, 0);
  assert.equal(result.projects.find((p) => p.id === unsortedProjectId('client-1')).sessions.length, 0);
  assert.equal(result.projects.find((p) => p.id === 'p1').sessions.length, 1);
});

// ── Ничего не теряется и не мутируется ────────────────────────────────────

test('no record is lost: every client record ends up in exactly one project', () => {
  const p1 = makeProject({ id: 'p1', clientId: 'client-1' });
  const client = makeClient({
    sessions: [
      makeSession({ id: 's-linked', projectId: 'p1' }),
      makeSession({ id: 's-orphan', projectId: null }),
      makeSession({ id: 's-ghost', projectId: 'gone' }),
    ],
    consultations: [makeConsultation({ id: 'c-linked', projectId: 'p1' }), makeConsultation({ id: 'c-orphan' })],
  });

  const result = migrateClientRecordsIntoProjects([client], [p1]);

  const allSessionIds = result.projects.flatMap((p) => p.sessions.map((s) => s.id)).sort();
  const allConsultIds = result.projects.flatMap((p) => p.consultations.map((c) => c.id)).sort();
  assert.deepEqual(allSessionIds, ['s-ghost', 's-linked', 's-orphan']);
  assert.deepEqual(allConsultIds, ['c-linked', 'c-orphan']);
  assert.equal(allSessionIds.length, new Set(allSessionIds).size, 'ни одна сессия не задвоилась');
});

test('every moved record carries the projectId of the project it actually landed in', () => {
  const client = makeClient({ sessions: [makeSession({ id: 's1', projectId: 'gone' })] });

  const result = migrateClientRecordsIntoProjects([client], []);

  const unsorted = result.projects.find((p) => p.id === unsortedProjectId('client-1'));
  assert.equal(unsorted.sessions[0].projectId, unsortedProjectId('client-1'));
});

test('the input clients and projects are not mutated', () => {
  const project = makeProject({ id: 'p1', clientId: 'client-1' });
  const client = makeClient({ sessions: [makeSession({ id: 's1', projectId: 'p1' })] });
  const projectsSnapshot = structuredClone([project]);
  const clientsSnapshot = structuredClone([client]);

  migrateClientRecordsIntoProjects([client], [project]);

  assert.deepEqual([client], clientsSnapshot, 'легаси-массивы клиента остаются нетронутыми как страховка');
  assert.deepEqual([project], projectsSnapshot);
});

test('clients with nothing to migrate are skipped entirely', () => {
  const project = makeProject({ id: 'p1', clientId: 'client-1' });
  const projects = [project];
  const emptyClient = makeClient({ id: 'client-empty' });

  const result = migrateClientRecordsIntoProjects([emptyClient], projects);

  assert.equal(result.movedSessions, 0);
  assert.equal(result.movedConsultations, 0);
  assert.equal(result.changedProjectIds.length, 0);
  // Та же ссылка — вызывающему коду нечего писать в базу.
  assert.equal(result.projects, projects);
});

test('existing project order is preserved, new «Неразобранные» go last', () => {
  const a = makeProject({ id: 'p-a', clientId: 'client-1' });
  const b = makeProject({ id: 'p-b', clientId: 'client-1' });
  const client = makeClient({ sessions: [makeSession({ id: 's1', projectId: null })] });

  const result = migrateClientRecordsIntoProjects([client], [a, b]);

  assert.deepEqual(result.projects.map((p) => p.id), ['p-a', 'p-b', unsortedProjectId('client-1')]);
});

test('records of several clients go to their own projects, never mixed', () => {
  const p1 = makeProject({ id: 'p1', clientId: 'c1' });
  const p2 = makeProject({ id: 'p2', clientId: 'c2' });
  const clientA = makeClient({ id: 'c1', sessions: [makeSession({ id: 's-a', projectId: 'p1' })] });
  const clientB = makeClient({ id: 'c2', sessions: [makeSession({ id: 's-b', projectId: 'p2' })] });

  const result = migrateClientRecordsIntoProjects([clientA, clientB], [p1, p2]);

  assert.deepEqual(result.projects.find((p) => p.id === 'p1').sessions.map((s) => s.id), ['s-a']);
  assert.deepEqual(result.projects.find((p) => p.id === 'p2').sessions.map((s) => s.id), ['s-b']);
});

test('client-less («Мастерская») project records are left alone', () => {
  const workshop = makeProject({ id: 'w1', clientId: null, sessions: [makeSession({ id: 's-workshop', projectId: 'w1' })] });
  const client = makeClient({ sessions: [makeSession({ id: 's1', projectId: null })] });

  const result = migrateClientRecordsIntoProjects([client], [workshop]);

  assert.deepEqual(result.projects.find((p) => p.id === 'w1').sessions.map((s) => s.id), ['s-workshop']);
});
