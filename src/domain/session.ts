// Доменный тип сессии. Вынесено из TattoDiary.tsx без изменений (PR 2) —
// поля, порядок и семантика прежние.

// Контрольное фото заживления одной сессии — см. Session.healingCheckPhotos.
export interface HealingCheckPhoto {
  id: string;
  url: string; // data URL, как Session.photos
  addedDate: string; // ISO yyyy-mm-dd
}

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
  // Контрольные фото заживления ЭТОЙ сессии — как заживает именно она, а не
  // итог всей работы (см. Project.healingPhotos и его комментарий о том,
  // почему финальное, «портфолийное» фото живёт на проекте — одно на весь
  // проект, даже если сессий было пять). Здесь фото может быть несколько на
  // сессию (ход заживления день за днём) и они не влияют на статус проекта
  // и не закрывают карточку-напоминание week1_check в healingCycle.ts — это
  // просто журнал, который мастер ведёт по своей инициативе.
  healingCheckPhotos: HealingCheckPhoto[];
  done: boolean;
  // @deprecated — заменено галереей заживления на Project, см.
  // Project.healingPhotos. Поле физически оставлено, чтобы старые бэкапы и
  // импорт не ломались (normalizeSession по-прежнему его переносит), но UI
  // его больше не показывает, а новая логика заживления
  // (reminders/healingCycle.ts) не читает и не пишет его. НЕ то же самое,
  // что healingCheckPhotos выше: то было булевым флагом факта «зажило
  // да/нет», это — сама галерея снимков, отдельная, новая сущность.
  // Единственный, кто ещё смотрит на healed, — deprecated healingReminders в
  // reminders/buildReminders.ts, из UI не вызываемый.
  healed: boolean;
  // «Это последняя сессия проекта?» — подтверждается мастером при завершении
  // сессии и определяет, какой цикл заживления запускать: полный (неделя 1 →
  // день 21, развилка фото/коррекция) или лёгкий одноразовый чек, см.
  // reminders/healingCycle.ts. Для проектов с sessionsPlan==='single' не
  // спрашивается — там ответ известен заранее. Выполненная коррекция тоже
  // приходит сюда с true: она перезапускает цикл от своей даты.
  isLastSession: boolean;
  // Set via the overdue reminder's «Отменить» quick action — a planned
  // session that didn't happen, distinct from `done`. Excluded from
  // upcoming/overdue lists; shown as «Отменена» instead of just
  // disappearing. Unset via restoreSession in TattoDiary.tsx (the
  // «Восстановить» control in TimelineViewSheet, for an accidental cancel)
  // — the only two writers, an ordinary form save leaves it alone. Doesn't
  // gate the session chain (previousSessionId/nextSessionId) or its
  // «Назначить следующую» control — a cancelled session is the normal
  // «client didn't show up, reschedule» case, not a dead end.
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

// Та же логика, что reconcileHealingPhotos в domain/project.ts (мост от
// плоского списка url, который отдаёт SessionPhotos, к полноценным записям
// с id/датой — существующие сохраняют свои, новые заводят свои), но без
// обложки: у контрольных фото сессии её нет, это не портфолио, а хронология
// заживления день за днём, где ни один снимок не «главнее» другого.
export function reconcileHealingCheckPhotos(
  existing: HealingCheckPhoto[],
  urls: string[],
  today: string,
): HealingCheckPhoto[] {
  const remaining = [...existing];
  return urls.map((url) => {
    const i = remaining.findIndex((p) => p.url === url);
    if (i !== -1) return remaining.splice(i, 1)[0];
    return { id: crypto.randomUUID(), url, addedDate: today };
  });
}
