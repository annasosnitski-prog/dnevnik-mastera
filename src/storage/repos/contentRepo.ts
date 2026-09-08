// ============================================================
// СЫРЫЕ ОПЕРАЦИИ НАД СТОРОМ 'contentEntries' — Шаг 5/7 разбора данных
// (docs/DATA_LAYER_PLAN.md). Тот же принцип, что и в clientsRepo.ts /
// projectsRepo.ts. Удаление сюда не входит: deleteContentEntry уже идёт
// через deleteContentEntryAndRefreshJobs (lib/contentJobQueue.ts) — она
// же снимает связанные фоновые задачи, и дублировать эту связку здесь
// значило бы развести два места, откуда контент можно удалить.
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getAllContentEntries<T = any>(tx: IDBTransaction): IDBRequest<T[]> {
  return tx.objectStore('contentEntries').getAll();
}

export function putContentEntry<T extends { id: string }>(tx: IDBTransaction, record: T): void {
  tx.objectStore('contentEntries').put(record);
}

// Стор целиком под замену — только полное восстановление из резервной
// копии (см. TattoDiary.tsx: replaceAllData).
export function clearContentEntries(tx: IDBTransaction): void {
  tx.objectStore('contentEntries').clear();
}
