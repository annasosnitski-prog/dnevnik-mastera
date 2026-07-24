// Чистые выборки, сортировки и агрегаты для списков и планирования.
// Вынесено из TattoDiary.tsx без изменений (PR 3 рефакторинга) — алгоритмы,
// правила сортировки и состав результатов прежние.
//
// Ничего не знают о React, IndexedDB и localStorage; исходные массивы не
// мутируются (сортировка всегда по копии).
//
// Напоминания (overdueEntries / healingReminders / upcomingSoonReminders /
// overdueProjects и их ключи) сюда НЕ переносились — это отдельный слой,
// см. docs/TECH_REFACTOR_AUDIT.md.

import type { Client } from './client';
import type { Session } from './session';
import { clientStyles } from './client';
import { ISO_DATE_RE, todayISO, formatDate } from '../utils/dates';

// Chronological session order: dated sessions rank by their date. A session
// without a date has nothing to rank by, so it inherits the date of the
// nearest earlier dated session in creation order (or sorts before everything
// if there isn't one yet) — it slots into the calendar gap it was added in.
// Undated sessions sharing that same slot fall back to newest-created-first
// among themselves, so the freshest one sits on top of that stack.
export const sortedSessions = (sessions: Session[]): Session[] => {
  let anchor = '';
  const withKey = sessions.map((s, i) => {
    const dated = ISO_DATE_RE.test(s.date);
    if (dated) anchor = s.date;
    return { s, i, dated, key: dated ? s.date : anchor };
  });
  return withKey
    .sort((a, b) => {
      const byKey = b.key.localeCompare(a.key); // most recent date first
      if (byKey !== 0) return byKey;
      if (a.dated && b.dated) return a.i - b.i; // same explicit date: keep creation order
      if (!a.dated && !b.dated) return b.i - a.i; // same slot, both undated: newest first
      return a.dated ? -1 : 1; // the dated session anchoring this slot comes first
    })
    .map((x) => x.s);
};

// "Last session" means the most recent completed (done) one — a planned/future
// session isn't a "last session" yet. sortedSessions is newest-first, so it's
// the first done entry, not the last.
export const lastSession = (c: Client): Session | null => {
  const done = sortedSessions(c.sessions).filter((s) => s.done);
  return done.length ? done[0] : null;
};
export const lastSessionDate = (c: Client) => {
  const s = lastSession(c);
  return s ? formatDate(s.date) || '—' : '—';
};
// The soonest planned (not-yet-done) session, if any — used to surface an
// upcoming appointment ahead of the last completed one on the client card.
export const nextPlannedSession = (c: Client): Session | null => {
  const planned = c.sessions.filter((s) => !s.done);
  if (!planned.length) return null;
  return [...planned].sort((a, b) => (a.date || '').localeCompare(b.date || ''))[0];
};

// ── Client list sorting (list screen) ──
export type SortMode = 'name' | 'added' | 'session';
export const SORT_MODES: { key: SortMode; label: string }[] = [
  { key: 'name', label: 'А–Я' },
  { key: 'added', label: 'Новые' },
  { key: 'session', label: 'По сессии' },
];

// For the «По сессии» sort: a client's most relevant appointment date. A nearest
// upcoming (not-done, today-or-later) session/consultation wins; failing that,
// the most recent past session date. hasUpcoming lets upcoming clients rank
// above those with only history.
export function sessionSortKey(c: Client): { hasUpcoming: boolean; date: string } {
  const today = todayISO();
  let upcoming = '';
  const considerUpcoming = (date: string, done: boolean, cancelled: boolean) => {
    if (done || cancelled || !ISO_DATE_RE.test(date) || date < today) return;
    if (!upcoming || date < upcoming) upcoming = date;
  };
  c.sessions.forEach((s) => considerUpcoming(s.date, s.done, s.cancelled));
  c.consultations.forEach((cn) => considerUpcoming(cn.date, cn.done, cn.cancelled));
  if (upcoming) return { hasUpcoming: true, date: upcoming };

  let last = '';
  c.sessions.forEach((s) => {
    if (ISO_DATE_RE.test(s.date) && s.date > last) last = s.date;
  });
  return { hasUpcoming: false, date: last };
}

// Orders the (already-filtered) client list per the chosen sort mode.
export function sortClients(clients: Client[], mode: SortMode): Client[] {
  const list = [...clients];
  if (mode === 'name') {
    return list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ru', { sensitivity: 'base' }));
  }
  if (mode === 'added') {
    // Newest first.
    return list.sort((a, b) => (b.createdDate || '').localeCompare(a.createdDate || ''));
  }
  // 'session': nearest upcoming first, then most-recent past, empties last.
  return list.sort((a, b) => {
    const ka = sessionSortKey(a);
    const kb = sessionSortKey(b);
    if (ka.hasUpcoming !== kb.hasUpcoming) return ka.hasUpcoming ? -1 : 1;
    if (ka.hasUpcoming) return ka.date.localeCompare(kb.date); // soonest first
    if (!ka.date && !kb.date) return (a.name || '').localeCompare(b.name || '', 'ru');
    if (!ka.date) return 1;
    if (!kb.date) return -1;
    return kb.date.localeCompare(ka.date); // most recent past first
  });
}

// ── Master dashboard helpers ──
// The tattoo style used across the most clients (ties broken by array order).
export function mostUsedStyle(clients: Client[]): string | null {
  const counts = new Map<string, number>();
  for (const c of clients) {
    for (const s of clientStyles(c)) counts.set(s, (counts.get(s) || 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [style, count] of counts) {
    if (count > bestCount) {
      best = style;
      bestCount = count;
    }
  }
  return best;
}

// Every not-yet-done session AND consultation, across all clients, whose ISO
// date falls within [today, today+days] — sorted soonest-first. Consultations
// are planned on the same calendar as sessions, so both feed one combined
// list. Entries with a legacy non-ISO date (free text) are skipped since they
// can't be date-compared.
export type UpcomingItem = { client: Client; kind: 'session' | 'consultation'; id: string; date: string; time: string };

export function upcomingItems(clients: Client[], days: number): UpcomingItem[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + days);

  const result: UpcomingItem[] = [];
  for (const client of clients) {
    for (const session of client.sessions) {
      if (session.done || session.cancelled || !ISO_DATE_RE.test(session.date)) continue;
      const d = new Date(session.date + 'T00:00:00');
      if (d >= today && d <= horizon) result.push({ client, kind: 'session', id: session.id, date: session.date, time: session.time });
    }
    for (const consultation of client.consultations) {
      if (consultation.done || consultation.cancelled || !ISO_DATE_RE.test(consultation.date)) continue;
      const d = new Date(consultation.date + 'T00:00:00');
      if (d >= today && d <= horizon) {
        result.push({ client, kind: 'consultation', id: consultation.id, date: consultation.date, time: consultation.time });
      }
    }
  }
  return result.sort((a, b) => a.date.localeCompare(b.date));
}
