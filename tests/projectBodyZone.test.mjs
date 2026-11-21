import assert from 'node:assert/strict';
import test from 'node:test';

import { projectBodyZone, PROJECT_BODY_ZONE_OTHER } from '../.test-dist/src/domain/project.js';
import { buildProjectOwnerFolders, groupProjectsByClient } from '../.test-dist/src/domain/projectSelectors.js';

function makeProject(overrides = {}) {
  return {
    id: 'p1',
    title: 'Проект',
    color: '#000000',
    category: 'tattoo',
    clientId: null,
    status: 'active',
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
    createdDate: '2026-01-01T00:00:00.000Z',
    sessions: [],
    consultations: [],
    lastMeaningfulActivityAt: null,
    ...overrides,
  };
}

test('projectBodyZone maps specific places to their big zone', () => {
  assert.equal(projectBodyZone('Икра'), 'Нога');
  assert.equal(projectBodyZone('Голень'), 'Нога');
  assert.equal(projectBodyZone('Кисть'), 'Рука');
  assert.equal(projectBodyZone('Предплечье'), 'Рука');
  assert.equal(projectBodyZone('Поясница'), 'Спина');
  assert.equal(projectBodyZone('Грудь'), 'Перед');
  assert.equal(projectBodyZone('Рёбра'), 'Перед');
});

test('projectBodyZone falls back to "Другое" for empty or unrecognised areas', () => {
  assert.equal(projectBodyZone(''), PROJECT_BODY_ZONE_OTHER);
  assert.equal(projectBodyZone('Левая бровь'), PROJECT_BODY_ZONE_OTHER);
});

test('buildProjectOwnerFolders always lists «Личные проекты» then «Клиенты», even empty', () => {
  const folders = buildProjectOwnerFolders([]);
  assert.deepEqual(folders.map((f) => f.title), ['Личные проекты', 'Клиенты']);
  assert.ok(folders.every((f) => f.projectCount === 0));
});

test('buildProjectOwnerFolders splits client-less projects from client projects', () => {
  const projects = [
    makeProject({ id: 'own', clientId: null }),
    makeProject({ id: 'a1', clientId: 'client-a' }),
    makeProject({ id: 'b1', clientId: 'client-b' }),
  ];
  const [personal, clients] = buildProjectOwnerFolders(projects);
  assert.deepEqual(personal.projects.map((p) => p.id), ['own']);
  assert.deepEqual(clients.projects.map((p) => p.id), ['a1', 'b1']);
});

test('groupProjectsByClient groups by client name, unknown clients go to «Клиент не найден»', () => {
  const clients = [{ id: 'client-a', name: 'Аня', surname: 'К' }];
  const groups = groupProjectsByClient(
    [
      makeProject({ id: 'a1', clientId: 'client-a' }),
      makeProject({ id: 'x1', clientId: 'gone' }),
      makeProject({ id: 'a2', clientId: 'client-a' }),
    ],
    clients,
  );
  assert.deepEqual(groups.map((g) => g.area), ['Аня К', 'Клиент не найден']);
  assert.deepEqual(groups[0].projects.map((p) => p.id), ['a1', 'a2']);
});
