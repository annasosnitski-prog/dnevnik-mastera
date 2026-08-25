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

// @deprecated вместе с HealingStage/HEALING_STAGES (buildReminders.ts) —
// замена ниже, HEALING_CYCLE_TEXTS. Один текст на каждую из прежних четырёх
// стадий: day1 про самочувствие/кожу/уход, day4 про шелушение, day15
// промежуточный, day30 — финальный «как зажило».
const HEALING_TEXTS: Record<ClientLanguage, Record<HealingStage, string>> = {
  ru: {
    day1:
      'Привет! Как ты сегодня, какое самочувствие? Как выглядит кожа на тату — не появилось сильного отёка или покраснения?\n\n' +
      'Про уход: очищай тату 2 раза в день тёплой водой (можно с жидким мылом), промакивай насухо чистым полотенцем — чтобы не оставалось сукровицы, — и наноси тонкий слой Бепантена. Когда появятся корочки, не срывай их.\n\n' +
      'Чего нельзя: чесать и сдирать корочки или шелушащуюся кожу — может выпасть цвет; распаривать тату — бани, сауны, горячие ванны и бассейн под запретом на 2–3 недели; загорать и ходить в солярий; носить тесную синтетическую одежду, которая трёт рисунок',
    day4:
      'Привет! Как ощущения через несколько дней после сеанса? Началось шелушение — это нормальный этап заживления. Как в целом кожа, ничего не беспокоит?\n\n' +
      'Не сдирай шелушение — пусть сходит само, и пока избегай бани, сауны, бассейна и солнца',
    day15:
      'Привет! Как продвигается заживление? Шелушение уже позади? Если ещё чешется — не расчёсывай, кожа всё ещё восстанавливается.\n\n' +
      'Продолжай беречь тату от солнца до полного заживления',
    day30:
      'Привет! Как ты, уже всё зажило? Если да — было бы здорово встретиться и сфотографировать зажившую работу для портфолио, если тебе будет удобно',
  },
  en: {
    day1:
      "Hi! How are you feeling today? How does the skin around the tattoo look — any strong swelling or redness?\n\n" +
      "Aftercare: clean the tattoo twice a day with warm water (a mild liquid soap is fine), pat it dry with a clean towel — so no plasma residue is left — and apply a thin layer of Bepanthen. Once scabs form, don't pick at them.\n\n" +
      "What not to do: don't scratch or pick at scabs or peeling skin — the color can fall out; don't steam the tattoo — no baths, saunas, hot tubs or pools for 2–3 weeks; don't sunbathe or use tanning beds; avoid tight synthetic clothing that rubs against the piece",
    day4:
      "Hi! How are you feeling a few days after the session? Peeling should be starting — that's a normal part of healing. How's the skin overall, anything bothering you?\n\n" +
      "Don't pick at the peeling skin — let it come off on its own, and stay away from baths, saunas, pools and sun for now",
    day15:
      "Hi! How's the healing coming along? Has the peeling stopped? If it still itches, don't scratch — the skin is still recovering.\n\n" +
      "Keep protecting the tattoo from the sun until it's fully healed",
    day30:
      "Hi! How are you, has everything healed up? If so, it'd be lovely to meet up and take a photo of the healed piece for my portfolio, whenever suits you",
  },
  he: {
    day1:
      'היי! מה שלומך היום? איך העור נראה - יש נפיחות או אדמומיות חזקה?\n\n' +
      'טיפול: לנקות את הקעקוע פעמיים ביום במים פושרים (אפשר עם סבון נוזלי עדין), לייבש בעדינות במגבת נקייה - כדי שלא יישארו הפרשות - ולמרוח שכבה דקה של בפנטן. כשנוצרים גלדים - לא לקלף אותם.\n\n' +
      'מה אסור: לגרד או לקלף גלדים או עור מתקלף - הצבע עלול לדהות; לא סאונה, ג\'קוזי, אמבטיה חמה או בריכה למשך 2-3 שבועות; לא להשתזף בשמש או בסולריום; להימנע מבגדים צמודים וסינתטיים שמשפשפים את האזור',
    day4:
      'היי! מה שלומך כמה ימים אחרי הסשן? הקילוף אמור להתחיל - זה חלק נורמלי בריפוי. איך העור בסך הכל, משהו מטריד?\n\n' +
      'אל תקלפי את העור המתקלף - תני לו לרדת לבד, ובינתיים הימנעי מאמבטיה, סאונה, בריכה ושמש',
    day15:
      'היי! איך מתקדם הריפוי? הקילוף כבר נגמר? אם עדיין מגרד - לא לגרד, העור עדיין מחלים.\n\n' +
      'המשיכי להגן על הקעקוע מהשמש עד לריפוי מלא',
    day30:
      'היי! מה שלומך, הכל הגליד כבר? אם כן, יהיה נחמד להיפגש ולצלם את העבודה המחלימה לפורטפוליו, מתי שיהיה נוח לך',
  },
};

// Тексты нового цикла заживления (см. HealingCycleStage в
// reminders/healingCycle.ts). Стадий две вместо четырёх, поэтому и текстов
// два, а не четыре:
//  - week1_check — обычный «как заживление?» в первую неделю, вобрал в себя
//    прежние day1 (уход и запреты) и day4 (шелушение): окно одно, значит и
//    сообщение должно закрывать всю неделю сразу;
//  - day21_photo — то, что мастер отправляет, ВЫБРАВ на развилке 21-го дня
//    «фото» (прямой наследник прежнего day30). Второй половине развилки —
//    «коррекции» — своего сообщения клиенту не полагается: там мастер
//    назначает встречу, а не пишет.
const HEALING_CYCLE_TEXTS: Record<ClientLanguage, Record<HealingCycleMessage, string>> = {
  ru: {
    week1_check:
      'Привет! Как ты, какое самочувствие? Как выглядит тату — нет сильного отёка или покраснения, началось ли шелушение?\n\n' +
      'Про уход: очищай тату 2 раза в день тёплой водой (можно с жидким мылом), промакивай насухо чистым полотенцем — чтобы не оставалось сукровицы, — и наноси тонкий слой Бепантена. Когда появятся корочки, не срывай их.\n\n' +
      'Чего нельзя: чесать и сдирать корочки или шелушащуюся кожу — может выпасть цвет; распаривать тату — бани, сауны, горячие ванны и бассейн под запретом на 2–3 недели; загорать и ходить в солярий; носить тесную синтетическую одежду, которая трёт рисунок',
    day21_photo:
      'Привет! Как ты, уже всё зажило? Если да — было бы здорово встретиться и сфотографировать зажившую работу для портфолио, если тебе будет удобно',
  },
  en: {
    week1_check:
      "Hi! How are you feeling? How does the tattoo look — any strong swelling or redness, has the peeling started?\n\n" +
      "Aftercare: clean the tattoo twice a day with warm water (a mild liquid soap is fine), pat it dry with a clean towel — so no plasma residue is left — and apply a thin layer of Bepanthen. Once scabs form, don't pick at them.\n\n" +
      "What not to do: don't scratch or pick at scabs or peeling skin — the color can fall out; don't steam the tattoo — no baths, saunas, hot tubs or pools for 2–3 weeks; don't sunbathe or use tanning beds; avoid tight synthetic clothing that rubs against the piece",
    day21_photo:
      "Hi! How are you, has everything healed up? If so, it'd be lovely to meet up and take a photo of the healed piece for my portfolio, whenever suits you",
  },
  he: {
    week1_check:
      'היי! מה שלומך? איך הקעקוע נראה - יש נפיחות או אדמומיות חזקה, הקילוף כבר התחיל?\n\n' +
      'טיפול: לנקות את הקעקוע פעמיים ביום במים פושרים (אפשר עם סבון נוזלי עדין), לייבש בעדינות במגבת נקייה - כדי שלא יישארו הפרשות - ולמרוח שכבה דקה של בפנטן. כשנוצרים גלדים - לא לקלף אותם.\n\n' +
      'מה אסור: לגרד או לקלף גלדים או עור מתקלף - הצבע עלול לדהות; לא סאונה, ג\'קוזי, אמבטיה חמה או בריכה למשך 2-3 שבועות; לא להשתזף בשמש או בסולריום; להימנע מבגדים צמודים וסינתטיים שמשפשפים את האזור',
    day21_photo:
      'היי! מה שלומך, הכל הגליד כבר? אם כן, יהיה נחמד להיפגש ולצלם את העבודה המחלימה לפורטפוליו, מתי שיהיה נוח לך',
  },
};

// Не совпадает один-в-один с HealingCycleStage: у развилки 21-го дня есть
// сообщение только для ветки «фото» (см. комментарий к HEALING_CYCLE_TEXTS).
export type HealingCycleMessage = 'week1_check' | 'day21_photo';

// Сообщение цикла заживления — тот же принцип, что у healingReminderMessage:
// на языке клиента и без подстановки имени (предпочтение мастера).
export function healingCycleMessage(client: Client, kind: HealingCycleMessage): string {
  return HEALING_CYCLE_TEXTS[client.language][kind];
}

const REMINDER_TEXTS: Record<ClientLanguage, { soon: (when: string) => string }> = {
  ru: { soon: (when) => `Привет! Как дела? Напоминаю о нашей встрече «${when}»` },
  en: { soon: (when) => `Hi! How are you? Just a reminder about our appointment: ${when}` },
  he: { soon: (when) => `היי! מה שלומך? רק תזכורת לפגישה שלנו: ${when}` },
};

// @deprecated — см. HEALING_TEXTS выше; замена — healingCycleMessage.
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
