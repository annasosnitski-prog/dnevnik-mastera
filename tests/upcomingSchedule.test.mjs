import assert from 'node:assert/strict';
import test from 'node:test';

import { buildUpcomingSchedule } from '../.test-dist/src/components/screens/upcomingSchedule.js';
import { formatDate } from '../.test-dist/src/utils/dates.js';

function makeItem(overrides = {}) {
  return {
    client: { id: 'client-1', name: 'Анна' },
    kind: 'session',
    id: 'item-1',
    date: '2026-08-10',
    time: '',
    ...overrides,
  };
}

// 1. Пустой список → пустой массив групп.
test('an empty list produces an empty array of groups', () => {
  assert.deepEqual(buildUpcomingSchedule([], '2026-08-07'), []);
});

// 2. Одна запись → одна группа.
test('a single item produces a single group', () => {
  const groups = buildUpcomingSchedule([makeItem()], '2026-08-07');
  assert.equal(groups.length, 1);
  assert.equal(groups[0].date, '2026-08-10');
  assert.equal(groups[0].items.length, 1);
});

// 3. Две записи одного дня → одна группа с двумя items.
test('two items on the same day land in one group with both items', () => {
  const items = [
    makeItem({ id: 'a', date: '2026-08-10' }),
    makeItem({ id: 'b', date: '2026-08-10' }),
  ];
  const groups = buildUpcomingSchedule(items, '2026-08-07');
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].items.map((i) => i.id), ['a', 'b']);
});

// 4. Записи разных дней → отдельные группы.
test('items on different days produce separate groups', () => {
  const items = [
    makeItem({ id: 'a', date: '2026-08-10' }),
    makeItem({ id: 'b', date: '2026-08-11' }),
  ];
  const groups = buildUpcomingSchedule(items, '2026-08-07');
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((g) => g.date), ['2026-08-10', '2026-08-11']);
});

// 5. Порядок групп соответствует входному хронологическому порядку —
// buildUpcomingSchedule не пересортировывает, только группирует в порядке
// первого появления даты во входном массиве (который уже отсортирован
// upcomingItems).
test('group order follows the input order, not a re-sort', () => {
  const items = [
    makeItem({ id: 'a', date: '2026-08-12' }),
    makeItem({ id: 'b', date: '2026-08-09' }),
    makeItem({ id: 'c', date: '2026-08-20' }),
  ];
  const groups = buildUpcomingSchedule(items, '2026-08-07');
  assert.deepEqual(groups.map((g) => g.date), ['2026-08-12', '2026-08-09', '2026-08-20']);
});

// 6. Порядок элементов внутри одного дня не меняется.
test('item order within a day is preserved exactly as given', () => {
  const items = [
    makeItem({ id: 'third', date: '2026-08-10', time: '18:00' }),
    makeItem({ id: 'first', date: '2026-08-10', time: '09:00' }),
    makeItem({ id: 'second', date: '2026-08-10', time: '12:00' }),
  ];
  const groups = buildUpcomingSchedule(items, '2026-08-07');
  assert.deepEqual(groups[0].items.map((i) => i.id), ['third', 'first', 'second']);
});

// 7. Сегодня получает label «Сегодня».
test('the day matching `today` gets the label "Сегодня"', () => {
  const groups = buildUpcomingSchedule([makeItem({ date: '2026-08-07' })], '2026-08-07');
  assert.equal(groups[0].label, 'Сегодня');
});

// 8. Завтра получает label «Завтра».
test('the next calendar day gets the label "Завтра"', () => {
  const groups = buildUpcomingSchedule([makeItem({ date: '2026-08-08' })], '2026-08-07');
  assert.equal(groups[0].label, 'Завтра');
});

// 9. Другая дата получает formatDate.
test('any other date gets the existing human-readable formatDate label', () => {
  const groups = buildUpcomingSchedule([makeItem({ date: '2026-08-12' })], '2026-08-07');
  assert.equal(groups[0].label, formatDate('2026-08-12'));
  assert.equal(groups[0].label, '12 авг 2026');
});

// 10. Переход через конец месяца корректен: сегодня 2026-08-31, завтра
// 2026-09-01 — через полноценный Date-рассчёт, не наивный getDate()+1.
test('month-end rollover: today 2026-08-31 → tomorrow is 2026-09-01', () => {
  const groups = buildUpcomingSchedule([makeItem({ date: '2026-09-01' })], '2026-08-31');
  assert.equal(groups[0].label, 'Завтра');
});

// 11. Переход через конец года корректен: сегодня 2026-12-31, завтра
// 2027-01-01.
test('year-end rollover: today 2026-12-31 → tomorrow is 2027-01-01', () => {
  const groups = buildUpcomingSchedule([makeItem({ date: '2027-01-01' })], '2026-12-31');
  assert.equal(groups[0].label, 'Завтра');
});

// 12. Session и consultation сохраняют свой kind.
test('session and consultation items keep their own kind', () => {
  const items = [
    makeItem({ id: 'a', kind: 'session', date: '2026-08-10' }),
    makeItem({ id: 'b', kind: 'consultation', date: '2026-08-10' }),
  ];
  const groups = buildUpcomingSchedule(items, '2026-08-07');
  const byId = Object.fromEntries(groups[0].items.map((i) => [i.id, i.kind]));
  assert.deepEqual(byId, { a: 'session', b: 'consultation' });
});

// 13/14. Ни один item не теряется и не дублируется — общее число items во
// всех группах равно длине входного массива, и каждый id встречается ровно
// один раз.
test('no item is lost or duplicated across groups', () => {
  const items = [
    makeItem({ id: 'a', date: '2026-08-10' }),
    makeItem({ id: 'b', date: '2026-08-10' }),
    makeItem({ id: 'c', date: '2026-08-11' }),
    makeItem({ id: 'd', date: '2026-08-12' }),
  ];
  const groups = buildUpcomingSchedule(items, '2026-08-07');
  const allIds = groups.flatMap((g) => g.items.map((i) => i.id));
  assert.equal(allIds.length, items.length);
  assert.deepEqual(new Set(allIds), new Set(items.map((i) => i.id)));
});

// 15. Входной массив не мутируется.
test('does not mutate the input items array', () => {
  const items = [
    makeItem({ id: 'a', date: '2026-08-10' }),
    makeItem({ id: 'b', date: '2026-08-11' }),
  ];
  const before = JSON.parse(JSON.stringify(items));
  buildUpcomingSchedule(items, '2026-08-07');
  assert.deepEqual(items, before);
});
