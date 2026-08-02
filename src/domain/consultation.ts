// Доменный тип консультации. Вынесено из TattoDiary.tsx без изменений (PR 2).

import type { UrgencyKey } from './urgency';

// Явное состояние жизненного цикла — добавлено вместе с convertedToSessionId
// (см. ниже), чтобы «Перевести в сессию» переставало удалять консультацию
// (PR #198 удалял её тем же saveClient, что добавлял сессию — см.
// startConvertConsultationToSession/handleAddSession в TattoDiary.tsx).
// 'active'/'cancelled' пока дублируют done/cancelled (сохранены отдельно
// для обратной совместимости — см. комментарии на них ниже), 'completed'
// зарезервировано на будущее (сейчас ничего его не выставляет), 'converted'
// — единственное новое поведение этого среза.
export type ConsultationStatus = 'active' | 'completed' | 'converted' | 'cancelled';

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
  // Оставлены как есть ради обратной совместимости — status добавлен рядом,
  // а не взамен (см. normalizeClient в lib/normalize.ts: done принудительно
  // true при status==='converted', чтобы существующие фильтры по done/
  // cancelled в plannerSelectors.ts/buildReminders.ts продолжали работать
  // без отдельной правки под новый статус).
  done: boolean;
  // See Session.cancelled — same meaning, set only via the overdue
  // reminder's «Отменить» action.
  cancelled: boolean;
  status: ConsultationStatus;
  // Проставляется вместе со status:'converted' — id сессии, в которую эта
  // консультация «переехала» (см. Session.sourceConsultationId — обратная
  // ссылка). null для всех остальных статусов.
  convertedToSessionId: string | null;
  createdDate: string;
  // См. Session.projectId — та же link-семантика (Этап 2).
  projectId: string | null;
}
