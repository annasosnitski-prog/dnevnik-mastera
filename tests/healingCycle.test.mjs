import assert from 'node:assert/strict';
import test from 'node:test';

import { healingCycleReminders, HEALING_CYCLE_WINDOWS } from '../.test-dist/src/reminders/healingCycle.js';
import { healingCycleReminderKey, healingCycleReminderKeysForIteration } from '../.test-dist/src/reminders/reminderKeys.js';

// Цикл заживления считается от ПРОЕКТА и его последней выполненной сессии
// (см. reminders/healingCycle.ts), а не от каждой сессии по отдельности, как
// в deprecated healingReminders (тот путь тестируется отдельно в
// tests/healingReminders.test.mjs и из UI больше не вызывается).

// Полдень, чтобы сдвиг часового пояса не превращал «день N» в «день N±1».
const NOW = new Date('2026-06-01T12:00:00');

// yyyy-mm-dd за `days` суток до NOW — так тесты пишутся в терминах «сколько
// дней прошло с сессии», а не в жёстких датах.
function daysBeforeNow(days) {
  const d = new Date(NOW);
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function makeSession(overrides = {}) {
  return {
    id: 'session-1',
    name: '',
    date: daysBeforeNow(3),
    time: '',
    duration: '',
    style: '',
    area: '',
    colors: '',
    needles: '',
    skinReaction: '',
    note: '',
    photos: [],
    done: true,
    healed: false,
    isLastSession: false,
    cancelled: false,
    projectId: 'project-1',
    sourceConsultationId: null,
    previousSessionId: null,
    nextSessionId: null,
    ...overrides,
  };
}

function makeProject(overrides = {}) {
  return {
    id: 'project-1',
    title: 'Дракон',
    color: '#B0413E',
    category: 'tattoo',
    clientId: null,
    status: 'active',
    sessionsPlan: 'multiple',
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
    healingPhotos: [],
    createdDate: '2026-01-01T00:00:00.000Z',
    sessions: [],
    consultations: [],
    lastMeaningfulActivityAt: '2026-01-01',
    ...overrides,
  };
}

function makeClient(overrides = {}) {
  return {
    id: 'client-1',
    name: 'Аня',
    surname: '',
    styles: [],
    style: '',
    color: '#B0413E',
    clientType: 'client',
    language: 'ru',
    note: '',
    masterNote: '',
    phone: '',
    skinType: '',
    skinTone: '',
    skinNotes: '',
    allergies: '',
    skinReactions: '',
    chatLinks: [],
    sessions: [],
    consultations: [],
    documents: [],
    notes: [],
    createdDate: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// Одна карточка на проект (или ни одной) — цикл никогда не показывает две
// стадии разом, окна не пересекаются.
function stageAfter(days, projectOverrides = {}, sessionOverrides = {}) {
  const project = makeProject({
    sessions: [makeSession({ date: daysBeforeNow(days), ...sessionOverrides })],
    ...projectOverrides,
  });
  const result = healingCycleReminders([], [project], NOW);
  assert.ok(result.length <= 1, 'у проекта не может быть двух открытых стадий сразу');
  return result[0]?.stage ?? null;
}

// ── Не последняя сессия: только лёгкий чек ────────────────────────────────

test('не последняя сессия → чек первой недели, без развилки 21-го дня', () => {
  assert.equal(stageAfter(3), 'week1_check');
  assert.equal(stageAfter(21), null, 'развилка «фото или коррекция» тут не появляется');
  assert.equal(stageAfter(60), null);
});

// «Не знаю, сколько сессий» ведёт себя как «больше одной»: подтверждения от
// мастера не было, значит закрывать проект нечем.
test('старый проект без плана сессий ведёт себя как «больше одной»', () => {
  assert.equal(stageAfter(3, { sessionsPlan: null }), 'week1_check');
  assert.equal(stageAfter(21, { sessionsPlan: null }), null);
});

// Лёгкий чек живёт РЯДОМ с назначенной следующей сессией — в этом весь смысл
// не-последней сессии: заживление проверили и пошли дальше.
test('назначенная следующая сессия не гасит чек первой недели', () => {
  const project = makeProject({
    sessions: [
      makeSession({ id: 's1', date: daysBeforeNow(3) }),
      makeSession({ id: 's2', date: '2026-07-01', done: false }),
    ],
  });
  const result = healingCycleReminders([], [project], NOW);
  assert.deepEqual(result.map((it) => [it.sessionId, it.stage]), [['s1', 'week1_check']]);
});

// ── Последняя сессия: полный цикл ─────────────────────────────────────────

test('последняя сессия, до первой недели → ничего', () => {
  assert.equal(stageAfter(0, {}, { isLastSession: true }), null);
});

test('последняя сессия, первая неделя → чек', () => {
  assert.equal(stageAfter(1, {}, { isLastSession: true }), 'week1_check');
  assert.equal(stageAfter(7, {}, { isLastSession: true }), 'week1_check');
});

// Между неделей 1 и 21-м днём цикл молчит — мастера незачем дёргать, пока
// заживление идёт своим ходом.
test('последняя сессия, между неделей 1 и днём 21 → ничего', () => {
  assert.equal(stageAfter(8, {}, { isLastSession: true }), null);
  assert.equal(stageAfter(20, {}, { isLastSession: true }), null);
});

test('последняя сессия, день 21 → развилка «фото или коррекция»', () => {
  assert.equal(stageAfter(21, {}, { isLastSession: true }), 'day21_decision');
});

// Развилка без верхней границы: она держится, пока мастер не выберет.
test('развилка держится и после 21-го дня, пока мастер не ответила', () => {
  assert.equal(stageAfter(40, {}, { isLastSession: true }), 'day21_decision');
  assert.equal(stageAfter(200, {}, { isLastSession: true }), 'day21_decision');
});

// Проект «одна встреча»: единственная сессия по определению последняя,
// подтверждение мастера не спрашивается и на сессии не хранится.
test('проект «одна встреча» проходит полный цикл без флага на сессии', () => {
  assert.equal(stageAfter(3, { sessionsPlan: 'single' }), 'week1_check');
  assert.equal(stageAfter(21, { sessionsPlan: 'single' }), 'day21_decision');
});

test('элемент цикла несёт, полный он или лёгкий', () => {
  const [light] = healingCycleReminders([], [makeProject({ sessions: [makeSession()] })], NOW);
  assert.equal(light.isLastSession, false);
  const [full] = healingCycleReminders([], [makeProject({ sessions: [makeSession({ isLastSession: true })] })], NOW);
  assert.equal(full.isLastSession, true);
});

// ── Что закрывает цикл ────────────────────────────────────────────────────

test('фото в галерее заживления закрывает цикл', () => {
  const project = makeProject({
    sessions: [makeSession({ date: daysBeforeNow(21), isLastSession: true })],
    healingPhotos: [{ id: 'p1', url: 'a', addedDate: daysBeforeNow(1), isCover: true }],
  });
  assert.deepEqual(healingCycleReminders([], [project], NOW), []);
});

// Снимок, сделанный ДО сессии-якоря, — это фото прошлой итерации (до
// коррекции), и текущий цикл он не закрывает.
test('фото старше сессии-якоря цикл не закрывает', () => {
  const project = makeProject({
    sessions: [makeSession({ date: daysBeforeNow(21), isLastSession: true })],
    healingPhotos: [{ id: 'p1', url: 'a', addedDate: daysBeforeNow(90), isCover: true }],
  });
  assert.equal(healingCycleReminders([], [project], NOW)[0]?.stage, 'day21_decision');
});

// Повреждённая запись не должна молча гасить напоминания навсегда.
test('фото без внятной даты цикл не закрывает', () => {
  const project = makeProject({
    sessions: [makeSession({ date: daysBeforeNow(21), isLastSession: true })],
    healingPhotos: [{ id: 'p1', url: 'a', addedDate: '', isCover: true }],
  });
  assert.equal(healingCycleReminders([], [project], NOW)[0]?.stage, 'day21_decision');
});

// Мастер выбрала «коррекция» и назначила дату — развилка своё отработала.
test('назначенная коррекция гасит развилку 21-го дня', () => {
  const project = makeProject({
    sessions: [
      makeSession({ id: 's1', date: daysBeforeNow(21), isLastSession: true }),
      makeSession({ id: 's2', date: '2026-06-20', done: false }),
    ],
  });
  assert.deepEqual(healingCycleReminders([], [project], NOW), []);
});

test('отменённая сессия не считается назначенной коррекцией', () => {
  const project = makeProject({
    sessions: [
      makeSession({ id: 's1', date: daysBeforeNow(21), isLastSession: true }),
      makeSession({ id: 's2', date: '2026-06-20', done: false, cancelled: true }),
    ],
  });
  assert.equal(healingCycleReminders([], [project], NOW)[0]?.stage, 'day21_decision');
});

// ── Перезапуск цикла после коррекции ──────────────────────────────────────
// Ключевое свойство: якорь — ПОСЛЕДНЯЯ выполненная сессия, поэтому
// выполненная коррекция сама становится якорем, и цикл считается от её даты.

test('выполненная коррекция перезапускает цикл от своей даты', () => {
  // Первая сессия была 60 дней назад (её собственная развилка давно прошла),
  // коррекция выполнена 3 дня назад — открыт чек первой недели по коррекции.
  const project = makeProject({
    sessions: [
      makeSession({ id: 's1', date: daysBeforeNow(60), isLastSession: true }),
      makeSession({ id: 'fix1', date: daysBeforeNow(3), isLastSession: true }),
    ],
  });
  const result = healingCycleReminders([], [project], NOW);
  assert.deepEqual(result.map((it) => [it.sessionId, it.stage]), [['fix1', 'week1_check']]);
});

test('после коррекции цикл снова доходит до развилки 21-го дня', () => {
  const project = makeProject({
    sessions: [
      makeSession({ id: 's1', date: daysBeforeNow(60), isLastSession: true }),
      makeSession({ id: 'fix1', date: daysBeforeNow(21), isLastSession: true }),
    ],
  });
  const result = healingCycleReminders([], [project], NOW);
  assert.deepEqual(result.map((it) => [it.sessionId, it.stage]), [['fix1', 'day21_decision']]);
});

test('несколько коррекций подряд: якорем всегда становится самая свежая', () => {
  const project = makeProject({
    sessions: [
      makeSession({ id: 's1', date: daysBeforeNow(120), isLastSession: true }),
      makeSession({ id: 'fix1', date: daysBeforeNow(70), isLastSession: true }),
      makeSession({ id: 'fix2', date: daysBeforeNow(30), isLastSession: true }),
      makeSession({ id: 'fix3', date: daysBeforeNow(2), isLastSession: true }),
    ],
  });
  const result = healingCycleReminders([], [project], NOW);
  assert.deepEqual(result.map((it) => [it.sessionId, it.stage]), [['fix3', 'week1_check']]);
});

// Порядок сессий в массиве не обязан совпадать с хронологией.
test('якорь ищется по дате, а не по позиции в списке сессий', () => {
  const project = makeProject({
    sessions: [
      makeSession({ id: 'fix1', date: daysBeforeNow(3), isLastSession: true }),
      makeSession({ id: 's1', date: daysBeforeNow(60), isLastSession: true }),
    ],
  });
  assert.equal(healingCycleReminders([], [project], NOW)[0]?.sessionId, 'fix1');
});

// ── Какие сессии вообще могут быть якорем ─────────────────────────────────

test('проект без выполненных сессий не даёт напоминаний', () => {
  const project = makeProject({ sessions: [makeSession({ done: false })] });
  assert.deepEqual(healingCycleReminders([], [project], NOW), []);
});

test('отменённая сессия не может быть якорем', () => {
  const project = makeProject({
    sessions: [
      makeSession({ id: 's1', date: daysBeforeNow(3), cancelled: true }),
      makeSession({ id: 's0', date: daysBeforeNow(5) }),
    ],
  });
  assert.equal(healingCycleReminders([], [project], NOW)[0]?.sessionId, 's0');
});

test('сессия с легаси-датой свободным текстом не может быть якорем', () => {
  const project = makeProject({
    sessions: [
      makeSession({ id: 'broken', date: 'прошлым летом' }),
      makeSession({ id: 's0', date: daysBeforeNow(5) }),
    ],
  });
  assert.equal(healingCycleReminders([], [project], NOW)[0]?.sessionId, 's0');
});

test('проект вообще без сессий не даёт напоминаний', () => {
  assert.deepEqual(healingCycleReminders([], [makeProject()], NOW), []);
});

// ── Владелец карточки ─────────────────────────────────────────────────────

test('к карточке прикладывается клиент проекта — для сообщения и контактов', () => {
  const client = makeClient({ id: 'client-1' });
  const project = makeProject({ clientId: 'client-1', sessions: [makeSession()] });
  assert.equal(healingCycleReminders([client], [project], NOW)[0].client, client);
});

test('у проекта без клиента карточка приходит без него, а не пропадает', () => {
  const project = makeProject({ clientId: null, sessions: [makeSession()] });
  const [item] = healingCycleReminders([makeClient()], [project], NOW);
  assert.equal(item.client, null);
  assert.equal(item.stage, 'week1_check');
});

// Клиент мог быть удалён, а проект остаться — напоминание не должно пропасть
// вместе с ним.
test('несуществующий клиент не роняет карточку', () => {
  const project = makeProject({ clientId: 'нет-такого', sessions: [makeSession()] });
  const [item] = healingCycleReminders([makeClient()], [project], NOW);
  assert.equal(item.client, null);
});

// ── Порядок и чистота ─────────────────────────────────────────────────────

test('карточки отсортированы от самой давней сессии-якоря', () => {
  const projects = [
    makeProject({ id: 'p-fresh', sessions: [makeSession({ id: 'a', date: daysBeforeNow(1) })] }),
    makeProject({ id: 'p-old', sessions: [makeSession({ id: 'b', date: daysBeforeNow(6) })] }),
    makeProject({ id: 'p-mid', sessions: [makeSession({ id: 'c', date: daysBeforeNow(4) })] }),
  ];
  assert.deepEqual(
    healingCycleReminders([], projects, NOW).map((it) => it.project.id),
    ['p-old', 'p-mid', 'p-fresh'],
  );
});

test('healingCycleReminders не мутирует входные массивы', () => {
  const projects = [makeProject({ sessions: [makeSession()] })];
  const snapshot = structuredClone(projects);
  healingCycleReminders([], projects, NOW);
  assert.deepEqual(projects, snapshot);
});

test('один и тот же вход и тот же now всегда дают один результат', () => {
  const projects = [makeProject({ sessions: [makeSession()] })];
  assert.deepEqual(healingCycleReminders([], projects, NOW), healingCycleReminders([], projects, NOW));
});

// ── Ключи карточек ────────────────────────────────────────────────────────

test('ключ различает стадии одной итерации', () => {
  const base = { project: makeProject(), sessionId: 's1', date: '2026-05-01', client: null, isLastSession: true };
  assert.notEqual(
    healingCycleReminderKey({ ...base, stage: 'week1_check' }),
    healingCycleReminderKey({ ...base, stage: 'day21_decision' }),
  );
});

// Скрытая карточка не должна прятать следующую итерацию: после коррекции у
// цикла другая сессия-якорь и другая дата, а значит и другие ключи.
test('ключ различает итерации цикла — коррекция получает свои ключи', () => {
  const project = makeProject();
  const first = { project, sessionId: 's1', date: '2026-05-01', stage: 'day21_decision', client: null, isLastSession: true };
  const afterFix = { ...first, sessionId: 'fix1', date: '2026-05-22' };
  assert.notEqual(healingCycleReminderKey(first), healingCycleReminderKey(afterFix));
});

test('ключ различает проекты', () => {
  const base = { sessionId: 's1', date: '2026-05-01', stage: 'week1_check', client: null, isLastSession: false };
  assert.notEqual(
    healingCycleReminderKey({ ...base, project: makeProject({ id: 'p1' }) }),
    healingCycleReminderKey({ ...base, project: makeProject({ id: 'p2' }) }),
  );
});

test('healingCycleReminderKeysForIteration отдаёт по ключу на каждое окно цикла', () => {
  const it = { project: makeProject(), sessionId: 's1', date: '2026-05-01', stage: 'week1_check', client: null, isLastSession: true };
  const keys = healingCycleReminderKeysForIteration(it);
  assert.equal(keys.length, HEALING_CYCLE_WINDOWS.length);
  assert.equal(new Set(keys).size, keys.length, 'ключи не повторяются');
  assert.ok(keys.includes(healingCycleReminderKey(it)), 'текущая стадия входит в набор');
});

test('healingCycleReminderKeysForIteration не задевает следующую итерацию', () => {
  const project = makeProject();
  const first = { project, sessionId: 's1', date: '2026-05-01', stage: 'day21_decision', client: null, isLastSession: true };
  const afterFix = { ...first, sessionId: 'fix1', date: '2026-05-22' };
  const hidden = new Set(healingCycleReminderKeysForIteration(first));
  assert.ok(!hidden.has(healingCycleReminderKey(afterFix)));
});
