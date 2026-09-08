// ============================================================
// СЫРЫЕ ОПЕРАЦИИ НАД СТОРОМ 'projects' — Шаг 4/7 разбора данных
// (docs/DATA_LAYER_PLAN.md). Тот же принцип, что и в clientsRepo.ts:
// репозиторий получает уже открытую транзакцию (openTx/openWriteTx из
// connection.ts сами решают, что делать при обрыве связи) и просто знает,
// как читать/писать/удалять в этом сторе.
// ============================================================

export function getAllProjects<T = unknown>(tx: IDBTransaction): IDBRequest<T[]> {
  return tx.objectStore('projects').getAll();
}

export function putProject<T extends { id: string }>(tx: IDBTransaction, record: T): void {
  tx.objectStore('projects').put(record);
}

export function deleteProjectRecord(tx: IDBTransaction, id: string): void {
  tx.objectStore('projects').delete(id);
}
