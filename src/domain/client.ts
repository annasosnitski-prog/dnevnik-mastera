// Доменный тип клиента и связанные с ним типы/константы (документы, чат-ссылки,
// тип и язык клиента). Вынесено из TattoDiary.tsx без изменений (PR 2).
// Функция buildChatLink (построение ссылки) остаётся в компоненте — это PR 3
// (вынос функций); она импортирует отсюда ChatPlatform/CHAT_PLATFORM_DOMAINS.

import type { Session } from './session';
import type { Consultation } from './consultation';
import type { ClientNote } from './task';

export interface ClientDocument {
  id: string;
  name: string;
  fileUrl: string;
  kind: 'document' | 'photo';
  uploadedDate: string;
}

export type ChatPlatform = 'whatsapp' | 'telegram' | 'instagram' | 'facebook' | 'messenger' | 'tiktok' | 'pinterest' | 'website' | 'other';

export interface ChatLink {
  id: string;
  platform: ChatPlatform;
  url: string;
}

export const PLATFORM_LABELS: Record<ChatPlatform, string> = {
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  instagram: 'Instagram',
  facebook: 'Facebook',
  messenger: 'Messenger',
  tiktok: 'TikTok',
  pinterest: 'Pinterest',
  website: 'Сайт',
  other: 'Ссылка',
};

// A platform's own domain, keyed the same as its handle-building case below —
// lets buildChatLink recognize a pasted link that's missing only the
// "https://" prefix (e.g. "instagram.com/name", copied from a share sheet
// without the protocol).
export const CHAT_PLATFORM_DOMAINS: Partial<Record<ChatPlatform, string>> = {
  whatsapp: 'wa.me',
  telegram: 't.me',
  instagram: 'instagram.com',
  facebook: 'facebook.com',
  messenger: 'm.me',
  tiktok: 'tiktok.com',
  pinterest: 'pinterest.com',
};

export type ClientType = 'model' | 'client' | 'other';
export const CLIENT_TYPES: { value: ClientType; label: string }[] = [
  { value: 'client', label: 'Клиент' },
  { value: 'model', label: 'Модель' },
  { value: 'other', label: 'Другое' },
];

// Language the client's auto-generated messages (reminders etc.) get
// written in — set per-client in the Инфо tab, defaults to Russian.
export type ClientLanguage = 'ru' | 'en' | 'he';
export const CLIENT_LANGUAGES: { value: ClientLanguage; label: string }[] = [
  { value: 'ru', label: 'Русский' },
  { value: 'en', label: 'English' },
  { value: 'he', label: 'עברית' },
];

export interface Client {
  id: string;
  name: string; // first name, e.g. "Александра"
  surname: string;
  styles: string[]; // one or more tattoo styles
  style: string; // joined styles, kept for search / back-compat
  color: string; // marker colour (master-chosen at creation)
  clientType: ClientType; // model / client / other — filterable on the list screen
  language: ClientLanguage; // auto-generated messages (reminders etc.) are written in this language
  note: string; // notes about the client ("Заметки о клиенте")
  masterNote: string; // master's own notes, written inline from the info tab
  phone: string; // contact phone number
  skinType: string; // normal / sensitive / dry / oily / combination
  skinTone: string; // skin-tone hex chosen from the palette
  skinNotes: string; // free notes about the client's skin (legacy, superseded by allergies/skinReactions below)
  allergies: string; // known allergies — shown read-only inside a consultation
  skinReactions: string; // known skin reactions (redness, swelling...) — same
  chatLinks: ChatLink[]; // WhatsApp / Telegram / Instagram / etc.
  sessions: Session[];
  consultations: Consultation[]; // planning/mood-board entries — references + creative brief, scheduled like sessions
  documents: ClientDocument[];
  notes: ClientNote[]; // structured notes/tasks with urgency markers
  createdDate: string;
}
