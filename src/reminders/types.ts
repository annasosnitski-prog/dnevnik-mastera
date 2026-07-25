// Типы элементов лент напоминаний. Вынесено из TattoDiary.tsx без изменений
// (PR 4 рефакторинга) — те же поля, что и раньше.

import type { Client } from '../domain/client';
import type { ClientNote } from '../domain/task';
import type { UrgencyKey } from '../domain/urgency';

// Sessions AND consultations whose date has passed while still marked
// not-done — the master either ticks them done (it happened, wasn't logged)
// or reschedules.
export type OverdueItem = { client: Client; kind: 'session' | 'consultation'; id: string; date: string; time: string };

// Done sessions, not yet marked healed, whose date is at least
// HEALING_REMINDER_DAYS in the past — a nudge to check in with the client.
export type HealingItem = { client: Client; sessionId: string; date: string };

// Sessions/consultations starting 36–48 hours from now — a heads-up to prep
// materials before the client arrives.
export type UpcomingSoonItem = { client: Client; kind: 'session' | 'consultation'; id: string; date: string; time: string };

// A ClientNote (Task = ClientNote, см. TECH_REFACTOR_AUDIT.md), normalized
// with where it physically lives — client.notes (IndexedDB) or
// masterInfo.notes (localStorage). Both stores hold the same ClientNote
// shape but are never merged; `scope`/`clientId` say which one a given task
// came from so actions (Выполнить/Открыть) can find their way back.
export interface TaskReminderSource {
  task: ClientNote;
  scope: 'client' | 'master';
  clientId: string | null;
}

// Просроченная задача (`task_overdue`) или задача со сроком сегодня
// (`task_due`) — единственные два случая, когда ClientNote.dueDate рождает
// напоминание (см. buildTaskReminders.ts). `id` уже несёт scope/clientId/
// taskId/rule/dueDate, поэтому одинаковый raw ClientNote.id из разных
// хранилищ или смена dueDate всегда дают новый id (см. reminderKeys.ts).
//
// Два ключа состояния — намеренно разные (см. reminderKeys.ts):
//  - `id` (с rule) ключует «скрыть» → при переходе due→overdue возникает
//    новый экземпляр;
//  - `actionKey` (без rule) ключует «отложить» → откладывание переживает
//    переход due→overdue и держит задачу скрытой до showAfter.
export interface TaskReminderItem {
  id: string;
  actionKey: string;
  rule: 'task_due' | 'task_overdue';
  sourceType: 'task';
  sourceId: string;
  scope: 'client' | 'master';
  clientId: string | null;
  projectId: string | null;
  text: string;
  dueDate: string;
  urgency: UrgencyKey;
  createdDate: string;
  taskId: string;
}
