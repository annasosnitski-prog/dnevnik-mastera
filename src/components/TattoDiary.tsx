import { useState, useEffect, useRef } from 'react';
import { InkaLogo, DROP_CAP_FONT } from './InkaLogo';
import {
  readSyncSettings,
  writeSyncSettings,
  syncActive,
  diffAndSync,
  setConflictHandler,
  DEFAULT_ENDPOINT,
  type CalendarSyncSettings,
} from '../lib/calendarSync';

// ===================== DESIGN TOKENS =====================
// Values resolve to CSS variables (see index.css), so the same component
// re-skins itself when the document's data-theme switches between dark/light.
const COLORS = {
  bg: 'var(--bg)',
  sheet: 'var(--sheet)',
  gold: 'var(--gold)',
  textPrimary: 'var(--text)',
  textSecondary: 'var(--text-secondary)',
  textMuted: 'var(--text-muted)',
  textFaint: 'var(--text-faint)',
  textGhost: 'var(--text-ghost)',
  textTrace: 'var(--text-trace)',
};

// ── Text-size scaling ──
// "Размер текста" (Settings) scales only typography, not the whole app. The
// layout is built on fixed px, so we thread a single multiplier through a
// module-level value that the root sets at the top of every render (React
// renders top-down synchronously, so children read the current value). Font
// sizes go through fs(); box dimensions stay fixed — the OS "text size" model.
let TEXT_SCALE = 1;
const fs = (px: number): number => Math.round(px * TEXT_SCALE * 100) / 100;

// Per-client accent colours, assigned on creation (rotated through the list
// when the master doesn't pick one explicitly).
const ACCENT_COLORS = ['#4A7A5A', '#8A3040', '#6B7A4A', '#3A5A7A', '#7A4A6A', '#7A6A3A', '#3A6A7A'];

// Marker palette the master picks from at creation to tag/colour a client card.
const MARKER_COLORS = ['#B0413E', '#C67A32', '#C9A227', '#5E8C4A', '#3E7CA6', '#7A5AA0', '#A0555F', '#6E7B8B'];

// Hand-drawn engraving clouds (light theme's sky, drifting behind the content) —
// each sprite is a pre-cut alpha mask, tinted per depth layer (see CLOUD_LAYERS).
const CLOUD_SOURCES = [
  '/assets/light/clouds/cloud_1.png',
  '/assets/light/clouds/cloud_2.png',
  '/assets/light/clouds/cloud_3.png',
  '/assets/light/clouds/cloud_4.png',
  '/assets/light/clouds/cloud_5.png',
  '/assets/light/clouds/cloud_6.png',
  '/assets/light/clouds/cloud_7.png',
];

// Retro-aviation sketches (light theme) — airships (dirigibles) and a hot-air
// balloon, each an alpha mask tinted and given motion by type (see
// AviationBackground): airships cruise slowly, the balloon barely drifts but
// bobs high on the air.
type CraftType = 'airship' | 'balloon';
// ar = sprite height / width, so the mask box keeps each sketch's proportions.
const AVIATION_SOURCES: { src: string; type: CraftType; ar: number }[] = [
  { src: '/assets/light/aviation/airship_1.png', type: 'airship', ar: 0.52 },
  { src: '/assets/light/aviation/airship_2.png', type: 'airship', ar: 0.79 },
  { src: '/assets/light/aviation/balloon.png', type: 'balloon', ar: 1.68 },
];

// Skin-tone swatches (light → deep) the master picks from when creating a card.
// Light → dark. Mostly a warm-undertone gradient, with a few cool-undertone
// tones (porcelain "blue-blood" pale + olive) and warm-red tones (Arab/South
// Asian) folded in at matching lightness so the row still reads as one scale.
const SKIN_TONES = [
  '#F5E6E8', '#F6E0D0', '#EDD9DC', '#F0D0B8', '#E2C9CE', '#E8C0A0', '#E0B090',
  '#D8A47E', '#C89268', '#A69477', '#B67E52', '#8A7B5C', '#A66E44', '#B5654A',
  '#925C38', '#6B5D42', '#8F4632', '#7E4C2E', '#6A3C24', '#54301C', '#3E2416',
  '#2C1810',
];

const DURATIONS = ['2 ч', '3 ч', '4 ч', '5 ч', '6 ч', '7 ч', '8 ч'];
// Full palette of tattoo style directions (Russian tattoo-slang naming). Only
// the first STYLES_PINNED_COUNT are shown by default — a master typically
// works in 3-4 main directions — the rest sit behind "Ещё стили" in the picker.
const STYLES = [
  'Графика',
  'Файнлайн',
  'Минимализм',
  'Микрореализм',
  'Реализм',
  'Блэкворк',
  'Блэк-энд-грей',
  'Традишн',
  'Нео-традишн',
  'Ирэдзуми',
  'Трайбл',
  'Орнаментал',
  'Геометрия',
  'Дотворк',
  'Леттеринг',
  'Абстракция',
  'Скетч',
  'Лайнворк',
  'Флористика',
  'Акварель',
  'Уок-ин',
  'Другой',
];
const STYLES_PINNED_COUNT = 6;

// ── Note urgency (Eisenhower-style) markers ──
// Colour is reserved for the client marker, so urgency is encoded by emoji glyph
// + rank (used for sorting in «Дополнительно» and filtering in «Сводка»).
// A single priority scale (not the old urgent×important matrix — that 2-axis
// split was confusing in practice, e.g. "buy a discounted item" doesn't map
// cleanly onto "urgent but not important") plus a separate "interesting" tag.
type UrgencyKey = 'urgent' | 'important' | 'normal' | 'interesting';

const URGENCY: { key: UrgencyKey; emoji: string; label: string; short: string }[] = [
  { key: 'urgent', emoji: '‼️', label: 'Срочно', short: 'Срочно' },
  { key: 'important', emoji: '🔆', label: 'Важно', short: 'Важно' },
  { key: 'normal', emoji: '🌙', label: 'Обычно', short: 'Обычно' },
  { key: 'interesting', emoji: '⚡️', label: 'Интересно', short: 'Интересно' },
];
// Old 5-key urgent×important matrix → new single scale, so existing stored
// notes keep a sensible priority instead of collapsing to one default.
const LEGACY_URGENCY_MAP: Record<string, UrgencyKey> = {
  urgent_important: 'urgent',
  urgent_not: 'urgent',
  important_not_urgent: 'important',
  not_not: 'normal',
};
const DONE_EMOJI = '🍀';
const urgencyRank = (k: UrgencyKey): number => URGENCY.findIndex((u) => u.key === k);
const urgencyMeta = (k: UrgencyKey) => URGENCY.find((u) => u.key === k) || URGENCY[URGENCY.length - 1];

// ===================== DATA TYPES =====================
interface Session {
  id: string;
  name: string; // session title, e.g. "Первая", "Голубика"
  date: string; // ISO yyyy-mm-dd (or legacy free text)
  time: string; // HH:MM, 24h — optional, shown only on the master dashboard
  duration: string; // e.g. "4 ч"
  style: string; // work style for this session
  area: string; // work zone, e.g. "Левое плечо"
  colors: string; // inks / colours used
  needles: string; // needle configuration
  skinReaction: string; // how the skin reacted
  note: string;
  photos: string[]; // captured/uploaded photos (data URLs)
  done: boolean;
}

interface ClientDocument {
  id: string;
  name: string;
  fileUrl: string;
  kind: 'document' | 'photo';
  uploadedDate: string;
}

// A free-form note/task with an urgency marker and a done flag. Lives in the
// client's «Дополнительно» tab and is aggregated across clients in «Сводка».
interface ClientNote {
  id: string;
  text: string;
  urgency: UrgencyKey;
  done: boolean;
  createdDate: string;
  photos: string[];
}

type ChatPlatform = 'whatsapp' | 'telegram' | 'instagram' | 'facebook' | 'messenger' | 'tiktok' | 'other';

interface ChatLink {
  id: string;
  platform: ChatPlatform;
  url: string;
}

const PLATFORM_LABELS: Record<ChatPlatform, string> = {
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  instagram: 'Instagram',
  facebook: 'Facebook',
  messenger: 'Messenger',
  tiktok: 'TikTok',
  other: 'Ссылка',
};

// Turns a raw input (phone, @handle or full URL) into an openable chat link.
function buildChatLink(platform: ChatPlatform, raw: string): string {
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const handle = trimmed.replace(/^@/, '');
  switch (platform) {
    case 'whatsapp': {
      const digits = trimmed.replace(/[^\d]/g, '');
      return digits ? `https://wa.me/${digits}` : trimmed;
    }
    case 'telegram':
      return handle ? `https://t.me/${handle}` : trimmed;
    case 'instagram':
      return handle ? `https://ig.me/m/${handle}` : trimmed;
    case 'facebook':
      return handle ? `https://facebook.com/${handle}` : trimmed;
    case 'messenger':
      return handle ? `https://m.me/${handle}` : trimmed;
    case 'tiktok':
      return handle ? `https://tiktok.com/@${handle}` : trimmed;
    default:
      return trimmed;
  }
}

type ClientType = 'model' | 'client' | 'other';
const CLIENT_TYPES: { value: ClientType; label: string }[] = [
  { value: 'client', label: 'Клиент' },
  { value: 'model', label: 'Модель' },
  { value: 'other', label: 'Другое' },
];

interface Client {
  id: string;
  name: string; // first name, e.g. "Александра"
  surname: string;
  styles: string[]; // one or more tattoo styles
  style: string; // joined styles, kept for search / back-compat
  color: string; // marker colour (master-chosen at creation)
  clientType: ClientType; // model / client / other — filterable on the list screen
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

interface Consultation {
  id: string;
  date: string; // ISO yyyy-mm-dd
  time: string; // HH:MM, 24h
  area: string; // "Место" — body part/zone under discussion
  style: string; // "Техника и стиль" — free text, unlike the session's chip picker
  generalNotes: string; // "Общие заметки" — the client's own wishes/agreements + the master's own thoughts
  feeling: string; // "Чувство/ощущение" — the mood or sensation the piece should evoke
  creative: string; // "Креатив" — the wild/standout idea, the one distinctive twist
  inspirationSources: string; // "Источники вдохновения" — authors, references
  urgency: UrgencyKey;
  photos: string[]; // reference / mood-board images
  done: boolean;
  createdDate: string;
}

// Styles as an array regardless of legacy shape; joined label for display.
const clientStyles = (c: { styles?: string[]; style?: string }): string[] =>
  c.styles && c.styles.length ? c.styles : c.style ? [c.style] : [];
const stylesLabel = (c: { styles?: string[]; style?: string }): string =>
  clientStyles(c).join(' · ');

const SKIN_TYPES: { value: string; label: string }[] = [
  { value: '', label: 'Не указан' },
  { value: 'normal', label: 'Нормальная' },
  { value: 'sensitive', label: 'Чувствительная' },
  { value: 'dry', label: 'Сухая' },
  { value: 'oily', label: 'Жирная' },
  { value: 'combination', label: 'Комбинированная' },
  { value: 'porous', label: 'Пористая' },
  { value: 'dense', label: 'Плотная' },
  { value: 'thick', label: 'Толстая' },
  { value: 'thin', label: 'Тонкая' },
];

// ===================== DERIVED HELPERS =====================
const MONTHS_RU = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Formats an ISO yyyy-mm-dd as "24 мая 2026"; leaves legacy free-text as-is.
function formatDate(value: string): string {
  if (!value) return '';
  const m = ISO_DATE_RE.exec(value);
  if (!m) return value;
  const [y, mo, d] = value.split('-');
  return `${Number(d)} ${MONTHS_RU[Number(mo) - 1]} ${y}`;
}


// Converts a #rrggbb hex to an rgba() string at the given alpha.
function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return hex;
  const int = parseInt(m[1], 16);
  return `rgba(${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}, ${alpha})`;
}

// True for strings that start in a right-to-left script (Hebrew, Arabic, …), so
// the layout can flip the drop-cap + name into their natural reading order.
const RTL_RE = /[֐-׿؀-ۿ܀-ݏހ-޿יִ-﷿ﹰ-﻿]/;
const isRTL = (s: string) => RTL_RE.test((s || '').trim().charAt(0));

const firstLetter = (name: string) => (name ? name.charAt(0).toUpperCase() : '?');
const nameRest = (name: string) => (name ? name.slice(1) : '');

// Chronological session order: dated sessions rank by their date. A session
// without a date has nothing to rank by, so it inherits the date of the
// nearest earlier dated session in creation order (or sorts before everything
// if there isn't one yet) — it slots into the calendar gap it was added in.
// Undated sessions sharing that same slot fall back to newest-created-first
// among themselves, so the freshest one sits on top of that stack.
const sortedSessions = (sessions: Session[]): Session[] => {
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
const lastSession = (c: Client): Session | null => {
  const done = sortedSessions(c.sessions).filter((s) => s.done);
  return done.length ? done[0] : null;
};
const lastSessionDate = (c: Client) => {
  const s = lastSession(c);
  return s ? formatDate(s.date) || '—' : '—';
};
// The soonest planned (not-yet-done) session, if any — used to surface an
// upcoming appointment ahead of the last completed one on the client card.
const nextPlannedSession = (c: Client): Session | null => {
  const planned = c.sessions.filter((s) => !s.done);
  if (!planned.length) return null;
  return [...planned].sort((a, b) => (a.date || '').localeCompare(b.date || ''))[0];
};

// ── Client list sorting (list screen) ──
type SortMode = 'name' | 'added' | 'session';
const SORT_MODES: { key: SortMode; label: string }[] = [
  { key: 'name', label: 'А–Я' },
  { key: 'added', label: 'Новые' },
  { key: 'session', label: 'По сессии' },
];

// Local (not UTC) today as yyyy-mm-dd, for string-comparing against ISO dates.
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// For the «По сессии» sort: a client's most relevant appointment date. A nearest
// upcoming (not-done, today-or-later) session/consultation wins; failing that,
// the most recent past session date. hasUpcoming lets upcoming clients rank
// above those with only history.
function sessionSortKey(c: Client): { hasUpcoming: boolean; date: string } {
  const today = todayISO();
  let upcoming = '';
  const considerUpcoming = (date: string, done: boolean) => {
    if (done || !ISO_DATE_RE.test(date) || date < today) return;
    if (!upcoming || date < upcoming) upcoming = date;
  };
  c.sessions.forEach((s) => considerUpcoming(s.date, s.done));
  c.consultations.forEach((cn) => considerUpcoming(cn.date, cn.done));
  if (upcoming) return { hasUpcoming: true, date: upcoming };

  let last = '';
  c.sessions.forEach((s) => {
    if (ISO_DATE_RE.test(s.date) && s.date > last) last = s.date;
  });
  return { hasUpcoming: false, date: last };
}

// Orders the (already-filtered) client list per the chosen sort mode.
function sortClients(clients: Client[], mode: SortMode): Client[] {
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
function mostUsedStyle(clients: Client[]): string | null {
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
type UpcomingItem = { client: Client; kind: 'session' | 'consultation'; id: string; date: string; time: string };

function upcomingItems(clients: Client[], days: number): UpcomingItem[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + days);

  const result: UpcomingItem[] = [];
  for (const client of clients) {
    for (const session of client.sessions) {
      if (session.done || !ISO_DATE_RE.test(session.date)) continue;
      const d = new Date(session.date + 'T00:00:00');
      if (d >= today && d <= horizon) result.push({ client, kind: 'session', id: session.id, date: session.date, time: session.time });
    }
    for (const consultation of client.consultations) {
      if (consultation.done || !ISO_DATE_RE.test(consultation.date)) continue;
      const d = new Date(consultation.date + 'T00:00:00');
      if (d >= today && d <= horizon) {
        result.push({ client, kind: 'consultation', id: consultation.id, date: consultation.date, time: consultation.time });
      }
    }
  }
  return result.sort((a, b) => a.date.localeCompare(b.date));
}

// Counts open (not-done) notes by urgency, across all clients — the two
// buckets the dashboard surfaces: urgent, and important.
function urgencyCounts(clients: Client[]): { urgent: number; important: number } {
  let urgent = 0;
  let important = 0;
  for (const c of clients) {
    for (const n of c.notes) {
      if (n.done) continue;
      if (n.urgency === 'urgent') urgent++;
      else if (n.urgency === 'important') important++;
    }
  }
  return { urgent, important };
}

// Count of notes marked done (closed), across all clients and urgencies.
function closedNotesCount(clients: Client[]): number {
  let count = 0;
  for (const c of clients) {
    for (const n of c.notes) if (n.done) count++;
  }
  return count;
}

// Normalises a raw IndexedDB record (which may predate this schema) into a
// complete Client so the UI never has to guard against missing fields.
function normalizeClient(raw: any, index: number): Client {
  const sessions: Session[] = Array.isArray(raw?.sessions)
    ? raw.sessions.map((s: any, i: number) => ({
        id: String(s?.id ?? `${Date.now()}-${i}`),
        name: s?.name ?? '',
        date: s?.date ?? '',
        time: s?.time ?? '',
        duration: s?.duration ?? '',
        style: s?.style ?? '',
        area: s?.area ?? s?.proportions ?? '',
        colors: Array.isArray(s?.colors) ? s.colors.join(', ') : s?.colors ?? '',
        needles: s?.needles ?? '',
        skinReaction: s?.skinReaction ?? '',
        note: s?.note ?? s?.notes ?? '',
        photos: Array.isArray(s?.photos) ? s.photos : s?.photoUrl ? [s.photoUrl] : [],
        done: s?.done ?? true,
      }))
    : [];

  const latestStyle = sessions.length ? sessions[sessions.length - 1].style : '';
  const styles: string[] = Array.isArray(raw?.styles)
    ? raw.styles.filter(Boolean)
    : raw?.style
    ? [raw.style]
    : latestStyle
    ? [latestStyle]
    : [];

  return {
    id: String(raw?.id ?? Date.now() + index),
    name: raw?.name ?? '',
    surname: raw?.surname ?? '',
    styles,
    style: styles.join(' · '),
    color: raw?.color ?? ACCENT_COLORS[index % ACCENT_COLORS.length],
    clientType: CLIENT_TYPES.some((t) => t.value === raw?.clientType) ? raw.clientType : 'client',
    note: raw?.note ?? raw?.chatHistory ?? '',
    masterNote: raw?.masterNote ?? '',
    phone: raw?.phone ?? '',
    skinType: raw?.skinType ?? '',
    skinTone: raw?.skinTone ?? '',
    skinNotes: raw?.skinNotes ?? '',
    allergies: raw?.allergies ?? '',
    skinReactions: raw?.skinReactions ?? '',
    chatLinks: Array.isArray(raw?.chatLinks) ? raw.chatLinks : [],
    sessions,
    consultations: Array.isArray(raw?.consultations)
      ? raw.consultations.map((cn: any, i: number): Consultation => ({
          id: String(cn?.id ?? `${Date.now()}-c${i}`),
          date: cn?.date ?? '',
          time: cn?.time ?? '',
          area: cn?.area ?? '',
          style: cn?.style ?? '',
          generalNotes: cn?.generalNotes ?? '',
          feeling: cn?.feeling ?? '',
          creative: cn?.creative ?? '',
          inspirationSources: cn?.inspirationSources ?? '',
          urgency: URGENCY.some((u) => u.key === cn?.urgency) ? cn.urgency : 'normal',
          photos: Array.isArray(cn?.photos) ? cn.photos : [],
          done: Boolean(cn?.done),
          createdDate: cn?.createdDate ?? new Date().toISOString(),
        }))
      : [],
    documents: Array.isArray(raw?.documents) ? raw.documents : [],
    notes: Array.isArray(raw?.notes)
      ? raw.notes.map((n: any, i: number): ClientNote => ({
          id: String(n?.id ?? `${Date.now()}-n${i}`),
          text: n?.text ?? '',
          urgency: URGENCY.some((u) => u.key === n?.urgency) ? n.urgency : LEGACY_URGENCY_MAP[n?.urgency] ?? 'normal',
          done: Boolean(n?.done),
          createdDate: n?.createdDate ?? new Date().toISOString(),
          photos: Array.isArray(n?.photos) ? n.photos : [],
        }))
      : [],
    createdDate: raw?.createdDate ?? new Date().toISOString(),
  };
}

// ===================== DATABASE =====================
const initDB = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open('TattoDiaryDB', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('clients')) {
        db.createObjectStore('clients', { keyPath: 'id' });
      }
    };
  });

// ===================== SHARED SVG =====================
function StarDivider({ marginTop = 11 }: { marginTop?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop }}>
      <div style={{ flex: 1, height: 1, background: 'linear-gradient(to right, rgba(var(--gold-rgb),0.55), transparent)' }} />
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path
          d="M7 1L8.2 5.3H13L9.4 7.7L10.6 12L7 9.6L3.4 12L4.6 7.7L1 5.3H5.8Z"
          stroke="currentColor"
          strokeWidth="0.8"
          fill="currentColor" fillOpacity="0.18"
          strokeLinejoin="round"
        />
      </svg>
      <div style={{ flex: 1, height: 1, background: 'linear-gradient(to left, rgba(var(--gold-rgb),0.55), transparent)' }} />
    </div>
  );
}

// A single filled star (same silhouette as StarDivider's), reused by the
// celebration bursts below. Defaults to the theme gold; callers can override
// with a card marker colour for variety.
function StarIcon({ size = 14, color = 'var(--gold)', outline }: { size?: number; color?: string; outline?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" style={{ display: 'block' }}>
      <path
        d="M7 1L8.2 5.3H13L9.4 7.7L10.6 12L7 9.6L3.4 12L4.6 7.7L1 5.3H5.8Z"
        fill={color}
        stroke={outline}
        strokeWidth={outline ? 0.6 : 0}
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Client counts that get the bigger, bouncing milestone show instead of the
// quick everyday shower — a little escalating "achievement" ladder. Continues
// the Fibonacci-ish spacing (1, 2, 5, 8, 13) past the 15th (gold finale) so
// milestones stay rare as the client count grows, instead of ending at 15.
const MILESTONE_COUNTS = [1, 2, 5, 8, 13, 15, 21, 34, 55, 89, 144];

// Reward micro-interaction: fired when a new client card is created.
// Everyday creations get a quick CSS-driven star shower; milestone counts
// get a bigger, slower, bouncing show, plus the big grown-in client-count
// number — see runMilestoneShow below.
function CelebrationBurst({ trigger, clientCount }: { trigger: number; clientCount: number }) {
  const [stars, setStars] = useState<{ id: number; dx: number; dy: number; rot: number; delay: number; size: number }[]>([]);
  // The big client-count number that grows in over the fireworks and fades
  // out with them; numberMs is however long *this* celebration lasts (differs
  // between the everyday shower and the longer milestone show) so the two
  // stay in sync.
  const [numberMs, setNumberMs] = useState<number | null>(null);
  // Tracks the last trigger value we've already celebrated for. Initialized
  // from the incoming prop (not a plain boolean) so it stays correct even
  // under StrictMode's dev-only double-invoke of this effect on mount.
  const lastHandled = useRef(trigger);
  const milestoneContainerRef = useRef<HTMLDivElement>(null);
  const milestoneCleanupRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (lastHandled.current === trigger) return; // nothing new to celebrate
    lastHandled.current = trigger;

    if (MILESTONE_COUNTS.includes(clientCount)) {
      milestoneCleanupRef.current();
      const palette = clientCount === 13 ? 'blackred' : clientCount === 15 ? 'gold' : 'colorful';
      milestoneCleanupRef.current = runMilestoneShow(milestoneContainerRef.current, palette);
      // The big grown-in count number only plays alongside milestone shows —
      // everyday creations get just the quick star shower below, no number.
      const milestoneMs = 7200; // max stagger (~500ms) + max star life (~6700ms)
      setNumberMs(milestoneMs);
      const nt = setTimeout(() => setNumberMs(null), milestoneMs);
      return () => clearTimeout(nt);
    }

    // Distances are in vw/vh (not px) so the shower scales to the actual
    // screen and reads as filling it, on any device.
    const n = 40;
    const generated = Array.from({ length: n }, (_, i) => {
      const angle = (Math.PI * 2 * i) / n + (Math.random() - 0.5) * 0.7;
      const dist = 35 + Math.random() * 55;
      return {
        id: i,
        dx: Math.cos(angle) * dist, // vw
        dy: Math.sin(angle) * dist * 0.9 + 40, // vh, biased downward like falling
        rot: (Math.random() - 0.5) * 420,
        delay: 300 + Math.random() * 650,
        size: 12 + Math.random() * 22,
      };
    });
    setStars(generated);
    const t = setTimeout(() => setStars([]), 4200);
    return () => clearTimeout(t);
  }, [trigger, clientCount]);

  // Stop any in-flight rAF loop if the component itself unmounts.
  useEffect(() => () => milestoneCleanupRef.current(), []);

  return (
    <>
      {stars.length > 0 && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 90, overflow: 'hidden' }}>
          <div key={`pop-${trigger}`} className="inka-celebrate-pop" style={{ position: 'absolute', top: '22%', left: '50%' }}>
            <StarIcon size={30} />
          </div>
          {stars.map((s) => (
            <div
              key={`${trigger}-${s.id}`}
              className="inka-celebrate-star"
              style={
                {
                  position: 'absolute',
                  top: '22%',
                  left: '50%',
                  animationDelay: `${s.delay}ms`,
                  '--dx': `${s.dx}vw`,
                  '--dy': `${s.dy}vh`,
                  '--rot': `${s.rot}deg`,
                } as React.CSSProperties
              }
            >
              <StarIcon size={s.size} />
            </div>
          ))}
        </div>
      )}
      <div ref={milestoneContainerRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 91, overflow: 'hidden' }} />
      {numberMs !== null && (
        <>
          <div
            key={`count-${trigger}`}
            className="inka-celebrate-number"
            style={
              {
                position: 'absolute',
                top: '50%',
                left: '50%',
                zIndex: 92,
                pointerEvents: 'none',
                fontFamily: DROP_CAP_FONT,
                fontWeight: 600,
                color: 'var(--gold)',
                fontSize: '33vh',
                lineHeight: 1,
                textShadow: '0 4px 24px rgba(0,0,0,0.6)',
                animationDuration: `${numberMs}ms`,
              } as React.CSSProperties
            }
          >
            {clientCount}
          </div>
          {clientCount === 15 && (
            // A second copy of the same digit, same growth timing, showing
            // only a diagonal light streak (thick band + trailing thin band)
            // sweeping across the solid-gold number underneath.
            <div
              key={`shine-${trigger}`}
              aria-hidden
              className="inka-celebrate-number inka-celebrate-number-diagonal-shine"
              style={
                {
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  zIndex: 93,
                  pointerEvents: 'none',
                  fontFamily: DROP_CAP_FONT,
                  fontWeight: 600,
                  fontSize: '33vh',
                  lineHeight: 1,
                  animationDuration: `${numberMs}ms, 1200ms`,
                } as React.CSSProperties
              }
            >
              {clientCount}
            </div>
          )}
        </>
      )}
    </>
  );
}

// Milestone celebration (1st/2nd/5th/8th/13th client): stars of very varied
// size and speed launch from the same point as the everyday shower, bounce
// off the screen edges losing a bit of energy each time, and fade out over
// several seconds — slow enough to actually watch. Runs as a plain
// requestAnimationFrame loop mutating DOM nodes directly (not React state),
// since driving 20+ elements at 60fps through re-renders would be wasteful.
// Returns a cleanup function that cancels the loop and removes the nodes.
function runMilestoneShow(container: HTMLDivElement | null, palette: 'colorful' | 'blackred' | 'gold'): () => void {
  if (!container) return () => {};
  const rect = container.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;
  const originX = w / 2;
  const originY = h * 0.22;

  const colors =
    palette === 'blackred'
      ? ['#0B0B0B', '#1A1414', '#8A1620', '#C0242F']
      : palette === 'gold'
      ? ['var(--gold)'] // 15th milestone: exclusively gold, no other hues mixed in
      : ['var(--gold)', ...MARKER_COLORS];
  const isDark = (c: string) => c === '#0B0B0B' || c === '#1A1414';

  type Star = {
    el: HTMLDivElement;
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    rot: number;
    vrot: number;
    born: number;
    life: number;
  };

  const n = 22;
  const setupNow = performance.now();
  const stars: Star[] = [];

  for (let i = 0; i < n; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 60 + Math.random() * 220; // px/s — "разные скорости"
    let size = 10 + Math.random() * 20;
    if (Math.random() < 0.28) size += 30 + Math.random() * 22; // some significantly bigger
    const color = colors[Math.floor(Math.random() * colors.length)];
    const outline = isDark(color) ? '#C0242F' : undefined;

    const el = document.createElement('div');
    el.style.position = 'absolute';
    el.style.left = '0';
    el.style.top = '0';
    el.style.willChange = 'transform, opacity';
    el.innerHTML = starSvgMarkup(size, color, outline);
    container.appendChild(el);

    stars.push({
      el,
      x: originX,
      y: originY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size,
      rot: Math.random() * 360,
      vrot: (Math.random() - 0.5) * 90,
      born: setupNow + Math.random() * 500,
      life: 4500 + Math.random() * 2200, // ~4.5–6.7s — slow enough to watch
    });
  }

  const damping = 0.82; // energy lost on each bounce, so they gradually settle
  let raf = 0;
  let lastT = setupNow;

  const step = (t: number) => {
    const dt = Math.min((t - lastT) / 1000, 0.05);
    lastT = t;
    let anyAlive = false;

    for (const s of stars) {
      if (t < s.born) {
        anyAlive = true;
        continue;
      }
      const age = t - s.born;
      if (age > s.life) continue;
      anyAlive = true;

      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.rot += s.vrot * dt;

      const r = s.size / 2;
      if (s.x - r < 0) {
        s.x = r;
        s.vx = Math.abs(s.vx) * damping;
      } else if (s.x + r > w) {
        s.x = w - r;
        s.vx = -Math.abs(s.vx) * damping;
      }
      if (s.y - r < 0) {
        s.y = r;
        s.vy = Math.abs(s.vy) * damping;
      } else if (s.y + r > h) {
        s.y = h - r;
        s.vy = -Math.abs(s.vy) * damping;
      }

      const fadeStart = s.life * 0.6;
      const opacity = age < fadeStart ? 1 : Math.max(0, 1 - (age - fadeStart) / (s.life - fadeStart));

      s.el.style.transform = `translate(${s.x - r}px, ${s.y - r}px) rotate(${s.rot}deg)`;
      s.el.style.opacity = String(opacity);
    }

    raf = anyAlive ? requestAnimationFrame(step) : 0;
    if (!anyAlive) cleanup();
  };

  raf = requestAnimationFrame(step);

  function cleanup() {
    if (raf) cancelAnimationFrame(raf);
    stars.forEach((s) => s.el.remove());
  }

  return cleanup;
}

function starSvgMarkup(size: number, color: string, outline?: string): string {
  const strokeAttrs = outline ? ` stroke="${outline}" stroke-width="0.6" stroke-linejoin="round"` : '';
  return `<svg width="${size}" height="${size}" viewBox="0 0 14 14" fill="none" style="display:block"><path d="M7 1L8.2 5.3H13L9.4 7.7L10.6 12L7 9.6L3.4 12L4.6 7.7L1 5.3H5.8Z" fill="${color}"${strokeAttrs} /></svg>`;
}

// Ambient background: a field of small gold dots + occasional sparkle stars
// that twinkle in place (pure CSS opacity/transform animation — no JS loop,
// so it's cheap even sitting behind every screen). Positions/timings are
// randomised once per mount via useState's lazy initializer.
//
// Each screen's wrapper is both the transformed (slide-nav) element AND the
// scroll container, so a plain inset:0 layer sitting inside it scrolls away
// with the content after one screenful — there's no clean way to pin it to
// the viewport without restructuring every screen's scroll container. The
// pragmatic fix: give the star field a tall virtual canvas (covers several
// screens' worth of scrolling) with proportionally more stars, so scrolling
// a long list/notes feed still reveals stars instead of running out.
const STARFIELD_COUNT = 140;
const STARFIELD_HEIGHT_VH = 300;
const METEOR_COUNT = 7;
// Cool blue-white star tone (a touch of blue, near-white), varied per star.
const coolStar = () => `hsl(${205 + Math.random() * 22}, ${34 + Math.random() * 34}%, ${80 + Math.random() * 16}%)`;

// Dark theme's sky: twinkling blue-white stars and an occasional «звездопад»
// (meteors streaking down-left). The light theme's counterpart is
// CloudsBackground — so this renders only in the dark theme (blue-white stars
// looked out of place speckling the cream light background).
function StarfieldBackground() {
  const isLight = useIsLightTheme();
  const [stars] = useState(() =>
    Array.from({ length: STARFIELD_COUNT }, () => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 1.2 + Math.random() * 2.2,
      color: coolStar(),
      duration: 1.8 + Math.random() * 3.4,
      delay: Math.random() * 4,
      sparkle: Math.random() < 0.16,
    })),
  );

  // Shooting stars — travel distance drives the CSS custom props; each is
  // visible for only a slice of its cycle so passes stay occasional.
  const [meteors] = useState(() =>
    Array.from({ length: METEOR_COUNT }, () => {
      const travel = 220 + Math.random() * 220;
      return {
        left: 22 + Math.random() * 72,
        top: Math.random() * 72,
        length: 70 + Math.random() * 85,
        mx: -travel,
        my: travel,
        duration: 7 + Math.random() * 9,
        delay: -Math.random() * 16,
      };
    }),
  );

  if (isLight) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: `${STARFIELD_HEIGHT_VH}vh`,
        overflow: 'hidden',
        pointerEvents: 'none',
        opacity: 0.7,
        zIndex: 0,
      }}
    >
      {/* Twinkling stars */}
      {stars.map((s, i) => (
        <div
          key={i}
          className="inka-star-twinkle"
          style={{
            position: 'absolute',
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.sparkle ? s.size * 2.4 : s.size,
            height: s.sparkle ? s.size * 2.4 : s.size,
            borderRadius: s.sparkle ? 0 : '50%',
            background: s.sparkle ? 'transparent' : s.color,
            boxShadow: s.sparkle ? 'none' : `0 0 ${s.size * 2}px ${s.color}`,
            animationDuration: `${s.duration}s`,
            animationDelay: `${s.delay}s`,
          }}
        >
          {s.sparkle && (
            <svg width="100%" height="100%" viewBox="0 0 14 14" fill="none">
              <path d="M7 1L8.2 5.3H13L9.4 7.7L10.6 12L7 9.6L3.4 12L4.6 7.7L1 5.3H5.8Z" fill={s.color} />
            </svg>
          )}
        </div>
      ))}

      {/* «Звездопад» — meteors */}
      {meteors.map((m, i) => (
        <div
          key={`met-${i}`}
          className="inka-meteor"
          style={{
            position: 'absolute',
            left: `${m.left}%`,
            top: `${m.top}%`,
            width: m.length,
            height: 2,
            borderRadius: 2,
            background: 'linear-gradient(to left, rgba(223,236,255,0.95), rgba(190,215,255,0.35) 45%, transparent)',
            boxShadow: '0 0 6px rgba(205,228,255,0.7)',
            ['--mx' as string]: `${m.mx}px`,
            ['--my' as string]: `${m.my}px`,
            animationDuration: `${m.duration}s`,
            animationDelay: `${m.delay}s`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

// Reads data-theme off the root element and stays in sync with it — lets a
// component gate its rendering on the theme without threading a prop through
// every screen that mounts it.
function useIsLightTheme(): boolean {
  const [isLight, setIsLight] = useState(() => document.documentElement.getAttribute('data-theme') === 'light');
  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => setIsLight(root.getAttribute('data-theme') === 'light'));
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);
  return isLight;
}

// Five depth layers of clouds, far → near. Nearer layers are DARKER, larger,
// and drift faster (parallax); farther layers are paler, smaller, slower. They
// render in this order, so nearer (darker) layers overlap the distant paler
// ones — the closest-to-the-viewer clouds read darkest.
const CLOUD_LAYERS = [
  { color: '#D0C29B', scale: 0.56, durationMul: 1.85, opacity: 0.38, count: 7 }, // far / lightest
  { color: '#B6A06E', scale: 0.73, durationMul: 1.45, opacity: 0.45, count: 7 },
  { color: '#957842', scale: 0.92, durationMul: 1.15, opacity: 0.5, count: 6 },
  { color: '#6D5220', scale: 1.13, durationMul: 0.92, opacity: 0.55, count: 6 },
  { color: '#493611', scale: 1.38, durationMul: 0.72, opacity: 0.6, count: 6 }, // near / darkest
];

// Width is capped well under what the drift keyframes' off-screen margin
// (see .inka-cloud-drift in index.css) can hide, so a cloud never pops into
// view mid-screen — it always slides in from past the edge.
function buildCloudLayers(seeded: boolean) {
  return CLOUD_LAYERS.map((layer) => {
    const band = 100 / layer.count;
    const offset = Math.floor(Math.random() * CLOUD_SOURCES.length);
    const clouds = Array.from({ length: layer.count }, (_, i) => ({
      src: CLOUD_SOURCES[(i + offset) % CLOUD_SOURCES.length],
      // Loose bands (jitter wider than the band) keep clouds spread down the
      // whole scroll while still letting neighbours drift into each other.
      top: i * band + (Math.random() - 0.3) * band * 2,
      width: (160 + Math.random() * 100) * layer.scale,
      flip: Math.random() < 0.5,
      driftDuration: (40 + Math.random() * 40) * layer.durationMul,
      // Mount seeds clouds already mid-flight (negative delay) so the sky isn't
      // empty on first paint; refreshes use a small positive stagger so
      // re-entering clouds always slide in from off-screen.
      driftDelay: seeded ? -Math.random() * 90 : Math.random() * 20,
      bobDuration: 6 + Math.random() * 6,
      bobDelay: -Math.random() * 8,
    }));
    return { color: layer.color, opacity: layer.opacity, clouds };
  });
}

// Light theme's sky — hand-drawn engraving clouds in five depth layers,
// drifting past at their own speed with a gentle bob. The dark theme's
// counterpart is StarfieldBackground above. Spans the same tall virtual area
// as the starfield (rather than just the first viewport) so clouds keep
// appearing down the whole scroll instead of only in the first screen.
function CloudsBackground() {
  const isLight = useIsLightTheme();
  const [layers, setLayers] = useState(() => buildCloudLayers(true));
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    // Long-running infinite CSS animations can silently stall on mobile
    // browsers (tab throttling, a PWA backgrounded by screen lock/app
    // switch) — a couple of minutes parked on one screen was enough for the
    // sky to freeze and stay frozen. Rebuilding the cloud elements from
    // scratch (fresh key, so React actually recreates the DOM nodes rather
    // than patching props) whenever the app regains visibility, plus every
    // minute regardless, means a stall never lasts long.
    const refresh = () => {
      setLayers(buildCloudLayers(false));
      setGeneration((g) => g + 1);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisibility);
    const interval = setInterval(refresh, 60000);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(interval);
    };
  }, []);

  if (!isLight) return null;

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: `${STARFIELD_HEIGHT_VH}vh`, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
      {layers.map((layer, li) =>
        layer.clouds.map((c, i) => (
          <div
            key={`${li}-${i}-${generation}`}
            className="inka-cloud-drift"
            style={{
              top: `${c.top}%`,
              animationDuration: `${c.driftDuration}s`,
              animationDelay: `${c.driftDelay}s`,
            }}
          >
            <div
              className="inka-cloud-bob"
              style={{
                width: c.width,
                height: c.width * 0.5,
                backgroundColor: layer.color,
                WebkitMaskImage: `url(${c.src})`,
                maskImage: `url(${c.src})`,
                WebkitMaskSize: 'contain',
                maskSize: 'contain',
                WebkitMaskRepeat: 'no-repeat',
                maskRepeat: 'no-repeat',
                WebkitMaskPosition: 'center',
                maskPosition: 'center',
                opacity: layer.opacity,
                transform: c.flip ? 'scaleX(-1)' : undefined,
                animationDuration: `${c.bobDuration}s`,
                animationDelay: `${c.bobDelay}s`,
              }}
            />
          </div>
        )),
      )}
    </div>
  );
}

// Muted per-type tints, all desaturated to sit quietly inside the warm light
// palette (never bright): airships a soft burnt-amber, the balloon a pale,
// washed-out brick red.
const CRAFT_COLOR: Record<CraftType, string> = {
  airship: '#9C6A34',
  balloon: '#BE8E86',
};
// The balloon reads paler still — a lower opacity on top of its lighter tone.
const CRAFT_OPACITY: Record<CraftType, number> = {
  airship: 0.62,
  balloon: 0.42,
};

// Per-type flight character. duration = seconds to cross the screen (airships
// cruise, balloon barely moves); bobY = vertical float amplitude (balloon
// floats highest); width in px; bob = seconds per float cycle.
const CRAFT_MOTION: Record<CraftType, { width: [number, number]; duration: [number, number]; bobY: [number, number]; bob: [number, number] }> = {
  airship: { width: [165, 215], duration: [78, 120], bobY: [8, 15], bob: [9, 13] },
  balloon: { width: [78, 116], duration: [150, 230], bobY: [24, 40], bob: [7, 12] },
};

const rand = (min: number, max: number) => min + Math.random() * (max - min);

function buildCraft(seeded: boolean) {
  const band = 100 / AVIATION_SOURCES.length;
  return AVIATION_SOURCES.map((craft, i) => {
    const m = CRAFT_MOTION[craft.type];
    // Right-moving craft use the forward drift and are flipped to face right;
    // left-movers use the reversed drift and keep the sprites' native (left)
    // facing. Balloons are symmetric, so the flip only sets travel direction.
    const goesRight = Math.random() < 0.5;
    return {
      src: craft.src,
      type: craft.type,
      ar: craft.ar,
      top: i * band + rand(-band * 0.3, band * 0.5),
      width: rand(m.width[0], m.width[1]),
      goesRight,
      // Face travel direction: right-movers flip (sprites face left natively).
      flip: craft.type === 'balloon' ? false : goesRight,
      driftDuration: rand(m.duration[0], m.duration[1]),
      driftDelay: seeded ? -rand(0, m.duration[1]) : rand(0, 15),
      bobY: rand(m.bobY[0], m.bobY[1]),
      bobDuration: rand(m.bob[0], m.bob[1]),
      bobDelay: -rand(0, 8),
    };
  });
}

// Light theme's retro-aviation layer — airships and a balloon drifting across
// the sky in front of the clouds, each with motion suited to its kind.
function AviationBackground() {
  const isLight = useIsLightTheme();
  const [craft, setCraft] = useState(() => buildCraft(true));
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    // Same stall-guard as the clouds: rebuild on regained visibility + hourly.
    const refresh = () => {
      setCraft(buildCraft(false));
      setGeneration((g) => g + 1);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisibility);
    const interval = setInterval(refresh, 60000);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(interval);
    };
  }, []);

  if (!isLight) return null;

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: `${STARFIELD_HEIGHT_VH}vh`, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
      {craft.map((c, i) => (
        <div
          key={`${i}-${generation}`}
          className={c.goesRight ? 'inka-cloud-drift' : 'inka-drift-rev'}
          style={{ top: `${c.top}%`, animationDuration: `${c.driftDuration}s`, animationDelay: `${c.driftDelay}s` }}
        >
          <div
            className="inka-cloud-bob"
            style={{ ['--bob-y' as string]: `${c.bobY}px`, animationDuration: `${c.bobDuration}s`, animationDelay: `${c.bobDelay}s` } as React.CSSProperties}
          >
            <div
              style={{
                width: c.width,
                height: c.width * c.ar,
                backgroundColor: CRAFT_COLOR[c.type],
                WebkitMaskImage: `url(${c.src})`,
                maskImage: `url(${c.src})`,
                WebkitMaskSize: 'contain',
                maskSize: 'contain',
                WebkitMaskRepeat: 'no-repeat',
                maskRepeat: 'no-repeat',
                WebkitMaskPosition: 'center',
                maskPosition: 'center',
                opacity: CRAFT_OPACITY[c.type],
                transform: `scaleX(${c.flip ? -1 : 1})`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// Small reward for winning the "opened the app" trial game — a gold star
// shower filling the whole screen (reuses the milestone show's physics, just
// full-screen instead of anchored to a client card).
function FunWinSalute({ trigger }: { trigger: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<() => void>(() => {});
  const lastHandled = useRef(trigger);

  useEffect(() => {
    if (lastHandled.current === trigger) return;
    lastHandled.current = trigger;
    cleanupRef.current();
    cleanupRef.current = runMilestoneShow(containerRef.current, 'gold');
  }, [trigger]);

  useEffect(() => () => cleanupRef.current(), []);

  return <div ref={containerRef} style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 210, overflow: 'hidden' }} />;
}

function SheetStarDivider() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 11 }}>
      <div style={{ flex: 1, height: 1, background: 'linear-gradient(to right, rgba(var(--gold-rgb),0.5), transparent)' }} />
      <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
        <path d="M4.5 0.5L5.2 3.5H8.5L5.9 5.2L6.6 8.5L4.5 6.8L2.4 8.5L3.1 5.2L0.5 3.5H3.8Z" fill="currentColor" fillOpacity="0.3" />
      </svg>
      <div style={{ flex: 1, height: 1, background: 'linear-gradient(to left, rgba(var(--gold-rgb),0.5), transparent)' }} />
    </div>
  );
}

// Form field label — 8.5px uppercase, wide tracking.
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: fs(11),
        color: COLORS.textGhost,
        letterSpacing: '2.5px',
        textTransform: 'uppercase',
        marginBottom: 7,
      }}
    >
      {children}
    </div>
  );
}

const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  background: 'rgba(var(--surface-rgb),0.03)',
  border: '1px solid rgba(var(--gold-rgb),0.18)',
  borderRadius: 2,
  padding: '10px 14px',
  fontFamily: "'Inter', sans-serif",
  color: COLORS.textPrimary,
  outline: 'none',
  letterSpacing: '0.3px',
};

const SUBMIT_STYLE: React.CSSProperties = {
  border: '1px solid rgba(var(--gold-rgb),0.35)',
  borderRadius: 2,
  padding: 14,
  textAlign: 'center',
  cursor: 'pointer',
  background: 'rgba(var(--gold-rgb),0.05)',
};

// ===================== THEME =====================
type Theme = 'dark' | 'light';

function readInitialTheme(): Theme {
  if (typeof document !== 'undefined') {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'light' || attr === 'dark') return attr;
  }
  try {
    const stored = localStorage.getItem('inka-theme');
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    /* ignore */
  }
  return 'dark';
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem('inka-theme', theme);
  } catch {
    /* ignore */
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'light' ? '#E4E1D8' : '#0D0B08');
}

// ===================== USER PREFERENCES =====================
// Master-adjustable display settings (Settings tab), persisted locally.
interface Prefs {
  brightness: number; // app brightness 0.75–1.15 (CSS filter)
  textScale: number; // text size 1.0–1.75 (font multiplier; 1.0 shown as 80%)
  textBright: 'normal' | 'high' | 'max'; // text tone level (dark theme)
  upcomingWindowDays: number; // how many days ahead the dashboard's "upcoming sessions" widget looks
  statsWindowDays: number; // how many days ahead the dashboard's stat-grid counters (sessions/consultations) look
  gameMode: boolean; // rock-paper-scissors gate before creating a client/session/note
}
const UPCOMING_WINDOW_OPTIONS = [3, 5, 7, 10, 14];
// Master-facing labels read "3 дня / Неделя / 2 недели / Месяц" — plain day
// counts underneath so the same upcomingItems() window logic applies.
const STATS_WINDOW_OPTIONS: { days: number; label: string }[] = [
  { days: 3, label: '3 дня' },
  { days: 7, label: 'Неделя' },
  { days: 14, label: '2 недели' },
  { days: 30, label: 'Месяц' },
];
const DEFAULT_PREFS: Prefs = { brightness: 1, textScale: 1, textBright: 'normal', upcomingWindowDays: 7, statsWindowDays: 30, gameMode: true };

function readInitialPrefs(): Prefs {
  try {
    const raw = localStorage.getItem('inka-prefs');
    if (raw) {
      const p = JSON.parse(raw);
      return {
        brightness: typeof p.brightness === 'number' ? p.brightness : 1,
        // Clamp to the new floor (1.0): older values below it are lifted.
        textScale: typeof p.textScale === 'number' ? Math.max(1, p.textScale) : 1,
        textBright: p.textBright === 'high' || p.textBright === 'max' ? p.textBright : 'normal',
        upcomingWindowDays: UPCOMING_WINDOW_OPTIONS.includes(p.upcomingWindowDays) ? p.upcomingWindowDays : 7,
        statsWindowDays: STATS_WINDOW_OPTIONS.some((o) => o.days === p.statsWindowDays) ? p.statsWindowDays : 30,
        gameMode: typeof p.gameMode === 'boolean' ? p.gameMode : true,
      };
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_PREFS };
}

// ===================== MASTER'S OWN CARD =====================
// A single record (not per-client) where the master keeps their own contacts,
// payment details and a personal legend for what each card marker colour
// means — kept flexible (free label + value pairs) rather than a fixed
// schema, since masters' needs here vary a lot.
interface MasterLink {
  id: string;
  label: string; // e.g. "Instagram", "СБП Тинькофф", "Карта Сбербанк"
  value: string; // free text — link, phone, card number...
}
interface MasterInfo {
  name: string; // the master's own name, shown on the dashboard
  links: MasterLink[];
  bankDetails: string;
  colorLabels: Record<string, string>; // MARKER_COLORS hex -> master's own label
}
const DEFAULT_MASTER_INFO: MasterInfo = { name: '', links: [], bankDetails: '', colorLabels: {} };

function readInitialMasterInfo(): MasterInfo {
  try {
    const raw = localStorage.getItem('inka-master-info');
    if (raw) {
      const p = JSON.parse(raw);
      return {
        name: typeof p.name === 'string' ? p.name : '',
        links: Array.isArray(p.links)
          ? p.links.map((l: any, i: number) => ({ id: String(l?.id ?? i), label: l?.label ?? '', value: l?.value ?? '' }))
          : [],
        bankDetails: typeof p.bankDetails === 'string' ? p.bankDetails : '',
        colorLabels: p.colorLabels && typeof p.colorLabels === 'object' ? p.colorLabels : {},
      };
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_MASTER_INFO };
}

// ===================== MAIN APP =====================
export default function TattoDiary() {
  const [clients, setClients] = useState<Client[]>([]);
  // Distinguishes "still loading from IndexedDB" from "genuinely no clients
  // yet" — without it, the first-run empty state flashes on every load before
  // the (real) client list comes in.
  const [clientsLoaded, setClientsLoaded] = useState(false);
  const [db, setDb] = useState<IDBDatabase | null>(null);
  const [dbError, setDbError] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>(readInitialTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  // Display preferences (brightness / text size / text tone).
  const [prefs, setPrefs] = useState<Prefs>(readInitialPrefs);
  useEffect(() => {
    document.documentElement.setAttribute('data-textbright', prefs.textBright);
    try {
      localStorage.setItem('inka-prefs', JSON.stringify(prefs));
    } catch {
      /* ignore */
    }
  }, [prefs]);

  // The master's own contacts/payment/colour-legend card (single record).
  const [masterInfo, setMasterInfo] = useState<MasterInfo>(readInitialMasterInfo);
  useEffect(() => {
    try {
      localStorage.setItem('inka-master-info', JSON.stringify(masterInfo));
    } catch {
      /* ignore */
    }
  }, [masterInfo]);

  // Синхронизация с Инка-календарём. Секрет хранится в отдельном ключе
  // localStorage (не в бэкапе!) и остаётся только на этом устройстве.
  const [calendarSync, setCalendarSync] = useState<CalendarSyncSettings>(readSyncSettings);
  useEffect(() => {
    writeSyncSettings(calendarSync);
  }, [calendarSync]);

  // Предупреждение о пересечении: если синхронизированная запись легла
  // поверх чего-то в календаре (например брони клиента через бота) —
  // показываем янтарный баннер. Запись не блокируется, решение за мастером.
  const [syncWarning, setSyncWarning] = useState<string | null>(null);
  useEffect(() => {
    setConflictHandler(setSyncWarning);
    return () => setConflictHandler(null);
  }, []);

  const [screen, setScreen] = useState<'list' | 'detail' | 'settings' | 'summary' | 'master'>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'info' | 'sessions' | 'extra'>('sessions');
  const [searchQuery, setSearchQuery] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [colorFilter, setColorFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | ClientType>('all');
  const [sortMode, setSortMode] = useState<SortMode>('name');
  const [sortOpen, setSortOpen] = useState(false);

  const [showNewClientForm, setShowNewClientForm] = useState(false);
  const [showNewSessionForm, setShowNewSessionForm] = useState(false);
  const [showEditClientForm, setShowEditClientForm] = useState(false);
  // Session being edited (null when adding a new one).
  const [editSession, setEditSession] = useState<Session | null>(null);
  // Tapping "+" on the sessions tab first asks «Сессия» or «Консультация» —
  // this holds that choice sheet's open state.
  const [showAddChoice, setShowAddChoice] = useState(false);
  const [showNewConsultationForm, setShowNewConsultationForm] = useState(false);
  const [editConsultation, setEditConsultation] = useState<Consultation | null>(null);

  // Bumped whenever a new client is created, to (re)trigger the star-shower
  // celebration overlay — see <CelebrationBurst>. celebrationCount captures
  // which client number this is (1st, 2nd, ...), used to pick the milestone
  // (1/2/5/8/13) show.
  const [celebrationKey, setCelebrationKey] = useState(0);
  const [celebrationCount, setCelebrationCount] = useState(0);

  // Trial gate: holds the pending action to run once the user wins a round
  // (or loses 3 in a row — see TrialGate). Mandatory for the very first
  // client; a random chance after that (client/session/note creation), all of
  // it disabled via prefs.gameMode. Which mini-game shows (RPS or cups) is a
  // separate coin flip inside TrialGate itself.
  const [rpsChallenge, setRpsChallenge] = useState<null | { onWin: () => void }>(null);
  const RPS_RANDOM_CHANCE = 0.15;
  const runGated = (mandatory: boolean, action: () => void) => {
    if (!prefs.gameMode || !(mandatory || Math.random() < RPS_RANDOM_CHANCE)) {
      action();
      return;
    }
    setRpsChallenge({ onWin: action });
  };

  // Purely-for-fun trial gate: same random chance, but rolled on opening or
  // returning to the app rather than before creating something — nothing is
  // gated on the outcome. A win plays a small gold salute; a loss (even after
  // the taunt) just closes with no reward.
  const [funChallenge, setFunChallenge] = useState(false);
  const [funWinTrigger, setFunWinTrigger] = useState(0);
  // Read fresh on every render (no extra effects to keep them in sync) so the
  // mount-only effect below always sees the latest values.
  const liveRef = useRef({ gameMode: prefs.gameMode, rpsChallenge, funChallenge });
  liveRef.current = { gameMode: prefs.gameMode, rpsChallenge, funChallenge };
  const hasRolledOnMount = useRef(false);

  useEffect(() => {
    const maybeTriggerFun = () => {
      const live = liveRef.current;
      if (!live.gameMode || live.rpsChallenge || live.funChallenge) return;
      if (Math.random() < RPS_RANDOM_CHANCE) setFunChallenge(true);
    };
    // Guards against StrictMode's dev-only double-invoke re-rolling on mount.
    const mountTimer = setTimeout(() => {
      if (!hasRolledOnMount.current) {
        hasRolledOnMount.current = true;
        maybeTriggerFun();
      }
    }, 900);
    const onVisible = () => {
      if (document.visibilityState === 'visible') maybeTriggerFun();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(mountTimer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  useEffect(() => {
    initDB()
      .then((database) => {
        setDb(database);
        loadClients(database);
      })
      .catch((err) => {
        console.error('IndexedDB init failed:', err);
        setDbError('Хранилище недоступно. В режиме приватного просмотра переключитесь на обычную вкладку.');
      });
  }, []);

  const loadClients = (database: IDBDatabase) => {
    const tx = database.transaction('clients', 'readonly');
    const request = tx.objectStore('clients').getAll();
    request.onsuccess = () => {
      setClients((request.result || []).map(normalizeClient));
      setClientsLoaded(true);
    };
    request.onerror = () => setDbError('Не удалось загрузить клиентов.');
  };

  const saveClient = (client: Client) => {
    if (!db) {
      setDbError('Хранилище недоступно — изменения не сохранены.');
      return;
    }
    // Синхронизация с Инка-календарём: saveClient — единственная воронка
    // всех изменений (сессии, консультации, заметки...), поэтому дифф
    // старой и новой карточки здесь ловит любое изменение записей.
    // Снимок старой версии берём ДО записи; сам sync — fire-and-forget
    // после успешного сохранения, он не блокирует и не ломает UI.
    const prevClient = clients.find((c) => c.id === client.id) ?? null;
    const tx = db.transaction('clients', 'readwrite');
    tx.objectStore('clients').put(client);
    tx.oncomplete = () => {
      loadClients(db);
      diffAndSync(prevClient, client, calendarSync);
    };
    tx.onerror = () => setDbError('Не удалось сохранить изменения.');
  };

  const deleteClient = (id: string) => {
    if (!db) {
      setDbError('Хранилище недоступно — клиент не удалён.');
      return;
    }
    // Удаление клиента убирает из календаря и все его синхронизированные
    // записи (diffAndSync со "старое есть, нового нет" шлёт delete).
    const prevClient = clients.find((c) => c.id === id) ?? null;
    const tx = db.transaction('clients', 'readwrite');
    tx.objectStore('clients').delete(id);
    tx.oncomplete = () => {
      loadClients(db);
      diffAndSync(prevClient, null, calendarSync);
      setScreen('list');
      setSelectedId(null);
      setShowEditClientForm(false);
    };
    tx.onerror = () => setDbError('Не удалось удалить клиента.');
  };

  // Wipes the store and repopulates it from an imported backup (Настройки → Резервная копия).
  const replaceAllClients = (newClients: Client[]) => {
    if (!db) {
      setDbError('Хранилище недоступно — импорт не выполнен.');
      return;
    }
    const tx = db.transaction('clients', 'readwrite');
    const store = tx.objectStore('clients');
    store.clear();
    newClients.forEach((c) => store.put(c));
    tx.oncomplete = () => loadClients(db);
    tx.onerror = () => setDbError('Не удалось импортировать данные.');
  };

  const selectedClient = clients.find((c) => c.id === selectedId) || null;

  const filteredClients = sortClients(
    clients.filter((c) => {
      const q = searchQuery.trim().toLowerCase();
      if (q && !`${c.name} ${c.surname} ${c.style}`.toLowerCase().includes(q)) return false;
      if (colorFilter !== 'all' && c.color.toLowerCase() !== colorFilter.toLowerCase()) return false;
      if (typeFilter !== 'all' && (c.clientType || 'client') !== typeFilter) return false;
      return true;
    }),
    sortMode,
  );
  const filtersActive = colorFilter !== 'all' || typeFilter !== 'all';

  const openClient = (client: Client) => {
    setSelectedId(client.id);
    setActiveTab('sessions');
    setScreen('detail');
  };

  const goBack = () => setScreen('list');

  const closeNewClient = () => setShowNewClientForm(false);
  const closeNewSession = () => {
    setShowNewSessionForm(false);
    setEditSession(null);
  };
  const closeNewConsultation = () => {
    setShowNewConsultationForm(false);
    setEditConsultation(null);
  };
  const closeEditClient = () => setShowEditClientForm(false);
  const closeBackdrop = () => {
    setShowNewClientForm(false);
    setShowNewSessionForm(false);
    setShowEditClientForm(false);
    setShowNewConsultationForm(false);
    setShowAddChoice(false);
    setEditSession(null);
    setEditConsultation(null);
  };

  const handleUpdateClient = (data: { name: string; surname: string; styles: string[]; color: string; clientType: ClientType; note: string }) => {
    if (!selectedClient) return;
    saveClient({
      ...selectedClient,
      name: data.name.trim(),
      surname: data.surname.trim(),
      styles: data.styles,
      style: data.styles.join(' · '),
      color: data.color,
      clientType: data.clientType,
      note: data.note.trim(),
    });
    setShowEditClientForm(false);
  };

  const deleteSession = (sessionId: string) => {
    if (!selectedClient) return;
    saveClient({ ...selectedClient, sessions: selectedClient.sessions.filter((s) => s.id !== sessionId) });
  };

  const handleAddConsultation = (data: {
    date: string;
    time: string;
    area: string;
    style: string;
    generalNotes: string;
    feeling: string;
    creative: string;
    inspirationSources: string;
    urgency: UrgencyKey;
    photos: string[];
  }) => {
    if (!selectedClient) return;
    const fields = { ...data, done: false };
    let consultations: Consultation[];
    if (editConsultation) {
      consultations = selectedClient.consultations.map((c) =>
        c.id === editConsultation.id ? { ...c, ...fields } : c,
      );
    } else {
      consultations = [
        ...selectedClient.consultations,
        { id: Date.now().toString(), createdDate: new Date().toISOString(), ...fields },
      ];
    }
    saveClient({ ...selectedClient, consultations });
    setShowNewConsultationForm(false);
    setEditConsultation(null);
  };

  const deleteConsultation = (consultationId: string) => {
    if (!selectedClient) return;
    saveClient({ ...selectedClient, consultations: selectedClient.consultations.filter((c) => c.id !== consultationId) });
  };

  // ── Notes (used by the client «Дополнительно» tab and the «Сводка» screen) ──
  const upsertNote = (clientId: string, note: ClientNote) => {
    const c = clients.find((x) => x.id === clientId);
    if (!c) return;
    const exists = c.notes.some((n) => n.id === note.id);
    saveClient({
      ...c,
      notes: exists ? c.notes.map((n) => (n.id === note.id ? note : n)) : [...c.notes, note],
    });
  };
  const deleteNote = (clientId: string, noteId: string) => {
    const c = clients.find((x) => x.id === clientId);
    if (!c) return;
    saveClient({ ...c, notes: c.notes.filter((n) => n.id !== noteId) });
  };

  const updateSessionPhotos = (sessionId: string, photos: string[]) => {
    if (!selectedClient) return;
    saveClient({
      ...selectedClient,
      sessions: selectedClient.sessions.map((s) => (s.id === sessionId ? { ...s, photos } : s)),
    });
  };

  // Quick status flip for a planned session (or to revert a done one), without
  // opening the edit form.
  const toggleSessionDone = (sessionId: string) => {
    if (!selectedClient) return;
    saveClient({
      ...selectedClient,
      sessions: selectedClient.sessions.map((s) => (s.id === sessionId ? { ...s, done: !s.done } : s)),
    });
  };

  const handleCreateClient = (data: {
    name: string;
    surname: string;
    phone: string;
    styles: string[];
    color: string;
    clientType: ClientType;
    skinType: string;
    skinTone: string;
    skinNotes: string;
    note: string;
  }) => {
    const client: Client = {
      id: Date.now().toString(),
      name: data.name.trim(),
      surname: data.surname.trim(),
      styles: data.styles,
      style: data.styles.join(' · '),
      color: data.color || ACCENT_COLORS[clients.length % ACCENT_COLORS.length],
      clientType: data.clientType,
      note: data.note.trim(),
      masterNote: '',
      phone: data.phone.trim(),
      skinType: data.skinType,
      skinTone: data.skinTone,
      skinNotes: data.skinNotes.trim(),
      allergies: '',
      skinReactions: '',
      chatLinks: [],
      sessions: [],
      consultations: [],
      documents: [],
      notes: [],
      createdDate: new Date().toISOString(),
    };
    saveClient(client);
    setShowNewClientForm(false);
    setCelebrationCount(clients.length + 1);
    setCelebrationKey((k) => k + 1);
  };

  const handleAddSession = (data: {
    name: string;
    date: string;
    time: string;
    duration: string;
    style: string;
    area: string;
    colors: string;
    needles: string;
    skinReaction: string;
    note: string;
    photos: string[];
    done: boolean;
  }) => {
    if (!selectedClient) return;
    const fields = {
      name: data.name.trim(),
      date: data.date,
      time: data.time,
      duration: data.duration,
      style: data.style,
      area: data.area.trim(),
      colors: data.colors.trim(),
      needles: data.needles.trim(),
      skinReaction: data.skinReaction.trim(),
      note: data.note.trim(),
      photos: data.photos,
      done: data.done,
    };
    let sessions: Session[];
    if (editSession) {
      // Update the existing session in place, keeping its id (status can now
      // change between planned and done via the form).
      sessions = selectedClient.sessions.map((s) =>
        s.id === editSession.id ? { ...s, ...fields } : s,
      );
    } else {
      sessions = [...selectedClient.sessions, { id: Date.now().toString(), ...fields }];
    }
    const mergedStyles =
      data.style && !clientStyles(selectedClient).includes(data.style)
        ? [...clientStyles(selectedClient), data.style]
        : clientStyles(selectedClient);
    saveClient({
      ...selectedClient,
      styles: mergedStyles,
      style: mergedStyles.join(' · '),
      sessions,
    });
    setShowNewSessionForm(false);
    setEditSession(null);
  };

  const sheetOpen = showNewClientForm || showNewSessionForm || showEditClientForm || showNewConsultationForm || showAddChoice;

  // Set the text-size multiplier for this render pass before any child renders.
  TEXT_SCALE = prefs.textScale;

  return (
    <div
      className="app-shell"
      style={{
        position: 'relative',
        width: '100%',
        margin: '0 auto',
        overflow: 'hidden',
        background: COLORS.bg,
        fontFamily: "'Inter', sans-serif",
        filter: prefs.brightness !== 1 ? `brightness(${prefs.brightness})` : undefined,
      }}
    >
      {/* ═══════════ LIST SCREEN ═══════════ */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: screen === 'list' ? 'translateX(0)' : 'translateX(-110%)',
          transition: 'transform 0.45s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
          overflowY: 'auto',
          overflowX: 'hidden',
          zIndex: 1,
          background: COLORS.bg,
        }}
      >
        {/* Dot-grid texture overlay */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: 'radial-gradient(circle, rgba(var(--gold-rgb),0.035) 1px, transparent 1px)',
            backgroundSize: '22px 22px',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />
        <StarfieldBackground />
        <CloudsBackground />
        <AviationBackground />

        {/* Safe-area / status spacer */}
        <div style={{ height: 'calc(env(safe-area-inset-top) + 18px)', flexShrink: 0 }} />

        {/* App header */}
        <div style={{ padding: '6px 24px 12px', position: 'relative', zIndex: 10 }}>
          <InkaLogo height={fs(34)} />
          <div
            style={{
              fontSize: fs(9.66),
              color: COLORS.textGhost,
              letterSpacing: `${fs(2.97)}px`,
              textTransform: 'uppercase',
              marginTop: 3,
              fontStyle: 'italic',
            }}
          >
            Дневник Мастера
          </div>
          <StarDivider />
        </div>

        {/* Search bar */}
        <div style={{ padding: '0 20px 14px', position: 'relative', zIndex: 10 }}>
          <div
            style={{
              background: 'rgba(var(--surface-rgb),0.022)',
              border: '1px solid rgba(var(--gold-rgb),0.11)',
              borderRadius: 3,
              padding: '8px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 9,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ flexShrink: 0, color: 'var(--ink-faint)' }}>
              <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.2" />
              <line x1="8.7" y1="8.7" x2="12" y2="12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Найти клиента..."
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                fontFamily: "'Inter', sans-serif",
                color: COLORS.textPrimary,
                fontStyle: searchQuery ? 'normal' : 'italic',
                letterSpacing: '0.3px',
              }}
            />
          </div>
        </div>

        {/* Sort + filter — two icon-triggered dropdown menus sitting side by
            side. A shared invisible backdrop closes whichever is open on an
            outside tap. */}
        {(sortOpen || filtersOpen) && (
          <div
            onClick={() => {
              setSortOpen(false);
              setFiltersOpen(false);
            }}
            style={{ position: 'fixed', inset: 0, zIndex: 15 }}
          />
        )}
        <div style={{ padding: '0 20px 14px', position: 'relative', zIndex: 16, display: 'flex', gap: 10 }}>
          {/* ── Сортировка ── */}
          <div style={{ position: 'relative' }}>
            <div
              onClick={() => {
                setSortOpen((v) => !v);
                setFiltersOpen(false);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
                fontSize: fs(12),
                color: COLORS.textFaint,
                letterSpacing: '1.5px',
                textTransform: 'uppercase',
                padding: '6px 11px',
                border: '1px solid rgba(var(--gold-rgb),0.15)',
                borderRadius: 2,
              }}
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                <line x1="2.5" y1="4" x2="11" y2="4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                <line x1="2.5" y1="8" x2="8.5" y2="8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                <line x1="2.5" y1="12" x2="6" y2="12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              Сортировка {sortOpen ? '▴' : '▾'}
            </div>
            {sortOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  left: 0,
                  minWidth: 150,
                  background: COLORS.sheet,
                  border: '1px solid rgba(var(--gold-rgb),0.2)',
                  borderRadius: 4,
                  padding: 6,
                  boxShadow: '0 10px 28px rgba(0,0,0,0.4)',
                  zIndex: 17,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                }}
              >
                {SORT_MODES.map((m) => {
                  const active = sortMode === m.key;
                  return (
                    <div
                      key={m.key}
                      onClick={() => {
                        setSortMode(m.key);
                        setSortOpen(false);
                      }}
                      style={{
                        fontSize: fs(12),
                        padding: '8px 10px',
                        borderRadius: 2,
                        cursor: 'pointer',
                        background: active ? 'rgba(var(--gold-rgb),0.1)' : 'transparent',
                        color: active ? COLORS.gold : COLORS.textFaint,
                        letterSpacing: '0.5px',
                        textTransform: 'uppercase',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {active ? '• ' : ''}
                      {m.label}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Фильтры (цвет-маркер + тип клиента) ── */}
          <div style={{ position: 'relative' }}>
            <div
              onClick={() => {
                setFiltersOpen((v) => !v);
                setSortOpen(false);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
                fontSize: fs(12),
                color: filtersActive ? COLORS.gold : COLORS.textFaint,
                letterSpacing: '1.5px',
                textTransform: 'uppercase',
                padding: '6px 11px',
                border: filtersActive ? '1px solid rgba(var(--gold-rgb),0.5)' : '1px solid rgba(var(--gold-rgb),0.15)',
                borderRadius: 2,
              }}
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                <path d="M2 3.5h12l-4.7 5.3V13l-2.6-1.5V8.8L2 3.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
              </svg>
              Фильтры{filtersActive ? ' •' : ''} {filtersOpen ? '▴' : '▾'}
            </div>
            {filtersOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  right: 0,
                  width: 250,
                  maxWidth: 'calc(100vw - 40px)',
                  background: COLORS.sheet,
                  border: '1px solid rgba(var(--gold-rgb),0.2)',
                  borderRadius: 4,
                  padding: 12,
                  boxShadow: '0 10px 28px rgba(0,0,0,0.4)',
                  zIndex: 17,
                }}
              >
                <div style={{ fontSize: fs(10), color: COLORS.textGhost, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 8 }}>
                  Цвет-маркер
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 14 }}>
                  <div
                    onClick={() => setColorFilter('all')}
                    style={{
                      fontSize: fs(11),
                      padding: '4px 9px',
                      borderRadius: 2,
                      cursor: 'pointer',
                      border: colorFilter === 'all' ? '1px solid rgba(var(--gold-rgb),0.6)' : '1px solid rgba(var(--gold-rgb),0.15)',
                      background: colorFilter === 'all' ? 'rgba(var(--gold-rgb),0.08)' : 'transparent',
                      color: colorFilter === 'all' ? COLORS.gold : COLORS.textFaint,
                      letterSpacing: '0.4px',
                      textTransform: 'uppercase',
                    }}
                  >
                    Все
                  </div>
                  {MARKER_COLORS.map((c) => {
                    const sel = colorFilter.toLowerCase() === c.toLowerCase();
                    return (
                      <div
                        key={c}
                        onClick={() => setColorFilter(sel ? 'all' : c)}
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: '50%',
                          background: c,
                          cursor: 'pointer',
                          border: sel ? '2px solid var(--text)' : '1px solid rgba(var(--gold-rgb),0.25)',
                          boxShadow: sel ? `0 0 0 2px ${c}` : undefined,
                        }}
                      />
                    );
                  })}
                </div>
                <div style={{ fontSize: fs(10), color: COLORS.textGhost, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 8 }}>
                  Тип
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {(['all', ...CLIENT_TYPES.map((t) => t.value)] as ('all' | ClientType)[]).map((v) => {
                    const label = v === 'all' ? 'Все' : CLIENT_TYPES.find((t) => t.value === v)?.label;
                    const active = typeFilter === v;
                    return (
                      <div
                        key={v}
                        onClick={() => setTypeFilter(v)}
                        style={{
                          fontSize: fs(11),
                          padding: '4px 9px',
                          borderRadius: 2,
                          cursor: 'pointer',
                          border: active ? '1px solid rgba(var(--gold-rgb),0.6)' : '1px solid rgba(var(--gold-rgb),0.15)',
                          background: active ? 'rgba(var(--gold-rgb),0.08)' : 'transparent',
                          color: active ? COLORS.gold : COLORS.textFaint,
                          letterSpacing: '0.4px',
                          textTransform: 'uppercase',
                        }}
                      >
                        {label}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Error banner */}
        {dbError && (
          <div
            style={{
              margin: '0 16px 12px',
              padding: '10px 14px',
              borderRadius: 3,
              border: '1px solid rgba(138,48,64,0.5)',
              background: 'rgba(138,48,64,0.12)',
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
              position: 'relative',
              zIndex: 10,
            }}
          >
            <span style={{ flex: 1, fontSize: fs(15), color: '#C99', fontStyle: 'italic' }}>{dbError}</span>
            <button
              onClick={() => setDbError(null)}
              style={{ background: 'none', border: 'none', color: '#C99', cursor: 'pointer', flexShrink: 0 }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Пересечение в Инка-календаре — янтарное предупреждение (не ошибка:
            запись сохранена, мастер сама решает, накладка это или намеренно). */}
        {syncWarning && (
          <div
            style={{
              margin: '0 16px 12px',
              padding: '10px 14px',
              borderRadius: 3,
              border: '1px solid rgba(184,134,11,0.5)',
              background: 'rgba(184,134,11,0.12)',
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
              position: 'relative',
              zIndex: 10,
            }}
          >
            <span style={{ flex: 1, fontSize: fs(15), color: '#D4A94E', fontStyle: 'italic' }}>{syncWarning}</span>
            <button
              onClick={() => setSyncWarning(null)}
              style={{ background: 'none', border: 'none', color: '#D4A94E', cursor: 'pointer', flexShrink: 0 }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Cards grid — 2 columns on phones, 3 from tablet width up (see .inka-client-grid). */}
        <div
          className="inka-client-grid"
          style={{
            padding: '2px 16px 88px',
            display: 'grid',
            gap: 10,
            position: 'relative',
            zIndex: 5,
            // Promote the whole grid to a single GPU layer so both columns move
            // together during momentum scroll (prevents the columns from
            // desyncing/"jumping" as the compositor re-tiles the scroll area).
            transform: 'translateZ(0)',
          }}
        >
          {filteredClients.map((client) => (
            <ClientGridCard key={client.id} client={client} onClick={() => openClient(client)} />
          ))}
        </div>

        {/* Empty state */}
        {clients.length > 0 && filteredClients.length === 0 && (
          <div
            style={{
              position: 'absolute',
              top: 280,
              left: 0,
              right: 0,
              textAlign: 'center',
              fontSize: fs(15),
              fontStyle: 'italic',
              color: COLORS.textGhost,
              pointerEvents: 'none',
            }}
          >
            Ничего не найдено
          </div>
        )}

        {/* First-run empty state — points at the pinned add button since the
            grid no longer has its own add tile. Gated on clientsLoaded so it
            doesn't flash before the real (non-empty) list has loaded. */}
        {clientsLoaded && clients.length === 0 && (
          <div
            style={{
              position: 'absolute',
              top: 280,
              left: 0,
              right: 0,
              textAlign: 'center',
              fontSize: fs(15),
              fontStyle: 'italic',
              color: COLORS.textGhost,
              pointerEvents: 'none',
              padding: '0 40px',
            }}
          >
            Пока нет клиентов — нажмите «+» внизу, чтобы добавить первого
          </div>
        )}
      </div>

      {/* Bottom navigation — sibling of the screens so it pins to the shell
          bottom (never scrolls). Shown on the list and settings screens, hidden
          while a bottom sheet is open so it can't sit over the sheet's controls. */}
      {(screen === 'list' || screen === 'settings' || screen === 'summary' || screen === 'master') && !sheetOpen && (
        <BottomNav
          active={screen}
          onNavigate={(s) => setScreen(s)}
          onAddClient={() => runGated(clients.length === 0, () => setShowNewClientForm(true))}
        />
      )}

      {/* «Мастер» shortcut — pinned next to the logo (sibling of the
          screens, so it never scrolls away with the client grid
          underneath). Settings now lives inside the Мастер page itself; the
          add-client button moved to the bottom nav centre. Next to the
          icon, a small tag previews the nearest upcoming session's date. */}
      {screen === 'list' && !sheetOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(env(safe-area-inset-top) + 31px)',
            right: 20,
            zIndex: 20,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          {(() => {
            const next = upcomingItems(clients, 365)[0];
            if (!next) return null;
            return (
              <div
                style={{
                  textAlign: 'right',
                  lineHeight: 1.3,
                  fontStyle: 'italic',
                }}
              >
                <div style={{ fontSize: 7.5, letterSpacing: '0.8px', textTransform: 'uppercase', color: COLORS.textGhost }}>Ближайшая</div>
                <div style={{ fontSize: 10.5, fontWeight: 400, color: COLORS.textGhost, whiteSpace: 'nowrap' }}>
                  {formatDate(next.date).replace(/ \d{4}$/, '')}
                </div>
              </div>
            );
          })()}
          <div
            onClick={() => setScreen('master')}
            role="button"
            aria-label="Мастер"
            style={{
              width: 48,
              height: 48,
              flexShrink: 0,
              borderRadius: '50%',
              border: '1px solid rgba(var(--gold-rgb),0.25)',
              background: 'rgba(var(--gold-rgb),0.03)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <svg width="24" height="24" viewBox="0 0 20 20" fill="none" style={{ color: 'var(--gold)' }}>
              <circle cx="10" cy="6.6" r="3.3" stroke="currentColor" strokeWidth="1.3" fill="currentColor" fillOpacity="0.12" />
              <path
                d="M4 17C4 13.4 6.6 11.7 10 11.7C13.4 11.7 16 13.4 16 17"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="currentColor"
                fillOpacity="0.12"
              />
            </svg>
          </div>
        </div>
      )}

      {/* ═══════════ SUMMARY SCREEN ═══════════ */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: screen === 'summary' ? 'translateX(0)' : 'translateX(110%)',
          transition: 'transform 0.45s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
          overflowY: 'auto',
          overflowX: 'hidden',
          zIndex: 3,
          background: COLORS.bg,
        }}
      >
        {screen === 'summary' && (
          <SummaryScreen
            clients={clients}
            onToggleDone={(clientId, note) => upsertNote(clientId, note)}
            onEditNote={(clientId, note) => upsertNote(clientId, note)}
            onOpenClient={(id) => {
              setSelectedId(id);
              setActiveTab('extra');
              setScreen('detail');
            }}
            onOpenConsultation={(clientId, consultationId) => {
              const client = clients.find((c) => c.id === clientId);
              const consultation = client?.consultations.find((c) => c.id === consultationId);
              if (!client || !consultation) return;
              setSelectedId(client.id);
              setEditConsultation(consultation);
              setShowNewConsultationForm(true);
            }}
          />
        )}
      </div>

      {/* ═══════════ MASTER DASHBOARD ═══════════ */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: screen === 'master' ? 'translateX(0)' : 'translateX(110%)',
          transition: 'transform 0.45s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
          overflowY: 'auto',
          overflowX: 'hidden',
          zIndex: 3,
          background: COLORS.bg,
        }}
      >
        {screen === 'master' && (
          <MasterDashboardScreen
            clients={clients}
            masterInfo={masterInfo}
            onChangeMasterInfo={setMasterInfo}
            prefs={prefs}
            onChangePrefs={setPrefs}
            onOpenSession={(clientId, itemId, kind) => {
              const client = clients.find((c) => c.id === clientId);
              if (!client) return;
              if (kind === 'consultation') {
                const consultation = client.consultations.find((c) => c.id === itemId);
                if (!consultation) return;
                setSelectedId(client.id);
                setEditConsultation(consultation);
                setShowNewConsultationForm(true);
                return;
              }
              const session = client.sessions.find((s) => s.id === itemId);
              if (!session) return;
              setSelectedId(client.id);
              setEditSession(session);
              setShowNewSessionForm(true);
            }}
            onOpenSettings={() => setScreen('settings')}
            onImport={replaceAllClients}
          />
        )}
      </div>

      {/* ═══════════ SETTINGS SCREEN ═══════════ */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: screen === 'settings' ? 'translateX(0)' : 'translateX(110%)',
          transition: 'transform 0.45s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
          overflowY: 'auto',
          overflowX: 'hidden',
          zIndex: 3,
          background: COLORS.bg,
        }}
      >
        <SettingsScreen
          theme={theme}
          onToggleTheme={toggleTheme}
          prefs={prefs}
          onChange={setPrefs}
          masterInfo={masterInfo}
          onChangeMasterInfo={setMasterInfo}
          calendarSync={calendarSync}
          onChangeCalendarSync={setCalendarSync}
        />
      </div>

      {/* ═══════════ DETAIL SCREEN ═══════════ */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: screen === 'detail' ? 'translateX(0)' : 'translateX(110%)',
          transition: 'transform 0.45s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
          overflow: 'hidden',
          zIndex: 2,
          background: COLORS.bg,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {selectedClient && (
          <DetailScreen
            client={selectedClient}
            activeTab={activeTab}
            onTab={setActiveTab}
            onBack={goBack}
            onSave={saveClient}
            onEditClient={() => setShowEditClientForm(true)}
            onAddSession={() => setShowAddChoice(true)}
            onEditSession={(session) => { setEditSession(session); setShowNewSessionForm(true); }}
            onDeleteSession={deleteSession}
            onUpdateSessionPhotos={updateSessionPhotos}
            onToggleSessionDone={toggleSessionDone}
            onEditConsultation={(consultation) => { setEditConsultation(consultation); setShowNewConsultationForm(true); }}
            onDeleteConsultation={deleteConsultation}
            onAddDocument={(doc) => saveClient({ ...selectedClient, documents: [...selectedClient.documents, doc] })}
            onRemoveDocument={(docId) =>
              saveClient({ ...selectedClient, documents: selectedClient.documents.filter((d) => d.id !== docId) })
            }
            onUpsertNote={(note) => upsertNote(selectedClient.id, note)}
            // Adding a note is NOT gated behind the mini-game. The composer
            // clears its text the moment it hands the note off, so gating here
            // (unlike client/session creation, which gates opening the form
            // before anything is typed) could eat a task the master already
            // wrote if they dismissed the game — leaving some clients missing
            // tasks they thought they'd saved. Notes always save immediately.
            onAddNote={(text, urgency, photos) =>
              upsertNote(selectedClient.id, {
                id: Date.now().toString(),
                text,
                urgency,
                done: false,
                createdDate: new Date().toISOString(),
                photos,
              })
            }
            onDeleteNote={(noteId) => deleteNote(selectedClient.id, noteId)}
          />
        )}
      </div>

      {/* ═══════════ BACKDROP ═══════════ */}
      <div
        onClick={closeBackdrop}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.65)',
          zIndex: 14,
          opacity: sheetOpen ? 1 : 0,
          pointerEvents: sheetOpen ? 'auto' : 'none',
          transition: 'opacity 0.3s',
        }}
      />

      {/* ═══════════ NEW CLIENT SHEET ═══════════ */}
      {/* The game (mandatory for the first client, random after) already ran
          when "+" was tapped — see runGated above — so submitting here just
          creates the client outright. */}
      <NewClientSheet open={showNewClientForm} onClose={closeNewClient} onCreate={handleCreateClient} />

      {/* ═══════════ EDIT CLIENT SHEET ═══════════ */}
      <EditClientSheet
        open={showEditClientForm}
        client={selectedClient}
        onClose={closeEditClient}
        onSave={handleUpdateClient}
        onDelete={() => selectedClient && deleteClient(selectedClient.id)}
      />

      {/* ═══════════ NEW / EDIT SESSION SHEET ═══════════ */}
      {/* The game for a new session already ran when "Добавить сессию" was
          tapped — see onAddSession above — so submitting here just saves it. */}
      <NewSessionSheet
        open={showNewSessionForm}
        clientName={selectedClient?.name || ''}
        initial={editSession}
        onClose={closeNewSession}
        onAdd={handleAddSession}
      />

      {/* ═══════════ ADD CHOICE (session vs consultation) ═══════════ */}
      <AddChoiceSheet
        open={showAddChoice}
        onClose={() => setShowAddChoice(false)}
        onPickSession={() => {
          setShowAddChoice(false);
          runGated(false, () => {
            setEditSession(null);
            setShowNewSessionForm(true);
          });
        }}
        onPickConsultation={() => {
          setShowAddChoice(false);
          runGated(false, () => {
            setEditConsultation(null);
            setShowNewConsultationForm(true);
          });
        }}
      />

      {/* ═══════════ NEW / EDIT CONSULTATION SHEET ═══════════ */}
      <NewConsultationSheet
        open={showNewConsultationForm}
        clientName={selectedClient?.name || ''}
        client={selectedClient}
        initial={editConsultation}
        onClose={closeNewConsultation}
        onAdd={handleAddConsultation}
      />

      {/* ═══════════ CELEBRATION (new client created) ═══════════ */}
      <CelebrationBurst trigger={celebrationKey} clientCount={celebrationCount} />
      <FunWinSalute trigger={funWinTrigger} />

      {/* ═══════════ TRIAL GATE (mini-game before creating something) ═══════════ */}
      {rpsChallenge && (
        <TrialGate
          onWin={() => {
            const { onWin } = rpsChallenge;
            setRpsChallenge(null);
            onWin();
          }}
          onCancel={() => setRpsChallenge(null)}
        />
      )}

      {/* ═══════════ TRIAL GATE (just-for-fun, on app open/return) ═══════════ */}
      {funChallenge && (
        <TrialGate
          onWin={() => setFunChallenge(false)}
          onCancel={() => setFunChallenge(false)}
          onOutcome={(result) => {
            if (result === 'win') setFunWinTrigger((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}

// ===================== TRIAL GATE =====================
// A little "trial" gate: the user must win a round to proceed. Each time it
// fires, it randomly picks one of the mini-games below (rock-paper-scissors
// or the shell/cups game). Ties (RPS only) replay for free. Three losses in a
// row make the app "win" the series — it still lets the user through, but not
// before a kawaii tongue-out taunt.
const RPS_MOVES = ['rock', 'scissors', 'paper'] as const;
type RPSMove = (typeof RPS_MOVES)[number];
const RPS_LABELS: Record<RPSMove, string> = { rock: 'Камень', scissors: 'Ножницы', paper: 'Бумага' };
// What each move beats.
const RPS_BEATS: Record<RPSMove, RPSMove> = { rock: 'scissors', scissors: 'paper', paper: 'rock' };

// Kawaii hand-gesture icons for the three moves — soft rounded shapes in the
// app's gold line-art style, so the gate reads as an actual game and not a
// row of buttons.
function RPSHandIcon({ move, size = 56 }: { move: RPSMove; size?: number }) {
  const stroke = 'var(--gold)';
  const fill = 'rgba(var(--gold-rgb),0.16)';
  if (move === 'rock') {
    return (
      <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
        <rect x="40" y="76" width="24" height="16" rx="7" fill={fill} stroke={stroke} strokeWidth="3.5" />
        <rect x="28" y="36" width="46" height="42" rx="18" fill={fill} stroke={stroke} strokeWidth="3.5" />
        <rect x="18" y="48" width="18" height="24" rx="9" fill={fill} stroke={stroke} strokeWidth="3.5" />
        <path d="M42 38V48M54 38V48M64 40V50" stroke={stroke} strokeWidth="2.6" strokeLinecap="round" />
      </svg>
    );
  }
  if (move === 'paper') {
    return (
      <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
        <rect x="38" y="78" width="26" height="14" rx="6" fill={fill} stroke={stroke} strokeWidth="3.5" />
        <rect x="27" y="44" width="48" height="36" rx="14" fill={fill} stroke={stroke} strokeWidth="3.5" />
        <rect x="30" y="14" width="10" height="38" rx="5" fill={fill} stroke={stroke} strokeWidth="3" />
        <rect x="43" y="8" width="10" height="44" rx="5" fill={fill} stroke={stroke} strokeWidth="3" />
        <rect x="56" y="8" width="10" height="44" rx="5" fill={fill} stroke={stroke} strokeWidth="3" />
        <rect x="69" y="14" width="10" height="38" rx="5" fill={fill} stroke={stroke} strokeWidth="3" />
        <rect x="14" y="48" width="20" height="12" rx="6" fill={fill} stroke={stroke} strokeWidth="3" transform="rotate(-30 24 54)" />
      </svg>
    );
  }
  // scissors — victory-sign fingers over a small folded fist
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <rect x="36" y="80" width="24" height="14" rx="6" fill={fill} stroke={stroke} strokeWidth="3.5" />
      <rect x="30" y="52" width="36" height="30" rx="14" fill={fill} stroke={stroke} strokeWidth="3.5" />
      <rect x="36" y="8" width="10" height="48" rx="5" fill={fill} stroke={stroke} strokeWidth="3" transform="rotate(-12 41 32)" />
      <rect x="54" y="8" width="10" height="48" rx="5" fill={fill} stroke={stroke} strokeWidth="3" transform="rotate(12 59 32)" />
    </svg>
  );
}

function RPSTauntFace() {
  return (
    <svg width="128" height="128" viewBox="0 0 100 100" fill="none">
      <path d="M27 41Q34 33 41 41" stroke="var(--gold)" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M59 41Q66 33 73 41" stroke="var(--gold)" strokeWidth="3" strokeLinecap="round" fill="none" />
      <circle cx="25" cy="57" r="6" fill="var(--gold)" opacity="0.32" />
      <circle cx="75" cy="57" r="6" fill="var(--gold)" opacity="0.32" />
      <path d="M38 60Q50 74 62 60Q50 66 38 60Z" fill="var(--gold)" opacity="0.85" />
      <ellipse cx="53" cy="69" rx="7" ry="11" fill="#C9556B" transform="rotate(18 53 69)" />
    </svg>
  );
}

// Rock-paper-scissors mini-game: reports only 'win'/'loss' up to the wrapper;
// ties are replayed for free entirely internally.
function RPSGame({ onResult }: { onResult: (result: 'win' | 'loss') => void }) {
  const [phase, setPhase] = useState<'choose' | 'shake' | 'reveal'>('choose');
  const [outcome, setOutcome] = useState<'win' | 'loss' | 'tie' | null>(null);
  const [userMove, setUserMove] = useState<RPSMove | null>(null);
  const [computerMove, setComputerMove] = useState<RPSMove | null>(null);
  const [tieRound, setTieRound] = useState(0); // bumped on each tie so the pop-in animation replays

  const play = (move: RPSMove) => {
    if (phase !== 'choose') return;
    setUserMove(move);
    setPhase('shake');

    // Fists bounce together for a beat first — the classic "камень, ножницы...
    // бумага!" shake — then both shapes reveal at once.
    setTimeout(() => {
      const computer = RPS_MOVES[Math.floor(Math.random() * 3)];
      setComputerMove(computer);

      if (computer === move) {
        setOutcome('tie');
        setPhase('reveal');
        setTieRound((r) => r + 1);
        setTimeout(() => {
          setPhase('choose');
          setOutcome(null);
          setUserMove(null);
          setComputerMove(null);
        }, 1000);
        return;
      }

      const won = RPS_BEATS[move] === computer;
      setOutcome(won ? 'win' : 'loss');
      setPhase('reveal');
      setTimeout(() => onResult(won ? 'win' : 'loss'), 1000);
    }, 900);
  };

  const resultText =
    outcome === 'win' ? 'Победа!' : outcome === 'tie' ? 'Ничья — ещё раз' : 'Проигрыш — попробуй ещё раз';

  return (
    <>
      {phase === 'choose' && (
        <>
          <div style={{ fontSize: fs(14), color: COLORS.textGhost, fontStyle: 'italic', marginTop: 6 }}>
            Выиграй раунд, чтобы продолжить
          </div>
          <div style={{ display: 'flex', gap: 14, marginTop: 6 }}>
            {RPS_MOVES.map((m) => (
              <div
                key={m}
                onClick={() => play(m)}
                role="button"
                aria-label={RPS_LABELS[m]}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, cursor: 'pointer' }}
              >
                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: '50%',
                    border: '1px solid rgba(var(--gold-rgb),0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <RPSHandIcon move={m} size={40} />
                </div>
                <span style={{ fontSize: fs(10), color: COLORS.textFaint, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                  {RPS_LABELS[m]}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {phase === 'shake' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 30 }}>
          <div className="inka-rps-shake">
            <RPSHandIcon move="rock" size={54} />
          </div>
          <div style={{ fontFamily: DROP_CAP_FONT, fontSize: fs(15), color: COLORS.textGhost }}>vs</div>
          <div className="inka-rps-shake" style={{ animationDelay: '0.05s' }}>
            <RPSHandIcon move="rock" size={54} />
          </div>
        </div>
      )}

      {phase === 'reveal' && (
        <>
          <div key={`reveal-${tieRound}`} className="inka-rps-pop" style={{ display: 'flex', alignItems: 'center', gap: 30 }}>
            {userMove && <RPSHandIcon move={userMove} size={54} />}
            <div style={{ fontFamily: DROP_CAP_FONT, fontSize: fs(15), color: COLORS.textGhost }}>vs</div>
            {computerMove && <RPSHandIcon move={computerMove} size={54} />}
          </div>
          <div
            style={{
              fontFamily: DROP_CAP_FONT,
              fontSize: fs(22),
              color: outcome === 'win' ? COLORS.gold : COLORS.textPrimary,
              letterSpacing: '1px',
            }}
          >
            {resultText}
          </div>
        </>
      )}
    </>
  );
}

// A simple upturned cup and a little gold ball — same gold line-art recipe as
// the RPS hands. `lifted` raises the cup to reveal whatever's underneath.
function CupIcon({ size = 56, lifted }: { size?: number; lifted?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      style={{ transition: 'transform 0.45s cubic-bezier(0.34,1.4,0.64,1)', transform: lifted ? 'translateY(-34px)' : 'translateY(0)' }}
    >
      <path
        d="M22 88 L34 32Q50 25 66 32L78 88Z"
        fill="rgba(var(--gold-rgb),0.16)"
        stroke="var(--gold)"
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      <ellipse cx="50" cy="88" rx="28" ry="7" fill="rgba(var(--gold-rgb),0.22)" stroke="var(--gold)" strokeWidth="3" />
    </svg>
  );
}
function BallIcon({ size = 22, color = 'var(--gold)' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <circle cx="20" cy="20" r="16" fill={color} />
      <ellipse cx="14" cy="13" rx="5" ry="3" fill="#fff8de" opacity="0.65" />
    </svg>
  );
}

// Shell/cups mini-game: a ball sits under one of three cups, they "shuffle"
// (a chaotic dance — the ball's slot never actually changes since no one can
// legitimately track it anyway), then the player guesses. Reports 'win'/'loss'
// up to the wrapper once, same as RPSGame.
// Cups genuinely swap places (not just jitter in place) — cupSlot[cupId] is
// which visual slot (0-2) that cup currently occupies; a handful of random
// pairwise swaps animate via CSS transform so there's an actual (if fast)
// shuffle to try to track, same as the real game.
function CupsGame({ onResult }: { onResult: (result: 'win' | 'loss') => void }) {
  const [ballCup] = useState(() => Math.floor(Math.random() * 3)); // which cup (identity) hides the ball — fixed all round
  const [cupSlot, setCupSlot] = useState<number[]>([0, 1, 2]); // cupSlot[cupId] = current visual slot
  // A fresh random colour from the same palette as client markers, each time
  // a new round mounts (the wrapper remounts this on every retry).
  const [ballColor] = useState(() => MARKER_COLORS[Math.floor(Math.random() * MARKER_COLORS.length)]);
  const [phase, setPhase] = useState<'intro' | 'shuffle' | 'choose' | 'result'>('intro');
  const [revealed, setRevealed] = useState(true);
  const [chosenSlot, setChosenSlot] = useState<number | null>(null);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => setRevealed(false), 700));
    timers.push(setTimeout(() => setPhase('shuffle'), 900));

    // More swaps, faster, at jittered intervals (not an even beat) — harder
    // to keep count of than a slow, metronomic shuffle.
    const SWAP_COUNT = 11;
    const SWAP_MS = 180;
    const SWAP_JITTER_MS = 60; // each interval is SWAP_MS ± this
    let elapsed = 900;
    for (let i = 0; i < SWAP_COUNT; i++) {
      elapsed += SWAP_MS + (Math.random() - 0.5) * 2 * SWAP_JITTER_MS;
      timers.push(
        setTimeout(() => {
          setCupSlot((prev) => {
            const a = Math.floor(Math.random() * 3);
            // b picked as an offset from a (1 or 2 steps, mod 3) — guaranteed
            // different from a with no retry loop needed.
            const b = (a + 1 + Math.floor(Math.random() * 2)) % 3;
            const next = [...prev];
            const cupAtA = next.indexOf(a);
            const cupAtB = next.indexOf(b);
            next[cupAtA] = b;
            next[cupAtB] = a;
            return next;
          });
        }, elapsed),
      );
    }
    timers.push(setTimeout(() => setPhase('choose'), elapsed + 150));
    return () => timers.forEach(clearTimeout);
  }, []);

  const ballSlot = cupSlot[ballCup]; // where the ball actually ends up, post-shuffle

  const choose = (slot: number) => {
    if (phase !== 'choose') return;
    setChosenSlot(slot);
    setPhase('result');
    setTimeout(() => onResult(slot === ballSlot ? 'win' : 'loss'), 1300);
  };

  const caption =
    phase === 'intro'
      ? 'Запоминай, где шарик...'
      : phase === 'shuffle'
      ? 'Мешаю, мешаю...'
      : phase === 'choose'
      ? 'Где шарик?'
      : chosenSlot === ballSlot
      ? 'Угадал!'
      : 'Не там — попробуй ещё раз';

  const STEP = 74; // px — matches cup width (56) + gap (18)

  return (
    <>
      <div style={{ fontSize: fs(14), color: chosenSlot === ballSlot && phase === 'result' ? COLORS.gold : COLORS.textGhost, fontStyle: 'italic', marginTop: 6 }}>
        {caption}
      </div>
      <div style={{ position: 'relative', width: STEP * 3 - 18, height: 90, marginTop: 10 }}>
        {[0, 1, 2].map((cupId) => {
          const slot = cupSlot[cupId];
          const lifted = (phase === 'intro' && revealed && cupId === ballCup) || (phase === 'result' && cupId === ballCup);
          return (
            <div
              key={cupId}
              onClick={() => choose(slot)}
              role="button"
              aria-label={`Стаканчик ${slot + 1}`}
              style={{
                position: 'absolute',
                left: cupId * STEP,
                top: 0,
                transform: `translateX(${(slot - cupId) * STEP}px)`,
                transition: 'transform 0.17s ease-in-out',
                cursor: phase === 'choose' ? 'pointer' : 'default',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              }}
            >
              {lifted && (
                <div style={{ position: 'absolute', bottom: 8, zIndex: 1 }}>
                  <BallIcon size={20} color={ballColor} />
                </div>
              )}
              <div style={{ zIndex: 2 }}>
                <CupIcon size={56} lifted={lifted} />
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// A simple playing card — rounded rect, rank + suit, red for hearts/diamonds.
// `faceDown` shows the dealer's hidden hole card as a plain patterned back.
function PlayingCard({ rank, suit, faceDown, size = 46 }: { rank: string; suit: '♠' | '♥' | '♦' | '♣'; faceDown?: boolean; size?: number }) {
  const isRed = suit === '♥' || suit === '♦';
  if (faceDown) {
    return (
      <div
        style={{
          width: size,
          height: size * 1.4,
          borderRadius: 5,
          border: '1px solid rgba(var(--gold-rgb),0.4)',
          background:
            'repeating-linear-gradient(45deg, rgba(var(--gold-rgb),0.1), rgba(var(--gold-rgb),0.1) 4px, transparent 4px, transparent 8px)',
        }}
      />
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size * 1.4,
        borderRadius: 5,
        border: '1px solid rgba(var(--gold-rgb),0.4)',
        background: 'rgba(var(--gold-rgb),0.05)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: isRed ? '#C9556B' : 'var(--gold)',
      }}
    >
      <div style={{ fontSize: size * 0.32, fontWeight: 600, lineHeight: 1 }}>{rank}</div>
      <div style={{ fontSize: size * 0.36, lineHeight: 1 }}>{suit}</div>
    </div>
  );
}

type PlayingCardData = { rank: string; suit: '♠' | '♥' | '♦' | '♣'; value: number };
const CARD_RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const CARD_SUITS: PlayingCardData['suit'][] = ['♠', '♥', '♦', '♣'];
const rankValue = (r: string) => (r === 'A' ? 11 : ['J', 'Q', 'K'].includes(r) ? 10 : parseInt(r, 10));
const drawCard = (): PlayingCardData => {
  const rank = CARD_RANKS[Math.floor(Math.random() * CARD_RANKS.length)];
  const suit = CARD_SUITS[Math.floor(Math.random() * CARD_SUITS.length)];
  return { rank, suit, value: rankValue(rank) };
};
// Standard soft-hand scoring: aces count 11 unless that busts the hand, then
// downgrade one at a time to 1.
function handValue(cards: PlayingCardData[]): number {
  let total = cards.reduce((s, c) => s + c.value, 0);
  let aces = cards.filter((c) => c.rank === 'A').length;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

// Blackjack ("21"): one hand decides it — hit or stand, dealer plays a fixed
// house rule (draws to 17+). A push (tie) redeals for free, same spirit as
// RPS's tie — everything else reports 'win'/'loss' up to the wrapper.
function BlackjackGame({ onResult }: { onResult: (result: 'win' | 'loss') => void }) {
  const [playerCards, setPlayerCards] = useState<PlayingCardData[]>(() => [drawCard(), drawCard()]);
  const [dealerCards, setDealerCards] = useState<PlayingCardData[]>(() => [drawCard(), drawCard()]);
  const [phase, setPhase] = useState<'player' | 'dealer' | 'result'>('player');
  const [resultText, setResultText] = useState('');
  const cancelledRef = useRef(false);
  useEffect(() => () => {
    cancelledRef.current = true;
  }, []);

  const playerTotal = handValue(playerCards);
  const dealerTotal = handValue(dealerCards);

  const finish = (outcome: 'win' | 'loss', text: string) => {
    setResultText(text);
    setPhase('result');
    setTimeout(() => {
      if (!cancelledRef.current) onResult(outcome);
    }, 1400);
  };

  const runDealer = (cards: PlayingCardData[]) => {
    const total = handValue(cards);
    if (total < 17) {
      setTimeout(() => {
        if (cancelledRef.current) return;
        const next = [...cards, drawCard()];
        setDealerCards(next);
        runDealer(next);
      }, 750);
      return;
    }
    setTimeout(() => {
      if (cancelledRef.current) return;
      const pTotal = handValue(playerCards);
      if (total > 21) return finish('win', 'Дилер перебрал — победа!');
      if (pTotal > total) return finish('win', 'Победа!');
      if (pTotal < total) return finish('loss', 'Проигрыш');
      // Push — free redeal, doesn't count as a loss.
      setResultText('Ничья — переигровка');
      setPhase('result');
      setTimeout(() => {
        if (cancelledRef.current) return;
        setPlayerCards([drawCard(), drawCard()]);
        setDealerCards([drawCard(), drawCard()]);
        setPhase('player');
        setResultText('');
      }, 1400);
    }, 750);
  };

  const hit = () => {
    if (phase !== 'player') return;
    const next = [...playerCards, drawCard()];
    setPlayerCards(next);
    if (handValue(next) > 21) finish('loss', 'Перебор — проигрыш');
  };

  const stand = () => {
    if (phase !== 'player') return;
    setPhase('dealer');
    runDealer(dealerCards);
  };

  const buttonStyle: React.CSSProperties = {
    flex: 1,
    textAlign: 'center',
    padding: '10px 0',
    borderRadius: 2,
    cursor: 'pointer',
    fontSize: fs(12),
    letterSpacing: '0.5px',
    textTransform: 'uppercase',
    border: '1px solid rgba(var(--gold-rgb),0.3)',
    color: COLORS.gold,
  };

  return (
    <>
      <div style={{ fontSize: fs(12), color: COLORS.textGhost, letterSpacing: '0.5px' }}>
        Дилер: {phase === 'player' ? '?' : dealerTotal}
      </div>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
        {dealerCards.map((c, i) => (
          <PlayingCard key={i} rank={c.rank} suit={c.suit} faceDown={phase === 'player' && i === 1} />
        ))}
      </div>

      <div style={{ fontSize: fs(12), color: COLORS.textGhost, letterSpacing: '0.5px', marginTop: 8 }}>
        Ты: {playerTotal}
      </div>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
        {playerCards.map((c, i) => (
          <PlayingCard key={i} rank={c.rank} suit={c.suit} />
        ))}
      </div>

      {phase === 'player' ? (
        <div style={{ display: 'flex', gap: 10, marginTop: 10, width: '100%' }}>
          <div onClick={hit} role="button" style={buttonStyle}>
            Взять карту
          </div>
          <div onClick={stand} role="button" style={buttonStyle}>
            Хватит
          </div>
        </div>
      ) : (
        <div
          style={{
            fontFamily: DROP_CAP_FONT,
            fontSize: fs(18),
            color: resultText.startsWith('Победа') || resultText.includes('перебрал') ? COLORS.gold : COLORS.textPrimary,
            marginTop: 8,
          }}
        >
          {resultText}
        </div>
      )}
    </>
  );
}

type TrialGameKind = 'rps' | 'cups' | 'blackjack';
const TRIAL_TITLES: Record<TrialGameKind, string> = {
  rps: 'Камень · Ножницы · Бумага',
  cups: 'Три стаканчика',
  blackjack: 'Black Jack',
};
// RPS/cups are best-of-3 (retry on loss, taunt after 3); Black Jack is a
// single hand — one loss decides it, no retries.
const TRIAL_LOSS_THRESHOLD: Record<TrialGameKind, number> = { rps: 3, cups: 3, blackjack: 1 };

function TrialGate({
  onWin,
  onCancel,
  onOutcome,
}: {
  onWin: () => void;
  onCancel: () => void;
  // Fired once the gate is settled, distinguishing a genuine win from a
  // pass-through after 3 losses — onWin alone can't tell them apart since it
  // fires (eventually) either way to unblock whatever action is gated.
  onOutcome?: (result: 'win' | 'lossStreak') => void;
}) {
  // Weighted pick — RPS shows up often, cups a bit less, Black Jack rarest.
  const [gameKind] = useState<TrialGameKind>(() => {
    const r = Math.random();
    return r < 0.5 ? 'rps' : r < 0.8 ? 'cups' : 'blackjack';
  });
  const [losses, setLosses] = useState(0);
  const [stage, setStage] = useState<'playing' | 'taunt'>('playing');
  const [round, setRound] = useState(0); // bumped on each loss retry to remount the mini-game fresh

  const handleResult = (result: 'win' | 'loss') => {
    if (result === 'win') {
      onOutcome?.('win');
      onWin();
      return;
    }
    const nextLosses = losses + 1;
    setLosses(nextLosses);
    if (nextLosses >= TRIAL_LOSS_THRESHOLD[gameKind]) {
      setStage('taunt');
      onOutcome?.('lossStreak');
      setTimeout(onWin, 3800);
    } else {
      setRound((r) => r + 1);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'rgba(0,0,0,0.82)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 360,
          border: '1px solid rgba(var(--gold-rgb),0.3)',
          borderRadius: 4,
          background: COLORS.bg,
          padding: '26px 24px 22px',
          textAlign: 'center',
          position: 'relative',
        }}
      >
        <div
          onClick={onCancel}
          role="button"
          aria-label="Отмена"
          style={{
            position: 'absolute',
            top: 12,
            right: 14,
            fontSize: fs(15),
            color: COLORS.textFaint,
            cursor: 'pointer',
          }}
        >
          ✕
        </div>

        <div
          style={{
            fontFamily: DROP_CAP_FONT,
            fontSize: fs(20),
            color: COLORS.gold,
            letterSpacing: '2px',
            textTransform: 'uppercase',
          }}
        >
          {TRIAL_TITLES[gameKind]}
        </div>
        <StarDivider marginTop={9} />

        {/* Loss counter — how close the app is to "winning" the series
            (just 1 dot for Black Jack, since a single hand decides it). */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 7, margin: '16px 0 4px' }}>
          {Array.from({ length: TRIAL_LOSS_THRESHOLD[gameKind] }, (_, i) => i).map((i) => (
            <div
              key={i}
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: i < losses ? COLORS.gold : 'transparent',
                border: `1px solid rgba(var(--gold-rgb),${i < losses ? 0.9 : 0.3})`,
              }}
            />
          ))}
        </div>

        <div style={{ minHeight: 160, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
          {stage === 'playing' &&
            (gameKind === 'rps' ? (
              <RPSGame key={round} onResult={handleResult} />
            ) : gameKind === 'cups' ? (
              <CupsGame key={round} onResult={handleResult} />
            ) : (
              <BlackjackGame key={round} onResult={handleResult} />
            ))}

          {stage === 'taunt' && (
            <>
              <RPSTauntFace />
              <div style={{ fontSize: fs(14), color: COLORS.textGhost, fontStyle: 'italic' }}>
                Ну и ладно — так и быть, проходи!
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ===================== CLIENT MARKER (stripe + gem corner) =====================
// Gilded foil stripes with a bright sheen in the middle. The top stripe runs
// along the top edge (tapered to a nib on the left); the right stripe runs down
// the card's right edge (tapered to a nib at the bottom). They meet over the gem
// corner. Clip-path tapers live in index.css. Used in both themes.
function TopStripe({ color }: { color: string }) {
  return (
    <div
      className="inka-stripe"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        zIndex: 6, // above the gem corner so it tucks under the stripe
        pointerEvents: 'none',
        background: `linear-gradient(90deg, ${color} 0%, #f6e8c4 48%, ${color} 100%)`,
        boxShadow: `0 1px 2px ${hexToRgba(color, 0.4)}`,
      }}
    />
  );
}

// Vertical stripe dropping down the card's right edge from the top-right corner,
// tapered to a point at the bottom (nib), over the gem corner.
function RightStripe({ color }: { color: string }) {
  return (
    <div
      className="inka-stripe-right"
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        right: 0,
        width: 3,
        zIndex: 6,
        pointerEvents: 'none',
        background: `linear-gradient(180deg, ${color} 0%, #f6e8c4 48%, ${color} 100%)`,
        boxShadow: `-1px 0 2px ${hexToRgba(color, 0.4)}`,
      }}
    />
  );
}

// Coloured-glass "gem" corner: a small translucent bevelled triangle with
// gradient depth (глубина) and a soft colour reflection spilling onto the card
// surface (цветной отсвет). Tucked under the top stripe; no specular glint.
function GemCorner({ color, size = 28 }: { color: string; size?: number }) {
  return (
    <>
      {/* colour reflection cast onto the surface */}
      <div
        style={{
          position: 'absolute',
          top: -6,
          right: -6,
          width: size + 20,
          height: size + 20,
          background: `radial-gradient(circle at top right, ${hexToRgba(color, 0.45)}, transparent 66%)`,
          filter: 'blur(5px)',
          zIndex: 2,
          pointerEvents: 'none',
        }}
      />
      {/* glass body */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: size,
          height: size,
          clipPath: 'polygon(100% 0, 0 0, 100% 100%)',
          background: `linear-gradient(215deg, ${color} 0%, ${hexToRgba(color, 0.6)} 52%, ${hexToRgba(color, 0.12)} 100%)`,
          boxShadow: `inset 2px -2px 3px ${hexToRgba(color, 0.5)}`,
          zIndex: 3,
          pointerEvents: 'none',
        }}
      />
    </>
  );
}

// Gold versions of the client card's foil stripes + gem corner — same recipe
// (gradient stripe with a bright sheen, glass corner with a soft reflection),
// just always gold instead of the per-client marker colour. Used to frame
// boxes on the master dashboard so they read as one family with the cards.
function GoldTopStripe() {
  return (
    <div
      className="inka-stripe"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        zIndex: 6,
        pointerEvents: 'none',
        background: 'linear-gradient(90deg, var(--gold) 0%, #f6e8c4 48%, var(--gold) 100%)',
        boxShadow: '0 1px 2px rgba(var(--gold-rgb),0.4)',
      }}
    />
  );
}
function GoldRightStripe() {
  return (
    <div
      className="inka-stripe-right"
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        right: 0,
        width: 3,
        zIndex: 6,
        pointerEvents: 'none',
        background: 'linear-gradient(180deg, var(--gold) 0%, #f6e8c4 48%, var(--gold) 100%)',
        boxShadow: '-1px 0 2px rgba(var(--gold-rgb),0.4)',
      }}
    />
  );
}
function GoldGemCorner({ size = 24 }: { size?: number }) {
  return (
    <>
      <div
        style={{
          position: 'absolute',
          top: -6,
          right: -6,
          width: size + 20,
          height: size + 20,
          background: 'radial-gradient(circle at top right, rgba(var(--gold-rgb),0.45), transparent 66%)',
          filter: 'blur(5px)',
          zIndex: 2,
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: size,
          height: size,
          clipPath: 'polygon(100% 0, 0 0, 100% 100%)',
          background: 'linear-gradient(215deg, var(--gold) 0%, rgba(var(--gold-rgb),0.6) 52%, rgba(var(--gold-rgb),0.12) 100%)',
          boxShadow: 'inset 2px -2px 3px rgba(var(--gold-rgb),0.5)',
          zIndex: 3,
          pointerEvents: 'none',
        }}
      />
    </>
  );
}
// Wraps a box in the same stripe+gem-corner+inset-ring frame as a client
// card, all gold. Used throughout the master dashboard.
function GoldFrame({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="inka-card" style={{ position: 'relative', borderRadius: 3, overflow: 'hidden', background: 'rgba(var(--surface-rgb),0.018)', ...style }}>
      <GoldTopStripe />
      <GoldRightStripe />
      <GoldGemCorner />
      <div style={{ position: 'relative', zIndex: 2 }}>{children}</div>
    </div>
  );
}

// ===================== CLIENT GRID CARD =====================
function ClientGridCard({ client, onClick }: { client: Client; onClick: () => void }) {
  return (
    <div
      className="inka-card"
      onClick={onClick}
      style={{
        position: 'relative',
        background: 'transparent',
        // The frame is a smooth inset ring (see --card-rest-shadow) rather than a
        // border, so it hugs the rounded corners cleanly and is covered by the
        // stripes on the top/right edges — no frame poking past the tapered nibs.
        borderRadius: 3,
        height: 250,
        overflow: 'hidden',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Client marker — coloured top + right stripes and glass-gem corner. */}
      <TopStripe color={client.color} />
      <RightStripe color={client.color} />
      <GemCorner color={client.color} />

      {/* Content */}
      <div
        style={{
          padding: '10px 12px',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          position: 'relative',
          zIndex: 2,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, flexShrink: 0, direction: isRTL(client.name) ? 'rtl' : 'ltr' }}>
          <span
            style={{
              fontFamily: DROP_CAP_FONT,
              fontSize: fs(58),
              fontWeight: 600,
              // Taller line box so the ornate letter's descending swash stays
              // within its own line and doesn't hang down onto the note text.
              lineHeight: 1.12,
              color: COLORS.gold,
              letterSpacing: '0px',
              flexShrink: 0,
              marginTop: -2,
            }}
          >
            {firstLetter(client.name)}
          </span>
          <div style={{ paddingTop: 7, minWidth: 0, overflow: 'hidden' }}>
            <div
              dir="auto"
              style={{
                fontFamily: DROP_CAP_FONT,
                fontSize: fs(19),
                fontWeight: 600,
                color: COLORS.textPrimary,
                lineHeight: 1.2,
                letterSpacing: '0.3px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {nameRest(client.name)}
            </div>
            <div
              dir="auto"
              style={{
                fontFamily: DROP_CAP_FONT,
                fontSize: fs(16),
                fontWeight: 600,
                color: 'var(--surname)',
                marginTop: 2,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {client.surname}
            </div>
          </div>
        </div>

        {/* Gold divider */}
        <div style={{ height: 1, background: 'linear-gradient(to right, rgba(var(--gold-rgb),0.42), transparent)', margin: '7px 0' }} />

        {/* Note preview fills the middle */}
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {client.note ? (
            <div
              dir="auto"
              style={{
                fontSize: fs(15),
                color: 'var(--text-secondary)',
                fontStyle: 'italic',
                lineHeight: 1.4,
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {client.note}
            </div>
          ) : (
            <div style={{ fontSize: fs(15), color: COLORS.textTrace, fontStyle: 'italic' }}>Без заметок</div>
          )}
        </div>

        {/* Next planned session date if one exists, otherwise the last
            completed one — calendar date only, never a session title. Legacy
            records sometimes have free text in the date field (predates the
            date picker); ISO_DATE_RE filters those out rather than leaking
            them onto the card. */}
        <div style={{ marginBottom: 6, minWidth: 0 }}>
          <div style={{ fontSize: fs(9.5), color: COLORS.textGhost, letterSpacing: '1.5px', textTransform: 'uppercase' }}>
            {nextPlannedSession(client) ? 'Следующая сессия' : 'Последняя сессия'}
          </div>
          <div
            style={{
              fontSize: fs(12),
              color: COLORS.textSecondary,
              fontStyle: 'italic',
              marginTop: 2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {(() => {
              const dateOnly = (value: string) => (ISO_DATE_RE.test(value) ? formatDate(value) : '');
              const planned = nextPlannedSession(client);
              if (planned) return dateOnly(planned.date) || '—';
              const last = lastSession(client);
              return last ? dateOnly(last.date) || '—' : 'Нет сессий';
            })()}
          </div>
        </div>

        {/* Style tag (+ Модель/Другое badge, when not a plain client) */}
        <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {client.clientType && client.clientType !== 'client' && (
            <span
              style={{
                fontSize: fs(10),
                color: COLORS.textGhost,
                border: '0.5px solid rgba(var(--gold-rgb),0.4)',
                padding: '2px 7px',
                borderRadius: 1,
                letterSpacing: '1px',
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
              }}
            >
              {CLIENT_TYPES.find((t) => t.value === client.clientType)?.label}
            </span>
          )}
          {client.style ? (
            <span
              style={{
                fontSize: fs(11),
                color: client.color,
                border: `0.5px solid ${client.color}`,
                padding: '2px 7px',
                borderRadius: 1,
                letterSpacing: '1px',
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: '100%',
              }}
            >
              {client.style}
            </span>
          ) : (
            <span style={{ fontSize: fs(11), color: COLORS.textGhost, fontStyle: 'italic', letterSpacing: '0.5px' }}>—</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ===================== BOTTOM NAV =====================
// The theme toggle now lives only inside the Settings screen (see the "Тема"
// row there) — it used to also be pinned at the top of the list screen.

function BottomNav({
  active,
  onNavigate,
  onAddClient,
}: {
  active: 'list' | 'settings' | 'summary' | 'master';
  onNavigate: (screen: 'list' | 'settings' | 'summary' | 'master') => void;
  onAddClient: () => void;
}) {
  return (
    <div
      style={{
        // Rendered as a direct child of the (non-scrolling) app shell, so
        // absolute bottom:0 pins the ribbon to the bottom of the screen and it
        // no longer scrolls away with the card list.
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        // The bar reserves the FULL iOS home-indicator inset so its background
        // reaches the very bottom edge of the screen — the home indicator then
        // sits inside the bar (same colour) instead of below it, where the old
        // 10px cap left the indicator zone showing as a stray strip and made
        // the app look like it didn't reach the bottom. On devices without a
        // home indicator env(safe-area-inset-bottom) is 0, so the bar stays
        // slim (just the 46px icon row).
        height: 'calc(44px + env(safe-area-inset-bottom))',
        // Solid (no backdrop-filter): the blur repainted every frame during
        // scroll and was a major source of jank. A flat bar is also visually
        // slimmer, hugging the icons. A gold-tinted overlay (stacked as a
        // second background layer, not a blur) makes the bar read clearly
        // against the near-black app background instead of blending in.
        background: 'linear-gradient(rgba(var(--gold-rgb),0.1), rgba(var(--gold-rgb),0.1)), var(--bg)',
        borderTop: '1px solid rgba(var(--gold-rgb),0.35)',
        boxShadow: '0 -2px 14px rgba(var(--gold-rgb),0.12)',
        display: 'flex',
        // The three items are equal-width columns pinned to the top of the bar
        // (the inset padding below is the home-indicator zone), so their icons
        // and labels line up on one baseline regardless of the safe-area size.
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        paddingTop: 5,
        paddingBottom: 'env(safe-area-inset-bottom)',
        zIndex: 50,
      }}
    >
      <NavItem label="Главная" active={active === 'list'} onClick={() => onNavigate('list')}>
        <svg width="23" height="23" viewBox="0 0 20 20" fill="none" style={{ color: active === 'list' ? 'var(--gold)' : 'var(--text)' }}>
          <path d="M3 10L10 4L17 10V17H12.5V12H7.5V17H3V10Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
          <rect x="13" y="2.3" width="1.8" height="4" fill="currentColor" />
        </svg>
      </NavItem>
      {/* Create-client — same footprint as the other two so all three align;
          a ringed «+» keeps it distinct without towering over the bar. */}
      <NavItem label="Создать" active={false} accent onClick={onAddClient} ariaLabel="Добавить клиента">
        <span
          style={{
            width: 23,
            height: 23,
            borderRadius: '50%',
            border: '1px solid rgba(var(--gold-rgb),0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <line x1="7" y1="2" x2="7" y2="12" stroke="var(--gold)" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="2" y1="7" x2="12" y2="7" stroke="var(--gold)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </span>
      </NavItem>
      <NavItem label="Задачи" active={active === 'summary'} onClick={() => onNavigate('summary')}>
        <svg width="23" height="23" viewBox="0 0 20 20" fill="none" style={{ color: active === 'summary' ? 'var(--gold)' : 'var(--text)' }}>
          <rect x="3" y="4" width="3" height="3" rx="0.5" stroke="currentColor" strokeWidth="1.1" />
          <path d="M3.6 5.5L4.3 6.2L5.6 4.7" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="8" y1="5.5" x2="17" y2="5.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
          <rect x="3" y="9" width="3" height="3" rx="0.5" stroke="currentColor" strokeWidth="1.1" />
          <line x1="8" y1="10.5" x2="17" y2="10.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
          <rect x="3" y="14" width="3" height="3" rx="0.5" stroke="currentColor" strokeWidth="1.1" />
          <line x1="8" y1="15.5" x2="14" y2="15.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        </svg>
      </NavItem>
    </div>
  );
}

// One bottom-nav column: a fixed-height icon slot over a label, so every item
// (including the ringed «+») lines up on the same baseline and scale.
function NavItem({
  children,
  label,
  active,
  accent = false,
  onClick,
  ariaLabel,
}: {
  children: React.ReactNode;
  label: string;
  active: boolean;
  accent?: boolean;
  onClick: () => void;
  ariaLabel?: string;
}) {
  return (
    <div
      onClick={onClick}
      role="button"
      aria-label={ariaLabel ?? label}
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 3,
        cursor: 'pointer',
        opacity: active || accent ? 1 : 0.45,
      }}
    >
      <div style={{ height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{children}</div>
      <span style={{ fontSize: fs(10.5), color: active || accent ? COLORS.gold : COLORS.textFaint, letterSpacing: '0.8px', textTransform: 'uppercase' }}>
        {label}
      </span>
    </div>
  );
}

// A single "ability score" style tile for the master dashboard's stat grid —
// bracketed corners and a big centered number, like a tabletop character
// sheet's stat block, but in the app's own gold/dark palette.
function StatBlock({ label, value, big = true }: { label: string; value: string | number; big?: boolean }) {
  return (
    <GoldFrame style={{ textAlign: 'center', padding: '18px 10px 16px' }}>
      <div style={{ fontSize: fs(10), color: COLORS.textGhost, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 8 }}>{label}</div>
      <div
        style={{
          fontFamily: DROP_CAP_FONT,
          fontSize: big ? fs(30) : fs(16),
          fontWeight: 600,
          lineHeight: 1.15,
          color: COLORS.gold,
          fontStyle: !big && value === 'Пока нет данных' ? 'italic' : 'normal',
        }}
      >
        {value}
      </div>
    </GoldFrame>
  );
}

// One stat tile split in half, sharing a single frame — used to fit two
// related counters (e.g. Срочно/Важно, or a period count stacked over an
// all-time count) into the space of one grid cell.
function SplitStatBlock({
  direction = 'row',
  a,
  b,
}: {
  direction?: 'row' | 'column';
  a: { label: string; value: string | number };
  b: { label: string; value: string | number };
}) {
  const cell = (item: { label: string; value: string | number }) => (
    <div style={{ flex: 1, textAlign: 'center' }}>
      <div style={{ fontSize: fs(9.5), color: COLORS.textGhost, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 5 }}>
        {item.label}
      </div>
      <div style={{ fontFamily: DROP_CAP_FONT, fontSize: fs(20), fontWeight: 600, color: COLORS.gold }}>{item.value}</div>
    </div>
  );

  return (
    <GoldFrame style={{ padding: direction === 'row' ? '16px 10px' : '13px 10px' }}>
      <div style={{ display: 'flex', flexDirection: direction, alignItems: 'center', gap: direction === 'row' ? 8 : 10 }}>
        {cell(a)}
        <div
          style={{
            background: 'rgba(var(--gold-rgb),0.15)',
            width: direction === 'row' ? 1 : '100%',
            height: direction === 'row' ? 34 : 1,
            flexShrink: 0,
          }}
        />
        {cell(b)}
      </div>
    </GoldFrame>
  );
}

// ===================== MASTER DASHBOARD =====================
function MasterDashboardScreen({
  clients,
  masterInfo,
  onChangeMasterInfo,
  prefs,
  onChangePrefs,
  onOpenSession,
  onOpenSettings,
  onImport,
}: {
  clients: Client[];
  masterInfo: MasterInfo;
  onChangeMasterInfo: (m: MasterInfo) => void;
  prefs: Prefs;
  onChangePrefs: (p: Prefs) => void;
  onOpenSession: (clientId: string, itemId: string, kind: 'session' | 'consultation') => void;
  onOpenSettings: () => void;
  onImport: (clients: Client[]) => void;
}) {
  const [name, setName] = useState(masterInfo.name);
  useEffect(() => setName(masterInfo.name), [masterInfo.name]);

  const style = mostUsedStyle(clients);
  const upcoming = upcomingItems(clients, prefs.upcomingWindowDays);
  const { urgent, important } = urgencyCounts(clients);
  const closedCount = closedNotesCount(clients);
  const statsUpcoming = upcomingItems(clients, prefs.statsWindowDays);
  const plannedSessionsCount = statsUpcoming.filter((i) => i.kind === 'session').length;
  const plannedConsultationsCount = statsUpcoming.filter((i) => i.kind === 'consultation').length;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const handleExport = () => {
    const payload = { version: 1, exportedAt: new Date().toISOString(), clients };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inka-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const rawClients = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.clients) ? parsed.clients : null;
        if (!rawClients) throw new Error('bad shape');
        if (!window.confirm(`Импортировать ${rawClients.length} клиент(ов)? Текущие данные будут заменены.`)) return;
        onImport(rawClients.map((c: any, i: number) => normalizeClient(c, i)));
        setImportError(null);
      } catch {
        setImportError('Не удалось прочитать файл — проверьте, что это резервная копия INKA.');
      }
    };
    reader.readAsText(file);
  };

  const actionButtonStyle: React.CSSProperties = {
    flex: 1,
    textAlign: 'center',
    padding: '10px 0',
    borderRadius: 2,
    cursor: 'pointer',
    fontSize: fs(13),
    letterSpacing: '1px',
    textTransform: 'uppercase',
    border: '1px solid rgba(var(--gold-rgb),0.35)',
    background: 'rgba(var(--gold-rgb),0.05)',
    color: COLORS.gold,
  };

  const statLabelStyle: React.CSSProperties = {
    fontSize: fs(11),
    color: COLORS.textGhost,
    letterSpacing: '1.5px',
    textTransform: 'uppercase',
    marginBottom: 6,
  };

  return (
    <div style={{ minHeight: '100%', background: COLORS.bg }}>
      {/* Dot-grid texture overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'radial-gradient(circle, rgba(var(--gold-rgb),0.035) 1px, transparent 1px)',
          backgroundSize: '22px 22px',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />
      <StarfieldBackground />
      <CloudsBackground />
      <AviationBackground />
      <div style={{ height: 'calc(env(safe-area-inset-top) + 18px)' }} />
      <div style={{ padding: '6px 24px 12px', position: 'relative', zIndex: 1 }}>
        {/* Settings now lives here rather than as its own top-level nav
            button — the list screen keeps only the Мастер shortcut. */}
        <div
          onClick={onOpenSettings}
          role="button"
          aria-label="Настройки"
          style={{
            position: 'absolute',
            top: 2,
            right: 20,
            width: 42,
            height: 42,
            borderRadius: '50%',
            border: '1px solid rgba(var(--gold-rgb),0.25)',
            background: 'rgba(var(--gold-rgb),0.03)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <svg width="21" height="21" viewBox="0 0 20 20" fill="none" style={{ color: 'var(--gold)' }}>
            <circle cx="10" cy="10" r="4" stroke="currentColor" strokeWidth="1.3" />
            <circle cx="10" cy="10" r="1.5" stroke="currentColor" strokeWidth="1.1" />
            <rect x="8.9" y="1.3" width="2.2" height="2.4" rx="0.5" fill="currentColor" />
            <rect x="8.9" y="16.3" width="2.2" height="2.4" rx="0.5" fill="currentColor" />
            <rect x="8.9" y="1.3" width="2.2" height="2.4" rx="0.5" fill="currentColor" transform="rotate(45 10 10)" />
            <rect x="8.9" y="16.3" width="2.2" height="2.4" rx="0.5" fill="currentColor" transform="rotate(45 10 10)" />
            <rect x="8.9" y="1.3" width="2.2" height="2.4" rx="0.5" fill="currentColor" transform="rotate(90 10 10)" />
            <rect x="8.9" y="16.3" width="2.2" height="2.4" rx="0.5" fill="currentColor" transform="rotate(90 10 10)" />
            <rect x="8.9" y="1.3" width="2.2" height="2.4" rx="0.5" fill="currentColor" transform="rotate(135 10 10)" />
            <rect x="8.9" y="16.3" width="2.2" height="2.4" rx="0.5" fill="currentColor" transform="rotate(135 10 10)" />
          </svg>
        </div>
        <div
          style={{
            fontFamily: DROP_CAP_FONT,
            fontSize: fs(24),
            color: COLORS.gold,
            letterSpacing: '5px',
            textTransform: 'uppercase',
          }}
        >
          Мастер
        </div>
        <div style={{ fontSize: fs(9.66), color: COLORS.textGhost, letterSpacing: `${fs(2.97)}px`, textTransform: 'uppercase', marginTop: 3, fontStyle: 'italic' }}>
          Обзор и напоминания
        </div>
        <StarDivider />
      </div>

      <div style={{ padding: '4px 20px 110px', position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Master's own name */}
        <GoldFrame style={{ padding: '14px 16px' }}>
          <div style={statLabelStyle}>Имя мастера</div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name.trim() !== masterInfo.name && onChangeMasterInfo({ ...masterInfo, name: name.trim() })}
            placeholder="Ваше имя"
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              padding: 0,
              fontFamily: "'Inter', sans-serif",
              fontSize: fs(18),
              color: COLORS.textPrimary,
            }}
          />
        </GoldFrame>

        {/* Quick stats — a 2x2 "character sheet" stat grid. Two of the four
            cells are split in half to fit a related pair of counters:
            назначенные сессии sit over выполнено-заметок (both period vs
            all-time in one cell), and срочно/важно now share one cell,
            freeing the other half for planned consultations. */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
          {STATS_WINDOW_OPTIONS.map((o) => (
            <div
              key={o.days}
              onClick={() => onChangePrefs({ ...prefs, statsWindowDays: o.days })}
              style={{
                fontSize: fs(12),
                padding: '4px 10px',
                borderRadius: 2,
                cursor: 'pointer',
                border: prefs.statsWindowDays === o.days ? '1px solid rgba(var(--gold-rgb),0.6)' : '1px solid rgba(var(--gold-rgb),0.15)',
                background: prefs.statsWindowDays === o.days ? 'rgba(var(--gold-rgb),0.08)' : 'transparent',
                color: prefs.statsWindowDays === o.days ? COLORS.gold : COLORS.textFaint,
              }}
            >
              {o.label}
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
          <StatBlock label="Клиентов" value={clients.length} />
          <SplitStatBlock
            direction="column"
            a={{ label: 'Назначено сессий', value: plannedSessionsCount }}
            b={{ label: `${DONE_EMOJI} Выполнено заметок`, value: closedCount }}
          />
          <SplitStatBlock
            a={{ label: `${URGENCY[0].emoji} ${URGENCY[0].short}`, value: urgent }}
            b={{ label: `${URGENCY[1].emoji} ${URGENCY[1].short}`, value: important }}
          />
          <StatBlock label="Консультаций" value={plannedConsultationsCount} />
          <div style={{ gridColumn: '1 / -1' }}>
            <StatBlock label="Частый стиль" value={style || 'Пока нет данных'} />
          </div>
        </div>

        {/* Upcoming sessions, with a master-configurable lookahead window */}
        <GoldFrame style={{ padding: '14px 16px' }}>
          <div style={statLabelStyle}>Предстоящие сессии</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12, marginTop: 8 }}>
            {UPCOMING_WINDOW_OPTIONS.map((d) => (
              <div
                key={d}
                onClick={() => onChangePrefs({ ...prefs, upcomingWindowDays: d })}
                style={{
                  fontSize: fs(12),
                  padding: '4px 10px',
                  borderRadius: 2,
                  cursor: 'pointer',
                  border: prefs.upcomingWindowDays === d ? '1px solid rgba(var(--gold-rgb),0.6)' : '1px solid rgba(var(--gold-rgb),0.15)',
                  background: prefs.upcomingWindowDays === d ? 'rgba(var(--gold-rgb),0.08)' : 'transparent',
                  color: prefs.upcomingWindowDays === d ? COLORS.gold : COLORS.textFaint,
                }}
              >
                {d} дн.
              </div>
            ))}
          </div>
          {upcoming.length === 0 ? (
            <div style={{ fontSize: fs(13), color: COLORS.textGhost, fontStyle: 'italic' }}>Нет запланированных сессий и консультаций</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {upcoming.map((it) => (
                <div
                  key={it.id}
                  onClick={() => onOpenSession(it.client.id, it.id, it.kind)}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 10px',
                    borderRadius: 2,
                    cursor: 'pointer',
                    border: '1px solid rgba(var(--gold-rgb),0.1)',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: fs(14), color: COLORS.textPrimary }}>{it.client.name || '—'}</div>
                    {it.kind === 'consultation' && (
                      <div style={{ fontSize: fs(10), color: COLORS.gold, letterSpacing: '1px', textTransform: 'uppercase' }}>Консультация</div>
                    )}
                  </div>
                  <div style={{ fontSize: fs(12), color: COLORS.textGhost }}>
                    {formatDate(it.date)}
                    {it.time && <span style={{ color: COLORS.gold }}> · {it.time}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </GoldFrame>

        {/* Contacts & requisites (edited in Настройки → Карточка мастера) */}
        <GoldFrame style={{ padding: '14px 16px' }}>
          <div style={statLabelStyle}>Контакты и оплата</div>
          {masterInfo.links.length === 0 && !masterInfo.bankDetails ? (
            <div style={{ fontSize: fs(13), color: COLORS.textGhost, fontStyle: 'italic' }}>
              Заполните в Настройках → Карточка мастера
            </div>
          ) : (
            <>
              {masterInfo.links.map((l) => (
                <div key={l.id} style={{ marginBottom: 6 }}>
                  <span style={{ fontSize: fs(12), color: COLORS.gold }}>{l.label}: </span>
                  <span style={{ fontSize: fs(13), color: 'var(--text-secondary)' }}>{l.value}</span>
                </div>
              ))}
              {masterInfo.bankDetails && (
                <div style={{ fontSize: fs(13), color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', marginTop: 6 }}>
                  {masterInfo.bankDetails}
                </div>
              )}
            </>
          )}
        </GoldFrame>

        {/* Backup — export the whole client list to a JSON file, or restore
            from one (replaces everything currently stored). */}
        <GoldFrame style={{ padding: '14px 16px' }}>
          <div style={statLabelStyle}>Резервная копия</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div onClick={handleExport} style={actionButtonStyle}>
              Экспортировать
            </div>
            <div onClick={() => fileInputRef.current?.click()} style={actionButtonStyle}>
              Импортировать
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImportFile(file);
              e.target.value = '';
            }}
          />
          {importError && (
            <div style={{ marginTop: 10, fontSize: fs(12), color: '#e0665a', fontStyle: 'italic' }}>{importError}</div>
          )}
        </GoldFrame>
      </div>
    </div>
  );
}

// ===================== SETTINGS SCREEN =====================
function SettingsScreen({
  theme,
  onToggleTheme,
  prefs,
  onChange,
  masterInfo,
  onChangeMasterInfo,
  calendarSync,
  onChangeCalendarSync,
}: {
  theme: Theme;
  onToggleTheme: () => void;
  prefs: Prefs;
  onChange: (p: Prefs) => void;
  masterInfo: MasterInfo;
  onChangeMasterInfo: (m: MasterInfo) => void;
  calendarSync: CalendarSyncSettings;
  onChangeCalendarSync: (s: CalendarSyncSettings) => void;
}) {
  const addMasterLink = (label: string, value: string) => {
    const link: MasterLink = { id: Date.now().toString(), label: label.trim(), value: value.trim() };
    onChangeMasterInfo({ ...masterInfo, links: [...masterInfo.links, link] });
  };
  const removeMasterLink = (id: string) => {
    onChangeMasterInfo({ ...masterInfo, links: masterInfo.links.filter((l) => l.id !== id) });
  };
  const setColorLabel = (color: string, label: string) => {
    onChangeMasterInfo({ ...masterInfo, colorLabels: { ...masterInfo.colorLabels, [color]: label } });
  };

  const rowStyle: React.CSSProperties = {
    background: 'rgba(var(--surface-rgb),0.018)',
    border: '1px solid rgba(var(--gold-rgb),0.1)',
    borderRadius: 3,
    padding: '16px 16px 18px',
    marginBottom: 12,
  };
  const labelStyle: React.CSSProperties = {
    fontFamily: "'Kelly Slab', 'Playfair Display', serif",
    fontSize: fs(12),
    color: 'var(--text-secondary)',
    letterSpacing: '2.5px',
    textTransform: 'uppercase',
    marginBottom: 14,
  };

  return (
    <div style={{ minHeight: '100%', background: COLORS.bg }}>
      {/* Dot-grid texture overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'radial-gradient(circle, rgba(var(--gold-rgb),0.035) 1px, transparent 1px)',
          backgroundSize: '22px 22px',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />
      <StarfieldBackground />
      <CloudsBackground />
      <AviationBackground />
      <div style={{ height: 'calc(env(safe-area-inset-top) + 18px)' }} />
      <div style={{ padding: '6px 24px 12px', position: 'relative', zIndex: 1 }}>
        <div
          style={{
            fontFamily: DROP_CAP_FONT,
            fontSize: fs(24),
            color: COLORS.gold,
            letterSpacing: '5px',
            textTransform: 'uppercase',
          }}
        >
          Настройки
        </div>
        <div style={{ fontSize: fs(9.66), color: COLORS.textGhost, letterSpacing: `${fs(2.97)}px`, textTransform: 'uppercase', marginTop: 3, fontStyle: 'italic' }}>
          Оформление
        </div>
        <StarDivider />
      </div>

      <div style={{ padding: '4px 20px 110px', position: 'relative', zIndex: 1 }}>
        {/* Theme */}
        <div style={rowStyle}>
          <div style={labelStyle}>Тема</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['dark', 'light'] as Theme[]).map((t) => (
              <div
                key={t}
                onClick={() => t !== theme && onToggleTheme()}
                style={{
                  flex: 1,
                  textAlign: 'center',
                  padding: '10px 0',
                  borderRadius: 2,
                  cursor: 'pointer',
                  fontSize: fs(13),
                  letterSpacing: '1px',
                  textTransform: 'uppercase',
                  border: theme === t ? '1px solid rgba(var(--gold-rgb),0.6)' : '1px solid rgba(var(--gold-rgb),0.15)',
                  background: theme === t ? 'rgba(var(--gold-rgb),0.08)' : 'transparent',
                  color: theme === t ? COLORS.gold : COLORS.textFaint,
                }}
              >
                {t === 'dark' ? 'Тёмная' : 'Светлая'}
              </div>
            ))}
          </div>
        </div>

        {/* App brightness */}
        <div style={rowStyle}>
          <div style={labelStyle}>Яркость приложения</div>
          <SettingSlider
            min={0.75}
            max={1.15}
            step={0.05}
            value={prefs.brightness}
            onChange={(v) => onChange({ ...prefs, brightness: v })}
          />
        </div>

        {/* Text size — the previous default (1.0) is now the smallest step, shown
            as 80%; the scale runs up from there for larger, more readable text. */}
        <div style={rowStyle}>
          <div style={labelStyle}>Размер текста</div>
          <SettingSlider
            min={1}
            max={1.75}
            step={0.05}
            value={prefs.textScale}
            onChange={(v) => onChange({ ...prefs, textScale: v })}
            sample="Аа"
            pctFactor={80}
          />
        </div>

        {/* Text brightness */}
        <div style={rowStyle}>
          <div style={labelStyle}>Яркость текста</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {([
              { v: 'normal', label: 'Обычная' },
              { v: 'high', label: 'Ярче' },
              { v: 'max', label: 'Ярко' },
            ] as { v: Prefs['textBright']; label: string }[]).map((o) => (
              <div
                key={o.v}
                onClick={() => onChange({ ...prefs, textBright: o.v })}
                style={{
                  flex: 1,
                  textAlign: 'center',
                  padding: '9px 0',
                  borderRadius: 2,
                  cursor: 'pointer',
                  fontSize: fs(12),
                  letterSpacing: '0.5px',
                  textTransform: 'uppercase',
                  border: prefs.textBright === o.v ? '1px solid rgba(var(--gold-rgb),0.6)' : '1px solid rgba(var(--gold-rgb),0.15)',
                  background: prefs.textBright === o.v ? 'rgba(var(--gold-rgb),0.08)' : 'transparent',
                  color: prefs.textBright === o.v ? COLORS.gold : COLORS.textFaint,
                }}
              >
                {o.label}
              </div>
            ))}
          </div>
        </div>

        {/* Game mode — the rock-paper-scissors gate before creating things. */}
        <div style={rowStyle}>
          <div style={labelStyle}>Игровой режим</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {([
              { v: true, label: 'Включён' },
              { v: false, label: 'Выключен' },
            ] as { v: boolean; label: string }[]).map((o) => (
              <div
                key={String(o.v)}
                onClick={() => onChange({ ...prefs, gameMode: o.v })}
                style={{
                  flex: 1,
                  textAlign: 'center',
                  padding: '10px 0',
                  borderRadius: 2,
                  cursor: 'pointer',
                  fontSize: fs(13),
                  letterSpacing: '1px',
                  textTransform: 'uppercase',
                  border: prefs.gameMode === o.v ? '1px solid rgba(var(--gold-rgb),0.6)' : '1px solid rgba(var(--gold-rgb),0.15)',
                  background: prefs.gameMode === o.v ? 'rgba(var(--gold-rgb),0.08)' : 'transparent',
                  color: prefs.gameMode === o.v ? COLORS.gold : COLORS.textFaint,
                }}
              >
                {o.label}
              </div>
            ))}
          </div>
        </div>

        {/* Инка-календарь: зеркалит сессии/консультации в Google Calendar
            мастера через «дверцу» бота. Настоящий выключатель — СЕКРЕТ:
            без него переключатель ничего не делает (бот ответит 401),
            поэтому другие пользователи приложения, не знающие секрета,
            писать в чужой календарь не могут. Секрет живёт только в
            localStorage этого устройства и НЕ попадает в резервную копию. */}
        <div style={rowStyle}>
          <div style={labelStyle}>Инка-календарь · Синхронизация</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {([
              { v: true, label: 'Включена' },
              { v: false, label: 'Выключена' },
            ] as { v: boolean; label: string }[]).map((o) => (
              <div
                key={String(o.v)}
                onClick={() => onChangeCalendarSync({ ...calendarSync, enabled: o.v })}
                style={{
                  flex: 1,
                  textAlign: 'center',
                  padding: '10px 0',
                  borderRadius: 2,
                  cursor: 'pointer',
                  fontSize: fs(13),
                  letterSpacing: '1px',
                  textTransform: 'uppercase',
                  border: calendarSync.enabled === o.v ? '1px solid rgba(var(--gold-rgb),0.6)' : '1px solid rgba(var(--gold-rgb),0.15)',
                  background: calendarSync.enabled === o.v ? 'rgba(var(--gold-rgb),0.08)' : 'transparent',
                  color: calendarSync.enabled === o.v ? COLORS.gold : COLORS.textFaint,
                }}
              >
                {o.label}
              </div>
            ))}
          </div>
          <input
            type="password"
            value={calendarSync.secret}
            onChange={(e) => onChangeCalendarSync({ ...calendarSync, secret: e.target.value })}
            placeholder="Секретный код синхронизации"
            autoComplete="off"
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '10px 12px',
              marginBottom: 8,
              borderRadius: 2,
              border: '1px solid rgba(var(--gold-rgb),0.2)',
              background: 'rgba(var(--surface-rgb),0.03)',
              color: 'var(--text-secondary)',
              fontSize: fs(13),
              outline: 'none',
            }}
          />
          <input
            type="text"
            value={calendarSync.endpoint}
            onChange={(e) => onChangeCalendarSync({ ...calendarSync, endpoint: e.target.value || DEFAULT_ENDPOINT })}
            placeholder={DEFAULT_ENDPOINT}
            autoComplete="off"
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '10px 12px',
              borderRadius: 2,
              border: '1px solid rgba(var(--gold-rgb),0.2)',
              background: 'rgba(var(--surface-rgb),0.03)',
              color: 'var(--text-secondary)',
              fontSize: fs(12),
              outline: 'none',
            }}
          />
          <div style={{ marginTop: 8, fontSize: fs(11), color: COLORS.textGhost, fontStyle: 'italic', lineHeight: 1.5 }}>
            {syncActive(calendarSync)
              ? 'записи и консультации улетают в календарь Инки при сохранении.'
              : calendarSync.enabled
              ? 'нужен секретный код — без него синхронизация не работает.'
              : 'выключена: записи остаются только в дневнике.'}
          </div>
        </div>

        {/* Reset */}
        <div
          onClick={() => onChange({ ...DEFAULT_PREFS })}
          style={{
            marginTop: 6,
            textAlign: 'center',
            padding: '11px 0',
            fontSize: fs(12),
            letterSpacing: '1px',
            textTransform: 'uppercase',
            fontStyle: 'italic',
            color: COLORS.textFaint,
            cursor: 'pointer',
          }}
        >
          Сбросить по умолчанию
        </div>

        {/* Master's own card: flexible contact/payment rows + free-text bank
            details, kept in one place instead of scattered notes. */}
        <div style={rowStyle}>
          <div style={labelStyle}>Карточка мастера · Контакты и оплата</div>
          {masterInfo.links.map((link) => (
            <div
              key={link.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 10,
                padding: '8px 0',
                borderBottom: '1px solid rgba(var(--gold-rgb),0.08)',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: fs(12), color: COLORS.gold, letterSpacing: '0.3px' }}>{link.label}</div>
                <div style={{ fontSize: fs(13), color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{link.value}</div>
              </div>
              <span onClick={() => removeMasterLink(link.id)} style={{ cursor: 'pointer', color: COLORS.textFaint, fontSize: fs(18), flexShrink: 0, lineHeight: 1 }}>
                ×
              </span>
            </div>
          ))}
          <AddMasterLinkForm onAdd={addMasterLink} />
        </div>

        <div style={rowStyle}>
          <div style={labelStyle}>Банковские реквизиты</div>
          <textarea
            value={masterInfo.bankDetails}
            onChange={(e) => onChangeMasterInfo({ ...masterInfo, bankDetails: e.target.value })}
            placeholder="Счёт, БИК, ИНН..."
            style={{ ...INPUT_STYLE, resize: 'none', height: 90 }}
          />
        </div>

        <div style={rowStyle}>
          <div style={labelStyle}>Обозначения цветов</div>
          {MARKER_COLORS.map((c) => (
            <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', background: c, flexShrink: 0 }} />
              <input
                value={masterInfo.colorLabels[c] || ''}
                onChange={(e) => setColorLabel(c, e.target.value)}
                placeholder="Например: Постоянные клиенты"
                style={{ ...INPUT_STYLE, flex: 1 }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ===================== SUMMARY SCREEN («Сводка») =====================
// Aggregates notes from every client, tagged with the client's colour + name
// (plain type, no drop-cap). Filter by urgency and optionally include closed
// (🍀) notes; toggling done fades a note out.
function SummaryScreen({
  clients,
  onToggleDone,
  onEditNote,
  onOpenClient,
  onOpenConsultation,
}: {
  clients: Client[];
  onToggleDone: (clientId: string, note: ClientNote) => void;
  onEditNote: (clientId: string, note: ClientNote) => void;
  onOpenClient: (id: string) => void;
  onOpenConsultation: (clientId: string, consultationId: string) => void;
}) {
  const [filter, setFilter] = useState<UrgencyKey | 'all'>('all');
  const [showClosed, setShowClosed] = useState(false);

  // Planned (not-done) consultations, across every client, soonest first —
  // a quick shortened view (date · client · place) that opens straight into
  // the consultation when tapped.
  const plannedConsultations = clients
    .flatMap((c) => c.consultations.map((consultation) => ({ consultation, client: c })))
    .filter(({ consultation }) => !consultation.done)
    .sort((a, b) => (a.consultation.date || '').localeCompare(b.consultation.date || ''));

  const items = clients
    .flatMap((c) => c.notes.map((note) => ({ note, client: c })))
    .filter(({ note }) => {
      if (!showClosed && note.done) return false;
      if (filter !== 'all' && note.urgency !== filter) return false;
      return true;
    })
    .sort((a, b) => {
      if (a.note.done !== b.note.done) return a.note.done ? 1 : -1;
      const r = urgencyRank(a.note.urgency) - urgencyRank(b.note.urgency);
      return r !== 0 ? r : b.note.createdDate.localeCompare(a.note.createdDate);
    });

  const filterChip = (label: string, active: boolean, onClick: () => void) => (
    <div
      onClick={onClick}
      style={{
        fontSize: fs(12),
        padding: '5px 10px',
        borderRadius: 2,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        whiteSpace: 'nowrap',
        border: active ? '1px solid rgba(var(--gold-rgb),0.6)' : '1px solid rgba(var(--gold-rgb),0.15)',
        background: active ? 'rgba(var(--gold-rgb),0.08)' : 'transparent',
        color: active ? COLORS.gold : COLORS.textFaint,
        letterSpacing: '0.4px',
        transition: 'all 0.2s',
      }}
    >
      {label}
    </div>
  );

  return (
    <div style={{ minHeight: '100%', background: COLORS.bg }}>
      {/* Dot-grid texture overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'radial-gradient(circle, rgba(var(--gold-rgb),0.035) 1px, transparent 1px)',
          backgroundSize: '22px 22px',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />
      <StarfieldBackground />
      <CloudsBackground />
      <AviationBackground />
      <div style={{ height: 'calc(env(safe-area-inset-top) + 18px)' }} />
      <div style={{ padding: '6px 24px 12px', position: 'relative', zIndex: 1 }}>
        <div
          style={{
            fontFamily: DROP_CAP_FONT,
            fontSize: fs(24),
            color: COLORS.gold,
            letterSpacing: '5px',
            textTransform: 'uppercase',
          }}
        >
          Задачи
        </div>
        <div style={{ fontSize: fs(9.66), color: COLORS.textGhost, letterSpacing: `${fs(2.97)}px`, textTransform: 'uppercase', marginTop: 3, fontStyle: 'italic' }}>
          Рабочие заметки
        </div>
        <StarDivider />
      </div>

      {/* Planned consultations — shortened view (date · client · place),
          tapping opens the consultation itself. */}
      {plannedConsultations.length > 0 && (
        <div style={{ padding: '4px 20px 0', position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: fs(11), color: COLORS.textGhost, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 8 }}>
            Запланированные консультации
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {plannedConsultations.map(({ consultation, client }) => (
              <div
                key={`cons-${client.id}-${consultation.id}`}
                onClick={() => onOpenConsultation(client.id, consultation.id)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 10px',
                  borderRadius: 2,
                  cursor: 'pointer',
                  border: '1px solid rgba(var(--gold-rgb),0.15)',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: fs(14), color: COLORS.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {client.name || '—'}
                  </div>
                  {consultation.area && (
                    <div style={{ fontSize: fs(11), color: COLORS.textFaint, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                      {consultation.area}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: fs(12), color: COLORS.textGhost, flexShrink: 0 }}>
                  {formatDate(consultation.date).replace(/ \d{4}$/, '')}
                  {consultation.time && <span style={{ color: COLORS.gold }}> · {consultation.time}</span>}
                </div>
              </div>
            ))}
          </div>
          <StarDivider />
        </div>
      )}

      {/* Filters */}
      <div style={{ padding: '4px 20px 0', position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {filterChip('Все', filter === 'all', () => setFilter('all'))}
          {URGENCY.map((u) =>
            <span key={u.key}>{filterChip(`${u.emoji} ${u.short}`, filter === u.key, () => setFilter(u.key))}</span>,
          )}
        </div>
        <div style={{ marginTop: 8 }}>
          {filterChip(`${DONE_EMOJI} Показывать закрытые`, showClosed, () => setShowClosed((v) => !v))}
        </div>
      </div>

      {/* Aggregated notes */}
      <div style={{ padding: '16px 20px 110px', position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.length === 0 ? (
          <div style={{ textAlign: 'center', marginTop: 40, fontSize: fs(15), color: COLORS.textGhost, fontStyle: 'italic' }}>
            {clients.some((c) => c.notes.length) ? 'Нет заметок по этому фильтру' : 'Заметок пока нет'}
          </div>
        ) : (
          items.map(({ note, client }) => (
            <div key={`${client.id}-${note.id}`} onClick={() => onOpenClient(client.id)} style={{ cursor: 'pointer' }}>
              <NoteItem
                note={note}
                client={client}
                onToggleDone={() => onToggleDone(client.id, { ...note, done: !note.done })}
                onEdit={(text, urgency) => onEditNote(client.id, { ...note, text, urgency })}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// A themed range slider with a live value chip.
function SettingSlider({
  min,
  max,
  step,
  value,
  onChange,
  sample,
  pctFactor = 100,
}: {
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  sample?: string;
  pctFactor?: number;
}) {
  // Shown as a percentage (pctFactor lets the text-size scale read 80% at its
  // smallest step instead of 100%), which reads clearer than the raw position.
  const pct = Math.round(value * pctFactor);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      {sample && <span style={{ fontSize: fs(13), color: COLORS.textFaint, flexShrink: 0 }}>{sample}</span>}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="inka-range"
        style={{ flex: 1 }}
      />
      {sample && <span style={{ fontSize: fs(20), color: COLORS.textFaint, flexShrink: 0 }}>{sample}</span>}
      <span style={{ fontSize: fs(12), color: COLORS.gold, width: 42, textAlign: 'right', flexShrink: 0 }}>{pct}%</span>
    </div>
  );
}

// Collapses/expands the client hero — sits at the end of whichever row is
// showing (collapsed strip or the expanded styles/count line) via marginLeft:
// auto, so it stays in the same place either way.
function HeaderCollapseToggle({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <div
      className="inka-back"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      role="button"
      aria-label={collapsed ? 'Развернуть карточку клиента' : 'Свернуть карточку клиента'}
      style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', marginLeft: 'auto', flexShrink: 0 }}
    >
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none" style={{ transform: collapsed ? 'none' : 'rotate(180deg)', transition: 'transform 0.25s' }}>
        <path d="M3.5 6.5L8 11L12.5 6.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

// ===================== DETAIL SCREEN =====================
function DetailScreen({
  client,
  activeTab,
  onTab,
  onBack,
  onSave,
  onEditClient,
  onAddSession,
  onEditSession,
  onDeleteSession,
  onUpdateSessionPhotos,
  onToggleSessionDone,
  onEditConsultation,
  onDeleteConsultation,
  onAddDocument,
  onRemoveDocument,
  onUpsertNote,
  onAddNote,
  onDeleteNote,
}: {
  client: Client;
  activeTab: 'info' | 'sessions' | 'extra';
  onTab: (t: 'info' | 'sessions' | 'extra') => void;
  onBack: () => void;
  onSave: (client: Client) => void;
  onEditClient: () => void;
  onAddSession: () => void;
  onEditSession: (session: Session) => void;
  onDeleteSession: (sessionId: string) => void;
  onUpdateSessionPhotos: (sessionId: string, photos: string[]) => void;
  onToggleSessionDone: (sessionId: string) => void;
  onEditConsultation: (consultation: Consultation) => void;
  onDeleteConsultation: (consultationId: string) => void;
  onAddDocument: (doc: ClientDocument) => void;
  onRemoveDocument: (docId: string) => void;
  onUpsertNote: (note: ClientNote) => void;
  onAddNote: (text: string, urgency: UrgencyKey, photos: string[]) => void;
  onDeleteNote: (noteId: string) => void;
}) {
  const tabStyle = (tab: typeof activeTab): React.CSSProperties => ({
    flex: 1,
    textAlign: 'center',
    padding: '11px 0',
    fontSize: fs(13),
    letterSpacing: '1.5px',
    textTransform: 'uppercase',
    color: activeTab === tab ? COLORS.gold : 'var(--ink-faint)',
    borderBottom: activeTab === tab ? `1px solid ${COLORS.gold}` : '1px solid transparent',
    cursor: 'pointer',
    transition: 'color 0.25s',
  });

  // The tab-content scroller is a single reused DOM node across every client
  // and every tab, so its scrollTop otherwise carries over — opening a new
  // client (or switching tabs) could land you mid-scroll instead of at top.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0);
  }, [client.id, activeTab]);

  // The hero (name, styles, client note) can be collapsed to a slim strip so
  // «Сессии»/«Доп.» get more room to work with — resets to expanded whenever
  // a different client is opened.
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  useEffect(() => {
    setHeaderCollapsed(false);
  }, [client.id]);

  return (
    <>
      {/* Hero header */}
      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          background: 'var(--hero-grad)',
          flexShrink: 0,
          paddingTop: 'env(safe-area-inset-top)',
        }}
      >
        {/* Status bar with back */}
        <div style={{ height: 56, padding: '18px 24px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 10 }}>
          <div className="inka-back" onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M11 4L6 9L11 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span style={{ fontSize: fs(15), color: COLORS.gold, fontStyle: 'italic', letterSpacing: '0.3px' }}>вернуться</span>
          </div>
          {/* Edit client */}
          <div
            className="inka-back"
            onClick={onEditClient}
            style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
          >
            <span style={{ fontSize: fs(15), color: COLORS.gold, fontStyle: 'italic', letterSpacing: '0.3px' }}>править</span>
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <path d="M11 2.5L13.5 5L5.5 13H3V10.5L11 2.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
            </svg>
          </div>
        </div>

        {headerCollapsed ? (
          /* Collapsed strip — just enough to place the client, tap to re-expand */
          <div
            onClick={() => setHeaderCollapsed(false)}
            style={{ padding: '0 24px 16px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', position: 'relative', zIndex: 5 }}
          >
            <span dir="auto" style={{ fontFamily: DROP_CAP_FONT, fontSize: fs(17), color: COLORS.textPrimary, fontWeight: 600, letterSpacing: '0.5px' }}>
              {client.name}
              {client.surname ? ` ${client.surname}` : ''}
            </span>
            <span style={{ fontSize: fs(13), color: COLORS.textGhost }}>· {client.sessions.length} сессий</span>
            <HeaderCollapseToggle collapsed={headerCollapsed} onToggle={() => setHeaderCollapsed((v) => !v)} />
          </div>
        ) : (
          /* Giant drop cap hero */
          <div style={{ padding: '12px 24px 18px', position: 'relative', zIndex: 5 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 2, direction: isRTL(client.name) ? 'rtl' : 'ltr' }}>
              <span
                style={{
                  fontFamily: DROP_CAP_FONT,
                  fontSize: fs(125),
                  fontWeight: 600,
                  lineHeight: 0.79,
                  color: COLORS.gold,
                  letterSpacing: '-2px',
                  flexShrink: 0,
                  marginLeft: -5,
                }}
              >
                {firstLetter(client.name)}
              </span>
              <div style={{ paddingTop: 16, paddingLeft: 6, minWidth: 0 }}>
                <div dir="auto" style={{ fontFamily: DROP_CAP_FONT, fontSize: fs(33), color: COLORS.textPrimary, fontWeight: 600, lineHeight: 1.05, letterSpacing: '1px' }}>
                  {nameRest(client.name)}
                </div>
                <div dir="auto" style={{ fontFamily: DROP_CAP_FONT, fontSize: fs(19), color: COLORS.textMuted, fontWeight: 600, marginTop: 5, letterSpacing: '0.5px' }}>
                  {client.surname}
                </div>
              </div>
            </div>
            {/* Style(s) + session count — styles carry the client's marker colour */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 13, flexWrap: 'wrap' }}>
              <div style={{ width: 22, height: 2, background: client.color, borderRadius: 1, flexShrink: 0 }} />
              <span style={{ fontSize: fs(13), color: client.color, letterSpacing: '2.5px', textTransform: 'uppercase', fontWeight: 600 }}>
                {stylesLabel(client) || 'Без стиля'}
              </span>
              <span style={{ fontSize: fs(13), color: COLORS.textGhost }}>· {client.sessions.length} сессий</span>
              <HeaderCollapseToggle collapsed={headerCollapsed} onToggle={() => setHeaderCollapsed((v) => !v)} />
            </div>

            {/* Notes about the client — moved up into the header (per design). */}
            {client.note && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontFamily: "'Kelly Slab', 'Playfair Display', serif", fontSize: fs(10), color: COLORS.textGhost, letterSpacing: '3px', textTransform: 'uppercase', marginBottom: 6 }}>
                  Заметки о клиенте
                </div>
                <div
                  dir="auto"
                  style={{
                    fontSize: fs(15),
                    color: 'var(--text-soft)',
                    fontStyle: 'italic',
                    lineHeight: 1.5,
                    display: '-webkit-box',
                    WebkitLineClamp: 4,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {client.note}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Client marker stripe */}
        <div style={{ height: 3, background: client.color, width: '100%', flexShrink: 0 }} />
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(var(--gold-rgb),0.1)', padding: '0 24px', background: COLORS.bg, flexShrink: 0 }}>
        <div onClick={() => onTab('sessions')} style={tabStyle('sessions')}>
          Сессии
        </div>
        <div onClick={() => onTab('info')} style={tabStyle('info')}>
          Инфо
        </div>
        <div onClick={() => onTab('extra')} style={tabStyle('extra')}>
          Задачи
        </div>
      </div>

      {/* "История работы" sub-header — pinned below the tab bar (never
          scrolls), shown only on the Сессии tab. The add-session "+" sits on
          the left; tap runs the RPS game first, then opens the sheet. */}
      {activeTab === 'sessions' && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 24px',
            background: COLORS.bg,
            flexShrink: 0,
          }}
        >
          <div
            onClick={onAddSession}
            role="button"
            aria-label="Добавить сессию"
            style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              border: '1px solid rgba(var(--gold-rgb),0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
              <line x1="7" y1="1.5" x2="7" y2="12.5" stroke="var(--gold)" strokeWidth="1.3" strokeLinecap="round" />
              <line x1="1.5" y1="7" x2="12.5" y2="7" stroke="var(--gold)" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </div>
          <div
            style={{
              fontFamily: "'Kelly Slab', 'Playfair Display', serif",
              fontSize: fs(11),
              color: COLORS.textGhost,
              letterSpacing: '3.5px',
              textTransform: 'uppercase',
            }}
          >
            История работы
          </div>
        </div>
      )}

      {/* Tab content */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', position: 'relative', padding: '22px 24px 50px', background: COLORS.bg }}>
        <StarfieldBackground />
        <CloudsBackground />
        <AviationBackground />
        {activeTab === 'sessions' && (
          <SessionsTab
            client={client}
            onEditSession={onEditSession}
            onDeleteSession={onDeleteSession}
            onUpdateSessionPhotos={onUpdateSessionPhotos}
            onToggleSessionDone={onToggleSessionDone}
            onEditConsultation={onEditConsultation}
            onDeleteConsultation={onDeleteConsultation}
          />
        )}
        {activeTab === 'info' && (
          <InfoTab
            client={client}
            onSave={onSave}
            onAddDocument={onAddDocument}
            onRemoveDocument={onRemoveDocument}
          />
        )}
        {activeTab === 'extra' && (
          <AdditionalTab
            client={client}
            onUpsertNote={onUpsertNote}
            onAddNote={onAddNote}
            onDeleteNote={onDeleteNote}
          />
        )}
      </div>
    </>
  );
}

// ── Info tab ──
function InfoTab({
  client,
  onSave,
  onAddDocument,
  onRemoveDocument,
}: {
  client: Client;
  onSave: (client: Client) => void;
  onAddDocument: (doc: ClientDocument) => void;
  onRemoveDocument: (docId: string) => void;
}) {
  const metaCell = (span = false): React.CSSProperties => ({
    background: 'rgba(var(--surface-rgb),0.018)',
    border: '1px solid rgba(var(--gold-rgb),0.1)',
    borderRadius: 2,
    padding: 13,
    gridColumn: span ? 'span 2' : undefined,
  });

  return (
    <div style={{ animation: 'fadeSlideIn 0.3s ease' }}>
      {/* Contacts — moved to the top (was master notes) */}
      <ContactsSection client={client} onSave={onSave} first />

      <SectionDivider />

      {/* Meta grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div style={metaCell()}>
          <MetaLabel>Стиль</MetaLabel>
          <div style={{ fontSize: fs(15), color: client.color, fontWeight: 600 }}>{stylesLabel(client) || '—'}</div>
        </div>
        <div style={metaCell()}>
          <MetaLabel>Сессий</MetaLabel>
          <MetaValue>{String(client.sessions.length)}</MetaValue>
        </div>
        <div style={metaCell(true)}>
          <MetaLabel>Последняя сессия</MetaLabel>
          <MetaValue>{lastSessionDate(client)}</MetaValue>
        </div>
      </div>

      {/* Skin: type + tone + notes */}
      <SkinSection client={client} onSave={onSave} />

      {/* Master's own notes — written inline right here, at the bottom */}
      <MasterNoteSection client={client} onSave={onSave} />

      {/* Attachments — documents / photos / any file for this client */}
      <AttachmentsSection client={client} onAddDocument={onAddDocument} onRemoveDocument={onRemoveDocument} />
    </div>
  );
}

// ── Master notes (written inline from the info tab, drop-cap styled) ──
function MasterNoteSection({ client, onSave }: { client: Client; onSave: (client: Client) => void }) {
  const [value, setValue] = useState(client.masterNote || '');
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setValue(client.masterNote || '');
    setEditing(false);
  }, [client.id]);

  const save = () => {
    setEditing(false);
    if (value.trim() !== (client.masterNote || '')) onSave({ ...client, masterNote: value.trim() });
  };

  const note = client.masterNote || '';
  return (
    <div style={{ marginTop: 22 }}>
      <SectionDivider />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <SectionHeader>Заметки мастера</SectionHeader>
        {!editing && (
          <span onClick={() => setEditing(true)} style={{ fontSize: fs(13), color: COLORS.gold, fontStyle: 'italic', cursor: 'pointer', marginTop: -10 }}>
            {note ? 'править' : 'добавить'}
          </span>
        )}
      </div>
      {editing ? (
        <textarea
          dir="auto"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
          placeholder="Ваши личные заметки о работе с клиентом..."
          style={{
            width: '100%',
            background: 'rgba(var(--surface-rgb),0.018)',
            border: '1px solid rgba(var(--gold-rgb),0.1)',
            borderRadius: 2,
            padding: '11px 13px',
            fontFamily: "'Inter', sans-serif",
            color: COLORS.textPrimary,
            outline: 'none',
            resize: 'none',
            height: 110,
            fontStyle: 'italic',
            lineHeight: 1.6,
            letterSpacing: '0.3px',
          }}
        />
      ) : note ? (
        <div dir="auto" onClick={() => setEditing(true)} style={{ overflow: 'hidden', lineHeight: 1, cursor: 'text' }}>
          <span
            style={{
              fontFamily: DROP_CAP_FONT,
              fontSize: fs(52),
              lineHeight: 0.81,
              color: 'rgba(var(--gold-rgb),0.42)',
              float: isRTL(note) ? 'right' : 'left',
              [isRTL(note) ? 'marginLeft' : 'marginRight']: 7,
              paddingBottom: 2,
              marginTop: 1,
            }}
          >
            {note.charAt(0)}
          </span>
          <span style={{ fontSize: fs(17), color: 'var(--text-soft)', lineHeight: 1.7, fontStyle: 'italic', display: 'block', overflow: 'hidden' }}>
            {note.slice(1)}
          </span>
        </div>
      ) : (
        <div onClick={() => setEditing(true)} style={{ fontSize: fs(15), color: COLORS.textGhost, fontStyle: 'italic', cursor: 'text' }}>
          Заметок пока нет — нажмите, чтобы добавить.
        </div>
      )}
    </div>
  );
}

// Two-step delete control: first tap reveals an inline confirm row.
function DeleteButton({
  label,
  confirmLabel,
  onConfirm,
  compact = false,
}: {
  label: string;
  confirmLabel: string;
  onConfirm: () => void;
  compact?: boolean;
}) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <div
        onClick={() => setConfirming(true)}
        style={{
          border: '1px solid rgba(138,48,64,0.3)',
          borderRadius: 2,
          padding: compact ? '6px 10px' : '11px 14px',
          textAlign: 'center',
          cursor: 'pointer',
          color: '#A85A66',
          fontSize: compact ? 10 : 11,
          letterSpacing: '1px',
          textTransform: 'uppercase',
          fontStyle: 'italic',
        }}
      >
        {label}
      </div>
    );
  }

  return (
    <div
      style={{
        border: '1px solid rgba(138,48,64,0.45)',
        borderRadius: 2,
        padding: compact ? '6px 8px' : '11px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: 'rgba(138,48,64,0.06)',
      }}
    >
      <span style={{ flex: 1, fontSize: compact ? 10 : 12, color: '#A85A66', fontStyle: 'italic', letterSpacing: '0.3px' }}>
        {confirmLabel}
      </span>
      <span
        onClick={onConfirm}
        style={{
          fontSize: compact ? 10 : 11,
          color: '#C56676',
          letterSpacing: '1px',
          textTransform: 'uppercase',
          cursor: 'pointer',
          padding: '4px 8px',
          border: '1px solid rgba(138,48,64,0.5)',
          borderRadius: 2,
        }}
      >
        Да
      </span>
      <span
        onClick={() => setConfirming(false)}
        style={{
          fontSize: compact ? 10 : 11,
          color: COLORS.textFaint,
          letterSpacing: '1px',
          textTransform: 'uppercase',
          cursor: 'pointer',
          padding: '4px 8px',
        }}
      >
        Нет
      </span>
    </div>
  );
}

function MetaLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: fs(11), color: COLORS.textGhost, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 6 }}>
      {children}
    </div>
  );
}
function MetaValue({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: fs(15), color: COLORS.textPrimary, fontWeight: 300 }}>{children}</div>;
}

// ── Skin (type + notes) ──
function SectionDivider() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, clear: 'both' }}>
      <div style={{ flex: 1, height: 1, background: 'linear-gradient(to right, rgba(var(--gold-rgb),0.28), transparent)' }} />
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
        <path d="M5 1L5.8 4H9L6.5 5.8L7.3 9L5 7.2L2.7 9L3.5 5.8L1 4H4.2Z" fill="currentColor" fillOpacity="0.28" />
      </svg>
      <div style={{ flex: 1, height: 1, background: 'linear-gradient(to left, rgba(var(--gold-rgb),0.28), transparent)' }} />
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: "'Kelly Slab', 'Playfair Display', serif",
        fontSize: fs(11),
        color: COLORS.textGhost,
        letterSpacing: '3.5px',
        textTransform: 'uppercase',
        marginBottom: 12,
      }}
    >
      {children}
    </div>
  );
}

// ── Reusable pickers (skin tone / marker colour / styles) ──
function SkinTonePalette({ value, onPick }: { value: string; onPick: (hex: string) => void }) {
  const selected = value ? value.toLowerCase() : '';
  const hasSel = !!selected;
  // Once a tone is picked the rest collapse away and the chosen swatch grows for
  // readability; picking again (or «изменить») expands the full palette back.
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center' }}>
      {SKIN_TONES.map((t) => {
        const sel = selected === t.toLowerCase();
        const hidden = hasSel && !sel;
        const size = sel ? 46 : 26;
        return (
          <div
            key={t}
            onClick={() => onPick(t)}
            style={{
              width: hidden ? 0 : size,
              height: hidden ? 0 : size,
              margin: hidden ? 0 : 4,
              borderRadius: '50%',
              background: t,
              cursor: 'pointer',
              opacity: hidden ? 0 : 1,
              overflow: 'hidden',
              flexShrink: 0,
              border: sel ? '2px solid var(--gold)' : '1px solid rgba(var(--gold-rgb),0.2)',
              boxShadow: sel ? '0 0 0 3px rgba(var(--gold-rgb),0.28), 0 4px 12px rgba(0,0,0,0.25)' : undefined,
              transition:
                'width 0.42s cubic-bezier(0.34,1.56,0.64,1), height 0.42s cubic-bezier(0.34,1.56,0.64,1), margin 0.42s ease, opacity 0.3s ease, box-shadow 0.3s',
            }}
          />
        );
      })}
      {hasSel && (
        <span
          onClick={() => onPick(value)}
          style={{ marginLeft: 12, fontSize: fs(13), color: COLORS.gold, fontStyle: 'italic', cursor: 'pointer' }}
        >
          изменить
        </span>
      )}
    </div>
  );
}

function MarkerColorPalette({ value, onPick }: { value: string; onPick: (hex: string) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
      {MARKER_COLORS.map((c) => {
        const sel = value.toLowerCase() === c.toLowerCase();
        return (
          <div
            key={c}
            onClick={() => onPick(c)}
            style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              background: c,
              cursor: 'pointer',
              border: sel ? '2px solid var(--text)' : '1px solid rgba(var(--gold-rgb),0.25)',
              boxShadow: sel ? `0 0 0 2px ${c}` : undefined,
            }}
          />
        );
      })}
    </div>
  );
}

// Three-way segmented toggle for Client.clientType (Клиент / Модель / Другое).
function ClientTypeToggle({ value, onChange }: { value: ClientType; onChange: (t: ClientType) => void }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {CLIENT_TYPES.map((t) => (
        <div
          key={t.value}
          onClick={() => onChange(t.value)}
          style={{
            flex: 1,
            textAlign: 'center',
            padding: '10px 0',
            borderRadius: 2,
            cursor: 'pointer',
            fontSize: fs(13),
            letterSpacing: '1px',
            textTransform: 'uppercase',
            border: value === t.value ? '1px solid rgba(var(--gold-rgb),0.6)' : '1px solid rgba(var(--gold-rgb),0.15)',
            background: value === t.value ? 'rgba(var(--gold-rgb),0.08)' : 'transparent',
            color: value === t.value ? COLORS.gold : COLORS.textFaint,
          }}
        >
          {t.label}
        </div>
      ))}
    </div>
  );
}

// Multi-select style picker. The full palette (20 styles) is too many chips to
// show at once — a master typically works in only 3-4 main directions — so
// only the first STYLES_PINNED_COUNT are shown by default, plus any already
// selected style outside that set (so a saved choice never looks "lost").
// "Ещё стили" reveals the rest.
function StyleChips({ selected, onToggle }: { selected: string[]; onToggle: (s: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const pinned = STYLES.slice(0, STYLES_PINNED_COUNT);
  const rest = STYLES.slice(STYLES_PINNED_COUNT);
  const extraSelected = rest.filter((s) => selected.includes(s));
  const visible = expanded ? STYLES : [...pinned, ...extraSelected];
  const hiddenCount = STYLES.length - visible.length;

  const chip = (s: string) => {
    const on = selected.includes(s);
    return (
      <div
        key={s}
        onClick={() => onToggle(s)}
        style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: fs(12),
          padding: '6px 11px',
          borderRadius: 2,
          cursor: 'pointer',
          border: on ? '1px solid rgba(var(--gold-rgb),0.65)' : '1px solid rgba(var(--gold-rgb),0.15)',
          color: on ? COLORS.gold : COLORS.textFaint,
          background: on ? 'rgba(var(--gold-rgb),0.08)' : 'transparent',
          letterSpacing: '0.8px',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
          transition: 'all 0.2s',
          fontWeight: 500,
        }}
      >
        {s}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      {visible.map(chip)}
      {hiddenCount > 0 && (
        <div
          onClick={() => setExpanded(true)}
          style={{
            fontSize: fs(12),
            padding: '6px 11px',
            color: COLORS.textGhost,
            fontStyle: 'italic',
            cursor: 'pointer',
            letterSpacing: '0.3px',
            whiteSpace: 'nowrap',
          }}
        >
          Ещё стили ({hiddenCount}) ▾
        </div>
      )}
      {expanded && (
        <div
          onClick={() => setExpanded(false)}
          style={{
            fontSize: fs(12),
            padding: '6px 11px',
            color: COLORS.textGhost,
            fontStyle: 'italic',
            cursor: 'pointer',
            letterSpacing: '0.3px',
            whiteSpace: 'nowrap',
          }}
        >
          Свернуть ▴
        </div>
      )}
    </div>
  );
}

function SkinSection({ client, onSave }: { client: Client; onSave: (client: Client) => void }) {
  const [skinType, setSkinType] = useState(client.skinType || '');
  const [allergies, setAllergies] = useState(client.allergies || '');
  const [skinReactions, setSkinReactions] = useState(client.skinReactions || '');

  useEffect(() => {
    setSkinType(client.skinType || '');
    setAllergies(client.allergies || '');
    setSkinReactions(client.skinReactions || '');
  }, [client.id]);

  const saveType = (value: string) => {
    setSkinType(value);
    if (value !== (client.skinType || '')) onSave({ ...client, skinType: value });
  };
  const saveTone = (tone: string) => {
    const next = tone === client.skinTone ? '' : tone;
    onSave({ ...client, skinTone: next });
  };
  const saveAllergies = () => {
    if (allergies.trim() !== (client.allergies || '')) onSave({ ...client, allergies: allergies.trim() });
  };
  const saveSkinReactions = () => {
    if (skinReactions.trim() !== (client.skinReactions || '')) onSave({ ...client, skinReactions: skinReactions.trim() });
  };

  return (
    <div style={{ marginTop: 22 }}>
      <SectionDivider />
      <SectionHeader>Кожа</SectionHeader>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: fs(11), color: COLORS.textGhost, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 8 }}>
          Тон кожи
        </div>
        <SkinTonePalette value={client.skinTone || ''} onPick={saveTone} />
      </div>

      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: fs(11), color: COLORS.textGhost, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 6 }}>
          Тип кожи
        </div>
        <select
          value={skinType}
          onChange={(e) => saveType(e.target.value)}
          style={{
            width: '100%',
            background: 'rgba(var(--surface-rgb),0.018)',
            border: '1px solid rgba(var(--gold-rgb),0.1)',
            borderRadius: 2,
            padding: '11px 13px',
            fontFamily: "'Inter', sans-serif",
            color: skinType ? COLORS.textPrimary : COLORS.textGhost,
            outline: 'none',
            appearance: 'none',
          }}
        >
          {SKIN_TYPES.map((s) => (
            <option key={s.value} value={s.value} style={{ background: COLORS.bg }}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: fs(11), color: COLORS.textGhost, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 6 }}>
          Аллергии
        </div>
        <textarea
          value={allergies}
          onChange={(e) => setAllergies(e.target.value)}
          onBlur={saveAllergies}
          placeholder="Перечислите известные аллергии..."
          style={{
            width: '100%',
            background: 'rgba(var(--surface-rgb),0.018)',
            border: '1px solid rgba(var(--gold-rgb),0.1)',
            borderRadius: 2,
            padding: '11px 13px',
            fontFamily: "'Inter', sans-serif",
            color: COLORS.textPrimary,
            outline: 'none',
            resize: 'none',
            height: 60,
            letterSpacing: '0.3px',
          }}
        />
      </div>

      <div>
        <div style={{ fontSize: fs(11), color: COLORS.textGhost, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 6 }}>
          Реакции кожи
        </div>
        <textarea
          value={skinReactions}
          onChange={(e) => setSkinReactions(e.target.value)}
          onBlur={saveSkinReactions}
          placeholder="Опишите возможные реакции кожи..."
          style={{
            width: '100%',
            background: 'rgba(var(--surface-rgb),0.018)',
            border: '1px solid rgba(var(--gold-rgb),0.1)',
            borderRadius: 2,
            padding: '11px 13px',
            fontFamily: "'Inter', sans-serif",
            color: COLORS.textPrimary,
            outline: 'none',
            resize: 'none',
            height: 60,
            letterSpacing: '0.3px',
          }}
        />
      </div>
    </div>
  );
}

// ── Contacts (phone + chat links) ──
function ContactsSection({ client, onSave, first }: { client: Client; onSave: (client: Client) => void; first?: boolean }) {
  const [phone, setPhone] = useState(client.phone || '');
  const [editingPhone, setEditingPhone] = useState(false);

  // Re-sync local phone when switching to another client.
  useEffect(() => {
    setPhone(client.phone || '');
    setEditingPhone(false);
  }, [client.id]);

  const savePhone = () => {
    setEditingPhone(false);
    if (phone.trim() !== (client.phone || '')) onSave({ ...client, phone: phone.trim() });
  };

  const addLink = (platform: ChatPlatform, raw: string) => {
    const link: ChatLink = { id: Date.now().toString(), platform, url: buildChatLink(platform, raw) };
    onSave({ ...client, chatLinks: [...(client.chatLinks || []), link] });
  };
  const removeLink = (id: string) => onSave({ ...client, chatLinks: (client.chatLinks || []).filter((l) => l.id !== id) });

  return (
    <div style={{ marginTop: first ? 0 : 22 }}>
      {!first && <SectionDivider />}

      <div
        style={{
          fontFamily: "'Kelly Slab', 'Playfair Display', serif",
          fontSize: fs(11),
          color: COLORS.textGhost,
          letterSpacing: '3.5px',
          textTransform: 'uppercase',
          marginBottom: 12,
        }}
      >
        Контакты
      </div>

      {/* Phone row */}
      <div
        style={{
          background: 'rgba(var(--surface-rgb),0.018)',
          border: '1px solid rgba(var(--gold-rgb),0.1)',
          borderRadius: 2,
          padding: '11px 13px',
          display: 'flex',
          alignItems: 'center',
          gap: 11,
          marginBottom: 8,
        }}
      >
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
          <path
            d="M3 3.5C3 3 3.4 2.5 4 2.5H5.5C5.9 2.5 6.3 2.8 6.4 3.2L7 5.4C7.1 5.8 7 6.2 6.7 6.4L5.7 7.2C6.4 8.7 7.3 9.6 8.8 10.3L9.6 9.3C9.8 9 10.2 8.9 10.6 9L12.8 9.6C13.2 9.7 13.5 10.1 13.5 10.5V12C13.5 12.6 13 13 12.5 13C7.3 13 3 8.7 3 3.5Z"
            stroke="currentColor"
            strokeWidth="1.2"
            fill="currentColor" fillOpacity="0.06"
            strokeLinejoin="round"
          />
        </svg>
        {editingPhone ? (
          <input
            autoFocus
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onBlur={savePhone}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            placeholder="+7 999 123-45-67"
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontFamily: "'Inter', sans-serif",
              color: COLORS.textPrimary,
              letterSpacing: '0.3px',
            }}
          />
        ) : client.phone ? (
          <>
            <a
              href={`tel:${client.phone.replace(/[^\d+]/g, '')}`}
              style={{ flex: 1, fontSize: fs(15), color: COLORS.textPrimary, textDecoration: 'none', letterSpacing: '0.3px' }}
            >
              {client.phone}
            </a>
            <span
              onClick={() => setEditingPhone(true)}
              style={{ fontSize: fs(13), color: COLORS.textFaint, fontStyle: 'italic', cursor: 'pointer' }}
            >
              изменить
            </span>
          </>
        ) : (
          <span
            onClick={() => setEditingPhone(true)}
            style={{ flex: 1, fontSize: fs(15), color: COLORS.textGhost, fontStyle: 'italic', cursor: 'pointer' }}
          >
            Добавить телефон
          </span>
        )}
      </div>

      {/* Chat links */}
      {(client.chatLinks || []).map((link) => (
        <div
          key={link.id}
          style={{
            background: 'rgba(var(--surface-rgb),0.018)',
            border: '1px solid rgba(var(--gold-rgb),0.1)',
            borderRadius: 2,
            padding: '11px 13px',
            display: 'flex',
            alignItems: 'center',
            gap: 11,
            marginBottom: 8,
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: COLORS.gold,
              flexShrink: 0,
            }}
          />
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ flex: 1, minWidth: 0, textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: 1 }}
          >
            <span style={{ fontSize: fs(15), color: COLORS.gold, letterSpacing: '0.5px' }}>{PLATFORM_LABELS[link.platform]}</span>
            <span
              style={{
                fontSize: fs(13),
                color: COLORS.textFaint,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {link.url.replace(/^https?:\/\//, '')}
            </span>
          </a>
          <button
            onClick={() => removeLink(link.id)}
            style={{ background: 'none', border: 'none', color: COLORS.textFaint, cursor: 'pointer', flexShrink: 0, fontSize: fs(15) }}
          >
            ✕
          </button>
        </div>
      ))}

      <AddChatLinkForm onAdd={addLink} />
    </div>
  );
}

function AddChatLinkForm({ onAdd }: { onAdd: (platform: ChatPlatform, raw: string) => void }) {
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<ChatPlatform>('whatsapp');
  const [raw, setRaw] = useState('');

  if (!open) {
    return (
      <div
        className="inka-dashed"
        onClick={() => setOpen(true)}
        style={{
          marginTop: 4,
          border: '1px dashed rgba(var(--gold-rgb),0.18)',
          borderRadius: 2,
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          cursor: 'pointer',
        }}
      >
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
          <line x1="5.5" y1="1.5" x2="5.5" y2="9.5" stroke="currentColor" strokeOpacity="0.48" strokeWidth="1.2" strokeLinecap="round" />
          <line x1="1.5" y1="5.5" x2="9.5" y2="5.5" stroke="currentColor" strokeOpacity="0.48" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
        <span style={{ fontSize: fs(13), color: 'rgba(var(--gold-rgb),0.5)', letterSpacing: '1px', textTransform: 'uppercase', fontStyle: 'italic' }}>
          Добавить ссылку
        </span>
      </div>
    );
  }

  const selectStyle: React.CSSProperties = {
    width: '100%',
    background: COLORS.bg,
    border: '1px solid rgba(var(--gold-rgb),0.18)',
    borderRadius: 2,
    padding: '9px 12px',
    fontFamily: "'Inter', sans-serif",
    color: COLORS.textPrimary,
    outline: 'none',
    marginBottom: 8,
  };

  return (
    <div
      style={{
        marginTop: 4,
        border: '1px solid rgba(var(--gold-rgb),0.18)',
        borderRadius: 2,
        padding: 13,
        background: 'rgba(var(--surface-rgb),0.018)',
      }}
    >
      <select value={platform} onChange={(e) => setPlatform(e.target.value as ChatPlatform)} style={selectStyle}>
        {(Object.keys(PLATFORM_LABELS) as ChatPlatform[]).map((p) => (
          <option key={p} value={p} style={{ background: COLORS.bg }}>
            {PLATFORM_LABELS[p]}
          </option>
        ))}
      </select>
      <input
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        placeholder="Телефон, @ник или ссылка"
        style={{ ...INPUT_STYLE, marginBottom: 8 }}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <div
          onClick={() => {
            setOpen(false);
            setRaw('');
          }}
          style={{
            flex: 1,
            textAlign: 'center',
            padding: '9px',
            borderRadius: 2,
            border: '1px solid rgba(var(--gold-rgb),0.15)',
            color: COLORS.textFaint,
            fontSize: fs(13),
            letterSpacing: '1px',
            textTransform: 'uppercase',
            cursor: 'pointer',
          }}
        >
          Отмена
        </div>
        <div
          className="inka-submit"
          onClick={() => {
            if (!raw.trim()) return;
            onAdd(platform, raw);
            setRaw('');
            setOpen(false);
          }}
          style={{
            flex: 1,
            textAlign: 'center',
            padding: '9px',
            borderRadius: 2,
            border: '1px solid rgba(var(--gold-rgb),0.35)',
            background: 'rgba(var(--gold-rgb),0.05)',
            color: COLORS.gold,
            fontSize: fs(13),
            letterSpacing: '1px',
            textTransform: 'uppercase',
            cursor: 'pointer',
          }}
        >
          Добавить
        </div>
      </div>
    </div>
  );
}

// Free-form add-a-row form for the master's own card (Настройки → Карточка
// мастера): unlike the client's ChatLink form, there's no fixed platform
// enum here — a label ("Instagram", "СБП Тинькофф"...) plus a free value.
function AddMasterLinkForm({ onAdd }: { onAdd: (label: string, value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');

  if (!open) {
    return (
      <div
        className="inka-dashed"
        onClick={() => setOpen(true)}
        style={{
          marginTop: 4,
          border: '1px dashed rgba(var(--gold-rgb),0.18)',
          borderRadius: 2,
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          cursor: 'pointer',
        }}
      >
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
          <line x1="5.5" y1="1.5" x2="5.5" y2="9.5" stroke="currentColor" strokeOpacity="0.48" strokeWidth="1.2" strokeLinecap="round" />
          <line x1="1.5" y1="5.5" x2="9.5" y2="5.5" stroke="currentColor" strokeOpacity="0.48" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
        <span style={{ fontSize: fs(13), color: 'rgba(var(--gold-rgb),0.5)', letterSpacing: '1px', textTransform: 'uppercase', fontStyle: 'italic' }}>
          Добавить
        </span>
      </div>
    );
  }

  return (
    <div
      style={{
        marginTop: 4,
        border: '1px solid rgba(var(--gold-rgb),0.18)',
        borderRadius: 2,
        padding: 13,
        background: 'rgba(var(--surface-rgb),0.018)',
      }}
    >
      <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Название (Instagram, СБП...)" style={{ ...INPUT_STYLE, marginBottom: 8 }} />
      <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Ссылка, номер, реквизиты..." style={{ ...INPUT_STYLE, marginBottom: 8 }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <div
          onClick={() => {
            setOpen(false);
            setLabel('');
            setValue('');
          }}
          style={{
            flex: 1,
            textAlign: 'center',
            padding: '9px',
            borderRadius: 2,
            border: '1px solid rgba(var(--gold-rgb),0.15)',
            color: COLORS.textFaint,
            fontSize: fs(13),
            letterSpacing: '1px',
            textTransform: 'uppercase',
            cursor: 'pointer',
          }}
        >
          Отмена
        </div>
        <div
          className="inka-submit"
          onClick={() => {
            if (!label.trim() || !value.trim()) return;
            onAdd(label, value);
            setLabel('');
            setValue('');
            setOpen(false);
          }}
          style={{
            flex: 1,
            textAlign: 'center',
            padding: '9px',
            borderRadius: 2,
            border: '1px solid rgba(var(--gold-rgb),0.35)',
            background: 'rgba(var(--gold-rgb),0.05)',
            color: COLORS.gold,
            fontSize: fs(13),
            letterSpacing: '1px',
            textTransform: 'uppercase',
            cursor: 'pointer',
          }}
        >
          Добавить
        </div>
      </div>
    </div>
  );
}

// One "label: value" line inside a session card (краски / иглы / реакция кожи).
function SessionMeta({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 6, fontSize: fs(15), lineHeight: 1.4 }}>
      <span style={{ color: COLORS.textFaint, letterSpacing: '0.5px', textTransform: 'uppercase', flexShrink: 0, fontSize: fs(11), paddingTop: 2 }}>
        {label}
      </span>
      <span dir="auto" style={{ flex: 1, minWidth: 0, color: 'var(--text-soft)', fontStyle: 'italic', wordBreak: 'break-word' }}>
        {value}
      </span>
    </div>
  );
}

// Small ✕ on a session card; a tap reveals "Удалить? Да/Нет" inline.
function SessionDeleteControl({ onDelete }: { onDelete: () => void }) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: fs(12), color: '#A85A66', fontStyle: 'italic' }}>Удалить?</span>
        <span onClick={onDelete} style={{ fontSize: fs(12), color: '#C56676', textTransform: 'uppercase', letterSpacing: '0.5px', cursor: 'pointer' }}>
          Да
        </span>
        <span
          onClick={() => setConfirming(false)}
          style={{ fontSize: fs(12), color: COLORS.textFaint, textTransform: 'uppercase', letterSpacing: '0.5px', cursor: 'pointer' }}
        >
          Нет
        </span>
      </span>
    );
  }

  return (
    <span onClick={() => setConfirming(true)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }} aria-label="Удалить сессию">
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ color: COLORS.textFaint }}>
        <line x1="3" y1="3" x2="13" y2="13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <line x1="13" y1="3" x2="3" y2="13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    </span>
  );
}

// Photo gallery + upload for a session. On mobile the native file picker
// already offers "Take Photo", so there's no separate camera button. Deleting
// a photo takes two taps (✕ → confirm) so it can't happen by accident.
function SessionPhotos({
  photos,
  onChange,
  allowDelete = true,
  buttonFirst = false,
  topSlot,
}: {
  photos: string[];
  onChange: (photos: string[]) => void;
  allowDelete?: boolean;
  // Puts the "Добавить фото" trigger above the thumbnails instead of below,
  // with topSlot (e.g. a widget attached right under the button) rendered
  // in between — used by the consultation form, where the read-only skin
  // data sits attached under the button and the uploaded photos fill the
  // remaining space below.
  buttonFirst?: boolean;
  topSlot?: React.ReactNode;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmIndex, setConfirmIndex] = useState<number | null>(null);
  // Tap to enlarge — an in-app overlay, never a navigation/link (that's what
  // caused the white-screen PWA crash before).
  const [viewerSrc, setViewerSrc] = useState<string | null>(null);

  const onPick = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const readers = Array.from(files).map(
      (file) =>
        new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        }),
    );
    Promise.all(readers).then((urls) => onChange([...photos, ...urls]));
  };

  const remove = (i: number) => {
    onChange(photos.filter((_, idx) => idx !== i));
    setConfirmIndex(null);
  };

  const thumbnails = photos.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          {photos.map((src, i) => (
            <div key={i} style={{ position: 'relative', width: 78, height: 78 }}>
              <img
                src={src}
                alt=""
                onClick={() => setViewerSrc(src)}
                style={{
                  width: 78,
                  height: 78,
                  objectFit: 'cover',
                  borderRadius: 2,
                  border: '1px solid rgba(var(--gold-rgb),0.2)',
                  display: 'block',
                  cursor: 'pointer',
                }}
              />
              {allowDelete && (confirmIndex === i ? (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: 2,
                    background: 'rgba(0,0,0,0.72)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                >
                  <span style={{ fontSize: fs(11), color: '#EDE4CC', fontStyle: 'italic' }}>Удалить?</span>
                  <span style={{ display: 'flex', gap: 10 }}>
                    <span onClick={() => remove(i)} style={{ fontSize: fs(12), color: '#E08694', textTransform: 'uppercase', cursor: 'pointer' }}>
                      Да
                    </span>
                    <span onClick={() => setConfirmIndex(null)} style={{ fontSize: fs(12), color: '#CFC3AE', textTransform: 'uppercase', cursor: 'pointer' }}>
                      Нет
                    </span>
                  </span>
                </div>
              ) : (
                <div
                  onClick={() => setConfirmIndex(i)}
                  style={{
                    position: 'absolute',
                    bottom: 4,
                    right: 4,
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    background: 'rgba(0,0,0,0.55)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="none" style={{ color: '#EDE4CC' }}>
                    <line x1="3" y1="3" x2="13" y2="13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    <line x1="13" y1="3" x2="3" y2="13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </div>
              ))}
            </div>
          ))}
        </div>
      );

  const addButton = (
      <div
        className="inka-doc-secondary"
        onClick={() => fileRef.current?.click()}
        style={{
          border: '1px solid rgba(var(--gold-rgb),0.2)',
          borderRadius: 2,
          padding: '11px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 9,
          cursor: 'pointer',
          fontSize: fs(12),
          color: COLORS.gold,
          letterSpacing: '1px',
          textTransform: 'uppercase',
        }}
      >
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
          <path d="M8 10.5V2.5M8 2.5L5 5.5M8 2.5L11 5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M2.5 10V12.5C2.5 13 2.9 13.5 3.5 13.5H12.5C13 13.5 13.5 13 13.5 12.5V10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
        Добавить фото
      </div>
  );

  return (
    <div style={{ marginTop: 10 }}>
      {buttonFirst ? (
        <>
          <div style={{ marginBottom: thumbnails ? 10 : 0 }}>{addButton}</div>
          {topSlot}
          {thumbnails}
        </>
      ) : (
        <>
          {thumbnails}
          {addButton}
        </>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          onPick(e.target.files);
          e.target.value = '';
        }}
      />

      {/* Tap-to-enlarge viewer — plain in-app overlay, no <a>/navigation. */}
      {viewerSrc && (
        <div
          onClick={() => setViewerSrc(null)}
          role="button"
          aria-label="Закрыть фото"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 500,
            background: 'rgba(0,0,0,0.92)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            onClick={() => setViewerSrc(null)}
            role="button"
            aria-label="Закрыть"
            style={{
              position: 'absolute',
              top: 'calc(env(safe-area-inset-top) + 16px)',
              right: 20,
              fontSize: fs(22),
              color: '#EDE4CC',
              cursor: 'pointer',
            }}
          >
            ✕
          </div>
          <img
            src={viewerSrc}
            alt=""
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 3 }}
          />
        </div>
      )}
    </div>
  );
}

// ── Sessions tab ──
function SessionsTab({
  client,
  onEditSession,
  onDeleteSession,
  onUpdateSessionPhotos,
  onToggleSessionDone,
  onEditConsultation,
  onDeleteConsultation,
}: {
  client: Client;
  onEditSession: (session: Session) => void;
  onDeleteSession: (sessionId: string) => void;
  onUpdateSessionPhotos: (sessionId: string, photos: string[]) => void;
  onToggleSessionDone: (sessionId: string) => void;
  onEditConsultation: (consultation: Consultation) => void;
  onDeleteConsultation: (consultationId: string) => void;
}) {
  // Sessions and consultations share one dated timeline — most recent first,
  // undated entries sink to the bottom.
  type TimelineEntry = { kind: 'session'; session: Session } | { kind: 'consultation'; consultation: Consultation };
  const timeline: TimelineEntry[] = [
    ...client.sessions.map((session): TimelineEntry => ({ kind: 'session', session })),
    ...client.consultations.map((consultation): TimelineEntry => ({ kind: 'consultation', consultation })),
  ].sort((a, b) => {
    const dateA = a.kind === 'session' ? a.session.date : a.consultation.date;
    const dateB = b.kind === 'session' ? b.session.date : b.consultation.date;
    return (dateB || '').localeCompare(dateA || '');
  });

  return (
    <div style={{ animation: 'fadeSlideIn 0.3s ease' }}>
      {timeline.length === 0 && (
        <div style={{ fontSize: fs(15), color: COLORS.textGhost, fontStyle: 'italic', marginBottom: 14 }}>Сессий и консультаций пока нет.</div>
      )}

      {timeline.map((entry) => {
        if (entry.kind === 'consultation') {
          const consultation = entry.consultation;
          const meta = urgencyMeta(consultation.urgency);
          return (
            <div key={`c-${consultation.id}`} style={{ display: 'flex', gap: 14, marginBottom: 14 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: 8 }}>
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    flexShrink: 0,
                    marginTop: 4,
                    border: '1px solid rgba(var(--gold-rgb),0.5)',
                  }}
                />
                <div style={{ width: 1, flex: 1, background: 'rgba(var(--gold-rgb),0.08)', marginTop: 5 }} />
              </div>
              <div
                style={{
                  flex: 1,
                  background: 'rgba(var(--surface-rgb),0.018)',
                  border: '1px solid rgba(var(--gold-rgb),0.22)',
                  borderRadius: 2,
                  padding: '12px 14px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 7 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: fs(10), color: COLORS.gold, letterSpacing: '1.5px', textTransform: 'uppercase' }}>Консультация</div>
                    <div style={{ fontSize: fs(12), color: COLORS.textGhost, marginTop: 2, letterSpacing: '0.3px' }}>
                      {formatDate(consultation.date) || 'Дата не указана'}
                      {consultation.time && <span style={{ color: COLORS.gold }}> · {consultation.time}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 11, flexShrink: 0 }}>
                    <span style={{ fontSize: fs(13) }} title={meta.label}>{meta.emoji}</span>
                    <div
                      className="inka-back"
                      onClick={() => onEditConsultation(consultation)}
                      style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', opacity: 0.75 }}
                      title="Редактировать консультацию"
                    >
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ color: COLORS.gold }}>
                        <path d="M11 2.5L13.5 5L5.5 13H3V10.5L11 2.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <SessionDeleteControl onDelete={() => onDeleteConsultation(consultation.id)} />
                  </div>
                </div>
                {(consultation.area || consultation.style) && (
                  <div dir="auto" style={{ fontSize: fs(12), color: COLORS.textFaint, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 7 }}>
                    {[consultation.area, consultation.style].filter(Boolean).join(' · ')}
                  </div>
                )}
                {consultation.generalNotes && (
                  <div dir="auto" style={{ fontSize: fs(15), color: 'var(--text-soft2)', fontStyle: 'italic', lineHeight: 1.6 }}>
                    {consultation.generalNotes}
                  </div>
                )}
                {consultation.feeling && (
                  <div style={{ marginTop: 6 }}>
                    <SessionMeta label="Чувство / ощущение" value={consultation.feeling} />
                  </div>
                )}
                {consultation.inspirationSources && (
                  <div style={{ marginTop: 6 }}>
                    <SessionMeta label="Источники вдохновения" value={consultation.inspirationSources} />
                  </div>
                )}
                {consultation.creative && (
                  <div style={{ marginTop: 6 }}>
                    <SessionMeta label="Креатив" value={consultation.creative} />
                  </div>
                )}
                <SessionPhotos photos={consultation.photos} onChange={() => {}} allowDelete={false} />
              </div>
            </div>
          );
        }

        const session = entry.session;
        return (
          <div key={session.id} style={{ display: 'flex', gap: 14, marginBottom: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: 8 }}>
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  flexShrink: 0,
                  marginTop: 4,
                  background: session.done ? client.color : 'transparent',
                  border: session.done ? 'none' : '1px solid rgba(var(--gold-rgb),0.25)',
                }}
              />
              <div style={{ width: 1, flex: 1, background: 'rgba(var(--gold-rgb),0.08)', marginTop: 5 }} />
            </div>
            <div
              style={{
                flex: 1,
                background: 'rgba(var(--surface-rgb),0.018)',
                border: '1px solid rgba(var(--gold-rgb),0.1)',
                borderRadius: 2,
                padding: '12px 14px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 7 }}>
                <div style={{ minWidth: 0 }}>
                  <div dir="auto" style={{ fontSize: fs(13), color: COLORS.textGhost, fontStyle: 'italic', letterSpacing: '0.3px' }}>
                    {session.name || formatDate(session.date) || 'Сессия'}
                  </div>
                  {session.name && formatDate(session.date) && (
                    <div style={{ fontSize: fs(12), color: COLORS.textGhost, marginTop: 2, letterSpacing: '0.3px' }}>{formatDate(session.date)}</div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 11, flexShrink: 0 }}>
                  {!session.done && (
                    <span
                      onClick={() => onToggleSessionDone(session.id)}
                      title="Отметить выполненной"
                      style={{
                        fontSize: fs(10),
                        color: COLORS.gold,
                        border: '1px solid rgba(var(--gold-rgb),0.4)',
                        borderRadius: 2,
                        padding: '2px 6px',
                        letterSpacing: '0.8px',
                        textTransform: 'uppercase',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Запланирована
                    </span>
                  )}
                  {session.duration && <span style={{ fontSize: fs(13), color: COLORS.textGhost, fontStyle: 'italic' }}>{session.duration}</span>}
                  <div
                    className="inka-back"
                    onClick={() => onEditSession(session)}
                    style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', opacity: 0.75 }}
                    title="Редактировать сессию"
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ color: COLORS.gold }}>
                      <path d="M11 2.5L13.5 5L5.5 13H3V10.5L11 2.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <SessionDeleteControl onDelete={() => onDeleteSession(session.id)} />
                </div>
              </div>
              {session.area && (
                <div dir="auto" style={{ fontSize: fs(12), color: COLORS.textFaint, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 7 }}>
                  {session.area}
                </div>
              )}
              {session.note && <div dir="auto" style={{ fontSize: fs(15), color: 'var(--text-soft2)', fontStyle: 'italic', lineHeight: 1.6 }}>{session.note}</div>}
              {(session.colors || session.needles || session.skinReaction) && (
                <div
                  style={{
                    marginTop: 9,
                    paddingTop: 9,
                    borderTop: '1px solid rgba(var(--gold-rgb),0.08)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  {session.colors && <SessionMeta label="Краски" value={session.colors} />}
                  {session.needles && <SessionMeta label="Иглы" value={session.needles} />}
                  {session.skinReaction && <SessionMeta label="Реакция кожи" value={session.skinReaction} />}
                </div>
              )}
              <SessionPhotos
                photos={session.photos}
                onChange={(photos) => onUpdateSessionPhotos(session.id, photos)}
                allowDelete={false}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Urgency picker (single-select chips, emoji + label) ──
function UrgencyChips({ value, onPick }: { value: UrgencyKey; onPick: (u: UrgencyKey) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {URGENCY.map((u) => {
        const on = value === u.key;
        return (
          <div
            key={u.key}
            onClick={() => onPick(u.key)}
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: fs(12),
              padding: '5px 9px',
              borderRadius: 2,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              border: on ? '1px solid rgba(var(--gold-rgb),0.65)' : '1px solid rgba(var(--gold-rgb),0.15)',
              color: on ? COLORS.gold : COLORS.textFaint,
              background: on ? 'rgba(var(--gold-rgb),0.08)' : 'transparent',
              letterSpacing: '0.4px',
              whiteSpace: 'nowrap',
              transition: 'all 0.2s',
            }}
          >
            <span style={{ fontSize: fs(12) }}>{u.emoji}</span>
            {u.label}
          </div>
        );
      })}
    </div>
  );
}

// A single note row. In the client tab it shows text + urgency; in «Сводка» a
// client label (colour dot + name in plain type) is prepended.
function NoteItem({
  note,
  onToggleDone,
  onDelete,
  onUpdatePhotos,
  onEdit,
  client,
}: {
  note: ClientNote;
  onToggleDone: () => void;
  onDelete?: () => void;
  onUpdatePhotos?: (photos: string[]) => void;
  onEdit?: (text: string, urgency: UrgencyKey) => void;
  client?: Client;
}) {
  const meta = urgencyMeta(note.urgency);
  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState(note.text);
  const [draftUrgency, setDraftUrgency] = useState<UrgencyKey>(note.urgency);

  const startEdit = () => {
    setDraftText(note.text);
    setDraftUrgency(note.urgency);
    setEditing(true);
  };
  const saveEdit = () => {
    const trimmed = draftText.trim();
    if (trimmed && onEdit) onEdit(trimmed, draftUrgency);
    setEditing(false);
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        border: '1px solid rgba(var(--gold-rgb),0.12)',
        borderRadius: 2,
        padding: '10px 12px',
        background: 'rgba(var(--surface-rgb),0.018)',
        opacity: note.done ? 0.45 : 1,
        transition: 'opacity 0.3s',
      }}
    >
      {/* Status marker — decorative only; done/undone is now driven by the
          explicit «Выполнено» button below, not by tapping this glyph. */}
      <span style={{ fontSize: fs(16), lineHeight: 1.2, flexShrink: 0 }}>{note.done ? DONE_EMOJI : meta.emoji}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        {client && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: client.color, flexShrink: 0 }} />
            <span dir="auto" style={{ fontSize: fs(12), color: 'var(--text-strong)', letterSpacing: '0.3px' }}>
              {[client.name, client.surname].filter(Boolean).join(' ')}
            </span>
          </div>
        )}
        {editing ? (
          <div onClick={(e) => e.stopPropagation()}>
            <textarea
              dir="auto"
              autoFocus
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              style={{
                width: '100%',
                background: 'rgba(var(--surface-rgb),0.03)',
                border: '1px solid rgba(var(--gold-rgb),0.3)',
                borderRadius: 2,
                padding: '9px 11px',
                fontFamily: "'Inter', sans-serif",
                color: COLORS.textPrimary,
                outline: 'none',
                resize: 'none',
                height: 64,
                fontStyle: 'italic',
                lineHeight: 1.5,
              }}
            />
            <div style={{ marginTop: 8 }}>
              <UrgencyChips value={draftUrgency} onPick={setDraftUrgency} />
            </div>
          </div>
        ) : (
          <div
            dir="auto"
            style={{
              fontSize: fs(15),
              color: note.done ? COLORS.textGhost : 'var(--text-soft)',
              fontStyle: 'italic',
              lineHeight: 1.5,
              textDecoration: note.done ? 'line-through' : 'none',
              wordBreak: 'break-word',
            }}
          >
            {note.text}
          </div>
        )}
        {!client && !editing && (
          <div style={{ fontSize: fs(10), color: COLORS.textGhost, letterSpacing: '1px', textTransform: 'uppercase', marginTop: 4 }}>
            {meta.emoji} {meta.label}
          </div>
        )}
        {onUpdatePhotos && !editing && <SessionPhotos photos={note.photos} onChange={onUpdatePhotos} allowDelete />}

        {/* Explicit actions — a labelled «Выполнено» button (toggles, no
            confirm needed), an «Изменить» button that switches the text
            above into an editable field, plus (where deletion is allowed) a
            labelled delete button with its own confirm step. No bare ✕ icon. */}
        <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          {editing ? (
            <>
              <div
                onClick={saveEdit}
                style={{
                  flex: 1,
                  padding: '7px 12px',
                  textAlign: 'center',
                  border: '1px solid rgba(var(--gold-rgb),0.3)',
                  borderRadius: 2,
                  cursor: 'pointer',
                  color: COLORS.gold,
                  fontSize: fs(11),
                  letterSpacing: '1px',
                  textTransform: 'uppercase',
                  fontStyle: 'italic',
                }}
              >
                Сохранить
              </div>
              <div
                onClick={() => setEditing(false)}
                style={{
                  flex: 1,
                  padding: '7px 12px',
                  textAlign: 'center',
                  border: '1px solid rgba(var(--gold-rgb),0.15)',
                  borderRadius: 2,
                  cursor: 'pointer',
                  color: COLORS.textFaint,
                  fontSize: fs(11),
                  letterSpacing: '1px',
                  textTransform: 'uppercase',
                  fontStyle: 'italic',
                }}
              >
                Отмена
              </div>
            </>
          ) : (
            <>
              <div
                onClick={onToggleDone}
                style={{
                  flex: 1,
                  padding: '7px 12px',
                  textAlign: 'center',
                  border: '1px solid rgba(var(--gold-rgb),0.3)',
                  borderRadius: 2,
                  cursor: 'pointer',
                  color: COLORS.gold,
                  fontSize: fs(11),
                  letterSpacing: '1px',
                  textTransform: 'uppercase',
                  fontStyle: 'italic',
                }}
              >
                {note.done ? 'Вернуть в работу' : 'Выполнено'}
              </div>
              {onEdit && (
                <div
                  onClick={startEdit}
                  style={{
                    flex: 1,
                    padding: '7px 12px',
                    textAlign: 'center',
                    border: '1px solid rgba(var(--gold-rgb),0.3)',
                    borderRadius: 2,
                    cursor: 'pointer',
                    color: COLORS.gold,
                    fontSize: fs(11),
                    letterSpacing: '1px',
                    textTransform: 'uppercase',
                    fontStyle: 'italic',
                  }}
                >
                  Изменить
                </div>
              )}
              {onDelete && (
                <div style={{ flex: 1 }}>
                  <DeleteButton label="Удалить заметку" confirmLabel="Удалить заметку?" onConfirm={onDelete} compact />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Compose a new note: text + urgency marker + any photos, all attached before
// the note is saved (photos live on the note from the moment it's created).
function NoteComposer({ onAdd }: { onAdd: (text: string, urgency: UrgencyKey, photos: string[]) => void }) {
  const [text, setText] = useState('');
  const [urgency, setUrgency] = useState<UrgencyKey>('important');
  const [photos, setPhotos] = useState<string[]>([]);
  const submit = () => {
    const t = text.trim();
    if (!t) return;
    onAdd(t, urgency, photos);
    setText('');
    setUrgency('important');
    setPhotos([]);
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <textarea
        dir="auto"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Новая заметка или задача..."
        style={{
          width: '100%',
          background: 'rgba(var(--surface-rgb),0.018)',
          border: '1px solid rgba(var(--gold-rgb),0.1)',
          borderRadius: 2,
          padding: '11px 13px',
          fontFamily: "'Inter', sans-serif",
          color: COLORS.textPrimary,
          outline: 'none',
          resize: 'none',
          height: 64,
          fontStyle: 'italic',
          lineHeight: 1.5,
          letterSpacing: '0.3px',
        }}
      />
      <UrgencyChips value={urgency} onPick={setUrgency} />
      {/* Attach photos to the note up front — button first so it reads as an
          action even before any thumbnails exist. */}
      <SessionPhotos photos={photos} onChange={setPhotos} allowDelete buttonFirst />
      <div
        className="inka-submit"
        onClick={submit}
        style={{
          border: '1px solid rgba(var(--gold-rgb),0.35)',
          borderRadius: 2,
          padding: '10px 0',
          textAlign: 'center',
          cursor: text.trim() ? 'pointer' : 'not-allowed',
          background: 'rgba(var(--gold-rgb),0.05)',
          opacity: text.trim() ? 1 : 0.4,
          fontSize: fs(13),
          color: COLORS.gold,
          letterSpacing: '1.5px',
          textTransform: 'uppercase',
        }}
      >
        Добавить заметку
      </div>
    </div>
  );
}

// ── «Заметки и задачи» tab — notes (with urgency + done, own photos),
//     sorted by urgency. Attachments live on the Инфо tab. ──
function AdditionalTab({
  client,
  onUpsertNote,
  onAddNote,
  onDeleteNote,
}: {
  client: Client;
  onUpsertNote: (note: ClientNote) => void;
  onAddNote: (text: string, urgency: UrgencyKey, photos: string[]) => void;
  onDeleteNote: (noteId: string) => void;
}) {
  const toggleDone = (n: ClientNote) => onUpsertNote({ ...n, done: !n.done });

  // Sorted by urgency (most urgent first); done notes sink to the bottom.
  const sortedNotes = [...client.notes].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    const r = urgencyRank(a.urgency) - urgencyRank(b.urgency);
    return r !== 0 ? r : b.createdDate.localeCompare(a.createdDate);
  });

  return (
    <div style={{ animation: 'fadeSlideIn 0.3s ease', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Notes */}
      <SectionHeader>Заметки</SectionHeader>
      {sortedNotes.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sortedNotes.map((n) => (
            <NoteItem
              key={n.id}
              note={n}
              onToggleDone={() => toggleDone(n)}
              onDelete={() => onDeleteNote(n.id)}
              onUpdatePhotos={(photos) => onUpsertNote({ ...n, photos })}
              onEdit={(text, urgency) => onUpsertNote({ ...n, text, urgency })}
            />
          ))}
        </div>
      )}
      <NoteComposer onAdd={onAddNote} />
    </div>
  );
}

// ── Attachments (documents / photos / any file) — lives on the Инфо tab. ──
function AttachmentsSection({
  client,
  onAddDocument,
  onRemoveDocument,
}: {
  client: Client;
  onAddDocument: (doc: ClientDocument) => void;
  onRemoveDocument: (docId: string) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      onAddDocument({
        id: Date.now().toString(),
        name: file.name,
        fileUrl: reader.result as string,
        kind: file.type.startsWith('image/') ? 'photo' : 'document',
        uploadedDate: new Date().toLocaleDateString('ru-RU'),
      });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <SectionDivider />
      <SectionHeader>Вложения</SectionHeader>
      {client.documents.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {client.documents.map((doc) => (
            <div
              key={doc.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                border: '1px solid rgba(var(--gold-rgb),0.12)',
                borderRadius: 2,
                padding: '11px 14px',
                background: 'rgba(var(--surface-rgb),0.018)',
              }}
            >
              <span style={{ fontSize: fs(13), color: COLORS.gold }}>{doc.kind === 'photo' ? '◈' : '▤'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: fs(15), color: COLORS.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {doc.name}
                </div>
                <div style={{ fontSize: fs(11), color: COLORS.textGhost, letterSpacing: '0.4px', marginTop: 2 }}>{doc.uploadedDate}</div>
              </div>
              <button
                onClick={() => onRemoveDocument(doc.id)}
                style={{ background: 'none', border: 'none', color: COLORS.textFaint, cursor: 'pointer', flexShrink: 0, fontSize: fs(15) }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Single attach button (document / photo / any file), like in a session. */}
      <div
        className="inka-doc-primary"
        onClick={() => fileInput.current?.click()}
        style={{
          border: '1px solid rgba(var(--gold-rgb),0.32)',
          borderRadius: 2,
          padding: '13px 18px',
          cursor: 'pointer',
          background: 'rgba(var(--gold-rgb),0.05)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
        }}
      >
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
          <path d="M8 10.5V2.5M8 2.5L5 5.5M8 2.5L11 5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M2.5 10V12.5C2.5 13 2.9 13.5 3.5 13.5H12.5C13 13.5 13.5 13 13.5 12.5V10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
        <span style={{ fontSize: fs(15), color: COLORS.gold, letterSpacing: '1px', textTransform: 'uppercase' }}>Прикрепить файл</span>
      </div>

      <input
        ref={fileInput}
        type="file"
        style={{ display: 'none' }}
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
}

// ===================== BOTTOM SHEET SHELL =====================
function BottomSheet({
  open,
  heightPct,
  children,
}: {
  open: boolean;
  heightPct: number;
  children: React.ReactNode;
}) {
  // Same sheet DOM node is reused across opens (e.g. add-session then
  // edit-session), so its scroll position otherwise carries over — reset to
  // top each time it opens.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) scrollRef.current?.scrollTo(0, 0);
  }, [open]);

  return (
    <div
      ref={scrollRef}
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: `${heightPct}%`,
        background: COLORS.sheet,
        borderRadius: '20px 20px 0 0',
        border: '1px solid rgba(var(--gold-rgb),0.18)',
        borderBottom: 'none',
        zIndex: 15,
        overflowY: 'auto',
        transform: open ? 'translateY(0)' : 'translateY(105%)',
        transition: 'transform 0.42s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
      }}
    >
      <div style={{ width: 36, height: 3, background: 'rgba(var(--gold-rgb),0.2)', borderRadius: 2, margin: '14px auto 0' }} />
      {children}
    </div>
  );
}

function SheetCloseButton({ onClose }: { onClose: () => void }) {
  return (
    <div className="inka-close" onClick={onClose} style={{ position: 'absolute', top: 18, right: 24, cursor: 'pointer', opacity: 0.4 }}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <line x1="3" y1="3" x2="13" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="13" y1="3" x2="3" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </div>
  );
}

// ===================== NEW CLIENT SHEET =====================
function NewClientSheet({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (data: {
    name: string;
    surname: string;
    phone: string;
    styles: string[];
    color: string;
    clientType: ClientType;
    skinType: string;
    skinTone: string;
    skinNotes: string;
    note: string;
  }) => void;
}) {
  const [name, setName] = useState('');
  const [surname, setSurname] = useState('');
  const [phone, setPhone] = useState('');
  const [styles, setStyles] = useState<string[]>([]);
  const [color, setColor] = useState(MARKER_COLORS[0]);
  const [clientType, setClientType] = useState<ClientType>('client');
  const [skinType, setSkinType] = useState('');
  const [skinTone, setSkinTone] = useState('');
  const [skinNotes, setSkinNotes] = useState('');
  const [note, setNote] = useState('');

  // Reset fields whenever the sheet is closed.
  useEffect(() => {
    if (!open) {
      setName('');
      setSurname('');
      setPhone('');
      setStyles([]);
      setColor(MARKER_COLORS[0]);
      setClientType('client');
      setSkinType('');
      setSkinTone('');
      setSkinNotes('');
      setNote('');
    }
  }, [open]);

  const toggleStyle = (s: string) => setStyles((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  const canSubmit = name.trim().length > 0;

  return (
    <BottomSheet open={open} heightPct={88}>
      <div style={{ padding: '16px 24px 14px', position: 'relative' }}>
        <SheetCloseButton onClose={onClose} />
        <div style={{ marginBottom: 5 }}>
          <InkaLogo height={fs(15)} />
        </div>
        <div style={{ fontSize: fs(22), color: COLORS.textPrimary, fontWeight: 300, letterSpacing: '1px' }}>Новый клиент</div>
        <SheetStarDivider />
      </div>

      <div style={{ padding: '4px 24px 50px' }}>
        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Имя *</FieldLabel>
          {/* dir="auto": Hebrew/Arabic names flow right-to-left automatically,
              Latin/Cyrillic stay left-to-right. */}
          <input dir="auto" value={name} onChange={(e) => setName(e.target.value)} placeholder="Александра" style={INPUT_STYLE} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Фамилия</FieldLabel>
          <input dir="auto" value={surname} onChange={(e) => setSurname(e.target.value)} placeholder="Вертинская" style={INPUT_STYLE} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Телефон</FieldLabel>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+7 999 123-45-67"
            style={INPUT_STYLE}
          />
        </div>
        <div style={{ marginBottom: 18 }}>
          <FieldLabel>Цвет-маркер</FieldLabel>
          <MarkerColorPalette value={color} onPick={setColor} />
        </div>
        <div style={{ marginBottom: 18 }}>
          <FieldLabel>Тип</FieldLabel>
          <ClientTypeToggle value={clientType} onChange={setClientType} />
        </div>
        <div style={{ marginBottom: 18 }}>
          <FieldLabel>Стиль</FieldLabel>
          <StyleChips selected={styles} onToggle={toggleStyle} />
        </div>
        <div style={{ marginBottom: 18 }}>
          <FieldLabel>Тон кожи</FieldLabel>
          <SkinTonePalette value={skinTone} onPick={(t) => setSkinTone(t === skinTone ? '' : t)} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Тип кожи</FieldLabel>
          <select value={skinType} onChange={(e) => setSkinType(e.target.value)} style={{ ...INPUT_STYLE, appearance: 'none' }}>
            {SKIN_TYPES.map((s) => (
              <option key={s.value} value={s.value} style={{ background: COLORS.bg }}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Заметки о коже</FieldLabel>
          <textarea
            dir="auto"
            value={skinNotes}
            onChange={(e) => setSkinNotes(e.target.value)}
            placeholder="Аллергии, чувствительные зоны, реакции..."
            style={{ ...INPUT_STYLE, resize: 'none', height: 70 }}
          />
        </div>
        <div style={{ marginBottom: 22 }}>
          <FieldLabel>Заметки о клиенте</FieldLabel>
          <textarea
            dir="auto"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Идеи, пожелания, особенности..."
            style={{ ...INPUT_STYLE, resize: 'none', height: 100 }}
          />
        </div>
        <div
          className="inka-submit"
          onClick={() => canSubmit && onCreate({ name, surname, phone, styles, color, clientType, skinType, skinTone, skinNotes, note })}
          style={{ ...SUBMIT_STYLE, opacity: canSubmit ? 1 : 0.4, cursor: canSubmit ? 'pointer' : 'default' }}
        >
          <span style={{ fontFamily: "'Kelly Slab', 'Playfair Display', serif", fontSize: fs(13), color: COLORS.gold, letterSpacing: '2px' }}>
            Создать клиента
          </span>
        </div>
      </div>
    </BottomSheet>
  );
}

// ===================== EDIT CLIENT SHEET =====================
function EditClientSheet({
  open,
  client,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  client: Client | null;
  onClose: () => void;
  onSave: (data: { name: string; surname: string; styles: string[]; color: string; clientType: ClientType; note: string }) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState('');
  const [surname, setSurname] = useState('');
  const [styles, setStyles] = useState<string[]>([]);
  const [color, setColor] = useState(MARKER_COLORS[0]);
  const [clientType, setClientType] = useState<ClientType>('client');
  const [note, setNote] = useState('');

  // Populate fields from the client each time the sheet opens.
  useEffect(() => {
    if (open && client) {
      setName(client.name);
      setSurname(client.surname);
      setStyles(clientStyles(client));
      setColor(client.color || MARKER_COLORS[0]);
      setClientType(client.clientType || 'client');
      setNote(client.note);
    }
  }, [open, client?.id]);

  const canSubmit = name.trim().length > 0;
  const toggleStyle = (s: string) => setStyles((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  return (
    <BottomSheet open={open} heightPct={84}>
      <div style={{ padding: '16px 24px 14px', position: 'relative' }}>
        <SheetCloseButton onClose={onClose} />
        <div style={{ marginBottom: 5 }}>
          <InkaLogo height={fs(15)} />
        </div>
        <div style={{ fontSize: fs(22), color: COLORS.textPrimary, fontWeight: 300, letterSpacing: '1px' }}>Редактировать</div>
        <SheetStarDivider />
      </div>

      <div style={{ padding: '4px 24px 50px' }}>
        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Имя *</FieldLabel>
          <input dir="auto" value={name} onChange={(e) => setName(e.target.value)} placeholder="Александра" style={INPUT_STYLE} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Фамилия</FieldLabel>
          <input dir="auto" value={surname} onChange={(e) => setSurname(e.target.value)} placeholder="Вертинская" style={INPUT_STYLE} />
        </div>
        <div style={{ marginBottom: 18 }}>
          <FieldLabel>Цвет-маркер</FieldLabel>
          <MarkerColorPalette value={color} onPick={setColor} />
        </div>
        <div style={{ marginBottom: 18 }}>
          <FieldLabel>Тип</FieldLabel>
          <ClientTypeToggle value={clientType} onChange={setClientType} />
        </div>
        <div style={{ marginBottom: 18 }}>
          <FieldLabel>Стиль</FieldLabel>
          <StyleChips selected={styles} onToggle={toggleStyle} />
        </div>
        <div style={{ marginBottom: 22 }}>
          <FieldLabel>Заметки о клиенте</FieldLabel>
          <textarea
            dir="auto"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Идеи, пожелания, особенности..."
            style={{ ...INPUT_STYLE, resize: 'none', height: 100 }}
          />
        </div>
        <div
          className="inka-submit"
          onClick={() => canSubmit && onSave({ name, surname, styles, color, clientType, note })}
          style={{ ...SUBMIT_STYLE, opacity: canSubmit ? 1 : 0.4, cursor: canSubmit ? 'pointer' : 'default' }}
        >
          <span style={{ fontFamily: "'Kelly Slab', 'Playfair Display', serif", fontSize: fs(13), color: COLORS.gold, letterSpacing: '2px' }}>
            Сохранить
          </span>
        </div>

        {/* Danger zone: delete client — always last */}
        <div style={{ marginTop: 32 }}>
          <div style={{ fontSize: fs(10), color: '#A85A66', letterSpacing: '2px', textTransform: 'uppercase', textAlign: 'center', marginBottom: 8, opacity: 0.7 }}>
            Danger
          </div>
          <DeleteButton label="Удалить клиента" confirmLabel="Удалить клиента безвозвратно?" onConfirm={onDelete} />
        </div>
      </div>
    </BottomSheet>
  );
}

// ===================== NEW SESSION SHEET =====================
function NewSessionSheet({
  open,
  clientName,
  initial,
  onClose,
  onAdd,
}: {
  open: boolean;
  clientName: string;
  initial?: Session | null;
  onClose: () => void;
  onAdd: (data: {
    name: string;
    date: string;
    time: string;
    duration: string;
    style: string;
    area: string;
    colors: string;
    needles: string;
    skinReaction: string;
    note: string;
    photos: string[];
    done: boolean;
  }) => void;
}) {
  const isEdit = !!initial;
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [duration, setDuration] = useState('');
  const [style, setStyle] = useState('');
  const [stylesExpanded, setStylesExpanded] = useState(false);
  const [area, setArea] = useState('');
  const [colors, setColors] = useState('');
  const [needles, setNeedles] = useState('');
  const [skinReaction, setSkinReaction] = useState('');
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  // New sessions default to «Выполнена»; editing reflects the session's status.
  const [done, setDone] = useState(true);

  useEffect(() => {
    if (open) {
      // Prefill from the session being edited, or start blank for a new one.
      setName(initial?.name ?? '');
      setDate(initial?.date ?? '');
      setTime(initial?.time ?? '');
      setDuration(initial?.duration ?? '');
      setStyle(initial?.style ?? '');
      setArea(initial?.area ?? '');
      setColors(initial?.colors ?? '');
      setNeedles(initial?.needles ?? '');
      setSkinReaction(initial?.skinReaction ?? '');
      setNote(initial?.note ?? '');
      setPhotos(initial?.photos ?? []);
      setDone(initial ? initial.done : true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const chipStyle = (selected: boolean, big: boolean): React.CSSProperties => ({
    fontFamily: "'Inter', sans-serif",
    fontSize: big ? 13 : 12,
    padding: big ? '7px 13px' : '6px 11px',
    borderRadius: 2,
    cursor: 'pointer',
    border: selected ? '1px solid rgba(var(--gold-rgb),0.65)' : '1px solid rgba(var(--gold-rgb),0.15)',
    color: selected ? COLORS.gold : COLORS.textFaint,
    background: selected ? 'rgba(var(--gold-rgb),0.08)' : 'transparent',
    letterSpacing: big ? undefined : '0.8px',
    textTransform: big ? undefined : 'uppercase',
    whiteSpace: 'nowrap',
    transition: 'all 0.2s',
  });

  return (
    <BottomSheet open={open} heightPct={80}>
      <div style={{ padding: '16px 24px 14px', position: 'relative' }}>
        <SheetCloseButton onClose={onClose} />
        <div style={{ fontSize: fs(15), color: COLORS.textMuted, fontStyle: 'italic', marginBottom: 3, letterSpacing: '0.3px' }}>{clientName}</div>
        <div style={{ fontSize: fs(22), color: COLORS.textPrimary, fontWeight: 300, letterSpacing: '1px' }}>
          {isEdit ? 'Редактировать сессию' : 'Новая сессия'}
        </div>
        <SheetStarDivider />
      </div>

      <div style={{ padding: '4px 24px 50px' }}>
        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Название сессии</FieldLabel>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Первая, контур..." style={INPUT_STYLE} />
        </div>

        <div style={{ marginBottom: 16, display: 'flex', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <FieldLabel>Дата</FieldLabel>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...INPUT_STYLE, maxWidth: '100%', padding: '10px 8px' }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <FieldLabel>Время</FieldLabel>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={{ ...INPUT_STYLE, maxWidth: '100%', padding: '10px 8px' }} />
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Статус</FieldLabel>
          <div style={{ display: 'flex', gap: 6 }}>
            <div onClick={() => setDone(true)} style={{ ...chipStyle(done, true), flex: 1, textAlign: 'center' }}>
              Выполнена
            </div>
            <div onClick={() => setDone(false)} style={{ ...chipStyle(!done, true), flex: 1, textAlign: 'center' }}>
              Запланирована
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Продолжительность</FieldLabel>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {DURATIONS.map((d) => (
              <div key={d} onClick={() => setDuration(d)} style={chipStyle(duration === d, true)}>
                {d}
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Стиль работы</FieldLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            {(stylesExpanded
              ? STYLES
              : STYLES.slice(0, STYLES_PINNED_COUNT).concat(
                  style && STYLES.indexOf(style) >= STYLES_PINNED_COUNT ? [style] : [],
                )
            ).map((s) => (
              <div key={s} onClick={() => setStyle(s)} style={chipStyle(style === s, false)}>
                {s}
              </div>
            ))}
            {!stylesExpanded && (
              <div
                onClick={() => setStylesExpanded(true)}
                style={{ fontSize: fs(12), padding: '6px 11px', color: COLORS.textGhost, fontStyle: 'italic', cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                Ещё стили ▾
              </div>
            )}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Зона работы</FieldLabel>
          <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Левое плечо, рёбра..." style={INPUT_STYLE} />
        </div>

        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Краски / чернила</FieldLabel>
          <input value={colors} onChange={(e) => setColors(e.target.value)} placeholder="Чёрный, серые тона..." style={INPUT_STYLE} />
        </div>

        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Иглы</FieldLabel>
          <input value={needles} onChange={(e) => setNeedles(e.target.value)} placeholder="Конфигурация игл..." style={INPUT_STYLE} />
        </div>

        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Реакция кожи</FieldLabel>
          <input
            value={skinReaction}
            onChange={(e) => setSkinReaction(e.target.value)}
            placeholder="Покраснение, отёк, спокойно..."
            style={INPUT_STYLE}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Заметки</FieldLabel>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Что делали, наблюдения..."
            style={{ ...INPUT_STYLE, resize: 'none', height: 80 }}
          />
        </div>

        {/* Photos: upload (native picker offers "Take Photo" on mobile) */}
        <div style={{ marginBottom: 22 }}>
          <FieldLabel>Фото</FieldLabel>
          <SessionPhotos photos={photos} onChange={setPhotos} />
        </div>

        <div
          className="inka-submit"
          onClick={() => onAdd({ name, date, time, duration, style, area, colors, needles, skinReaction, note, photos, done })}
          style={SUBMIT_STYLE}
        >
          <span style={{ fontFamily: "'Kelly Slab', 'Playfair Display', serif", fontSize: fs(13), color: COLORS.gold, letterSpacing: '2px' }}>
            {isEdit ? 'Сохранить' : 'Добавить сессию'}
          </span>
        </div>
      </div>
    </BottomSheet>
  );
}

// Tapping "+" on the sessions tab asks which kind of entry to create first —
// a regular tattoo session, or a consultation (mood board + creative brief,
// scheduled the same way a session is).
function AddChoiceSheet({
  open,
  onClose,
  onPickSession,
  onPickConsultation,
}: {
  open: boolean;
  onClose: () => void;
  onPickSession: () => void;
  onPickConsultation: () => void;
}) {
  const choice = (title: string, desc: string, onClick: () => void, icon: React.ReactNode) => (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        border: '1px solid rgba(var(--gold-rgb),0.25)',
        borderRadius: 2,
        padding: '16px',
        cursor: 'pointer',
        background: 'rgba(var(--gold-rgb),0.03)',
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          border: '1px solid rgba(var(--gold-rgb),0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          color: 'var(--gold)',
        }}
      >
        {icon}
      </div>
      <div>
        <div style={{ fontSize: fs(16), color: COLORS.textPrimary }}>{title}</div>
        <div style={{ fontSize: fs(12), color: COLORS.textGhost, fontStyle: 'italic', marginTop: 2 }}>{desc}</div>
      </div>
    </div>
  );

  return (
    <BottomSheet open={open} heightPct={34}>
      <div style={{ padding: '16px 24px 14px', position: 'relative' }}>
        <SheetCloseButton onClose={onClose} />
        <div style={{ fontSize: fs(22), color: COLORS.textPrimary, fontWeight: 300, letterSpacing: '1px' }}>Что добавить?</div>
        <SheetStarDivider />
      </div>
      <div style={{ padding: '4px 24px 40px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {choice(
          'Сессия',
          'Дата, техника, стиль, зона работы...',
          onPickSession,
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
            <rect x="3" y="4.5" width="14" height="12" rx="1" stroke="currentColor" strokeWidth="1.2" />
            <line x1="3" y1="8" x2="17" y2="8" stroke="currentColor" strokeWidth="1.2" />
            <line x1="6.5" y1="2.5" x2="6.5" y2="5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            <line x1="13.5" y1="2.5" x2="13.5" y2="5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>,
        )}
        {choice(
          'Консультация',
          'Референсы, идея, данные о коже...',
          onPickConsultation,
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
            <rect x="3" y="4" width="14" height="12" rx="1" stroke="currentColor" strokeWidth="1.2" />
            <circle cx="7" cy="8" r="1.3" stroke="currentColor" strokeWidth="1.1" />
            <path d="M3 14L8 10L11 12.5L14 9.5L17 13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>,
        )}
      </div>
    </BottomSheet>
  );
}

function NewConsultationSheet({
  open,
  clientName,
  client,
  initial,
  onClose,
  onAdd,
}: {
  open: boolean;
  clientName: string;
  client: Client | null;
  initial?: Consultation | null;
  onClose: () => void;
  onAdd: (data: {
    date: string;
    time: string;
    area: string;
    style: string;
    generalNotes: string;
    feeling: string;
    creative: string;
    inspirationSources: string;
    urgency: UrgencyKey;
    photos: string[];
  }) => void;
}) {
  const isEdit = !!initial;
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [area, setArea] = useState('');
  const [style, setStyle] = useState('');
  const [generalNotes, setGeneralNotes] = useState('');
  const [feeling, setFeeling] = useState('');
  const [creative, setCreative] = useState('');
  const [inspirationSources, setInspirationSources] = useState('');
  const [urgency, setUrgency] = useState<UrgencyKey>('important');
  const [photos, setPhotos] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setDate(initial?.date ?? '');
      setTime(initial?.time ?? '');
      setArea(initial?.area ?? '');
      setStyle(initial?.style ?? '');
      setGeneralNotes(initial?.generalNotes ?? '');
      setFeeling(initial?.feeling ?? '');
      setCreative(initial?.creative ?? '');
      setInspirationSources(initial?.inspirationSources ?? '');
      setUrgency(initial?.urgency ?? 'important');
      setPhotos(initial?.photos ?? []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <BottomSheet open={open} heightPct={85}>
      <div style={{ padding: '16px 24px 14px', position: 'relative' }}>
        <SheetCloseButton onClose={onClose} />
        <div style={{ fontSize: fs(15), color: COLORS.textMuted, fontStyle: 'italic', marginBottom: 3, letterSpacing: '0.3px' }}>{clientName}</div>
        <div style={{ fontSize: fs(22), color: COLORS.textPrimary, fontWeight: 300, letterSpacing: '1px' }}>
          {isEdit ? 'Редактировать консультацию' : 'Новая консультация'}
        </div>
        <SheetStarDivider />
      </div>

      <div className="inka-consult-grid" style={{ padding: '4px 24px 20px' }}>
        <div className="inka-consult-left">
          <div style={{ marginBottom: 16 }}>
            <FieldLabel>Фотографии</FieldLabel>
            <SessionPhotos photos={photos} onChange={setPhotos} buttonFirst />
          </div>

          {/* Compact, read-only — a quick reminder while browsing references,
              not a form to fill in (that happens on the client's own Инфо
              tab). Kept small and at the bottom so it doesn't compete with
              the photos for attention. */}
          {client && (client.allergies || client.skinReactions || client.skinType || client.skinTone) && (
            <div
              style={{
                border: '1px solid rgba(var(--gold-rgb),0.12)',
                borderRadius: 2,
                padding: '8px 10px',
                display: 'flex',
                flexDirection: 'column',
                gap: 3,
              }}
            >
              <div style={{ fontSize: fs(9), color: COLORS.textGhost, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 2 }}>
                Кожа клиента
              </div>
              {client.allergies && (
                <div dir="auto" style={{ fontSize: fs(11), color: 'var(--text-soft)' }}>
                  <span style={{ color: COLORS.textGhost }}>Аллергии: </span>
                  {client.allergies}
                </div>
              )}
              {client.skinReactions && (
                <div dir="auto" style={{ fontSize: fs(11), color: 'var(--text-soft)' }}>
                  <span style={{ color: COLORS.textGhost }}>Реакции: </span>
                  {client.skinReactions}
                </div>
              )}
              {client.skinType && (
                <div style={{ fontSize: fs(11), color: 'var(--text-soft)' }}>
                  <span style={{ color: COLORS.textGhost }}>Тип: </span>
                  {SKIN_TYPES.find((s) => s.value === client.skinType)?.label}
                </div>
              )}
              {client.skinTone && (
                <div style={{ fontSize: fs(11), color: 'var(--text-soft)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ color: COLORS.textGhost }}>Тон:</span>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: client.skinTone, flexShrink: 0, border: '1px solid rgba(var(--gold-rgb),0.3)' }} />
                </div>
              )}
            </div>
          )}
        </div>

        <div className="inka-consult-right">
          <div style={{ marginBottom: 16, display: 'flex', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <FieldLabel>Дата</FieldLabel>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...INPUT_STYLE, maxWidth: '100%', padding: '10px 8px' }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <FieldLabel>Время</FieldLabel>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={{ ...INPUT_STYLE, maxWidth: '100%', padding: '10px 8px' }} />
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <FieldLabel>Место</FieldLabel>
            <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Левое плечо, рёбра..." style={INPUT_STYLE} />
          </div>

          <div style={{ marginBottom: 16 }}>
            <FieldLabel>Общие заметки</FieldLabel>
            <textarea
              value={generalNotes}
              onChange={(e) => setGeneralNotes(e.target.value)}
              placeholder="Пожелания клиента, договорённости, мысли мастера..."
              style={{ ...INPUT_STYLE, resize: 'none', height: 90 }}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <FieldLabel>Чувство / ощущение</FieldLabel>
            <textarea
              value={feeling}
              onChange={(e) => setFeeling(e.target.value)}
              placeholder="Какое чувство или ощущение должна передавать татуировка..."
              style={{ ...INPUT_STYLE, resize: 'none', height: 60 }}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <FieldLabel>Источники вдохновения</FieldLabel>
            <textarea
              value={inspirationSources}
              onChange={(e) => setInspirationSources(e.target.value)}
              placeholder="Укажите источники, авторов, образы..."
              style={{ ...INPUT_STYLE, resize: 'none', height: 60 }}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <FieldLabel>Креатив</FieldLabel>
            <textarea
              value={creative}
              onChange={(e) => setCreative(e.target.value)}
              placeholder="Смелая идея, изюминка, что-то особенное..."
              style={{ ...INPUT_STYLE, resize: 'none', height: 70 }}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <FieldLabel>Техника и стиль</FieldLabel>
            <input
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              placeholder="Выберите технику и стилистику работы..."
              style={INPUT_STYLE}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <FieldLabel>Срочность</FieldLabel>
            <UrgencyChips value={urgency} onPick={setUrgency} />
          </div>
        </div>
      </div>

      <div style={{ padding: '0 24px 40px' }}>
        <div
          className="inka-submit"
          onClick={() => onAdd({ date, time, area, style, generalNotes, feeling, creative, inspirationSources, urgency, photos })}
          style={SUBMIT_STYLE}
        >
          <span style={{ fontFamily: "'Kelly Slab', 'Playfair Display', serif", fontSize: fs(13), color: COLORS.gold, letterSpacing: '2px' }}>
            {isEdit ? 'Сохранить' : 'Добавить консультацию'}
          </span>
        </div>
      </div>
    </BottomSheet>
  );
}
