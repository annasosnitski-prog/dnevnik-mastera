// Чистая view-model группировки напоминаний в Админке (M5A). Никакой новой
// бизнес-логики и никаких новых типов напоминаний — только то, в каком
// порядке и под каким заголовком показывать уже отфильтрованные видимые
// списки, которые RemindersSection и так получает пропсами. Что именно
// считается «просрочено»/«скоро»/«застой» и т.д. по-прежнему решают
// buildReminders/buildTaskReminders — сюда приходят только их готовые
// результаты, посчитанные снаружи.

export type ReminderGroupId = 'action' | 'tasks' | 'soon' | 'healing' | 'stale';

export interface ReminderGroupDef {
  id: ReminderGroupId;
  title: string;
  // Состояние по умолчанию при первом появлении группы на экране —
  // не персистентное (не пишется в IndexedDB/localStorage), только
  // начальное значение локального React state секции.
  defaultOpen: boolean;
}

// Порядок фиксирован (M5A, п. 2) — от того, что требует немедленного
// действия, к мягким долгосрочным сигналам. «Требует действия» объединяет
// overdue + overdueProjectSessions + dueProjects — все три уже сегодня
// показывают конкретную, а не мягкую просрочку. staleProjects сознательно
// в эту группу не входит — у застывшего проекта нет конкретного
// просроченного действия, это отдельный, более мягкий сигнал (группа 5).
export const REMINDER_GROUPS: ReminderGroupDef[] = [
  { id: 'action', title: 'Требует действия', defaultOpen: true },
  { id: 'tasks', title: 'Задачи', defaultOpen: true },
  { id: 'soon', title: 'Скоро', defaultOpen: true },
  { id: 'healing', title: 'Контроль заживления', defaultOpen: false },
  { id: 'stale', title: 'Давно не двигалось', defaultOpen: false },
];

// Число видимых карточек в каждой группе — считается снаружи (в
// RemindersSection) из тех же списков, что уже приходят пропсами.
export interface ReminderGroupCounts {
  action: number;
  tasks: number;
  soon: number;
  healing: number;
  stale: number;
}

export interface ReminderGroupViewModel {
  id: ReminderGroupId;
  title: string;
  count: number;
  defaultOpen: boolean;
}

// Видимые (непустые) группы в фиксированном порядке REMINDER_GROUPS, с
// пересчитанным эффективным defaultOpen: если ровно одна группа непуста,
// она открыта независимо от своего обычного defaultOpen (M5A, п. 4) — иначе
// мастер бы видела один заголовок с цифрой и должна была бы ещё и раскрыть
// его вручную, хотя больше смотреть не на что. Пустые группы отфильтрованы
// — компонент их вообще не рендерит.
export function buildVisibleReminderGroups(counts: ReminderGroupCounts): ReminderGroupViewModel[] {
  const nonEmpty = REMINDER_GROUPS.filter((g) => counts[g.id] > 0);
  const onlyOneNonEmpty = nonEmpty.length === 1;
  return nonEmpty.map((g) => ({
    id: g.id,
    title: g.title,
    count: counts[g.id],
    defaultOpen: onlyOneNonEmpty ? true : g.defaultOpen,
  }));
}

// Общий счётчик в заголовке «Напоминания · N» — сумма всех пяти групп.
// Временные undo-баннеры «Напоминание скрыто · Вернуть» сюда сознательно не
// входят (M5A, п. 5) — считаются отдельно, вне ReminderGroupCounts.
export function totalReminderCount(counts: ReminderGroupCounts): number {
  return counts.action + counts.tasks + counts.soon + counts.healing + counts.stale;
}
