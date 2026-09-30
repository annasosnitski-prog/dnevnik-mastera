import assert from 'node:assert/strict';
import test from 'node:test';

import { reconcileHealingCheckPhotos } from '../.test-dist/src/domain/session.js';

// Контрольные фото заживления живут на СЕССИИ (Session.healingCheckPhotos) —
// независимая от Project.healingPhotos галерея (то финальное, одно на
// проект; это — журнал конкретной сессии, снимков может быть много).
// reconcileHealingCheckPhotos — тот же мост от плоского списка url
// (SessionPhotos), что и reconcileHealingPhotos у проекта, но без обложки.

const TODAY = '2026-08-24';

test('reconcileHealingCheckPhotos turns a brand-new url into a full HealingCheckPhoto', () => {
  const [photo] = reconcileHealingCheckPhotos([], ['data:image/png;base64,AAA'], TODAY);
  assert.equal(photo.url, 'data:image/png;base64,AAA');
  assert.equal(photo.addedDate, TODAY);
  assert.equal(typeof photo.id, 'string');
  assert.ok(photo.id.length > 0);
});

test('reconcileHealingCheckPhotos keeps id and addedDate of a photo that survived the edit', () => {
  const existing = [{ id: 'p1', url: 'a', addedDate: '2026-01-05' }];
  const [kept] = reconcileHealingCheckPhotos(existing, ['a'], TODAY);
  assert.equal(kept.id, 'p1');
  assert.equal(kept.addedDate, '2026-01-05');
});

test('reconcileHealingCheckPhotos drops a photo whose url is gone', () => {
  const existing = [
    { id: 'p1', url: 'a', addedDate: '2026-01-05' },
    { id: 'p2', url: 'b', addedDate: '2026-01-06' },
  ];
  const next = reconcileHealingCheckPhotos(existing, ['b'], TODAY);
  assert.deepEqual(next.map((p) => p.id), ['p2']);
});

test('reconcileHealingCheckPhotos keeps the order the urls came in', () => {
  const existing = [
    { id: 'p1', url: 'a', addedDate: '2026-01-05' },
    { id: 'p2', url: 'b', addedDate: '2026-01-06' },
  ];
  const next = reconcileHealingCheckPhotos(existing, ['b', 'a'], TODAY);
  assert.deepEqual(next.map((p) => p.id), ['p2', 'p1']);
});

// Один и тот же файл, добавленный дважды, — это два снимка (как у
// reconcileHealingPhotos на проекте) — иначе в галерее оказались бы две
// записи с одним id.
test('reconcileHealingCheckPhotos gives a duplicated url its own id instead of reusing one', () => {
  const existing = [{ id: 'p1', url: 'a', addedDate: '2026-01-05' }];
  const next = reconcileHealingCheckPhotos(existing, ['a', 'a'], TODAY);
  assert.equal(next.length, 2);
  assert.equal(next[0].id, 'p1', 'первый совпавший забирает существующую запись');
  assert.notEqual(next[1].id, 'p1');
  assert.equal(next[1].addedDate, TODAY, 'второй экземпляр — новый снимок, с сегодняшней датой');
});

// Без обложки: в отличие от reconcileHealingPhotos тут нет isCover — это
// журнал по датам, а не портфолио с одним главным снимком.
test('reconcileHealingCheckPhotos does not add a cover flag', () => {
  const [photo] = reconcileHealingCheckPhotos([], ['a'], TODAY);
  assert.equal('isCover' in photo, false);
});

test('reconcileHealingCheckPhotos returns an empty gallery for an empty url list', () => {
  const existing = [{ id: 'p1', url: 'a', addedDate: '2026-01-05' }];
  assert.deepEqual(reconcileHealingCheckPhotos(existing, [], TODAY), []);
});

test('reconcileHealingCheckPhotos does not mutate the list it is given', () => {
  const existing = [{ id: 'p1', url: 'a', addedDate: '2026-01-05' }];
  const snapshot = structuredClone(existing);
  reconcileHealingCheckPhotos(existing, ['b'], TODAY);
  assert.deepEqual(existing, snapshot);
});
