import assert from 'node:assert/strict';
import test from 'node:test';
import { indexedDB } from 'fake-indexeddb';

globalThis.indexedDB = indexedDB;

import { createStorageConnection, TATTO_DIARY_DB_NAME } from '../.test-dist/src/storage/connection.js';

const DB_VERSION = 1;

// Каждый тест открывает свежую базу — иначе версии/схемы тестов пересекались бы.
let dbCounter = 0;
function freshName() {
  dbCounter += 1;
  return `${TATTO_DIARY_DB_NAME}-test-${dbCounter}-${Date.now()}`;
}

function waitFor(predicate, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (predicate()) return resolve(undefined);
      if (Date.now() - start > timeoutMs) return reject(new Error('waitFor timed out'));
      setTimeout(tick, 5);
    };
    tick();
  });
}

// connection.ts жёстко использует имя TattoDiaryDB — подменяем глобальную
// indexedDB на обёртку с изоляцией по имени теста, не трогая сам модуль.
function isolatedIndexedDB(realName) {
  return {
    open(name, version) {
      return indexedDB.open(name === TATTO_DIARY_DB_NAME ? realName : name, version);
    },
    deleteDatabase(name) {
      return indexedDB.deleteDatabase(name === TATTO_DIARY_DB_NAME ? realName : name);
    },
  };
}

function withIsolatedDb(run) {
  const realName = freshName();
  const previous = globalThis.indexedDB;
  globalThis.indexedDB = isolatedIndexedDB(realName);
  return Promise.resolve()
    .then(run)
    .finally(() => {
      globalThis.indexedDB = previous;
    });
}

test('успешное подключение переходит в ready и создаёт сторы', () =>
  withIsolatedDb(async () => {
    const phases = [];
    const conn = createStorageConnection(DB_VERSION, {
      onPhaseChange: (p) => phases.push(p),
    });
    conn.connect();
    await waitFor(() => conn.getPhase() === 'ready');
    assert.equal(conn.getPhase(), 'ready');
    assert.ok(conn.getDatabase());
    assert.ok(conn.getDatabase().objectStoreNames.contains('clients'));
    assert.ok(conn.getDatabase().objectStoreNames.contains('projects'));
    assert.ok(conn.getDatabase().objectStoreNames.contains('contentEntries'));
    assert.ok(conn.getDatabase().objectStoreNames.contains('masterInfo'));
    assert.deepEqual(phases, ['ready']);
    conn.destroy();
  }));

test('запись без соединения откладывается и уходит в базу после подключения', () =>
  withIsolatedDb(async () => {
    const conn = createStorageConnection(DB_VERSION);
    let written = false;
    // Пишем ДО connect() — соединения ещё нет вообще.
    conn.write('client:1', 'сохранение клиента', (database) => {
      const tx = database.transaction('clients', 'readwrite');
      tx.objectStore('clients').put({ id: '1', name: 'Аня' });
      tx.oncomplete = () => {
        written = true;
      };
    });
    conn.connect();
    await waitFor(() => written);
    assert.equal(written, true);
    conn.destroy();
  }));

test('повторная запись с тем же ключом заменяет прежнюю в очереди, а не копится', () =>
  withIsolatedDb(async () => {
    const conn = createStorageConnection(DB_VERSION);
    const applied = [];
    conn.write('client:1', 'a', () => applied.push('first'));
    conn.write('client:1', 'a', () => applied.push('second'));
    conn.connect();
    await waitFor(() => applied.length > 0);
    // Даём событийному циклу устояться — вторая запись должна была
    // вытеснить первую, а не добавиться следом.
    await new Promise((r) => setTimeout(r, 20));
    assert.deepEqual(applied, ['second']);
    conn.destroy();
  }));

test('onConnected срабатывает один раз на подключение, до сброса отложенных записей', () =>
  withIsolatedDb(async () => {
    const order = [];
    const conn = createStorageConnection(DB_VERSION, {
      onConnected: () => order.push('connected'),
    });
    conn.write('client:1', 'a', () => order.push('flushed'));
    conn.connect();
    await waitFor(() => order.length >= 2);
    assert.deepEqual(order, ['connected', 'flushed']);
    conn.destroy();
  }));

test('openTx возвращает null, пока соединения нет, и не бросает исключение', () =>
  withIsolatedDb(async () => {
    const conn = createStorageConnection(DB_VERSION);
    assert.equal(conn.openTx('clients', 'readonly', 'x'), null);
    conn.connect();
    await waitFor(() => conn.getPhase() === 'ready');
    const tx = conn.openTx('clients', 'readonly', 'x');
    assert.ok(tx);
    conn.destroy();
  }));

test('обрыв соединения переводит фазу в recovering и пробует переподключиться сама', () =>
  withIsolatedDb(async () => {
    const phases = [];
    const conn = createStorageConnection(DB_VERSION, {
      onPhaseChange: (p) => phases.push(p),
    });
    conn.connect();
    await waitFor(() => conn.getPhase() === 'ready');
    // Симулируем обрыв, который браузер делает сам (нехватка памяти).
    conn.getDatabase().onclose();
    assert.equal(conn.getPhase(), 'recovering');
    await waitFor(() => conn.getPhase() === 'ready');
    // 'recovering' приходит дважды подряд — так же, как в исходном коде:
    // handleConnectionLost сам выставляет фазу, а затем зовёт scheduleReconnect,
    // которая делает то же самое перед первой тихой попыткой.
    assert.deepEqual(phases, ['ready', 'recovering', 'recovering', 'ready']);
    conn.destroy();
  }));

test('запись во время recovering уходит в очередь, а не теряется', () =>
  withIsolatedDb(async () => {
    const conn = createStorageConnection(DB_VERSION);
    conn.connect();
    await waitFor(() => conn.getPhase() === 'ready');
    conn.getDatabase().onclose();
    assert.equal(conn.getPhase(), 'recovering');

    let written = false;
    conn.write('client:1', 'сохранение клиента', (database) => {
      const tx = database.transaction('clients', 'readwrite');
      tx.objectStore('clients').put({ id: '1' });
      tx.oncomplete = () => {
        written = true;
      };
    });

    await waitFor(() => written);
    assert.equal(written, true);
    conn.destroy();
  }));

test('сбой при живой связи вызывает onFailure сразу (не откладывается)', () =>
  withIsolatedDb(async () => {
    const failures = [];
    const conn = createStorageConnection(DB_VERSION, {
      onFailure: (kind, action) => failures.push({ kind, action }),
    });
    conn.connect();
    await waitFor(() => conn.getPhase() === 'ready');
    conn.getDatabase().onversionchange();
    assert.equal(conn.getPhase(), 'failed');
    assert.deepEqual(failures, [{ kind: 'conflicting', action: 'подключение к хранилищу' }]);
    conn.destroy();
  }));

test('сбой во время тихого восстановления не показывает плашку, но пишет в журнал', () =>
  withIsolatedDb(async () => {
    const failures = [];
    const logs = [];
    const conn = createStorageConnection(DB_VERSION, {
      onFailure: (kind, action) => failures.push({ kind, action }),
      onErrorLog: (action, error) => logs.push({ action, error }),
    });
    conn.connect();
    await waitFor(() => conn.getPhase() === 'ready');
    conn.getDatabase().onclose();
    assert.equal(conn.getPhase(), 'recovering');
    // Пока идёт тихое восстановление, плашки быть не должно.
    assert.deepEqual(failures, []);
    assert.ok(logs.length >= 1);
    await waitFor(() => conn.getPhase() === 'ready');
    conn.destroy();
  }));
