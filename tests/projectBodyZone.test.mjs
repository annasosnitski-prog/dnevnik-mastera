import assert from 'node:assert/strict';
import test from 'node:test';

import { projectBodyZone, PROJECT_BODY_ZONE_OTHER, PROJECT_BODY_ZONES } from '../.test-dist/src/domain/project.js';
import { buildProjectZoneFolders } from '../.test-dist/src/domain/projectSelectors.js';

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

test('buildProjectZoneFolders always lists the 4 main zones, even empty', () => {
  const folders = buildProjectZoneFolders([]);
  assert.deepEqual(folders.map((f) => f.title), PROJECT_BODY_ZONES.map((z) => z.label));
  assert.ok(folders.every((f) => f.projectCount === 0));
});

test('buildProjectZoneFolders groups projects from different clients under the same zone', () => {
  const projects = [
    makeProject({ id: 'calf', area: 'Икра', clientId: 'client-a' }),
    makeProject({ id: 'shin', area: 'Голень', clientId: 'client-b' }),
    makeProject({ id: 'wrist', area: 'Кисть', clientId: 'client-a' }),
  ];

  const folders = buildProjectZoneFolders(projects);
  const legFolder = folders.find((f) => f.title === 'Нога');
  const armFolder = folders.find((f) => f.title === 'Рука');

  assert.deepEqual(legFolder.projects.map((p) => p.id).sort(), ['calf', 'shin']);
  assert.deepEqual(armFolder.projects.map((p) => p.id), ['wrist']);
});

test('buildProjectZoneFolders only adds the "Другое" folder when something lands there', () => {
  const withoutOther = buildProjectZoneFolders([makeProject({ area: 'Нога' })]);
  assert.ok(!withoutOther.some((f) => f.title === PROJECT_BODY_ZONE_OTHER));

  const withOther = buildProjectZoneFolders([makeProject({ area: 'Левая бровь' })]);
  const otherFolder = withOther.find((f) => f.title === PROJECT_BODY_ZONE_OTHER);
  assert.ok(otherFolder);
  assert.equal(otherFolder.projectCount, 1);
});
