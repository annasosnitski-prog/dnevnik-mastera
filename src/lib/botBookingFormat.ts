// Вынесено из TattoDiary.tsx (PR 3 рефакторинга). Логика не менялась —
// только перенос.
import type { BotBooking } from './calendarSync';

export const OPEN_SLOT_MARK = '#5E8C4A';

export function tagLabel(tag: BotBooking['tag']): string {
  switch (tag) {
    case '[ВИДЕО]':
      return 'Видео';
    case '[ОКНО]':
      return 'Окно';
    case '[ТАТУ]':
      return 'Тату';
    case '[ПРИЁМ]':
      return 'Приём';
    default:
      return '—';
  }
}

export function stripTagPrefix(summary: string, tag: BotBooking['tag']): string {
  if (!tag) return summary;
  return summary.startsWith(tag) ? summary.slice(tag.length).replace(/^\s+/, '') : summary;
}

export function formatBookingTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('ru-RU', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jerusalem',
  });
}

// Занятые брони для расписания: только настоящие брони с клиентом
// (не открытые слоты и не /закрой мастера), ещё не прошедшие, по времени.
// Сравниваем через Date, а не строки: бот отдаёт ISO с разными смещениями.
export function upcomingBookedBookings(bookings: BotBooking[], now: Date): BotBooking[] {
  const nowMs = now.getTime();
  return bookings
    .filter((b) => b.kind === 'booking')
    .filter((b) => {
      const endMs = new Date(b.end || b.start).getTime();
      return isNaN(endMs) || endMs >= nowMs;
    })
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
}

// Имя для плитки: сноска без тега и без ведущих тире-маркеров занятости
// («— КАМПЕЙН ЗАПИСЬ — Noga» → «КАМПЕЙН ЗАПИСЬ — Noga»).
export function bookingTitle(b: BotBooking): string {
  const text = stripTagPrefix(b.summary, b.tag).replace(/^[\s—–-]+/, '').trim();
  return text || '—';
}
