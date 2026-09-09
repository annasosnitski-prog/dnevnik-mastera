import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { PHOTO_SHAPES, externalizePhotos, internalizePhotos, unionPhotoFields, unionById } from '../.test-dist/src/sync/photoPayload.js';
import { hashToRef, photoContentHash } from '../.test-dist/src/sync/photoRefs.js';

// Фото не влезают в Postgres: base64 внутри записей уложил бы всю
// фотобиблиотеку в jsonb, да ещё столько раз, сколько у снимка копий.
// Поэтому на границе облака запись выворачивается: снимок уходит файлом в
// Storage под именем-хэшем, в строке остаётся ссылка photo:<sha256>.
// Здесь держим обе половины — вынос и возврат — без единого обращения к сети.

const photo = (n, seed = 'A') => `data:image/jpeg;base64,${seed}${'A'.repeat(n)}`;

// Поддельный Storage: помнит, что положили, и считает обращения.
function fakeTransport(prefill = {}) {
  const files = new Map(Object.entries(prefill));
  const uploads = [];
  const downloads = [];
  return {
    files,
    uploads,
    downloads,
    async upload(hash, dataUrl) {
      uploads.push(hash);
      files.set(hash, dataUrl);
    },
    async download(hash) {
      downloads.push(hash);
      return files.get(hash) ?? null;
    },
  };
}

const ref = async (dataUrl) => hashToRef(await photoContentHash(dataUrl));

// ── Отправка: снимок в Storage, ссылка в записи ──────────────────────────

test('проект уезжает ссылками, а сами снимки ложатся файлами', async () => {
  const cover = photo(1000, 'cover');
  const healing = photo(1000, 'heal');
  const project = {
    id: 'p1',
    updatedAt: '2026-01-01T00:00:00.000Z',
    title: 'Дракон',
    price: 30000,
    photos: [cover],
    healingPhotos: [{ id: 'h1', day: 7, url: healing }],
    sessions: [{ id: 's1', notes: 'первый сеанс', photos: [cover] }],
  };
  const transport = fakeTransport();
  const sent = await externalizePhotos('projects', project, transport, new Set());

  assert.deepEqual(sent.photos, [await ref(cover)]);
  assert.equal(sent.healingPhotos[0].url, await ref(healing));
  assert.equal(sent.healingPhotos[0].day, 7);
  assert.deepEqual(sent.sessions[0].photos, [await ref(cover)]);
  assert.equal(sent.sessions[0].notes, 'первый сеанс');
  assert.equal(sent.title, 'Дракон');
  assert.equal(sent.price, 30000);

  // Одно фото обложки, лежащее и в проекте, и в сессии, — один файл.
  assert.equal(transport.uploads.length, 2);
});

test('копия снимка в другом сторе не грузится второй раз', async () => {
  // Ровно то тройное дублирование, которое показывает duplicateBytes:
  // фото сессии уехало в черновик контента. Набор uploaded общий на прогон.
  const shared = photo(1000, 'shared');
  const transport = fakeTransport();
  const uploaded = new Set();
  await externalizePhotos('projects', { id: 'p1', updatedAt: 'a', photos: [shared] }, transport, uploaded);
  await externalizePhotos('contentEntries', { id: 'e1', updatedAt: 'a', photos: [shared] }, transport, uploaded);
  assert.equal(transport.uploads.length, 1);
});

test('вынос снимков не трогает исходную запись — она остаётся в базе целой', async () => {
  const project = { id: 'p1', updatedAt: 'x', photos: [photo(10)], sessions: [{ id: 's1', photos: [photo(10)] }] };
  await externalizePhotos('projects', project, fakeTransport(), new Set());
  assert.ok(project.photos[0].startsWith('data:'));
  assert.ok(project.sessions[0].photos[0].startsWith('data:'));
});

test('запись без фото-полей проходит без выдумывания пустых массивов', async () => {
  const sent = await externalizePhotos('contentEntries', { id: 'e1', updatedAt: 'x', text: 'пост' }, fakeTransport(), new Set());
  assert.deepEqual(sent, { id: 'e1', updatedAt: 'x', text: 'пост' });
});

test('карточка клиента: документ уезжает ссылкой, имя остаётся', async () => {
  const scan = photo(1000, 'scan');
  const sent = await externalizePhotos(
    'clients',
    { id: 'c1', updatedAt: 'a', name: 'Аня', documents: [{ id: 'd1', name: 'Согласие', fileUrl: scan }] },
    fakeTransport(),
    new Set(),
  );
  assert.equal(sent.documents[0].fileUrl, await ref(scan));
  assert.equal(sent.documents[0].name, 'Согласие');
  assert.equal(sent.name, 'Аня');
});

// ── Приём: ссылка разворачивается обратно ───────────────────────────────

test('свой снимок на месте — ссылка разворачивается без единого скачивания', async () => {
  // Самый частый случай: прислали правку текста, фото не трогали. Ходить за
  // мегабайтами в сеть тут нечего.
  const cover = photo(1000, 'cover');
  const transport = fakeTransport({ [await photoContentHash(cover)]: cover });
  const merged = await internalizePhotos(
    'projects',
    { id: 'p1', updatedAt: 'b', title: 'Дракон и пионы', photos: [await ref(cover)] },
    { id: 'p1', updatedAt: 'a', title: 'Дракон', photos: [cover] },
    transport,
  );
  assert.equal(merged.title, 'Дракон и пионы');
  assert.equal(merged.photos[0], cover);
  assert.deepEqual(transport.downloads, []);
});

test('чужой снимок скачивается и ложится в запись как обычная base64-строка', async () => {
  const shot = photo(1000, 'new');
  const transport = fakeTransport({ [await photoContentHash(shot)]: shot });
  const merged = await internalizePhotos(
    'projects',
    { id: 'p2', updatedAt: 'b', title: 'Новый', photos: [await ref(shot)] },
    undefined,
    transport,
  );
  assert.equal(merged.photos[0], shot);
  assert.equal(transport.downloads.length, 1);
});

test('одинаковые ссылки внутри одной записи качаются один раз', async () => {
  const shot = photo(1000, 'twice');
  const link = await ref(shot);
  const transport = fakeTransport({ [await photoContentHash(shot)]: shot });
  await internalizePhotos(
    'projects',
    { id: 'p1', updatedAt: 'b', photos: [link], sessions: [{ id: 's1', photos: [link] }] },
    undefined,
    transport,
  );
  assert.equal(transport.downloads.length, 1);
});

test('файла в облаке нет — ссылка остаётся ссылкой, а не превращается в пустоту', async () => {
  // Подставить сюда пустоту значило бы, что следующая отправка увезёт в
  // облако «фото удалили», хотя его никто не удалял.
  const link = hashToRef('deadbeef');
  const merged = await internalizePhotos('projects', { id: 'p1', updatedAt: 'b', photos: [link] }, undefined, fakeTransport());
  assert.deepEqual(merged.photos, [link]);
});

test('свой снимок другой — ссылка качается, а не подставляется вслепую', async () => {
  // Позиция в массиве — только подсказка, где искать своё. Если на другом
  // устройстве фото переставили, сверка хэша это замечает.
  const mine = photo(1000, 'mine');
  const theirs = photo(1000, 'theirs');
  const transport = fakeTransport({ [await photoContentHash(theirs)]: theirs });
  const merged = await internalizePhotos(
    'projects',
    { id: 'p1', updatedAt: 'b', photos: [await ref(theirs)] },
    { id: 'p1', updatedAt: 'a', photos: [mine] },
    transport,
  );
  assert.equal(merged.photos[0], theirs);
});

test('сессии сопоставляются по id, а не по месту в массиве', async () => {
  const mine = photo(1000, 'mine');
  const transport = fakeTransport();
  const merged = await internalizePhotos(
    'projects',
    { id: 'p1', updatedAt: 'b', sessions: [{ id: 's-new', photos: [] }, { id: 's1', photos: [await ref(mine)] }] },
    { id: 'p1', updatedAt: 'a', sessions: [{ id: 's1', photos: [mine] }] },
    transport,
  );
  assert.equal(merged.sessions[1].photos[0], mine);
  assert.deepEqual(transport.downloads, []);
});

test('документы тоже по id — своё содержимое не скачивается заново', async () => {
  const scan = photo(1000, 'scan');
  const transport = fakeTransport();
  const merged = await internalizePhotos(
    'clients',
    { id: 'c1', updatedAt: 'b', documents: [{ id: 'd1', name: 'Согласие (испр.)', fileUrl: await ref(scan) }] },
    { id: 'c1', updatedAt: 'a', documents: [{ id: 'd1', name: 'Согласие', fileUrl: scan }] },
    transport,
  );
  assert.equal(merged.documents[0].name, 'Согласие (испр.)');
  assert.equal(merged.documents[0].fileUrl, scan);
  assert.deepEqual(transport.downloads, []);
});

test('вынос и возврат — обратимая пара: запись возвращается такой же', async () => {
  const project = {
    id: 'p1',
    updatedAt: 'a',
    title: 'Дракон',
    photos: [photo(500, 'a'), photo(500, 'b')],
    healingPhotos: [{ id: 'h1', day: 7, url: photo(500, 'c') }],
    sessions: [{ id: 's1', notes: 'сеанс', photos: [photo(500, 'd')] }],
  };
  const transport = fakeTransport();
  const sent = await externalizePhotos('projects', project, transport, new Set());
  const back = await internalizePhotos('projects', sent, undefined, transport);
  assert.deepEqual(back, project);
});

// ── Списки полей не должны разойтись ─────────────────────────────────────

test('фото-поля здесь и в разборе «Куда ушло место» перечислены одни и те же', () => {
  // Оба списка описывают одно и то же: где в записи лежат снимки. Разъедутся
  // — и новое фото-поле либо не попадёт в замер, либо тихо уедет в Postgres
  // целым мегабайтом вместо ссылки.
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

test('движок выносит снимки на отправке и разворачивает на приёме', () => {
  const engine = readFileSync(new URL('../src/sync/syncEngine.ts', import.meta.url), 'utf8');
  assert.match(engine, /externalizePhotos\(kind, unioned, photos, uploaded\)/);
  assert.match(engine, /internalizePhotos\(kind, unioned, localById\.get\(record\.id\), photos\)/);
  // Набор загруженного — один на весь прогон, иначе копии одного снимка в
  // разных сторах уехали бы в облако по разу за стор.
  assert.match(engine, /const uploaded = new Set<string>\(\);/);
});

test('снимки разворачиваются ДО открытия записи в IndexedDB', () => {
  // Транзакция IndexedDB закрывается на первом витке событий без запросов.
  // Скачать файл внутри неё — это await на сеть, то есть гарантированный
  // TransactionInactiveError на записи.
  const engine = readFileSync(new URL('../src/sync/syncEngine.ts', import.meta.url), 'utf8');
  const prepare = engine.indexOf('const toWriteLocally = await Promise.all(');
  const open = engine.indexOf("db.transaction([adapter.store, DELETIONS_STORE], 'readwrite')");
  assert.ok(prepare > 0 && prepare < open);
});

// ── Слияние конфликтующих фото ────────────────────────────────────────────
// mergeRecords решает победителя ЦЕЛОЙ записи по updatedAt. Отдельная
// проблема: оба устройства офлайн независимо добавили в один проект РАЗНЫЕ
// снимки. Взять только версию победителя значило бы потерять снимки
// проигравшего устройства молча — ровно то, чего мастер и опасалась.

test('победитель без конфликта возвращается как есть — сливать не с чем', async () => {
  const winner = { id: 'p1', updatedAt: 'b', photos: [photo(500, 'x')] };
  const merged = await unionPhotoFields('projects', winner, undefined);
  assert.equal(merged, winner);
});

test('оба устройства офлайн добавили разные фото в один проект — оба остаются', async () => {
  const shared = photo(500, 'cover');
  const winner = { id: 'p1', updatedAt: '2026-01-01T12:00:00.000Z', title: 'Дракон', photos: [shared, photo(500, 'evening')] };
  const loser = { id: 'p1', updatedAt: '2026-01-01T10:00:00.000Z', title: 'Дракон', photos: [shared, photo(500, 'morning')] };
  const merged = await unionPhotoFields('projects', winner, loser);

  // Текст остаётся от победителя — это по-прежнему решает mergeRecords.
  assert.equal(merged.title, 'Дракон');
  assert.equal(merged.photos.length, 3);
  assert.ok(merged.photos.some((p) => p.includes('evening')));
  assert.ok(merged.photos.some((p) => p.includes('morning')));
  // Общий снимок не задублировался.
  assert.equal(merged.photos.filter((p) => p === shared).length, 1);
});

test('слияние работает между локальной base64 и облачной ссылкой на один и тот же снимок', async () => {
  // Ровно та ситуация из движка синка: местная версия ещё base64, облачная
  // уже прислала photo:<hash>. Совпадение по содержимому должно найтись
  // без единого скачивания.
  const shot = photo(500, 'same');
  const winner = { id: 'p1', updatedAt: 'b', photos: [await ref(shot)] };
  const loser = { id: 'p1', updatedAt: 'a', photos: [shot] };
  const merged = await unionPhotoFields('projects', winner, loser);
  assert.equal(merged.photos.length, 1);
});

test('новый документ клиента с другого устройства не теряется', async () => {
  const winner = {
    id: 'c1',
    updatedAt: 'b',
    name: 'Аня (испр.)',
    documents: [{ id: 'd1', name: 'Согласие', fileUrl: photo(500, 'd1') }],
  };
  const loser = {
    id: 'c1',
    updatedAt: 'a',
    name: 'Аня',
    documents: [
      { id: 'd1', name: 'Согласие', fileUrl: photo(500, 'd1') },
      { id: 'd2', name: 'Эскиз', fileUrl: photo(500, 'd2') },
    ],
  };
  const merged = await unionPhotoFields('clients', winner, loser);
  assert.equal(merged.name, 'Аня (испр.)');
  assert.equal(merged.documents.length, 2);
  assert.ok(merged.documents.some((d) => d.id === 'd2'));
});

test('кадр заживления с одинаковым id — берётся версия победителя, не дублируется', () => {
  const winner = { id: 'p1', updatedAt: 'b', healingPhotos: [{ id: 'h1', day: 7, url: photo(500, 'new') }] };
  const loser = { id: 'p1', updatedAt: 'a', healingPhotos: [{ id: 'h1', day: 7, url: photo(500, 'old') }] };
  const merged = unionById(winner.healingPhotos, loser.healingPhotos);
  assert.equal(merged.length, 1);
  assert.ok(merged[0].url.includes('new'));
});

test('фото внутри одной и той же сессии на двух устройствах складываются', async () => {
  const winner = {
    id: 'p1',
    updatedAt: 'b',
    sessions: [{ id: 's1', notes: 'первый сеанс', photos: [photo(500, 'a')] }],
  };
  const loser = {
    id: 'p1',
    updatedAt: 'a',
    sessions: [{ id: 's1', notes: 'первый сеанс', photos: [photo(500, 'b')] }],
  };
  const merged = await unionPhotoFields('projects', winner, loser);
  assert.equal(merged.sessions[0].photos.length, 2);
});

test('сессия, которой нет у победителя, фото из неё не подмешиваются — это отдельная, более широкая проблема', async () => {
  // unionPhotoFields не решает «какие сессии есть» — только фото внутри
  // сессий, присутствующих по обе стороны. Документировано в самом коде.
  const winner = { id: 'p1', updatedAt: 'b', sessions: [] };
  const loser = { id: 'p1', updatedAt: 'a', sessions: [{ id: 's1', photos: [photo(500, 'x')] }] };
  const merged = await unionPhotoFields('projects', winner, loser);
  assert.deepEqual(merged.sessions, []);
});

test('движок сливает фото ДО выбора победителя целиком, в обе стороны', () => {
  const engine = readFileSync(new URL('../src/sync/syncEngine.ts', import.meta.url), 'utf8');
  assert.match(engine, /unionPhotoFields\(kind, record, localById\.get\(record\.id\)\)/);
  assert.match(engine, /unionPhotoFields\(kind, record, remoteById\.get\(record\.id\)\)/);
});
