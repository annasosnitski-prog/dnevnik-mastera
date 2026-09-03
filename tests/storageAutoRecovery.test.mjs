import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as recovery from '../.test-dist/src/lib/storageRecovery.js';
const diary = readFileSync(new URL('../src/components/TattoDiary.tsx', import.meta.url), 'utf8');

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
  const lost = diary.slice(diary.indexOf('const handleConnectionLost'), diary.indexOf('const withStorage'));
  assert.match(lost, /if \(isConnectionStable\(connectedAtRef\.current, Date\.now\(\)\)\) reconnectAttemptRef\.current = 0;/);
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
  const lost = diary.slice(diary.indexOf('const handleConnectionLost'), diary.indexOf('const withStorage'));
  assert.match(lost, /scheduleReconnect\(/);
  // Красной плашки в этом пути нет вовсе — только запись в журнал.
  assert.doesNotMatch(lost, /reportStorageFailure/);
  assert.match(lost, /logError\('storage'/);
});

test('every connection-loss path goes through the same self-repair', () => {
  // Транзакция, не открывшаяся на закрытом соединении, и упавшая фоновая
  // задача — это тот же обрыв, а не три разных аварии.
  assert.match(diary, /database\.onclose = \(\) => handleConnectionLost\(/);
  assert.match(diary, /catch \(err\) \{\s*handleConnectionLost\(action, err\);/);
  assert.match(diary, /if \(!\(err instanceof ContentJobDbUnavailableError\)\) return false;\s*handleConnectionLost\(/);
});

test('failures are silenced while self-repair is running, but still journalled', () => {
  const report = diary.slice(
    diary.indexOf('const reportStorageFailure'),
    diary.indexOf('const clearStorageFailure'),
  );
  // Журнал пишется всегда и первым — иначе разбирать сбой будет нечем.
  assert.ok(report.indexOf("logError('storage'") < report.indexOf('setDbError('));
  assert.match(report, /if \(recoveringRef\.current && kind !== 'conflicting'\) return;/);
});

test('returning to the app reconnects on its own — iOS closes the connection while asleep', () => {
  const resume = diary.slice(diary.indexOf('const onResume = () => {'), diary.indexOf("window.addEventListener('pageshow', onResume);"));
  assert.match(resume, /if \(dbRef\.current \|\| openInFlightRef\.current\) return;/);
  assert.match(resume, /connectDbRef\.current\(\)/);
});

test('nothing ever starts a second open on top of one already in flight', () => {
  const withStorage = diary.slice(diary.indexOf('const withStorage = ('), diary.indexOf('const connectDbRef'));
  assert.match(withStorage, /if \(!recoveringRef\.current && !openInFlightRef\.current\)/);
  const lost = diary.slice(diary.indexOf('const handleConnectionLost'), diary.indexOf('const withStorage'));
  assert.match(lost, /if \(recoveringRef\.current \|\| openInFlightRef\.current\) return;/);
});

test('writes attempted with no connection are queued, not lost', () => {
  const withStorage = diary.slice(diary.indexOf('const withStorage = ('), diary.indexOf('const connectDbRef'));
  assert.match(withStorage, /enqueuePendingWrite\(pendingWritesRef\.current/);
  assert.match(withStorage, /scheduleReconnect\(\)/);
  // Каждая запись дневника обязана идти через эту воронку, иначе она снова
  // тихо пропадёт при оборванной связи.
  for (const call of ['client:${client.id}', 'client-delete:${id}', 'projects', 'project-delete:${id}', 'content:${entry.id}', 'content-delete:${id}']) {
    assert.ok(diary.includes(`withStorage(\`${call}\``) || diary.includes(`withStorage('${call}'`), `нет withStorage для ${call}`);
  }
});

test('queued writes are replayed once the connection is back', () => {
  const connect = diary.slice(diary.indexOf('const connectDb = ('), diary.indexOf('const scheduleReconnect'));
  assert.match(connect, /flushPendingWrites\(database\)/);
  // Повтор идёт по СВЕЖЕМУ соединению, переданному параметром: замыкание
  // помнит своё db пустым — оно и создавалось, когда связи не было.
  assert.match(diary, /item\.run\(database\)/);
});

test('«Повторить» starts a fresh series even after automatic attempts ran out', () => {
  assert.match(diary, /if \(options\?\.manual\) reconnectAttemptRef\.current = 0;/);
  assert.match(diary, /onClick=\{\(\) => connectDb\(\{ manual: true \}\)\}/);
});

test('a second tab upgrading the schema still asks the master — self-repair cannot fix that', () => {
  const connect = diary.slice(diary.indexOf('const connectDb = ('), diary.indexOf('const scheduleReconnect'));
  assert.match(connect, /database\.onversionchange/);
  assert.match(connect, /reportStorageFailure\('conflicting'/);
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
