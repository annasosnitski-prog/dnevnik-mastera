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
  assert.match(source, /finally \{\s*syncingRef\.current = false;[\s\S]*?setPhase\(\(current\) => \(current === 'syncing' \? 'paired' : current\)\);/);
});

test('отвязка во время синка не откатывается его завершением', () => {
  // Безусловный setPhase('paired') в finally возвращал устройство в
  // привязанные, если «Отвязать» нажали, пока синк ещё шёл: syncEnabled
  // снова становился true, таймер оживал, и отвязанный дневник продолжал
  // ходить в облако. Возврат разрешён только из самого 'syncing'.
  assert.match(source, /setPhase\(\(current\) => \(current === 'syncing' \? 'paired' : current\)\);/);
  assert.doesNotMatch(source, /finally \{\s*syncingRef\.current = false;\s*setPhase\('paired'\);/);
});

test('переходник Supabase теперь ожидается асинхронно — он проверяет настоящую сессию', () => {
  assert.match(source, /const remote = await createSupabaseRemote\(client\);/);
});

test('сбои синка попадают в журнал через onErrorLog, а не только в lastError', () => {
  // Раньше ошибка синка оседала только в lastError и пропадала вместе с
  // закрытой вкладкой — разобрать «у меня что-то упало» было нечем.
  assert.match(source, /onErrorLog\?: \(action: string, error: unknown\) => void,/);
  assert.match(source, /setLastError\(err instanceof Error \? err\.message : 'Не удалось синхронизироваться\.'\);\s*\n\s*onErrorLog\?\.\('', err\);/);
  assert.match(source, /setLastError\(err instanceof Error \? err\.message : 'Не удалось проверить привязку синка\.'\);\s*\n\s*onErrorLog\?\.\('проверка привязки', err\);/);
  assert.match(source, /setLastError\(message\);\s*\n\s*onErrorLog\?\.\('привязка устройства', message\);/);
});

test('защита от петли: отметка о прогоне снимается в finally, а не отдельной строкой после него', () => {
  // Успешный синк сам вызывает window.location.reload() и не доходит до кода
  // после try/catch/finally — снятие отметки ВНЕ finally оставило бы её
  // висеть навсегда и выключило бы автосинк насовсем.
  const runSyncBody = source.slice(source.indexOf('const runSync = useCallback('), source.indexOf("useEffect(() => {\n    if (phase !== 'checking')"));
  assert.match(runSyncBody, /syncingRef\.current = true;\s*\n\s*setSyncInProgressFlag\(\);/);
  assert.match(runSyncBody, /\} finally \{\s*\n\s*syncingRef\.current = false;[\s\S]*?clearSyncInProgressFlag\(\);/);
});

test('автозапуск пропускается, если отметка осталась от несостоявшегося прогона, но кнопка остаётся рабочей', () => {
  assert.match(source, /const \[initialStaleSyncFlag\] = useState\(hasSyncInProgressFlag\);/);
  assert.match(source, /if \(staleSyncFlagRef\.current\) \{\s*\n\s*staleSyncFlagRef\.current = false;\s*\n\s*clearSyncInProgressFlag\(\);/);
  assert.match(source, /\} else \{\s*\n\s*void runSync\(true\);\s*\n\s*\}/);
  // Часовой таймер заводится в обоих случаях — пропускается только сам
  // немедленный автозапуск, а не периодический синк вообще.
  assert.match(source, /onErrorLog\?\.\(\s*\n\s*'автозапуск',/);
});

test('повтор из #302 сузили до ошибок авторизации — любая другая ошибка не запускает прогон второй раз', () => {
  assert.match(source, /function isAuthPropagationFailure\(error: unknown\): boolean \{/);
  assert.match(source, /if \(!isAuthPropagationFailure\(err\)\) throw err;/);
});
