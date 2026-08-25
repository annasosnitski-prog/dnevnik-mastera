import assert from 'node:assert/strict';
import test from 'node:test';

import { getProjectPipelineSegments } from '../.test-dist/src/domain/projectSelectors.js';
import { normalizeProject } from '../.test-dist/src/lib/normalize.js';

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
    area: 'Рука',
    style: '',
    generalNotes: '',
    feeling: '',
    creative: '',
    inspirationSources: '',
    photos: [],
    createdDate: '2026-01-01T12:00:00.000Z',
    firstSessionWindowAmount: null,
    firstSessionWindowUnit: null,
    preSessionMeeting: 'consultation',
    sessions: [],
    consultations: [],
    lastMeaningfulActivityAt: null,
    ...overrides,
  };
}

function dateDiffDays(a, b) {
  return (Date.parse(`${b}T00:00:00.000Z`) - Date.parse(`${a}T00:00:00.000Z`)) / 86_400_000;
}

test('normalizeProject defaults pipeline fields for legacy projects', () => {
  const project = normalizeProject({ id: 'legacy', createdDate: '2026-01-01T00:00:00.000Z' }, 0);
  assert.equal(project.firstSessionWindowAmount, null);
  assert.equal(project.firstSessionWindowUnit, null);
  assert.equal(project.preSessionMeeting, 'consultation');
});

test('project without a complete first-session window has no pipeline', () => {
  assert.equal(getProjectPipelineSegments(makeProject()), null);
  assert.equal(getProjectPipelineSegments(makeProject({ firstSessionWindowAmount: 1 })), null);
  assert.equal(getProjectPipelineSegments(makeProject({ firstSessionWindowUnit: 'week' })), null);
});

test('consultation pipeline has four ordered points and lands session at one week', () => {
  const segments = getProjectPipelineSegments(makeProject({
    firstSessionWindowAmount: 1,
    firstSessionWindowUnit: 'week',
    preSessionMeeting: 'consultation',
  }));

  assert.ok(segments);
  assert.deepEqual(segments.map((segment) => segment.key), ['moodboard', 'sketch', 'consultation', 'session']);
  assert.equal(segments.at(-1).targetDate, '2026-01-08');

  const dates = ['2026-01-01', ...segments.map((segment) => segment.targetDate)];
  const gaps = dates.slice(1).map((date, index) => dateDiffDays(dates[index], date));
  assert.ok(Math.max(...gaps) - Math.min(...gaps) <= 1, `expected approximately equal gaps, got ${gaps.join(',')}`);
});

test('pipeline without pre-session consultation has three points', () => {
  const segments = getProjectPipelineSegments(makeProject({
    firstSessionWindowAmount: 1,
    firstSessionWindowUnit: 'week',
    preSessionMeeting: 'none',
  }));

  assert.ok(segments);
  assert.deepEqual(segments.map((segment) => segment.key), ['moodboard', 'sketch', 'session']);
  assert.equal(segments.some((segment) => segment.key === 'consultation'), false);
  assert.equal(segments.at(-1).targetDate, '2026-01-08');
});

test('two-month window uses calendar months and preserves final session target', () => {
  const segments = getProjectPipelineSegments(makeProject({
    firstSessionWindowAmount: 2,
    firstSessionWindowUnit: 'month',
  }));

  assert.ok(segments);
  assert.equal(segments.at(-1).targetDate, '2026-03-01');
  assert.equal(segments.length, 4);
});

test('createdDate equal to today is a valid pipeline boundary', () => {
  const segments = getProjectPipelineSegments(makeProject({
    createdDate: '2026-08-25T23:59:00.000Z',
    firstSessionWindowAmount: 1,
    firstSessionWindowUnit: 'week',
    preSessionMeeting: 'none',
  }));

  assert.ok(segments);
  assert.equal(segments.at(-1).targetDate, '2026-09-01');
});

test('normalization preserves valid pipeline configuration', () => {
  const project = normalizeProject({
    id: 'configured',
    createdDate: '2026-01-01T00:00:00.000Z',
    firstSessionWindowAmount: 2,
    firstSessionWindowUnit: 'month',
    preSessionMeeting: 'none',
  }, 0);

  assert.equal(project.firstSessionWindowAmount, 2);
  assert.equal(project.firstSessionWindowUnit, 'month');
  assert.equal(project.preSessionMeeting, 'none');
});

// ── firstSessionExactDate — точная дата вместо окна ────────────────────────
// Взаимоисключающая альтернатива окну (см. Project.firstSessionExactDate):
// мастер указывает конкретный день первой сессии, а не срок.

test('normalizeProject defaults firstSessionExactDate to null', () => {
  const project = normalizeProject({ id: 'legacy', createdDate: '2026-01-01T00:00:00.000Z' }, 0);
  assert.equal(project.firstSessionExactDate, null);
});

test('normalizeProject keeps a valid firstSessionExactDate', () => {
  const project = normalizeProject({ createdDate: '2026-01-01T00:00:00.000Z', firstSessionExactDate: '2026-02-10' }, 0);
  assert.equal(project.firstSessionExactDate, '2026-02-10');
});

test('normalizeProject rejects a malformed or calendar-invalid firstSessionExactDate', () => {
  assert.equal(normalizeProject({ firstSessionExactDate: 'скоро' }, 0).firstSessionExactDate, null);
  assert.equal(normalizeProject({ firstSessionExactDate: '2026-02-30' }, 0).firstSessionExactDate, null);
});

test('an exact date builds the same pipeline as an equivalent window would', () => {
  const withWindow = getProjectPipelineSegments(makeProject({
    createdDate: '2026-01-01T00:00:00.000Z',
    firstSessionWindowAmount: 1,
    firstSessionWindowUnit: 'week',
  }));
  const withExactDate = getProjectPipelineSegments(makeProject({
    createdDate: '2026-01-01T00:00:00.000Z',
    firstSessionWindowAmount: null,
    firstSessionWindowUnit: null,
    firstSessionExactDate: '2026-01-08',
  }));
  assert.deepEqual(withExactDate, withWindow);
});

// В форме поля взаимоисключающи (галочка «Точная дата» либо пишет
// firstSessionExactDate, либо amount/unit, никогда оба сразу), но
// getProjectPipelineSegments защищается на случай повреждённой/легаси
// записи, где оба почему-то заданы: точная дата побеждает, потому что это
// более прямой, осознанный выбор мастера.
test('an exact date wins over a window if both are somehow set', () => {
  const segments = getProjectPipelineSegments(makeProject({
    createdDate: '2026-01-01T00:00:00.000Z',
    firstSessionWindowAmount: 6,
    firstSessionWindowUnit: 'month',
    firstSessionExactDate: '2026-01-08',
  }));
  assert.equal(segments.at(-1).targetDate, '2026-01-08');
});

test('an exact date before createdDate is nonsensical and yields no pipeline', () => {
  const segments = getProjectPipelineSegments(makeProject({
    createdDate: '2026-01-10T00:00:00.000Z',
    firstSessionExactDate: '2026-01-01',
  }));
  assert.equal(segments, null);
});

test('an exact date equal to createdDate is a valid (zero-length) pipeline', () => {
  const segments = getProjectPipelineSegments(makeProject({
    createdDate: '2026-01-01T00:00:00.000Z',
    firstSessionExactDate: '2026-01-01',
  }));
  assert.ok(segments);
  assert.ok(segments.every((s) => s.targetDate === '2026-01-01'));
});
