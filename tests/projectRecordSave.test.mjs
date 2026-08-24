import assert from 'node:assert/strict';
import test from 'node:test';

import {
  upsertSessionInProjects,
  upsertConsultationInProjects,
  updateSessionInProjects,
  updateConsultationInProjects,
  moveSessionToProject,
  moveConsultationToProject,
  applyConsultationConversionInProjects,
  deleteSessionFromProjects,
  deleteConsultationFromProjects,
} from '../.test-dist/src/lib/projectRecordSave.js';

function makeProject(overrides = {}) {
  return {
    id: 'project-1',
    title: 'Дракон',
    color: '#B0413E',
    category: 'tattoo',
    clientId: 'c1',
    status: 'waiting_deposit',
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
    lastMeaningfulActivityAt: '2026-01-01',
    sessions: [],
    consultations: [],
    ...overrides,
  };
}

function makeSession(overrides = {}) {
  return {
    id: 'session-1',
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
    healed: false, // @deprecated, см. Session.healed — остаётся на хранимой записи
    isLastSession: false,
    cancelled: false,
    projectId: 'project-1',
    sourceConsultationId: null,
    previousSessionId: null,
    nextSessionId: null,
    ...overrides,
  };
}

function makeConsultation(overrides = {}) {
  return {
    id: 'consultation-1',
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
    createdDate: '2026-01-01',
    done: false,
    cancelled: false,
    status: 'active',
    convertedToSessionId: null,
    previousConsultationId: null,
    nextConsultationId: null,
    history: [],
    projectId: 'project-1',
    ...overrides,
  };
}

function sessionForm(overrides = {}) {
  return {
    name: 'Первый сеанс',
    date: '2026-03-01',
    time: '12:00',
    duration: '',
    style: '',
    area: 'плечо',
    colors: '',
    needles: '',
    skinReaction: '',
    note: '',
    photos: [],
    done: false,
    isLastSession: false,
    projectId: null,
    ...overrides,
  };
}

function consultationForm(overrides = {}) {
  return {
    date: '2026-03-01',
    time: '12:00',
    area: 'спина',
    style: '',
    generalNotes: '',
    feeling: '',
    creative: '',
    inspirationSources: '',
    outcome: '',
    urgency: 'normal',
    photos: [],
    projectId: null,
    ...overrides,
  };
}

const sessionIn = (projects, id) => projects.flatMap((p) => p.sessions).find((s) => s.id === id) ?? null;
const consultationIn = (projects, id) => projects.flatMap((p) => p.consultations).find((c) => c.id === id) ?? null;
const projectOf = (projects, id) => projects.find((p) => p.id === id);

// ── Создание записи ───────────────────────────────────────────────────────

test('новая сессия ложится в выбранный проект, и её projectId равен этому проекту', () => {
  const a = makeProject({ id: 'p-a' });
  const b = makeProject({ id: 'p-b' });

  const { projects, sessionId } = upsertSessionInProjects([a, b], 'p-b', sessionForm(), null);

  assert.equal(projectOf(projects, 'p-a').sessions.length, 0);
  assert.equal(projectOf(projects, 'p-b').sessions.length, 1);
  assert.equal(sessionIn(projects, sessionId).projectId, 'p-b', 'projectId записи = её настоящий проект');
  assert.equal(sessionIn(projects, sessionId).name, 'Первый сеанс');
});

test('нетронутые проекты сохраняют identity — saveProjects пишет только изменённые', () => {
  const a = makeProject({ id: 'p-a' });
  const b = makeProject({ id: 'p-b' });

  const { projects } = upsertSessionInProjects([a, b], 'p-b', sessionForm(), null);

  assert.strictEqual(projectOf(projects, 'p-a'), a, 'чужой проект — та же ссылка');
  assert.notStrictEqual(projectOf(projects, 'p-b'), b, 'изменённый проект — новая ссылка');
});

test('вход не мутируется', () => {
  const a = makeProject({ id: 'p-a' });
  const input = [a];
  const snapshot = structuredClone(input);

  upsertSessionInProjects(input, 'p-a', sessionForm(), null);

  assert.deepEqual(input, snapshot);
});

test('несуществующий проект-цель не «съедает» запись — список возвращается как был', () => {
  const a = makeProject({ id: 'p-a' });
  const { projects } = upsertSessionInProjects([a], 'p-missing', sessionForm(), null);
  assert.strictEqual(projects[0], a);
  assert.equal(projects.flatMap((p) => p.sessions).length, 0);
});

// ── Цепочка «Назначить следующую сессию» ──────────────────────────────────

test('цепочка через границу проекта: обратная ссылка ставится в чужом проекте', () => {
  const a = makeProject({ id: 'p-a', sessions: [makeSession({ id: 's-prev', projectId: 'p-a' })] });
  const b = makeProject({ id: 'p-b' });

  const { projects, sessionId } = upsertSessionInProjects([a, b], 'p-b', sessionForm(), null, 's-prev');

  assert.equal(sessionIn(projects, 's-prev').nextSessionId, sessionId);
  assert.equal(sessionIn(projects, sessionId).previousSessionId, 's-prev');
  assert.equal(projectOf(projects, 'p-a').sessions.length, 1, 'предыдущая осталась в своём проекте');
  assert.equal(projectOf(projects, 'p-b').sessions.length, 1);
});

test('цепочка внутри одного проекта склеивается в ОДИН объект, а не в два конкурирующих', () => {
  // Ровно то, из-за чего терялась сессия в #248: две правки одного проекта
  // подряд. Здесь обе обязаны оказаться в одном итоговом проекте.
  const a = makeProject({ id: 'p-a', sessions: [makeSession({ id: 's-prev', projectId: 'p-a' })] });

  const { projects, sessionId } = upsertSessionInProjects([a], 'p-a', sessionForm(), null, 's-prev');

  assert.equal(projects.length, 1);
  const project = projects[0];
  assert.equal(project.sessions.length, 2, 'новая сессия не затёрта обратной ссылкой');
  assert.equal(project.sessions.find((s) => s.id === 's-prev').nextSessionId, sessionId);
  assert.equal(project.sessions.find((s) => s.id === sessionId).previousSessionId, 's-prev');
});

test('консультационная цепочка ведёт себя так же и пишет обе записи истории', () => {
  const a = makeProject({ id: 'p-a', consultations: [makeConsultation({ id: 'c-prev', projectId: 'p-a' })] });

  const { projects, consultationId } = upsertConsultationInProjects([a], 'p-a', consultationForm(), null, 'c-prev');

  const prev = consultationIn(projects, 'c-prev');
  const next = consultationIn(projects, consultationId);
  assert.equal(prev.nextConsultationId, consultationId);
  assert.equal(next.previousConsultationId, 'c-prev');
  assert.match(prev.history.at(-1).note, /Назначена следующая консультация/);
  assert.match(next.history.at(-1).note, /Назначена как следующая консультация/);
});

// ── Правка ────────────────────────────────────────────────────────────────

test('правка без смены проекта меняет запись на месте', () => {
  const a = makeProject({ id: 'p-a', sessions: [makeSession({ id: 's1', name: 'старое', projectId: 'p-a' })] });

  const { projects, sessionId } = upsertSessionInProjects([a], 'p-a', sessionForm({ name: 'новое' }), 's1');

  assert.equal(sessionId, 's1');
  assert.equal(projectOf(projects, 'p-a').sessions.length, 1);
  assert.equal(sessionIn(projects, 's1').name, 'новое');
});

test('правка со сменой проекта ПЕРЕНОСИТ запись, а не оставляет копию', () => {
  const a = makeProject({ id: 'p-a', sessions: [makeSession({ id: 's1', projectId: 'p-a' })] });
  const b = makeProject({ id: 'p-b' });

  const { projects } = upsertSessionInProjects([a, b], 'p-b', sessionForm({ name: 'переехала' }), 's1');

  assert.equal(projectOf(projects, 'p-a').sessions.length, 0, 'из прежнего проекта ушла');
  assert.equal(projectOf(projects, 'p-b').sessions.length, 1);
  assert.equal(sessionIn(projects, 's1').projectId, 'p-b');
  assert.equal(sessionIn(projects, 's1').name, 'переехала');
});

test('правка сохраняет поля, которых нет в форме (цепочка, отмена, источник)', () => {
  const a = makeProject({
    id: 'p-a',
    sessions: [makeSession({ id: 's1', projectId: 'p-a', cancelled: true, previousSessionId: 's0', sourceConsultationId: 'c9' })],
  });

  const { projects } = upsertSessionInProjects([a], 'p-a', sessionForm(), 's1');

  const s = sessionIn(projects, 's1');
  assert.equal(s.cancelled, true);
  assert.equal(s.previousSessionId, 's0');
  assert.equal(s.sourceConsultationId, 'c9');
});

test('правка консультации со сменой проекта переносит её вместе с историей', () => {
  const a = makeProject({
    id: 'p-a',
    consultations: [makeConsultation({ id: 'c1', projectId: 'p-a', history: [{ id: 'h1', date: '2026-01-01', note: 'Консультация создана' }] })],
  });
  const b = makeProject({ id: 'p-b' });

  const { projects } = upsertConsultationInProjects([a, b], 'p-b', consultationForm(), 'c1');

  assert.equal(projectOf(projects, 'p-a').consultations.length, 0);
  const moved = consultationIn(projects, 'c1');
  assert.equal(moved.projectId, 'p-b');
  assert.equal(moved.history.length, 2, 'прежняя история сохранена, добавлена запись «Изменена»');
  assert.match(moved.history.at(-1).note, /Изменена/);
});

// ── Точечные правки и переезд ─────────────────────────────────────────────

test('updateSessionInProjects правит запись в том проекте, где она лежит', () => {
  const a = makeProject({ id: 'p-a' });
  const b = makeProject({ id: 'p-b', sessions: [makeSession({ id: 's1', projectId: 'p-b' })] });

  const projects = updateSessionInProjects([a, b], 's1', (s) => ({ ...s, done: true }));

  assert.equal(sessionIn(projects, 's1').done, true);
  assert.strictEqual(projectOf(projects, 'p-a'), a);
});

test('точечные правки неизвестной записи ничего не меняют', () => {
  const a = makeProject({ id: 'p-a' });
  const input = [a];
  assert.strictEqual(updateSessionInProjects(input, 'нет такой', (s) => s), input);
  assert.strictEqual(updateConsultationInProjects(input, 'нет такой', (c) => c), input);
});

test('переезд записи в другой проект обновляет и её projectId', () => {
  const a = makeProject({ id: 'p-a', sessions: [makeSession({ id: 's1', projectId: 'p-a' })] });
  const b = makeProject({ id: 'p-b' });

  const projects = moveSessionToProject([a, b], 's1', 'p-b');

  assert.equal(projectOf(projects, 'p-a').sessions.length, 0);
  assert.equal(sessionIn(projects, 's1').projectId, 'p-b');
});

test('переезд в несуществующий проект не теряет запись', () => {
  const a = makeProject({ id: 'p-a', sessions: [makeSession({ id: 's1', projectId: 'p-a' })] });
  const input = [a];
  assert.strictEqual(moveSessionToProject(input, 's1', 'p-missing'), input);
  assert.equal(sessionIn(moveSessionToProject(input, 's1', 'p-missing'), 's1').projectId, 'p-a');
});

test('переезд консультации работает так же', () => {
  const a = makeProject({ id: 'p-a', consultations: [makeConsultation({ id: 'c1', projectId: 'p-a' })] });
  const b = makeProject({ id: 'p-b' });

  const projects = moveConsultationToProject([a, b], 'c1', 'p-b');

  assert.equal(projectOf(projects, 'p-a').consultations.length, 0);
  assert.equal(consultationIn(projects, 'c1').projectId, 'p-b');
});

// ── «Перевести в сессию» и удаление ───────────────────────────────────────

test('перевод в сессию связывает обе стороны, даже если они в разных проектах', () => {
  const a = makeProject({ id: 'p-a', consultations: [makeConsultation({ id: 'c1', projectId: 'p-a' })] });
  const b = makeProject({ id: 'p-b', sessions: [makeSession({ id: 's1', projectId: 'p-b' })] });

  const projects = applyConsultationConversionInProjects([a, b], 's1', 'c1');

  assert.equal(sessionIn(projects, 's1').sourceConsultationId, 'c1');
  const c = consultationIn(projects, 'c1');
  assert.equal(c.status, 'converted');
  assert.equal(c.convertedToSessionId, 's1');
  assert.equal(c.done, true);
  assert.match(c.history.at(-1).note, /Переведена в сессию/);
});

test('удаление переведённой сессии возвращает консультацию в «completed» и снимает ссылку', () => {
  const a = makeProject({
    id: 'p-a',
    consultations: [makeConsultation({ id: 'c1', projectId: 'p-a', status: 'converted', convertedToSessionId: 's1', done: true })],
  });
  const b = makeProject({ id: 'p-b', sessions: [makeSession({ id: 's1', projectId: 'p-b', sourceConsultationId: 'c1' })] });

  const projects = deleteSessionFromProjects([a, b], 's1');

  assert.equal(projectOf(projects, 'p-b').sessions.length, 0, 'сессия удалена');
  const c = consultationIn(projects, 'c1');
  assert.equal(c.status, 'completed', 'консультация не возвращается в active — она состоялась');
  assert.equal(c.convertedToSessionId, null, 'повисшей ссылки не осталось');
  assert.equal(c.done, true);
  assert.match(c.history.at(-1).note, /Связанная сессия удалена/);
});

test('удаление обычной сессии не трогает консультации', () => {
  const a = makeProject({
    id: 'p-a',
    sessions: [makeSession({ id: 's1', projectId: 'p-a' })],
    consultations: [makeConsultation({ id: 'c1', projectId: 'p-a' })],
  });

  const projects = deleteSessionFromProjects([a], 's1');

  assert.equal(projectOf(projects, 'p-a').sessions.length, 0);
  assert.deepEqual(consultationIn(projects, 'c1'), a.consultations[0]);
});

test('удаление сессии, чья консультация указывает на другую сессию, историю не портит', () => {
  // Повисшая/чужая ссылка (данные из бэкапа) — восстановление применяется
  // только если консультация действительно указывает на эту сессию.
  const a = makeProject({
    id: 'p-a',
    sessions: [makeSession({ id: 's1', projectId: 'p-a', sourceConsultationId: 'c1' })],
    consultations: [makeConsultation({ id: 'c1', projectId: 'p-a', status: 'converted', convertedToSessionId: 's-другая' })],
  });

  const projects = deleteSessionFromProjects([a], 's1');

  const c = consultationIn(projects, 'c1');
  assert.equal(c.status, 'converted');
  assert.equal(c.convertedToSessionId, 's-другая');
  assert.equal(c.history.length, 0);
});

test('удаление консультации убирает её из своего проекта и только из него', () => {
  const a = makeProject({ id: 'p-a', consultations: [makeConsultation({ id: 'c1', projectId: 'p-a' })] });
  const b = makeProject({ id: 'p-b', consultations: [makeConsultation({ id: 'c2', projectId: 'p-b' })] });

  const projects = deleteConsultationFromProjects([a, b], 'c1');

  assert.equal(projectOf(projects, 'p-a').consultations.length, 0);
  assert.strictEqual(projectOf(projects, 'p-b'), b);
});

test('удаление неизвестной записи возвращает тот же список', () => {
  const a = makeProject({ id: 'p-a' });
  const input = [a];
  assert.strictEqual(deleteSessionFromProjects(input, 'нет'), input);
  assert.strictEqual(deleteConsultationFromProjects(input, 'нет'), input);
});

// ── Что цепочка НЕ должна задевать ────────────────────────────────────────
// Раньше это проверялось на client-форме (tests/sessionSave.test.mjs); после
// переезда записей на проекты те же гарантии проверяются здесь.

test('цепочка не трогает собственные поля предыдущей записи и посторонние сессии', () => {
  const a = makeProject({
    id: 'p-a',
    sessions: [
      makeSession({ id: 's-prev', projectId: 'p-a', date: '2026-01-10', note: 'заметка предыдущей', done: true }),
      makeSession({ id: 's-other', projectId: 'p-a', date: '2026-02-01', note: 'посторонняя' }),
    ],
  });

  const { projects, sessionId } = upsertSessionInProjects([a], 'p-a', sessionForm({ note: 'заметка новой' }), null, 's-prev');

  const prev = sessionIn(projects, 's-prev');
  assert.equal(prev.date, '2026-01-10', 'дата предыдущей не тронута');
  assert.equal(prev.note, 'заметка предыдущей', 'заметка предыдущей не тронута');
  assert.equal(prev.done, true);
  assert.equal(sessionIn(projects, sessionId).note, 'заметка новой', 'новая получает свою заметку, а не копию');
  assert.deepEqual(sessionIn(projects, 's-other'), a.sessions[1], 'посторонняя запись не изменилась');
});

test('правка записи не переписывает чужую цепочку', () => {
  const a = makeProject({
    id: 'p-a',
    sessions: [makeSession({ id: 's1', projectId: 'p-a', previousSessionId: 's0', nextSessionId: 's2' })],
  });

  const { projects } = upsertSessionInProjects([a], 'p-a', sessionForm(), 's1');

  assert.equal(sessionIn(projects, 's1').previousSessionId, 's0');
  assert.equal(sessionIn(projects, 's1').nextSessionId, 's2');
});

test('перевод в сессию не задевает посторонние записи', () => {
  const a = makeProject({
    id: 'p-a',
    sessions: [makeSession({ id: 's1', projectId: 'p-a' }), makeSession({ id: 's-other', projectId: 'p-a' })],
    consultations: [makeConsultation({ id: 'c1', projectId: 'p-a' }), makeConsultation({ id: 'c-other', projectId: 'p-a' })],
  });

  const projects = applyConsultationConversionInProjects([a], 's1', 'c1');

  assert.deepEqual(sessionIn(projects, 's-other'), a.sessions[1]);
  assert.deepEqual(consultationIn(projects, 'c-other'), a.consultations[1]);
});

test('перевод в сессию не мутирует вход', () => {
  const a = makeProject({
    id: 'p-a',
    sessions: [makeSession({ id: 's1', projectId: 'p-a' })],
    consultations: [makeConsultation({ id: 'c1', projectId: 'p-a' })],
  });
  const input = [a];
  const snapshot = structuredClone(input);

  applyConsultationConversionInProjects(input, 's1', 'c1');

  assert.deepEqual(input, snapshot);
});

test('восстановление консультации не трогает её цепочку повторных консультаций', () => {
  const a = makeProject({
    id: 'p-a',
    sessions: [makeSession({ id: 's1', projectId: 'p-a', sourceConsultationId: 'c1' })],
    consultations: [
      makeConsultation({
        id: 'c1',
        projectId: 'p-a',
        status: 'converted',
        convertedToSessionId: 's1',
        previousConsultationId: 'c0',
        nextConsultationId: 'c2',
      }),
    ],
  });

  const projects = deleteSessionFromProjects([a], 's1');

  const c = consultationIn(projects, 'c1');
  assert.equal(c.previousConsultationId, 'c0');
  assert.equal(c.nextConsultationId, 'c2');
});

// ── Форма сессии больше не пишет deprecated `healed` ──────────────────────
// Флаг заменён галереей заживления на проекте (Project.healingPhotos), убран
// из UI и не должен перезаписываться формой: старое значение на записи
// остаётся нетронутым, чтобы бэкапы и импорт не теряли его молча.

test('новая сессия рождается с healed:false и не тянет его из формы', () => {
  const projects = [makeProject({ id: 'project-1' })];
  const { projects: next, sessionId } = upsertSessionInProjects(projects, 'project-1', sessionForm(), null);
  const created = next[0].sessions.find((s) => s.id === sessionId);
  assert.equal(created.healed, false);
});

test('правка сессии не сбрасывает уже записанный healed', () => {
  const projects = [makeProject({ id: 'project-1', sessions: [makeSession({ id: 's1', healed: true })] })];
  const { projects: next } = upsertSessionInProjects(projects, 'project-1', sessionForm({ note: 'правка' }), 's1');
  const edited = next[0].sessions.find((s) => s.id === 's1');
  assert.equal(edited.healed, true, 'deprecated-поле переживает сохранение формы');
  assert.equal(edited.note, 'правка');
});

// ── isLastSession ─────────────────────────────────────────────────────────

test('форма проносит isLastSession в выполненную сессию', () => {
  const projects = [makeProject({ id: 'project-1' })];
  const { projects: next, sessionId } = upsertSessionInProjects(
    projects,
    'project-1',
    sessionForm({ done: true, isLastSession: true }),
    null,
  );
  assert.equal(next[0].sessions.find((s) => s.id === sessionId).isLastSession, true);
});

// Незавершённая встреча ничего не закрывает: держать «да» на будущей сессии
// значило бы запустить цикл заживления от даты, которой ещё не было.
test('невыполненная сессия не может быть последней, даже если форма это просит', () => {
  const projects = [makeProject({ id: 'project-1' })];
  const { projects: next, sessionId } = upsertSessionInProjects(
    projects,
    'project-1',
    sessionForm({ done: false, isLastSession: true }),
    null,
  );
  assert.equal(next[0].sessions.find((s) => s.id === sessionId).isLastSession, false);
});

test('снятие «выполнена» при правке снимает и «последняя»', () => {
  const projects = [makeProject({ id: 'project-1', sessions: [makeSession({ id: 's1', done: true, isLastSession: true })] })];
  const { projects: next } = upsertSessionInProjects(projects, 'project-1', sessionForm({ done: false, isLastSession: true }), 's1');
  assert.equal(next[0].sessions.find((s) => s.id === 's1').isLastSession, false);
});
