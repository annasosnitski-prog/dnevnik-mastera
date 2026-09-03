// ============================================================
// КОГДА МОЖНО ПЕРЕЗАГРУЗИТЬ ДНЕВНИК ПОД НОВУЮ ВЕРСИЮ
//
// Обновляться дневник обязан: приложение с домашнего экрана неделями не
// перезагружается само, и без принудительной перезагрузки мастер месяцами
// сидит на старом бандле. Но перезагрузка — это ещё и «страница исчезла и
// собралась заново», и делать это когда попало нельзя:
//
//  1. Мастер заполняет форму. Перезагрузка стирает введённое. Она не поймёт,
//     что это «обновление», — она увидит, что дневник выбросил её текст.
//     Поэтому: пока открыта шторка/форма — ЖДЁМ. Новая версия не срочнее
//     недописанной заметки.
//
//  2. Перезагрузка может не помочь. Если сервер/кэш отдают старый index.html,
//     после перезагрузки __BUILD_ID__ останется прежним, version.json —
//     новым, и дневник перезагрузится снова. Прежняя защита (одна отметка
//     времени, окно в минуту) такой цикл не останавливала, а лишь растягивала
//     на минуту: раз в минуту приложение само себя перезапускало, вечно.
//     Ровно это мастер и описывает словами «он постоянно падает и
//     обновляется».
//
//     Поэтому считаем попытки ИМЕННО ПОД ЭТУ версию: две не помогли —
//     перестаём. Дневник остаётся рабочим на старой версии; это несравнимо
//     лучше, чем работающий по кругу перезапуск.
//
// Здесь только решение, без обращений к window/sessionStorage — чтобы его
// можно было проверить тестом, а не ловить на живом телефоне.
// ============================================================

// Минимальный промежуток между перезагрузками под одну и ту же версию.
export const UPDATE_RELOAD_GUARD_MS = 60_000;
// Сколько раз перезагружаемся ради одной версии, прежде чем признать, что
// перезагрузка не помогает.
export const UPDATE_RELOAD_MAX_ATTEMPTS = 2;

// Что мы уже пробовали. Живёт в sessionStorage: счётчик обязан пережить саму
// перезагрузку (иначе он всегда нулевой и никакой цикл не ловится) и обязан
// обнулиться, когда мастер откроет дневник заново.
export interface ReloadGuard {
  // Версия НА СЕРВЕРЕ, ради которой перезагружались.
  buildId: string;
  attempts: number;
  at: number;
}

export type UpdateDecision =
  // Уже на свежей версии — ничего не делаем.
  | { kind: 'up-to-date' }
  // Версия новая, но мастер сейчас работает: ждём, пока освободится.
  | { kind: 'defer' }
  // Перезагружаемся; guard — что записать перед этим.
  | { kind: 'reload'; guard: ReloadGuard }
  // Перезагрузка уже не помогла — больше не пытаемся.
  | { kind: 'give-up' };

export function decideUpdate(input: {
  currentBuildId: string;
  deployedBuildId: string;
  // Мастер заполняет форму / открыта шторка.
  busy: boolean;
  now: number;
  guard: ReloadGuard | null;
  maxAttempts?: number;
  guardMs?: number;
}): UpdateDecision {
  const { currentBuildId, deployedBuildId, busy, now, guard } = input;
  const maxAttempts = input.maxAttempts ?? UPDATE_RELOAD_MAX_ATTEMPTS;
  const guardMs = input.guardMs ?? UPDATE_RELOAD_GUARD_MS;

  if (!deployedBuildId || deployedBuildId === currentBuildId) return { kind: 'up-to-date' };

  // Отметка от другой версии не в счёт: та серия попыток закончилась тем,
  // что версия сменилась, и к нынешней отношения не имеет.
  const relevant = guard && guard.buildId === deployedBuildId ? guard : null;

  if (relevant && relevant.attempts >= maxAttempts) return { kind: 'give-up' };
  // Занятость проверяем ПОСЛЕ исчерпания попыток, но ДО паузы: пока мастер
  // печатает, ответ один и тот же независимо от того, сколько прошло времени.
  if (busy) return { kind: 'defer' };
  if (relevant && now - relevant.at < guardMs) return { kind: 'defer' };

  return {
    kind: 'reload',
    guard: { buildId: deployedBuildId, attempts: (relevant?.attempts ?? 0) + 1, at: now },
  };
}

export function parseReloadGuard(raw: string | null): ReloadGuard | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const { buildId, attempts, at } = parsed as Record<string, unknown>;
    if (typeof buildId !== 'string' || typeof attempts !== 'number' || typeof at !== 'number') return null;
    if (!Number.isFinite(attempts) || !Number.isFinite(at)) return null;
    return { buildId, attempts, at };
  } catch {
    return null;
  }
}

// Атрибут на <html>, которым дневник сообщает «мастер сейчас что-то
// заполняет». Через DOM, а не через React-контекст, потому что читает его
// код обновления из main.tsx — он живёт ВНЕ дерева React и обязан работать
// даже если дерево упало.
export const BUSY_ATTRIBUTE = 'data-inka-busy';

export function isBusy(root: { getAttribute(name: string): string | null } | null | undefined): boolean {
  return root?.getAttribute(BUSY_ATTRIBUTE) === '1';
}
