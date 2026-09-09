// ============================================================
// СЫРЫЕ ОПЕРАЦИИ НАД СТОРОМ MASTER_INFO_STORE — Шаг 6/7 разбора данных
// (docs/DATA_LAYER_PLAN.md). Один-единственный возможный ключ
// (MASTER_INFO_RECORD_ID) — не общий CRUD, а get/put ровно этой записи.
// ============================================================

import { MASTER_INFO_STORE, MASTER_INFO_RECORD_ID, normalizeMasterInfo } from '../../lib/masterInfoStore.js';
import { stampUpdatedAt, type StampOptions } from '../updatedAt.js';

export function getMasterInfoRecord<T = unknown>(tx: IDBTransaction): IDBRequest<T | undefined> {
  return tx.objectStore(MASTER_INFO_STORE).get(MASTER_INFO_RECORD_ID);
}

function sameMasterInfo(a: unknown, b: unknown): boolean {
  // Сравниваем НОРМАЛИЗОВАННОЕ содержимое, а не технические поля записи.
  // Иначе чтение карточки из IndexedDB -> normalizeMasterInfo() в React ->
  // обычный persist-effect тут же выглядело бы как новая правка только потому,
  // что из state исчезли id/updatedAt. Это давало карточке мастера свежий
  // updatedAt при каждом запуске приложения и ломало latest-wins между
  // устройствами: старый кабинет мог победить новый просто потому, что его
  // устройство открыли последним.
  return JSON.stringify(normalizeMasterInfo(a)) === JSON.stringify(normalizeMasterInfo(b));
}

// Время правки — здесь же (см. src/storage/updatedAt.ts, Шаг 1 синка).
export function putMasterInfoRecord<T>(tx: IDBTransaction, value: T, options?: StampOptions): void {
  const store = tx.objectStore(MASTER_INFO_STORE);
  const record = { ...value, id: MASTER_INFO_RECORD_ID };

  // Восстановление/синк намеренно несут своё updatedAt: их нужно положить
  // дословно, не сравнивая с текущей карточкой и не превращая время в «сейчас».
  if (options?.preserveUpdatedAt) {
    store.put(stampUpdatedAt(record, options));
    return;
  }

  // Обычная запись сначала проверяет, изменилось ли СОДЕРЖИМОЕ. Транзакция
  // остаётся активной, пока выполняется get(); put из onsuccess относится к
  // той же транзакции. Если данные те же, вообще ничего не пишем и сохраняем
  // прежний updatedAt.
  const currentRequest = store.get(MASTER_INFO_RECORD_ID);
  currentRequest.onsuccess = () => {
    const current = currentRequest.result;
    if (current && sameMasterInfo(current, record)) return;
    store.put(stampUpdatedAt(record, options));
  };
}
