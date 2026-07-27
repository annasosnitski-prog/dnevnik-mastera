import assert from 'node:assert/strict';
import test from 'node:test';

import { buildProjectFolders } from '../.test-dist/src/domain/projectSelectors.js';

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
