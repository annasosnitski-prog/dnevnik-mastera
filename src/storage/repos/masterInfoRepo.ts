// ============================================================
// СЫРЫЕ ОПЕРАЦИИ НАД СТОРОМ MASTER_INFO_STORE — Шаг 6/7 разбора данных
// (docs/DATA_LAYER_PLAN.md). Один-единственный возможный ключ
// (MASTER_INFO_RECORD_ID) — не общий CRUD, а get/put ровно этой записи.
// ============================================================

import { MASTER_INFO_STORE, MASTER_INFO_RECORD_ID } from '../../lib/masterInfoStore.js';

export function getMasterInfoRecord<T = unknown>(tx: IDBTransaction): IDBRequest<T | undefined> {
  return tx.objectStore(MASTER_INFO_STORE).get(MASTER_INFO_RECORD_ID);
}

export function putMasterInfoRecord<T>(tx: IDBTransaction, value: T): void {
  tx.objectStore(MASTER_INFO_STORE).put({ ...value, id: MASTER_INFO_RECORD_ID });
}
