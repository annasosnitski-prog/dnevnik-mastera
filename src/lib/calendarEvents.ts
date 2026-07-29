// Вынесено из TattoDiary.tsx (PR 3 рефакторинга). Логика не менялась —
// только перенос.
import type { Client } from '../domain/client';
import { ISO_DATE_RE } from '../utils/dates';

export interface CalendarEvent {
  date: string;
  time: string;
  kind: 'session' | 'consultation';
  clientId: string;
  clientName: string;
  id: string;
  done: boolean;
}

// Buckets every dated session/consultation across all clients by ISO date,
// each day's list sorted by time (untimed entries sink to the bottom).
export function collectCalendarEvents(clients: Client[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  const add = (e: CalendarEvent) => {
    const arr = map.get(e.date) ?? [];
    arr.push(e);
    map.set(e.date, arr);
  };
  for (const c of clients) {
    const clientName = [c.name, c.surname].filter(Boolean).join(' ').trim() || 'Клиент';
    for (const s of c.sessions) {
      if (ISO_DATE_RE.test(s.date)) add({ date: s.date, time: s.time, kind: 'session', clientId: c.id, clientName, id: s.id, done: s.done });
    }
    for (const cs of c.consultations) {
      if (ISO_DATE_RE.test(cs.date)) add({ date: cs.date, time: cs.time, kind: 'consultation', clientId: c.id, clientName, id: cs.id, done: cs.done });
    }
  }
  for (const arr of map.values()) arr.sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
  return map;
}

// День по календарю Asia/Jerusalem для ISO-времени бота — тот же приём,
// что и на стороне бота (jerusalemDayKey в lib/calendar.ts), только тут
// на чистом Intl, без сервера.
export function botSlotDayKey(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
}
