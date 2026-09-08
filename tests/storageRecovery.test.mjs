import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Открытие базы и переподключение переехали из TattoDiary.tsx в
// src/storage/connection.ts (Шаг 2 разбора, docs/DATA_LAYER_PLAN.md) —
// логика та же, тесты здесь просто следуют за ней. Поведенческие тесты на
// эту же машинерию (на настоящей fake-indexeddb, не на тексте источника)
// см. tests/storageConnection.test.mjs.
const src = readFileSync(new URL('../src/storage/connection.ts', import.meta.url), 'utf8');
const openOnce = src.slice(src.indexOf('function openOnce'), src.indexOf('async function openWithRetry'));

// Открытие базы обязано завершаться при любом исходе: пока промис висит,
// повторные попытки (openWithRetry) не начинаются вообще, и приложение
// молча ждёт вечно — даже плашку с «Повторить» показать некому.
test('opening the database always settles: error, blocked upgrade and silent hang', () => {
  assert.match(openOnce, /request\.onerror = \(\) => finish\(/);
  assert.match(openOnce, /request\.onblocked = \(\) => finish\(/);
  assert.match(openOnce, /setTimeout\(\(\) => finish\(\(\) => reject\(/);
  assert.match(src, /const DB_OPEN_TIMEOUT_MS = \d+/);
});

test('a connection that arrives after the timeout is closed, not left dangling', () => {
  // Иначе забытое соединение заблокирует следующую попытку обновить схему.
  assert.match(openOnce, /if \(settled\) \{\s*request\.result\.close\(\);/);
});

test('a connection lost mid-session is noticed at once, not at the next write', () => {
  const connect = src.slice(src.indexOf('const connect = ('), src.indexOf('// db.transaction() бросает'));
  assert.match(connect, /database\.onclose = \(\)/);
  assert.match(connect, /database\.onversionchange = \(\)/);
  // Разница между двумя обрывами теперь принципиальная, и она здесь видна:
  // закрытое браузером соединение дневник чинит сам (handleConnectionLost →
  // тихие попытки), а обновление схемы из второй вкладки — единственный
  // случай, где без мастера не обойтись, и только он даёт плашку.
  assert.match(connect, /database\.onclose = \(\) => handleConnectionLost\(/);
  assert.match(connect, /reportFailure\('conflicting'/);
  assert.equal((connect.match(/db = null/g) ?? []).length, 1);
});
