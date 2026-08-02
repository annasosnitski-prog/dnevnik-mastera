// Строители лент напоминаний. Вынесено из TattoDiary.tsx (PR 4 рефакторинга)
// БЕЗ изменения логики, условий и порядка результатов.
//
// Единственное отличие от прежних версий — время подаётся аргументом `now`,
// а не читается из глобальных часов внутри функции (`todayISO()`/`Date.now()`).
// Функции стали полностью чистыми: одни и те же входные данные + один и тот же
// `now` всегда дают один результат, обращений к React/IndexedDB/localStorage
// нет, исходные массивы не мутируются (сортировка идёт по новому массиву).
// При вызове с `now = new Date()` (как в компоненте) поведение прежнее.

import type { Client } from '../domain/client';
import type { Project } from '../domain/project';
import { ISO_DATE_RE, isValidISODate } from '../utils/dates.js';
import type { OverdueItem, HealingItem, HealingStage, UpcomingSoonItem, ProjectSessionReminderItem } from './types';

// Заживление проверяется в четыре захода вместо одной точки на 30-й день —
// у каждой стадии своё окно (minDays включительно, maxDays исключительно).
// Окна не пересекаются, поэтому у сессии в любой момент активна максимум
// одна стадия. Последняя (day30) без верхней границы — держится, пока
// мастер не отметит «Зажив» (session.healed), как и раньше.
const HEALING_STAGES: { stage: HealingStage; minDays: number; maxDays: number | null }[] = [
  { stage: 'day1', minDays: 1, maxDays: 4 },
  { stage: 'day4', minDays: 4, maxDays: 15 },
  { stage: 'day15', minDays: 15, maxDays: 30 },
  { stage: 'day30', minDays: 30, maxDays: null },
];
export const SOON_REMINDER_MIN_HOURS = 36;
export const SOON_REMINDER_MAX_HOURS = 48;

const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

// Local (not UTC) yyyy-mm-dd for the given moment — идентично прежнему
// todayISO(), но от переданного `now`, а не от new Date() внутри.
function localISO(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// Whole local days between an ISO date and `now`'s local midnight, floored —
// идентично прежнему daysSinceISO(date), но от переданного `now`.
function daysSince(date: string, now: Date): number {
  const then = new Date(date + 'T00:00:00');
  const today = new Date(localISO(now) + 'T00:00:00');
  return Math.floor((today.getTime() - then.getTime()) / 86400000);
}

// Sessions AND consultations whose date has passed while still marked
// not-done. Sorted oldest-first, so the most overdue leads.
export function overdueEntries(clients: Client[], now: Date): OverdueItem[] {
  const today = localISO(now);
  const result: OverdueItem[] = [];
  for (const client of clients) {
    for (const session of client.sessions) {
      if (session.done || session.cancelled || !ISO_DATE_RE.test(session.date) || session.date >= today) continue;
      result.push({ client, kind: 'session', id: session.id, date: session.date, time: session.time });
    }
    for (const consultation of client.consultations) {
      // status==='converted' уже подразумевает done:true (см. normalizeClient/
      // applyConsultationConversion), но проверяем явно — понятнее читать и не
      // зависит от того, что done продолжит форсироваться в будущем.
      if (consultation.done || consultation.cancelled || consultation.status === 'converted' || !ISO_DATE_RE.test(consultation.date) || consultation.date >= today) continue;
      result.push({ client, kind: 'consultation', id: consultation.id, date: consultation.date, time: consultation.time });
    }
  }
  return result.sort((a, b) => a.date.localeCompare(b.date));
}

// Done sessions, not yet marked healed, currently inside one of the
// HEALING_STAGES windows. Sorted oldest-first.
export function healingReminders(clients: Client[], now: Date): HealingItem[] {
  const result: HealingItem[] = [];
  for (const client of clients) {
    for (const session of client.sessions) {
      if (!session.done || session.healed || !ISO_DATE_RE.test(session.date)) continue;
      const since = daysSince(session.date, now);
      const stage = HEALING_STAGES.find((s) => since >= s.minDays && (s.maxDays === null || since < s.maxDays));
      if (stage) result.push({ client, sessionId: session.id, date: session.date, stage: stage.stage });
    }
  }
  return result.sort((a, b) => a.date.localeCompare(b.date));
}

// Sessions/consultations starting 36–48 hours from now (not done, not
// cancelled). Undated/untimed entries have nothing to count down, skipped.
export function upcomingSoonReminders(clients: Client[], now: Date): UpcomingSoonItem[] {
  const nowMs = now.getTime();
  const result: UpcomingSoonItem[] = [];
  const consider = (client: Client, kind: 'session' | 'consultation', id: string, date: string, time: string, done: boolean, cancelled: boolean) => {
    if (done || cancelled || !ISO_DATE_RE.test(date) || !time) return;
    const at = new Date(`${date}T${time}`).getTime();
    if (Number.isNaN(at)) return;
    const hoursUntil = (at - nowMs) / 3600000;
    if (hoursUntil >= SOON_REMINDER_MIN_HOURS && hoursUntil <= SOON_REMINDER_MAX_HOURS) {
      result.push({ client, kind, id, date, time });
    }
  };
  for (const client of clients) {
    for (const session of client.sessions) consider(client, 'session', session.id, session.date, session.time, session.done, session.cancelled);
    for (const consultation of client.consultations) consider(client, 'consultation', consultation.id, consultation.date, consultation.time, consultation.done, consultation.cancelled);
  }
  return result.sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
}

// Sessions stored directly on projects without a client whose date has
// passed. Client-linked projects are ignored because their reminders continue
// to come exclusively from client.sessions.
export function overdueProjectSessions(projects: Project[], now: Date): ProjectSessionReminderItem[] {
  const today = localISO(now);
  const result: ProjectSessionReminderItem[] = [];
  for (const project of projects) {
    if (project.clientId !== null) continue;
    for (const session of project.sessions) {
      if (session.done || session.cancelled || !isValidISODate(session.date) || session.date >= today) continue;
      result.push({ project, sessionId: session.id, date: session.date, time: session.time });
    }
  }
  return result.sort((a, b) => a.date.localeCompare(b.date));
}

// Sessions stored directly on projects without a client that start 36–48
// hours from the supplied clock snapshot. Strict date/time validation keeps
// malformed legacy values out of the countdown.
export function upcomingSoonProjectSessions(projects: Project[], now: Date): ProjectSessionReminderItem[] {
  const nowMs = now.getTime();
  const result: ProjectSessionReminderItem[] = [];
  for (const project of projects) {
    if (project.clientId !== null) continue;
    for (const session of project.sessions) {
      if (session.done || session.cancelled || !isValidISODate(session.date) || !TIME_RE.test(session.time)) continue;
      const at = new Date(`${session.date}T${session.time}`).getTime();
      if (Number.isNaN(at)) continue;
      const hoursUntil = (at - nowMs) / 3600000;
      if (hoursUntil >= SOON_REMINDER_MIN_HOURS && hoursUntil <= SOON_REMINDER_MAX_HOURS) {
        result.push({ project, sessionId: session.id, date: session.date, time: session.time });
      }
    }
  }
  return result.sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
}

// Активные проекты, у которых «следующий шаг» назначен на сегодня или уже
// просрочен (Этап 3b). Срабатывает только когда мастер сама поставила дату.
// Отсортированы от самого просроченного.
export function overdueProjects(projects: Project[], now: Date): Project[] {
  const today = localISO(now);
  return projects
    .filter((p) => p.state === 'active' && p.nextActionDate && p.nextActionDate <= today)
    .sort((a, b) => (a.nextActionDate ?? '').localeCompare(b.nextActionDate ?? ''));
}
