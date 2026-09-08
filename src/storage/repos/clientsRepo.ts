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

// Нормализация (см. src/lib/normalize.ts) остаётся заботой вызывающей
// стороны: она не про хранение, а про то, каким клиент должен выглядеть на
// экране. Репозиторий типом записи не сужает — что сюда передали, то и
// ляжет, как и в исходном tx.objectStore('clients').put(...).
export function getAllClients<T = unknown>(tx: IDBTransaction): IDBRequest<T[]> {
  return tx.objectStore('clients').getAll();
}

export function putClient<T extends { id: string }>(tx: IDBTransaction, record: T): void {
  tx.objectStore('clients').put(record);
}

export function deleteClientRecord(tx: IDBTransaction, id: string): void {
  tx.objectStore('clients').delete(id);
}
