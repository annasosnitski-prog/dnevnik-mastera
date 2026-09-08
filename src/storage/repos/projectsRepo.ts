// ============================================================
// СЫРЫЕ ОПЕРАЦИИ НАД СТОРОМ 'projects' — Шаг 4/7 разбора данных
// (docs/DATA_LAYER_PLAN.md). Тот же принцип, что и в clientsRepo.ts:
// репозиторий получает уже открытую транзакцию (openTx/openWriteTx из
// connection.ts сами решают, что делать при обрыве связи) и просто знает,
// как читать/писать/удалять в этом сторе.
// ============================================================

import { stampUpdatedAt, type StampOptions } from '../updatedAt.js';

export function getAllProjects<T = unknown>(tx: IDBTransaction): IDBRequest<T[]> {
  return tx.objectStore('projects').getAll();
}

// Время правки — здесь же, в единственной точке записи проекта (см.
// src/storage/updatedAt.ts, Шаг 1 синка). Это НЕ замена
// lastMeaningfulActivityAt: та про «последнее движение по работе» и
// намеренно молчит о правке текста и фото, а эта — про саму запись.
export function putProject<T extends { id: string }>(tx: IDBTransaction, record: T, options?: StampOptions): void {
  tx.objectStore('projects').put(stampUpdatedAt(record, options));
}

export function deleteProjectRecord(tx: IDBTransaction, id: string): void {
  tx.objectStore('projects').delete(id);
}

// Стор целиком под замену — только полное восстановление из резервной
// копии (см. TattoDiary.tsx: replaceAllData).
export function clearProjects(tx: IDBTransaction): void {
  tx.objectStore('projects').clear();
}
