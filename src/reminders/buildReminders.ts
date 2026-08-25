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
import { getProjectLastActivityDate, hasScheduledWork, hasOverdueWork } from '../domain/projectSelectors.js';
import { ISO_DATE_RE, isValidISODate, todayISO, daysSinceISO } from '../utils/dates.js';
import type {
  OverdueItem,
  HealingItem,
  HealingStage,
  UpcomingSoonItem,
  ProjectSessionReminderItem,
  ProjectConsultationReminderItem,
  StaleProjectItem,
} from './types';

// @deprecated — заменено циклом заживления на проекте, см.
// reminders/healingCycle.ts: там цикл один на проект и считается от его
// последней выполненной сессии, а не заводится отдельно на каждую.
// HEALING_STAGES и healingReminders ниже физически оставлены на один релиз —
// мастер должна убедиться, что новая логика работает на практике; удаление
// отдельным PR после этого. Новый код их не вызывает.
//
// Заживление проверялось в четыре захода вместо одной точки на 30-й день —
// у каждой стадии своё окно (minDays включительно, maxDays исключительно).
// Окна не пересекаются, поэтому у сессии в любой момент активна максимум
// одна стадия. Последняя (day30) без верхней границы — держалась, пока
// мастер не отметит «Зажив» (session.healed, тоже @deprecated).
export const HEALING_STAGES: { stage: HealingStage; minDays: number; maxDays: number | null }[] = [
  { stage: 'day1', minDays: 1, maxDays: 4 },
  { stage: 'day4', minDays: 4, maxDays: 15 },
  { stage: 'day15', minDays: 15, maxDays: 30 },
  { stage: 'day30', minDays: 30, maxDays: null },
];
export const SOON_REMINDER_MIN_HOURS = 36;
export const SOON_REMINDER_MAX_HOURS = 48;

const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

// Обе величины считаются от переданного `now`, а не от глобальных часов —
// ровно то, что делает функции этого модуля чистыми. Прежние локальные
// копии localISO/daysSince переехали в utils/dates.ts под своими исходными
// именами (todayISO/daysSinceISO, теперь с необязательным `now`), чтобы
// healingCycle.ts считал дни той же самой реализацией, а не второй копией.
const localISO = todayISO;
const daysSince = daysSinceISO;

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

// @deprecated — см. HEALING_STAGES выше; замена — healingCycleReminders в
// reminders/healingCycle.ts. Done sessions, not yet marked healed, currently
// inside one of the HEALING_STAGES windows. Sorted oldest-first.
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

// Consultations stored directly on projects without a client whose date has
// passed — mirrors overdueProjectSessions above, for Project.consultations.
export function overdueProjectConsultations(projects: Project[], now: Date): ProjectConsultationReminderItem[] {
  const today = localISO(now);
  const result: ProjectConsultationReminderItem[] = [];
  for (const project of projects) {
    if (project.clientId !== null) continue;
    for (const consultation of project.consultations) {
      if (consultation.done || consultation.cancelled || consultation.status === 'converted' || !isValidISODate(consultation.date) || consultation.date >= today) continue;
      result.push({ project, consultationId: consultation.id, date: consultation.date, time: consultation.time });
    }
  }
  return result.sort((a, b) => a.date.localeCompare(b.date));
}

// Consultations stored directly on projects without a client that start
// 36–48 hours from the supplied clock snapshot — mirrors
// upcomingSoonProjectSessions above, for Project.consultations.
export function upcomingSoonProjectConsultations(projects: Project[], now: Date): ProjectConsultationReminderItem[] {
  const nowMs = now.getTime();
  const result: ProjectConsultationReminderItem[] = [];
  for (const project of projects) {
    if (project.clientId !== null) continue;
    for (const consultation of project.consultations) {
      if (consultation.done || consultation.cancelled || consultation.status === 'converted' || !isValidISODate(consultation.date) || !TIME_RE.test(consultation.time)) continue;
      const at = new Date(`${consultation.date}T${consultation.time}`).getTime();
      if (Number.isNaN(at)) continue;
      const hoursUntil = (at - nowMs) / 3600000;
      if (hoursUntil >= SOON_REMINDER_MIN_HOURS && hoursUntil <= SOON_REMINDER_MAX_HOURS) {
        result.push({ project, consultationId: consultation.id, date: consultation.date, time: consultation.time });
      }
    }
  }
  return result.sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
}

// Активные проекты, у которых «следующий шаг» назначен на сегодня или уже
// просрочен (Этап 3b). Срабатывает только когда мастер сама поставила дату.
// nextActionText.trim() !== '' — вторая, независимая от сохранения защита:
// resolveNextStep (domain/project.ts) уже чистит дату/тип при сохранении
// пустого текста, но повреждённые/старые записи (прямая правка IndexedDB,
// данные до этого фикса) могут содержать дату без текста — без этой
// проверки здесь такой проект показал бы пустую просроченную карточку
// «Следующий шаг: —». Отсортированы от самого просроченного.
export function overdueProjects(projects: Project[], now: Date): Project[] {
  const today = localISO(now);
  return projects
    .filter((p) => p.state === 'active' && p.nextActionDate && p.nextActionDate <= today && p.nextActionText.trim() !== '')
    .sort((a, b) => (a.nextActionDate ?? '').localeCompare(b.nextActionDate ?? ''));
}

// Порог «застывания» (M4) — временный продуктовый порог: один календарный
// месяц без значимой активности (см. isMeaningfulProjectChange/
// getProjectLastActivityDate). Единственная именованная константа —
// настройки в интерфейсе для неё пока нет.
export const STALE_PROJECT_THRESHOLD_DAYS = 30;

// Активные, не завершённые проекты, у которых не было значимого движения
// (см. getProjectLastActivityDate в projectSelectors.ts) дольше
// STALE_PROJECT_THRESHOLD_DAYS дней — «мягкое» напоминание «проект давно не
// двигался», а не срочное действие (в отличие от overdueProjects, у которого
// есть конкретный просроченный next step). paused/cancelled/archived
// намеренно исключены — их «неподвижность» осознанная, не застой; статус
// 'completed' исключён — работа закончена, двигаться больше нечему.
//
// Три независимые защиты от ложных карточек (M4):
//  - getProjectLastActivityDate может вернуть null (легаси-проект без ни
//    одного достоверного сигнала активности) — такой проект пропускается:
//    лучше не показать карточку, чем показать ложную;
//  - hasScheduledWork — уже назначено запланированное действие (будущий
//    next step/сессия/консультация) — проект уже в движении, застой не
//    показываем;
//  - hasOverdueWork — уже есть конкретная просрочка (её показывает
//    overdueProjects/overdueEntries) — мягкий застой не дублирует более
//    конкретное напоминание.
//
// Сортировка — от самого давнего к недавнему (сначала то, что застыло
// сильнее всего).
export function staleProjects(projects: Project[], clients: Client[], now: Date): StaleProjectItem[] {
  const today = localISO(now);
  const allSessions = [...clients.flatMap((c) => c.sessions), ...projects.flatMap((p) => p.sessions)];
  const allConsultations = [...clients.flatMap((c) => c.consultations), ...projects.flatMap((p) => p.consultations)];
  const result: StaleProjectItem[] = [];
  for (const project of projects) {
    if (project.state !== 'active' || project.status === 'completed') continue;
    if (hasOverdueWork(project, allSessions, allConsultations, today)) continue;
    if (hasScheduledWork(project, allSessions, allConsultations, today)) continue;
    const lastActivityDate = getProjectLastActivityDate(project, allSessions, allConsultations, today);
    if (lastActivityDate === null) continue;
    const since = daysSince(lastActivityDate, now);
    if (since >= STALE_PROJECT_THRESHOLD_DAYS) {
      result.push({ project, lastActivityDate, daysSince: since });
    }
  }
  return result.sort((a, b) => a.lastActivityDate.localeCompare(b.lastActivityDate));
}
