// ============================================================
// СЛЕД УДАЛЕНИЯ — Шаг 2 синка (docs/SYNC_PLAN.md).
//
// Без него синк ломается предсказуемо: удалили клиента на телефоне, на
// планшете он остался — и первое же слияние вернёт его обратно. Для
// слияния «записи нет» ничем не отличается от «записи ещё не было», и
// оно честно считает, что у второго устройства она новее.
//
// ПОЧЕМУ ОТДЕЛЬНЫЙ СТОР, А НЕ ФЛАГ «удалено» НА САМОЙ ЗАПИСИ:
//
//  1. Ни одно чтение не нужно переучивать. Пометка на записи означала бы,
//     что каждое место, где дневник читает клиентов/проекты/контент,
//     обязано её отфильтровать — а забытый фильтр показывает мастеру
//     удалённую запись как живую.
//  2. Фото реально освобождаются. Они лежат base64-строками ВНУТРИ
//     записей (сотни мегабайт, см. историю переполнения хранилища),
//     и «удаление», которое ничего не освобождает, — не удаление.
//
// Плата за это: восстановить удалённое из самой отметки нельзя, в ней
// нет данных. Для этого есть резервная копия (backupArchive.ts).
//
// Ключ строки — "стор:id", поэтому повторное удаление той же записи
// заменяет отметку, а не копит вторую.
// ============================================================

export const DELETIONS_STORE = 'deletions';

// Сторы, удаления в которых имеет смысл переносить между устройствами.
export type DeletableStore = 'clients' | 'projects' | 'contentEntries';

export interface Tombstone {
  key: string;
  store: DeletableStore;
  id: string;
  deletedAt: string;
}

export function tombstoneKey(store: DeletableStore, id: string): string {
  return `${store}:${id}`;
}

// Пишется В ТОЙ ЖЕ транзакции, что и само удаление, — иначе возможно
// состояние «запись удалена, следа нет» (и синк вернёт её обратно) или
// «след есть, запись на месте» (и синк удалит её на другом устройстве).
// Поэтому транзакция вызывающей стороны обязана включать DELETIONS_STORE.
export function recordDeletion(
  tx: IDBTransaction,
  store: DeletableStore,
  id: string,
  now: () => string = () => new Date().toISOString(),
): void {
  const tombstone: Tombstone = {
    key: tombstoneKey(store, id),
    store,
    id,
    deletedAt: now(),
  };
  tx.objectStore(DELETIONS_STORE).put(tombstone);
}

export function getAllTombstones(tx: IDBTransaction): IDBRequest<Tombstone[]> {
  return tx.objectStore(DELETIONS_STORE).getAll();
}

// Запись вернулась к жизни (восстановление из копии, повторное создание с
// тем же id) — след обязан уйти, иначе синк удалит её снова.
export function forgetDeletion(tx: IDBTransaction, store: DeletableStore, id: string): void {
  tx.objectStore(DELETIONS_STORE).delete(tombstoneKey(store, id));
}
