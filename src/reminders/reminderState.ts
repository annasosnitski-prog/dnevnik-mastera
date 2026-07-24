// Состояние скрытых/отложенных напоминаний. Вынесено из TattoDiary.tsx
// (PR 5 рефакторинга) — доступ к localStorage и вся логика видимости здесь,
// компонент только держит стейт и рендерит.
//
// Чистые функции (normalize/is*/filter/dismiss/snooze/restore/removeExpired)
// не трогают localStorage и не мутируют вход — возвращают новое состояние.
// loadReminderState/saveReminderState — единственные точки доступа к
// localStorage (ключ тот же, что раньше).

export interface ReminderState {
  dismissedIds: string[]; // навсегда скрытые карточки (конкретный reminder-ключ)
  snoozed: Record<string, string>; // reminderId → showAfter (ISO); снова показать после этого момента
}

// Тот же ключ, что использовал прежний массив dismissedReminders, — так
// уже закрытые напоминания подхватываются без отдельной миграции.
const STORAGE_KEY = 'inka-dismissed-reminders';

// Приводит произвольное значение из localStorage к ReminderState. Принимает:
//  - новый объект { dismissedIds, snoozed };
//  - СТАРЫЙ формат — просто массив строк (прежний dismissedReminders);
//  - что угодно ещё / повреждённые данные → пустое состояние.
// Никогда не бросает. Ничего не теряет при апгрейде старого массива.
//
// Легаси-ключи вида `project:<id>` остаются в dismissedIds как есть: новый
// формат ключа проекта (PR #126, `project:<id>:project_action_due:…`) им не
// равен, поэтому старый ключ НЕ скрывает новые напоминания проекта. Удалять
// их не нужно (неразрушающая совместимость), а вреда они не наносят.
export function normalizeReminderState(raw: unknown): ReminderState {
  // Старый формат: массив строк.
  if (Array.isArray(raw)) {
    return { dismissedIds: raw.filter((x): x is string => typeof x === 'string'), snoozed: {} };
  }
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    const dismissedIds = Array.isArray(obj.dismissedIds)
      ? obj.dismissedIds.filter((x): x is string => typeof x === 'string')
      : [];
    const snoozed: Record<string, string> = {};
    if (obj.snoozed && typeof obj.snoozed === 'object') {
      for (const [k, v] of Object.entries(obj.snoozed as Record<string, unknown>)) {
        if (typeof v === 'string') snoozed[k] = v;
      }
    }
    return { dismissedIds, snoozed };
  }
  return { dismissedIds: [], snoozed: {} };
}

export function loadReminderState(): ReminderState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return normalizeReminderState(raw ? JSON.parse(raw) : null);
  } catch {
    return { dismissedIds: [], snoozed: {} };
  }
}

export function saveReminderState(state: ReminderState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function isReminderDismissed(state: ReminderState, key: string): boolean {
  return state.dismissedIds.includes(key);
}

// Отложено, если для ключа задан showAfter и он ещё не наступил.
export function isReminderSnoozed(state: ReminderState, key: string, now: Date): boolean {
  const showAfter = state.snoozed[key];
  if (!showAfter) return false;
  const at = new Date(showAfter).getTime();
  if (Number.isNaN(at)) return false; // повреждённый showAfter — считаем не отложенным
  return now.getTime() < at;
}

// Оставляет только те карточки, что не скрыты и не отложены на текущий момент.
export function filterVisibleReminders<T>(
  items: T[],
  keyOf: (item: T) => string,
  state: ReminderState,
  now: Date,
): T[] {
  return items.filter((item) => {
    const key = keyOf(item);
    return !isReminderDismissed(state, key) && !isReminderSnoozed(state, key, now);
  });
}

export function dismissReminder(state: ReminderState, key: string): ReminderState {
  if (state.dismissedIds.includes(key)) return state;
  return { ...state, dismissedIds: [...state.dismissedIds, key] };
}

// Отложить карточку до showAfter (ISO). Снимает возможное «скрыто» с этого же
// ключа — отложенное не должно быть одновременно и скрытым.
export function snoozeReminder(state: ReminderState, key: string, showAfter: string): ReminderState {
  return {
    dismissedIds: state.dismissedIds.filter((id) => id !== key),
    snoozed: { ...state.snoozed, [key]: showAfter },
  };
}

// Вернуть карточку: снять и «скрыто», и «отложено» для этого ключа.
export function restoreReminder(state: ReminderState, key: string): ReminderState {
  if (!state.dismissedIds.includes(key) && !(key in state.snoozed)) return state;
  const snoozed = { ...state.snoozed };
  delete snoozed[key];
  return { dismissedIds: state.dismissedIds.filter((id) => id !== key), snoozed };
}

// Убрать из хранилища истёкшие откладывания (showAfter уже прошёл) — они всё
// равно не влияют на видимость, чистка не даёт им копиться. Неразрушающе для
// активных данных.
export function removeExpiredSnoozes(state: ReminderState, now: Date): ReminderState {
  const nowMs = now.getTime();
  const kept: Record<string, string> = {};
  let changed = false;
  for (const [k, showAfter] of Object.entries(state.snoozed)) {
    const at = new Date(showAfter).getTime();
    if (!Number.isNaN(at) && nowMs < at) kept[k] = showAfter;
    else changed = true;
  }
  return changed ? { ...state, snoozed: kept } : state;
}
