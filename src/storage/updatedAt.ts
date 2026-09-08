// ============================================================
// ОТМЕТКА ВРЕМЕНИ ПРАВКИ — Шаг 1 синка (docs/SYNC_PLAN.md).
//
// Слияние по записям (а его выбрали именно чтобы правка на телефоне не
// затирала правку на планшете) сравнивает записи попарно: у кого версия
// свежее, тот и прав. Сравнивать сегодня нечего — createdDate говорит,
// когда запись ЗАВЕЛИ, а `Project.lastMeaningfulActivityAt` намеренно не
// двигается на правке текста и фото (см. isMeaningfulProjectChange).
// Поэтому заводим отдельное поле, у которого ровно один смысл: когда эту
// запись последний раз записали в базу.
//
// Проставляется в одном месте на весь дневник — в put* репозиториев, — и
// поэтому не может «забыться» на новом месте записи. Ради этого и
// разбирали слой данных (docs/DATA_LAYER_PLAN.md): до него таких мест
// было двадцать.
// ============================================================

export interface WithUpdatedAt {
  updatedAt?: string;
}

// Восстановление из резервной копии — единственный случай, когда время
// правки НЕ «сейчас»: запись приехала из прошлого, и если проштамповать её
// текущим временем, она выиграет любое слияние и затрёт то, что на другом
// устройстве действительно новее.
export interface StampOptions {
  // Сохранить время правки, если оно уже есть в записи.
  preserveUpdatedAt?: boolean;
  // Только для тестов: детерминированное «сейчас».
  now?: () => string;
}

const defaultNow = () => new Date().toISOString();

export function stampUpdatedAt<T extends object>(record: T, options: StampOptions = {}): T & { updatedAt: string } {
  const now = options.now ?? defaultNow;
  if (!options.preserveUpdatedAt) {
    return { ...record, updatedAt: now() };
  }
  const existing = (record as WithUpdatedAt).updatedAt;
  if (existing) return record as T & { updatedAt: string };
  // Старая копия, сделанная до появления поля. «Сейчас» тут было бы
  // неправдой — эту запись никто только что не правил, а в слиянии она бы
  // победила свежие правки с другого устройства. Ближайшее известное
  // правдивое время — когда запись завели.
  const createdDate = (record as { createdDate?: unknown }).createdDate;
  return { ...record, updatedAt: typeof createdDate === 'string' && createdDate ? createdDate : now() };
}
