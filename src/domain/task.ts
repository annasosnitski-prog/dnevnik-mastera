// Доменный тип задачи/заметки. В коде исторически называется ClientNote
// (аудит: Task = ClientNote). Вынесено из TattoDiary.tsx без изменений (PR 2).

import type { UrgencyKey } from './urgency';

// A free-form note/task with an urgency marker and a done flag. Lives in the
// client's «Дополнительно» tab and is aggregated across clients in «Сводка».
// Also doubles as the master's own client-less task list (masterInfo.notes).
export interface ClientNote {
  id: string;
  text: string;
  urgency: UrgencyKey;
  done: boolean;
  createdDate: string;
  photos: string[];
  projectId: string | null;
  // Необязательный срок, формат ISO yyyy-mm-dd (см. ISO_DATE_RE в
  // utils/dates.ts). Не связан с urgency, не выводится автоматически из
  // createdDate — задаётся мастером явно. Задел на будущий слой Task-
  // напоминаний (см. docs/TECH_REFACTOR_AUDIT.md); сам слой — другой PR.
  dueDate: string | null;
}
