// ============================================================
// СЫРЫЕ ОПЕРАЦИИ НАД СТОРОМ 'clients' — Шаг 3/7 разбора данных
// (docs/DATA_LAYER_PLAN.md).
//
// Репозиторий не решает, что делать при обрыве связи — это по-прежнему
// работа connection.ts (openTx/openWriteTx уже возвращают null и сами
// запускают восстановление, если соединение упало). Репозиторий получает
// уже открытую транзакцию и просто знает, как читать/писать/удалять в
// этом сторе — раньше эти три строки были размазаны по TattoDiary.tsx
// вперемешку с состоянием React и синком календаря.
// ============================================================

import { stampUpdatedAt, type StampOptions } from '../updatedAt.js';
import { recordDeletion } from './tombstonesRepo.js';

// Нормализация (см. src/lib/normalize.ts) остаётся заботой вызывающей
// стороны: она не про хранение, а про то, каким клиент должен выглядеть на
// экране. Репозиторий типом записи не сужает — что сюда передали, то и
// ляжет, как и в исходном tx.objectStore('clients').put(...).
export function getAllClients<T = unknown>(tx: IDBTransaction): IDBRequest<T[]> {
  return tx.objectStore('clients').getAll();
}

// Время правки проставляется здесь, а не на вызывающей стороне: это
// единственная точка записи клиента, и поэтому отметка не может забыться
// в новом месте (см. src/storage/updatedAt.ts, Шаг 1 синка).
export function putClient<T extends { id: string }>(tx: IDBTransaction, record: T, options?: StampOptions): void {
  tx.objectStore('clients').put(stampUpdatedAt(record, options));
}

// Удаление и его след — ОДНОЙ транзакцией (Шаг 2 синка). Поэтому
// вызывающая сторона обязана открыть её и на DELETIONS_STORE: иначе
// возможно «запись удалена, следа нет», и первое же слияние вернёт её
// с другого устройства обратно.
export function deleteClientRecord(tx: IDBTransaction, id: string): void {
  tx.objectStore('clients').delete(id);
  recordDeletion(tx, 'clients', id);
}

// Только физическое удаление, БЕЗ следа — для движка синка (Шаг 5,
// docs/SYNC_PLAN.md), который применяет удаление, пришедшее из облака.
// Время в следе тогда обязано быть тем же, что и в облаке (когда там
// удалили), а не «сейчас» — иначе устройство, которое было офлайн неделю,
// перезаписало бы старый след свежим и следующее слияние решило бы, что
// удаление только что случилось здесь.
export function removeClientRecordOnly(tx: IDBTransaction, id: string): void {
  tx.objectStore('clients').delete(id);
}

// Стор целиком под замену — только полное восстановление из резервной
// копии (см. TattoDiary.tsx: replaceAllData).
export function clearClients(tx: IDBTransaction): void {
  tx.objectStore('clients').clear();
}
