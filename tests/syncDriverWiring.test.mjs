import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function readSource(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n?/g, '\n');
}

const source = readSource('../src/sync/useSyncDriver.ts');
const timerEffect = source.slice(
  source.indexOf('  // ОТКРЫТИЕ ДНЕВНИКА СИНК НЕ ЗАПУСКАЕТ'),
  source.indexOf('  // Отметка, пережившая закрытие дневника'),
);

test('таймер не перезапускается на переходе paired → syncing → paired', () => {
  assert.match(source, /const syncEnabled = phase === 'paired' \|\| phase === 'syncing';/);
  assert.match(timerEffect, /if \(!syncEnabled\)/);
  assert.match(timerEffect, /\}, \[syncEnabled\]\);/);
  assert.doesNotMatch(timerEffect, /\[phase === 'paired'\]/);
});

test('экран перезагружается только после нажатой кнопки и только если что-то приехало', () => {
  assert.match(source, /const pulledSomething =/);
  assert.match(source, /if \(refreshVisibleData && pulledSomething\) \{\s*\n\s*window\.location\.reload\(\);/);
  // refreshVisibleData=true остался ровно у кнопки; повторяющаяся проверка
  // не имеет права внезапно перезагрузить дневник во время работы.
  assert.match(source, /syncNow: \(\) => runSync\(true\)/);
  assert.match(timerEffect, /setInterval\(\(\) => void runSync\(false\), SYNC_INTERVAL_MS\)/);
  assert.doesNotMatch(timerEffect, /void runSync\(true\)/);
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

test('оборванный прогон остаётся в журнале — это доказательство, что телефон не тянет синк', () => {
  assert.match(source, /const \[initialStaleSyncFlag\] = useState\(hasSyncInProgressFlag\);/);
  assert.match(source, /if \(!staleSyncFlagRef\.current\) return;\s*\n\s*staleSyncFlagRef\.current = false;\s*\n\s*clearSyncInProgressFlag\(\);/);
  assert.match(source, /onErrorLog\?\.\('', 'вкладка не пережила синхронизацию — прогон оборвался на середине'\);/);
});

test('открытие дневника синк не запускает — только таймер раз в шесть часов и кнопка', () => {
  // Полный прогон занимает главный поток на десятки секунд. Раньше он шёл и
  // при открытии, и при каждом возврате к вкладке (на телефоне это ещё и
  // каждое переключение приложения) — дневник тормозил ровно тогда, когда к
  // нему вернулись работать, а телефон успевал убить вкладку по памяти.
  assert.match(source, /const SYNC_INTERVAL_MS = 6 \* 60 \* 60 \* 1000;/);
  assert.doesNotMatch(timerEffect, /runSync\(true\)/);
  // Возврата к вкладке как повода для синка больше нет вовсе.
  assert.doesNotMatch(source, /visibilitychange', onResume/);
  assert.doesNotMatch(source, /lastSyncWithin/);
  // Кнопка — единственный способ синхронизироваться немедленно, и она
  // по-прежнему обновляет экран.
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
