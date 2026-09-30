import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function readSource(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n?/g, '\n');
}

const source = readSource('../src/sync/useSyncDriver.ts');
const timerEffect = source.slice(
  source.indexOf('  // Автозапуск при открытии'),
  source.indexOf('  // Возврат к вкладке'),
);
const resumeEffect = source.slice(
  source.indexOf('  // Возврат к вкладке'),
  source.indexOf('  // Отличаем «вкладку убило»'),
);

test('таймер не перезапускается на переходе paired → syncing → paired', () => {
  assert.match(source, /const syncEnabled = phase === 'paired' \|\| phase === 'syncing';/);
  assert.match(timerEffect, /if \(!syncEnabled\)/);
  assert.match(timerEffect, /\}, \[syncEnabled\]\);/);
  assert.doesNotMatch(timerEffect, /\[phase === 'paired'\]/);
});

test('экран перезагружается у кнопки и у автозапуска при открытии, но не у фоновых проверок, и только если что-то приехало', () => {
  assert.match(source, /const pulledSomething =/);
  assert.match(source, /if \(refreshVisibleData && pulledSomething\) \{\s*\n\s*window\.location\.reload\(\);/);
  assert.match(source, /syncNow: \(\) => runSync\(true\)/);
  // Автозапуск при открытии тоже обновляет экран (refreshVisibleData=true) —
  // мастер только что открыла дневник, реагировать на приехавшее уместно.
  assert.match(timerEffect, /void runSync\(true\);/);
  // А вот повторяющийся таймер и возврат к вкладке — с false: не имеют
  // права внезапно перезагрузить дневник во время работы.
  assert.match(timerEffect, /setInterval\(\(\) => void runSync\(false\), SYNC_INTERVAL_MS\)/);
  assert.match(resumeEffect, /void runSync\(false\);/);
  assert.doesNotMatch(resumeEffect, /runSync\(true\)/);
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

test('оборванный прогон пропускает автозапуск один раз и остаётся в журнале — доказательство, что телефон не тянет синк', () => {
  assert.match(source, /const \[initialStaleSyncFlag\] = useState\(hasSyncInProgressFlag\);/);
  assert.match(timerEffect, /if \(staleSyncFlagRef\.current\) \{\s*\n\s*staleSyncFlagRef\.current = false;\s*\n\s*clearSyncInProgressFlag\(\);/);
  assert.match(timerEffect, /onErrorLog\?\.\(\s*\n\s*'',\s*\n\s*'вкладка не пережила синхронизацию — прогон оборвался на середине; автозапуск пропущен',\s*\n\s*\);/);
  // Пропускается только САМ автозапуск — таймер заводится в любом случае, а
  // кнопка вообще ничем не ограничена.
  assert.match(timerEffect, /\} else if \(lastSyncOverdue\(SYNC_INTERVAL_MS\)\) \{/);
  assert.match(timerEffect, /timerRef\.current = setInterval/);
});

test('привязка устройства синхронизирует сразу, не дожидаясь автозапуска', () => {
  const pair = source.slice(source.indexOf('const pairWithCode = useCallback('), source.indexOf('const unpair = useCallback('));
  assert.match(pair, /setPhase\('paired'\);[\s\S]*?void runSync\(true\);\s*\n\s*return \{ ok: true \};/);
  // runSync обязан быть в зависимостях — иначе привязка звала бы устаревший
  // прогон, замкнутый на старое состояние.
  assert.match(pair, /\}, \[onErrorLog, runSync\]\);/);
});

test('автозапуск на открытии и на возврате к вкладке — но не чаще SYNC_INTERVAL_MS (lastSyncOverdue)', () => {
  // Раньше (до Шага 7, docs/SYNC_PLAN.md) полный прогон на каждое открытие
  // и каждый возврат к вкладке был небезопасен — держал в памяти всю
  // библиотеку разом и мог убить вкладку по памяти. Шаг 7 сделал решение
  // «что синкать» дешёвым и перенос — поштучным, так что автозапуск снова
  // безопасен; остаётся только не гонять его чаще, чем нужно для «пару раз
  // в сутки».
  assert.match(source, /const SYNC_INTERVAL_MS = 12 \* 60 \* 60 \* 1000;/);
  assert.match(source, /function lastSyncOverdue\(gapMs: number\): boolean \{/);
  assert.match(timerEffect, /else if \(lastSyncOverdue\(SYNC_INTERVAL_MS\)\) \{\s*\n\s*void runSync\(true\);/);
  assert.match(resumeEffect, /document\.addEventListener\('visibilitychange', onResume\);/);
  assert.match(resumeEffect, /if \(!lastSyncOverdue\(SYNC_INTERVAL_MS\)\) return;/);
  // Кнопка по-прежнему ничем не ограничена.
  assert.match(source, /syncNow: \(\) => runSync\(true\)/);
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
