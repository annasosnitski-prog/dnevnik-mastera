// ============================================================
// СЫРЫЕ ОПЕРАЦИИ НАД СТОРОМ MASTER_INFO_STORE — Шаг 6/7 разбора данных
// (docs/DATA_LAYER_PLAN.md). Один-единственный возможный ключ
// (MASTER_INFO_RECORD_ID) — не общий CRUD, а get/put ровно этой записи.
// ============================================================

import { MASTER_INFO_STORE, MASTER_INFO_RECORD_ID } from '../../lib/masterInfoStore.js';
import { stampUpdatedAt, type StampOptions } from '../updatedAt.js';

export function getMasterInfoRecord<T = unknown>(tx: IDBTransaction): IDBRequest<T | undefined> {
  return tx.objectStore(MASTER_INFO_STORE).get(MASTER_INFO_RECORD_ID);
}

// Время правки — здесь же (см. src/storage/updatedAt.ts, Шаг 1 синка).
export function putMasterInfoRecord<T>(tx: IDBTransaction, value: T, options?: StampOptions): void {
  tx.objectStore(MASTER_INFO_STORE).put(stampUpdatedAt({ ...value, id: MASTER_INFO_RECORD_ID }, options));
}
