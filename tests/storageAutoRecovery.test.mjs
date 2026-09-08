import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as recovery from '../.test-dist/src/lib/storageRecovery.js';
const diary = readFileSync(new URL('../src/components/TattoDiary.tsx', import.meta.url), 'utf8');
// Открытие соединения и вся серия переподключений переехали в
// src/storage/connection.ts (Шаг 2 разбора, docs/DATA_LAYER_PLAN.md) —
// часть проверок ниже следует за ними туда.
const conn = readFileSync(new URL('../src/storage/connection.ts', import.meta.url), 'utf8');

// ── Паузы между тихими попытками ─────────────────────────────────────────

test('first retry is nearly immediate, later ones back off', () => {
  const first = recovery.reconnectDelayMs(1);
  const second = recovery.reconnectDelayMs(2);
  const third = recovery.reconnectDelayMs(3);
  assert.ok(first !== null && second !== null && third !== null);
  // Типичный случай — соединение закрылось, пока приложение спало, и
  // открывается сразу: первая попытка не должна стоить мастеру ожидания.
  assert.ok(first <= 300, `первая пауза ${first} мс слишком велика`);
  assert.ok(second > first);
  assert.ok(third > second);
});

test('silent retries are finite — otherwise a broken storage retries forever', () => {
  assert.equal(recovery.reconnectDelayMs(recovery.RECONNECT_SILENT_ATTEMPTS + 1), null);
});

test('a connection that dies right after opening does not restart the series forever', () => {
  const now = 1_000_000;
  // Открылось и тут же упало — серия продолжается, значит когда-нибудь
  // закончится плашкой, а не вечным кругом «открылись — упали».
  assert.equal(recovery.isConnectionStable(now - 50, now), false);
  assert.equal(recovery.isConnectionStable(null, now), false);
  // Связь была нормальной и оборвалась — это новый обрыв, новая серия.
  assert.equal(recovery.isConnectionStable(now - recovery.STABLE_CONNECTION_MS, now), true);
});

test('the diary only resets its attempt counter after a connection that actually held', () => {
  const lost = conn.slice(conn.indexOf('const handleConnectionLost'), conn.indexOf('const scheduleReconnect'));
  assert.match(lost, /if \(isConnectionStable\(connectedAt, Date\.now\(\)\)\) reconnectAttempt = 0;/);
});

// ── Когда мастер видит плашку ────────────────────────────────────────────

test('the red banner appears only after self-repair has given up', () => {
  assert.equal(recovery.shouldShowLostBanner('connecting'), false);
  assert.equal(recovery.shouldShowLostBanner('ready'), false);
  // Суть всей переделки: пока чиним сами — мастер ничего не видит.
  assert.equal(recovery.shouldShowLostBanner('recovering'), false);
  assert.equal(recovery.shouldShowLostBanner('failed'), true);
});

// ── Очередь отложенных записей ───────────────────────────────────────────

const write = (key, action = 'сохранение клиента') => ({ key, action, run: () => {} });

test('a write made while the connection is down is kept, not dropped', () => {
  const queue = recovery.enqueuePendingWrite([], write('client:1'));
  assert.equal(queue.length, 1);
  assert.equal(queue[0].key, 'client:1');
});

test('re-editing the same record replaces its queued write, keeping its place', () => {
  const first = { ...write('client:1'), action: 'первая правка' };
  const second = { ...write('client:1'), action: 'вторая правка' };
  const queue = recovery.enqueuePendingWrite(
    recovery.enqueuePendingWrite([write('projects')], first),
    second,
  );
  // Ровно две записи: стор проектов и клиент — а не три «версий клиента».
  assert.equal(queue.length, 2);
  assert.equal(queue[0].key, 'projects');
  assert.equal(queue[1].action, 'вторая правка');
});

test('order between different records is preserved — a project lands before content linking to it', () => {
  let queue = [];
  for (const key of ['projects', 'content:a', 'client:7']) {
    queue = recovery.enqueuePendingWrite(queue, write(key));
  }
  assert.deepEqual(queue.map((item) => item.key), ['projects', 'content:a', 'client:7']);
});

test('the queue is bounded and drops the oldest, not the newest', () => {
  let queue = [];
  for (let i = 0; i < recovery.PENDING_WRITE_LIMIT + 3; i++) {
    queue = recovery.enqueuePendingWrite(queue, write(`client:${i}`));
  }
  assert.equal(queue.length, recovery.PENDING_WRITE_LIMIT);
  // Свежая правка ценнее: её мастер только что сделала и помнит.
  assert.equal(queue[queue.length - 1].key, `client:${recovery.PENDING_WRITE_LIMIT + 2}`);
  assert.equal(queue[0].key, 'client:3');
});

test('the summary names the one lost operation, or counts several', () => {
  assert.equal(recovery.pendingWriteSummary([]), null);
  assert.match(recovery.pendingWriteSummary([write('client:1', 'сохранение клиента')]), /сохранение клиента/);
  assert.match(recovery.pendingWriteSummary([write('a'), write('b')]), /2/);
});

// ── Проводка в дневнике ──────────────────────────────────────────────────

test('a lost connection triggers self-repair instead of a banner', () => {
  const lost = conn.slice(conn.indexOf('const handleConnectionLost'), conn.indexOf('const scheduleReconnect'));
  assert.match(lost, /scheduleReconnect\(/);
  // Красной плашки в этом пути нет вовсе — только запись в журнал.
  assert.doesNotMatch(lost, /reportFailure\(/);
  assert.match(lost, /onErrorLog\?\.\(/);
});

test('every connection-loss path goes through the same self-repair', () => {
  // Транзакция, не открывшаяся на закрытом соединении — это обрыв,
  // обрабатываемый в connection.ts.
  assert.match(conn, /database\.onclose = \(\) => handleConnectionLost\(/);
  assert.match(conn, /catch \(err\) \{\s*handleConnectionLost\(action, err\);/);
  // Упавшая фоновая задача (contentJobQueue) сообщает об обрыве тем же
  // модулем, но из TattoDiary.tsx — у неё своя обёртка над теми же сторами.
  assert.match(diary, /if \(!\(err instanceof ContentJobDbUnavailableError\)\) return false;\s*connRef\.current!\.reportConnectionLost\(/);
});

test('failures are silenced while self-repair is running, but still journalled', () => {
  // Сторона connection.ts: обрыв/конфликт вкладок — суппрессия внутри
  // reportFailure, журнал (onErrorLog) пишется первым и всегда.
  const report = conn.slice(conn.indexOf('const reportFailure'), conn.indexOf('// Отложенные записи ложатся'));
  assert.ok(report.indexOf('onErrorLog?.(') < report.indexOf('onFailure?.('));
  assert.match(report, /if \(recovering && kind !== 'conflicting'\) return;/);

  // Сторона TattoDiary.tsx: прямые сбои чтения/записи (кроме потери связи)
  // используют тот же признак — текущую фазу соединения, а не свой счётчик.
  const componentReport = diary.slice(diary.indexOf('const reportStorageFailure'), diary.indexOf('// Падения, до которых'));
  assert.ok(componentReport.indexOf("logError('storage'") < componentReport.indexOf('showStorageFailure('));
  assert.match(componentReport, /if \(connRef\.current!\.getPhase\(\) === 'recovering' && kind !== 'conflicting'\) return;/);
});

test('returning to the app reconnects on its own — iOS closes the connection while asleep', () => {
  const resume = diary.slice(diary.indexOf('const onResume = () => {'), diary.indexOf("window.addEventListener('pageshow', onResume);"));
  assert.match(resume, /if \(connRef\.current!\.getDatabase\(\) \|\| connRef\.current!\.isOpening\(\)\) return;/);
  assert.match(resume, /connectDb\(\{ manual: true \}\)/);
});

test('nothing ever starts a second open on top of one already in flight', () => {
  const write = conn.slice(conn.indexOf('const write = ('), conn.indexOf('return {'));
  assert.match(write, /if \(!recovering && !openInFlight\)/);
  const lost = conn.slice(conn.indexOf('const handleConnectionLost'), conn.indexOf('const scheduleReconnect'));
  assert.match(lost, /if \(recovering \|\| openInFlight\) return;/);
});

test('writes attempted with no connection are queued, not lost', () => {
  const write = conn.slice(conn.indexOf('const write = ('), conn.indexOf('return {'));
  assert.match(write, /enqueuePendingWrite\(pendingWrites/);
  assert.match(write, /scheduleReconnect\(\)/);
  // Каждая запись дневника обязана идти через withStorage (тонкая обёртка
  // над connection.write), иначе она снова тихо пропадёт при оборванной связи.
  for (const call of ['client:${client.id}', 'client-delete:${id}', 'projects', 'project-delete:${id}', 'content:${entry.id}', 'content-delete:${id}']) {
    assert.ok(diary.includes(`withStorage(\`${call}\``) || diary.includes(`withStorage('${call}'`), `нет withStorage для ${call}`);
  }
});

test('queued writes are replayed once the connection is back', () => {
  const connect = conn.slice(conn.indexOf('const connect = ('), conn.indexOf('// db.transaction() бросает'));
  assert.match(connect, /flushPendingWrites\(database\)/);
  // Повтор идёт по СВЕЖЕМУ соединению, переданному параметром: замыкание
  // помнит своё db пустым — оно и создавалось, когда связи не было.
  assert.match(conn, /item\.run\(database\)/);
});

test('«Повторить» starts a fresh series even after automatic attempts ran out', () => {
  assert.match(conn, /if \(options\?\.manual\) reconnectAttempt = 0;/);
  assert.match(diary, /onClick=\{\(\) => connectDb\(\{ manual: true \}\)\}/);
});

test('a second tab upgrading the schema still asks the master — self-repair cannot fix that', () => {
  const connect = conn.slice(conn.indexOf('const connect = ('), conn.indexOf('// db.transaction() бросает'));
  assert.match(connect, /database\.onversionchange/);
  assert.match(connect, /reportFailure\('conflicting'/);
});

test('the calm «reconnecting» line waits, so a 150ms repair never flickers', () => {
  const block = diary.slice(diary.indexOf('const [recoveryVisible'), diary.indexOf('}, [storagePhase]);'));
  assert.match(block, /setTimeout\(\(\) => setRecoveryVisible\(true\), \d{4}\)/);
});

// ── Правильное имя операции в сообщении и в журнале ──────────────────────

test('saving a project reports «сохранение проекта», not «сохранение клиента»', () => {
  const writeProjects = diary.slice(diary.indexOf('const writeProjects = ('), diary.indexOf('// Записать один проект'));
  assert.match(writeProjects, /reportStorageFailure\('write', STORAGE_ACTIONS\.saveProject\)/);
  assert.doesNotMatch(writeProjects, /STORAGE_ACTIONS\.saveClient/);
});

test('saving content reports the content action, not the client one', () => {
  const saveContent = diary.slice(diary.indexOf('const saveContentEntry = ('), diary.indexOf('const deleteContentEntry = ('));
  assert.doesNotMatch(saveContent, /STORAGE_ACTIONS\.saveClient/);
  assert.match(saveContent, /STORAGE_ACTIONS\.saveContent/);
});

test('deleting a content entry with no connection no longer fails silently', () => {
  const del = diary.slice(diary.indexOf('const deleteContentEntry = ('), diary.indexOf('useEffect(() => {\n    if (!db) return;\n    return startContentIngestJobCoordinator'));
  assert.doesNotMatch(del, /if \(!db\) return;/);
  assert.match(del, /withStorage\(/);
});
