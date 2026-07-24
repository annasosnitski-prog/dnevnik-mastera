// Чистые выборки и счётчики по задачам/заметкам (Task = ClientNote).
// Вынесено из TattoDiary.tsx без изменений (PR 3 рефакторинга).
//
// Примечание: выборок «просроченные задачи» и «задачи на дату» здесь нет —
// у ClientNote сейчас отсутствует поле срока (dueDate), см.
// docs/TECH_REFACTOR_AUDIT.md. Оно добавляется отдельным будущим PR, до
// этого такие выборки построить не на чем.

import type { ClientNote } from './task';
import type { Client } from './client';
import { type UrgencyKey, URGENCY } from './urgency';

export const urgencyRank = (k: UrgencyKey): number => URGENCY.findIndex((u) => u.key === k);
export const urgencyMeta = (k: UrgencyKey) => URGENCY.find((u) => u.key === k) || URGENCY[URGENCY.length - 1];

// Задачи/заметки, привязанные к проекту.
export function getTasksByProjectId(notes: ClientNote[], projectId: string): ClientNote[] {
  return notes.filter((n) => n.projectId === projectId);
}

// Counts open (not-done) notes by urgency — the two buckets the dashboard
// surfaces: urgent, and important.
export function notesUrgencyCounts(notes: ClientNote[]): { urgent: number; important: number } {
  let urgent = 0;
  let important = 0;
  for (const n of notes) {
    if (n.done) continue;
    if (n.urgency === 'urgent') urgent++;
    else if (n.urgency === 'important') important++;
  }
  return { urgent, important };
}

// Same, across every client's notes — the master's own (client-less) notes
// are counted separately, see notesUrgencyCounts above.
export function urgencyCounts(clients: Client[]): { urgent: number; important: number } {
  return notesUrgencyCounts(clients.flatMap((c) => c.notes));
}
