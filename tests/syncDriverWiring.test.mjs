import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function readSource(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n?/g, '\n');
}

const source = readSource('../src/sync/useSyncDriver.ts');
const timerEffect = source.slice(
  source.indexOf('  // Первый синк после запуска/привязки'),
  source.indexOf('  useEffect(() => {\n    const onResume'),
);

test('часовой таймер не перезапускается на переходе paired → syncing → paired', () => {
  assert.match(source, /const syncEnabled = phase === 'paired' \|\| phase === 'syncing';/);
  assert.match(timerEffect, /if \(!syncEnabled\)/);
  assert.match(timerEffect, /\}, \[syncEnabled\]\);/);
  assert.doesNotMatch(timerEffect, /\[phase === 'paired'\]/);
});

test('первый и ручной синк обновляют видимый экран только когда реально что-то приехало', () => {
  assert.match(source, /const pulledSomething =/);
  assert.match(source, /if \(refreshVisibleData && pulledSomething\) \{\s*window\.location\.reload\(\);/);
  assert.match(timerEffect, /void runSync\(true\);/);
  assert.match(timerEffect, /setInterval\(\(\) => void runSync\(false\), SYNC_INTERVAL_MS\)/);
  assert.match(source, /syncNow: \(\) => runSync\(true\)/);
});

test('runSync по-прежнему показывает syncing в UI и возвращает paired после завершения', () => {
  assert.match(source, /setPhase\('syncing'\);/);
  assert.match(source, /finally \{\s*syncingRef\.current = false;\s*setPhase\('paired'\);/);
});

test('переходник Supabase теперь ожидается асинхронно — он проверяет настоящую сессию', () => {
  assert.match(source, /const remote = await createSupabaseRemote\(client\);/);
});
