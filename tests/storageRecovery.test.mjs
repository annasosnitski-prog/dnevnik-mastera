import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const diary = readFileSync(new URL('../src/components/TattoDiary.tsx', import.meta.url), 'utf8');
const initDb = diary.slice(diary.indexOf('const initDB = ('), diary.indexOf('const initDBWithRetry'));

// Открытие базы обязано завершаться при любом исходе: пока промис висит,
// повторные попытки (initDBWithRetry) не начинаются вообще, и приложение
// молча ждёт вечно — даже плашку с «Повторить» показать некому.
test('opening the database always settles: error, blocked upgrade and silent hang', () => {
  assert.match(initDb, /request\.onerror = \(\) => finish\(/);
  assert.match(initDb, /request\.onblocked = \(\) => finish\(/);
  assert.match(initDb, /setTimeout\(\(\) => finish\(\(\) => reject\(/);
  assert.match(diary, /const DB_OPEN_TIMEOUT_MS = \d+/);
});

test('a connection that arrives after the timeout is closed, not left dangling', () => {
  // Иначе забытое соединение заблокирует следующую попытку обновить схему.
  assert.match(initDb, /if \(settled\) \{\s*request\.result\.close\(\);/);
});

test('a connection lost mid-session is noticed at once, not at the next write', () => {
  const connect = diary.slice(diary.indexOf('const connectDb = ('), diary.indexOf('const scheduleReconnect'));
  assert.match(connect, /database\.onclose = \(\)/);
  assert.match(connect, /database\.onversionchange = \(\)/);
  // Разница между двумя обрывами теперь принципиальная, и она здесь видна:
  // закрытое браузером соединение дневник чинит сам (handleConnectionLost →
  // тихие попытки), а обновление схемы из второй вкладки — единственный
  // случай, где без мастера не обойтись, и только он даёт плашку.
  assert.match(connect, /database\.onclose = \(\) => handleConnectionLost\(/);
  assert.match(connect, /reportStorageFailure\('conflicting'/);
  assert.equal((connect.match(/setDb\(null\)/g) ?? []).length, 1);
});
