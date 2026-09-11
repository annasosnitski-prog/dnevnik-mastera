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

function makeConsultation(overrides = {}) {
  return {
    id: 'c1',
    date: '2026-01-01',
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
    projectId: 'p1',
    ...overrides,
  };
}

function makeSession(overrides = {}) {
  return {
    id: 's1',
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
    isLastSession: false,
    cancelled: false,
    projectId: 'p1',
    sourceConsultationId: null,
    previousSessionId: null,
    nextSessionId: null,
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
  assert.equal(getProjectPipelineSegments(makeProject(), [], []), null);
  assert.equal(getProjectPipelineSegments(makeProject({ firstSessionWindowAmount: 1 }), [], []), null);
  assert.equal(getProjectPipelineSegments(makeProject({ firstSessionWindowUnit: 'week' }), [], []), null);
});

test('consultation pipeline has four ordered points and lands session at one week', () => {
  const segments = getProjectPipelineSegments(makeProject({
    firstSessionWindowAmount: 1,
    firstSessionWindowUnit: 'week',
    preSessionMeeting: 'consultation',
  }), [], []);

  assert.ok(segments);
  assert.deepEqual(segments.map((segment) => segment.key), ['moodboard', 'sketch', 'consultation', 'session']);
  assert.ok(segments.every((segment) => segment.source === 'forecast'), 'no records/next step means every point is a forecast');
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
  }), [], []);

  assert.ok(segments);
  assert.deepEqual(segments.map((segment) => segment.key), ['moodboard', 'sketch', 'session']);
  assert.equal(segments.some((segment) => segment.key === 'consultation'), false);
  assert.equal(segments.at(-1).targetDate, '2026-01-08');
});

test('two-month window uses calendar months and preserves final session target', () => {
  const segments = getProjectPipelineSegments(makeProject({
    firstSessionWindowAmount: 2,
    firstSessionWindowUnit: 'month',
  }), [], []);

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
  }), [], []);

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
  }), [], []);
  const withExactDate = getProjectPipelineSegments(makeProject({
    createdDate: '2026-01-01T00:00:00.000Z',
    firstSessionWindowAmount: null,
    firstSessionWindowUnit: null,
    firstSessionExactDate: '2026-01-08',
  }), [], []);
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
  }), [], []);
  assert.equal(segments.at(-1).targetDate, '2026-01-08');
});

test('an exact date before createdDate is nonsensical and yields no pipeline', () => {
  const segments = getProjectPipelineSegments(makeProject({
    createdDate: '2026-01-10T00:00:00.000Z',
    firstSessionExactDate: '2026-01-01',
  }), [], []);
  assert.equal(segments, null);
});

test('an exact date equal to createdDate is a valid (zero-length) pipeline', () => {
  const segments = getProjectPipelineSegments(makeProject({
    createdDate: '2026-01-01T00:00:00.000Z',
    firstSessionExactDate: '2026-01-01',
  }), [], []);
  assert.ok(segments);
  assert.ok(segments.every((s) => s.targetDate === '2026-01-01'));
});

// ── Три источника точки: факт → обещание → прогноз ─────────────────────────
// (Хаб-документ этой задачи: разбор реального проекта «Спина Паучьих
// Лилий» — окно рисовало «Сессия 1 сен» для сессии, которой не было вообще,
// и консультацию не на ту дату, что была в реальности.)

test('a real open consultation wins over the forecast for the consultation stage', () => {
  const consultation = makeConsultation({ id: 'c1', projectId: 'p1', date: '2026-08-20' });
  const segments = getProjectPipelineSegments(
    makeProject({ firstSessionWindowAmount: 2, firstSessionWindowUnit: 'month' }),
    [],
    [consultation],
  );

  assert.ok(segments);
  const point = segments.find((s) => s.key === 'consultation');
  assert.equal(point.source, 'actual');
  assert.equal(point.targetDate, '2026-08-20');
  assert.equal(point.actionType, null);
  assert.equal(point.actionText, null);
});

test('a matching next step commits a stage that has no record', () => {
  const segments = getProjectPipelineSegments(
    makeProject({
      firstSessionWindowAmount: 2,
      firstSessionWindowUnit: 'month',
      nextActionText: 'Собрать референсы у клиента',
      nextActionDate: '2026-07-20',
      nextActionType: 'collect_information',
    }),
    [],
    [],
  );

  assert.ok(segments);
  const point = segments.find((s) => s.key === 'moodboard');
  assert.equal(point.source, 'committed');
  assert.equal(point.targetDate, '2026-07-20');
  assert.equal(point.actionType, 'collect_information');
  assert.equal(point.actionText, 'Собрать референсы у клиента');
});

test('a stage with neither a record nor a matching next step falls back to the old forecast', () => {
  const withoutNextStep = getProjectPipelineSegments(
    makeProject({ firstSessionWindowAmount: 2, firstSessionWindowUnit: 'month' }),
    [],
    [],
  );
  const withUnrelatedNextStep = getProjectPipelineSegments(
    makeProject({
      firstSessionWindowAmount: 2,
      firstSessionWindowUnit: 'month',
      nextActionText: 'Позвонить клиенту',
      nextActionDate: '2026-07-10',
      nextActionType: 'contact_client',
    }),
    [],
    [],
  );

  assert.ok(withoutNextStep);
  assert.ok(withUnrelatedNextStep);
  // contact_client не отображён ни на одну стадию — прогноз должен остаться
  // ровно тем же, что и вовсе без next step (старая формула не задета).
  assert.deepEqual(withUnrelatedNextStep, withoutNextStep);
  const moodboard = withoutNextStep.find((s) => s.key === 'moodboard');
  assert.equal(moodboard.source, 'forecast');
  assert.equal(moodboard.actionType, 'collect_information');
  assert.equal(moodboard.actionText, null);
});

test('a next step without a mapped type does not produce a committed point', () => {
  const segments = getProjectPipelineSegments(
    makeProject({
      firstSessionWindowAmount: 2,
      firstSessionWindowUnit: 'month',
      nextActionText: 'Проверить заживление',
      nextActionDate: '2026-07-15',
      nextActionType: 'check_healing',
    }),
    [],
    [],
  );

  assert.ok(segments);
  assert.ok(segments.every((s) => s.source === 'forecast'));
});

test('a next step with text and date but no chosen type does not commit any stage', () => {
  // nextActionType===null — нормальное состояние (next step задан только
  // текстом/датой), а не временное; угадывать тип по тексту нельзя.
  const segments = getProjectPipelineSegments(
    makeProject({
      firstSessionWindowAmount: 2,
      firstSessionWindowUnit: 'month',
      nextActionText: 'Собрать референсы',
      nextActionDate: '2026-07-20',
      nextActionType: null,
    }),
    [],
    [],
  );

  assert.ok(segments);
  assert.ok(segments.every((s) => s.source === 'forecast'));
});

test('a cancelled consultation does not count as an actual record', () => {
  const cancelled = makeConsultation({ id: 'c1', projectId: 'p1', date: '2026-08-20', cancelled: true });
  const segments = getProjectPipelineSegments(
    makeProject({ firstSessionWindowAmount: 2, firstSessionWindowUnit: 'month' }),
    [],
    [cancelled],
  );

  assert.ok(segments);
  const point = segments.find((s) => s.key === 'consultation');
  assert.equal(point.source, 'forecast');
});

test('a cancelled session does not count as an actual record', () => {
  const cancelled = makeSession({ id: 's1', projectId: 'p1', date: '2026-08-25', cancelled: true });
  const segments = getProjectPipelineSegments(
    makeProject({ firstSessionWindowAmount: 2, firstSessionWindowUnit: 'month' }),
    [cancelled],
    [],
  );

  assert.ok(segments);
  const point = segments.find((s) => s.key === 'session');
  assert.equal(point.source, 'forecast');
});

// Регрессия «Спина Паучьих Лилий»: создан 2026-07-01, окно 2 месяца (цель
// 2026-09-01), две консультации (2026-08-20 и 2026-08-28), сессии нет вовсе.
// Старая шкала рисовала «Сессия 1 сен» для события, которого не существует,
// и консультацию не на ту дату — новая должна показать факт там, где он
// есть, и честный прогноз там, где записи нет.
test('regression: two consultations and no session — consultation is actual at the earliest date, session stays a forecast', () => {
  const project = makeProject({
    id: 'p1',
    createdDate: '2026-07-01T00:00:00.000Z',
    firstSessionWindowAmount: 2,
    firstSessionWindowUnit: 'month',
  });
  const consultations = [
    makeConsultation({ id: 'c1', projectId: 'p1', date: '2026-08-20' }),
    makeConsultation({ id: 'c2', projectId: 'p1', date: '2026-08-28' }),
  ];

  const segments = getProjectPipelineSegments(project, [], consultations);

  assert.ok(segments);
  const consultationPoint = segments.find((s) => s.key === 'consultation');
  const sessionPoint = segments.find((s) => s.key === 'session');
  assert.equal(consultationPoint.source, 'actual');
  assert.equal(consultationPoint.targetDate, '2026-08-20');
  assert.equal(sessionPoint.source, 'forecast');
  assert.equal(sessionPoint.targetDate, '2026-09-01');
});
