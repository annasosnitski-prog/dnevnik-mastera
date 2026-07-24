// Доменный тип задачи/заметки. В коде исторически называется ClientNote
// (аудит: Task = ClientNote). Вынесено из TattoDiary.tsx без изменений (PR 2).
// Примечание: поля срока (dueDate) у задачи сейчас НЕТ — его добавление —
// отдельный будущий PR (см. docs/TECH_REFACTOR_AUDIT.md), не в рамках PR 2.

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
}
