import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAdminNotesGroups, totalAdminNotesCount } from '../.test-dist/src/components/screens/adminNotesList.js';

function makeNote(overrides = {}) {
  return {
    id: 'n1', text: 'Заметка', urgency: 'normal', done: false, createdDate: '2026-01-01',
    photos: [], projectId: null, dueDate: null,
    ...overrides,
  };
}

function makeClient(overrides = {}) {
  return {
    id: 'client-1', name: 'Анна', notes: [],
    ...overrides,
  };
}

test('empty clients and masterNotes produce no groups', () => {
  assert.deepEqual(buildAdminNotesGroups([], []), []);
});

test('done notes are excluded — client and personal alike', () => {
  const clients = [makeClient({ notes: [makeNote({ id: 'a', done: true, urgency: 'urgent' })] })];
  const masterNotes = [makeNote({ id: 'b', done: true, urgency: 'urgent' })];
  assert.deepEqual(buildAdminNotesGroups(clients, masterNotes), []);
});

test('a client note is labelled with the client name and carries its clientId', () => {
  const clients = [makeClient({ id: 'client-a', name: 'Ирина', notes: [makeNote({ id: 'n1', urgency: 'urgent' })] })];
  const groups = buildAdminNotesGroups(clients, []);
  const item = groups.find((g) => g.urgency === 'urgent').items[0];
  assert.equal(item.clientId, 'client-a');
  assert.equal(item.ownerLabel, 'Ирина');
});

test('a personal (master) note is labelled «Личная задача» with clientId null', () => {
  const masterNotes = [makeNote({ id: 'm1', urgency: 'important' })];
  const groups = buildAdminNotesGroups([], masterNotes);
  const item = groups.find((g) => g.urgency === 'important').items[0];
  assert.equal(item.clientId, null);
  assert.equal(item.ownerLabel, 'Личная задача');
});

test('notes are grouped by all four urgency levels', () => {
  const masterNotes = [
    makeNote({ id: 'u', urgency: 'urgent' }),
    makeNote({ id: 'i', urgency: 'important' }),
    makeNote({ id: 'n', urgency: 'normal' }),
    makeNote({ id: 'x', urgency: 'interesting' }),
  ];
  const groups = buildAdminNotesGroups([], masterNotes);
  assert.deepEqual(groups.map((g) => g.urgency).sort(), ['important', 'interesting', 'normal', 'urgent']);
});

test('empty urgency groups are excluded from the result', () => {
  const masterNotes = [makeNote({ id: 'u', urgency: 'urgent' })];
  const groups = buildAdminNotesGroups([], masterNotes);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].urgency, 'urgent');
});

test('groups appear in the fixed URGENCY order (urgent, important, normal, interesting) regardless of input order', () => {
  const masterNotes = [
    makeNote({ id: 'x', urgency: 'interesting' }),
    makeNote({ id: 'n', urgency: 'normal' }),
    makeNote({ id: 'u', urgency: 'urgent' }),
    makeNote({ id: 'i', urgency: 'important' }),
  ];
  const groups = buildAdminNotesGroups([], masterNotes);
  assert.deepEqual(groups.map((g) => g.urgency), ['urgent', 'important', 'normal', 'interesting']);
});

test('a note without a due date is included, not dropped', () => {
  const masterNotes = [makeNote({ id: 'm1', urgency: 'urgent', dueDate: null })];
  const groups = buildAdminNotesGroups([], masterNotes);
  assert.equal(groups[0].items.length, 1);
  assert.equal(groups[0].items[0].note.dueDate, null);
});

test('within a group, dated notes sort soonest-first and come before undated notes', () => {
  const masterNotes = [
    makeNote({ id: 'no-date', urgency: 'urgent', dueDate: null, createdDate: '2026-01-01' }),
    makeNote({ id: 'later', urgency: 'urgent', dueDate: '2026-08-20' }),
    makeNote({ id: 'sooner', urgency: 'urgent', dueDate: '2026-08-10' }),
  ];
  const groups = buildAdminNotesGroups([], masterNotes);
  assert.deepEqual(groups[0].items.map((i) => i.note.id), ['sooner', 'later', 'no-date']);
});

test('client and personal notes of the same urgency land in the same group', () => {
  const clients = [makeClient({ notes: [makeNote({ id: 'client-note', urgency: 'urgent' })] })];
  const masterNotes = [makeNote({ id: 'personal-note', urgency: 'urgent' })];
  const groups = buildAdminNotesGroups(clients, masterNotes);
  assert.equal(groups[0].items.length, 2);
});

test('totalAdminNotesCount sums every group', () => {
  const masterNotes = [
    makeNote({ id: 'u', urgency: 'urgent' }),
    makeNote({ id: 'i1', urgency: 'important' }),
    makeNote({ id: 'i2', urgency: 'important' }),
  ];
  const groups = buildAdminNotesGroups([], masterNotes);
  assert.equal(totalAdminNotesCount(groups), 3);
});

test('totalAdminNotesCount is 0 for an empty list', () => {
  assert.equal(totalAdminNotesCount([]), 0);
});

test('does not mutate the input clients or masterNotes arrays', () => {
  const clients = [makeClient({ notes: [makeNote({ id: 'n1', urgency: 'urgent' })] })];
  const masterNotes = [makeNote({ id: 'm1', urgency: 'important' })];
  const clientsBefore = JSON.parse(JSON.stringify(clients));
  const notesBefore = JSON.parse(JSON.stringify(masterNotes));

  buildAdminNotesGroups(clients, masterNotes);

  assert.deepEqual(clients, clientsBefore);
  assert.deepEqual(masterNotes, notesBefore);
});
