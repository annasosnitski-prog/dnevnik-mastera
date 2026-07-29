// Вынесено из TattoDiary.tsx (PR 3 рефакторинга). Логика не менялась —
// только перенос.
import { type ClientLanguage, type Client } from '../domain/client';
import { ISO_DATE_RE } from '../utils/dates';
import type { UpcomingSoonItem } from '../reminders/types';

// Every client-facing auto-message (healing check-in, upcoming-booking
// reminder, and whatever gets added next) is written in the client's own
// language (see Client.language, set from the Инфо tab) — keep new templates
// here rather than adding a new bare Russian string elsewhere.
const CLIENT_LOCALE: Record<ClientLanguage, string> = { ru: 'ru-RU', en: 'en-US', he: 'he-IL' };

const REMINDER_TEXTS: Record<ClientLanguage, { healing: string; soon: (when: string) => string }> = {
  ru: {
    healing: 'Привет, как дела? Пишу узнать как зажила татуировка',
    soon: (when) => `Привет! Как дела? Напоминаю о нашей встрече «${when}»`,
  },
  en: {
    healing: 'Hi, how are you? Just checking in on how the tattoo is healing',
    soon: (when) => `Hi! How are you? Just a reminder about our appointment: ${when}`,
  },
  he: {
    healing: 'היי, מה שלומך? רק בודקת איך הקעקוע מחלים',
    soon: (when) => `היי! מה שלומך? רק תזכורת לפגישה שלנו: ${when}`,
  },
};

// The message offered for copying on a healing check-in — deliberately not
// personalised with the client's name (master's preference).
export function healingReminderMessage(client: Client): string {
  return REMINDER_TEXTS[client.language].healing;
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
