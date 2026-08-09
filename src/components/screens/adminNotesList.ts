// Чистая view-model расширенного списка заметок во вкладке «Задачи» (M5D).
// Показывает ВСЕ незавершённые заметки — клиентские и личные, по всем
// четырём уровням срочности, включая заметки вовсе без срока — то, что уже
// существующий радар напоминаний (RemindersSection) не показывает: он
// требует валидный dueDate и показывает только 'urgent'/'important'-окраску
// через отдельные правила (overdue/soon/...), а не полный список заметок как
// таковых. Источник данных прежний — client.notes и masterNotes; никакая
// новая заметка/поле здесь не появляется, это только группировка и подписи.

import type { Client } from '../../domain/client';
import type { ClientNote } from '../../domain/task';
import type { UrgencyKey } from '../../domain/urgency';
import { URGENCY } from '../../domain/urgency.js';

export interface AdminNoteItem {
  note: ClientNote;
  // null — личная заметка мастера (masterNotes), без привязки к клиенту.
  clientId: string | null;
  // Имя клиента, либо «Личная задача» для заметок без клиента — та же
  // формулировка, что уже использует RemindersSection для клиентских задач
  // (см. taskOwnerLabel там).
  ownerLabel: string;
}

export interface AdminNotesUrgencyGroup {
  urgency: UrgencyKey;
  label: string;
  items: AdminNoteItem[];
}

function noteSortKey(a: ClientNote, b: ClientNote): number {
  // Заметки со сроком — раньше по дате; без срока — после всех со сроком;
  // внутри одной корзины — по дате создания (старые раньше), чтобы ничего
  // не терялось из виду бесконечно.
  if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
  if (a.dueDate && !b.dueDate) return -1;
  if (!a.dueDate && b.dueDate) return 1;
  return a.createdDate.localeCompare(b.createdDate);
}

// Только непустые группы, в фиксированном порядке URGENCY (Срочно → Важно →
// Обычно → Интересно) — тот же принцип, что buildVisibleReminderGroups
// использует для пяти групп напоминаний (пустая группа не рендерится).
export function buildAdminNotesGroups(clients: Client[], masterNotes: ClientNote[]): AdminNotesUrgencyGroup[] {
  const items: AdminNoteItem[] = [];
  for (const client of clients) {
    for (const note of client.notes) {
      if (note.done) continue;
      items.push({ note, clientId: client.id, ownerLabel: client.name || '—' });
    }
  }
  for (const note of masterNotes) {
    if (note.done) continue;
    items.push({ note, clientId: null, ownerLabel: 'Личная задача' });
  }

  return URGENCY.map((u) => ({
    urgency: u.key,
    label: u.label,
    items: items.filter((i) => i.note.urgency === u.key).sort((a, b) => noteSortKey(a.note, b.note)),
  })).filter((g) => g.items.length > 0);
}

export function totalAdminNotesCount(groups: AdminNotesUrgencyGroup[]): number {
  return groups.reduce((sum, g) => sum + g.items.length, 0);
}
