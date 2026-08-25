import assert from 'node:assert/strict';
import test from 'node:test';

import { overdueProjects } from '../.test-dist/src/reminders/buildReminders.js';

function makeProject(overrides = {}) {
  return {
    id: 'project-1',
    title: 'Дракон',
    color: '#B0413E',
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
    createdDate: '2026-01-01',
    sessions: [],
    consultations: [],
    ...overrides,
  };
}

const NOW = new Date('2026-02-01T12:00:00');

test('overdueProjects surfaces an active project whose next step date is today or past', () => {
  const project = makeProject({ nextActionText: 'Отправить мудборд', nextActionDate: '2026-01-15' });
  const result = overdueProjects([project], NOW);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'project-1');
});

test('overdueProjects ignores a project whose next step date is in the future', () => {
  const project = makeProject({ nextActionText: 'Отправить мудборд', nextActionDate: '2026-03-01' });
  assert.equal(overdueProjects([project], NOW).length, 0);
});

test('overdueProjects ignores a non-active project', () => {
  const project = makeProject({ nextActionText: 'Отправить мудборд', nextActionDate: '2026-01-15', state: 'paused' });
  assert.equal(overdueProjects([project], NOW).length, 0);
});

// Второй независимый guard (помимо resolveNextStep на сохранении, см.
// domain/project.ts) — старые/повреждённые записи могут содержать дату без
// текста; такой проект не должен создавать пустую просроченную карточку
// «Следующий шаг: —».
test('overdueProjects does not surface a project with a date but empty next-step text', () => {
  const project = makeProject({ nextActionText: '', nextActionDate: '2026-01-15' });
  assert.equal(overdueProjects([project], NOW).length, 0);
});

test('overdueProjects does not surface a project whose next-step text is only whitespace', () => {
  const project = makeProject({ nextActionText: '   ', nextActionDate: '2026-01-15' });
  assert.equal(overdueProjects([project], NOW).length, 0);
});

test('overdueProjects sorts from most overdue first', () => {
  const older = makeProject({ id: 'p-older', nextActionText: 'A', nextActionDate: '2026-01-01' });
  const newer = makeProject({ id: 'p-newer', nextActionText: 'B', nextActionDate: '2026-01-20' });
  const result = overdueProjects([newer, older], NOW);
  assert.deepEqual(result.map((p) => p.id), ['p-older', 'p-newer']);
});
