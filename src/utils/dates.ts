// Чистые утилиты дат. Вынесено из TattoDiary.tsx без изменений (PR 3
// рефакторинга) — алгоритмы, формат вывода и краевые случаи прежние.
// Ничего не знают о React, IndexedDB и localStorage.

export const MONTHS_RU = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Строгая проверка ISO yyyy-mm-dd: формат ISO_DATE_RE недостаточен сам по
// себе — «2026-02-31» ему соответствует, хотя такой календарной даты не
// существует. Здесь дополнительно проверяем, что y/m/d, собранные обратно
// через Date, дают ТЕ ЖЕ y/m/d — JS Date молча переносит переполнение
// (31 февраля → 3 марта), несовпадение после сборки и означает невалидную
// дату. 29 февраля пропускает только високосные годы естественным образом
// (Date сам это учитывает).
export function isValidISODate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE_RE.test(value)) return false;
  const [y, mo, d] = value.split('-').map(Number);
  const dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
}

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
//
// `now` — точка отсчёта. По умолчанию текущий момент (прежнее поведение всех
// вызовов без аргумента), но строители напоминаний подают её явно: так их
// функции остаются чистыми — одни и те же входные данные плюс один и тот же
// `now` всегда дают один результат, без обращения к глобальным часам внутри.
export function todayISO(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// Whole local days between an ISO date and `now`'s local midnight, floored —
// сколько дней прошло с сессии, на этом стоят все окна напоминаний.
export function daysSinceISO(date: string, now: Date = new Date()): number {
  const then = new Date(date + 'T00:00:00');
  const today = new Date(todayISO(now) + 'T00:00:00');
  return Math.floor((today.getTime() - then.getTime()) / 86400000);
}
