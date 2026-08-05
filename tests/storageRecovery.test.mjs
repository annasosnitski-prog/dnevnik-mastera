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

test('a connection lost mid-session surfaces the recoverable banner immediately', () => {
  const connect = diary.slice(diary.indexOf('const connectDb = ()'), diary.indexOf('useEffect(() => {\n    connectDb();'));
  assert.match(connect, /database\.onclose = \(\)/);
  assert.match(connect, /database\.onversionchange = \(\)/);
  // Сброс db — то, что показывает кнопку «Повторить» в плашке.
  assert.equal((connect.match(/setDb\(null\)/g) ?? []).length, 2);
});
