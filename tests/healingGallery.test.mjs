import assert from 'node:assert/strict';
import test from 'node:test';

import { reconcileHealingPhotos, withHealingGallery } from '../.test-dist/src/domain/project.js';

// Галерея заживления живёт на проекте (Project.healingPhotos), а редактируется
// тем же SessionPhotos, что и остальные фото приложения — а он знает только
// про массив data-URL. reconcileHealingPhotos — мост обратно: url'ы снаружи,
// полноценные HealingPhoto (id/дата/обложка) внутри.

const TODAY = '2026-08-24';

function makeProject(overrides = {}) {
  return {
    id: 'project-1',
    title: 'Дракон',
    color: '#B0413E',
    category: 'tattoo',
    clientId: null,
    status: 'healing',
    sessionsPlan: 'single',
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

// ── reconcileHealingPhotos ────────────────────────────────────────────────

test('reconcileHealingPhotos turns a brand-new url into a full HealingPhoto', () => {
  const [photo] = reconcileHealingPhotos([], ['data:image/png;base64,AAA'], TODAY);
  assert.equal(photo.url, 'data:image/png;base64,AAA');
  assert.equal(photo.addedDate, TODAY);
  assert.equal(typeof photo.id, 'string');
  assert.ok(photo.id.length > 0);
});

// Ради этого функция и существует: пересборка списка из url не должна
// переписывать id и дату у снимков, которые мастер не трогала.
test('reconcileHealingPhotos keeps id and addedDate of a photo that survived the edit', () => {
  const existing = [{ id: 'p1', url: 'a', addedDate: '2026-01-05', isCover: true }];
  const [kept] = reconcileHealingPhotos(existing, ['a'], TODAY);
  assert.equal(kept.id, 'p1');
  assert.equal(kept.addedDate, '2026-01-05');
});

test('reconcileHealingPhotos drops a photo whose url is gone', () => {
  const existing = [
    { id: 'p1', url: 'a', addedDate: '2026-01-05', isCover: true },
    { id: 'p2', url: 'b', addedDate: '2026-01-06', isCover: false },
  ];
  const next = reconcileHealingPhotos(existing, ['b'], TODAY);
  assert.deepEqual(next.map((p) => p.id), ['p2']);
});

test('reconcileHealingPhotos keeps the order the urls came in', () => {
  const existing = [
    { id: 'p1', url: 'a', addedDate: '2026-01-05', isCover: true },
    { id: 'p2', url: 'b', addedDate: '2026-01-06', isCover: false },
  ];
  const next = reconcileHealingPhotos(existing, ['b', 'a'], TODAY);
  assert.deepEqual(next.map((p) => p.id), ['p2', 'p1']);
});

// Один и тот же файл, добавленный дважды, — это два снимка, а не один и его
// клон: иначе в галерее оказались бы две записи с одним id (сломанные ключи
// React и неоднозначная обложка).
test('reconcileHealingPhotos gives a duplicated url its own id instead of reusing one', () => {
  const existing = [{ id: 'p1', url: 'a', addedDate: '2026-01-05', isCover: true }];
  const next = reconcileHealingPhotos(existing, ['a', 'a'], TODAY);
  assert.equal(next.length, 2);
  assert.equal(next[0].id, 'p1', 'первый совпавший забирает существующую запись');
  assert.notEqual(next[1].id, 'p1');
  assert.equal(next[1].addedDate, TODAY, 'второй экземпляр — новый снимок, с сегодняшней датой');
});

test('reconcileHealingPhotos makes the first photo the cover when nothing is marked', () => {
  const next = reconcileHealingPhotos([], ['a', 'b'], TODAY);
  assert.deepEqual(next.map((p) => p.isCover), [true, false]);
});

test('reconcileHealingPhotos keeps exactly one cover when the marked photo survives', () => {
  const existing = [
    { id: 'p1', url: 'a', addedDate: '2026-01-05', isCover: false },
    { id: 'p2', url: 'b', addedDate: '2026-01-06', isCover: true },
  ];
  const next = reconcileHealingPhotos(existing, ['a', 'b'], TODAY);
  assert.deepEqual(next.map((p) => p.isCover), [false, true]);
});

// Удаление обложки не должно оставить галерею вообще без неё.
test('reconcileHealingPhotos promotes a new cover when the old cover is removed', () => {
  const existing = [
    { id: 'p1', url: 'a', addedDate: '2026-01-05', isCover: true },
    { id: 'p2', url: 'b', addedDate: '2026-01-06', isCover: false },
  ];
  const next = reconcileHealingPhotos(existing, ['b'], TODAY);
  assert.deepEqual(next.map((p) => [p.id, p.isCover]), [['p2', true]]);
});

test('reconcileHealingPhotos returns an empty gallery for an empty url list', () => {
  const existing = [{ id: 'p1', url: 'a', addedDate: '2026-01-05', isCover: true }];
  assert.deepEqual(reconcileHealingPhotos(existing, [], TODAY), []);
});

test('reconcileHealingPhotos does not mutate the list it is given', () => {
  const existing = [{ id: 'p1', url: 'a', addedDate: '2026-01-05', isCover: true }];
  const snapshot = structuredClone(existing);
  reconcileHealingPhotos(existing, ['b'], TODAY);
  assert.deepEqual(existing, snapshot);
});

// ── withHealingGallery ────────────────────────────────────────────────────
// Добавление фото и «проект завершён» — одно изменение, а не два разных
// сохранения: иначе они разъехались бы по разным местам записи.

test('withHealingGallery completes the project as soon as the first photo lands', () => {
  const p = makeProject({ status: 'healing' });
  assert.equal(withHealingGallery(p, ['a'], TODAY).status, 'completed');
});

test('withHealingGallery completes a project even from an earlier status', () => {
  const p = makeProject({ status: 'waiting_deposit' });
  assert.equal(withHealingGallery(p, ['a'], TODAY).status, 'completed');
});

test('withHealingGallery leaves an already-completed project completed', () => {
  const p = makeProject({ status: 'completed', healingPhotos: [{ id: 'p1', url: 'a', addedDate: '2026-01-05', isCover: true }] });
  assert.equal(withHealingGallery(p, ['a', 'b'], TODAY).status, 'completed');
});

// Статус ходит только вперёд (см. withAdvancedStatus): удаление неудачного
// кадра не должно «расзавершать» проект.
test('withHealingGallery does not roll the status back when the gallery is emptied', () => {
  const p = makeProject({ status: 'completed', healingPhotos: [{ id: 'p1', url: 'a', addedDate: '2026-01-05', isCover: true }] });
  const next = withHealingGallery(p, [], TODAY);
  assert.deepEqual(next.healingPhotos, []);
  assert.equal(next.status, 'completed');
});

test('withHealingGallery leaves a photo-less project alone on an empty edit', () => {
  const p = makeProject({ status: 'healing' });
  const next = withHealingGallery(p, [], TODAY);
  assert.equal(next.status, 'healing');
  assert.deepEqual(next.healingPhotos, []);
});

test('withHealingGallery keeps everything else about the project', () => {
  const p = makeProject({ status: 'healing', sessions: [{ id: 's1' }] });
  const next = withHealingGallery(p, ['a'], TODAY);
  assert.equal(next.id, p.id);
  assert.equal(next.title, p.title);
  assert.deepEqual(next.sessions.map((s) => s.id), ['s1']);
});

test('withHealingGallery does not mutate the project it is given', () => {
  const p = makeProject({ status: 'healing' });
  const snapshot = structuredClone(p);
  withHealingGallery(p, ['a'], TODAY);
  assert.deepEqual(p, snapshot);
});
