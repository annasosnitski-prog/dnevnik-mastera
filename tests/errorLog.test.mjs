import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ERROR_LOG_LIMIT,
  ERROR_MESSAGE_MAX,
  appendErrorEntry,
  describeError,
  parseErrorLog,
  formatErrorLog,
  errorSourceLabel,
} from '../.test-dist/src/lib/errorLog.js';

const entry = (over = {}) => ({
  at: '2026-08-14T10:00:00.000Z',
  source: 'storage',
  action: 'сохранение клиента',
  message: 'QuotaExceededError: нет места',
  ...over,
});

test('журнал не имеет права упасть сам — описывает что угодно', () => {
  assert.equal(describeError(null), 'неизвестная ошибка');
  assert.equal(describeError(undefined), 'неизвестная ошибка');
  assert.equal(describeError(''), 'неизвестная ошибка');
  assert.equal(describeError('просто текст'), 'просто текст');
  assert.equal(describeError(new Error('сломалось')), 'сломалось');
  assert.equal(describeError(new TypeError('не функция')), 'TypeError: не функция');
  assert.equal(describeError({ name: 'DOMException', message: 'закрыто' }), 'DOMException: закрыто');
  assert.match(describeError({ код: 7 }), /код/);
  assert.equal(describeError(42), '42');
});

test('длинные сообщения обрезаются — стек падения не должен занять весь журнал', () => {
  const long = describeError(new Error('x'.repeat(2000)));
  assert.ok(long.length <= ERROR_MESSAGE_MAX + 1, `длина ${long.length}`);
  assert.ok(long.endsWith('…'));
});

test('переводы строк схлопываются — одна запись остаётся одной строкой', () => {
  assert.equal(describeError('первая\n\nвторая   строка'), 'первая вторая строка');
});

test('новые записи сверху, длина ограничена', () => {
  let log = [];
  for (let i = 0; i < ERROR_LOG_LIMIT + 15; i += 1) {
    log = appendErrorEntry(log, entry({ message: `ошибка ${i}` }));
  }
  assert.equal(log.length, ERROR_LOG_LIMIT);
  assert.equal(log[0].message, `ошибка ${ERROR_LOG_LIMIT + 14}`, 'последняя — сверху');
});

test('зациклившийся сбой не вытесняет из журнала всю остальную историю', () => {
  // Иначе одна операция, падающая в цикле, за секунду затирает ровно ту
  // историю, ради которой журнал заведён.
  let log = appendErrorEntry([], entry({ message: 'важное раньше' }));
  for (let i = 0; i < 100; i += 1) {
    log = appendErrorEntry(log, entry({ message: 'повторяется', at: `2026-08-14T10:00:${String(i).padStart(2, '0')}.000Z` }));
  }
  assert.equal(log.length, 2);
  assert.equal(log[0].message, 'повторяется');
  assert.equal(log[0].at, '2026-08-14T10:00:99.000Z'.replace('99', '99'), 'время обновилось на последнее');
  assert.equal(log[1].message, 'важное раньше', 'прежняя история цела');
});

test('одинаковый текст из разных мест — разные записи', () => {
  let log = appendErrorEntry([], entry({ action: 'сохранение клиента' }));
  log = appendErrorEntry(log, entry({ action: 'сохранение проекта' }));
  assert.equal(log.length, 2);
});

test('чтение терпит мусор и не мешает запуску', () => {
  assert.deepEqual(parseErrorLog(null), []);
  assert.deepEqual(parseErrorLog('не json'), []);
  assert.deepEqual(parseErrorLog('{"не":"массив"}'), []);
  assert.deepEqual(parseErrorLog('[null, 42, "строка"]'), []);
});

test('чтение чинит повреждённые поля, а не выбрасывает запись целиком', () => {
  const parsed = parseErrorLog(JSON.stringify([{ at: '2026-08-14T10:00:00.000Z', message: 'текст', source: 'выдумка' }]));
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].source, 'storage');
  assert.equal(parsed[0].action, '');
});

test('журнал читается человеком и называет, что именно делал дневник', () => {
  const text = formatErrorLog([entry()]);
  assert.match(text, /хранилище/);
  assert.match(text, /сохранение клиента/);
  assert.match(text, /нет места/);
});

test('пустой журнал говорит об этом прямо', () => {
  assert.equal(formatErrorLog([]), 'Сбоев не записано.');
});

test('источники подписаны по-русски', () => {
  assert.equal(errorSourceLabel('storage'), 'хранилище');
  assert.equal(errorSourceLabel('crash'), 'сбой приложения');
  assert.equal(errorSourceLabel('promise'), 'фоновая задача');
  assert.equal(errorSourceLabel('sync'), 'синхронизация');
});
