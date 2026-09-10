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
  assert.match(source, /if \(refreshVisibleData && pulledSomething && !reloadedRecently\(\)\) \{/);
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
  // Часовой таймер заводится в обоих случаях — пропускается только сам
  // немедленный автозапуск, а не периодический синк вообще.
  assert.match(source, /onErrorLog\?\.\(\s*\n\s*'автозапуск',/);
});

test('автозапуск не повторяет полный прогон, если синк только что прошёл', () => {
  // В логах облака было пять полных прогонов за полторы минуты: дневник
  // почти всё время был занят синком, а не работой мастера.
  assert.match(source, /const AUTO_SYNC_MIN_GAP_MS = 5 \* 60 \* 1000;/);
  assert.match(source, /\} else if \(!lastSyncWithin\(AUTO_SYNC_MIN_GAP_MS\)\) \{\s*\n[\s\S]*?void runSync\(true\);/);
  // Кнопка и часовой таймер порогом не ограничены — синхронизироваться
  // принудительно можно всегда.
  assert.match(source, /syncNow: \(\) => runSync\(true\)/);
  assert.match(source, /setInterval\(\(\) => void runSync\(false\), SYNC_INTERVAL_MS\)/);
});

test('возврат к вкладке не запускает полный прогон, если синк только что прошёл', () => {
  const resume = source.slice(source.indexOf('const onResume = () => {'), source.indexOf('document.addEventListener(\'visibilitychange\', onResume)'));
  assert.match(resume, /if \(lastSyncWithin\(AUTO_SYNC_MIN_GAP_MS\)\) return;/);
  assert.match(resume, /void runSync\(false\);/);
});

test('перезагрузка ради показа приехавших данных не может уйти в круг', () => {
  // Если приехавшее почему-то не ложится в базу, следующий прогон привезёт
  // то же самое — и без этой отметки перезагружал бы страницу снова и снова.
  assert.match(source, /if \(refreshVisibleData && pulledSomething && !reloadedRecently\(\)\) \{\s*\n\s*rememberReload\(\);\s*\n\s*window\.location\.reload\(\);/);
  assert.match(source, /sessionStorage\.setItem\(RELOAD_GUARD_KEY, String\(Date\.now\(\)\)\)/);
});

test('штатный уход страницы не выдаётся за падение вкладки', () => {
  // Иначе журнал считал падением и закрытие дневника мастером, и нашу же
  // перезагрузку на новую версию — а синк идёт десятки секунд и стартует
  // сразу при открытии, так что попасть под это очень легко.
  assert.match(source, /const onLeave = \(\) => clearSyncInProgressFlag\(\);/);
  assert.match(source, /window\.addEventListener\('pagehide', onLeave\);/);
  // Заморозку с возвратом (уход в фон) падением тоже не считаем, но отметку
  // возвращаем: прогон продолжается, и его падение мы всё ещё хотим увидеть.
  assert.match(source, /if \(syncingRef\.current\) setSyncInProgressFlag\(\);/);
  assert.match(source, /window\.addEventListener\('pageshow', onRestore\);/);
  assert.match(source, /window\.removeEventListener\('pagehide', onLeave\);/);
  assert.match(source, /window\.removeEventListener\('pageshow', onRestore\);/);
});

test('повтор из #302 сузили до ошибок авторизации — любая другая ошибка не запускает прогон второй раз', () => {
  assert.match(source, /function isAuthPropagationFailure\(error: unknown\): boolean \{/);
  assert.match(source, /if \(!isAuthPropagationFailure\(err\)\) throw err;/);
});
