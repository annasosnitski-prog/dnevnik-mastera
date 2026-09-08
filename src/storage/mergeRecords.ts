// ============================================================
// СЛИЯНИЕ ЗАПИСЕЙ — Шаг 3 синка (docs/SYNC_PLAN.md).
//
// Чистая функция: на вход два набора (что лежит здесь и что лежит в
// облаке) плюс следы удалений с обеих сторон, на выход — что записать
// себе и что отправить туда. Ни IndexedDB, ни сети, ни React — поэтому
// её можно проверить тестами до того, как хоть один байт поедет в облако,
// и поэтому же она не зависит от того, какое облако выбрано.
//
// ПОЧЕМУ ПО ЗАПИСЯМ, А НЕ «ПОСЛЕДНИЙ ПОБЕЖДАЕТ» ПО ВСЕМУ НАБОРУ:
// утром на телефоне добавили сессию клиенту А, днём на планшете
// поправили телефон клиента Б. Победа «того, кто сохранял позже» целиком
// стёрла бы одну из двух правок, хотя они даже не пересекаются.
// ============================================================

export interface MergeableRecord {
  id: string;
  updatedAt?: string;
}

export interface MergeableTombstone {
  id: string;
  deletedAt: string;
}

export interface MergeInput<T extends MergeableRecord> {
  local: readonly T[];
  remote: readonly T[];
  localTombstones?: readonly MergeableTombstone[];
  remoteTombstones?: readonly MergeableTombstone[];
}

export interface MergeResult<T extends MergeableRecord> {
  // Положить к себе (новее в облаке или у нас этой записи нет).
  toWriteLocally: T[];
  // Удалить у себя: в облаке есть след удаления, и он новее нашей записи.
  toDeleteLocally: string[];
  // Отправить в облако (новее у нас или там этой записи нет).
  toPushRemotely: T[];
  // Отправить в облако следы удалений, о которых оно ещё не знает.
  tombstonesToPush: MergeableTombstone[];
  // Записать у себя следы удалений из облака — чтобы не отправить эти
  // записи обратно при следующем слиянии.
  tombstonesToStore: MergeableTombstone[];
}

// Запись без отметки времени — из времён до Шага 1. Считаем её самой
// старой из возможных: проиграет любой датированной. Врать в другую
// сторону опаснее — недатированная запись затирала бы свежие правки.
const OLDEST = '';

function timeOf(record: MergeableRecord): string {
  return record.updatedAt ?? OLDEST;
}

function byId<T extends { id: string }>(items: readonly T[]): Map<string, T> {
  return new Map(items.map((item) => [item.id, item]));
}

// Последний след удаления по каждому id: удалить запись могли на обоих
// устройствах, и важно самое позднее из этих событий.
function tombstonesById(items: readonly MergeableTombstone[]): Map<string, MergeableTombstone> {
  const map = new Map<string, MergeableTombstone>();
  for (const item of items) {
    const existing = map.get(item.id);
    if (!existing || item.deletedAt > existing.deletedAt) map.set(item.id, item);
  }
  return map;
}

export function mergeRecords<T extends MergeableRecord>(input: MergeInput<T>): MergeResult<T> {
  const local = byId(input.local);
  const remote = byId(input.remote);
  const localGraves = tombstonesById(input.localTombstones ?? []);
  const remoteGraves = tombstonesById(input.remoteTombstones ?? []);

  const result: MergeResult<T> = {
    toWriteLocally: [],
    toDeleteLocally: [],
    toPushRemotely: [],
    tombstonesToPush: [],
    tombstonesToStore: [],
  };

  const ids = new Set<string>([...local.keys(), ...remote.keys(), ...localGraves.keys(), ...remoteGraves.keys()]);

  for (const id of ids) {
    const here = local.get(id);
    const there = remote.get(id);
    const graveHere = localGraves.get(id);
    const graveThere = remoteGraves.get(id);

    // ── Удаление против правки ───────────────────────────────────────
    // Самый спорный случай синка: запись удалили на одном устройстве, а
    // на другом её в это время правили. Побеждает то, что случилось
    // ПОЗЖЕ, и при равенстве — правка.
    //
    // Почему при равенстве правка: потерять правку хуже, чем не удалить.
    // Лишняя запись видна мастеру, и её можно удалить ещё раз; пропавшая
    // правка не видна никак — о ней просто никто не узнает.
    const deletedHereAt = graveHere?.deletedAt ?? null;
    const deletedThereAt = graveThere?.deletedAt ?? null;

    // Запись жива там, но у нас на неё есть более поздний след удаления.
    if (there && deletedHereAt && deletedHereAt > timeOf(there)) {
      result.tombstonesToPush.push(graveHere!);
      continue;
    }
    // Запись жива у нас, но в облаке есть более поздний след удаления.
    if (here && deletedThereAt && deletedThereAt > timeOf(here)) {
      result.toDeleteLocally.push(id);
      result.tombstonesToStore.push(graveThere!);
      continue;
    }
    // Удалено с обеих сторон — расходиться не о чем, но следом надо
    // обменяться, чтобы обе стороны знали об удалении и не воскрешали.
    if (!here && !there) {
      if (deletedHereAt && !deletedThereAt) result.tombstonesToPush.push(graveHere!);
      if (deletedThereAt && !deletedHereAt) result.tombstonesToStore.push(graveThere!);
      continue;
    }

    // ── Обычное расхождение ──────────────────────────────────────────
    if (here && there) {
      const hereAt = timeOf(here);
      const thereAt = timeOf(there);
      // Одинаковое время — ничего не делаем: писать одно и то же поверх
      // самого себя незачем, а выбрать «правильную» сторону всё равно
      // нечем.
      if (thereAt > hereAt) result.toWriteLocally.push(there);
      else if (hereAt > thereAt) result.toPushRemotely.push(here);
      continue;
    }
    // Есть только у нас — и следа удаления в облаке нет (или он старее).
    if (here) {
      result.toPushRemotely.push(here);
      continue;
    }
    // Есть только там — и нашего следа удаления нет (или он старее).
    if (there) {
      result.toWriteLocally.push(there);
    }
  }

  return result;
}
