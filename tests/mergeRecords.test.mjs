import assert from 'node:assert/strict';
import test from 'node:test';

import { mergeRecords } from '../.test-dist/src/storage/mergeRecords.js';

const rec = (id, updatedAt) => ({ id, updatedAt });
const grave = (id, deletedAt) => ({ id, deletedAt });

const T1 = '2026-01-01T00:00:00.000Z';
const T2 = '2026-02-01T00:00:00.000Z';
const T3 = '2026-03-01T00:00:00.000Z';

// ── Ради чего всё затевалось ─────────────────────────────────────────────

test('непересекающиеся правки на двух устройствах сохраняются обе', () => {
  // Утром на телефоне добавили сессию клиенту А, днём на планшете
  // поправили телефон клиента Б. «Последний побеждает» стёр бы одну.
  const out = mergeRecords({
    local: [rec('A', T2), rec('B', T1)],
    remote: [rec('A', T1), rec('B', T2)],
  });
  assert.deepEqual(out.toPushRemotely.map((r) => r.id), ['A']);
  assert.deepEqual(out.toWriteLocally.map((r) => r.id), ['B']);
});

test('одинаковое время — ничего не пишется в обе стороны', () => {
  const out = mergeRecords({ local: [rec('A', T1)], remote: [rec('A', T1)] });
  assert.deepEqual(out.toWriteLocally, []);
  assert.deepEqual(out.toPushRemotely, []);
});

test('новая запись уезжает туда, а незнакомая приезжает сюда', () => {
  const out = mergeRecords({ local: [rec('A', T1)], remote: [rec('B', T1)] });
  assert.deepEqual(out.toPushRemotely.map((r) => r.id), ['A']);
  assert.deepEqual(out.toWriteLocally.map((r) => r.id), ['B']);
});

// ── Удаления ─────────────────────────────────────────────────────────────

test('удалённое здесь удаляется и там — след уезжает', () => {
  const out = mergeRecords({
    local: [],
    remote: [rec('A', T1)],
    localTombstones: [grave('A', T2)],
  });
  assert.deepEqual(out.tombstonesToPush.map((t) => t.id), ['A']);
  assert.deepEqual(out.toWriteLocally, [], 'удалённая запись не должна вернуться');
});

test('удалённое там удаляется и здесь', () => {
  const out = mergeRecords({
    local: [rec('A', T1)],
    remote: [],
    remoteTombstones: [grave('A', T2)],
  });
  assert.deepEqual(out.toDeleteLocally, ['A']);
  assert.deepEqual(out.tombstonesToStore.map((t) => t.id), ['A']);
  assert.deepEqual(out.toPushRemotely, [], 'удалённая запись не должна уехать обратно');
});

test('без следа удаления запись, которой нет в облаке, просто уезжает туда', () => {
  // Это и есть та ошибка, ради которой заведён след: без него удаление
  // выглядит как «в облаке ещё нет этой записи».
  const out = mergeRecords({ local: [rec('A', T1)], remote: [] });
  assert.deepEqual(out.toPushRemotely.map((r) => r.id), ['A']);
  assert.deepEqual(out.toDeleteLocally, []);
});

test('удалено с обеих сторон — следом всё равно обмениваются', () => {
  const out = mergeRecords({
    local: [],
    remote: [],
    localTombstones: [grave('A', T1)],
  });
  assert.deepEqual(out.tombstonesToPush.map((t) => t.id), ['A']);
});

test('удалено с обеих сторон и обе знают — ничего не делается', () => {
  const out = mergeRecords({
    local: [],
    remote: [],
    localTombstones: [grave('A', T1)],
    remoteTombstones: [grave('A', T1)],
  });
  assert.deepEqual(out.tombstonesToPush, []);
  assert.deepEqual(out.tombstonesToStore, []);
});

// ── Удаление против правки: самый спорный случай ─────────────────────────

test('правка ПОЗЖЕ удаления — запись остаётся жить', () => {
  const out = mergeRecords({
    local: [rec('A', T3)],
    remote: [],
    remoteTombstones: [grave('A', T2)],
  });
  assert.deepEqual(out.toDeleteLocally, []);
  assert.deepEqual(out.toPushRemotely.map((r) => r.id), ['A']);
});

test('удаление ПОЗЖЕ правки — запись удаляется', () => {
  const out = mergeRecords({
    local: [rec('A', T1)],
    remote: [],
    remoteTombstones: [grave('A', T2)],
  });
  assert.deepEqual(out.toDeleteLocally, ['A']);
});

test('при равенстве времён побеждает правка, а не удаление', () => {
  // Потерять правку хуже, чем не удалить: лишняя запись видна и её можно
  // удалить ещё раз, а пропавшая правка не видна никак.
  const out = mergeRecords({
    local: [rec('A', T2)],
    remote: [],
    remoteTombstones: [grave('A', T2)],
  });
  assert.deepEqual(out.toDeleteLocally, []);
  assert.deepEqual(out.toPushRemotely.map((r) => r.id), ['A']);
});

// ── Записи без отметки времени (из времён до Шага 1) ──────────────────────

test('запись без отметки времени проигрывает датированной, а не затирает её', () => {
  const out = mergeRecords({
    local: [{ id: 'A' }],
    remote: [rec('A', T1)],
  });
  assert.deepEqual(out.toWriteLocally.map((r) => r.id), ['A']);
  assert.deepEqual(out.toPushRemotely, []);
});

test('две записи без отметки времени считаются равными — лишних записей нет', () => {
  const out = mergeRecords({ local: [{ id: 'A' }], remote: [{ id: 'A' }] });
  assert.deepEqual(out.toWriteLocally, []);
  assert.deepEqual(out.toPushRemotely, []);
});

test('запись без отметки удаляется, если есть след удаления', () => {
  const out = mergeRecords({
    local: [{ id: 'A' }],
    remote: [],
    remoteTombstones: [grave('A', T1)],
  });
  assert.deepEqual(out.toDeleteLocally, ['A']);
});

// ── Мелочи, которые ломают синк тихо ─────────────────────────────────────

test('из нескольких следов на один id берётся самый поздний', () => {
  const out = mergeRecords({
    local: [rec('A', T2)],
    remote: [],
    remoteTombstones: [grave('A', T1), grave('A', T3)],
  });
  assert.deepEqual(out.toDeleteLocally, ['A'], 'должен победить поздний след T3');
});

test('входные массивы не изменяются', () => {
  const local = [rec('A', T1)];
  const remote = [rec('B', T1)];
  mergeRecords({ local, remote });
  assert.deepEqual(local.map((r) => r.id), ['A']);
  assert.deepEqual(remote.map((r) => r.id), ['B']);
});

test('пустой вход даёт пустой результат, а не падение', () => {
  const out = mergeRecords({ local: [], remote: [] });
  assert.deepEqual(out.toWriteLocally, []);
  assert.deepEqual(out.toPushRemotely, []);
  assert.deepEqual(out.toDeleteLocally, []);
});
