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

// Одна запись «своей» истории изменений консультации (см. Consultation.history
// ниже) — не общий аудит-лог всего приложения, а компактная лента конкретной
// консультации: когда её создали, когда от неё назначили следующую, когда её
// перевели в сессию/отменили. Пишется доменной логикой в фиксированных
// точках (см. lib/consultationSave.ts), а не диффом полей формы.
export interface ConsultationHistoryEntry {
  id: string;
  date: string; // ISO timestamp
  note: string; // короткая запись о том, что произошло
}

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
  // "Итог" — как прошла именно эта консультация; своё для каждой записи в
  // цепочке, не переносится и не наследуется соседними консультациями.
  outcome: string;
  // Намеренно нет собственного nextStep — следующий шаг существует ровно
  // один на весь Project (nextActionText/nextActionDate/nextActionType, см.
  // domain/project.ts), редактируется из просмотра проекта/сессии/
  // консультации, но хранится только на Project.
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
  // ── Цепочка повторных консультаций («Назначить следующую консультацию») ──
  // Консультация никогда не заменяется и не удаляется другой: у каждой
  // следующей встречи — своя собственная запись со своими датой/статусом/
  // заметками/итогом, связанная с предыдущей только этими двумя
  // id (тот же двусторонний link-паттерн, что convertedToSessionId/
  // sourceConsultationId у сессии). null-цепочка (обе ссылки null) — обычная,
  // не повторная консультация; для старых записей до этой фичи
  // previousConsultationId всегда null — они и есть начало своей цепочки
  // (см. normalizeClient в lib/normalize.ts), миграция не нужна.
  previousConsultationId: string | null;
  // Обратная ссылка на следующую консультацию — не обязательна для
  // корректности (её всегда можно найти перебором consultations по
  // previousConsultationId), но убирает этот перебор из каждого места,
  // где нужно узнать «уже назначена ли следующая» (см. getConsultationSequence
  // в domain/projectSelectors.ts, где используется порядок по дате, а не эта
  // ссылка — nextConsultationId только для UI-навигации/статуса «уже есть
  // следующая», не для нумерации).
  nextConsultationId: string | null;
  // Своя лента событий этой консультации — см. ConsultationHistoryEntry.
  history: ConsultationHistoryEntry[];
  createdDate: string;
  // См. Session.projectId — та же link-семантика (Этап 2).
  projectId: string | null;
}

// Конвертированная консультация не удаляется обычным способом, пока
// существует связанная сессия (Session.sourceConsultationId) — иначе сессия
// остаётся со ссылкой на несуществующую консультацию. Единый источник
// истины для двух независимых мест защиты: ConsultationRow (DetailScreen.tsx)
// скрывает контрол удаления по этому предикату, а deleteConsultation
// (TattoDiary.tsx) им же блокирует сам save-funnel — так защита не держится
// только на скрытой кнопке. Удалить связанную сессию (которая восстановит
// консультацию — см. applyConsultationRestoration в lib/sessionSave.ts) и
// удалить после этого можно уже саму, теперь обычную, консультацию.
export function isConsultationDeletable(consultation: Consultation): boolean {
  return consultation.status !== 'converted';
}
