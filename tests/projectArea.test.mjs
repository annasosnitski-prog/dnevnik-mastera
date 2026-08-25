import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EMPTY_PROJECT_FILTERS,
  filterProjects,
  groupProjectsByArea,
  projectFiltersActive,
} from '../.test-dist/src/domain/projectSelectors.js';

function makeProject(overrides = {}) {
  return {
    id: 'p1',
    title: 'Проект',
    color: '#000000',
    category: 'tattoo',
    clientId: null,
    status: 'active',
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
    createdDate: '2026-01-01T00:00:00.000Z',
    sessions: [],
    consultations: [],
    lastMeaningfulActivityAt: null,
    ...overrides,
  };
}

test('empty project filters are inactive including area', () => {
  assert.equal(projectFiltersActive(EMPTY_PROJECT_FILTERS), false);
  assert.equal(EMPTY_PROJECT_FILTERS.area, null);
});

test('area alone activates project filters', () => {
  assert.equal(projectFiltersActive({ ...EMPTY_PROJECT_FILTERS, area: 'Спина' }), true);
});

test('filterProjects matches Project.area exactly', () => {
  const projects = [
    makeProject({ id: 'back', area: 'Спина' }),
    makeProject({ id: 'leg', area: 'Нога' }),
    makeProject({ id: 'calf', area: 'Икра' }),
    makeProject({ id: 'shin', area: 'Голень' }),
  ];

  assert.deepEqual(
    filterProjects(projects, { ...EMPTY_PROJECT_FILTERS, area: 'Икра' }).map((p) => p.id),
    ['calf'],
  );
  assert.deepEqual(
    filterProjects(projects, { ...EMPTY_PROJECT_FILTERS, area: 'Голень' }).map((p) => p.id),
    ['shin'],
  );
});

test('area combines with existing category/state filters', () => {
  const projects = [
    makeProject({ id: 'match', area: 'Рука', category: 'tattoo', state: 'active' }),
    makeProject({ id: 'wrong-type', area: 'Рука', category: 'drawing', state: 'active' }),
    makeProject({ id: 'wrong-state', area: 'Рука', category: 'tattoo', state: 'paused' }),
  ];

  const result = filterProjects(projects, { category: 'tattoo', state: 'active', area: 'Рука' });
  assert.deepEqual(result.map((p) => p.id), ['match']);
});

test('groupProjectsByArea keeps separate area buckets and a readable empty bucket', () => {
  const projects = [
    makeProject({ id: 'a', area: 'Спина' }),
    makeProject({ id: 'b', area: '' }),
    makeProject({ id: 'c', area: 'Спина' }),
    makeProject({ id: 'd', area: 'Икра' }),
  ];

  const groups = groupProjectsByArea(projects);
  assert.deepEqual(groups.map((group) => group.area), ['Спина', 'Не задано', 'Икра']);
  assert.deepEqual(groups[0].projects.map((project) => project.id), ['a', 'c']);
});
