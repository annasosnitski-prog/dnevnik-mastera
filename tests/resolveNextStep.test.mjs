import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveNextStep,
  isMeaningfulProjectChange,
  withAdvancedStatus,
  withStatusAfterDoneSession,
} from '../.test-dist/src/domain/project.js';

test('resolveNextStep keeps text, date and type when text is non-empty', () => {
  const r = resolveNextStep('Отправить мудборд', '2026-08-12', 'prepare_design');
  assert.deepEqual(r, { nextActionText: 'Отправить мудборд', nextActionDate: '2026-08-12', nextActionType: 'prepare_design' });
});

test('resolveNextStep trims surrounding whitespace from the text', () => {
  const r = resolveNextStep('  Отправить мудборд  ', null, null);
  assert.equal(r.nextActionText, 'Отправить мудборд');
});

test('resolveNextStep clears date and type when the text is cleared', () => {
  const r = resolveNextStep('', '2026-08-12', 'prepare_design');
  assert.deepEqual(r, { nextActionText: '', nextActionDate: null, nextActionType: null });
});

test('resolveNextStep clears date and type when the text is only whitespace', () => {
  const r = resolveNextStep('   ', '2026-08-12', 'prepare_design');
  assert.deepEqual(r, { nextActionText: '', nextActionDate: null, nextActionType: null });
});

test('resolveNextStep keeps a null date/type as-is when text is non-empty', () => {
  const r = resolveNextStep('Позвонить клиенту', null, null);
  assert.deepEqual(r, { nextActionText: 'Позвонить клиенту', nextActionDate: null, nextActionType: null });
});

// ── isMeaningfulProjectChange (M4) ────────────────────────────────────────
// Единственное место, отвечающее «это движение или просто правка текста» —
// решает, бампать ли Project.lastMeaningfulActivityAt в saveProject
// (TattoDiary.tsx).

function makeProject(overrides = {}) {
  return {
    id: 'project-1',
    title: 'Дракон',
    color: '#B0413E',
    category: 'tattoo',
    clientId: null,
    status: 'active',
    sessionsPlan: null,
    healingPhotos: [],
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
    lastMeaningfulActivityAt: '2026-01-01',
    ...overrides,
  };
}

test('isMeaningfulProjectChange is false when nothing tracked changes', () => {
  const p = makeProject();
  assert.equal(isMeaningfulProjectChange(p, { ...p }), false);
});

test('isMeaningfulProjectChange is false for a plain text-field edit (not movement)', () => {
  const p = makeProject();
  const edited = { ...p, generalNotes: 'обновлённые заметки', title: 'Новое название', photos: ['a.jpg'] };
  assert.equal(isMeaningfulProjectChange(p, edited), false);
});

test('isMeaningfulProjectChange is true when status changes', () => {
  const p = makeProject({ status: 'active' });
  assert.equal(isMeaningfulProjectChange(p, { ...p, status: 'healing' }), true);
});

test('isMeaningfulProjectChange is true when state changes (e.g. resumed from pause)', () => {
  const p = makeProject({ state: 'paused' });
  assert.equal(isMeaningfulProjectChange(p, { ...p, state: 'active' }), true);
});

test('isMeaningfulProjectChange is true when waitingFor changes', () => {
  const p = makeProject({ waitingFor: 'client' });
  assert.equal(isMeaningfulProjectChange(p, { ...p, waitingFor: 'master' }), true);
});

test('isMeaningfulProjectChange is true when next-step text/date/type changes', () => {
  const p = makeProject();
  assert.equal(isMeaningfulProjectChange(p, { ...p, nextActionText: 'Позвонить клиенту' }), true);
  assert.equal(isMeaningfulProjectChange(p, { ...p, nextActionDate: '2026-02-01' }), true);
  assert.equal(isMeaningfulProjectChange(p, { ...p, nextActionType: 'contact_client' }), true);
});

// ── withAdvancedStatus ────────────────────────────────────────────────────
// Продвижение статуса возвращает новый проект, а не пишет в стор: раньше это
// было вторым отдельным saveProject, который читал ещё не обновившееся
// состояние и затирал только что добавленную сессию (в проекте без клиента
// она молча пропадала после сохранения).
//
// Порядок «только вперёд» — это порядок PROJECT_STATUSES:
// active → paused → healing → completed. «Пауза» стоит внутри этого
// порядка, а не сбоку от него: см. отдельный блок тестов про неё ниже.

test('withAdvancedStatus moves the status forward', () => {
  const p = makeProject({ status: 'active' });
  assert.equal(withAdvancedStatus(p, 'healing').status, 'healing');
});

test('withAdvancedStatus never moves the status backwards', () => {
  const p = makeProject({ status: 'healing' });
  assert.equal(withAdvancedStatus(p, 'active').status, 'healing');
});

test('withAdvancedStatus leaves an already-reached status alone', () => {
  const p = makeProject({ status: 'active' });
  assert.equal(withAdvancedStatus(p, 'active'), p, 'возвращает тот же объект, менять нечего');
});

test('withAdvancedStatus may skip a status when the target is further ahead', () => {
  const p = makeProject({ status: 'active' });
  assert.equal(withAdvancedStatus(p, 'completed').status, 'completed');
});

test('withAdvancedStatus keeps everything else about the project, including just-added sessions', () => {
  const p = makeProject({ status: 'active', sessions: [{ id: 's-new' }] });
  const next = withAdvancedStatus(p, 'healing');
  assert.deepEqual(next.sessions.map((s) => s.id), ['s-new'], 'сессия не теряется при продвижении статуса');
  assert.equal(next.title, p.title);
  assert.equal(next.id, p.id);
});

test('withAdvancedStatus does not mutate the project it is given', () => {
  const p = makeProject({ status: 'active' });
  const snapshot = structuredClone(p);
  withAdvancedStatus(p, 'healing');
  assert.deepEqual(p, snapshot);
});

test('withAdvancedStatus ignores an unknown target status', () => {
  const p = makeProject({ status: 'active' });
  assert.equal(withAdvancedStatus(p, 'nonsense').status, 'active');
});

// Прежние семь этапов (idea/inquiry/planning/booked/in_progress/…) больше не
// существуют — если старое значение всё же долетит до функции, она обязана
// оставить проект как есть, а не «продвинуть» его в несуществующий статус.
test('withAdvancedStatus ignores a legacy ProjectStage value as a target', () => {
  const p = makeProject({ status: 'active' });
  assert.equal(withAdvancedStatus(p, 'in_progress').status, 'active');
});

// «Пауза» — ручной, обратимый статус (мастер сама ставит и снимает через
// select в форме, в обход этой функции). Её место в PROJECT_STATUSES —
// сразу после 'active' — решает, какие автопереходы её пропускают, а какие
// сквозь неё проходят: обычная сессия целится в 'active', то есть НЕ дальше
// паузы по порядку, и её не снимает; последняя сессия и фото заживления
// целятся дальше — и снимают паузу сами.
test('withAdvancedStatus does not auto-resume a paused project by advancing to «Активен»', () => {
  const p = makeProject({ status: 'paused' });
  assert.equal(withAdvancedStatus(p, 'active').status, 'paused');
});

test('withAdvancedStatus does move a paused project on to «Ожидает заживления» or «Завершён»', () => {
  const p = makeProject({ status: 'paused' });
  assert.equal(withAdvancedStatus(p, 'healing').status, 'healing');
});

// ── withStatusAfterDoneSession ────────────────────────────────────────────
// Куда выполненная сессия двигает проект: обычная — «Активен», последняя —
// сразу «Ожидает заживления» (дальше только цикл заживления).

test('withStatusAfterDoneSession keeps status «Активен» on an ordinary session', () => {
  const p = makeProject({ status: 'active', sessionsPlan: 'multiple' });
  assert.equal(withStatusAfterDoneSession(p, false).status, 'active');
});

// Обычная (не последняя) сессия целится в 'active' — то есть не дальше
// паузы по порядку PROJECT_STATUSES, — и поэтому не снимает её сама.
test('withStatusAfterDoneSession does not resume a paused project on an ordinary session', () => {
  const p = makeProject({ status: 'paused', sessionsPlan: 'multiple' });
  assert.equal(withStatusAfterDoneSession(p, false).status, 'paused');
});

test('withStatusAfterDoneSession moves a project to «Ожидает заживления» on the last session', () => {
  const p = makeProject({ status: 'active', sessionsPlan: 'multiple' });
  assert.equal(withStatusAfterDoneSession(p, true).status, 'healing');
});

// Последняя сессия целится дальше паузы по порядку — снимает её сама,
// в отличие от обычной сессии выше.
test('withStatusAfterDoneSession resumes a paused project via its last session', () => {
  const p = makeProject({ status: 'paused', sessionsPlan: 'multiple' });
  assert.equal(withStatusAfterDoneSession(p, true).status, 'healing');
});

// У проекта «одна встреча» единственная сессия последняя по определению —
// подтверждение мастера там не спрашивается и на сессии не хранится.
test('withStatusAfterDoneSession treats a single-session project as always final', () => {
  const p = makeProject({ status: 'active', sessionsPlan: 'single' });
  assert.equal(withStatusAfterDoneSession(p, false).status, 'healing');
});

// Старый проект без плана ведёт себя как «больше одной»: подтверждения не
// было, значит закрывать работу нечем.
test('withStatusAfterDoneSession treats a plan-less project as not final without confirmation', () => {
  const p = makeProject({ status: 'active', sessionsPlan: null });
  assert.equal(withStatusAfterDoneSession(p, false).status, 'active');
});

test('withStatusAfterDoneSession never rolls a completed project back', () => {
  const p = makeProject({ status: 'completed', sessionsPlan: 'multiple' });
  assert.equal(withStatusAfterDoneSession(p, true), p, 'возвращает тот же объект, менять нечего');
});
