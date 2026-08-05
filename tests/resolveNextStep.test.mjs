import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveNextStep, isMeaningfulProjectChange } from '../.test-dist/src/domain/project.js';

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
    createdDate: '2026-01-01T00:00:00.000Z',
    sessions: [],
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

test('isMeaningfulProjectChange is true when stage changes', () => {
  const p = makeProject({ stage: 'idea' });
  assert.equal(isMeaningfulProjectChange(p, { ...p, stage: 'booked' }), true);
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
