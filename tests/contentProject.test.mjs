import assert from 'node:assert/strict';
import test from 'node:test';

import { getProjectContentEntries } from '../.test-dist/src/lib/contentProject.js';

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
  return {
    id: 'session-1',
    name: 'Первая',
    date: '2026-02-01',
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
    ...overrides,
  };
}

function makeEntry(overrides = {}) {
  return {
    id: 'entry-1',
    createdDate: '2026-02-01T00:00:00.000Z',
    clientId: null,
    sourceType: 'freeform',
    sourceId: null,
    format: null,
    text: '',
    context: { client: '', zone: '', style: '', description: '' },
    photos: [],
    contentDraft: null,
    visualArchetype: null,
    textTriad: null,
    textDraft: 'Готовый текст',
    status: 'confirmed',
    isExemplar: false,
    ...overrides,
  };
}

test('a project-link entry belongs to that project', () => {
  const project = makeProject({ id: 'project-target' });
  const entry = makeEntry({ id: 'e1', link: { type: 'project', projectId: project.id } });

  const result = getProjectContentEntries([entry], project.id, [project], []);

  assert.deepEqual(result, [entry]);
});

test('a session-link entry belongs to the project via session.projectId', () => {
  const project = makeProject({ id: 'project-target' });
  const session = makeSession({ id: 'session-1', projectId: project.id });
  const client = makeClient({ sessions: [session] });
  const entry = makeEntry({ id: 'e1', link: { type: 'session', sessionId: session.id } });

  const result = getProjectContentEntries([entry], project.id, [project], [client]);

  assert.deepEqual(result, [entry]);
});

test('a legacy sourceType==="session" entry (no manual link) still belongs to its source session\'s project', () => {
  const project = makeProject({ id: 'project-target' });
  const session = makeSession({ id: 'session-1', projectId: project.id });
  const client = makeClient({ sessions: [session] });
  const entry = makeEntry({ id: 'e1', sourceType: 'session', sourceId: session.id });
  delete entry.link;

  const result = getProjectContentEntries([entry], project.id, [project], [client]);

  assert.deepEqual(result, [entry]);
});

test('an entry linked to a different project is excluded', () => {
  const thisProject = makeProject({ id: 'project-this' });
  const otherProject = makeProject({ id: 'project-other' });
  const entry = makeEntry({ id: 'e1', link: { type: 'project', projectId: otherProject.id } });

  const result = getProjectContentEntries([entry], thisProject.id, [thisProject, otherProject], []);

  assert.deepEqual(result, []);
});

test('an entry with no link and no source session is excluded from every project', () => {
  const project = makeProject({ id: 'project-target' });
  const entry = makeEntry({ id: 'e1', sourceType: 'freeform', sourceId: null });
  delete entry.link;

  const result = getProjectContentEntries([entry], project.id, [project], []);

  assert.deepEqual(result, []);
});

test('the order of matching entries follows the input order, no new sort', () => {
  const project = makeProject({ id: 'project-target' });
  const e1 = makeEntry({ id: 'e1', createdDate: '2026-03-01T00:00:00.000Z', link: { type: 'project', projectId: project.id } });
  const e2 = makeEntry({ id: 'e2', createdDate: '2026-01-01T00:00:00.000Z', link: { type: 'project', projectId: project.id } });
  const e3 = makeEntry({ id: 'e3', link: { type: 'project', projectId: 'some-other-project' } });
  const e4 = makeEntry({ id: 'e4', createdDate: '2026-02-01T00:00:00.000Z', link: { type: 'project', projectId: project.id } });

  const result = getProjectContentEntries([e1, e2, e3, e4], project.id, [project], []);

  assert.deepEqual(result.map((e) => e.id), ['e1', 'e2', 'e4']);
});

test('getProjectContentEntries does not mutate entries, projects or clients', () => {
  const project = makeProject({ id: 'project-target' });
  const session = makeSession({ id: 'session-1', projectId: project.id });
  const client = makeClient({ sessions: [session] });
  const entries = [
    makeEntry({ id: 'e1', link: { type: 'project', projectId: project.id } }),
    makeEntry({ id: 'e2', link: { type: 'session', sessionId: session.id } }),
  ];
  const projects = [project];
  const clients = [client];

  const entriesSnapshot = structuredClone(entries);
  const projectsSnapshot = structuredClone(projects);
  const clientsSnapshot = structuredClone(clients);

  getProjectContentEntries(entries, project.id, projects, clients);

  assert.deepEqual(entries, entriesSnapshot);
  assert.deepEqual(projects, projectsSnapshot);
  assert.deepEqual(clients, clientsSnapshot);
});
