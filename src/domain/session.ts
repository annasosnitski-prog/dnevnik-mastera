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
}
