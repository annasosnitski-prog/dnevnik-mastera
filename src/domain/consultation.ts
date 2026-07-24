// Доменный тип консультации. Вынесено из TattoDiary.tsx без изменений (PR 2).

import type { UrgencyKey } from './urgency';

export interface Consultation {
  id: string;
  date: string; // ISO yyyy-mm-dd
  time: string; // HH:MM, 24h
  area: string; // "Место" — body part/zone under discussion
  style: string; // "Техника и стиль" — free text, unlike the session's chip picker
  generalNotes: string; // "Общие заметки" — the client's own wishes/agreements + the master's own thoughts
  feeling: string; // "Чувство/ощущение" — the mood or sensation the piece should evoke
  creative: string; // "Креатив" — the wild/standout idea, the one distinctive twist
  inspirationSources: string; // "Источники вдохновения" — authors, references
  urgency: UrgencyKey;
  photos: string[]; // reference / mood-board images
  done: boolean;
  // See Session.cancelled — same meaning, set only via the overdue
  // reminder's «Отменить» action.
  cancelled: boolean;
  createdDate: string;
  // См. Session.projectId — та же link-семантика (Этап 2).
  projectId: string | null;
}
