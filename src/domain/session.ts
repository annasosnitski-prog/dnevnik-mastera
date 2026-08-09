// Доменный тип сессии. Вынесено из TattoDiary.tsx без изменений (PR 2) —
// поля, порядок и семантика прежние.

export interface Session {
  id: string;
  name: string; // session title, e.g. "Первая", "Голубика"
  date: string; // ISO yyyy-mm-dd (or legacy free text)
  time: string; // HH:MM, 24h — optional, shown only on the master dashboard
  duration: string; // e.g. "4 ч"
  style: string; // work style for this session
  area: string; // work zone, e.g. "Левое плечо"
  colors: string; // inks / colours used
  needles: string; // needle configuration
  skinReaction: string; // how the skin reacted
  note: string;
  photos: string[]; // captured/uploaded photos (data URLs)
  done: boolean;
  healed: boolean; // manually ticked once a healed-skin photo has been added
  // Set only via the overdue reminder's «Отменить» quick action — a planned
  // session that won't happen and won't be rescheduled, distinct from
  // `done`. Excluded from upcoming/overdue lists; shown as «Отменена» in
  // the client's history instead of just disappearing.
  cancelled: boolean;
  // Ссылка на Project (Этап 2, link-подход): сессия физически остаётся у
  // клиента, но может принадлежать проекту. null = без проекта. НЕ входит
  // в ключ синка календаря, так что привязка не дёргает Инка-календарь.
  projectId: string | null;
  // Обратная ссылка на Consultation.convertedToSessionId — проставляется,
  // когда сессия создана через «Перевести в сессию» (см.
  // startConvertConsultationToSession в TattoDiary.tsx). null для сессий,
  // созданных напрямую (обычная форма, из ContentLinkPickerSheet и т.п.).
  sourceConsultationId: string | null;
  // ── Цепочка повторных сессий («Назначить следующую сессию») ── тот же
  // link-паттерн, что Consultation.previousConsultationId/nextConsultationId:
  // сессия никогда не заменяется другой — у каждой следующей встречи своя
  // собственная запись со своими датой/статусом/заметками, связанная с
  // предыдущей только этими двумя id. null-цепочка (обе ссылки null) —
  // обычная, не повторная сессия; для записей до этой фичи previousSessionId
  // всегда null (миграция не нужна, см. normalizeSession в lib/normalize.ts).
  previousSessionId: string | null;
  // Обратная ссылка на следующую сессию — не обязательна для корректности
  // (можно найти перебором по previousSessionId), но убирает этот перебор
  // из каждого места, где нужно узнать «уже назначена ли следующая»
  // (та же роль, что Consultation.nextConsultationId).
  nextSessionId: string | null;
}
