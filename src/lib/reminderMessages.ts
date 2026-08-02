// Вынесено из TattoDiary.tsx (PR 3 рефакторинга). Логика не менялась —
// только перенос.
import { type ClientLanguage, type Client } from '../domain/client';
import { ISO_DATE_RE } from '../utils/dates.js';
import type { HealingStage, UpcomingSoonItem } from '../reminders/types';

// Every client-facing auto-message (healing check-in, upcoming-booking
// reminder, and whatever gets added next) is written in the client's own
// language (see Client.language, set from the Инфо tab) — keep new templates
// here rather than adding a new bare Russian string elsewhere.
const CLIENT_LOCALE: Record<ClientLanguage, string> = { ru: 'ru-RU', en: 'en-US', he: 'he-IL' };

// Один текст на каждую стадию заживления (см. HealingStage/HEALING_STAGES в
// buildReminders.ts) — day1 про самочувствие/кожу/уход, day4 про шелушение,
// day15 промежуточный, day30 — прежний финальный «как зажило».
const HEALING_TEXTS: Record<ClientLanguage, Record<HealingStage, string>> = {
  ru: {
    day1: 'Привет! Как ты сегодня, какое самочувствие? Как выглядит кожа на тату — не появилось сильного отёка или покраснения? Напоминаю: первые дни аккуратно очищай тату, наноси тонкий слой средства и не срывай корочки',
    day4: 'Привет! Как ощущения через несколько дней после сеанса? Началось шелушение — это нормальный этап заживления. Как в целом кожа, ничего не беспокоит?',
    day15: 'Привет! Как продвигается заживление? Шелушение уже позади? Если ещё чешется — не расчёсывай, кожа всё ещё восстанавливается',
    day30: 'Привет, как дела? Пишу узнать как зажила татуировка',
  },
  en: {
    day1: "Hi! How are you feeling today? How does the skin around the tattoo look — any strong swelling or redness? Quick reminder for the first days: gently clean the tattoo, apply a thin layer of aftercare, and don't pick at the scabs",
    day4: "Hi! How are you feeling a few days after the session? Peeling should be starting — that's a normal part of healing. How's the skin overall, anything bothering you?",
    day15: "Hi! How's the healing coming along? Has the peeling stopped? If it still itches, don't scratch — the skin is still recovering",
    day30: 'Hi, how are you? Just checking in on how the tattoo is healing',
  },
  he: {
    day1: 'היי! מה שלומך היום? איך העור נראה - יש נפיחות או אדמומיות חזקה? רק תזכורת לימים הראשונים: לנקות בעדינות, למרוח שכבה דקה של קרם ולא לקלף גלדים',
    day4: 'היי! מה שלומך כמה ימים אחרי הסשן? הקילוף אמור להתחיל - זה חלק נורמלי בריפוי. איך העור בסך הכל, משהו מטריד?',
    day15: 'היי! איך מתקדם הריפוי? הקילוף כבר נגמר? אם עדיין מגרד - לא לגרד, העור עדיין מחלים',
    day30: 'היי, מה שלומך? רק בודקת איך הקעקוע מחלים',
  },
};

const REMINDER_TEXTS: Record<ClientLanguage, { soon: (when: string) => string }> = {
  ru: { soon: (when) => `Привет! Как дела? Напоминаю о нашей встрече «${when}»` },
  en: { soon: (when) => `Hi! How are you? Just a reminder about our appointment: ${when}` },
  he: { soon: (when) => `היי! מה שלומך? רק תזכורת לפגישה שלנו: ${when}` },
};

// The message offered for copying on a healing check-in — deliberately not
// personalised with the client's name (master's preference).
export function healingReminderMessage(client: Client, stage: HealingStage): string {
  return HEALING_TEXTS[client.language][stage];
}

// "<weekday>, <day> <month>[, <time>]" in the client's own language/locale —
// e.g. ru: «четверг, 23 июля, 16:27», en: "Thursday, July 23, 4:27 PM". Built
// from y/m/d components (not `new Date(iso)`) for the same reason as
// dateParts below — avoids a UTC-parse day-shift in western timezones.
export function localizedWhen(dateIso: string, time: string, language: ClientLanguage): string {
  const m = ISO_DATE_RE.exec(dateIso);
  if (!m) return dateIso;
  const [y, mo, d] = dateIso.split('-').map(Number);
  const locale = CLIENT_LOCALE[language];
  const dateStr = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(y, mo - 1, d));
  if (!time) return dateStr;
  const [hh, mi] = time.split(':').map(Number);
  const timeStr = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(new Date(y, mo - 1, d, hh, mi));
  return `${dateStr}, ${timeStr}`;
}

// Auto-message for the 36–48h heads-up — master copies it to nudge the
// client about the upcoming booking, same pattern as healingReminderMessage.
export function soonReminderMessage(it: UpcomingSoonItem): string {
  const { language } = it.client;
  return REMINDER_TEXTS[language].soon(localizedWhen(it.date, it.time, language));
}
