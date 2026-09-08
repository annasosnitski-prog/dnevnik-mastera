// ============================================================
// СЫРЫЕ ОПЕРАЦИИ НАД СТОРОМ 'contentEntries' — Шаг 5/7 разбора данных
// (docs/DATA_LAYER_PLAN.md). Тот же принцип, что и в clientsRepo.ts /
// projectsRepo.ts. Удаление сюда не входит: deleteContentEntry уже идёт
// через deleteContentEntryAndRefreshJobs (lib/contentJobQueue.ts) — она
// же снимает связанные фоновые задачи, и дублировать эту связку здесь
// значило бы развести два места, откуда контент можно удалить.
// ============================================================

import { stampUpdatedAt, type StampOptions } from '../updatedAt.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getAllContentEntries<T = any>(tx: IDBTransaction): IDBRequest<T[]> {
  return tx.objectStore('contentEntries').getAll();
}

// Время правки — здесь же (см. src/storage/updatedAt.ts, Шаг 1 синка).
export function putContentEntry<T extends { id: string }>(tx: IDBTransaction, record: T, options?: StampOptions): void {
  tx.objectStore('contentEntries').put(stampUpdatedAt(record, options));
}

// Только физическое удаление, БЕЗ следа — для движка синка (Шаг 5,
// docs/SYNC_PLAN.md), который применяет удаление, пришедшее из облака.
// Время в следе тогда обязано быть тем же, что и в облаке (когда там
// удалили), а не «сейчас» — иначе устройство, которое было офлайн неделю,
// перезаписало бы старый след свежим и следующее слияние решило бы, что
// удаление только что случилось здесь.
export function removeContentEntryRecordOnly(tx: IDBTransaction, id: string): void {
  tx.objectStore('contentEntries').delete(id);
}

// Стор целиком под замену — только полное восстановление из резервной
// копии (см. TattoDiary.tsx: replaceAllData).
export function clearContentEntries(tx: IDBTransaction): void {
  tx.objectStore('contentEntries').clear();
}
