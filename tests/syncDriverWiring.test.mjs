import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function readSource(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n?/g, '\n');
}

const source = readSource('../src/sync/useSyncDriver.ts');
const app = readSource('../src/components/TattoDiary.tsx');
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
  assert.match(timerEffect, /setInterval\(\(\) => \{\s*if \(autoSyncLockedRef\.current\) return;\s*void runSync\(false\);\s*\}, SYNC_INTERVAL_MS\)/);
  assert.match(source, /syncNow: \(\) => runSync\(true\)/);
});

test('runSync по-прежнему показывает syncing в UI и возвращает paired после завершения', () => {
  assert.match(source, /setPhase\('syncing'\);/);
  assert.match(
    source,
    /finally \{[\s\S]*?syncingRef\.current = false;[\s\S]*?setPhase\(\(current\) => \(current === 'syncing' \? 'paired' : current\)\);/,
  );
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

// ─────────────── Журнал сбоев ───────────────
// Источник 'sync' в lib/errorLog.ts был объявлен, но logError('sync', ...)
// не вызывался нигде — сбои синка оседали только в lastError и пропадали
// при следующей перезагрузке. Теперь каждое место, где раньше был только
// setLastError, дублирует сбой в общий журнал через onErrorLog.

test('хук принимает необязательный колбэк журнала и называет действия по-русски', () => {
  assert.match(source, /onErrorLog\?: \(action: string, error: unknown\) => void/);
  assert.match(source, /import \{ SYNC_ACTIONS \} from '\.\/syncMessages\.js';/);
});

test('сбой самого прогона синка попадает в журнал', () => {
  assert.match(source, /onErrorLog\?\.\(SYNC_ACTIONS\.runSync, err\);/);
});

test('неудачная проверка привязки при запуске попадает в журнал', () => {
  const checkEffect = source.slice(source.indexOf("if (phase !== 'checking')"), source.indexOf('// Первый синк после запуска'));
  assert.match(checkEffect, /onErrorLog\?\.\(SYNC_ACTIONS\.checkPairing, err\);/);
});

test('неудачная привязка устройства попадает в журнал', () => {
  assert.match(source, /onErrorLog\?\.\(SYNC_ACTIONS\.pairDevice, result\.message \|\| message\);/);
});

test('TattoDiary передаёт в хук общий журнал с источником sync', () => {
  assert.match(
    app,
    /useSyncDriver\(\s*\(\) => connRef\.current\?\.getDatabase\(\) \?\? null,\s*\(action, error\) => logError\('sync', action, error\),\s*\);/,
  );
});

// ─────────────── Защита от петли падений ───────────────
// Реальный сюжет: полный прогон синка падал по памяти, Safari перезапускал
// вкладку, синк стартовал автоматически снова — и так по кругу, без единой
// записи в журнале (процесс исчезает, а не бросает исключение).

test('перед прогоном ставится отметка, а при завершении (успех и сбой) снимается', () => {
  assert.match(source, /localStorage\.setItem\(SYNC_STARTED_AT_KEY, new Date\(\)\.toISOString\(\)\)/);
  const setIdx = source.indexOf('localStorage.setItem(SYNC_STARTED_AT_KEY');
  const removeIndices = [...source.matchAll(/localStorage\.removeItem\(SYNC_STARTED_AT_KEY\)/g)].map((m) => m.index);
  assert.ok(setIdx > -1, 'отметка не ставится');
  // Три места снятия: обнаружение чужого падения на старте (до setIdx) плюс
  // сам прогон снимает дважды — до reload при успехе и в finally на случай
  // сбоя (оба после setIdx).
  assert.equal(removeIndices.length, 3, `ожидали три места снятия отметки, нашли ${removeIndices.length}`);
  assert.equal(
    removeIndices.filter((i) => i > setIdx).length,
    2,
    'внутри самого прогона отметка должна сниматься дважды: до reload и в finally',
  );
});

test('отметка снимается ДО window.location.reload(), а не только в finally после него', () => {
  // Критическая тонкость: полагаться на то, что finally после return успеет
  // отработать до реальной перезагрузки, нельзя — тогда каждая успешная
  // синхронизация с перезагрузкой выглядела бы как падение, и автосинк
  // отключился бы навсегда.
  const reloadIdx = source.indexOf('window.location.reload();');
  const removeIndices = [...source.matchAll(/localStorage\.removeItem\(SYNC_STARTED_AT_KEY\)/g)].map((m) => m.index);
  assert.ok(reloadIdx > -1);
  assert.ok(
    removeIndices.some((i) => i < reloadIdx),
    'отметка не снимается до reload()',
  );
});

test('при обнаружении чужого падения на старте: лочим автозапуск, объясняем в lastError, пишем в журнал', () => {
  const startupCheck = source.slice(source.indexOf('const decision = decideSyncStartup'), source.indexOf('const runSync = useCallback'));
  assert.match(startupCheck, /autoSyncLockedRef\.current = true;/);
  assert.match(startupCheck, /setLastError\(syncCrashExplanation\(decision\.startedAt\)\)/);
  assert.match(startupCheck, /onErrorLog\?\.\(SYNC_ACTIONS\.runSync, syncCrashLogMessage\(decision\.startedAt\)\)/);
});

test('замок блокирует три автоматических пути (первый синк, часовой таймер, возврат из фона), но не ручную кнопку', () => {
  assert.match(timerEffect, /if \(!autoSyncLockedRef\.current\) void runSync\(true\);/);
  assert.match(timerEffect, /if \(autoSyncLockedRef\.current\) return;/);
  assert.match(source, /if \(phase === 'paired' && !autoSyncLockedRef\.current\) void runSync\(false\);/);
  // syncNow ходит прямо в runSync без проверки замка — кнопка обязана
  // остаться рабочей.
  assert.match(source, /syncNow: \(\) => runSync\(true\)/);
});

test('любой настоящий прогон runSync снимает замок сам — ручная попытка не остаётся заблокированной навсегда', () => {
  const runSyncBody = source.slice(source.indexOf('const runSync = useCallback'), source.indexOf('useEffect(() => {\n    if (phase !== '));
  assert.match(runSyncBody, /autoSyncLockedRef\.current = false;/);
});

// ─────────────── Сужение повтора из PR #302 ───────────────
// Повтор заводили ради одного случая (401 сразу после входа). Тяжёлый
// прогон, упавший по ДРУГОЙ причине (например, по памяти), больше не
// запускается тут же второй раз.

test('повтор всего прогона случается только при ошибке, похожей на авторизационную', () => {
  assert.match(source, /import \{ isAuthLikeSyncError \} from '\.\/syncRetryPolicy\.js';/);
  assert.match(source, /catch \(err\) \{\s*if \(!isAuthLikeSyncError\(err\)\) throw err;/);
  // Старого безусловного повтора (голый catch без разбора причины) больше нет.
  assert.doesNotMatch(source, /\} catch \{\s*await new Promise\(\(resolve\) => setTimeout\(resolve, 1500\)\);/);
});
