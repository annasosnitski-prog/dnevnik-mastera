import assert from 'node:assert/strict';
import test from 'node:test';

import { isReminderBlackoutDay } from '../.test-dist/src/utils/dates.js';
import {
  overdueEntries,
  upcomingSoonReminders,
  overdueProjectSessions,
  upcomingSoonProjectSessions,
  overdueProjectConsultations,
  upcomingSoonProjectConsultations,
  overdueProjects,
  staleProjects,
  STALE_PROJECT_THRESHOLD_DAYS,
} from '../.test-dist/src/reminders/buildReminders.js';

// Общее правило для всех напоминаний приложения: мастер не хочет писать
// клиентам по субботам. Раньше применялось только в healingCycleReminders
// (см. tests/healingCycle.test.mjs); теперь (аудит 2026-10) — во всех живых
// билдерах reminders/buildReminders.ts тоже (см. комментарий в начале того
// файла). Этот файл проверяет саму функцию и затем, по одному тесту на
// билдер, что блэкаут реально подключён везде, а не только в healingCycle.

test('isReminderBlackoutDay is true only on Saturday', () => {
  // 2026-06-01 — понедельник; вся неделя по порядку.
  const week = ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05', '2026-06-06', '2026-06-07'];
  const results = week.map((d) => isReminderBlackoutDay(new Date(`${d}T12:00:00`)));
  assert.deepEqual(results, [false, false, false, false, false, true, false]);
});

// ── Субботний блэкаут во всех билдерах buildReminders.ts ────────────────────

const SATURDAY = new Date('2026-06-06T12:00:00');
const FRIDAY = new Date('2026-06-05T12:00:00'); // соседний не-блэкаут день — тот же фикстур, для контраста

// "сейчас + hours" как date/time, как их ждут upcomingSoon*-функции (окно 36–48ч).
function plusHours(now, hours) {
  const at = new Date(now.getTime() + hours * 3600000);
  const date = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
  const time = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
  return { date, time };
}

function makeClient(overrides = {}) {
  return { id: 'client-1', sessions: [], consultations: [], ...overrides };
}

function makeSession(overrides = {}) {
  return { id: 'session-1', date: '2026-01-01', time: '', done: false, cancelled: false, projectId: null, ...overrides };
}

function makeConsultation(overrides = {}) {
  return {
    id: 'consult-1',
    date: '2026-01-01',
    time: '',
    done: false,
    cancelled: false,
    status: 'active',
    history: [],
    projectId: null,
    ...overrides,
  };
}

function makeProject(overrides = {}) {
  return {
    id: 'project-1',
    title: 'Дракон',
    clientId: null,
    status: 'active',
    sessionsPlan: 'multiple',
    nextActionText: '',
    nextActionDate: null,
    nextActionType: null,
    healingPhotos: [],
    createdDate: '2026-01-01',
    sessions: [],
    consultations: [],
    lastMeaningfulActivityAt: '2026-01-01',
    ...overrides,
  };
}

test('overdueEntries: suppressed on Saturday, present the day before', () => {
  const client = makeClient({ sessions: [makeSession({ date: '2026-01-01', done: false })] });
  assert.equal(overdueEntries([client], FRIDAY).length, 1);
  assert.equal(overdueEntries([client], SATURDAY).length, 0);
});

test('upcomingSoonReminders: suppressed on Saturday, present the day before', () => {
  const friday40h = plusHours(FRIDAY, 40);
  const saturday40h = plusHours(SATURDAY, 40);
  const clientFriday = makeClient({ sessions: [makeSession(friday40h)] });
  const clientSaturday = makeClient({ sessions: [makeSession(saturday40h)] });
  assert.equal(upcomingSoonReminders([clientFriday], FRIDAY).length, 1);
  assert.equal(upcomingSoonReminders([clientSaturday], SATURDAY).length, 0);
});

test('overdueProjectSessions: suppressed on Saturday, present the day before', () => {
  const project = makeProject({ sessions: [makeSession({ date: '2026-01-01', done: false })] });
  assert.equal(overdueProjectSessions([project], FRIDAY).length, 1);
  assert.equal(overdueProjectSessions([project], SATURDAY).length, 0);
});

test('upcomingSoonProjectSessions: suppressed on Saturday, present the day before', () => {
  const friday40h = plusHours(FRIDAY, 40);
  const saturday40h = plusHours(SATURDAY, 40);
  const projectFriday = makeProject({ sessions: [makeSession(friday40h)] });
  const projectSaturday = makeProject({ sessions: [makeSession(saturday40h)] });
  assert.equal(upcomingSoonProjectSessions([projectFriday], FRIDAY).length, 1);
  assert.equal(upcomingSoonProjectSessions([projectSaturday], SATURDAY).length, 0);
});

test('overdueProjectConsultations: suppressed on Saturday, present the day before', () => {
  const project = makeProject({ consultations: [makeConsultation({ date: '2026-01-01', done: false })] });
  assert.equal(overdueProjectConsultations([project], FRIDAY).length, 1);
  assert.equal(overdueProjectConsultations([project], SATURDAY).length, 0);
});

test('upcomingSoonProjectConsultations: suppressed on Saturday, present the day before', () => {
  const friday40h = plusHours(FRIDAY, 40);
  const saturday40h = plusHours(SATURDAY, 40);
  const projectFriday = makeProject({ consultations: [makeConsultation(friday40h)] });
  const projectSaturday = makeProject({ consultations: [makeConsultation(saturday40h)] });
  assert.equal(upcomingSoonProjectConsultations([projectFriday], FRIDAY).length, 1);
  assert.equal(upcomingSoonProjectConsultations([projectSaturday], SATURDAY).length, 0);
});

test('overdueProjects: suppressed on Saturday, present the day before', () => {
  const project = makeProject({ nextActionText: 'Отправить мудборд', nextActionDate: '2026-01-01' });
  assert.equal(overdueProjects([project], FRIDAY).length, 1);
  assert.equal(overdueProjects([project], SATURDAY).length, 0);
});

test('staleProjects: suppressed on Saturday, present the day before', () => {
  const stale = new Date(SATURDAY.getTime() - (STALE_PROJECT_THRESHOLD_DAYS + 10) * 86400000);
  const staleISO = `${stale.getFullYear()}-${String(stale.getMonth() + 1).padStart(2, '0')}-${String(stale.getDate()).padStart(2, '0')}`;
  const project = makeProject({ lastMeaningfulActivityAt: staleISO });
  assert.equal(staleProjects([project], [], FRIDAY).length, 1);
  assert.equal(staleProjects([project], [], SATURDAY).length, 0);
});
