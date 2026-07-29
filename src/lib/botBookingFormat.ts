// Вынесено из TattoDiary.tsx (PR 3 рефакторинга). Логика не менялась —
// только перенос.
import type { BotBooking } from './calendarSync';

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
