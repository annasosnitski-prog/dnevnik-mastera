import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { PHOTO_SHAPES, restorePhotos, stripPhotos } from '../.test-dist/src/sync/photoPayload.js';

// Фото не ездят через облако, пока не переехали в Supabase Storage: base64
// внутри записей уложил бы фотобиблиотеку в Postgres jsonb одним upsert'ом.
// Здесь держим обе половины правила — «отправляем без снимков» и «принимаем,
// не трогая свои».

const photo = (n) => `data:image/jpeg;base64,${'A'.repeat(n)}`;

// ── Отправка ─────────────────────────────────────────────────────────────

test('проект уезжает без единого снимка, но со всем остальным', () => {
  const project = {
    id: 'p1',
    updatedAt: '2026-01-01T00:00:00.000Z',
    title: 'Дракон',
    price: 30000,
    photos: [photo(1000), photo(1000)],
    healingPhotos: [{ id: 'h1', day: 7, url: photo(1000) }],
    sessions: [{ id: 's1', date: '2026-01-01', notes: 'первый сеанс', photos: [photo(1000)] }],
    consultations: [{ id: 'c1', photos: [photo(1000)] }],
  };
  const sent = stripPhotos('projects', project);

  assert.deepEqual(sent.photos, []);
  assert.deepEqual(sent.healingPhotos, [{ id: 'h1', day: 7, url: '' }]);
  assert.deepEqual(sent.sessions, [{ id: 's1', date: '2026-01-01', notes: 'первый сеанс', photos: [] }]);
  assert.deepEqual(sent.consultations, [{ id: 'c1', photos: [] }]);
  // Всё, ради чего синк и делается, на месте.
  assert.equal(sent.title, 'Дракон');
  assert.equal(sent.price, 30000);
  assert.equal(sent.updatedAt, '2026-01-01T00:00:00.000Z');
});

test('карточка клиента уезжает с документами, но без их содержимого', () => {
  const sent = stripPhotos('clients', {
    id: 'c1',
    updatedAt: '2026-01-01T00:00:00.000Z',
    name: 'Аня',
    documents: [{ id: 'd1', name: 'Согласие', fileUrl: photo(1000) }],
    sessions: [{ id: 's1', photos: [photo(1000)] }],
  });
  assert.deepEqual(sent.documents, [{ id: 'd1', name: 'Согласие', fileUrl: '' }]);
  assert.deepEqual(sent.sessions, [{ id: 's1', photos: [] }]);
  assert.equal(sent.name, 'Аня');
});

test('снятие снимков не трогает исходную запись — она остаётся в базе целой', () => {
  const project = { id: 'p1', updatedAt: 'x', photos: [photo(10)], sessions: [{ id: 's1', photos: [photo(10)] }] };
  stripPhotos('projects', project);
  assert.equal(project.photos.length, 1);
  assert.equal(project.sessions[0].photos.length, 1);
});

test('запись без фото-полей вообще проходит без выдумывания пустых массивов', () => {
  const sent = stripPhotos('contentEntries', { id: 'e1', updatedAt: 'x', text: 'пост' });
  assert.deepEqual(sent, { id: 'e1', updatedAt: 'x', text: 'пост' });
});

// ── Получение ────────────────────────────────────────────────────────────

test('приехавшая правка приносит текст, а снимки остаются свои', () => {
  const incoming = {
    id: 'p1',
    updatedAt: '2026-02-01T00:00:00.000Z',
    title: 'Дракон и пионы',
    photos: [],
    sessions: [{ id: 's1', notes: 'дополнено на планшете', photos: [] }],
  };
  const local = {
    id: 'p1',
    updatedAt: '2026-01-01T00:00:00.000Z',
    title: 'Дракон',
    photos: [photo(1000)],
    sessions: [{ id: 's1', notes: 'первый сеанс', photos: [photo(1000)] }],
  };
  const merged = restorePhotos('projects', incoming, local);

  assert.equal(merged.title, 'Дракон и пионы');
  assert.equal(merged.sessions[0].notes, 'дополнено на планшете');
  assert.deepEqual(merged.photos, local.photos);
  assert.deepEqual(merged.sessions[0].photos, local.sessions[0].photos);
});

test('облако не может стереть местные снимки, даже если прислало пустоту', () => {
  // Это и есть главная гарантия шага: другое устройство отправляет ВСЕГДА
  // без фото, поэтому «пусто в облаке» никогда не значит «удали у себя».
  const local = { id: 'p1', updatedAt: 'a', photos: [photo(1000), photo(1000)] };
  const merged = restorePhotos('projects', { id: 'p1', updatedAt: 'b', photos: [] }, local);
  assert.equal(merged.photos.length, 2);
});

test('запись, которую это устройство видит впервые, приходит без фото — и это честно', () => {
  const merged = restorePhotos('projects', { id: 'p2', updatedAt: 'b', title: 'Новый', photos: [] }, undefined);
  assert.equal(merged.title, 'Новый');
  assert.deepEqual(merged.photos, []);
});

test('сессии сопоставляются по id, а не по месту в массиве', () => {
  // На другом устройстве сессии могли переставить или добавить новую.
  // Подстановка «по позиции» пришила бы снимки к чужой сессии.
  const incoming = {
    id: 'p1',
    updatedAt: 'b',
    sessions: [{ id: 's-new', photos: [] }, { id: 's1', photos: [] }],
  };
  const local = { id: 'p1', updatedAt: 'a', sessions: [{ id: 's1', photos: [photo(1000)] }] };
  const merged = restorePhotos('projects', incoming, local);

  assert.deepEqual(merged.sessions[0], { id: 's-new', photos: [] });
  assert.equal(merged.sessions[1].photos.length, 1);
});

test('документы тоже по id — содержимое возвращается своё', () => {
  const merged = restorePhotos(
    'clients',
    { id: 'c1', updatedAt: 'b', documents: [{ id: 'd1', name: 'Согласие (испр.)', fileUrl: '' }] },
    { id: 'c1', updatedAt: 'a', documents: [{ id: 'd1', name: 'Согласие', fileUrl: photo(1000) }] },
  );
  assert.equal(merged.documents[0].name, 'Согласие (испр.)');
  assert.equal(merged.documents[0].fileUrl.length, photo(1000).length);
});

// ── Списки полей не должны разойтись ─────────────────────────────────────

test('фото-поля здесь и в разборе «Куда ушло место» перечислены одни и те же', () => {
  // Оба списка описывают одно и то же: где в записи лежат снимки. Разъедутся
  // — и новое фото-поле либо не попадёт в замер, либо тихо уедет в облако.
  const breakdown = readFileSync(new URL('../src/lib/storageBreakdown.ts', import.meta.url), 'utf8');

  const mentioned = (name) => breakdown.includes(name);
  for (const shape of Object.values(PHOTO_SHAPES)) {
    for (const field of shape.direct) assert.ok(mentioned(`.${field}`), `нет ${field} в storageBreakdown.ts`);
    for (const { field, photoField } of shape.objects) {
      assert.ok(mentioned(`.${field}`), `нет ${field} в storageBreakdown.ts`);
      assert.ok(mentioned(`'${photoField}'`), `нет ${photoField} в storageBreakdown.ts`);
    }
    for (const field of shape.nested) assert.ok(mentioned(`.${field}`), `нет ${field} в storageBreakdown.ts`);
  }
});

test('движок синка снимает фото на отправке и возвращает свои на приёме', () => {
  const engine = readFileSync(new URL('../src/sync/syncEngine.ts', import.meta.url), 'utf8');
  assert.match(engine, /remote\.upsert\(merged\.toPushRemotely\.map\(\(record\) => stripPhotos\(kind, record\)\)\)/);
  assert.match(engine, /restorePhotos\(kind, record, localById\.get\(record\.id\)\)/);
});
