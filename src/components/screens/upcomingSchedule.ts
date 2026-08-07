// Чистая view-model расписания «Предстоящих записей» в Админке (M5C).
// Единственная задача — сгруппировать уже готовый список upcomingItems() по
// дате и подписать каждую группу («Сегодня»/«Завтра»/обычная дата). Какие
// записи вообще попадают в список, done/cancelled-фильтрация, окно периода
// и сортировка — по-прежнему решает upcomingItems; здесь это не
// пересчитывается и не дублируется, порядок элементов не меняется.

import type { UpcomingItem } from '../../domain/plannerSelectors';
import { formatDate } from '../../utils/dates.js';

export interface UpcomingDayGroup {
  date: string;
  label: string;
  items: UpcomingItem[];
}

// yyyy-mm-dd, `days` суток от `dateISO` — через полноценный календарный Date
// (не наивное «getDate() + 1»), чтобы конец месяца/года переносился сам.
function addDaysISO(dateISO: string, days: number): string {
  const [y, mo, d] = dateISO.split('-').map(Number);
  const dt = new Date(y, mo - 1, d);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function dayLabel(date: string, today: string): string {
  if (date === today) return 'Сегодня';
  if (date === addDaysISO(today, 1)) return 'Завтра';
  return formatDate(date);
}

// today передаётся явно (yyyy-mm-dd) — функция не читает часы сама, вызывающая
// сторона (AdminDashboardScreen) берёт его из существующего todayISO().
export function buildUpcomingSchedule(items: UpcomingItem[], today: string): UpcomingDayGroup[] {
  const groups: UpcomingDayGroup[] = [];
  const byDate = new Map<string, UpcomingDayGroup>();
  for (const item of items) {
    let group = byDate.get(item.date);
    if (!group) {
      group = { date: item.date, label: dayLabel(item.date, today), items: [] };
      byDate.set(item.date, group);
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups;
}
