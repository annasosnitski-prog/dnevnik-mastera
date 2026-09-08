// ============================================================
// СОЕДИНЕНИЕ С INDEXEDDB — вынесено из TattoDiary.tsx (Шаг 1 разбора,
// docs/DATA_LAYER_PLAN.md, PR 1/7). Логика перенесена ДОСЛОВНО: то же
// открытие с таймаутом, та же тихая серия переподключений на паузах из
// lib/storageRecovery.ts, та же очередь отложенных записей. Ничего не
// улучшено попутно — само поведение уже проверено на телефоне мастера
// (PR #278, #281), и любое «заодно поправлю» здесь возвращает мигающую
// красную плашку, от которой избавлялись.
//
// В отличие от компонента, модуль ничего не знает про React: вместо
// setState — колбэки, на которые подписывается вызывающий код.
// ============================================================

import { ensureContentIngestJobStore } from '../lib/contentJobQueue.js';
import {
  enqueuePendingWrite,
  isConnectionStable,
  pendingWriteSummary,
  reconnectDelayMs,
  type PendingWrite,
  type StoragePhase,
} from '../lib/storageRecovery.js';
import { STORAGE_ACTIONS, type StorageFailureKind } from '../lib/storageMessages.js';

export type { StoragePhase, PendingWrite } from '../lib/storageRecovery.js';

// Сколько ждём ответа от indexedDB.open(), прежде чем считать попытку
// провалившейся и уйти на повтор.
const DB_OPEN_TIMEOUT_MS = 8000;

export const TATTO_DIARY_DB_NAME = 'TattoDiaryDB';

function openOnce(dbVersion: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(TATTO_DIARY_DB_NAME, dbVersion);
    // Промис обязан завершиться при любом исходе, иначе повторные попытки
    // ниже просто не начнутся. Два случая, в которых он раньше не
    // завершался никогда: открытие заблокировано другой вкладкой с этим же
    // дневником (onblocked, обработчика не было вовсе) и молчаливое
    // зависание open() на iOS, когда система усыпила приложение прямо во
    // время открытия — там не приходит вообще ни одного события.
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (run: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      run();
    };
    timer = setTimeout(() => finish(() => reject(new Error('IndexedDB open timed out'))), DB_OPEN_TIMEOUT_MS);
    request.onerror = () => finish(() => reject(request.error));
    request.onsuccess = () => {
      // Если open() всё-таки ответил уже после таймаута, соединение нужно
      // закрыть: иначе оно останется висеть и заблокирует следующую попытку.
      if (settled) {
        request.result.close();
        return;
      }
      finish(() => resolve(request.result));
    };
    request.onblocked = () => finish(() => reject(new Error('IndexedDB upgrade blocked')));
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('clients')) {
        db.createObjectStore('clients', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('projects')) {
        db.createObjectStore('projects', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('contentEntries')) {
        db.createObjectStore('contentEntries', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('masterInfo')) {
        db.createObjectStore('masterInfo', { keyPath: 'id' });
      }
      ensureContentIngestJobStore(db);
    };
  });
}

// iOS/WebKit sometimes fails the very first indexedDB.open() right after a
// cold launch (the storage subsystem isn't ready yet) — this is NOT the same
// as private browsing. A couple of quick retries clears up that transient
// case before we bother the user at all.
async function openWithRetry(dbVersion: number, attempts = 3, delayMs = 400): Promise<IDBDatabase> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await openOnce(dbVersion);
    } catch (err) {
      if (attempt === attempts) throw err;
      await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    }
  }
  throw new Error('unreachable');
}

export interface StorageConnectionCallbacks {
  // Фаза изменилась — ровно то, что видит мастер (connecting/ready/recovering/failed).
  onPhaseChange?: (phase: StoragePhase) => void;
  // Сбой, который нужно ПОКАЗАТЬ (плашка). Не вызывается, пока идёт тихое
  // восстановление — см. shouldSurfaceFailure ниже.
  onFailure?: (kind: StorageFailureKind, action: string, error?: unknown, extra?: string | null) => void;
  // Любой сбой, для журнала — вызывается ВСЕГДА, даже когда onFailure
  // подавлен тихим восстановлением.
  onErrorLog?: (action: string, error: unknown) => void;
  // Соединение только что открылось (или переоткрылось) успешно — самое
  // время убрать показанную ранее плашку о сбое.
  onConnected?: () => void;
}

export interface StorageConnection {
  connect(options?: { manual?: boolean }): void;
  // Единственный вход для любой записи. Есть связь — пишем; нет — откладываем
  // и чиним. Повторная запись с тем же key заменяет прежнюю в очереди, а не
  // копится (см. enqueuePendingWrite).
  write(key: string, action: string, run: (database: IDBDatabase) => void): void;
  // Открыть транзакцию на живом соединении. null, если соединения нет —
  // вызывающий код (репозиторий) просто ничего не делает, восстановление уже
  // идёт своим чередом.
  openTx(storeNames: string | string[], mode: IDBTransactionMode, action: string): IDBTransaction | null;
  // Сообщить о потере соединения из кода, который сам не проходит через
  // openTx/write — например contentJobQueue, у которого своя обёртка над
  // теми же object store'ами (см. ContentJobDbUnavailableError). Запускает
  // ту же тихую серию переподключений, что и внутренний обрыв.
  reportConnectionLost(action: string, error?: unknown): void;
  getPhase(): StoragePhase;
  getDatabase(): IDBDatabase | null;
  // Открытие (первое или очередная тихая попытка) уже идёт — вызывающая
  // сторона может решить не дублировать реакцию (например, resume-обработчик
  // не должен запускать вторую попытку поверх уже идущей).
  isOpening(): boolean;
  destroy(): void;
}

export function createStorageConnection(
  dbVersion: number,
  callbacks: StorageConnectionCallbacks = {},
): StorageConnection {
  let db: IDBDatabase | null = null;
  let phase: StoragePhase = 'connecting';
  let recovering = false;
  let reconnectAttempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let connectedAt: number | null = null;
  let openInFlight = false;
  let destroyed = false;
  let pendingWrites: PendingWrite[] = [];

  const setPhase = (next: StoragePhase) => {
    phase = next;
    callbacks.onPhaseChange?.(next);
  };

  // Единственная точка, где решаем, показывать ли сбой мастеру. Журнал
  // получает всё; плашка — только когда тихое восстановление уже не идёт
  // (иначе мастер видит череду разных сообщений про один и тот же обрыв,
  // который через полсекунды починится сам), кроме 'conflicting' — его
  // дневник сам не чинит.
  const reportFailure = (kind: StorageFailureKind, action: string, error?: unknown, extra?: string | null) => {
    callbacks.onErrorLog?.(action, error ?? kind);
    if (recovering && kind !== 'conflicting') return;
    callbacks.onFailure?.(kind, action, error, extra);
  };

  // Отложенные записи ложатся в базу в том же порядке, в каком мастер их
  // сделала. Падение одной не должно съесть остальные — поэтому каждая в
  // своём try.
  const flushPendingWrites = (database: IDBDatabase) => {
    const queued = pendingWrites;
    if (queued.length === 0) return;
    pendingWrites = [];
    queued.forEach((item) => {
      try {
        item.run(database);
      } catch (err) {
        callbacks.onErrorLog?.(item.action, err);
      }
    });
  };

  const handleConnectionLost = (action: string, error?: unknown) => {
    db = null;
    callbacks.onErrorLog?.(action, error ?? 'соединение с хранилищем закрыто');
    if (recovering || openInFlight) return;
    recovering = true;
    setPhase('recovering');
    // Обрыв после нормально прожившего соединения — повод начать серию
    // заново. Соединение, рухнувшее сразу после открытия, серию НЕ обнуляет
    // — иначе дневник вечно крутил бы «открылись — упали».
    if (isConnectionStable(connectedAt, Date.now())) reconnectAttempt = 0;
    connectedAt = null;
    scheduleReconnect(error);
  };

  const scheduleReconnect = (error?: unknown) => {
    const attempt = reconnectAttempt + 1;
    const delay = reconnectDelayMs(attempt);
    if (delay === null) {
      recovering = false;
      setPhase('failed');
      reportFailure('lost', STORAGE_ACTIONS.open, error, pendingWriteSummary(pendingWrites));
      return;
    }
    reconnectAttempt = attempt;
    recovering = true;
    setPhase('recovering');
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => connect(), delay);
  };

  const connect = (options?: { manual?: boolean }) => {
    if (destroyed) return;
    // «Повторить» руками — это всегда новая серия попыток, даже если
    // автоматические уже исчерпаны.
    if (options?.manual) reconnectAttempt = 0;
    clearTimeout(reconnectTimer);
    openInFlight = true;
    openWithRetry(dbVersion)
      .then((database) => {
        if (destroyed) {
          database.close();
          return;
        }
        openInFlight = false;
        recovering = false;
        reconnectAttempt = 0;
        connectedAt = Date.now();
        // db выставляется ДО setPhase/onConnected: колбэки читают текущую
        // базу через getDatabase(), и она обязана быть на месте уже в
        // момент, когда onPhaseChange('ready') долетает до подписчика.
        db = database;
        setPhase('ready');
        callbacks.onConnected?.();
        // Браузер может закрыть соединение сам (нехватка памяти), а другая
        // вкладка — начать обновление схемы. Первое дневник чинит сам;
        // второе — единственный случай, где без мастера не обойтись
        // (закрыть лишнюю вкладку).
        database.onclose = () => handleConnectionLost(STORAGE_ACTIONS.open);
        database.onversionchange = () => {
          database.close();
          db = null;
          recovering = false;
          setPhase('failed');
          reportFailure('conflicting', STORAGE_ACTIONS.open);
        };
        flushPendingWrites(database);
      })
      .catch((err) => {
        openInFlight = false;
        scheduleReconnect(err);
      });
  };

  // db.transaction() бросает исключение синхронно, если соединение уже
  // закрылось. Раньше это исключение никем не ловилось и роняло всё
  // приложение вместо понятной ошибки с «Повторить».
  const openTx = (storeNames: string | string[], mode: IDBTransactionMode, action: string): IDBTransaction | null => {
    if (!db) return null;
    try {
      return db.transaction(storeNames, mode);
    } catch (err) {
      handleConnectionLost(action, err);
      return null;
    }
  };

  const write = (key: string, action: string, run: (database: IDBDatabase) => void) => {
    if (db) {
      run(db);
      return;
    }
    pendingWrites = enqueuePendingWrite(pendingWrites, { key, action, run });
    if (!recovering && !openInFlight) {
      recovering = true;
      setPhase('recovering');
      reconnectAttempt = 0;
      scheduleReconnect();
    }
  };

  return {
    connect,
    write,
    openTx,
    reportConnectionLost: handleConnectionLost,
    getPhase: () => phase,
    getDatabase: () => db,
    isOpening: () => openInFlight,
    destroy: () => {
      destroyed = true;
      clearTimeout(reconnectTimer);
    },
  };
}
