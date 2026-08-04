import assert from 'node:assert/strict';
import test from 'node:test';

import { staleProjects, STALE_PROJECT_THRESHOLD_DAYS } from '../.test-dist/src/reminders/buildReminders.js';

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

function makeClient(overrides = {}) {
  return {
    id: 'client-1',
    sessions: [],
    consultations: [],
    ...overrides,
  };
}

function makeSession(overrides = {}) {
  return {
    id: 'session-1',
    date: '2026-01-01',
    done: false,
    cancelled: false,
    projectId: null,
    ...overrides,
  };
}

// NOW сдвинут так, чтобы «застой ровно STALE_PROJECT_THRESHOLD_DAYS дней»
// давал предсказуемый результат независимо от того, каким числом окажется
// порог в будущем.
const NOW = new Date('2026-03-01T12:00:00');
function daysBeforeNow(days) {
  const d = new Date(NOW);
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

test('staleProjects surfaces an active project with no activity for at least the threshold', () => {
  const stale = daysBeforeNow(STALE_PROJECT_THRESHOLD_DAYS);
  const project = makeProject({ createdDate: stale, lastMeaningfulActivityAt: stale });
  const result = staleProjects([project], [], NOW);
  assert.equal(result.length, 1);
  assert.equal(result[0].project.id, 'project-1');
  assert.equal(result[0].lastActivityDate, stale);
  assert.equal(result[0].daysSince, STALE_PROJECT_THRESHOLD_DAYS);
});

test('staleProjects ignores a project with activity just under the threshold', () => {
  const fresh = daysBeforeNow(STALE_PROJECT_THRESHOLD_DAYS - 1);
  const project = makeProject({ createdDate: fresh, lastMeaningfulActivityAt: fresh });
  assert.equal(staleProjects([project], [], NOW).length, 0);
});

test('staleProjects ignores a paused/cancelled/archived project — deliberately not moving, not stalled', () => {
  const stale = daysBeforeNow(STALE_PROJECT_THRESHOLD_DAYS + 10);
  for (const state of ['paused', 'cancelled', 'archived']) {
    const project = makeProject({ createdDate: stale, lastMeaningfulActivityAt: stale, state });
    assert.equal(staleProjects([project], [], NOW).length, 0, `state=${state}`);
  }
});

test('staleProjects ignores a completed-stage project — nothing left to move', () => {
  const stale = daysBeforeNow(STALE_PROJECT_THRESHOLD_DAYS + 10);
  const project = makeProject({ createdDate: stale, lastMeaningfulActivityAt: stale, stage: 'completed' });
  assert.equal(staleProjects([project], [], NOW).length, 0);
});

test('staleProjects is rescued by a done session linked through a client', () => {
  const stale = daysBeforeNow(STALE_PROJECT_THRESHOLD_DAYS + 10);
  const recent = daysBeforeNow(1);
  const project = makeProject({ id: 'p1', createdDate: stale, lastMeaningfulActivityAt: stale });
  const client = makeClient({ sessions: [makeSession({ projectId: 'p1', date: recent, done: true })] });
  assert.equal(staleProjects([project], [client], NOW).length, 0);
});

test('staleProjects is rescued by a consultation history entry linked through a client', () => {
  const stale = daysBeforeNow(STALE_PROJECT_THRESHOLD_DAYS + 10);
  const recent = daysBeforeNow(1);
  const project = makeProject({ id: 'p1', createdDate: stale, lastMeaningfulActivityAt: stale });
  const client = makeClient({
    consultations: [
      { id: 'c1', projectId: 'p1', history: [{ id: 'h1', date: `${recent}T00:00:00.000Z`, note: 'встреча' }] },
    ],
  });
  assert.equal(staleProjects([project], [client], NOW).length, 0);
});

test('staleProjects counts a done session sitting directly on a client-less (workshop) project', () => {
  const stale = daysBeforeNow(STALE_PROJECT_THRESHOLD_DAYS + 10);
  const recent = daysBeforeNow(1);
  const project = makeProject({
    id: 'p1',
    clientId: null,
    createdDate: stale,
    lastMeaningfulActivityAt: stale,
    sessions: [makeSession({ projectId: 'p1', date: recent, done: true })],
  });
  assert.equal(staleProjects([project], [], NOW).length, 0);
});

test('staleProjects sorts the most stalled project first', () => {
  const veryStale = daysBeforeNow(STALE_PROJECT_THRESHOLD_DAYS + 30);
  const barelyStale = daysBeforeNow(STALE_PROJECT_THRESHOLD_DAYS);
  const older = makeProject({ id: 'p-older', createdDate: veryStale, lastMeaningfulActivityAt: veryStale });
  const newer = makeProject({ id: 'p-newer', createdDate: barelyStale, lastMeaningfulActivityAt: barelyStale });
  const result = staleProjects([newer, older], [], NOW);
  assert.deepEqual(result.map((it) => it.project.id), ['p-older', 'p-newer']);
});
