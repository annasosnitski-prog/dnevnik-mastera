// ============================================================
// ЛИЧНЫЙ КАБИНЕТ МАСТЕРА — форма записи и правила её чтения
//
// Карточка мастера (имя, контакты, реквизиты, легенда цветов и её
// собственные задачи с фото) исторически лежала в localStorage. Это было
// сознательное решение — одна запись, читается синхронно на старте, — но у
// localStorage квота порядка 5 МБ на весь дневник, тогда как у IndexedDB
// её сотни мегабайт. Задачи мастера несут фото (тот же SessionPhotos, что и
// у клиентских заметок), и в какой-то момент очередная заметка просто
// перестаёт помещаться: запись падает, заметка теряется.
//
// Получалось, что личное мастера защищено хуже всего остального: клиенты,
// проекты и контент давно в IndexedDB.
//
// Здесь — чистая часть переезда: как привести сырую запись к MasterInfo
// (одинаково и для старой localStorage-копии, и для записи из базы) и как
// выбрать источник на старте. Сам ввод-вывод — в TattoDiary.tsx.
// ============================================================
import { PLATFORM_LABELS, type ChatLink } from '../domain/client.js';
import type { ClientNote } from '../domain/task.js';
import { normalizeClientNote } from './normalize.js';
import { buildChatLink } from './chatLink.js';

export const MASTER_INFO_STORE = 'masterInfo';
// Запись всегда одна — у дневника один владелец.
export const MASTER_INFO_RECORD_ID = 'master';
// Прежнее место хранения. НЕ удаляется после переезда: остаётся страховкой,
// ровно как легаси-массивы клиента после Этапа 2.
export const MASTER_INFO_LOCAL_KEY = 'inka-master-info';

export interface MasterLink {
  id: string;
  label: string; // e.g. "Instagram", "СБП Тинькофф", "Карта Сбербанк"
  value: string; // free text — link, phone, card number...
}

export interface MasterInfo {
  name: string; // the master's own name, shown on the dashboard
  links: MasterLink[];
  bankDetails: string;
  phone: string; // the master's own phone — its own tap-to-copy block, separate from `links`
  telegramBotLink: string; // link to the booking bot in Telegram — kept apart from `chatLinks`
  chatLinks: ChatLink[]; // master's own site/WhatsApp/Telegram/Instagram/etc
  colorLabels: Record<string, string>; // MARKER_COLORS hex -> master's own label
  notes: ClientNote[]; // the master's own notes (not tied to any client), shown in «Задачи»
}

export const DEFAULT_MASTER_INFO: MasterInfo = {
  name: '',
  links: [],
  bankDetails: '',
  phone: '',
  telegramBotLink: '',
  chatLinks: [],
  colorLabels: {},
  notes: [],
};

// Приводит запись любого происхождения (старый localStorage, запись из базы,
// импортированный бэкап) к валидному MasterInfo. Терпима ко всему: битую
// запись лучше показать пустой карточкой, чем уронить приложение.
export function normalizeMasterInfo(raw: unknown): MasterInfo {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_MASTER_INFO };
  const p = raw as Record<string, any>;

  const chatLinks: ChatLink[] = Array.isArray(p.chatLinks)
    ? p.chatLinks.map((l: any, i: number) => ({
        id: String(l?.id ?? i),
        platform: (PLATFORM_LABELS as Record<string, string>)[l?.platform] ? l.platform : 'other',
        url: l?.url ?? '',
      }))
    : [];
  // Legacy standalone `website` field (briefly its own block) folds into
  // chatLinks as a «Сайт» entry, so an already-filled-in value isn't lost.
  if (typeof p.website === 'string' && p.website.trim()) {
    chatLinks.push({ id: `legacy-website-${Date.now()}`, platform: 'website', url: buildChatLink('website', p.website) });
  }

  return {
    name: typeof p.name === 'string' ? p.name : '',
    links: Array.isArray(p.links)
      ? p.links.map((l: any, i: number) => ({ id: String(l?.id ?? i), label: l?.label ?? '', value: l?.value ?? '' }))
      : [],
    bankDetails: typeof p.bankDetails === 'string' ? p.bankDetails : '',
    phone: typeof p.phone === 'string' ? p.phone : '',
    telegramBotLink: typeof p.telegramBotLink === 'string' ? p.telegramBotLink : '',
    chatLinks,
    colorLabels: p.colorLabels && typeof p.colorLabels === 'object' ? p.colorLabels : {},
    notes: Array.isArray(p.notes) ? p.notes.map((n: any, i: number) => normalizeClientNote(n, i, 'm')) : [],
  };
}

// Что показывать и что делать на старте.
//
// Запись в базе — источник истины, как только она там появилась: именно туда
// уходят все правки после переезда, и localStorage с этого момента отстаёт.
// Записи в базе нет — значит переезд ещё не случился: показываем старую
// копию и просим её перенести.
//
// Пустая карточка в базе (мастер стёрла имя и контакты) — это ЗАПИСЬ, а не
// её отсутствие: возвращать в этом случае старую localStorage-копию значило
// бы воскрешать удалённое при каждом запуске.
export function resolveMasterInfoSource(
  fromDb: MasterInfo | null,
  fromLocal: MasterInfo,
): { value: MasterInfo; needsMigration: boolean } {
  if (fromDb) return { value: fromDb, needsMigration: false };
  return { value: fromLocal, needsMigration: true };
}

// Есть ли в карточке хоть что-то, кроме умолчаний. Нужно на переезде: пустую
// карточку переносить незачем, запись в базе появится с первой же правкой.
export function isMasterInfoEmpty(info: MasterInfo): boolean {
  return (
    info.name.trim() === '' &&
    info.bankDetails.trim() === '' &&
    info.phone.trim() === '' &&
    info.telegramBotLink.trim() === '' &&
    info.links.length === 0 &&
    info.chatLinks.length === 0 &&
    info.notes.length === 0 &&
    Object.keys(info.colorLabels).length === 0
  );
}
