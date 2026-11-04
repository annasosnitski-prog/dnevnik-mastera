import assert from 'node:assert/strict';
import test from 'node:test';

import { collectProjectPhotos, projectPhotoToFile } from '../.test-dist/src/lib/projectGallery.js';

function session(o) {
  return { id: 's', name: '', date: '', photos: [], healingCheckPhotos: [], projectId: 'p1', ...o };
}
function consultation(o) {
  return { id: 'c', date: '', time: '', createdDate: '', photos: [], projectId: 'p1', ...o };
}
function project(o = {}) {
  return { id: 'p1', clientId: null, photos: [], healingPhotos: [], sessions: [], consultations: [], createdDate: '2026-01-01', ...o };
}

test('collects photos from linked client records in project chronology, skipping other projects', () => {
  const client = {
    id: 'cl',
    consultations: [consultation({ id: 'c1', date: '2026-01-02', photos: ['ref'] }), consultation({ id: 'cx', projectId: 'other', photos: ['alien'] })],
    sessions: [
      session({ id: 's2', date: '2026-03-01', photos: ['b'] }),
      session({ id: 's1', date: '2026-02-01', photos: ['a', 'ref'], healingCheckPhotos: [{ id: 'h', url: 'heal-a', addedDate: '2026-02-08' }] }),
    ],
    notes: [{ id: 'n', projectId: 'p1', photos: ['note'], createdDate: '2026-02-03T10:00' }],
  };
  const p = project({ clientId: 'cl', photos: ['own'], healingPhotos: [{ id: 'hp', url: 'final', addedDate: '2026-04-01' }] });
  const result = collectProjectPhotos(p, client);
  assert.deepEqual(result.map((x) => x.src), ['ref', 'a', 'heal-a', 'b', 'note', 'own', 'final']);
  assert.deepEqual(result.map((x) => x.label), ['Конс. 1', 'Сессия 1', 'Сессия 1 · заживл.', 'Сессия 2', 'Заметка', 'Проект', 'Заживление']);
});

test('client-less project uses its own sessions/consultations and master notes', () => {
  const p = project({
    sessions: [session({ photos: ['s'] })],
    consultations: [consultation({ photos: ['c'] })],
  });
  const result = collectProjectPhotos(p, null, [{ id: 'm', projectId: 'p1', photos: ['m'], createdDate: '' }, { id: 'x', projectId: null, photos: ['nope'], createdDate: '' }]);
  assert.deepEqual(result.map((x) => x.src), ['c', 's', 'm']);
});

test('projectPhotoToFile converts data URLs and rejects external links', () => {
  const file = projectPhotoToFile('data:image/jpeg;base64,AAAA', 'p1', 0);
  assert.equal(file.name, 'project-p1-1.jpg');
  assert.equal(file.type, 'image/jpeg');
  assert.equal(projectPhotoToFile('https://example.com/a.jpg', 'p1', 0), null);
});

import { collectProjectNotes } from '../.test-dist/src/lib/projectGallery.js';

test('collectProjectNotes gathers project, consultation, session and note texts, skipping empty ones', () => {
  const client = {
    id: 'cl',
    consultations: [consultation({ id: 'c1', generalNotes: 'хочет розу', outcome: 'договорились', feeling: '', creative: '', inspirationSources: '' })],
    sessions: [session({ id: 's1', note: '', skinReaction: '' }), session({ id: 's2', date: '2026-02-02', note: 'контур', skinReaction: 'покраснение' })],
    notes: [{ id: 'n1', projectId: 'p1', text: 'купить иглы', done: true, photos: [], createdDate: '2026-02-03' }],
  };
  const p = project({ clientId: 'cl', generalNotes: 'большой проект' });
  const items = collectProjectNotes(p, client);
  assert.deepEqual(items.map((x) => x.label), ['Проект', 'Консультация 1', 'Сессия 2', 'Заметка']);
  assert.equal(items[1].text, 'хочет розу\n\nИтог: договорились');
  assert.equal(items[2].text, 'контур\n\nКожа: покраснение');
  assert.equal(items[3].done, true);
});
