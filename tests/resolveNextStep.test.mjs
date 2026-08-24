import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveNextStep, isMeaningfulProjectChange, withAdvancedStatus } from '../.test-dist/src/domain/project.js';

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
  const p = makeProject({ status: 'waiting_deposit' });
  assert.equal(isMeaningfulProjectChange(p, { ...p, status: 'active' }), true);
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
// waiting_deposit → active → healing → completed.

test('withAdvancedStatus moves the status forward', () => {
  const p = makeProject({ status: 'waiting_deposit' });
  assert.equal(withAdvancedStatus(p, 'active').status, 'active');
});

test('withAdvancedStatus never moves the status backwards', () => {
  const p = makeProject({ status: 'healing' });
  assert.equal(withAdvancedStatus(p, 'active').status, 'healing');
});

test('withAdvancedStatus leaves an already-reached status alone', () => {
  const p = makeProject({ status: 'active' });
  assert.equal(withAdvancedStatus(p, 'active'), p, 'возвращает тот же объект, менять нечего');
});

// Пропуск через ступень — валидное движение вперёд: последняя сессия проекта,
// у которого предоплату так и не отметили вручную, уводит его сразу
// waiting_deposit → healing, а не застревает.
test('withAdvancedStatus may skip a status when the target is further ahead', () => {
  const p = makeProject({ status: 'waiting_deposit' });
  assert.equal(withAdvancedStatus(p, 'healing').status, 'healing');
});

test('withAdvancedStatus keeps everything else about the project, including just-added sessions', () => {
  const p = makeProject({ status: 'waiting_deposit', sessions: [{ id: 's-new' }] });
  const next = withAdvancedStatus(p, 'active');
  assert.deepEqual(next.sessions.map((s) => s.id), ['s-new'], 'сессия не теряется при продвижении статуса');
  assert.equal(next.title, p.title);
  assert.equal(next.id, p.id);
});

test('withAdvancedStatus does not mutate the project it is given', () => {
  const p = makeProject({ status: 'waiting_deposit' });
  const snapshot = structuredClone(p);
  withAdvancedStatus(p, 'active');
  assert.deepEqual(p, snapshot);
});

test('withAdvancedStatus ignores an unknown target status', () => {
  const p = makeProject({ status: 'waiting_deposit' });
  assert.equal(withAdvancedStatus(p, 'nonsense').status, 'waiting_deposit');
});

// Прежние семь этапов (idea/inquiry/planning/booked/in_progress/…) больше не
// существуют — если старое значение всё же долетит до функции, она обязана
// оставить проект как есть, а не «продвинуть» его в несуществующий статус.
test('withAdvancedStatus ignores a legacy ProjectStage value as a target', () => {
  const p = makeProject({ status: 'waiting_deposit' });
  assert.equal(withAdvancedStatus(p, 'in_progress').status, 'waiting_deposit');
});
