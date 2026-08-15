import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Проверка проводки по исходникам — тот же приём, что уже используют
// contentLinkPickerSheet.test.mjs и clientTabGems.test.mjs: компоненты
// нельзя отрендерить в node --test, но можно убедиться, что данные
// действительно доходят до формы.

function readSource(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n?/g, '\n');
}

const detailScreen = readSource('../src/components/screens/DetailScreen.tsx');
const clientControls = readSource('../src/components/client/ClientControls.tsx');
const noteSheet = readSource('../src/components/sheets/NoteComposerSheet.tsx');
const summaryScreen = readSource('../src/components/screens/SummaryScreen.tsx');
const app = readSource('../src/components/TattoDiary.tsx');

const noteComposer = clientControls.slice(clientControls.indexOf('export function NoteComposer('));

test('NoteComposer takes a projects list so a note can be tied to a project at creation', () => {
  assert.match(noteComposer, /projects\?: Project\[\];/);
  assert.match(noteComposer, /const \[projectId, setProjectId\] = useState<string \| null>\(null\);/);
});

test('the project picker is rendered, with «— без проекта —» as the default option', () => {
  assert.match(noteComposer, /Проект \(необязательно\)/);
  assert.match(noteComposer, /<option value="">— без проекта —<\/option>/);
  assert.match(noteComposer, /availableProjects\.map\(\(p\) => \(/);
});

test('only the selected owner\'s projects are offered — client\'s own, or Мастерская when there is no client', () => {
  assert.match(
    noteComposer,
    /const availableProjects = \(projects \?\? \[\]\)\.filter\(\(p\) => \(clientId \? p\.clientId === clientId : p\.clientId === null\)\);/,
  );
});

test('changing the client resets the picked project, so a note cannot land in a stranger\'s project', () => {
  assert.match(noteComposer, /const changeClient = \(nextClientId: string \| null\) => \{\s*setClientId\(nextClientId\);\s*setProjectId\(null\);/);
  assert.match(noteComposer, /onChange=\{\(e\) => changeClient\(e\.target\.value \|\| null\)\}/);
});

test('the picked project is submitted, and an explicit preset (creating from inside a project) wins over it', () => {
  assert.match(noteComposer, /onAdd\(t, urgency, photos, dueDate \|\| null, clientId, presetProjectId \?\? projectId\)/);
});

test('the picker is hidden when the project is already fixed by context or there is nothing to pick', () => {
  assert.match(noteComposer, /\{!presetProjectId && availableProjects\.length > 0 && \(/);
});

// ── Проводка во всех местах, где открывается композер ─────────────────────

test('NoteComposerSheet (Личный кабинет / Мастерская / открытый проект) forwards projects', () => {
  assert.match(noteSheet, /projects\?: Project\[\];/);
  assert.match(noteSheet, /projects=\{projects\}/);
  assert.match(app, /<NoteComposerSheet[\s\S]*?projects=\{projects\}/);
});

test('the «Сводка» composer forwards projects and the picked projectId', () => {
  assert.match(summaryScreen, /<NoteComposer\s+clients=\{clients\}\s+projects=\{projects\}/);
  assert.match(summaryScreen, /onAddNote\(clientId, text, urgency, photos, dueDate, projectId\)/);
  assert.match(summaryScreen, /onAddMasterNote\(text, urgency, photos, dueDate, projectId\)/);
});

test('the client card «Дополнительно» composer offers that client\'s projects', () => {
  assert.match(detailScreen, /<NoteComposer\s+projects=\{projects\}\s+presetClientId=\{client\.id\}/);
});

test('every note-creating handler stores the projectId instead of hardcoding null', () => {
  // Раньше все три писали projectId: null, и привязать заметку к проекту при
  // создании было нельзя вообще — только открыв её потом на редактирование.
  const handlers = app.slice(app.indexOf('onAddMasterNote={'), app.indexOf('onToggleMasterDone={'));
  assert.doesNotMatch(handlers, /projectId: null/);
  assert.match(handlers, /projectId,/);
});
