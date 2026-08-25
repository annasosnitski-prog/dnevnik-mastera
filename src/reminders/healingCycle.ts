// Новый цикл заживления. Заменяет HEALING_STAGES/healingReminders
// (buildReminders.ts, помечены @deprecated и из UI больше не вызываются) —
// не расширяет их, а строится на других правилах, поэтому живёт отдельным
// модулем и ничего оттуда не переиспользует, кроме общих утилит дат.
//
// Что изменилось по сути:
//  - якорь цикла — ПРОЕКТ, а не сессия. Раньше каждая выполненная сессия
//    заводила собственную ленту из четырёх стадий, и проект из трёх сессий
//    давал три параллельных цикла заживления одной и той же работы. Теперь
//    цикл один на проект и считается от его последней выполненной сессии.
//  - закрывает цикл не флаг session.healed (@deprecated), а фото в галерее
//    заживления проекта (Project.healingPhotos).
//  - стадий две вместо четырёх, и вторая — это развилка, а не напоминание.
//
// Функция чистая: время подаётся аргументом `now`, обращений к React/
// IndexedDB/localStorage нет, входные массивы не мутируются.

import type { Client } from '../domain/client';
import type { Project } from '../domain/project';
import type { Session } from '../domain/session';
import { isValidISODate, daysSinceISO, isReminderBlackoutDay } from '../utils/dates.js';

// Две точки на весь цикл вместо прежних четырёх (day1/day4/day15/day30):
//
//  - week1_check — обычный «как заживление?» ближе к концу первой недели
//    после сессии (дни 5–7, а не с 1-го — на следующий день после тату
//    оценивать ещё нечего). Показывается ПОСЛЕ ЛЮБОЙ выполненной сессии,
//    последняя она или нет: у не-последней это единственный контакт по
//    заживлению, дальше проект просто идёт к следующей сессии своим next
//    step'ом.
//  - day21_decision — вопрос мастеру «фото или коррекция», только у
//    последней сессии. 21-й день, а не 28-й — согласовано с мастером.
//
// Окна не пересекаются, поэтому у проекта в любой момент активна максимум
// одна карточка. У day21_decision нет верхней границы: развилка держится,
// пока мастер не выберет одно из двух (см. «Что закрывает цикл» ниже).
export type HealingCycleStage = 'week1_check' | 'day21_decision';

// week1_check — окно в 3 дня (5,6,7), а не одна точка, намеренно: см.
// isReminderBlackoutDay (utils/dates.ts) ниже по файлу — суббота из
// напоминаний исключена, и узкий диапазон гарантирует, что исключение
// никогда не гасит чек целиком (в трёх подряд идущих днях суббота максимум
// одна, остаются как минимум два дня, когда карточка всё равно покажется).
export const HEALING_CYCLE_WINDOWS: { stage: HealingCycleStage; minDays: number; maxDays: number | null }[] = [
  { stage: 'week1_check', minDays: 5, maxDays: 8 },
  { stage: 'day21_decision', minDays: 21, maxDays: null },
];

// Суббота — общее правило для всех напоминаний приложения (см.
// isReminderBlackoutDay в utils/dates.ts), не специфика этого модуля:
// карточка в этот день просто не показывается, без переноса на «до» или
// «после» — у week1_check и так остаётся минимум два других дня внутри окна
// (см. комментарий выше), а у day21_decision верхней границы нет вовсе,
// развилка просто подождёт до следующего дня, когда её откроют.

// `client` — null для проекта без клиента: писать некому, карточка покажется
// без кнопки «Скопировать сообщение». Тип осознанно несёт и проект, и
// клиента: сам цикл принадлежит проекту, а сообщение — клиенту.
export type HealingCycleItem = {
  project: Project;
  client: Client | null;
  sessionId: string;
  date: string; // дата сессии-якоря, ISO yyyy-mm-dd
  stage: HealingCycleStage;
  // Полный цикл или лёгкий одноразовый чек — карточке нужно это знать, чтобы
  // не обещать развилку там, где её не будет.
  isLastSession: boolean;
};

// Сессия-якорь цикла — последняя ВЫПОЛНЕННАЯ сессия проекта с внятной датой.
// Отменённые не считаются (встречи не было), запланированные тоже (заживать
// ещё нечему). При равных датах побеждает более поздняя в списке — порядок
// добавления и есть порядок, в котором мастер их заводила.
function anchorSession(project: Project): Session | null {
  let anchor: Session | null = null;
  for (const session of project.sessions) {
    if (!session.done || session.cancelled || !isValidISODate(session.date)) continue;
    if (!anchor || session.date >= anchor.date) anchor = session;
  }
  return anchor;
}

// «Это последняя сессия проекта?» У проекта «одна встреча» отвечать нечего —
// единственная сессия по определению последняя, поэтому подтверждение
// мастера там не спрашивается и не хранится (см. SessionsPlan). У остальных
// (включая старые проекты без плана) ответ берётся с самой сессии.
function isLastSessionOf(project: Project, session: Session): boolean {
  return project.sessionsPlan === 'single' || session.isLastSession;
}

// Что закрывает цикл:
//
//  1. Фото в галерее заживления, добавленное НЕ РАНЬШЕ сессии-якоря, —
//     мастер выбрала «фото», работа зажила, проект уехал в «Завершён».
//     Сравнение с датой якоря, а не просто «галерея непуста»: после
//     коррекции цикл считается заново, и снимки, сделанные до неё, его уже
//     не закрывают. Фото без даты (повреждённая/старая запись) не считается
//     — иначе оно молча гасило бы напоминания навсегда.
//  2. Запланированная сессия — мастер выбрала «коррекция» и назначила дату.
//     Гасит только развилку: чек первой недели относится к уже прошедшей
//     сессии и от будущей записи не зависит (у не-последней сессии он как
//     раз и живёт рядом с назначенной следующей встречей).
function hasHealingPhotoSince(project: Project, date: string): boolean {
  return project.healingPhotos.some((photo) => isValidISODate(photo.addedDate) && photo.addedDate >= date);
}

function hasPlannedSession(project: Project): boolean {
  return project.sessions.some((session) => !session.done && !session.cancelled);
}

// Проекты, у которых прямо сейчас открыт шаг цикла заживления. Не больше
// одной карточки на проект. Отсортированы от самой давней сессии-якоря.
//
// Перебираются ПРОЕКТЫ, а не клиенты: после Этапа 2 сессия физически лежит
// только в своём проекте, а client.sessions — вычисляемый срез по ним же
// (getClientSessions). `clients` нужен здесь единственно для того, чтобы
// приложить к карточке владельца — для сообщения и контактов.
export function healingCycleReminders(clients: Client[], projects: Project[], now: Date): HealingCycleItem[] {
  if (isReminderBlackoutDay(now)) return [];
  const clientById = new Map(clients.map((c) => [c.id, c]));
  const result: HealingCycleItem[] = [];
  for (const project of projects) {
    const session = anchorSession(project);
    if (!session) continue;
    if (hasHealingPhotoSince(project, session.date)) continue;

    const isLastSession = isLastSessionOf(project, session);
    const since = daysSinceISO(session.date, now);
    const stage = HEALING_CYCLE_WINDOWS.find((w) => since >= w.minDays && (w.maxDays === null || since < w.maxDays));
    if (!stage) continue;
    if (stage.stage === 'day21_decision' && (!isLastSession || hasPlannedSession(project))) continue;

    result.push({
      project,
      client: project.clientId ? clientById.get(project.clientId) ?? null : null,
      sessionId: session.id,
      date: session.date,
      stage: stage.stage,
      isLastSession,
    });
  }
  return result.sort((a, b) => a.date.localeCompare(b.date));
}
