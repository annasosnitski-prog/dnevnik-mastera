// Чистые утилиты дат. Вынесено из TattoDiary.tsx без изменений (PR 3
// рефакторинга) — алгоритмы, формат вывода и краевые случаи прежние.
// Ничего не знают о React, IndexedDB и localStorage.

export const MONTHS_RU = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Formats an ISO yyyy-mm-dd as "24 мая 2026"; leaves legacy free-text as-is.
export function formatDate(value: string): string {
  if (!value) return '';
  const m = ISO_DATE_RE.exec(value);
  if (!m) return value;
  const [y, mo, d] = value.split('-');
  return `${Number(d)} ${MONTHS_RU[Number(mo) - 1]} ${y}`;
}

export const WEEKDAYS_SHORT_RU = ['ВС', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ'];

// Splits an ISO yyyy-mm-dd into weekday/day-number/month for the tear-off
// calendar-square badge (see the «Ближайшая» tag). Local calendar date, not
// UTC — a plain `new Date(iso)` would land on the previous day in western
// timezones since the string parses as UTC midnight.
export function dateParts(value: string): { weekday: string; day: string; month: string } | null {
  const m = ISO_DATE_RE.exec(value);
  if (!m) return null;
  const [y, mo, d] = value.split('-').map(Number);
  const dt = new Date(y, mo - 1, d);
  return { weekday: WEEKDAYS_SHORT_RU[dt.getDay()], day: String(d), month: MONTHS_RU[mo - 1] };
}

// Local (not UTC) today as yyyy-mm-dd, for string-comparing against ISO dates.
export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Whole days between an ISO date and today (local), floored — used for the
// fixed 30-day healing check-in window.
export function daysSinceISO(date: string): number {
  const then = new Date(date + 'T00:00:00');
  const today = new Date(todayISO() + 'T00:00:00');
  return Math.floor((today.getTime() - then.getTime()) / 86400000);
}
