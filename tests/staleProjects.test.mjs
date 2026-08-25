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

function makeConsultation(overrides = {}) {
  return {
    id: 'consult-1',
    date: '2026-01-01',
    done: false,
    cancelled: false,
    status: 'active',
    history: [],
    projectId: null,
    ...overrides,
  };
}

// NOW сдвинут так, чтобы «застой ровно STALE_PROJECT_THRESHOLD_DAYS дней»
// давал предсказуемый результат независимо от того, каким числом окажется
// порог в будущем.
const NOW = new Date('2026-08-05T12:00:00');
function daysBeforeNow(days) {
  const d = new Date(NOW);
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function daysAfterNow(days) {
  return daysBeforeNow(-days);
}

// ── Порог: 30 дней (M4, временный продуктовый порог — не 21) ────────────────

test('the threshold is exactly 30 days, one calendar month', () => {
  assert.equal(STALE_PROJECT_THRESHOLD_DAYS, 30);
});

test('29 days without activity — no card (scenario 2)', () => {
  const fresh = daysBeforeNow(29);
  const project = makeProject({ lastMeaningfulActivityAt: fresh });
  assert.equal(staleProjects([project], [], NOW).length, 0);
});

test('exactly 30 days without activity — card present (scenario 3)', () => {
  const stale = daysBeforeNow(30);
  const project = makeProject({ lastMeaningfulActivityAt: stale });
  const result = staleProjects([project], [], NOW);
  assert.equal(result.length, 1);
  assert.equal(result[0].project.id, 'project-1');
  assert.equal(result[0].lastActivityDate, stale);
  assert.equal(result[0].daysSince, 30);
});

// ── Legacy-проекты без достоверной активности (scenario 5) ─────────────────

test('a legacy project with no stored value and no other reliable signal is never considered stale', () => {
  const project = makeProject({ createdDate: daysBeforeNow(400), lastMeaningfulActivityAt: null });
  assert.equal(staleProjects([project], [], NOW).length, 0);
});

// ── Активность (scenario 8, 9) ──────────────────────────────────────────────

test('staleProjects is rescued by a done session linked through a client', () => {
  const stale = daysBeforeNow(STALE_PROJECT_THRESHOLD_DAYS + 10);
  const recent = daysBeforeNow(1);
  const project = makeProject({ id: 'p1', lastMeaningfulActivityAt: stale });
  const client = makeClient({ sessions: [makeSession({ projectId: 'p1', date: recent, done: true })] });
  assert.equal(staleProjects([project], [client], NOW).length, 0);
});

test('staleProjects is rescued by a consultation history entry linked through a client', () => {
  const stale = daysBeforeNow(STALE_PROJECT_THRESHOLD_DAYS + 10);
  const recent = daysBeforeNow(1);
  const project = makeProject({ id: 'p1', lastMeaningfulActivityAt: stale });
  const client = makeClient({
    consultations: [makeConsultation({ id: 'c1', projectId: 'p1', history: [{ id: 'h1', date: `${recent}T00:00:00.000Z`, note: 'встреча' }] })],
  });
  assert.equal(staleProjects([project], [client], NOW).length, 0);
});

test('staleProjects counts a done session sitting directly on a client-less (workshop) project', () => {
  const stale = daysBeforeNow(STALE_PROJECT_THRESHOLD_DAYS + 10);
  const recent = daysBeforeNow(1);
  const project = makeProject({
    id: 'p1',
    clientId: null,
    lastMeaningfulActivityAt: stale,
    sessions: [makeSession({ projectId: 'p1', date: recent, done: true })],
  });
  assert.equal(staleProjects([project], [], NOW).length, 0);
});

test('staleProjects is rescued by a consultation history entry sitting directly on a client-less (workshop) project', () => {
  const stale = daysBeforeNow(STALE_PROJECT_THRESHOLD_DAYS + 10);
  const recent = daysBeforeNow(1);
  const project = makeProject({
    id: 'p1',
    clientId: null,
    lastMeaningfulActivityAt: stale,
    consultations: [makeConsultation({ id: 'c1', projectId: 'p1', history: [{ id: 'h1', date: `${recent}T00:00:00.000Z`, note: 'встреча' }] })],
  });
  assert.equal(staleProjects([project], [], NOW).length, 0);
});

test('a future scheduled consultation on a client-less (workshop) project suppresses the stale reminder', () => {
  const stale = daysBeforeNow(STALE_PROJECT_THRESHOLD_DAYS + 10);
  const project = makeProject({
    id: 'p1',
    clientId: null,
    lastMeaningfulActivityAt: stale,
    consultations: [makeConsultation({ id: 'c1', projectId: 'p1', date: daysAfterNow(3) })],
  });
  assert.equal(staleProjects([project], [], NOW).length, 0);
});

// ── Ошибочная будущая дата не спасает застывший проект (ревью-фикс) ────────
// done-сессия или запись истории консультации с датой в будущем — не
// «расписание» (isOpenSession/isOpenConsultation её уже исключают из
// hasScheduledWork, done===true), но БЕЗ клэмпа к <=today такая запись
// могла бы всё равно засчитаться в getProjectLastActivityDate как «реальная
// активность» и надолго спрятать реальный застой.

test('a done session with an erroneous future date does NOT rescue a stalled project', () => {
  const stale = daysBeforeNow(STALE_PROJECT_THRESHOLD_DAYS + 10);
  const project = makeProject({ id: 'p1', lastMeaningfulActivityAt: stale });
  const client = makeClient({ sessions: [makeSession({ projectId: 'p1', date: daysAfterNow(60), done: true, cancelled: false })] });
  const result = staleProjects([project], [client], NOW);
  assert.equal(result.length, 1);
  assert.equal(result[0].lastActivityDate, stale);
});

test('a consultation history entry with an erroneous future timestamp does NOT rescue a stalled project', () => {
  const stale = daysBeforeNow(STALE_PROJECT_THRESHOLD_DAYS + 10);
  const project = makeProject({ id: 'p1', lastMeaningfulActivityAt: stale });
  // done/completed so it's neither "open" (no accidental overdue-suppression
  // via its own past date) nor "scheduled" — isolates exactly the thing
  // under test: does the future HISTORY entry alone get excluded.
  const client = makeClient({
    consultations: [
      makeConsultation({
        id: 'c1',
        projectId: 'p1',
        done: true,
        status: 'completed',
        history: [{ id: 'h1', date: `${daysAfterNow(60)}T00:00:00.000Z`, note: 'ошибочная будущая запись' }],
      }),
    ],
  });
  const result = staleProjects([project], [client], NOW);
  assert.equal(result.length, 1);
  assert.equal(result[0].lastActivityDate, stale);
});

test('a calendar-impossible done session date (e.g. 30 february) does NOT rescue a stalled project', () => {
  const stale = daysBeforeNow(STALE_PROJECT_THRESHOLD_DAYS + 10);
  const project = makeProject({ id: 'p1', lastMeaningfulActivityAt: stale });
  const client = makeClient({ sessions: [makeSession({ projectId: 'p1', date: '2026-02-30', done: true, cancelled: false })] });
  const result = staleProjects([project], [client], NOW);
  assert.equal(result.length, 1);
  assert.equal(result[0].lastActivityDate, stale);
});

// Точный сценарий из ревью: последняя реальная активность 40 дней назад +
// done-сессия/запись истории через 10 дней в будущем = проект всё равно
// застывший (не только с "далёким" будущим смещением в 60 дней выше).

test('exact scenario: last real activity 40 days ago + a done session 10 days in the future = still stale', () => {
  const activity40DaysAgo = daysBeforeNow(40);
  const project = makeProject({ id: 'p1', lastMeaningfulActivityAt: activity40DaysAgo });
  const client = makeClient({ sessions: [makeSession({ projectId: 'p1', date: daysAfterNow(10), done: true, cancelled: false })] });
  const result = staleProjects([project], [client], NOW);
  assert.equal(result.length, 1);
  assert.equal(result[0].project.id, 'p1');
  assert.equal(result[0].lastActivityDate, activity40DaysAgo);
});

test('exact scenario: last real activity 40 days ago + a consultation history entry 10 days in the future = still stale', () => {
  const activity40DaysAgo = daysBeforeNow(40);
  const project = makeProject({ id: 'p1', lastMeaningfulActivityAt: activity40DaysAgo });
  const client = makeClient({
    consultations: [
      makeConsultation({
        id: 'c1',
        projectId: 'p1',
        done: true,
        status: 'completed',
        history: [{ id: 'h1', date: `${daysAfterNow(10)}T00:00:00.000Z`, note: 'ошибочная будущая запись' }],
      }),
    ],
  });
  const result = staleProjects([project], [client], NOW);
  assert.equal(result.length, 1);
  assert.equal(result[0].project.id, 'p1');
  assert.equal(result[0].lastActivityDate, activity40DaysAgo);
});

// ── Запланированная работа подавляет застой (scenario 10, 11, 12) ──────────

test('a future scheduled session suppresses the stale reminder (scenario 10)', () => {
  const stale = daysBeforeNow(STALE_PROJECT_THRESHOLD_DAYS + 10);
  const project = makeProject({ id: 'p1', lastMeaningfulActivityAt: stale });
  const client = makeClient({ sessions: [makeSession({ projectId: 'p1', date: daysAfterNow(5), done: false, cancelled: false })] });
  assert.equal(staleProjects([project], [client], NOW).length, 0);
});

test('a future scheduled consultation suppresses the stale reminder (scenario 11)', () => {
  const stale = daysBeforeNow(STALE_PROJECT_THRESHOLD_DAYS + 10);
  const project = makeProject({ id: 'p1', lastMeaningfulActivityAt: stale });
  const client = makeClient({ consultations: [makeConsultation({ id: 'c1', projectId: 'p1', date: daysAfterNow(5), status: 'active' })] });
  assert.equal(staleProjects([project], [client], NOW).length, 0);
});

test('a future dated next step suppresses the stale reminder (scenario 12)', () => {
  const stale = daysBeforeNow(STALE_PROJECT_THRESHOLD_DAYS + 10);
  const project = makeProject({
    id: 'p1',
    lastMeaningfulActivityAt: stale,
    nextActionText: 'Собрать референсы',
    nextActionDate: daysAfterNow(5),
  });
  assert.equal(staleProjects([project], [], NOW).length, 0);
});

// ── Жёсткий сигнал подавляет мягкий (scenario 13, 14, 15) ───────────────────

test('an overdue next step suppresses the stale reminder — a more specific card already exists (scenario 13)', () => {
  const stale = daysBeforeNow(STALE_PROJECT_THRESHOLD_DAYS + 10);
  const project = makeProject({
    id: 'p1',
    lastMeaningfulActivityAt: stale,
    nextActionText: 'Позвонить клиенту',
    nextActionDate: daysBeforeNow(5),
  });
  assert.equal(staleProjects([project], [], NOW).length, 0);
});

test('an overdue unresolved session suppresses the stale reminder (scenario 14)', () => {
  const stale = daysBeforeNow(STALE_PROJECT_THRESHOLD_DAYS + 10);
  const project = makeProject({ id: 'p1', lastMeaningfulActivityAt: stale });
  const client = makeClient({ sessions: [makeSession({ projectId: 'p1', date: daysBeforeNow(5), done: false, cancelled: false })] });
  assert.equal(staleProjects([project], [client], NOW).length, 0);
});

test('an overdue unresolved consultation suppresses the stale reminder (scenario 15)', () => {
  const stale = daysBeforeNow(STALE_PROJECT_THRESHOLD_DAYS + 10);
  const project = makeProject({ id: 'p1', lastMeaningfulActivityAt: stale });
  const client = makeClient({ consultations: [makeConsultation({ id: 'c1', projectId: 'p1', date: daysBeforeNow(5), status: 'active' })] });
  assert.equal(staleProjects([project], [client], NOW).length, 0);
});

// ── Отменённые/лишние записи не подавляют застой как расписание (scenario 16) ──

test('a cancelled future session does NOT suppress staleness — it is not real scheduled work (scenario 16)', () => {
  const stale = daysBeforeNow(STALE_PROJECT_THRESHOLD_DAYS + 10);
  const project = makeProject({ id: 'p1', lastMeaningfulActivityAt: stale });
  const client = makeClient({ sessions: [makeSession({ projectId: 'p1', date: daysAfterNow(5), done: false, cancelled: true })] });
  assert.equal(staleProjects([project], [client], NOW).length, 1);
});

test('a cancelled future consultation does NOT suppress staleness (scenario 16)', () => {
  const stale = daysBeforeNow(STALE_PROJECT_THRESHOLD_DAYS + 10);
  const project = makeProject({ id: 'p1', lastMeaningfulActivityAt: stale });
  const client = makeClient({ consultations: [makeConsultation({ id: 'c1', projectId: 'p1', date: daysAfterNow(5), status: 'cancelled', cancelled: true })] });
  assert.equal(staleProjects([project], [client], NOW).length, 1);
});

// ── Изоляция по проекту (scenario 18, 19) ───────────────────────────────────

test('a session belonging to a different project neither rescues nor suppresses (scenario 18)', () => {
  const stale = daysBeforeNow(STALE_PROJECT_THRESHOLD_DAYS + 10);
  const project = makeProject({ id: 'p1', lastMeaningfulActivityAt: stale });
  const client = makeClient({
    sessions: [
      makeSession({ projectId: 'other-project', date: daysBeforeNow(1), done: true }),
      makeSession({ projectId: 'other-project', date: daysAfterNow(5), done: false, cancelled: false }),
    ],
  });
  const result = staleProjects([project], [client], NOW);
  assert.equal(result.length, 1);
  assert.equal(result[0].project.id, 'p1');
});

test('a consultation belonging to a different project neither rescues nor suppresses (scenario 19)', () => {
  const stale = daysBeforeNow(STALE_PROJECT_THRESHOLD_DAYS + 10);
  const project = makeProject({ id: 'p1', lastMeaningfulActivityAt: stale });
  const client = makeClient({
    consultations: [
      makeConsultation({ id: 'c1', projectId: 'other-project', date: daysAfterNow(5), status: 'active' }),
    ],
  });
  const result = staleProjects([project], [client], NOW);
  assert.equal(result.length, 1);
  assert.equal(result[0].project.id, 'p1');
});

// ── Статус проекта (scenario 20) ────────────────────────────────────────────

test('staleProjects ignores a paused/cancelled/archived project — deliberately not moving, not stalled', () => {
  const stale = daysBeforeNow(STALE_PROJECT_THRESHOLD_DAYS + 10);
  for (const state of ['paused', 'cancelled', 'archived']) {
    const project = makeProject({ lastMeaningfulActivityAt: stale, state });
    assert.equal(staleProjects([project], [], NOW).length, 0, `state=${state}`);
  }
});

test('staleProjects ignores a completed-status project — nothing left to move', () => {
  const stale = daysBeforeNow(STALE_PROJECT_THRESHOLD_DAYS + 10);
  const project = makeProject({ lastMeaningfulActivityAt: stale, status: 'completed' });
  assert.equal(staleProjects([project], [], NOW).length, 0);
});

// ── Сортировка ───────────────────────────────────────────────────────────

test('staleProjects sorts the most stalled project first', () => {
  const veryStale = daysBeforeNow(STALE_PROJECT_THRESHOLD_DAYS + 30);
  const barelyStale = daysBeforeNow(STALE_PROJECT_THRESHOLD_DAYS);
  const older = makeProject({ id: 'p-older', lastMeaningfulActivityAt: veryStale });
  const newer = makeProject({ id: 'p-newer', lastMeaningfulActivityAt: barelyStale });
  const result = staleProjects([newer, older], [], NOW);
  assert.deepEqual(result.map((it) => it.project.id), ['p-older', 'p-newer']);
});
