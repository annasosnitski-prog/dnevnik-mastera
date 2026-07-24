import { useState, useEffect, useRef, useMemo, memo, type SVGProps } from 'react';
import { InkaLogo, DROP_CAP_FONT } from './InkaLogo';
import { NavFab } from './navigation/NavFab';
import { ToolbarIcon } from './navigation/ToolbarIcons';
import {
  readSyncSettings,
  writeSyncSettings,
  syncActive,
  diffAndSync,
  setConflictHandler,
  fetchBotBookings,
  DEFAULT_ENDPOINT,
  type CalendarSyncSettings,
  type BotBooking,
} from '../lib/calendarSync';
import {
  sendToContent,
  ContentSyncError,
  readContentSyncSettings,
  writeContentSyncSettings,
  type ContentDraftMedia,
  type ContentSyncSettings,
  type ContentSessionContext,
} from '../lib/contentSync';
import { downsizeToPreview } from '../lib/imagePreview';
// Доменные типы и их константы вынесены в src/domain/* (PR 2 рефакторинга).
// Форма данных и значения не изменились — это те же существующие типы,
// импортируемые обратно; второй модели Project не создавалось.
import { type UrgencyKey, URGENCY, LEGACY_URGENCY_MAP } from '../domain/urgency';
import { type Session } from '../domain/session';
import { type Consultation } from '../domain/consultation';
import { type ClientNote } from '../domain/task';
import {
  type ClientDocument,
  type ChatPlatform,
  type ChatLink,
  PLATFORM_LABELS,
  CHAT_PLATFORM_DOMAINS,
  type ClientType,
  CLIENT_TYPES,
  type ClientLanguage,
  CLIENT_LANGUAGES,
  type Client,
  clientStyles,
  stylesLabel,
} from '../domain/client';
// Чистые выборки/сортировки/агрегаты вынесены в domain/*Selectors и
// utils/dates (PR 3 рефакторинга). Алгоритмы и результаты не менялись.
import { ISO_DATE_RE, formatDate, dateParts, todayISO } from '../utils/dates';
import {
  getProjectById,
  getProjectsByClientId,
  getWorkshopProjects,
  getSessionsByProjectId,
  getConsultationsByProjectId,
} from '../domain/projectSelectors';
import { getTasksByProjectId, urgencyRank, urgencyMeta, notesUrgencyCounts, urgencyCounts } from '../domain/taskSelectors';
import {
  lastSession,
  lastSessionDate,
  nextPlannedSession,
  type SortMode,
  SORT_MODES,
  sortClients,
  mostUsedStyle,
  upcomingItems,
} from '../domain/plannerSelectors';
// Логика напоминаний вынесена в src/reminders/* (PR 4 рефакторинга). Строители
// теперь получают `now` аргументом; ключ проекта исправлен (см. reminderKeys).
import type { OverdueItem, HealingItem, UpcomingSoonItem } from '../reminders/types';
import { overdueEntries, healingReminders, upcomingSoonReminders, overdueProjects } from '../reminders/buildReminders';
import { overdueReminderKey, healingReminderKey, soonReminderKey, projectReminderKey } from '../reminders/reminderKeys';
import {
  type ReminderState,
  loadReminderState,
  saveReminderState,
  filterVisibleReminders,
  dismissReminder,
  snoozeReminder,
  removeExpiredSnoozes,
} from '../reminders/reminderState';
import {
  type ProjectCategory,
  PROJECT_CATEGORIES,
  type ProjectStage,
  type ProjectState,
  type ProjectWaitingFor,
  type ProjectPriority,
  PROJECT_STAGES,
  PROJECT_STATES,
  PROJECT_WAITING_FOR,
  PROJECT_PRIORITIES,
  type Project,
} from '../domain/project';

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
// Before anything's picked, showing all 22 swatches at once is a lot — pin
// every 3rd one (still spans the full light→dark range) and hide the rest
// behind "Ещё тона", same disclosure pattern as StyleChips below.
const SKIN_TONES_PINNED_STEP = 3;

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
const DONE_EMOJI = '🍀';

// ===================== DATA TYPES =====================

// Единая сущность для всё, что проходит через ContentINKA — сессия,
// консультация или свободная заметка («мастерская», если clientId=null),
// с фото или без. Живёт в своём IndexedDB store ('contentEntries'), не
// внутри Client — поэтому доступна с любой точки входа (страница
// ContentINKA, вкладка «Контент» клиента, просмотр сессии/консультации)
// как одни и те же данные, не три разных хранилища.
interface ContentEntry {
  id: string;
  createdDate: string;
  clientId: string | null; // null = мастерская
  sourceType: 'session' | 'consultation' | 'freeform';
  sourceId: string | null; // id сессии/консультации, если создано оттуда
  format: 'post' | 'story' | null; // прицельный формат («текст для сторис»), если запрашивался
  text: string; // ввод мастера — тема/инструкция, не результат
  context: ContentSessionContext; // снимок на момент генерации — перегенерация не бегает за живой сессией
  photos: string[]; // оригиналы (не превью) — те же data URL, что и в Session.photos
  contentDraft: ContentDraftMedia[] | null; // per-photo разметка (role/format/...), если есть фото
  visualArchetype: string | null;
  textTriad: { opens: string; leads: string; closes: string } | null;
  textDraft: string; // черновик текста — то, ради чего всё
  status: 'draft' | 'confirmed';
}

// Turns a raw input (phone, @handle, domain or full URL) into an openable link.
function buildChatLink(platform: ChatPlatform, raw: string): string {
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  // Without this, a link like "instagram.com/name" falls through to the
  // handle logic below, which would prefix the domain a second time —
  // "https://instagram.com/instagram.com/name" — a broken URL that the
  // platform then redirects to its own homepage instead of the profile/chat.
  const domain = CHAT_PLATFORM_DOMAINS[platform];
  if (domain && new RegExp(`^(www\\.)?${domain.replace('.', '\\.')}(/|$)`, 'i').test(trimmed)) {
    return `https://${trimmed}`;
  }
  const handle = trimmed.replace(/^@/, '');
  switch (platform) {
    case 'whatsapp': {
      const digits = trimmed.replace(/[^\d]/g, '');
      return digits ? `https://wa.me/${digits}` : trimmed;
    }
    case 'telegram':
      return handle ? `https://t.me/${handle}` : trimmed;
    // Social-media platforms (Instagram/Facebook/TikTok/Pinterest) open the
    // profile page, not a chat — only whatsapp/telegram/messenger are actual
    // messaging apps and get a direct-chat link.
    case 'instagram':
      return handle ? `https://instagram.com/${handle}` : trimmed;
    case 'facebook':
      return handle ? `https://facebook.com/${handle}` : trimmed;
    case 'messenger':
      return handle ? `https://m.me/${handle}` : trimmed;
    case 'tiktok':
      return handle ? `https://tiktok.com/@${handle}` : trimmed;
    case 'pinterest':
      return handle ? `https://pinterest.com/${handle}` : trimmed;
    case 'website':
      return trimmed ? `https://${trimmed}` : trimmed;
    default:
      return trimmed;
  }
}

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

// Tear-off calendar square — weekday/day/month, showing the soonest upcoming
// session or consultation. Positioned by the caller (each screen places it
// inside its own header), so it scrolls away with the rest of that header
// instead of staying pinned on screen — unlike the Сортировка/Фильтры/Поиск
// circles, which stay fixed regardless of scroll.
function UpcomingDateBadge({ clients, onOpen }: { clients: Client[]; onOpen: () => void }) {
  const next = upcomingItems(clients, 365)[0];
  const parts = next ? dateParts(next.date) : null;
  if (!next || !parts) return null;
  return (
    <div
      onClick={onOpen}
      role="button"
      aria-label="Открыть календарь"
      style={{
        width: 42,
        height: 42,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: 1,
        cursor: 'pointer',
        borderRadius: 4,
        border: '1px solid rgba(var(--gold-rgb),0.3)',
        background: 'rgba(var(--gold-rgb),0.04)',
      }}
    >
      <div style={{ fontSize: 7, letterSpacing: '0.5px', textTransform: 'uppercase', color: COLORS.gold, marginBottom: 2 }}>{parts.weekday}</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: COLORS.textPrimary }}>{parts.day}</div>
      <div style={{ fontSize: 7, letterSpacing: '0.5px', textTransform: 'uppercase', color: COLORS.textGhost, marginTop: 2 }}>{parts.month}</div>
    </div>
  );
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
function healingReminderMessage(client: Client): string {
  return REMINDER_TEXTS[client.language].healing;
}

// "<weekday>, <day> <month>[, <time>]" in the client's own language/locale —
// e.g. ru: «четверг, 23 июля, 16:27», en: "Thursday, July 23, 4:27 PM". Built
// from y/m/d components (not `new Date(iso)`) for the same reason as
// dateParts below — avoids a UTC-parse day-shift in western timezones.
function localizedWhen(dateIso: string, time: string, language: ClientLanguage): string {
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
function soonReminderMessage(it: UpcomingSoonItem): string {
  const { language } = it.client;
  return REMINDER_TEXTS[language].soon(localizedWhen(it.date, it.time, language));
}

// Normalises a raw IndexedDB record (which may predate this schema) into a
// complete Client so the UI never has to guard against missing fields.
// Общая нормализация сессии — переиспользуется и для client.sessions, и для
// «сессий без клиента» на самом проекте (Project.sessions, Этап 3b-доп.).
function normalizeSession(s: any, i: number): Session {
  return {
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
    healed: s?.healed ?? false,
    cancelled: s?.cancelled ?? false,
    projectId: s?.projectId ?? null,
  };
}

function normalizeClient(raw: any, index: number): Client {
  const sessions: Session[] = Array.isArray(raw?.sessions) ? raw.sessions.map(normalizeSession) : [];

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
    language: CLIENT_LANGUAGES.some((l) => l.value === raw?.language) ? raw.language : 'ru',
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
          cancelled: Boolean(cn?.cancelled),
          createdDate: cn?.createdDate ?? new Date().toISOString(),
          projectId: cn?.projectId ?? null,
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
          projectId: n?.projectId ?? null,
        }))
      : [],
    createdDate: raw?.createdDate ?? new Date().toISOString(),
  };
}

function normalizeProject(raw: any, index: number): Project {
  return {
    id: String(raw?.id ?? Date.now() + index),
    title: raw?.title ?? '',
    color: raw?.color ?? MARKER_COLORS[index % MARKER_COLORS.length],
    category: PROJECT_CATEGORIES.some((c) => c.key === raw?.category) ? raw.category : 'tattoo',
    clientId: raw?.clientId ?? null,
    stage: PROJECT_STAGES.some((s) => s.key === raw?.stage) ? raw.stage : 'idea',
    state: PROJECT_STATES.some((s) => s.key === raw?.state) ? raw.state : 'active',
    waitingFor: PROJECT_WAITING_FOR.some((w) => w.key === raw?.waitingFor) ? raw.waitingFor : 'none',
    nextActionText: raw?.nextActionText ?? '',
    nextActionDate: raw?.nextActionDate ?? null,
    priority: PROJECT_PRIORITIES.some((p) => p.key === raw?.priority) ? raw.priority : 'normal',
    area: raw?.area ?? '',
    style: raw?.style ?? '',
    generalNotes: raw?.generalNotes ?? '',
    feeling: raw?.feeling ?? '',
    creative: raw?.creative ?? '',
    inspirationSources: raw?.inspirationSources ?? '',
    photos: Array.isArray(raw?.photos) ? raw.photos : [],
    createdDate: raw?.createdDate ?? new Date().toISOString(),
    sessions: Array.isArray(raw?.sessions) ? raw.sessions.map(normalizeSession) : [],
  };
}

// ===================== DATABASE =====================
// Version bumped 1 → 2 to add two new stores at once — «projects»
// (Творческая мастерская) and «contentEntries» (единая сущность для всего,
// что проходит через ContentINKA — сессия/консультация/свободная заметка,
// см. ContentEntry ниже). Existing installs upgrade in place on next load;
// onupgradeneeded only touches stores that don't exist yet, so the clients
// store and its data are never re-created or wiped.
const initDB = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open('TattoDiaryDB', 2);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('clients')) {
        db.createObjectStore('clients', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('projects')) {
        db.createObjectStore('projects', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('contentEntries')) {
        db.createObjectStore('contentEntries', { keyPath: 'id' });
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
// Rendered once, fixed behind all screens (not inside any scroll container),
// so the canvas only needs to cover one viewport — anything taller than that
// would sit permanently clipped by .app-shell's overflow:hidden, animating
// off-screen for no visual benefit. Count is sized for this exact height.
const STARFIELD_COUNT = 47;
const STARFIELD_HEIGHT_VH = 100;
const METEOR_COUNT = 4;
// Fixed epoch every background animation delay is measured from, so a cloud /
// star / craft is at the same phase in every screen regardless of when that
// screen mounted — screen transitions no longer show the sky jump.
const SKY_EPOCH = Date.now();
// Warm gold star tone, varied per star (hue fixed at 45, lightness varies).
const goldStar = () => `hsl(45, ${68 + Math.random() * 14}%, ${56 + Math.random() * 30}%)`;

function buildStars() {
  return Array.from({ length: STARFIELD_COUNT }, () => ({
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: 1.2 + Math.random() * 2.2,
    color: goldStar(),
    duration: 1.8 + Math.random() * 3.4,
    baseDelay: Math.random() * 4,
    sparkle: Math.random() < 0.16,
  }));
}
// Shooting stars — gold, rare, brief. All meteors share one long cycle
// (METEOR_CYCLE) split into equal slots, one per meteor, with jitter kept
// well inside each slot's margin — since every meteor shares the exact same
// period, that phase relationship holds forever, so two meteors' visible
// windows can never land at the same time (unlike independent random delays,
// which drift in and out of overlap over a long enough session). Tuned to
// ~65/hour (was ~195/hour — too frequent to read as a rare event; the
// 30/hour throttle was for the now-removed comets, not this plain gold
// shower): METEOR_COUNT per METEOR_CYCLE seconds, i.e. COUNT * 3600 / CYCLE.
const METEOR_CYCLE = 220;
function buildMeteors() {
  const slot = METEOR_CYCLE / METEOR_COUNT;
  return Array.from({ length: METEOR_COUNT }, (_, i) => {
    const goesLeft = Math.random() < 0.5;
    const rotDeg = goesLeft ? 135 : 45;
    const dist = 320 + Math.random() * 260;
    const rad = (rotDeg * Math.PI) / 180;
    return {
      left: goesLeft ? 45 + Math.random() * 40 : 15 + Math.random() * 40,
      top: Math.random() * 60,
      length: 70 + Math.random() * 85,
      rot: rotDeg,
      mx: Math.cos(rad) * dist,
      my: Math.sin(rad) * dist,
      duration: METEOR_CYCLE,
      baseDelay: i * slot + (Math.random() - 0.5) * slot * 0.3,
    };
  });
}
// Shared once, so the starfield is identical on every screen.
let sharedStars: ReturnType<typeof buildStars> | null = null;
let sharedMeteors: ReturnType<typeof buildMeteors> | null = null;
function getStars() {
  if (!sharedStars) sharedStars = buildStars();
  return sharedStars;
}
function getMeteors() {
  if (!sharedMeteors) sharedMeteors = buildMeteors();
  return sharedMeteors;
}

// Dark theme's sky: twinkling gold stars and an occasional «звездопад» (gold
// meteors, ~30/hour). The light theme's counterpart is CloudsBackground — so
// this renders only in the dark theme. Shares one layout across screens with
// delays anchored to SKY_EPOCH, so the field holds still through screen
// transitions.
// Memoized because it takes no props: without this, every state change
// anywhere in the (huge, single) app component would re-render and
// reconcile this whole star/meteor subtree for nothing on every keystroke,
// client edit, etc. React.memo skips that — it only re-renders on its own
// internal state changes (theme flip, visibility change).
const StarfieldBackground = memo(function StarfieldBackground() {
  const isLight = useIsLightTheme();
  const [, setTick] = useState(0);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') setTick((t) => t + 1);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  if (isLight) return null;

  const stars = getStars();
  const meteors = getMeteors();
  const elapsed = (Date.now() - SKY_EPOCH) / 1000;

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
            animationDelay: `${-(elapsed + s.baseDelay)}s`,
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
            // Gold streak — bright head (right end) leads, trail fades behind.
            background: 'linear-gradient(to right, transparent, rgba(228,190,110,0.4) 55%, rgba(240,208,140,0.98))',
            boxShadow: '0 0 6px rgba(230,196,120,0.75)',
            ['--mx' as string]: `${m.mx}px`,
            ['--my' as string]: `${m.my}px`,
            ['--rot' as string]: `${m.rot}deg`,
            animationDuration: `${m.duration}s`,
            animationDelay: `${-(elapsed + m.baseDelay)}s`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
});

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
// Counts sized for one viewport-tall canvas (see STARFIELD_HEIGHT_VH above —
// this layer shares the same fixed, non-scrolling canvas as the starfield).
const CLOUD_LAYERS = [
  { color: '#D0C29B', scale: 0.56, durationMul: 1.85, opacity: 0.38, count: 12 }, // far / lightest
  { color: '#B6A06E', scale: 0.73, durationMul: 1.45, opacity: 0.45, count: 12 },
  { color: '#957842', scale: 0.92, durationMul: 1.15, opacity: 0.5, count: 10 },
  { color: '#6D5220', scale: 1.13, durationMul: 0.92, opacity: 0.55, count: 10 },
  { color: '#493611', scale: 1.38, durationMul: 0.72, opacity: 0.6, count: 10 }, // near / darkest
];

// Width is capped well under what the drift keyframes' off-screen margin
// (see .inka-cloud-drift in index.css) can hide, so a cloud never pops into
// view mid-screen — it always slides in from past the edge.
function buildCloudLayers() {
  return CLOUD_LAYERS.map((layer) => {
    const band = 100 / layer.count;
    const offset = Math.floor(Math.random() * CLOUD_SOURCES.length);
    const clouds = Array.from({ length: layer.count }, (_, i) => ({
      src: CLOUD_SOURCES[(i + offset) % CLOUD_SOURCES.length],
      // Loose bands (jitter wider than the band) keep clouds spread evenly
      // down the canvas while still letting neighbours drift into each other.
      top: i * band + (Math.random() - 0.3) * band * 2,
      // Sized down a third and drifting well under half the old speed — the
      // original pace read as jittery/seasick when several layers crossed
      // at once, especially during screen-transition overlap.
      width: (160 + Math.random() * 100) * layer.scale * (2 / 3),
      flip: Math.random() < 0.5,
      driftDuration: (40 + Math.random() * 40) * layer.durationMul * 2.5,
      // Base offsets (positive); the actual animation-delay is derived from the
      // global clock at render (see CloudsBackground) so it's identical on
      // every screen.
      baseDriftDelay: Math.random() * 90,
      bobDuration: 6 + Math.random() * 6,
      baseBobDelay: Math.random() * 8,
    }));
    return { color: layer.color, opacity: layer.opacity, clouds };
  });
}

// A single cloud layout shared by every CloudsBackground instance (each screen
// mounts its own), so the sky is IDENTICAL on all screens. Generated once, lazily.
let sharedCloudLayers: ReturnType<typeof buildCloudLayers> | null = null;
function getCloudLayers() {
  if (!sharedCloudLayers) sharedCloudLayers = buildCloudLayers();
  return sharedCloudLayers;
}

// Light theme's sky — hand-drawn engraving clouds in five depth layers,
// drifting past at their own speed with a gentle bob. The dark theme's
// counterpart is StarfieldBackground above. Shares the same viewport-tall
// canvas as the starfield.
//
// Every screen renders this, and they all use the SAME shared layout with
// animation delays anchored to a global epoch (SKY_EPOCH). Because the phase of
// each cloud then depends only on wall-clock time — not on when a given screen
// mounted — the sky looks the same across every screen, so sliding from one
// screen to another shows the clouds holding still instead of jumping/popping.
// Memoized like StarfieldBackground — no props, so this opts the whole
// cloud subtree out of every unrelated re-render in the app.
const CloudsBackground = memo(function CloudsBackground() {
  const isLight = useIsLightTheme();
  const [, setTick] = useState(0);

  useEffect(() => {
    // A backgrounded PWA can freeze the CSS drift. Re-render on regained
    // visibility to re-anchor delays to the clock (harmless when not frozen:
    // the shared layout + global clock reproduce the exact same positions).
    const onVisibility = () => {
      if (document.visibilityState === 'visible') setTick((t) => t + 1);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  if (!isLight) return null;

  const layers = getCloudLayers();
  const elapsed = (Date.now() - SKY_EPOCH) / 1000;

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: `${STARFIELD_HEIGHT_VH}vh`, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
      {layers.map((layer, li) =>
        layer.clouds.map((c, i) => (
          <div
            key={`${li}-${i}`}
            className="inka-cloud-drift"
            style={{
              top: `${c.top}%`,
              animationDuration: `${c.driftDuration}s`,
              animationDelay: `${-(elapsed + c.baseDriftDelay)}s`,
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
                animationDelay: `${-(elapsed + c.baseBobDelay)}s`,
              }}
            />
          </div>
        )),
      )}
    </div>
  );
});

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
// floats highest); width in px; bob = seconds per float cycle. Durations
// stretched 1.5x — each craft loops on its own duration, so a third longer
// means a third fewer passes per hour.
const CRAFT_MOTION: Record<CraftType, { width: [number, number]; duration: [number, number]; bobY: [number, number]; bob: [number, number] }> = {
  airship: { width: [165, 215], duration: [117, 180], bobY: [8, 15], bob: [9, 13] },
  balloon: { width: [78, 116], duration: [225, 345], bobY: [24, 40], bob: [7, 12] },
};

const rand = (min: number, max: number) => min + Math.random() * (max - min);

function buildCraft() {
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
      baseDriftDelay: rand(0, m.duration[1]),
      bobY: rand(m.bobY[0], m.bobY[1]),
      bobDuration: rand(m.bob[0], m.bob[1]),
      baseBobDelay: rand(0, 8),
    };
  });
}

// One craft layout shared by every AviationBackground instance, generated once.
let sharedCraft: ReturnType<typeof buildCraft> | null = null;
function getCraft() {
  if (!sharedCraft) sharedCraft = buildCraft();
  return sharedCraft;
}

// Light theme's retro-aviation layer — airships and a balloon drifting across
// the sky in front of the clouds, each with motion suited to its kind. Shares
// one layout across all screens, with delays anchored to SKY_EPOCH, so it holds
// still through screen transitions (same reasoning as CloudsBackground).
//
// Memoized like the other two sky layers — no props, so it opts out of
// every unrelated re-render in the app.
const AviationBackground = memo(function AviationBackground() {
  const isLight = useIsLightTheme();
  const [, setTick] = useState(0);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') setTick((t) => t + 1);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  if (!isLight) return null;

  const craft = getCraft();
  const elapsed = (Date.now() - SKY_EPOCH) / 1000;

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: `${STARFIELD_HEIGHT_VH}vh`, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
      {craft.map((c, i) => (
        <div
          key={`${i}`}
          className={c.goesRight ? 'inka-cloud-drift' : 'inka-drift-rev'}
          style={{ top: `${c.top}%`, animationDuration: `${c.driftDuration}s`, animationDelay: `${-(elapsed + c.baseDriftDelay)}s` }}
        >
          <div
            className="inka-cloud-bob"
            style={{ ['--bob-y' as string]: `${c.bobY}px`, animationDuration: `${c.bobDuration}s`, animationDelay: `${-(elapsed + c.baseBobDelay)}s` } as React.CSSProperties}
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
});

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
// Shared by both of Админка's period pickers («Предстоящие сессии» and the
// stats grid) so the two read as one control, not two different ones.
const DASHBOARD_WINDOW_OPTIONS: { days: number; label: string }[] = [
  { days: 3, label: '3 дня' },
  { days: 7, label: '7 дней' },
  { days: 14, label: '14 дней' },
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
        upcomingWindowDays: DASHBOARD_WINDOW_OPTIONS.some((o) => o.days === p.upcomingWindowDays) ? p.upcomingWindowDays : 7,
        statsWindowDays: DASHBOARD_WINDOW_OPTIONS.some((o) => o.days === p.statsWindowDays) ? p.statsWindowDays : 30,
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
  phone: string; // the master's own phone — its own tap-to-copy block, separate from `links`
  telegramBotLink: string; // link to the booking bot in Telegram — its own block, kept apart from `chatLinks`
  chatLinks: ChatLink[]; // master's own site/WhatsApp/Telegram/Instagram/etc — same picker as a client's contacts
  colorLabels: Record<string, string>; // MARKER_COLORS hex -> master's own label
  notes: ClientNote[]; // the master's own notes (not tied to any client), shown in «Задачи»
}
const DEFAULT_MASTER_INFO: MasterInfo = {
  name: '',
  links: [],
  bankDetails: '',
  phone: '',
  telegramBotLink: '',
  chatLinks: [],
  colorLabels: {},
  notes: [],
};

function readInitialMasterInfo(): MasterInfo {
  try {
    const raw = localStorage.getItem('inka-master-info');
    if (raw) {
      const p = JSON.parse(raw);
      const chatLinks = Array.isArray(p.chatLinks)
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
        notes: Array.isArray(p.notes)
          ? p.notes.map((n: any, i: number): ClientNote => ({
              id: String(n?.id ?? `${Date.now()}-m${i}`),
              text: n?.text ?? '',
              urgency: URGENCY.some((u) => u.key === n?.urgency) ? n.urgency : LEGACY_URGENCY_MAP[n?.urgency] ?? 'normal',
              done: Boolean(n?.done),
              createdDate: n?.createdDate ?? new Date().toISOString(),
              photos: Array.isArray(n?.photos) ? n.photos : [],
              projectId: n?.projectId ?? null,
            }))
          : [],
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
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  // Единая сущность для всего, что проходит через ContentINKA — см.
  // ContentEntry ниже. Отдельный store ('contentEntries'), не часть
  // клиента — доступна и без выбранного клиента (страница ContentINKA,
  // «мастерская»).
  const [contentEntries, setContentEntries] = useState<ContentEntry[]>([]);
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

  // Настройки ContentINKA — тот же принцип, свой ключ localStorage
  // (inka-content-sync, не inka-calendar-sync), свой секрет. См.
  // src/lib/contentSync.ts.
  const [contentSync, setContentSync] = useState<ContentSyncSettings>(readContentSyncSettings);
  useEffect(() => {
    writeContentSyncSettings(contentSync);
  }, [contentSync]);

  // Предупреждение о пересечении: если синхронизированная запись легла
  // поверх чего-то в календаре (например брони клиента через бота) —
  // показываем янтарный баннер. Запись не блокируется, решение за мастером.
  const [syncWarning, setSyncWarning] = useState<string | null>(null);
  useEffect(() => {
    setConflictHandler(setSyncWarning);
    return () => setConflictHandler(null);
  }, []);

  // Reminder cards (see RemindersSection) the master has explicitly closed —
  // by «×» or swipe — so they stay hidden even though the underlying overdue
  // /healing condition hasn't changed. Keyed by a stable per-reminder string
  // (see reminderKey below), not by anything that would naturally clear this
  // — marking done, rescheduling, or ticking «Зажив» already removes the
  // entry from its source list regardless of this set.
  // Скрытые/отложенные напоминания — см. src/reminders/reminderState.ts. На
  // старте подхватываем прежний формат (массив) и чистим истёкшие snooze.
  const [reminderState, setReminderState] = useState<ReminderState>(() => removeExpiredSnoozes(loadReminderState(), new Date()));
  useEffect(() => {
    saveReminderState(reminderState);
  }, [reminderState]);
  const handleDismissReminder = (key: string) => setReminderState((prev) => dismissReminder(prev, key));
  const handleSnoozeReminder = (key: string, showAfter: string) => setReminderState((prev) => snoozeReminder(prev, key, showAfter));

  const [screen, setScreen] = useState<'list' | 'detail' | 'settings' | 'summary' | 'master' | 'admin' | 'workshop' | 'content'>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'info' | 'sessions' | 'consultations' | 'extra'>('sessions');
  const [searchQuery, setSearchQuery] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [colorFilter, setColorFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | ClientType>('all');
  const [sortMode, setSortMode] = useState<SortMode>('name');
  const [sortOpen, setSortOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

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
  // «Творческая мастерская» — standalone projects, not tied to any client.
  const [showNewProjectForm, setShowNewProjectForm] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);
  // Главная кнопка «Создать» на Мастерской спрашивает «Новый проект» или
  // «Сессия без клиента» — держит открытость этого выбора и, для второго
  // варианта, открытость пикера «в какой проект».
  const [showWorkshopCreateChoice, setShowWorkshopCreateChoice] = useState(false);
  const [showProjectSessionPicker, setShowProjectSessionPicker] = useState(false);
  // Read-only fullscreen viewer for a consultation or a session, opened by
  // tapping the card body (the pencil still edits). Holds the client id so the
  // viewer always reflects the latest stored copy even after an edit.
  const [viewEntry, setViewEntry] = useState<
    | { kind: 'session'; clientId: string; id: string }
    | { kind: 'consultation'; clientId: string; id: string }
    | null
  >(null);
  // Read-only просмотр проекта (Этап 2): тап по проекту открывает просмотр,
  // а не сразу форму редактирования (см. ProjectViewSheet).
  const [viewProject, setViewProject] = useState<Project | null>(null);
  // Клиент, под которого создаётся НОВЫЙ проект (кнопка «+ Новый» во вкладке
  // клиента, Этап 3a) — используется только пока editProject === null.
  const [newProjectClientId, setNewProjectClientId] = useState<string | null>(null);
  // Проект, к которому сразу привязывается НОВАЯ сессия/консультация, если её
  // создают из просмотра проекта (кнопки «+ Сессия/Консультация», Этап 3b) —
  // предзаполняет поле «Проект» в форме. Только для новой записи.
  const [presetEntryProjectId, setPresetEntryProjectId] = useState<string | null>(null);
  // Если задан — открытая форма «Новая сессия» сохраняет в Project.sessions
  // этого проекта (сессия без клиента), а не в client.sessions (Этап 3b-доп.).
  const [sessionTargetProjectId, setSessionTargetProjectId] = useState<string | null>(null);
  // Month calendar overlay, opened by tapping the «Ближайшая» badge.
  const [showCalendar, setShowCalendar] = useState(false);
  // Блокнот's new-note composer — lifted (not local to SummaryScreen) so the
  // nav FAB's contextual create action can open it from outside.
  const [showSummaryComposer, setShowSummaryComposer] = useState(false);
  // Блокнот's urgency filter — lifted the same way, so Админка's stat blocks
  // can jump straight to «Срочно»/«Важно» pre-filtered instead of landing on
  // the unfiltered list.
  const [summaryFilter, setSummaryFilter] = useState<UrgencyKey | 'all'>('all');

  // ── Calendar-driven creation: «Создать событие» on a picked day walks
  // through kind → client (existing/new) → the actual session/consultation
  // form, prefilled with that date. A single step value (rather than one
  // independent boolean per sheet) makes the steps mutually exclusive by
  // construction — two of these sheets can never both be "open" at once,
  // which a set of separate booleans could otherwise drift into.
  type CalendarWalkStep = 'kind' | 'clientKind' | 'clientPicker' | 'quickClient' | null;
  const [calendarWalkStep, setCalendarWalkStep] = useState<CalendarWalkStep>(null);
  const [calendarCreateDate, setCalendarCreateDate] = useState<string | null>(null);
  const [calendarEventKind, setCalendarEventKind] = useState<'session' | 'consultation' | null>(null);
  // Cancels the calendar-creation walk from any step, clearing its state.
  const cancelCalendarWalk = () => {
    setCalendarWalkStep(null);
    setCalendarCreateDate(null);
    setCalendarEventKind(null);
  };

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
  // `forceRps`: the mandatory first-client gate always plays rock-paper-
  // scissors specifically (not the cups/blackjack coin flip) — it's the
  // simplest of the three, fitting for someone who's never seen the game.
  const [rpsChallenge, setRpsChallenge] = useState<null | { onWin: () => void; forceRps: boolean }>(null);
  const RPS_RANDOM_CHANCE = 0.15;
  const runGated = (mandatory: boolean, action: () => void) => {
    if (!prefs.gameMode || !(mandatory || Math.random() < RPS_RANDOM_CHANCE)) {
      action();
      return;
    }
    setRpsChallenge({ onWin: action, forceRps: mandatory });
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
        loadProjects(database);
        loadContentEntries(database);
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

  const loadProjects = (database: IDBDatabase) => {
    const tx = database.transaction('projects', 'readonly');
    const request = tx.objectStore('projects').getAll();
    request.onsuccess = () => {
      setProjects((request.result || []).map(normalizeProject));
      setProjectsLoaded(true);
    };
    request.onerror = () => setDbError('Не удалось загрузить проекты.');
  };

  const saveProject = (project: Project) => {
    if (!db) {
      setDbError('Хранилище недоступно — изменения не сохранены.');
      return;
    }
    const tx = db.transaction('projects', 'readwrite');
    tx.objectStore('projects').put(project);
    tx.oncomplete = () => loadProjects(db);
    tx.onerror = () => setDbError('Не удалось сохранить изменения.');
  };

  const deleteProject = (id: string) => {
    if (!db) {
      setDbError('Хранилище недоступно — проект не удалён.');
      return;
    }
    const tx = db.transaction('projects', 'readwrite');
    tx.objectStore('projects').delete(id);
    tx.oncomplete = () => {
      loadProjects(db);
      setEditProject(null);
      setShowNewProjectForm(false);
    };
    tx.onerror = () => setDbError('Не удалось удалить проект.');
  };

  const loadContentEntries = (database: IDBDatabase) => {
    const tx = database.transaction('contentEntries', 'readonly');
    const request = tx.objectStore('contentEntries').getAll();
    request.onsuccess = () => setContentEntries(request.result || []);
    request.onerror = () => setDbError('Не удалось загрузить черновики контента.');
  };

  // Единственная точка записи для contentEntries — по аналогии с
  // saveClient. Апсерт по id: запись с тем же id перезаписывается
  // (перегенерация текста), иначе создаётся новая.
  const saveContentEntry = (entry: ContentEntry) => {
    if (!db) {
      setDbError('Хранилище недоступно — изменения не сохранены.');
      return;
    }
    const tx = db.transaction('contentEntries', 'readwrite');
    tx.objectStore('contentEntries').put(entry);
    tx.oncomplete = () => loadContentEntries(db);
    tx.onerror = () => setDbError('Не удалось сохранить черновик контента.');
  };

  const deleteContentEntry = (id: string) => {
    if (!db) return;
    const tx = db.transaction('contentEntries', 'readwrite');
    tx.objectStore('contentEntries').delete(id);
    tx.oncomplete = () => loadContentEntries(db);
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

  // Импорт полного бэкапа (Этап 2): clients + опционально projects и
  // contentEntries. Стор трогаем ТОЛЬКО если соответствующий массив есть в
  // файле — старый бэкап (только clients) не затирает проекты/контент.
  const replaceAllData = (bundle: {
    clients: Client[];
    projects?: Project[];
    contentEntries?: ContentEntry[];
  }) => {
    if (!db) {
      setDbError('Хранилище недоступно — импорт не выполнен.');
      return;
    }
    const stores = ['clients'];
    if (bundle.projects) stores.push('projects');
    if (bundle.contentEntries) stores.push('contentEntries');
    const tx = db.transaction(stores, 'readwrite');
    const cs = tx.objectStore('clients');
    cs.clear();
    bundle.clients.forEach((c) => cs.put(c));
    if (bundle.projects) {
      const ps = tx.objectStore('projects');
      ps.clear();
      bundle.projects.forEach((p) => ps.put(p));
    }
    if (bundle.contentEntries) {
      const es = tx.objectStore('contentEntries');
      es.clear();
      bundle.contentEntries.forEach((e) => es.put(e));
    }
    tx.oncomplete = () => {
      loadClients(db);
      if (bundle.projects) loadProjects(db);
      if (bundle.contentEntries) loadContentEntries(db);
    };
    tx.onerror = () => setDbError('Не удалось импортировать данные.');
  };

  // Adds/updates just the given clients (put, no clear) — the counterpart to
  // a single-client export: importing that file merges it into whatever's
  // already stored instead of replacing the whole list.
  const importClients = (newClients: Client[]) => {
    if (!db) {
      setDbError('Хранилище недоступно — импорт не выполнен.');
      return;
    }
    const tx = db.transaction('clients', 'readwrite');
    const store = tx.objectStore('clients');
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
    setCalendarCreateDate(null);
    setCalendarEventKind(null);
    setPresetEntryProjectId(null);
    setSessionTargetProjectId(null);
  };
  const closeNewConsultation = () => {
    setShowNewConsultationForm(false);
    setEditConsultation(null);
    setCalendarCreateDate(null);
    setCalendarEventKind(null);
    setPresetEntryProjectId(null);
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
    setShowCalendar(false);
    setViewEntry(null);
    cancelCalendarWalk();
  };

  // Reached once a client (existing or freshly created) is in place for the
  // event the master started from the calendar — lands on that client's
  // sessions or consultations tab (matching the kind being created) with
  // the form open, date prefilled.
  const openPendingCalendarEvent = () => {
    setScreen('detail');
    if (calendarEventKind === 'consultation') {
      setActiveTab('consultations');
      setEditConsultation(null);
      setShowNewConsultationForm(true);
    } else {
      setActiveTab('sessions');
      setEditSession(null);
      setShowNewSessionForm(true);
    }
  };

  const handleQuickCreateClient = (data: { name: string; color: string; phone: string }) => {
    const client: Client = {
      id: Date.now().toString(),
      name: data.name.trim(),
      surname: '',
      styles: [],
      style: '',
      color: data.color || ACCENT_COLORS[clients.length % ACCENT_COLORS.length],
      clientType: 'client',
      language: 'ru',
      note: '',
      masterNote: '',
      phone: data.phone.trim(),
      skinType: '',
      skinTone: '',
      skinNotes: '',
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
    setSelectedId(client.id);
    setCalendarWalkStep(null);
    setCelebrationCount(clients.length + 1);
    setCelebrationKey((k) => k + 1);
    openPendingCalendarEvent();
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
    projectId: string | null;
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
        { id: Date.now().toString(), createdDate: new Date().toISOString(), cancelled: false, ...fields },
      ];
    }
    saveClient({ ...selectedClient, consultations });
    setShowNewConsultationForm(false);
    setEditConsultation(null);
    setCalendarCreateDate(null);
    setCalendarEventKind(null);
    setPresetEntryProjectId(null);
  };

  const deleteConsultation = (consultationId: string) => {
    if (!selectedClient) return;
    saveClient({ ...selectedClient, consultations: selectedClient.consultations.filter((c) => c.id !== consultationId) });
  };

  // ── Мастерская: standalone projects, not tied to any client ──
  const handleAddProject = (data: {
    title: string;
    color: string;
    category: ProjectCategory;
    clientId: string | null;
    stage: ProjectStage;
    state: ProjectState;
    waitingFor: ProjectWaitingFor;
    nextActionText: string;
    nextActionDate: string | null;
    priority: ProjectPriority;
    area: string;
    style: string;
    generalNotes: string;
    feeling: string;
    creative: string;
    inspirationSources: string;
    photos: string[];
  }) => {
    if (editProject) {
      // Клиента только что привязали к проекту, у которого копились «сессии
      // без клиента» (см. Project.sessions) — переносим их клиенту с той же
      // связью через projectId и чистим с проекта. Раньше clientId не было —
      // значит client.sessions этого проекта ещё нет, дублей не возникнет.
      if (!editProject.clientId && data.clientId && editProject.sessions.length > 0) {
        const client = clients.find((c) => c.id === data.clientId);
        if (client) {
          saveClient({
            ...client,
            sessions: [...client.sessions, ...editProject.sessions.map((s) => ({ ...s, projectId: editProject.id }))],
          });
        }
        saveProject({ ...editProject, ...data, sessions: [] });
      } else {
        saveProject({ ...editProject, ...data });
      }
    } else {
      saveProject({ id: Date.now().toString(), createdDate: new Date().toISOString(), sessions: [], ...data });
    }
    setShowNewProjectForm(false);
    setEditProject(null);
    setNewProjectClientId(null);
  };

  // «Сессия без клиента» — живёт прямо в проекте (Project.sessions), пока к
  // проекту не привязан клиент (см. миграцию в handleAddProject выше). Тот
  // же набор полей, что и у обычной сессии клиента.
  const handleAddProjectSession = (
    projectId: string,
    data: {
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
      healed: boolean;
      projectId: string | null;
    },
  ) => {
    const p = getProjectById(projects, projectId);
    if (!p) return;
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
      healed: data.healed,
      projectId,
    };
    let sessions: Session[];
    if (editSession) {
      sessions = p.sessions.map((s) => (s.id === editSession.id ? { ...s, ...fields } : s));
    } else {
      sessions = [...p.sessions, { id: Date.now().toString(), cancelled: false, ...fields }];
    }
    saveProject({ ...p, sessions });
    advanceProjectStage(projectId, fields.done ? 'in_progress' : 'booked');
  };

  // ── Миграция «Собрать старые записи в проекты» (Этап 2) ──
  // Для каждого клиента с сессиями/консультациями без projectId создаёт
  // (если ещё нет) проект-«корзину» с детерминированным id `bucket-<id>` и
  // проставляет на эти записи projectId. Чисто аддитивно и идемпотентно:
  // содержимое записей не трогается, повторный запуск не плодит корзины.
  // projectId не входит в ключ синка календаря, поэтому saveClient здесь не
  // шлёт ничего в Инка-календарь.
  const migrateRecordsIntoProjects = (): { buckets: number; records: number } => {
    let buckets = 0;
    let records = 0;
    const existingProjectIds = new Set(projects.map((p) => p.id));
    for (const client of clients) {
      const orphanSessions = client.sessions.filter((s) => !s.projectId);
      const orphanConsults = client.consultations.filter((c) => !c.projectId);
      if (orphanSessions.length === 0 && orphanConsults.length === 0) continue;
      const bucketId = `bucket-${client.id}`;
      const fullName = `${client.name} ${client.surname}`.trim() || 'Клиент';
      if (!existingProjectIds.has(bucketId)) {
        saveProject({
          id: bucketId,
          title: `Записи · ${fullName}`,
          color: client.color || MARKER_COLORS[0],
          category: 'tattoo',
          clientId: client.id,
          stage: 'in_progress',
          state: 'active',
          waitingFor: 'none',
          nextActionText: '',
          nextActionDate: null,
          priority: 'normal',
          area: '',
          style: '',
          generalNotes: '',
          feeling: '',
          creative: '',
          inspirationSources: '',
          photos: [],
          createdDate: new Date().toISOString(),
          sessions: [],
        });
        existingProjectIds.add(bucketId);
        buckets += 1;
      }
      records += orphanSessions.length + orphanConsults.length;
      saveClient({
        ...client,
        sessions: client.sessions.map((s) => (s.projectId ? s : { ...s, projectId: bucketId })),
        consultations: client.consultations.map((c) => (c.projectId ? c : { ...c, projectId: bucketId })),
      });
    }
    return { buckets, records };
  };

  // Быстрая смена проекта записи без открытия полной формы редактирования
  // (Этап 3a) — из read-only просмотра (TimelineViewSheet).
  const reassignEntryProject = (clientId: string, kind: 'session' | 'consultation', entryId: string, projectId: string | null) => {
    const c = clients.find((x) => x.id === clientId);
    if (!c) return;
    if (kind === 'session') {
      saveClient({ ...c, sessions: c.sessions.map((s) => (s.id === entryId ? { ...s, projectId } : s)) });
    } else {
      saveClient({ ...c, consultations: c.consultations.map((cn) => (cn.id === entryId ? { ...cn, projectId } : cn)) });
    }
  };

  // Авто-переход этапа проекта (Этап 3b) — ТОЛЬКО ВПЕРЁД и не дальше «В
  // работе»: создана будущая сессия → «Записан», сессия выполнена → «В
  // работе». Никогда не откатывает назад (не трогает, если этап уже на
  // целевом или дальше), «Заживление»/«Завершён» мастер ставит сама. Пишет
  // в стор проектов (saveProject), сессий/клиента не касается — календарь не
  // задет.
  const advanceProjectStage = (projectId: string | null, target: ProjectStage) => {
    if (!projectId) return;
    const p = getProjectById(projects, projectId);
    if (!p) return;
    const cur = PROJECT_STAGES.findIndex((s) => s.key === p.stage);
    const tgt = PROJECT_STAGES.findIndex((s) => s.key === target);
    if (tgt < 0 || tgt <= cur) return;
    saveProject({ ...p, stage: target });
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
    const s = selectedClient.sessions.find((x) => x.id === sessionId);
    saveClient({
      ...selectedClient,
      sessions: selectedClient.sessions.map((x) => (x.id === sessionId ? { ...x, done: !x.done } : x)),
    });
    // Отметили «выполнена» (было не выполнено) → двигаем проект в «В работе».
    if (s && !s.done) advanceProjectStage(s.projectId, 'in_progress');
  };

  // clientId-scoped variant of the toggle above — for the «Отменить» quick
  // action fired from the Задачи/Мастер screens' «Напоминания» section,
  // which acts on overdue entries across every client, not just whichever
  // one happens to be open (selectedClient may well be null there).
  // Overdue reminder's «Отменить» — this planned entry won't happen and
  // won't be rescheduled, distinct from done. Drops out of upcoming/overdue
  // everywhere; stays visible in the timeline tagged «Отменена».
  const markEntryCancelled = (clientId: string, itemId: string, kind: 'session' | 'consultation') => {
    const c = clients.find((x) => x.id === clientId);
    if (!c) return;
    if (kind === 'session') {
      saveClient({ ...c, sessions: c.sessions.map((s) => (s.id === itemId ? { ...s, cancelled: true } : s)) });
    } else {
      saveClient({ ...c, consultations: c.consultations.map((cn) => (cn.id === itemId ? { ...cn, cancelled: true } : cn)) });
    }
  };

  // Shared navigation: land on the client's own card and pop the edit form
  // open for that session/consultation — used both by the Мастер dashboard's
  // upcoming list and the reminder quick-actions (reschedule an overdue entry,
  // or jump into a session to tick «Зажив» once a healed photo's in).
  const openEntryForEdit = (clientId: string, itemId: string, kind: 'session' | 'consultation') => {
    const client = clients.find((c) => c.id === clientId);
    if (!client) return;
    setSelectedId(client.id);
    setScreen('detail');
    if (kind === 'consultation') {
      const consultation = client.consultations.find((c) => c.id === itemId);
      if (!consultation) return;
      setActiveTab('consultations');
      setEditConsultation(consultation);
      setShowNewConsultationForm(true);
      return;
    }
    const session = client.sessions.find((s) => s.id === itemId);
    if (!session) return;
    setActiveTab('sessions');
    setEditSession(session);
    setShowNewSessionForm(true);
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
      language: 'ru',
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
    healed: boolean;
    projectId: string | null;
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
      healed: data.healed,
      projectId: data.projectId,
    };
    let sessions: Session[];
    if (editSession) {
      // Update the existing session in place, keeping its id (status can now
      // change between planned and done via the form).
      sessions = selectedClient.sessions.map((s) =>
        s.id === editSession.id ? { ...s, ...fields } : s,
      );
    } else {
      sessions = [...selectedClient.sessions, { id: Date.now().toString(), cancelled: false, ...fields }];
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
    // Авто-переход этапа проекта (Этап 3b): выполненная сессия → «В работе»,
    // запланированная (ещё не выполнена) → «Записан». Только вперёд.
    advanceProjectStage(fields.projectId, fields.done ? 'in_progress' : 'booked');
    setShowNewSessionForm(false);
    setEditSession(null);
    setCalendarCreateDate(null);
    setCalendarEventKind(null);
    setPresetEntryProjectId(null);
  };

  const sheetOpen =
    showNewClientForm ||
    showNewSessionForm ||
    showEditClientForm ||
    showNewConsultationForm ||
    showAddChoice ||
    showWorkshopCreateChoice ||
    showProjectSessionPicker ||
    showNewProjectForm ||
    !!viewEntry ||
    showCalendar ||
    !!calendarWalkStep;

  // Просмотр проекта — единственная шторка, поверх которой остаётся видна
  // главная кнопка «Создать»: она же и есть точка входа для «+ Сессия» /
  // «+ Консультация» в открытом проекте (см. onCreate у NavFab ниже), так
  // что отдельных кнопок создания внутри самого просмотра не нужно.
  const navFabHidden = sheetOpen && !viewProject;

  // Resolve the entry being viewed to its latest stored copy (so an edit made
  // from the viewer is reflected if it reopens).
  const viewClient = viewEntry ? clients.find((c) => c.id === viewEntry.clientId) ?? null : null;
  const viewedSession = viewEntry?.kind === 'session' ? viewClient?.sessions.find((s) => s.id === viewEntry.id) ?? null : null;
  const viewedConsultation = viewEntry?.kind === 'consultation' ? viewClient?.consultations.find((c) => c.id === viewEntry.id) ?? null : null;

  // Reminders (see RemindersSection), minus whatever the master has closed —
  // computed once and shared by the toolbar badge, «Задачи», and «Мастер».
  // Один снимок времени на все четыре ленты — раньше каждая читала часы сама
  // (todayISO()/Date.now()); поведение то же, но теперь оно детерминировано.
  const remindersNow = new Date();
  const visibleOverdue = filterVisibleReminders(overdueEntries(clients, remindersNow), overdueReminderKey, reminderState, remindersNow);
  const visibleHealing = filterVisibleReminders(healingReminders(clients, remindersNow), healingReminderKey, reminderState, remindersNow);
  const visibleSoon = filterVisibleReminders(upcomingSoonReminders(clients, remindersNow), soonReminderKey, reminderState, remindersNow);
  // Проекты с просроченным «следующим шагом» (Этап 3b) — в те же напоминания.
  const visibleDueProjects = filterVisibleReminders(overdueProjects(projects, remindersNow), projectReminderKey, reminderState, remindersNow);

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
      {/* Shared sky — one instance behind every screen instead of a copy per
          screen. Screens used to each mount their own StarfieldBackground/
          CloudsBackground/AviationBackground (plus this dot-grid), which
          meant up to two full sets animating at once (List's, which is
          never unmounted, plus whichever other screen was open) — real GPU
          load and battery/heat cost on a phone for a purely decorative
          layer. A single fixed copy behind the sliding screens looks
          identical (the content was never screen-specific) at half the
          animation cost. */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 0, background: COLORS.bg }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: 'radial-gradient(circle, rgba(var(--gold-rgb),0.035) 1px, transparent 1px)',
            backgroundSize: '22px 22px',
            pointerEvents: 'none',
          }}
        />
        <StarfieldBackground />
        <CloudsBackground />
        <AviationBackground />
      </div>

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
        }}
      >

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
          {/* Below the divider, right-aligned under the pinned calendar tag
              (which floats above, at the logo's height) — this row scrolls
              away with the header; the calendar tag stays fixed on screen
              (see the sibling-of-screens render below). */}
          <div style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
              {/* ── Поиск ── */}
              <div style={{ position: 'relative' }}>
                <div
                  onClick={() => {
                    setSearchOpen((v) => !v);
                    setSortOpen(false);
                    setFiltersOpen(false);
                  }}
                  role="button"
                  aria-label={searchOpen ? 'Скрыть поиск' : 'Поиск'}
                  title="Поиск"
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    border: searchOpen || searchQuery ? '1px solid rgba(var(--gold-rgb),0.6)' : '1px solid rgba(var(--gold-rgb),0.15)',
                    background: searchOpen || searchQuery ? 'rgba(var(--gold-rgb),0.08)' : 'rgba(var(--surface-rgb),0.022)',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 13 13" fill="none" style={{ color: searchOpen || searchQuery ? COLORS.gold : COLORS.textFaint }}>
                    <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.2" />
                    <line x1="8.7" y1="8.7" x2="12" y2="12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                </div>
                {searchOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 6px)',
                      right: 0,
                      width: 220,
                      maxWidth: 'calc(100vw - 40px)',
                      background: COLORS.sheet,
                      border: '1px solid rgba(var(--gold-rgb),0.2)',
                      borderRadius: 4,
                      padding: '8px 12px',
                      boxShadow: '0 10px 28px rgba(0,0,0,0.4)',
                      zIndex: 17,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ flexShrink: 0, color: 'var(--ink-faint)' }}>
                      <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.2" />
                      <line x1="8.7" y1="8.7" x2="12" y2="12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                    </svg>
                    <input
                      autoFocus
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
                )}
              </div>

              {/* ── Фильтры (цвет-маркер + тип клиента) ── */}
              <div style={{ position: 'relative' }}>
                <div
                  onClick={() => {
                    setFiltersOpen((v) => !v);
                    setSortOpen(false);
                    setSearchOpen(false);
                  }}
                  role="button"
                  aria-label={filtersOpen ? 'Скрыть фильтры' : 'Фильтры'}
                  title="Фильтры"
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    border: filtersActive || filtersOpen ? '1px solid rgba(var(--gold-rgb),0.6)' : '1px solid rgba(var(--gold-rgb),0.15)',
                    background: filtersActive || filtersOpen ? 'rgba(var(--gold-rgb),0.08)' : 'rgba(var(--surface-rgb),0.022)',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ color: filtersActive || filtersOpen ? COLORS.gold : COLORS.textFaint }}>
                    <path d="M2 3.5h12l-4.7 5.3V13l-2.6-1.5V8.8L2 3.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                  </svg>
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

              {/* ── Сортировка ── */}
              <div style={{ position: 'relative' }}>
                <div
                  onClick={() => {
                    setSortOpen((v) => !v);
                    setFiltersOpen(false);
                    setSearchOpen(false);
                  }}
                  role="button"
                  aria-label={sortOpen ? 'Скрыть сортировку' : 'Сортировка'}
                  title="Сортировка"
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    border: sortOpen ? '1px solid rgba(var(--gold-rgb),0.6)' : '1px solid rgba(var(--gold-rgb),0.15)',
                    background: sortOpen ? 'rgba(var(--gold-rgb),0.08)' : 'rgba(var(--surface-rgb),0.022)',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ color: sortOpen ? COLORS.gold : COLORS.textFaint }}>
                    <line x1="2.5" y1="4" x2="11" y2="4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    <line x1="2.5" y1="8" x2="8.5" y2="8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    <line x1="2.5" y1="12" x2="6" y2="12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                </div>
                {sortOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 6px)',
                      right: 0,
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
            </div>
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
            padding: '2px 16px calc(env(safe-area-inset-bottom, 0px) + 84px)',
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
            Пока нет клиентов — нажмите «$» внизу, чтобы добавить первого
          </div>
        )}
      </div>

      {/* Navigation — sibling of the screens so it pins to the shell bottom
          (never scrolls). Shown on every main screen, including the client
          Detail screen, hidden while a bottom sheet is open so it can't sit
          over the sheet's controls — EXCEPT the project viewer, which stays
          underneath it on purpose: «Создать» is the only entry point for
          adding a session/consultation to the open project (see onCreate
          below), so the main button has to stay reachable over it. */}
      {(screen === 'list' || screen === 'settings' || screen === 'summary' || screen === 'master' || screen === 'admin' || screen === 'detail' || screen === 'workshop' || screen === 'content') && !navFabHidden && (
        <NavFab
          active={screen}
          onNavigate={(s) => setScreen(s)}
          adminBadges={[
            ...(visibleOverdue.length > 0 ? (['urgent'] as const) : []),
            ...(visibleHealing.length > 0 || visibleSoon.length > 0 || visibleDueProjects.length > 0 ? (['reminder'] as const) : []),
          ]}
          // Contextual create — same action each screen's own «+» used to
          // trigger, now all reachable from one place. Мастер has none.
          // Открытый просмотр проекта (viewProject) переопределяет экранную
          // логику — «Создать» тут же заводит сессию/консультацию именно
          // для этого проекта, а не то, что обычно делает текущий screen.
          onCreate={
            viewProject
              ? () => {
                  if (viewProject.clientId) {
                    const client = clients.find((c) => c.id === viewProject.clientId);
                    if (!client) return;
                    setViewProject(null);
                    setSelectedId(client.id);
                    setPresetEntryProjectId(viewProject.id);
                    setShowAddChoice(true);
                  } else {
                    setViewProject(null);
                    setEditSession(null);
                    setSessionTargetProjectId(viewProject.id);
                    setShowNewSessionForm(true);
                  }
                }
              : screen === 'list' || screen === 'settings'
              ? () => runGated(clients.length === 0, () => setShowNewClientForm(true))
              : screen === 'summary'
                ? () => setShowSummaryComposer(true)
                : screen === 'admin'
                  ? () => setShowCalendar(true)
                  : screen === 'detail' && selectedClient
                    ? () => setShowAddChoice(true)
                    : screen === 'workshop'
                      ? () => setShowWorkshopCreateChoice(true)
                      : undefined
          }
        />
      )}

      {/* Upcoming-date tag — pinned next to the logo (sibling of the screens,
          so it never scrolls away with the client grid underneath). Shown on
          every main screen except Мастер (the master's own profile has no
          use for it). Create-client moved to the nav FAB's contextual create
          action — see NavFab / onCreate below. Сортировка/Фильтры/Поиск, by
          contrast, now live inside the List header itself and scroll away
          with it — see the header render below. */}
      {(screen === 'list' || screen === 'settings' || screen === 'summary' || screen === 'admin') && !sheetOpen && (
        <div style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top) + 31px)', right: 20, zIndex: 20 }}>
          <UpcomingDateBadge clients={clients} onOpen={() => setShowCalendar(true)} />
        </div>
      )}


      {/* Shared backdrop — closes whichever of Поиск/Фильтры/Сортировка is
          open on an outside tap. */}
      {(sortOpen || filtersOpen || searchOpen) && (
        <div
          onClick={() => {
            setSortOpen(false);
            setFiltersOpen(false);
            setSearchOpen(false);
          }}
          style={{ position: 'fixed', inset: 0, zIndex: 15 }}
        />
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
        }}
      >
        {screen === 'summary' && (
          <SummaryScreen
            clients={clients}
            projects={projects}
            onOpenProject={(project) => setViewProject(project)}
            masterNotes={masterInfo.notes}
            onToggleDone={(clientId, note) => upsertNote(clientId, note)}
            onEditNote={(clientId, note) => upsertNote(clientId, note)}
            onDeleteNote={(clientId, noteId) => deleteNote(clientId, noteId)}
            onOpenClient={(id) => {
              setSelectedId(id);
              setActiveTab('extra');
              setScreen('detail');
            }}
            onOpenConsultation={(clientId, consultationId) => {
              // Tap opens the read-only fullscreen viewer (not the edit form).
              setViewEntry({ kind: 'consultation', clientId, id: consultationId });
            }}
            onOpenSession={(clientId, sessionId) => setViewEntry({ kind: 'session', clientId, id: sessionId })}
            onAddMasterNote={(text, urgency, photos) =>
              setMasterInfo({
                ...masterInfo,
                notes: [
                  ...masterInfo.notes,
                  { id: Date.now().toString(), text, urgency, done: false, createdDate: new Date().toISOString(), photos, projectId: null },
                ],
              })
            }
            onToggleMasterDone={(note) => setMasterInfo({ ...masterInfo, notes: masterInfo.notes.map((n) => (n.id === note.id ? note : n)) })}
            onEditMasterNote={(note) => setMasterInfo({ ...masterInfo, notes: masterInfo.notes.map((n) => (n.id === note.id ? note : n)) })}
            onDeleteMasterNote={(noteId) => setMasterInfo({ ...masterInfo, notes: masterInfo.notes.filter((n) => n.id !== noteId) })}
            showComposer={showSummaryComposer}
            onShowComposerChange={setShowSummaryComposer}
            filter={summaryFilter}
            onFilterChange={setSummaryFilter}
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
        }}
      >
        {screen === 'master' && (
          <MasterDashboardScreen
            clients={clients}
            masterInfo={masterInfo}
            onChangeMasterInfo={setMasterInfo}
            onOpenSettings={() => setScreen('settings')}
            calendarSync={calendarSync}
            onChangeCalendarSync={setCalendarSync}
            contentSync={contentSync}
            onChangeContentSync={setContentSync}
            onOpenContent={() => setScreen('content')}
          />
        )}
      </div>

      {/* ═══════════ CONTENTINKA ═══════════ */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: screen === 'content' ? 'translateX(0)' : 'translateX(110%)',
          transition: 'transform 0.45s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
          overflowY: 'auto',
          overflowX: 'hidden',
          zIndex: 3,
        }}
      >
        {screen === 'content' && (
          <ContentINKAScreen
            clients={clients}
            contentEntries={contentEntries}
            onSaveEntry={saveContentEntry}
            onDeleteEntry={deleteContentEntry}
          />
        )}
      </div>

      {/* ═══════════ ADMIN DASHBOARD ═══════════ */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: screen === 'admin' ? 'translateX(0)' : 'translateX(110%)',
          transition: 'transform 0.45s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
          overflowY: 'auto',
          overflowX: 'hidden',
          zIndex: 3,
        }}
      >
        {screen === 'admin' && (
          <AdminDashboardScreen
            clients={clients}
            masterNotes={masterInfo.notes}
            prefs={prefs}
            onChangePrefs={setPrefs}
            onOpenSession={openEntryForEdit}
            onImport={replaceAllData}
            projects={projects}
            contentEntries={contentEntries}
            calendarSync={calendarSync}
            overdue={visibleOverdue}
            healing={visibleHealing}
            soon={visibleSoon}
            dueProjects={visibleDueProjects}
            onOpenProject={(project) => setViewProject(project)}
            onOpenEntry={openEntryForEdit}
            onDismissReminder={handleDismissReminder}
            onSnoozeReminder={handleSnoozeReminder}
            onCancelEntry={markEntryCancelled}
            onOpenNotes={(urgency) => {
              setSummaryFilter(urgency);
              setScreen('summary');
            }}
            onMigrateRecords={migrateRecordsIntoProjects}
          />
        )}
      </div>

      {/* ═══════════ ТВОРЧЕСКАЯ МАСТЕРСКАЯ ═══════════ */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: screen === 'workshop' ? 'translateX(0)' : 'translateX(110%)',
          transition: 'transform 0.45s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
          overflowY: 'auto',
          overflowX: 'hidden',
          zIndex: 3,
        }}
      >
        {screen === 'workshop' && (
          <WorkshopScreen
            projects={projects}
            projectsLoaded={projectsLoaded}
            clients={clients}
            onOpenProject={(project) => setViewProject(project)}
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
        }}
      >
        {screen === 'settings' && (
          <SettingsScreen
            theme={theme}
            onToggleTheme={toggleTheme}
            prefs={prefs}
            onChange={setPrefs}
            onBack={() => setScreen('master')}
          />
        )}
      </div>

      {/* ═══════════ DETAIL SCREEN ═══════════ */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: screen === 'detail' ? 'translateX(0)' : 'translateX(110%)',
          transition: 'transform 0.45s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
          overflow: 'hidden',
          zIndex: 3,
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
            onEditSession={(session) => { setEditSession(session); setShowNewSessionForm(true); }}
            onDeleteSession={deleteSession}
            onUpdateSessionPhotos={updateSessionPhotos}
            onToggleSessionDone={toggleSessionDone}
            onEditConsultation={(consultation) => { setEditConsultation(consultation); setShowNewConsultationForm(true); }}
            onDeleteConsultation={deleteConsultation}
            onViewSession={(session) => setViewEntry({ kind: 'session', clientId: selectedClient.id, id: session.id })}
            onViewConsultation={(consultation) => setViewEntry({ kind: 'consultation', clientId: selectedClient.id, id: consultation.id })}
            onAddDocument={(doc) => saveClient({ ...selectedClient, documents: [...selectedClient.documents, doc] })}
            onRemoveDocument={(docId) =>
              saveClient({ ...selectedClient, documents: selectedClient.documents.filter((d) => d.id !== docId) })
            }
            projects={projects}
            onOpenProject={(project) => setViewProject(project)}
            onCreateProject={() => {
              setEditProject(null);
              setNewProjectClientId(selectedClient.id);
              setShowNewProjectForm(true);
            }}
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
                projectId: null,
              })
            }
            onDeleteNote={(noteId) => deleteNote(selectedClient.id, noteId)}
            onImportClients={importClients}
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
      {/* The game for a new session already ran when the choice was made in
          AddChoiceSheet below — so submitting here just saves it. */}
      <NewSessionSheet
        open={showNewSessionForm}
        clientName={
          sessionTargetProjectId
            ? getProjectById(projects, sessionTargetProjectId)?.title || 'Проект'
            : selectedClient?.name || ''
        }
        clientProjects={
          sessionTargetProjectId
            ? projects.filter((p) => p.id === sessionTargetProjectId)
            : selectedClient
            ? getProjectsByClientId(projects, selectedClient.id)
            : []
        }
        presetProjectId={sessionTargetProjectId ?? presetEntryProjectId}
        initial={editSession}
        initialDate={calendarCreateDate ?? undefined}
        onClose={closeNewSession}
        onAdd={(data) => {
          if (sessionTargetProjectId) {
            handleAddProjectSession(sessionTargetProjectId, data);
            closeNewSession();
          } else {
            handleAddSession(data);
          }
        }}
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

      {/* ═══════════ МАСТЕРСКАЯ: «СОЗДАТЬ» → проект / сессия без клиента ═══════════ */}
      <WorkshopCreateChoiceSheet
        open={showWorkshopCreateChoice}
        onClose={() => setShowWorkshopCreateChoice(false)}
        onPickProject={() => {
          setShowWorkshopCreateChoice(false);
          setEditProject(null);
          setNewProjectClientId(null);
          setShowNewProjectForm(true);
        }}
        onPickSession={() => {
          setShowWorkshopCreateChoice(false);
          setShowProjectSessionPicker(true);
        }}
      />
      <ProjectSessionPickerSheet
        open={showProjectSessionPicker}
        projects={projects}
        onClose={() => setShowProjectSessionPicker(false)}
        onPick={(project) => {
          setShowProjectSessionPicker(false);
          setEditSession(null);
          setSessionTargetProjectId(project.id);
          setShowNewSessionForm(true);
        }}
        onCreateProject={() => {
          setShowProjectSessionPicker(false);
          setEditProject(null);
          setNewProjectClientId(null);
          setShowNewProjectForm(true);
        }}
      />

      {/* ═══════════ NEW / EDIT CONSULTATION SHEET ═══════════ */}
      <NewConsultationSheet
        open={showNewConsultationForm}
        clientName={selectedClient?.name || ''}
        client={selectedClient}
        clientProjects={selectedClient ? getProjectsByClientId(projects, selectedClient.id) : []}
        presetProjectId={presetEntryProjectId}
        initial={editConsultation}
        initialDate={calendarCreateDate ?? undefined}
        onClose={closeNewConsultation}
        onAdd={handleAddConsultation}
      />

      {/* ═══════════ NEW / EDIT PROJECT SHEET (Творческая мастерская) ═══════════ */}
      <NewProjectSheet
        open={showNewProjectForm}
        initial={editProject}
        presetClientId={newProjectClientId}
        clients={clients}
        onClose={() => {
          setShowNewProjectForm(false);
          setEditProject(null);
          setNewProjectClientId(null);
        }}
        onAdd={handleAddProject}
        onDelete={editProject ? () => deleteProject(editProject.id) : undefined}
      />

      {/* ═══════════ PROJECT VIEW (read-only) ═══════════ */}
      <ProjectViewSheet
        open={!!viewProject}
        project={viewProject ? getProjectById(projects, viewProject.id) ?? viewProject : null}
        clients={clients}
        masterNotes={masterInfo.notes}
        onClose={() => setViewProject(null)}
        onEdit={(project) => {
          setViewProject(null);
          setEditProject(project);
          setShowNewProjectForm(true);
        }}
        onOpenEntry={(clientId, kind, id) => {
          setViewProject(null);
          setViewEntry({ kind, clientId, id });
        }}
        onEditProjectSession={(projectId, session) => {
          setViewProject(null);
          setEditSession(session);
          setSessionTargetProjectId(projectId);
          setShowNewSessionForm(true);
        }}
        onToggleTaskDone={(clientId, note) => {
          if (clientId) {
            upsertNote(clientId, { ...note, done: !note.done });
          } else {
            setMasterInfo({ ...masterInfo, notes: masterInfo.notes.map((n) => (n.id === note.id ? { ...n, done: !n.done } : n)) });
          }
        }}
      />

      {/* ═══════════ TIMELINE VIEWER (read-only consultation / session) ═══════════ */}
      <TimelineViewSheet
        open={!!viewEntry && (!!viewedSession || !!viewedConsultation)}
        session={viewedSession}
        consultation={viewedConsultation}
        clientId={viewClient?.id ?? null}
        clientName={viewClient ? `${viewClient.name} ${viewClient.surname}`.trim() : ''}
        clientProjects={viewClient ? getProjectsByClientId(projects, viewClient.id) : []}
        contentEntries={contentEntries}
        onClose={() => setViewEntry(null)}
        onEdit={() => {
          if (viewEntry) setSelectedId(viewEntry.clientId);
          if (viewedConsultation) {
            setEditConsultation(viewedConsultation);
            setShowNewConsultationForm(true);
          } else if (viewedSession) {
            setEditSession(viewedSession);
            setShowNewSessionForm(true);
          }
          setViewEntry(null);
        }}
        onReassignProject={(projectId) => {
          if (viewEntry) reassignEntryProject(viewEntry.clientId, viewEntry.kind, viewEntry.id, projectId);
        }}
        onSaveContentEntry={saveContentEntry}
        onDeleteContentEntry={deleteContentEntry}
      />

      {/* ═══════════ CALENDAR (month view, opened from «Ближайшая») ═══════════ */}
      <CalendarSheet
        open={showCalendar}
        onClose={() => setShowCalendar(false)}
        clients={clients}
        initialDate={upcomingItems(clients, 365)[0]?.date ?? todayISO()}
        calendarSync={calendarSync}
        onOpenEntry={(kind, clientId, id) => {
          setShowCalendar(false);
          setViewEntry({ kind, clientId, id });
        }}
        onCreateEvent={(date) => {
          setShowCalendar(false);
          setCalendarCreateDate(date);
          setCalendarWalkStep('kind');
        }}
      />

      {/* ═══════════ CALENDAR-DRIVEN CREATION WALK ═══════════ */}
      {/* Сессия/Консультация → Новый/Существующий клиент → (поиск или мини-
          карточка) → сама форма сессии/консультации, с датой из календаря.
          Only one of these four is ever open — `calendarWalkStep` is a
          single value, so the sheets are mutually exclusive by construction. */}
      <AddChoiceSheet
        open={calendarWalkStep === 'kind'}
        onClose={cancelCalendarWalk}
        onPickSession={() => {
          setCalendarEventKind('session');
          setCalendarWalkStep('clientKind');
        }}
        onPickConsultation={() => {
          setCalendarEventKind('consultation');
          setCalendarWalkStep('clientKind');
        }}
      />
      <ClientKindChoiceSheet
        open={calendarWalkStep === 'clientKind'}
        onClose={cancelCalendarWalk}
        onPickExisting={() => setCalendarWalkStep('clientPicker')}
        onPickNew={() => runGated(clients.length === 0, () => setCalendarWalkStep('quickClient'))}
      />
      <ClientPickerSheet
        open={calendarWalkStep === 'clientPicker'}
        onClose={cancelCalendarWalk}
        clients={clients}
        onPick={(clientId) => {
          setSelectedId(clientId);
          setCalendarWalkStep(null);
          openPendingCalendarEvent();
        }}
      />
      <QuickClientSheet
        open={calendarWalkStep === 'quickClient'}
        onClose={cancelCalendarWalk}
        onCreate={handleQuickCreateClient}
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
          forceKind={rpsChallenge.forceRps ? 'rps' : undefined}
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
  forceKind,
}: {
  onWin: () => void;
  onCancel: () => void;
  // Fired once the gate is settled, distinguishing a genuine win from a
  // pass-through after 3 losses — onWin alone can't tell them apart since it
  // fires (eventually) either way to unblock whatever action is gated.
  onOutcome?: (result: 'win' | 'lossStreak') => void;
  // Skips the random pick and always plays this game — used for the
  // mandatory first-client gate, which should always be the simplest game
  // (rock-paper-scissors) rather than risk cups or Black Jack on a first go.
  forceKind?: TrialGameKind;
}) {
  // Weighted pick — RPS shows up often, cups a bit less, Black Jack rarest.
  const [gameKind] = useState<TrialGameKind>(() => {
    if (forceKind) return forceKind;
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
        height: 2,
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
        width: 2,
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
function GemCorner({ color, size = 19 }: { color: string; size?: number }) {
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
// just always gold instead of the per-client marker colour, and mirrored to
// the bottom-left (rather than the client card's top-right) so Админка's
// frames read as their own thing. Used to frame boxes on the master
// dashboard so they read as one family with the cards.
function GoldBottomStripe() {
  return (
    <div
      className="inka-stripe"
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 2,
        zIndex: 6,
        pointerEvents: 'none',
        background: 'linear-gradient(90deg, var(--gold) 0%, #f6e8c4 48%, var(--gold) 100%)',
        boxShadow: '0 -1px 2px rgba(var(--gold-rgb),0.4)',
      }}
    />
  );
}
function GoldLeftStripe() {
  return (
    <div
      className="inka-stripe-right"
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 0,
        width: 2,
        zIndex: 6,
        pointerEvents: 'none',
        background: 'linear-gradient(180deg, var(--gold) 0%, #f6e8c4 48%, var(--gold) 100%)',
        boxShadow: '1px 0 2px rgba(var(--gold-rgb),0.4)',
      }}
    />
  );
}
function GoldGemCorner({ size = 16 }: { size?: number }) {
  return (
    <>
      <div
        style={{
          position: 'absolute',
          bottom: -6,
          left: -6,
          width: size + 20,
          height: size + 20,
          background: 'radial-gradient(circle at bottom left, rgba(var(--gold-rgb),0.45), transparent 66%)',
          filter: 'blur(5px)',
          zIndex: 2,
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          width: size,
          height: size,
          clipPath: 'polygon(0 100%, 100% 100%, 0 0)',
          background: 'linear-gradient(35deg, var(--gold) 0%, rgba(var(--gold-rgb),0.6) 52%, rgba(var(--gold-rgb),0.12) 100%)',
          boxShadow: 'inset -2px 2px 3px rgba(var(--gold-rgb),0.5)',
          zIndex: 3,
          pointerEvents: 'none',
        }}
      />
    </>
  );
}
// Gold reads through the theme's --gold-rgb custom property (so it tracks
// light/dark theme changes); any other accent is a literal hex, tinted via
// hexToRgba instead. Shared by GemCornerBL/BR below.
// Wraps a box in the same stripe+gem-corner+inset-ring frame as a client
// card, all gold. Used throughout the master dashboard — pass `plain` to
// keep just the card surface, no stripes/corner (the Мастер tab's own cards
// go plain; Админка keeps the full frame).
function GoldFrame({ children, style, plain = false }: { children: React.ReactNode; style?: React.CSSProperties; plain?: boolean }) {
  return (
    <div className="inka-static" style={{ position: 'relative', borderRadius: 3, overflow: 'hidden', background: 'rgba(var(--surface-rgb),0.018)', ...(plain ? { boxShadow: 'var(--card-rest-shadow)' } : {}), ...style }}>
      {!plain && (
        <>
          <GoldBottomStripe />
          <GoldLeftStripe />
          <GoldGemCorner />
        </>
      )}
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

// ===================== ТВОРЧЕСКАЯ МАСТЕРСКАЯ =====================
// «Мастерская» — a standalone board of sketch/portfolio ideas, none of them
// tied to a client. Its cover cards are ClientGridCard's own design (colour
// stripes + gem corner + drop-cap title), just built from a Project instead
// of a Client — see ClientGridCard above for the shared decoration helpers
// (TopStripe/RightStripe/GemCorner).
function clientNameFor(clients: Client[], clientId: string | null): string | null {
  if (!clientId) return null;
  const c = clients.find((x) => x.id === clientId);
  return c ? `${c.name} ${c.surname}`.trim() : null;
}

function ProjectCard({ project, clientName, onClick }: { project: Project; clientName: string | null; onClick: () => void }) {
  return (
    <div
      className="inka-card"
      onClick={onClick}
      style={{
        position: 'relative',
        background: 'transparent',
        borderRadius: 3,
        height: 250,
        overflow: 'hidden',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <TopStripe color={project.color} />
      <RightStripe color={project.color} />
      <GemCorner color={project.color} />

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
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, flexShrink: 0, direction: isRTL(project.title) ? 'rtl' : 'ltr' }}>
          <span
            style={{
              fontFamily: DROP_CAP_FONT,
              fontSize: fs(58),
              fontWeight: 600,
              lineHeight: 1.12,
              color: COLORS.gold,
              letterSpacing: '0px',
              flexShrink: 0,
              marginTop: -2,
            }}
          >
            {firstLetter(project.title)}
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
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {nameRest(project.title)}
            </div>
          </div>
        </div>

        <div style={{ height: 1, background: 'linear-gradient(to right, rgba(var(--gold-rgb),0.42), transparent)', margin: '7px 0' }} />

        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {project.generalNotes ? (
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
              {project.generalNotes}
            </div>
          ) : (
            <div style={{ fontSize: fs(15), color: COLORS.textTrace, fontStyle: 'italic' }}>Без заметок</div>
          )}
        </div>

        <div style={{ marginBottom: 6, minWidth: 0 }}>
          <div style={{ fontSize: fs(9.5), color: COLORS.textGhost, letterSpacing: '1.5px', textTransform: 'uppercase' }}>Тип</div>
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
            {PROJECT_CATEGORIES.find((c) => c.key === project.category)?.label ?? 'Другое'}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
          <span
            style={{
              fontSize: fs(10.5),
              color: COLORS.textFaint,
              border: '0.5px solid rgba(var(--gold-rgb),0.3)',
              padding: '2px 7px',
              borderRadius: 1,
              letterSpacing: '0.5px',
            }}
          >
            {PROJECT_STAGES.find((s) => s.key === project.stage)?.label ?? project.stage}
          </span>
          {clientName && (
            <span style={{ fontSize: fs(11), color: COLORS.textSecondary, fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {clientName}
            </span>
          )}
        </div>

        {project.nextActionText && (
          <div style={{ marginBottom: 6, minWidth: 0 }}>
            <div style={{ fontSize: fs(9.5), color: COLORS.textGhost, letterSpacing: '1.5px', textTransform: 'uppercase' }}>Следующий шаг</div>
            <div
              style={{
                fontSize: fs(12),
                color: COLORS.textSecondary,
                marginTop: 2,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {project.nextActionText}
              {project.nextActionDate ? ` · ${project.nextActionDate}` : ''}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {project.style ? (
            <span
              style={{
                fontSize: fs(11),
                color: project.color,
                border: `0.5px solid ${project.color}`,
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
              {project.style}
            </span>
          ) : (
            <span style={{ fontSize: fs(11), color: COLORS.textGhost, fontStyle: 'italic', letterSpacing: '0.5px' }}>—</span>
          )}
        </div>
      </div>
    </div>
  );
}

function WorkshopScreen({
  projects,
  projectsLoaded,
  clients,
  onOpenProject,
}: {
  projects: Project[];
  projectsLoaded: boolean;
  clients: Client[];
  onOpenProject: (project: Project) => void;
}) {
  const [categoryFilter, setCategoryFilter] = useState<'all' | ProjectCategory>('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const filtered = categoryFilter === 'all' ? projects : projects.filter((p) => p.category === categoryFilter);

  return (
    <div style={{ minHeight: '100%' }}>
      <div style={{ height: 'calc(env(safe-area-inset-top) + 18px)' }} />
      {/* zIndex 2 (not 1, like the grid below) — otherwise, at equal
          z-index, the later-in-DOM grid's own stacking context (each card
          establishes one via its hover/press transform) paints over the
          filter dropdown regardless of the dropdown's own z-index. */}
      <div style={{ padding: '6px 24px 12px', position: 'relative', zIndex: 2 }}>
        <InkaLogo height={fs(34)} />
        <div style={{ fontSize: fs(9.66), color: COLORS.textGhost, letterSpacing: `${fs(2.97)}px`, textTransform: 'uppercase', marginTop: 3, fontStyle: 'italic' }}>
          Мастерская
        </div>
        <StarDivider />

        {/* Same funnel-toggle + floating chip panel pattern as the client
            list's «Фильтры» — «Все» plus the same category set used when
            creating a project. */}
        <div style={{ position: 'absolute', top: 2, right: 20 }}>
          <div
            onClick={() => setFilterOpen((v) => !v)}
            role="button"
            aria-label={filterOpen ? 'Скрыть фильтр' : 'Фильтр'}
            title="Фильтр"
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              border: categoryFilter !== 'all' || filterOpen ? '1px solid rgba(var(--gold-rgb),0.6)' : '1px solid rgba(var(--gold-rgb),0.15)',
              background: categoryFilter !== 'all' || filterOpen ? 'rgba(var(--gold-rgb),0.08)' : 'rgba(var(--surface-rgb),0.022)',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ color: categoryFilter !== 'all' || filterOpen ? COLORS.gold : COLORS.textFaint }}>
              <path d="M2 3.5h12l-4.7 5.3V13l-2.6-1.5V8.8L2 3.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
            </svg>
          </div>
          {filterOpen && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 6px)',
                right: 0,
                width: 220,
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
                Тип
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(['all', ...PROJECT_CATEGORIES.map((c) => c.key)] as ('all' | ProjectCategory)[]).map((v) => {
                  const label = v === 'all' ? 'Все' : PROJECT_CATEGORIES.find((c) => c.key === v)?.label;
                  const active = categoryFilter === v;
                  return (
                    <div
                      key={v}
                      onClick={() => setCategoryFilter(v)}
                      style={{
                        fontSize: fs(11),
                        padding: '4px 9px',
                        borderRadius: 2,
                        cursor: 'pointer',
                        border: active ? '1px solid rgba(var(--gold-rgb),0.6)' : '1px solid rgba(var(--gold-rgb),0.15)',
                        background: active ? 'rgba(var(--gold-rgb),0.08)' : 'transparent',
                        color: active ? COLORS.gold : COLORS.textFaint,
                        letterSpacing: '0.4px',
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

      <div
        className="inka-client-grid"
        style={{
          padding: '2px 16px calc(env(safe-area-inset-bottom, 0px) + 84px)',
          display: 'grid',
          gap: 10,
          position: 'relative',
          zIndex: 1,
        }}
      >
        {filtered.map((project) => (
          <ProjectCard key={project.id} project={project} clientName={clientNameFor(clients, project.clientId)} onClick={() => onOpenProject(project)} />
        ))}
      </div>

      {projectsLoaded && projects.length === 0 && (
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
          Пока нет проектов — нажмите «+» внизу, чтобы добавить первый
        </div>
      )}

      {projectsLoaded && projects.length > 0 && filtered.length === 0 && (
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
          Нет проектов с этим типом
        </div>
      )}
    </div>
  );
}

// A single "ability score" style tile for the master dashboard's stat grid —
// bracketed corners and a big centered number, like a tabletop character
// sheet's stat block, but in the app's own gold/dark palette.
function StatBlock({ label, value, big = true, plain = false }: { label: string; value: string | number; big?: boolean; plain?: boolean }) {
  return (
    <GoldFrame plain={plain} style={{ textAlign: 'center', padding: '18px 10px 16px' }}>
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
  a: { label: string; value: string | number; onClick?: () => void };
  b: { label: string; value: string | number; onClick?: () => void };
}) {
  const cell = (item: { label: string; value: string | number; onClick?: () => void }) => (
    <div
      onClick={item.onClick}
      role={item.onClick ? 'button' : undefined}
      aria-label={item.onClick ? item.label : undefined}
      style={{ flex: 1, textAlign: 'center', cursor: item.onClick ? 'pointer' : undefined }}
    >
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

// Copies text to the clipboard, showing a brief «Скопировано» confirmation —
// shared by every healing-reminder card (Задачи + Мастер both render one).
// Copies the auto-message, then opens a small dropdown of the client's
// contacts (phone + chat links) so the master can jump straight to
// whichever app they'll paste it into — same anchored-dropdown pattern as
// the note card's «⋮» actions menu below.
function CopyMessageButton({
  text,
  client,
  onOpenChange,
}: {
  text: string;
  client: Client;
  // Lets the parent SwipeDismissCard raise itself above later siblings while
  // this popover is open — see the `raised` doc comment on SwipeDismissCard.
  onOpenChange?: (open: boolean) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [showContacts, setShowContacts] = useState(false);
  const setContacts = (open: boolean) => {
    setShowContacts(open);
    onOpenChange?.(open);
  };
  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
    setContacts(true);
  };
  const chatLinks = client.chatLinks || [];
  const hasContacts = Boolean(client.phone) || chatLinks.length > 0;
  return (
    <div style={{ position: 'relative', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
      <div
        onClick={copy}
        role="button"
        aria-label="Скопировать сообщение"
        style={{
          fontSize: fs(11),
          color: COLORS.gold,
          border: '1px solid rgba(var(--gold-rgb),0.4)',
          borderRadius: 2,
          padding: '4px 9px',
          letterSpacing: '0.6px',
          textTransform: 'uppercase',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        {copied ? 'Скопировано' : 'Скопировать'}
      </div>
      {showContacts && (
        <>
          <div onClick={() => setContacts(false)} style={{ position: 'fixed', inset: 0, zIndex: 15 }} />
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              right: 0,
              width: 220,
              background: COLORS.sheet,
              border: '1px solid rgba(var(--gold-rgb),0.2)',
              borderRadius: 4,
              padding: 10,
              boxShadow: '0 10px 28px rgba(0,0,0,0.4)',
              zIndex: 17,
            }}
          >
            <div style={{ fontSize: fs(10), color: COLORS.textGhost, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 6 }}>
              Открыть у клиента
            </div>
            {client.phone && (
              <a
                href={`tel:${client.phone.replace(/[^\d+]/g, '')}`}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 2px', fontSize: fs(13), color: COLORS.textPrimary, textDecoration: 'none' }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: COLORS.gold, flexShrink: 0 }} />
                {client.phone}
              </a>
            )}
            {chatLinks.map((link) => (
              <a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 2px', fontSize: fs(13), color: COLORS.textPrimary, textDecoration: 'none' }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: COLORS.gold, flexShrink: 0 }} />
                {PLATFORM_LABELS[link.platform]}
              </a>
            ))}
            {!hasContacts && (
              <div style={{ fontSize: fs(12), color: COLORS.textFaint, fontStyle: 'italic', padding: '4px 2px' }}>
                Нет контактов — добавьте в карточке клиента
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// Shared horizontal-swipe gesture: past SWIPE_THRESHOLD it calls onReveal
// then snaps back to rest — used to REVEAL a delete confirm («Удалить? Да/
// Нет»), never to delete outright, so an accidental swipe can't destroy data
// (unlike the reminder cards' swipe, which is safe to complete immediately
// because nothing is actually deleted there). Reused by every delete-confirm
// spot in the app (sessions/consultations, notes) so swiping to delete is one
// consistent gesture rather than a per-screen reimplementation.
function useSwipeToReveal(onReveal: () => void) {
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startXRef = useRef(0);
  const draggingRef = useRef(false);
  const movedRef = useRef(false);
  const MOVE_THRESHOLD = 8;
  const SWIPE_THRESHOLD = 70;

  const onPointerDown = (e: React.PointerEvent) => {
    startXRef.current = e.clientX;
    draggingRef.current = true;
    movedRef.current = false;
    setDragging(true);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const delta = e.clientX - startXRef.current;
    if (Math.abs(delta) > MOVE_THRESHOLD) movedRef.current = true;
    setDragX(delta);
  };
  const finishDrag = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
    setDragX((x) => {
      if (Math.abs(x) > SWIPE_THRESHOLD) onReveal();
      return 0;
    });
  };
  // Capture phase, so a dragged gesture's trailing click never reaches
  // whatever tap-to-open handler the row itself has.
  const onClickCapture = (e: React.MouseEvent) => {
    if (movedRef.current) {
      e.stopPropagation();
      e.preventDefault();
      movedRef.current = false;
    }
  };

  return {
    // `transition` deliberately omitted — callers compose their own (using
    // `dragging` to suppress it mid-drag) since some rows already animate
    // other properties (e.g. a note's opacity fading on done/undone) and a
    // fixed transition string here would silently clobber theirs.
    swipeStyle: {
      transform: `translateX(${dragX}px)`,
      touchAction: 'pan-y' as const,
    },
    dragging,
    swipeHandlers: { onPointerDown, onPointerMove, onPointerUp: finishDrag, onPointerCancel: finishDrag, onClickCapture },
  };
}

// «Напоминания» — shared by both the Задачи and Мастер screens. Two kinds of
// card: overdue (planned entry whose date has passed while still not marked
// done — reschedule or mark done) and healing check-ins (a done session,
// ≥30 days old, not yet ticked «Зажив» — copy the ready-made message and jump
// to the session to tick it once the healed photo's in). Renders nothing
// when both lists are empty, so callers can drop it in unconditionally.
// A small «×» — closes a reminder card outright (no confirm step; reminders
// are non-destructive, re-derived from live data, so there's nothing to lose
// beyond the card itself, which reappears if the master reopens the app...
// except once dismissed it's meant to stay gone, see dismissedReminders).
function ReminderCloseButton({ onClick }: { onClick: () => void }) {
  return (
    <span
      onClick={onClick}
      role="button"
      aria-label="Скрыть напоминание"
      style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', flexShrink: 0, opacity: 0.55, padding: 2 }}
    >
      <svg width="11" height="11" viewBox="0 0 16 16" fill="none" style={{ color: COLORS.textFaint }}>
        <line x1="3" y1="3" x2="13" y2="13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <line x1="13" y1="3" x2="3" y2="13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    </span>
  );
}

// yyyy-mm-ddThh:mm:ss местного времени начала дня через `days` суток от
// текущего момента — момент, после которого отложенная карточка снова
// показывается (см. snoozeReminder). Начало дня, чтобы «до завтра» означало
// именно завтрашнее утро, а не +24 часа от текущей минуты.
function snoozeShowAfter(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

// Компактное меню карточки напоминания («⋯»): отложить до завтра / на 3 дня /
// скрыть. Заменяет одиночный «×», чтобы не громоздить кнопки на карточке.
// Пункт «скрыть» относится только к текущему reminder-ключу — новое событие
// той же сущности получит другой ключ и покажется снова.
//
// Выпадашка рисуется через position:fixed от координат кнопки — так она не
// обрезается overflow:hidden карточек (например, у просроченной) и не воюет
// за z-index с их собственными stacking-контекстами.
function ReminderMenuButton({
  onSnoozeTomorrow,
  onSnooze3Days,
  onHide,
}: {
  onSnoozeTomorrow: () => void;
  onSnooze3Days: () => void;
  onHide: () => void;
}) {
  const btnRef = useRef<HTMLSpanElement | null>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const openMenu = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, right: Math.max(6, window.innerWidth - r.right) });
  };
  const rowStyle: React.CSSProperties = {
    padding: '9px 14px',
    fontSize: fs(12.5),
    color: COLORS.textPrimary,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    letterSpacing: '0.3px',
  };
  return (
    <span ref={btnRef} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
      <span
        onClick={openMenu}
        role="button"
        aria-label="Действия с напоминанием"
        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', opacity: 0.55, padding: 2 }}
      >
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ color: COLORS.textFaint }}>
          <circle cx="8" cy="3" r="1.4" fill="currentColor" />
          <circle cx="8" cy="8" r="1.4" fill="currentColor" />
          <circle cx="8" cy="13" r="1.4" fill="currentColor" />
        </svg>
      </span>
      {pos && (
        <>
          {/* Клик мимо — закрыть меню. */}
          <div onClick={() => setPos(null)} style={{ position: 'fixed', inset: 0, zIndex: 240 }} />
          <div
            style={{
              position: 'fixed',
              top: pos.top,
              right: pos.right,
              zIndex: 241,
              background: COLORS.bg,
              border: '1px solid rgba(var(--gold-rgb),0.3)',
              borderRadius: 4,
              boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
              overflow: 'hidden',
              minWidth: 176,
            }}
          >
            <div role="button" style={rowStyle} onClick={() => { setPos(null); onSnoozeTomorrow(); }}>
              Отложить до завтра
            </div>
            <div role="button" style={{ ...rowStyle, borderTop: '1px solid rgba(var(--gold-rgb),0.12)' }} onClick={() => { setPos(null); onSnooze3Days(); }}>
              Отложить на 3 дня
            </div>
            <div role="button" style={{ ...rowStyle, borderTop: '1px solid rgba(var(--gold-rgb),0.12)', color: COLORS.textFaint }} onClick={() => { setPos(null); onHide(); }}>
              Скрыть это напоминание
            </div>
          </div>
        </>
      )}
    </span>
  );
}

// Wraps a reminder card so it can be swiped left/right, like a native
// notification. Drags with the finger while held; past the threshold it
// flies the rest of the way out and THEN runs the swipe action — the swipe
// gesture and the card's own «×» can trigger DIFFERENT actions (e.g. an
// overdue reminder's swipe marks it done, while its «×» just hides it),
// which is why the completion action isn't fixed to one prop: swiping calls
// onSwipeComplete, the «×» calls whatever action the render prop is invoked
// with, and both play the same fly-out animation either way.
function SwipeDismissCard({
  onSwipeComplete,
  revealLabel,
  raised,
  children,
}: {
  onSwipeComplete: () => void;
  // Label shown in a strip revealed behind the card as it's dragged,
  // signalling what the swipe will do (e.g. «Выполнено»). Omit for a plain
  // hide with no particular action to announce.
  revealLabel?: string;
  // The card's own `transform` (used for the drag offset, always set — even
  // translateX(0) at rest) creates a CSS stacking context, which traps any
  // z-index inside it: a later sibling card, being its own equally-ranked
  // stacking context, paints over this one regardless of an inner element's
  // z-index. Set `raised` while this card has its own popover open (e.g. the
  // overdue card's snooze menu) so it outranks later siblings for real.
  raised?: boolean;
  children: (flyOutThen: (action: () => void) => void) => React.ReactNode;
}) {
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [flyingOut, setFlyingOut] = useState<'left' | 'right' | null>(null);
  const startXRef = useRef(0);
  const draggingRef = useRef(false);
  // Distinguishes a tap (lets the card's own onClick — open the entry —
  // through) from a real swipe (past this many px, the gesture is a
  // dismiss attempt, not a tap, so the following synthetic «click» the
  // browser fires on pointer-up must be swallowed before it reaches the
  // card's onClick).
  const MOVE_THRESHOLD = 8;
  const movedRef = useRef(false);
  const SWIPE_THRESHOLD = 84;

  const flyOutThen = (action: () => void, direction: 'left' | 'right') => {
    setFlyingOut(direction);
    setTimeout(action, 200);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (flyingOut) return;
    startXRef.current = e.clientX;
    draggingRef.current = true;
    movedRef.current = false;
    setDragging(true);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const delta = e.clientX - startXRef.current;
    if (Math.abs(delta) > MOVE_THRESHOLD) movedRef.current = true;
    setDragX(delta);
  };
  const finishDrag = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
    setDragX((x) => {
      if (Math.abs(x) > SWIPE_THRESHOLD) {
        flyOutThen(onSwipeComplete, x < 0 ? 'left' : 'right');
      }
      return Math.abs(x) > SWIPE_THRESHOLD ? x : 0;
    });
  };
  // Capture phase, so a dragged gesture's trailing click never reaches the
  // card's own onClick (which would otherwise open the entry mid-swipe).
  const onClickCapture = (e: React.MouseEvent) => {
    if (movedRef.current) {
      e.stopPropagation();
      e.preventDefault();
      movedRef.current = false;
    }
  };

  const offset = flyingOut ? (flyingOut === 'left' ? -400 : 400) : dragX;
  return (
    <div style={{ position: 'relative' }}>
      {revealLabel && dragX !== 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 2,
            display: 'flex',
            alignItems: 'center',
            // The strip sits on the side being uncovered — opposite the
            // direction the card is sliding.
            justifyContent: dragX > 0 ? 'flex-start' : 'flex-end',
            padding: '0 16px',
            background: 'rgba(var(--gold-rgb),0.14)',
            color: COLORS.gold,
            fontSize: fs(12),
            letterSpacing: '0.6px',
            textTransform: 'uppercase',
          }}
        >
          {revealLabel}
        </div>
      )}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onClickCapture={onClickCapture}
        style={{
          position: 'relative',
          // z-index only matters here (on the element that actually has the
          // transform) — see the `raised` doc comment above.
          zIndex: raised ? 5 : undefined,
          transform: `translateX(${offset}px)`,
          opacity: flyingOut ? 0 : 1,
          transition: dragging ? 'none' : 'transform 0.2s ease, opacity 0.2s ease',
          touchAction: 'pan-y',
        }}
      >
        {children((action) => flyOutThen(action, 'right'))}
      </div>
    </div>
  );
}

// One overdue reminder card: name/date up top with the close «×», three
// quick actions (Отменить / Закрыть / Перенести) in their own full-width
// row below. No swipe and no tap-to-open on the card body — the only way
// to open the underlying session/consultation is the explicit «Перенести»
// action, so a stray tap on the card can't accidentally navigate away.
function OverdueReminderCard({
  item,
  onReschedule,
  onDismiss,
  onSnooze,
  onCancel,
}: {
  item: OverdueItem;
  onReschedule: () => void;
  onDismiss: () => void;
  onSnooze: (showAfter: string) => void;
  onCancel: () => void;
}) {
  const [dismissing, setDismissing] = useState(false);
  const flyOutThen = (action: () => void) => {
    setDismissing(true);
    setTimeout(action, 200);
  };
  const chipStyle: React.CSSProperties = {
    fontSize: fs(11),
    color: COLORS.textFaint,
    border: '1px solid rgba(var(--gold-rgb),0.2)',
    borderRadius: 2,
    padding: '4px 9px',
    letterSpacing: '0.6px',
    textTransform: 'uppercase',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    flex: '1 1 auto',
    textAlign: 'center',
  };
  return (
    <div
      style={{
        position: 'relative',
        overflow: 'hidden',
        padding: '9px 10px',
        borderRadius: 2,
        border: '1px solid rgba(224,102,90,0.35)',
        background: 'rgba(224,102,90,0.06)',
        opacity: dismissing ? 0 : 1,
        transition: 'opacity 0.2s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: fs(13), color: COLORS.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {item.client.name || '—'}
          </div>
          <div style={{ fontSize: fs(11), color: 'var(--urgent)', marginTop: 2 }}>
            {item.kind === 'session' ? 'Сессия' : 'Консультация'} просрочена · {formatDate(item.date)}
          </div>
        </div>
        <ReminderMenuButton
          onSnoozeTomorrow={() => flyOutThen(() => onSnooze(snoozeShowAfter(1)))}
          onSnooze3Days={() => flyOutThen(() => onSnooze(snoozeShowAfter(3)))}
          onHide={() => flyOutThen(onDismiss)}
        />
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 9 }}>
        <div onClick={onCancel} role="button" aria-label="Отменить" style={chipStyle}>
          Отменить
        </div>
        <div onClick={() => flyOutThen(onDismiss)} role="button" aria-label="Закрыть" style={chipStyle}>
          Закрыть
        </div>
        <div
          onClick={onReschedule}
          role="button"
          aria-label="Перенести"
          style={{ ...chipStyle, color: COLORS.gold, border: '1px solid rgba(var(--gold-rgb),0.4)' }}
        >
          Перенести
        </div>
      </div>
    </div>
  );
}
function RemindersSection({
  overdue,
  healing,
  soon,
  dueProjects,
  onOpenProject,
  onOpenEntry,
  onDismiss,
  onSnooze,
  onCancel,
}: {
  overdue: OverdueItem[];
  healing: HealingItem[];
  soon?: UpcomingSoonItem[];
  dueProjects?: Project[];
  onOpenProject?: (project: Project) => void;
  onOpenEntry: (clientId: string, itemId: string, kind: 'session' | 'consultation') => void;
  onDismiss: (key: string) => void;
  onSnooze: (key: string, showAfter: string) => void;
  onCancel: (clientId: string, itemId: string, kind: 'session' | 'consultation') => void;
}) {
  const soonList = soon ?? [];
  const dueProjectsList = dueProjects ?? [];
  // Which card's CopyMessageButton contacts popover is open, if any — that
  // card gets `raised` so its popover isn't trapped behind a later sibling's
  // own stacking context (see SwipeDismissCard's `raised` doc comment).
  const [raisedKey, setRaisedKey] = useState<string | null>(null);
  if (overdue.length === 0 && healing.length === 0 && soonList.length === 0 && dueProjectsList.length === 0) return null;
  return (
    <div>
      <div style={{ fontSize: fs(11), color: COLORS.textGhost, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 8 }}>
        Напоминания
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {overdue.map((it) => {
          const key = overdueReminderKey(it);
          return (
            <OverdueReminderCard
              key={key}
              item={it}
              onReschedule={() => onOpenEntry(it.client.id, it.id, it.kind)}
              onDismiss={() => onDismiss(key)}
              onSnooze={(showAfter) => onSnooze(key, showAfter)}
              onCancel={() => onCancel(it.client.id, it.id, it.kind)}
            />
          );
        })}
        {healing.map((it) => {
          const key = healingReminderKey(it);
          return (
            <SwipeDismissCard key={key} onSwipeComplete={() => onDismiss(key)} raised={raisedKey === key}>
              {(flyOutThen) => (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  padding: '9px 10px',
                  borderRadius: 2,
                  border: '1px solid rgba(var(--gold-rgb),0.2)',
                  background: 'rgba(var(--surface-rgb),0.018)',
                }}
              >
                <div onClick={() => onOpenEntry(it.client.id, it.sessionId, 'session')} style={{ minWidth: 0, cursor: 'pointer', flex: 1 }}>
                  <div style={{ fontSize: fs(13), color: COLORS.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {it.client.name || '—'}
                  </div>
                  <div style={{ fontSize: fs(11), color: COLORS.textGhost, marginTop: 2 }}>
                    Узнать про заживление · сессия {formatDate(it.date)}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <CopyMessageButton
                    text={healingReminderMessage(it.client)}
                    client={it.client}
                    onOpenChange={(open) => setRaisedKey(open ? key : null)}
                  />
                  <ReminderMenuButton
                    onSnoozeTomorrow={() => flyOutThen(() => onSnooze(key, snoozeShowAfter(1)))}
                    onSnooze3Days={() => flyOutThen(() => onSnooze(key, snoozeShowAfter(3)))}
                    onHide={() => flyOutThen(() => onDismiss(key))}
                  />
                </div>
              </div>
              )}
            </SwipeDismissCard>
          );
        })}
        {soonList.map((it) => {
          const key = soonReminderKey(it);
          return (
            <SwipeDismissCard key={key} onSwipeComplete={() => onDismiss(key)} raised={raisedKey === key}>
              {(flyOutThen) => (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  padding: '9px 10px',
                  borderRadius: 2,
                  border: '1px solid rgba(var(--gold-rgb),0.2)',
                  background: 'rgba(var(--surface-rgb),0.018)',
                }}
              >
                <div onClick={() => onOpenEntry(it.client.id, it.id, it.kind)} style={{ minWidth: 0, cursor: 'pointer', flex: 1 }}>
                  <div style={{ fontSize: fs(13), color: COLORS.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {it.client.name || '—'}
                  </div>
                  <div style={{ fontSize: fs(11), color: COLORS.gold, marginTop: 2 }}>
                    Скоро: {it.kind === 'session' ? 'сессия' : 'консультация'} · {formatDate(it.date)}
                    {it.time && ` · ${it.time}`}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <CopyMessageButton
                    text={soonReminderMessage(it)}
                    client={it.client}
                    onOpenChange={(open) => setRaisedKey(open ? key : null)}
                  />
                  <ReminderMenuButton
                    onSnoozeTomorrow={() => flyOutThen(() => onSnooze(key, snoozeShowAfter(1)))}
                    onSnooze3Days={() => flyOutThen(() => onSnooze(key, snoozeShowAfter(3)))}
                    onHide={() => flyOutThen(() => onDismiss(key))}
                  />
                </div>
              </div>
              )}
            </SwipeDismissCard>
          );
        })}
        {dueProjectsList.map((p) => {
          const key = projectReminderKey(p);
          return (
            <SwipeDismissCard key={key} onSwipeComplete={() => onDismiss(key)} raised={raisedKey === key}>
              {(flyOutThen) => (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    padding: '9px 10px',
                    borderRadius: 2,
                    border: '1px solid rgba(var(--gold-rgb),0.2)',
                    background: 'rgba(var(--surface-rgb),0.018)',
                  }}
                >
                  <div onClick={() => onOpenProject?.(p)} style={{ minWidth: 0, cursor: 'pointer', flex: 1 }}>
                    <div style={{ fontSize: fs(13), color: COLORS.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {p.title || 'Проект'}
                    </div>
                    <div style={{ fontSize: fs(11), color: COLORS.gold, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      Следующий шаг: {p.nextActionText || '—'}
                      {p.nextActionDate ? ` · ${formatDate(p.nextActionDate)}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <ReminderMenuButton
                      onSnoozeTomorrow={() => flyOutThen(() => onSnooze(key, snoozeShowAfter(1)))}
                      onSnooze3Days={() => flyOutThen(() => onSnooze(key, snoozeShowAfter(3)))}
                      onHide={() => flyOutThen(() => onDismiss(key))}
                    />
                  </div>
                </div>
              )}
            </SwipeDismissCard>
          );
        })}
      </div>
    </div>
  );
}

// Shares a JSON payload via the native share sheet if the device has one
// (files, not just text, so it can be AirDropped/sent as an attachment),
// falling back to a plain browser download otherwise — shared by the full
// backup export (Админка) and the single-client export (Инфо tab).
async function shareOrDownloadJSON(json: string, filename: string, shareTitle: string): Promise<void> {
  const file = new File([json], filename, { type: 'application/json' });
  const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean };
  if (nav.canShare && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: shareTitle });
      return;
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return;
    }
  }
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function dataUrlToFile(dataUrl: string, filename: string): File {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
  const mime = m?.[1] ?? 'image/jpeg';
  const bytes = atob(m?.[2] ?? '');
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new File([arr], filename, { type: mime });
}

// «Поделиться» готовым материалом — системный шеринг телефона (как в
// CapCut/Фото): передаём фото+текст, дальше пользователь сам выбирает
// приложение (Instagram/TikTok/что угодно) в системном меню, оно уже само
// открывается с этим контентом на экране редактирования. Мы не выбираем
// конкретное приложение — этим управляет ОС.
async function shareContentEntry(photos: string[], text: string): Promise<void> {
  const files = photos.map((p, i) => dataUrlToFile(p, `content-${i}.jpg`));
  const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean };
  if (files.length > 0 && nav.canShare && nav.canShare({ files })) {
    try {
      await nav.share({ files, text });
      return;
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return;
    }
  }
  // Нет фото или платформа не поддерживает шеринг файлов — делимся хотя бы
  // текстом (или копируем в буфер, если и это недоступно).
  if (nav.share) {
    try {
      await nav.share({ text });
      return;
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return;
    }
  }
  await navigator.clipboard?.writeText(text);
}

// ===================== ADMIN DASHBOARD =====================
// The control panel: every reminder, the upcoming-sessions lookahead, the
// client/session/consultation stats (minus «Частый стиль», which stays a
// personal Мастер stat), scheduling, and backup — everything that's about
// running the practice rather than the master's own profile.
function AdminDashboardScreen({
  clients,
  masterNotes,
  prefs,
  onChangePrefs,
  onOpenSession,
  onImport,
  projects,
  contentEntries,
  overdue,
  healing,
  soon,
  dueProjects,
  onOpenProject,
  onOpenEntry,
  onDismissReminder,
  onSnoozeReminder,
  onCancelEntry,
  calendarSync,
  onOpenNotes,
  onMigrateRecords,
}: {
  clients: Client[];
  masterNotes: ClientNote[];
  prefs: Prefs;
  onChangePrefs: (p: Prefs) => void;
  onOpenSession: (clientId: string, itemId: string, kind: 'session' | 'consultation') => void;
  // Импорт полного бэкапа: clients + опционально projects/contentEntries.
  onImport: (bundle: { clients: Client[]; projects?: Project[]; contentEntries?: ContentEntry[] }) => void;
  // Нужны для экспорта в бэкап (Этап 2 — раньше выгружались только clients).
  projects: Project[];
  contentEntries: ContentEntry[];
  overdue: OverdueItem[];
  healing: HealingItem[];
  soon: UpcomingSoonItem[];
  // Проекты с просроченным «следующим шагом» — в напоминания (Этап 3b).
  dueProjects: Project[];
  onOpenProject: (project: Project) => void;
  onOpenEntry: (clientId: string, itemId: string, kind: 'session' | 'consultation') => void;
  onDismissReminder: (key: string) => void;
  onSnoozeReminder: (key: string, showAfter: string) => void;
  onCancelEntry: (clientId: string, itemId: string, kind: 'session' | 'consultation') => void;
  calendarSync: CalendarSyncSettings;
  // Tapping a «Срочно»/«Важно» count — client or personal — jumps to
  // Блокнот pre-filtered to that urgency, rather than landing unfiltered.
  onOpenNotes: (urgency: UrgencyKey) => void;
  // Собирает старые сессии/консультации (без projectId) в проекты-корзины
  // по клиенту. Возвращает сводку для показа результата (Этап 2).
  onMigrateRecords: () => { buckets: number; records: number };
}) {
  const upcoming = upcomingItems(clients, prefs.upcomingWindowDays);
  const { urgent, important } = urgencyCounts(clients);
  const personalNotes = notesUrgencyCounts(masterNotes);
  const statsUpcoming = upcomingItems(clients, prefs.statsWindowDays);
  const plannedSessionsCount = statsUpcoming.filter((i) => i.kind === 'session').length;
  const plannedConsultationsCount = statsUpcoming.filter((i) => i.kind === 'consultation').length;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  // Parsed and normalized, waiting on the inline «Да/Нет» confirm below —
  // replaces window.confirm() so the prompt matches the app's own dialogs.
  // projects/contentEntries присутствуют только у бэкапов версии 2; у старых
  // (только clients) они undefined и соответствующие сторы не трогаются.
  const [pendingImport, setPendingImport] = useState<{
    clients: Client[];
    projects?: Project[];
    contentEntries?: ContentEntry[];
  } | null>(null);
  // Миграция «Собрать старые записи в проекты» — двухшаговое подтверждение
  // (сначала напоминаем про бэкап) + сообщение о результате.
  const [migrateConfirm, setMigrateConfirm] = useState(false);
  const [migrateResult, setMigrateResult] = useState<string | null>(null);
  const hasUnorganizedRecords = clients.some(
    (c) => c.sessions.some((s) => !s.projectId) || c.consultations.some((cs) => !cs.projectId),
  );

  const handleExport = async () => {
    // Версия 2: кроме clients выгружаем projects и contentEntries, чтобы
    // проекты (в т.ч. корзины миграции) и черновики контента переживали
    // восстановление. Старые бэкапы (version 1, только clients) читаются.
    const payload = { version: 2, exportedAt: new Date().toISOString(), clients, projects, contentEntries };
    const json = JSON.stringify(payload, null, 2);
    const filename = `inka-backup-${new Date().toISOString().slice(0, 10)}.json`;
    await shareOrDownloadJSON(json, filename, 'INKA — резервная копия');
  };

  const handleImportFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const rawClients = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.clients) ? parsed.clients : null;
        if (!rawClients) throw new Error('bad shape');
        setImportError(null);
        setImportSuccess(null);
        setPendingImport({
          clients: rawClients.map((c: any, i: number) => normalizeClient(c, i)),
          // Только если ключ реально есть в файле — иначе оставляем undefined,
          // чтобы импорт старого бэкапа не стёр текущие проекты/контент.
          projects: Array.isArray(parsed?.projects) ? parsed.projects.map((p: any, i: number) => normalizeProject(p, i)) : undefined,
          contentEntries: Array.isArray(parsed?.contentEntries) ? (parsed.contentEntries as ContentEntry[]) : undefined,
        });
      } catch {
        setImportError('Не удалось прочитать файл — проверьте, что это резервная копия INKA.');
      }
    };
    reader.readAsText(file);
  };

  const confirmImport = () => {
    if (!pendingImport) return;
    onImport(pendingImport);
    setImportSuccess(`Импортировано ${pendingImport.clients.length} клиент(ов).`);
    setPendingImport(null);
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
    <div style={{ minHeight: '100%' }}>
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
          Админка
        </div>
        <div style={{ fontSize: fs(9.66), color: COLORS.textGhost, letterSpacing: `${fs(2.97)}px`, textTransform: 'uppercase', marginTop: 3, fontStyle: 'italic' }}>
          Управление и статистика
        </div>
        <StarDivider />
      </div>

      <div style={{ padding: '4px 20px calc(env(safe-area-inset-bottom, 0px) + 84px)', position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* «Запланировать» now lives only behind the nav FAB's contextual
            create button (same calendar-driven creation walk) — this screen
            no longer duplicates it as its own standalone button. */}

        {/* Уведомления и напоминания идут наверх, над блоком предстоящих
            сессий — это то, что требует внимания мастера в первую очередь. */}
        <RemindersSection overdue={overdue} healing={healing} soon={soon} dueProjects={dueProjects} onOpenProject={onOpenProject} onOpenEntry={onOpenEntry} onDismiss={onDismissReminder} onSnooze={onSnoozeReminder} onCancel={onCancelEntry} />

        {/* Upcoming sessions, with a master-configurable lookahead window —
            same period picker as the stats grid below, so the two controls
            read as one shared concept rather than two different ones. */}
        <GoldFrame style={{ padding: '14px 16px' }}>
          <div style={{ ...statLabelStyle, marginBottom: 0 }}>Предстоящие сессии</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12, marginTop: 8 }}>
            {DASHBOARD_WINDOW_OPTIONS.map((o) => (
              <div
                key={o.days}
                onClick={() => onChangePrefs({ ...prefs, upcomingWindowDays: o.days })}
                style={{
                  fontSize: fs(12),
                  padding: '4px 10px',
                  borderRadius: 2,
                  cursor: 'pointer',
                  border: prefs.upcomingWindowDays === o.days ? '1px solid rgba(var(--gold-rgb),0.6)' : '1px solid rgba(var(--gold-rgb),0.15)',
                  background: prefs.upcomingWindowDays === o.days ? 'rgba(var(--gold-rgb),0.08)' : 'transparent',
                  color: prefs.upcomingWindowDays === o.days ? COLORS.gold : COLORS.textFaint,
                }}
              >
                {o.label}
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

        {/* Обратный поток: брони от бота отдельным блоком (любой тег —
            бот мог оформить бронь и на [ТАТУ]/[ПРИЁМ]-слот, не только
            [ВИДЕО]/[ОКНО]). Без карточек клиентов и привязки — только
            справочный список, карточку мастер заводит в Дневнике сама
            (см. calendarSync.ts). Сгруппирован с «Предстоящие сессии» —
            оба про то, что запланировано впереди. */}
        {syncActive(calendarSync) && (
          <GoldFrame style={{ padding: '14px 16px' }}>
            <div style={{ ...statLabelStyle, marginBottom: 0 }}>Брони от бота</div>
            <div style={{ marginTop: 8 }}>
              <BotBookingsList settings={calendarSync} />
            </div>
          </GoldFrame>
        )}

        {/* Quick stats — clients (with срочно/важно in the lower half) beside
            назначено сессий/консультаций. «Частый стиль» stays on Мастер. */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
          {DASHBOARD_WINDOW_OPTIONS.map((o) => (
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
          {/* Клиентов: count on top, срочно/важно pulled up into the lower half. */}
          <GoldFrame style={{ padding: '16px 10px 14px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ textAlign: 'center', marginBottom: 13 }}>
              <div style={{ fontSize: fs(10), color: COLORS.textGhost, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 8 }}>Клиентов</div>
              <div style={{ fontFamily: DROP_CAP_FONT, fontSize: fs(30), fontWeight: 600, lineHeight: 1.15, color: COLORS.gold }}>{clients.length}</div>
            </div>
            <div style={{ background: 'rgba(var(--gold-rgb),0.15)', width: '100%', height: 1, marginBottom: 13 }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 'auto' }}>
              <div onClick={() => onOpenNotes('urgent')} role="button" aria-label={URGENCY[0].label} style={{ flex: 1, textAlign: 'center', cursor: 'pointer' }}>
                <div style={{ fontSize: fs(9.5), color: COLORS.textGhost, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 5 }}>{URGENCY[0].emoji} {URGENCY[0].short}</div>
                <div style={{ fontFamily: DROP_CAP_FONT, fontSize: fs(20), fontWeight: 600, color: COLORS.gold }}>{urgent}</div>
              </div>
              <div style={{ background: 'rgba(var(--gold-rgb),0.15)', width: 1, height: 34, flexShrink: 0 }} />
              <div onClick={() => onOpenNotes('important')} role="button" aria-label={URGENCY[1].label} style={{ flex: 1, textAlign: 'center', cursor: 'pointer' }}>
                <div style={{ fontSize: fs(9.5), color: COLORS.textGhost, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 5 }}>{URGENCY[1].emoji} {URGENCY[1].short}</div>
                <div style={{ fontFamily: DROP_CAP_FONT, fontSize: fs(20), fontWeight: 600, color: COLORS.gold }}>{important}</div>
              </div>
            </div>
          </GoldFrame>
          {/* Назначено сессий и консультаций — в одном блоке. */}
          <SplitStatBlock
            direction="column"
            a={{ label: 'Назначено сессий', value: plannedSessionsCount }}
            b={{ label: 'Консультаций', value: plannedConsultationsCount }}
          />
        </div>

        {/* Личные заметки мастера — то же срочно/важно, только для заметок
            без привязки к клиенту (папка хранения). Тап переходит в Блокнот
            с этим фильтром уже включённым, как и у клиентских счётчиков выше. */}
        <SplitStatBlock
          a={{ label: `${URGENCY[0].emoji} ${URGENCY[0].short} · личные`, value: personalNotes.urgent, onClick: () => onOpenNotes('urgent') }}
          b={{ label: `${URGENCY[1].emoji} ${URGENCY[1].short} · личные`, value: personalNotes.important, onClick: () => onOpenNotes('important') }}
        />

        {/* Backup — export the whole client list to a JSON file, or restore
            from one (replaces everything currently stored). */}
        <GoldFrame style={{ padding: '14px 16px' }}>
          <div style={statLabelStyle}>Резервная копия</div>
          {pendingImport ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: fs(12), color: 'var(--urgent)', fontStyle: 'italic', flex: 1, minWidth: 160 }}>
                Импортировать {pendingImport.clients.length} клиент(ов)? Текущие данные будут заменены.
              </span>
              <span onClick={confirmImport} style={{ fontSize: fs(12), color: 'var(--urgent)', textTransform: 'uppercase', letterSpacing: '0.5px', cursor: 'pointer' }}>
                Да
              </span>
              <span
                onClick={() => setPendingImport(null)}
                style={{ fontSize: fs(12), color: COLORS.textFaint, textTransform: 'uppercase', letterSpacing: '0.5px', cursor: 'pointer' }}
              >
                Нет
              </span>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <div onClick={handleExport} style={actionButtonStyle}>
                Экспортировать
              </div>
              <div onClick={() => fileInputRef.current?.click()} style={actionButtonStyle}>
                Импортировать
              </div>
            </div>
          )}
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
            <div style={{ marginTop: 10, fontSize: fs(12), color: 'var(--urgent)', fontStyle: 'italic' }}>{importError}</div>
          )}
          {importSuccess && (
            <div style={{ marginTop: 10, fontSize: fs(12), color: COLORS.gold, fontStyle: 'italic' }}>{importSuccess}</div>
          )}
        </GoldFrame>

        {/* Организация записей — собирает старые сессии/консультации (ещё не
            привязанные к проекту) в проект-«корзину» по каждому клиенту.
            Аддитивно: сами записи не меняются и не удаляются. Показывается,
            только пока есть что собирать. */}
        {(hasUnorganizedRecords || migrateResult) && (
          <GoldFrame style={{ padding: '14px 16px' }}>
            <div style={statLabelStyle}>Организация записей</div>
            {migrateResult ? (
              <div style={{ fontSize: fs(12), color: COLORS.gold, fontStyle: 'italic' }}>{migrateResult}</div>
            ) : migrateConfirm ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: fs(12), color: 'var(--text-soft)', fontStyle: 'italic' }}>
                  Старые сессии и консультации без проекта соберутся в проект-«корзину» по каждому клиенту (сами записи не меняются). Сначала сделайте резервную копию.
                </span>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <div onClick={handleExport} style={actionButtonStyle}>
                    Сделать бэкап
                  </div>
                  <div
                    onClick={() => {
                      const { buckets, records } = onMigrateRecords();
                      setMigrateConfirm(false);
                      setMigrateResult(
                        records === 0
                          ? 'Нечего собирать — все записи уже в проектах.'
                          : `Собрано ${records} запис(ей) в ${buckets} проект(ов).`,
                      );
                    }}
                    style={{ ...actionButtonStyle, color: 'var(--urgent)', borderColor: 'rgba(200,90,90,0.4)' }}
                  >
                    Собрать
                  </div>
                  <div onClick={() => setMigrateConfirm(false)} style={actionButtonStyle}>
                    Отмена
                  </div>
                </div>
              </div>
            ) : (
              <div onClick={() => setMigrateConfirm(true)} style={actionButtonStyle}>
                Собрать старые записи в проекты
              </div>
            )}
          </GoldFrame>
        )}
      </div>
    </div>
  );
}

function InstagramIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" {...props}>
      <rect x="2.5" y="2.5" width="15" height="15" rx="4.5" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="10" cy="10" r="4" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="14.3" cy="5.7" r="0.9" fill="currentColor" />
    </svg>
  );
}
function TikTokIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" {...props}>
      <path d="M11.3 2.8v9.4a3.15 3.15 0 1 1-2.25-3.02" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11.3 2.8c.3 2.05 1.9 3.6 4 3.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function PinterestIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" {...props}>
      <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8.2 14.5 10 6.8m0 0c1.9 0 3 1 3 2.6 0 1.9-1.1 3.2-2.7 3.2-.6 0-1-.2-1.2-.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function FacebookIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" {...props}>
      <path
        d="M12.3 3.5h-1.6c-1.5 0-2.5 1-2.5 2.6V8H6.2v2.4h1.9V17h2.6v-6.6h1.9l.3-2.4h-2.2V6.4c0-.5.3-.8.8-.8h1.7z"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function WhatsAppIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" {...props}>
      <path
        d="M10 3.5a6.5 6.5 0 0 0-5.6 9.8L3.5 16.5l3.3-.9A6.5 6.5 0 1 0 10 3.5Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        d="M7.6 7.4c-.3.6-.1 1.4.5 2.3.7 1 1.7 1.9 2.7 2.3.6.3 1.2.2 1.6-.2l.3-.3c.2-.2.2-.5 0-.7l-.9-.9c-.2-.2-.5-.2-.6 0l-.3.3c-.5-.2-1-.6-1.4-1s-.7-.9-.9-1.4l.3-.3c.2-.2.2-.4 0-.6l-.9-.9c-.2-.2-.5-.2-.7 0Z"
        stroke="currentColor"
        strokeWidth="0.9"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ===================== MASTER DASHBOARD =====================
function MasterDashboardScreen({
  clients,
  masterInfo,
  onChangeMasterInfo,
  onOpenSettings,
  calendarSync,
  onChangeCalendarSync,
  contentSync,
  onChangeContentSync,
  onOpenContent,
}: {
  clients: Client[];
  masterInfo: MasterInfo;
  onChangeMasterInfo: (m: MasterInfo) => void;
  onOpenSettings: () => void;
  calendarSync: CalendarSyncSettings;
  onChangeCalendarSync: (s: CalendarSyncSettings) => void;
  contentSync: ContentSyncSettings;
  onChangeContentSync: (s: ContentSyncSettings) => void;
  onOpenContent: () => void;
}) {
  const [name, setName] = useState(masterInfo.name);
  useEffect(() => setName(masterInfo.name), [masterInfo.name]);

  const style = mostUsedStyle(clients);

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

  // Tap-to-copy: a small "Скопировано ✓" chip fades in over the tapped card
  // for a moment, confirming the clipboard write without a blocking dialog.
  const [copiedTag, setCopiedTag] = useState<'payment' | 'phone' | 'telegramBot' | null>(null);
  const copyToClipboard = (text: string, tag: 'payment' | 'phone' | 'telegramBot') => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopiedTag(tag);
      setTimeout(() => setCopiedTag((t) => (t === tag ? null : t)), 1400);
    }).catch(() => {});
  };

  const [editingPayment, setEditingPayment] = useState(false);
  const hasPaymentData = masterInfo.links.length > 0 || !!masterInfo.bankDetails;
  const paymentCopyText = () =>
    [...masterInfo.links.map((l) => `${l.label}: ${l.value}`), ...(masterInfo.bankDetails ? [masterInfo.bankDetails] : [])].join('\n');

  // Соцсети — read-only icon row, derived from whichever of these platforms
  // already have a link in «Контакты» below (no separate fields to fill in
  // twice); empty platforms show a dim placeholder.
  const SOCIAL_PLATFORMS: { key: ChatPlatform; label: string; Icon: (props: SVGProps<SVGSVGElement>) => JSX.Element }[] = [
    { key: 'instagram', label: 'Instagram', Icon: InstagramIcon },
    { key: 'whatsapp', label: 'WhatsApp', Icon: WhatsAppIcon },
    { key: 'tiktok', label: 'TikTok', Icon: TikTokIcon },
    { key: 'pinterest', label: 'Pinterest', Icon: PinterestIcon },
    { key: 'facebook', label: 'Facebook', Icon: FacebookIcon },
  ];

  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneDraft, setPhoneDraft] = useState(masterInfo.phone);
  useEffect(() => setPhoneDraft(masterInfo.phone), [masterInfo.phone]);

  // Бот в Telegram — своя ссылка внутри блока «Автоматизация»: master
  // копирует и отправляет клиенту для брони.
  const [editingTelegramBot, setEditingTelegramBot] = useState(false);
  const [telegramBotDraft, setTelegramBotDraft] = useState(masterInfo.telegramBotLink);
  useEffect(() => setTelegramBotDraft(masterInfo.telegramBotLink), [masterInfo.telegramBotLink]);

  // Личные ссылки мастера (сайт/соцсети/мессенджеры) — тот же пикер
  // платформ, что у контактов клиента, но тап по строке копирует ссылку в
  // буфер (а не открывает её), как и остальные блоки на этом экране.
  const addChatLink = (platform: ChatPlatform, raw: string) => {
    const link: ChatLink = { id: Date.now().toString(), platform, url: buildChatLink(platform, raw) };
    onChangeMasterInfo({ ...masterInfo, chatLinks: [...masterInfo.chatLinks, link] });
  };
  const removeChatLink = (id: string) => {
    onChangeMasterInfo({ ...masterInfo, chatLinks: masterInfo.chatLinks.filter((l) => l.id !== id) });
  };
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  const copyChatLink = (link: ChatLink) => {
    navigator.clipboard?.writeText(link.url).then(() => {
      setCopiedLinkId(link.id);
      setTimeout(() => setCopiedLinkId((id) => (id === link.id ? null : id)), 1400);
    }).catch(() => {});
  };

  const [colorsOpen, setColorsOpen] = useState(false);
  const [showSyncSecret, setShowSyncSecret] = useState(false);
  const [showContentSecret, setShowContentSecret] = useState(false);

  const statLabelStyle: React.CSSProperties = {
    fontSize: fs(11),
    color: COLORS.textGhost,
    letterSpacing: '1.5px',
    textTransform: 'uppercase',
    marginBottom: 6,
  };
  const editToggleStyle: React.CSSProperties = {
    fontSize: fs(11),
    color: COLORS.gold,
    cursor: 'pointer',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    flexShrink: 0,
  };
  const copiedChipStyle: React.CSSProperties = {
    position: 'absolute',
    top: 40,
    right: 14,
    fontSize: fs(11),
    color: COLORS.gold,
    background: 'rgba(var(--gold-rgb),0.14)',
    border: '1px solid rgba(var(--gold-rgb),0.4)',
    borderRadius: 2,
    padding: '4px 9px',
    zIndex: 1,
  };

  return (
    <div style={{ minHeight: '100%' }}>
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
          <ToolbarIcon name="settingsGear" size={21} style={{ color: 'var(--gold)' }} />
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
          Профиль мастера
        </div>
        <StarDivider />
      </div>

      <div style={{ padding: '4px 20px calc(env(safe-area-inset-bottom, 0px) + 84px)', position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Имя + «Частый стиль» share one row — two columns, since both are
            short, glanceable facts rather than editable forms. */}
        <div style={{ display: 'flex', gap: 12 }}>
          <GoldFrame plain style={{ padding: '14px 16px', flex: 1, minWidth: 0 }}>
            <div style={{ ...statLabelStyle, textAlign: 'center' }}>Имя мастера</div>
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
                textAlign: 'center',
                fontFamily: DROP_CAP_FONT,
                fontSize: fs(19),
                fontWeight: 600,
                color: COLORS.gold,
              }}
            />
          </GoldFrame>

          {/* «Частый стиль» — the one stat that stays a personal Мастер
              metric; the rest of the stats grid moved to Админка. */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <StatBlock label="Частый стиль" value={style || 'Пока нет данных'} big={false} plain />
          </div>
        </div>

        {/* Соцсети — read-only icon row pulled straight from «Контакты»
            below (no separate fields — a link only needs to be entered
            once). Tap opens the profile, unlike «Контакты», which copies. */}
        <GoldFrame plain style={{ padding: '14px 16px' }}>
          <div style={{ ...statLabelStyle, marginBottom: 10 }}>Соцсети</div>
          <div style={{ display: 'flex', gap: 10 }}>
            {SOCIAL_PLATFORMS.map(({ key, label, Icon }) => {
              const link = masterInfo.chatLinks.find((l) => l.platform === key);
              const iconStyle: React.CSSProperties = {
                width: 48,
                height: 48,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                textDecoration: 'none',
              };
              if (!link) {
                return (
                  <div key={key} aria-label={label} style={{ ...iconStyle, border: '1px solid rgba(var(--gold-rgb),0.12)', color: COLORS.textGhost, opacity: 0.4 }}>
                    <Icon width={22} height={22} />
                  </div>
                );
              }
              return (
                <a
                  key={key}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Открыть ${label}`}
                  style={{ ...iconStyle, border: '1px solid rgba(var(--gold-rgb),0.3)', background: 'rgba(var(--gold-rgb),0.04)', color: COLORS.gold }}
                >
                  <Icon width={22} height={22} />
                </a>
              );
            })}
          </div>
          {SOCIAL_PLATFORMS.some(({ key }) => !masterInfo.chatLinks.some((l) => l.platform === key)) && (
            <div style={{ fontSize: fs(10.5), color: COLORS.textGhost, marginTop: 10, fontStyle: 'italic' }}>
              Добавьте ссылку в «Контакты» ниже, чтобы иконка открылась
            </div>
          )}
        </GoldFrame>

        {/* Оплата — master's own payment links + bank details. Once there's
            data, the card shows a read view that copies everything to the
            clipboard on tap; the pencil toggle switches back to the edit form. */}
        <GoldFrame plain style={{ padding: '14px 16px', position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: hasPaymentData && !editingPayment ? 8 : 14 }}>
            <div style={{ ...statLabelStyle, marginBottom: 0 }}>Оплата</div>
            <span onClick={() => setEditingPayment((v) => !v)} role="button" aria-label={editingPayment ? 'Готово' : 'Редактировать оплату'} style={editToggleStyle}>
              {editingPayment ? 'Готово' : hasPaymentData ? 'Изменить' : 'Заполнить'}
            </span>
          </div>
          {editingPayment || !hasPaymentData ? (
            <>
              {masterInfo.links.map((link) => (
                <div
                  key={link.id}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid rgba(var(--gold-rgb),0.08)' }}
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
              <textarea
                value={masterInfo.bankDetails}
                onChange={(e) => onChangeMasterInfo({ ...masterInfo, bankDetails: e.target.value })}
                placeholder="Счёт, БИК, ИНН..."
                style={{ ...INPUT_STYLE, resize: 'none', height: 80, marginTop: 10 }}
              />
            </>
          ) : (
            <div onClick={() => copyToClipboard(paymentCopyText(), 'payment')} role="button" aria-label="Скопировать данные" style={{ cursor: 'pointer' }}>
              {masterInfo.links.map((l) => (
                <div key={l.id} style={{ marginBottom: 6 }}>
                  <span style={{ fontSize: fs(12), color: COLORS.gold }}>{l.label}: </span>
                  <span style={{ fontSize: fs(13), color: 'var(--text-secondary)' }}>{l.value}</span>
                </div>
              ))}
              {masterInfo.bankDetails && (
                <div style={{ fontSize: fs(13), color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', marginTop: 6 }}>{masterInfo.bankDetails}</div>
              )}
              <div style={{ fontSize: fs(10.5), color: COLORS.textGhost, marginTop: 8, fontStyle: 'italic' }}>Нажмите, чтобы скопировать</div>
            </div>
          )}
          {copiedTag === 'payment' && <div style={copiedChipStyle}>Скопировано ✓</div>}
        </GoldFrame>

        {/* Контакты — телефон мастера + личные ссылки (сайт/соцсети/
            мессенджеры), тот же пикер платформ, что у контактов клиента.
            Тап по строке копирует, а не открывает (в отличие от карточки
            клиента) — остальные блоки на этом экране ведут себя так же. */}
        <GoldFrame plain style={{ padding: '14px 16px', position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: masterInfo.phone && !editingPhone ? 8 : 14 }}>
            <div style={{ ...statLabelStyle, marginBottom: 0 }}>Контакты</div>
            <span
              onClick={() => {
                if (editingPhone && phoneDraft.trim() !== masterInfo.phone) onChangeMasterInfo({ ...masterInfo, phone: phoneDraft.trim() });
                setEditingPhone((v) => !v);
              }}
              role="button"
              aria-label={editingPhone ? 'Готово' : 'Редактировать телефон'}
              style={{ ...editToggleStyle, flexShrink: 0 }}
            >
              {editingPhone ? 'Готово' : masterInfo.phone ? 'Изменить' : 'Заполнить'}
            </span>
          </div>
          {editingPhone || !masterInfo.phone ? (
            <input
              value={phoneDraft}
              onChange={(e) => setPhoneDraft(e.target.value)}
              onBlur={() => phoneDraft.trim() !== masterInfo.phone && onChangeMasterInfo({ ...masterInfo, phone: phoneDraft.trim() })}
              placeholder="+7 ..."
              style={{ ...INPUT_STYLE, marginBottom: 14 }}
            />
          ) : (
            <div onClick={() => copyToClipboard(masterInfo.phone, 'phone')} role="button" aria-label="Скопировать телефон" style={{ cursor: 'pointer', marginBottom: 14 }}>
              <div style={{ fontSize: fs(15), color: COLORS.textPrimary }}>{masterInfo.phone}</div>
              <div style={{ fontSize: fs(10.5), color: COLORS.textGhost, marginTop: 6, fontStyle: 'italic' }}>Нажмите, чтобы скопировать</div>
            </div>
          )}
          {copiedTag === 'phone' && <div style={copiedChipStyle}>Скопировано ✓</div>}

          {masterInfo.chatLinks.map((link) => (
            <div
              key={link.id}
              onClick={() => copyChatLink(link)}
              role="button"
              aria-label={`Скопировать ${PLATFORM_LABELS[link.platform]}`}
              style={{
                background: 'rgba(var(--surface-rgb),0.018)',
                border: '1px solid rgba(var(--gold-rgb),0.1)',
                borderRadius: 2,
                padding: '11px 13px',
                display: 'flex',
                alignItems: 'center',
                gap: 11,
                marginBottom: 8,
                cursor: 'pointer',
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: COLORS.gold, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: fs(13), color: COLORS.gold, letterSpacing: '0.3px' }}>
                  {copiedLinkId === link.id ? 'Скопировано ✓' : PLATFORM_LABELS[link.platform]}
                </div>
                <div style={{ fontSize: fs(12), color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {link.url.replace(/^https?:\/\//, '')}
                </div>
              </div>
              <span
                onClick={(e) => { e.stopPropagation(); removeChatLink(link.id); }}
                style={{ color: COLORS.textFaint, cursor: 'pointer', flexShrink: 0, fontSize: fs(15), lineHeight: 1 }}
              >
                ×
              </span>
            </div>
          ))}
          <AddChatLinkForm onAdd={addChatLink} />
        </GoldFrame>

        {/* Автоматизация — бот в Telegram (ссылка, которую мастер копирует
            и отправляет клиенту для брони) + синхронизация с Инка-
            календарём. Настоящий выключатель синхронизации — СЕКРЕТ: без
            него переключатель ничего не делает (бот ответит 401), поэтому
            другие пользователи приложения, не знающие секрета, писать в
            чужой календарь не могут. Секрет живёт только в localStorage
            этого устройства и НЕ попадает в резервную копию. */}
        <GoldFrame plain style={{ padding: '14px 16px', position: 'relative' }}>
          <div style={{ ...statLabelStyle, marginBottom: 10 }}>Автоматизация</div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: fs(12), color: COLORS.gold, letterSpacing: '0.3px' }}>Бот в Telegram</div>
            <span
              onClick={() => {
                if (editingTelegramBot && telegramBotDraft.trim() !== masterInfo.telegramBotLink) onChangeMasterInfo({ ...masterInfo, telegramBotLink: telegramBotDraft.trim() });
                setEditingTelegramBot((v) => !v);
              }}
              role="button"
              aria-label={editingTelegramBot ? 'Готово' : 'Редактировать ссылку на бота'}
              style={editToggleStyle}
            >
              {editingTelegramBot ? 'Готово' : masterInfo.telegramBotLink ? 'Изменить' : 'Заполнить'}
            </span>
          </div>
          {editingTelegramBot || !masterInfo.telegramBotLink ? (
            <input
              value={telegramBotDraft}
              onChange={(e) => setTelegramBotDraft(e.target.value)}
              onBlur={() => telegramBotDraft.trim() !== masterInfo.telegramBotLink && onChangeMasterInfo({ ...masterInfo, telegramBotLink: telegramBotDraft.trim() })}
              placeholder="https://t.me/..."
              style={{ ...INPUT_STYLE, marginBottom: 14 }}
            />
          ) : (
            <div onClick={() => copyToClipboard(masterInfo.telegramBotLink, 'telegramBot')} role="button" aria-label="Скопировать ссылку на бота" style={{ cursor: 'pointer', marginBottom: 14 }}>
              <div style={{ fontSize: fs(15), color: COLORS.textPrimary, wordBreak: 'break-all' }}>{masterInfo.telegramBotLink}</div>
              <div style={{ fontSize: fs(10.5), color: COLORS.textGhost, marginTop: 6, fontStyle: 'italic' }}>Нажмите, чтобы скопировать</div>
            </div>
          )}
          {copiedTag === 'telegramBot' && <div style={copiedChipStyle}>Скопировано ✓</div>}

          <div style={{ height: 1, background: 'rgba(var(--gold-rgb),0.1)', margin: '4px 0 14px' }} />

          <div style={{ fontSize: fs(12), color: COLORS.gold, letterSpacing: '0.3px', marginBottom: 8 }}>Инка-календарь · Синхронизация</div>
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
          <div style={{ position: 'relative', marginBottom: 8 }}>
            <input
              type={showSyncSecret ? 'text' : 'password'}
              value={calendarSync.secret}
              onChange={(e) => onChangeCalendarSync({ ...calendarSync, secret: e.target.value })}
              placeholder="Секретный код синхронизации"
              autoComplete="off"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '10px 40px 10px 12px',
                borderRadius: 2,
                border: '1px solid rgba(var(--gold-rgb),0.2)',
                background: 'rgba(var(--surface-rgb),0.03)',
                color: 'var(--text-secondary)',
                fontSize: fs(13),
                outline: 'none',
              }}
            />
            <span
              onClick={() => setShowSyncSecret((v) => !v)}
              role="button"
              aria-label={showSyncSecret ? 'Скрыть код' : 'Показать код'}
              style={{
                position: 'absolute',
                top: '50%',
                right: 10,
                transform: 'translateY(-50%)',
                cursor: 'pointer',
                color: COLORS.textGhost,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {showSyncSecret ? (
                <svg width="17" height="17" viewBox="0 0 20 20" fill="none">
                  <path d="M1.5 10S4.5 4 10 4s8.5 6 8.5 6-3 6-8.5 6-8.5-6-8.5-6Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                  <circle cx="10" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M3 3l14 14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
              ) : (
                <svg width="17" height="17" viewBox="0 0 20 20" fill="none">
                  <path d="M1.5 10S4.5 4 10 4s8.5 6 8.5 6-3 6-8.5 6-8.5-6-8.5-6Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                  <circle cx="10" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.3" />
                </svg>
              )}
            </span>
          </div>
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
        </GoldFrame>

        {/* ContentINKA — тот же принцип, что «Инка-календарь» выше, свой
            секрет и свой адрес сервиса (не тот же деплой, что у бота). */}
        <GoldFrame plain style={{ padding: '14px 16px', marginTop: 12 }}>
          <div style={{ fontSize: fs(12), color: COLORS.gold, letterSpacing: '0.3px', marginBottom: 8 }}>ContentINKA · Отбор и текст</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {([
              { v: true, label: 'Включена' },
              { v: false, label: 'Выключена' },
            ] as { v: boolean; label: string }[]).map((o) => (
              <div
                key={String(o.v)}
                onClick={() => onChangeContentSync({ ...contentSync, enabled: o.v })}
                style={{
                  flex: 1,
                  textAlign: 'center',
                  padding: '10px 0',
                  borderRadius: 2,
                  cursor: 'pointer',
                  fontSize: fs(13),
                  letterSpacing: '1px',
                  textTransform: 'uppercase',
                  border: contentSync.enabled === o.v ? '1px solid rgba(var(--gold-rgb),0.6)' : '1px solid rgba(var(--gold-rgb),0.15)',
                  background: contentSync.enabled === o.v ? 'rgba(var(--gold-rgb),0.08)' : 'transparent',
                  color: contentSync.enabled === o.v ? COLORS.gold : COLORS.textFaint,
                }}
              >
                {o.label}
              </div>
            ))}
          </div>
          <div style={{ position: 'relative', marginBottom: 8 }}>
            <input
              type={showContentSecret ? 'text' : 'password'}
              value={contentSync.secret}
              onChange={(e) => onChangeContentSync({ ...contentSync, secret: e.target.value })}
              placeholder="Секретный код ContentINKA"
              autoComplete="off"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '10px 40px 10px 12px',
                borderRadius: 2,
                border: '1px solid rgba(var(--gold-rgb),0.2)',
                background: 'rgba(var(--surface-rgb),0.03)',
                color: 'var(--text-secondary)',
                fontSize: fs(13),
                outline: 'none',
              }}
            />
            <span
              onClick={() => setShowContentSecret((v) => !v)}
              role="button"
              aria-label={showContentSecret ? 'Скрыть код' : 'Показать код'}
              style={{
                position: 'absolute',
                top: '50%',
                right: 10,
                transform: 'translateY(-50%)',
                cursor: 'pointer',
                color: COLORS.textGhost,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {showContentSecret ? (
                <svg width="17" height="17" viewBox="0 0 20 20" fill="none">
                  <path d="M1.5 10S4.5 4 10 4s8.5 6 8.5 6-3 6-8.5 6-8.5-6-8.5-6Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                  <circle cx="10" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M3 3l14 14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
              ) : (
                <svg width="17" height="17" viewBox="0 0 20 20" fill="none">
                  <path d="M1.5 10S4.5 4 10 4s8.5 6 8.5 6-3 6-8.5 6-8.5-6-8.5-6Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                  <circle cx="10" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.3" />
                </svg>
              )}
            </span>
          </div>
          <input
            type="text"
            value={contentSync.endpoint}
            onChange={(e) => onChangeContentSync({ ...contentSync, endpoint: e.target.value })}
            placeholder="https://contentinka-....vercel.app"
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
            {contentSync.enabled && contentSync.secret && contentSync.endpoint
              ? '«Отправить в контент» доступна в карточке сессии/консультации.'
              : 'нужны адрес сервиса и секретный код — без них кнопка «Отправить в контент» не сработает.'}
          </div>
          <div
            onClick={onOpenContent}
            role="button"
            aria-label="Открыть ContentINKA"
            style={{
              marginTop: 12,
              fontSize: fs(12),
              color: COLORS.gold,
              textAlign: 'center',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            Открыть ContentINKA · контент мастерской
          </div>
        </GoldFrame>

        {/* Обозначения цветов — collapsed by default, kept compact. */}
        <GoldFrame plain style={{ padding: '14px 16px' }}>
          <div
            onClick={() => setColorsOpen((v) => !v)}
            role="button"
            aria-label="Обозначения цветов"
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
          >
            <div style={{ ...statLabelStyle, marginBottom: 0 }}>Обозначения цветов</div>
            <span style={{ color: COLORS.gold, fontSize: fs(12), transform: colorsOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', display: 'inline-block' }}>▾</span>
          </div>
          {colorsOpen && (
            <div style={{ marginTop: 12 }}>
              {MARKER_COLORS.map((c) => (
                <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 20, height: 20, borderRadius: '50%', background: c, flexShrink: 0 }} />
                  <input
                    value={masterInfo.colorLabels[c] || ''}
                    onChange={(e) => setColorLabel(c, e.target.value)}
                    placeholder="Например: Постоянные клиенты"
                    style={{ ...INPUT_STYLE, flex: 1 }}
                  />
                </div>
              ))}
            </div>
          )}
        </GoldFrame>
      </div>
    </div>
  );
}

// ===================== БРОНИ ОТ БОТА =====================
// Только чтение, только список — по просьбе Ани карточку клиента она
// заводит в Дневнике сама, бот её не создаёт и ни к чему не привязывает.
// Любой из четырёх тегов: бот может оформить бронь и на [ТАТУ]/[ПРИЁМ]
// слот, не только на [ВИДЕО]/[ОКНО] (см. isBotBooking на стороне бота).
// Теги переименованы под голосовой ввод на стороне бота (были
// [КОНС]/[ONLINE]/[WALKIN]) — старых событий с прежними тегами в
// календаре нет, обратная совместимость не нужна.
// Ручное обновление кнопкой: экран Настроек не размонтируется при уходе
// (переключение через CSS-transform), поэтому автообновление по монтированию
// сработало бы только один раз за всю сессию приложения.
function tagLabel(tag: BotBooking['tag']): string {
  switch (tag) {
    case '[ВИДЕО]':
      return 'Видео';
    case '[ОКНО]':
      return 'Окно';
    case '[ТАТУ]':
      return 'Тату';
    case '[ПРИЁМ]':
      return 'Приём';
    default:
      return '—';
  }
}

function stripTagPrefix(summary: string, tag: BotBooking['tag']): string {
  if (!tag) return summary;
  return summary.startsWith(tag) ? summary.slice(tag.length).replace(/^\s+/, '') : summary;
}

function formatBookingTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('ru-RU', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jerusalem',
  });
}

function BotBookingsList({ settings }: { settings: CalendarSyncSettings }) {
  const [bookings, setBookings] = useState<BotBooking[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    setLoading(true);
    setError(null);
    fetchBotBookings(settings)
      .then((b) => setBookings(b.slice().sort((a, b2) => a.start.localeCompare(b2.start))))
      .catch(() => setError('не получилось загрузить — проверь секрет/соединение.'))
      .finally(() => setLoading(false));
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12, marginTop: -2 }}>
        <div
          onClick={loading ? undefined : refresh}
          style={{
            fontSize: fs(11),
            color: COLORS.gold,
            letterSpacing: '1px',
            textTransform: 'uppercase',
            cursor: loading ? 'default' : 'pointer',
            opacity: loading ? 0.5 : 1,
          }}
        >
          {loading ? 'гружу…' : 'обновить'}
        </div>
      </div>

      {error && <div style={{ fontSize: fs(12), color: '#C99', fontStyle: 'italic' }}>{error}</div>}

      {bookings === null && !error && !loading && (
        <div style={{ fontSize: fs(13), color: COLORS.textGhost, fontStyle: 'italic' }}>
          нажми «обновить», чтобы загрузить список.
        </div>
      )}

      {bookings !== null && bookings.length === 0 && (
        <div style={{ fontSize: fs(13), color: COLORS.textGhost, fontStyle: 'italic' }}>
          пока пусто — броней от бота не найдено.
        </div>
      )}

      {bookings !== null && bookings.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {bookings.map((b) => {
            const isMasterBlock = b.kind === 'master_block';
            const isOpenSlot = b.kind === 'open_slot';
            const badgeColor = isOpenSlot ? OPEN_SLOT_MARK : isMasterBlock ? COLORS.textFaint : COLORS.gold;
            return (
              <div
                key={b.id}
                style={{
                  padding: '8px 10px',
                  borderRadius: 2,
                  border: isMasterBlock
                    ? '1px dashed rgba(var(--gold-rgb),0.25)'
                    : isOpenSlot
                    ? `1px solid ${OPEN_SLOT_MARK}66`
                    : '1px solid rgba(var(--gold-rgb),0.1)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span
                    style={{
                      fontSize: fs(10),
                      color: badgeColor,
                      letterSpacing: '1px',
                      textTransform: 'uppercase',
                      padding: '2px 8px',
                      borderRadius: 2,
                      background: isOpenSlot ? `${OPEN_SLOT_MARK}1F` : isMasterBlock ? 'rgba(var(--surface-rgb),0.06)' : 'rgba(var(--gold-rgb),0.1)',
                    }}
                  >
                    {tagLabel(b.tag)}
                    {isMasterBlock ? ' · без данных' : ''}
                    {isOpenSlot ? ' · свободно' : ''}
                  </span>
                  <span style={{ fontSize: fs(12), color: COLORS.gold, whiteSpace: 'nowrap', marginLeft: 10 }}>
                    {formatBookingTime(b.start)}
                  </span>
                </div>
                {/* Сноска: те же данные, что бот пишет в название события в Google Calendar
                    (маркер занятости + имя/телефон клиента, или пометка мастера про /закрой),
                    без ведущего тега — он уже показан бейджем выше. Для открытого слота там
                    обычно уже пусто — событие ещё не забронировано, показывать нечего. */}
                {!isOpenSlot && (
                  <div style={{ marginTop: 6, fontSize: fs(12), color: COLORS.textGhost, fontStyle: 'italic' }}>
                    {stripTagPrefix(b.summary, b.tag)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ===================== SETTINGS SCREEN =====================
function SettingsScreen({
  theme,
  onToggleTheme,
  prefs,
  onChange,
  onBack,
}: {
  theme: Theme;
  onToggleTheme: () => void;
  prefs: Prefs;
  onChange: (p: Prefs) => void;
  onBack: () => void;
}) {
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
    <div style={{ minHeight: '100%' }}>
      <div style={{ height: 'calc(env(safe-area-inset-top) + 18px)' }} />
      <div style={{ padding: '6px 24px 12px', position: 'relative', zIndex: 1 }}>
        <div className="inka-back" onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', marginBottom: 10 }}>
          <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
            <path d="M11 4L6 9L11 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ color: COLORS.gold }} />
          </svg>
          <span style={{ fontSize: fs(14), color: COLORS.gold, fontStyle: 'italic', letterSpacing: '0.3px' }}>вернуться</span>
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
          Настройки
        </div>
        <div style={{ fontSize: fs(9.66), color: COLORS.textGhost, letterSpacing: `${fs(2.97)}px`, textTransform: 'uppercase', marginTop: 3, fontStyle: 'italic' }}>
          Оформление
        </div>
        <StarDivider />
      </div>

      <div style={{ padding: '4px 20px calc(env(safe-area-inset-bottom, 0px) + 84px)', position: 'relative', zIndex: 1 }}>
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
  projects,
  onOpenProject,
  masterNotes,
  onToggleDone,
  onEditNote,
  onDeleteNote,
  onOpenClient,
  onOpenConsultation,
  onOpenSession,
  onAddMasterNote,
  onToggleMasterDone,
  onEditMasterNote,
  onDeleteMasterNote,
  showComposer,
  onShowComposerChange,
  filter,
  onFilterChange,
}: {
  clients: Client[];
  // Active projects (Мастерская/клиентские) whose next action is due today
  // or overdue — surfaced here independently of the sessions/consultations
  // feed above, see «Активные проекты» below.
  projects: Project[];
  onOpenProject: (project: Project) => void;
  masterNotes: ClientNote[];
  onToggleDone: (clientId: string, note: ClientNote) => void;
  onEditNote: (clientId: string, note: ClientNote) => void;
  onDeleteNote: (clientId: string, noteId: string) => void;
  onOpenClient: (id: string) => void;
  onOpenConsultation: (clientId: string, consultationId: string) => void;
  onOpenSession: (clientId: string, sessionId: string) => void;
  onAddMasterNote: (text: string, urgency: UrgencyKey, photos: string[]) => void;
  onToggleMasterDone: (note: ClientNote) => void;
  onEditMasterNote: (note: ClientNote) => void;
  onDeleteMasterNote: (noteId: string) => void;
  // Lifted so the nav FAB's contextual create action can open it too — see
  // onCreate in the App shell.
  showComposer: boolean;
  onShowComposerChange: (open: boolean) => void;
  // Also lifted — so Админка's stat blocks can land here pre-filtered to a
  // specific urgency (e.g. tapping «Срочно» opens this screen already
  // narrowed to urgent notes) instead of always opening on «Все».
  filter: UrgencyKey | 'all';
  onFilterChange: (filter: UrgencyKey | 'all') => void;
}) {
  const [showClosed, setShowClosed] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Planned (not-done) sessions + consultations, across every client, soonest
  // first — a compact card (client · type · date) that opens straight into the
  // read-only viewer when tapped. Sessions need a real date to count as
  // planned; consultations show whether dated or not (undated sort last).
  type PlannedItem = { kind: 'session' | 'consultation'; client: Client; id: string; date: string; time: string; label: string };
  const plannedItems: PlannedItem[] = clients
    .flatMap((c): PlannedItem[] => [
      ...c.sessions
        .filter((s) => !s.done && !s.cancelled && ISO_DATE_RE.test(s.date))
        .map((s): PlannedItem => ({ kind: 'session', client: c, id: s.id, date: s.date, time: s.time, label: s.name || s.area })),
      ...c.consultations
        .filter((cs) => !cs.done && !cs.cancelled)
        .map((cs): PlannedItem => ({ kind: 'consultation', client: c, id: cs.id, date: cs.date, time: cs.time, label: cs.area })),
    ])
    .sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));

  // Active projects (with or without a client) whose next action is due
  // today or already overdue — independent of the sessions/consultations
  // feed above, doesn't touch that aggregation at all.
  const today = todayISO();
  const dueProjects = projects
    .filter((p) => p.state === 'active' && p.nextActionDate && p.nextActionDate <= today)
    .sort((a, b) => (a.nextActionDate ?? '').localeCompare(b.nextActionDate ?? ''));

  // Client-less projects — candidates a master (client-less) note/task can
  // be tied to.
  const clientlessProjects = getWorkshopProjects(projects);

  // Client notes + the master's own (client-less) notes, one flat list.
  type NoteEntry = { note: ClientNote; client: Client | null };
  const items: NoteEntry[] = [
    ...masterNotes.map((note): NoteEntry => ({ note, client: null })),
    ...clients.flatMap((c) => c.notes.map((note): NoteEntry => ({ note, client: c }))),
  ]
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
  // Split into two dedicated columns — general (the master's own, client-less)
  // and work notes (tied to a client) — instead of one mixed list.
  const generalItems = items.filter(({ client }) => client === null);
  const workItems = items.filter(({ client }) => client !== null);
  const hasAnyClientNote = clients.some((c) => c.notes.length);

  return (
    <div style={{ minHeight: '100%' }}>
      <div style={{ height: 'calc(env(safe-area-inset-top) + 18px)' }} />
      {/* Header — same formatting as the home screen: INKA logo + subtitle. */}
      <div style={{ padding: '6px 24px 12px', position: 'relative', zIndex: 1 }}>
        <InkaLogo height={fs(34)} />
        <div style={{ fontSize: fs(9.66), color: COLORS.textGhost, letterSpacing: `${fs(2.97)}px`, textTransform: 'uppercase', marginTop: 3, fontStyle: 'italic' }}>
          Планнер
        </div>
        <StarDivider />
      </div>

      {/* Filter bar: urgency symbols stay visible on the left; everything
          else (text labels, «Показывать закрытые») is tucked behind a «⋮» on
          the right. z-index 5 (not 1) so this row's own stacking context
          — and the dropdown inside it — sits above the two-column section
          below, which is a later sibling and would otherwise win z-index
          ties by DOM order. */}
      <div style={{ padding: '4px 20px 14px', position: 'relative', zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Funnel toggle — chips stay hidden until tapped. */}
          <div
            onClick={() => setShowFilters((v) => !v)}
            role="button"
            aria-label={showFilters ? 'Скрыть фильтры' : 'Показать фильтры'}
            title="Фильтры"
            style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
              border: showFilters ? '1px solid rgba(var(--gold-rgb),0.6)' : '1px solid rgba(var(--gold-rgb),0.15)',
              background: showFilters ? 'rgba(var(--gold-rgb),0.08)' : 'transparent',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ color: showFilters ? COLORS.gold : COLORS.textFaint }}>
              <path d="M2 3.5h12l-4.7 5.3V13l-2.6-1.5V8.8L2 3.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
            </svg>
          </div>
          {showFilters && (
            <>
              <div
                onClick={() => onFilterChange('all')}
                role="button"
                aria-label="Все"
                title="Все"
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontSize: fs(10.5),
                  textTransform: 'uppercase',
                  color: filter === 'all' ? COLORS.gold : COLORS.textFaint,
                  border: filter === 'all' ? '1px solid rgba(var(--gold-rgb),0.6)' : '1px solid rgba(var(--gold-rgb),0.15)',
                  background: filter === 'all' ? 'rgba(var(--gold-rgb),0.08)' : 'transparent',
                }}
              >
                Все
              </div>
              {URGENCY.map((u) => (
                <div
                  key={u.key}
                  onClick={() => onFilterChange(u.key)}
                  role="button"
                  aria-label={u.label}
                  title={u.label}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    fontSize: fs(14),
                    border: filter === u.key ? '1px solid rgba(var(--gold-rgb),0.6)' : '1px solid rgba(var(--gold-rgb),0.15)',
                    background: filter === u.key ? 'rgba(var(--gold-rgb),0.08)' : 'transparent',
                  }}
                >
                  {u.emoji}
                </div>
              ))}
              <div
                onClick={() => setShowClosed((v) => !v)}
                role="button"
                aria-label="Показывать закрытые"
                title="Показывать закрытые"
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontSize: fs(14),
                  border: showClosed ? '1px solid rgba(var(--gold-rgb),0.6)' : '1px solid rgba(var(--gold-rgb),0.15)',
                  background: showClosed ? 'rgba(var(--gold-rgb),0.08)' : 'transparent',
                }}
              >
                {DONE_EMOJI}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Planned sessions & consultations, full width, up top — a quick look
          at what's coming before the notes columns below. */}
      <div style={{ padding: '2px 20px 16px', position: 'relative', zIndex: 1 }}>
        <div style={{ fontSize: fs(11), color: COLORS.textGhost, letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: 8 }}>
          Записи
        </div>
        {plannedItems.length === 0 ? (
          <div style={{ fontSize: fs(13), color: COLORS.textGhost, fontStyle: 'italic' }}>Нет запланированного</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {plannedItems.map((it) => (
              <div
                key={`${it.kind}-${it.client.id}-${it.id}`}
                onClick={() => (it.kind === 'session' ? onOpenSession(it.client.id, it.id) : onOpenConsultation(it.client.id, it.id))}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9px 11px',
                  borderRadius: 2,
                  cursor: 'pointer',
                  border: '1px solid rgba(var(--gold-rgb),0.15)',
                  background: 'rgba(var(--surface-rgb),0.018)',
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: it.client.color, flexShrink: 0 }} />
                <span style={{ fontSize: fs(14), color: COLORS.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, flex: 1 }}>
                  {it.client.name || '—'}
                </span>
                <span style={{ fontSize: fs(9.5), color: COLORS.gold, letterSpacing: '1px', textTransform: 'uppercase', flexShrink: 0 }}>
                  {it.kind === 'session' ? 'Сессия' : 'Консультация'}
                </span>
                <span style={{ fontSize: fs(12), color: COLORS.textGhost, flexShrink: 0 }}>
                  {it.date ? formatDate(it.date).replace(/ \d{4}$/, '') : 'Без даты'}
                  {it.time && <span style={{ color: COLORS.gold }}> · {it.time}</span>}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {dueProjects.length > 0 && (
        <div style={{ padding: '2px 20px 16px', position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: fs(11), color: COLORS.textGhost, letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: 8 }}>
            Активные проекты
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {dueProjects.map((p) => (
              <div
                key={p.id}
                onClick={() => onOpenProject(p)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9px 11px',
                  borderRadius: 2,
                  cursor: 'pointer',
                  border: '1px solid rgba(var(--gold-rgb),0.15)',
                  background: 'rgba(var(--surface-rgb),0.018)',
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
                <span style={{ fontSize: fs(14), color: COLORS.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, flex: 1 }}>
                  {p.nextActionText || p.title || '—'}
                </span>
                <span style={{ fontSize: fs(9.5), color: COLORS.gold, letterSpacing: '1px', textTransform: 'uppercase', flexShrink: 0 }}>
                  {clientNameFor(clients, p.clientId) ?? 'Мастерская'}
                </span>
                <span style={{ fontSize: fs(12), color: COLORS.textGhost, flexShrink: 0 }}>
                  {p.nextActionDate ? formatDate(p.nextActionDate).replace(/ \d{4}$/, '') : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ padding: '0 20px 8px', position: 'relative', zIndex: 1 }}>
        <StarDivider />
      </div>

      {/* Two columns of notes below: general (the master's own, client-less)
          on the left, work notes (tied to a client) on the right. */}
      <div style={{ padding: '2px 16px calc(env(safe-area-inset-bottom, 0px) + 84px)', position: 'relative', zIndex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'start' }}>
        {/* Column 1 — general notes (client-less, the master's own) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <div style={{ fontSize: fs(11), color: COLORS.textGhost, letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: 2 }}>
            Общие
          </div>
          {/* New general note (client-less, stored on the master) — opened
              via the nav FAB's contextual «Создать» action. */}
          {showComposer && (
            <div style={{ marginBottom: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontSize: fs(10), color: COLORS.textGhost, letterSpacing: '1px', textTransform: 'uppercase' }}>
                  Новая заметка
                </div>
                <ReminderCloseButton onClick={() => onShowComposerChange(false)} />
              </div>
              <NoteComposer
                onAdd={(text, urgency, photos) => {
                  onAddMasterNote(text, urgency, photos);
                  onShowComposerChange(false);
                }}
              />
            </div>
          )}
          {generalItems.length === 0 ? (
            <div style={{ fontSize: fs(13), color: COLORS.textGhost, fontStyle: 'italic' }}>
              {masterNotes.length ? 'Нет по этому фильтру' : 'Заметок пока нет'}
            </div>
          ) : (
            generalItems.map(({ note }) => (
              <NoteItem
                key={`master-${note.id}`}
                note={note}
                projects={clientlessProjects}
                onToggleDone={() => onToggleMasterDone({ ...note, done: !note.done })}
                onEdit={(text, urgency, projectId) => onEditMasterNote({ ...note, text, urgency, projectId })}
                onDelete={() => onDeleteMasterNote(note.id)}
              />
            ))
          )}
        </div>

        {/* Column 2 — work notes (tied to a client) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <div style={{ fontSize: fs(11), color: COLORS.textGhost, letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: 2 }}>
            Рабочие
          </div>
          {workItems.length === 0 ? (
            <div style={{ fontSize: fs(13), color: COLORS.textGhost, fontStyle: 'italic' }}>
              {hasAnyClientNote ? 'Нет по этому фильтру' : 'Заметок пока нет'}
            </div>
          ) : (
            workItems.map(({ note, client }) => (
              <div key={`${client!.id}-${note.id}`} onClick={() => onOpenClient(client!.id)} style={{ cursor: 'pointer' }}>
                <NoteItem
                  note={note}
                  client={client!}
                  projects={getProjectsByClientId(projects, client!.id)}
                  onToggleDone={() => onToggleDone(client!.id, { ...note, done: !note.done })}
                  onEdit={(text, urgency, projectId) => onEditNote(client!.id, { ...note, text, urgency, projectId })}
                  onDelete={() => onDeleteNote(client!.id, note.id)}
                />
              </div>
            ))
          )}
        </div>
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

// The client's cover note ("Заметки о клиенте"), editable inline from the hero
// (tap the pencil or the text). Saves straight through onSave — no need to open
// the full client-edit form for a quick note change.
function CoverNoteEditor({ client, onSave }: { client: Client; onSave: (c: Client) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(client.note);
  useEffect(() => {
    if (!editing) setDraft(client.note);
  }, [client.note, editing]);

  const save = () => {
    onSave({ ...client, note: draft.trim() });
    setEditing(false);
  };

  const labelRow = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
      <div style={{ fontFamily: "'Kelly Slab', 'Playfair Display', serif", fontSize: fs(10), color: COLORS.textGhost, letterSpacing: '3px', textTransform: 'uppercase' }}>
        Заметки о клиенте
      </div>
      {!editing && (
        <span onClick={() => setEditing(true)} title="Редактировать" style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', opacity: 0.7 }}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ color: COLORS.gold }}>
            <path d="M11 2.5L13.5 5L5.5 13H3V10.5L11 2.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
          </svg>
        </span>
      )}
    </div>
  );

  return (
    <div style={{ marginTop: 16 }}>
      {labelRow}
      {editing ? (
        <div>
          <textarea
            dir="auto"
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Идеи, пожелания, особенности..."
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
              height: 90,
              fontStyle: 'italic',
              lineHeight: 1.5,
            }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <div onClick={save} style={{ flex: 1, padding: '7px 12px', textAlign: 'center', border: '1px solid rgba(var(--gold-rgb),0.3)', borderRadius: 2, cursor: 'pointer', color: COLORS.gold, fontSize: fs(11), letterSpacing: '1px', textTransform: 'uppercase', fontStyle: 'italic' }}>
              Сохранить
            </div>
            <div onClick={() => { setDraft(client.note); setEditing(false); }} style={{ flex: 1, padding: '7px 12px', textAlign: 'center', border: '1px solid rgba(var(--gold-rgb),0.15)', borderRadius: 2, cursor: 'pointer', color: COLORS.textFaint, fontSize: fs(11), letterSpacing: '1px', textTransform: 'uppercase', fontStyle: 'italic' }}>
              Отмена
            </div>
          </div>
        </div>
      ) : client.note ? (
        <div
          onClick={() => setEditing(true)}
          dir="auto"
          style={{ fontSize: fs(15), color: 'var(--text-soft)', fontStyle: 'italic', lineHeight: 1.5, cursor: 'pointer', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
        >
          {client.note}
        </div>
      ) : (
        <div onClick={() => setEditing(true)} style={{ fontSize: fs(14), color: COLORS.textGhost, fontStyle: 'italic', cursor: 'pointer' }}>
          Добавить заметку…
        </div>
      )}
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
  onEditSession,
  onDeleteSession,
  onUpdateSessionPhotos,
  onToggleSessionDone,
  onEditConsultation,
  onDeleteConsultation,
  onViewSession,
  onViewConsultation,
  onAddDocument,
  onRemoveDocument,
  onUpsertNote,
  onAddNote,
  onDeleteNote,
  onImportClients,
  projects,
  onOpenProject,
  onCreateProject,
}: {
  client: Client;
  activeTab: 'info' | 'sessions' | 'consultations' | 'extra';
  onTab: (t: 'info' | 'sessions' | 'consultations' | 'extra') => void;
  onBack: () => void;
  onSave: (client: Client) => void;
  onEditClient: () => void;
  onEditSession: (session: Session) => void;
  onDeleteSession: (sessionId: string) => void;
  onUpdateSessionPhotos: (sessionId: string, photos: string[]) => void;
  onToggleSessionDone: (sessionId: string) => void;
  onEditConsultation: (consultation: Consultation) => void;
  onDeleteConsultation: (consultationId: string) => void;
  onViewSession: (session: Session) => void;
  onViewConsultation: (consultation: Consultation) => void;
  onAddDocument: (doc: ClientDocument) => void;
  onRemoveDocument: (docId: string) => void;
  onUpsertNote: (note: ClientNote) => void;
  onAddNote: (text: string, urgency: UrgencyKey, photos: string[]) => void;
  onDeleteNote: (noteId: string) => void;
  // Merge-import (add/update, never clears) — the counterpart to this same
  // screen's client export, so a single exported client's file can be
  // brought back in without wiping the rest of the roster.
  onImportClients: (clients: Client[]) => void;
  projects: Project[];
  onOpenProject: (project: Project) => void;
  onCreateProject: () => void;
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
  // «Сессии»/«Доп.» get more room to work with — starts collapsed (and resets
  // to collapsed whenever a different client is opened), expand on demand.
  const [headerCollapsed, setHeaderCollapsed] = useState(true);
  useEffect(() => {
    setHeaderCollapsed(true);
  }, [client.id]);

  // Same file shape as the full backup (see handleExport in
  // AdminDashboardScreen), just with a single-client array — so it imports
  // back in through that same «Импортировать» flow without any special-casing.
  const handleExportClient = async () => {
    const payload = { version: 1, exportedAt: new Date().toISOString(), clients: [client] };
    const json = JSON.stringify(payload, null, 2);
    const safeName = `${client.name} ${client.surname}`.trim().replace(/[^\p{L}\p{N}]+/gu, '_') || 'client';
    const filename = `inka-${safeName}-${new Date().toISOString().slice(0, 10)}.json`;
    await shareOrDownloadJSON(json, filename, `INKA — ${client.name}`);
  };

  // Export and import share one button — a small menu picks which, since
  // both are the same «move a client to/from a file» idea and rarely used
  // side by side. The menu (and the feedback tooltip below) render via
  // `position: fixed` with a manually-tracked anchor point rather than
  // `absolute` — the hero header this button sits in has `overflow: hidden`
  // (it clips its own decorative art), which would otherwise clip the
  // dropdown too whenever the header is in its collapsed (short) state.
  const [showTransferMenu, setShowTransferMenu] = useState(false);
  const [transferMenuAnchor, setTransferMenuAnchor] = useState<{ top: number; right: number } | null>(null);
  const [importFeedback, setImportFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const transferBtnRef = useRef<HTMLDivElement>(null);
  const importFileRef = useRef<HTMLInputElement>(null);
  const openTransferMenu = () => {
    const rect = transferBtnRef.current?.getBoundingClientRect();
    if (rect) setTransferMenuAnchor({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    setShowTransferMenu(true);
  };
  const handleImportFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const rawClients = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.clients) ? parsed.clients : null;
        if (!rawClients || !rawClients.length) throw new Error('bad shape');
        onImportClients(rawClients.map((c: any, i: number) => normalizeClient(c, i)));
        setImportFeedback({ ok: true, text: rawClients.length > 1 ? `Импортировано ${rawClients.length} клиент(ов)` : 'Клиент импортирован' });
      } catch {
        setImportFeedback({ ok: false, text: 'Не удалось прочитать файл' });
      }
      setTimeout(() => setImportFeedback(null), 2400);
    };
    reader.readAsText(file);
  };

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
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {/* Export/import this one client — a single button, a menu picks
                which. Same JSON shape the full backup uses (just a
                single-client array), so an exported file round-trips back
                in through either this button or Админка's own import. */}
            <div ref={transferBtnRef} style={{ position: 'relative', display: 'flex', flexShrink: 0 }}>
              <div
                className="inka-back"
                onClick={() => (showTransferMenu ? setShowTransferMenu(false) : openTransferMenu())}
                role="button"
                aria-label="Экспорт/импорт клиента"
                aria-expanded={showTransferMenu}
                title="Экспортировать или импортировать этого клиента"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, cursor: 'pointer' }}
              >
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                  <path d="M5 3V13M5 13L2.5 10.5M5 13L7.5 10.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M11 13V3M11 3L8.5 5.5M11 3L13.5 5.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              {showTransferMenu && transferMenuAnchor && (
                <>
                  <div onClick={() => setShowTransferMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 15 }} />
                  <div
                    style={{
                      position: 'fixed',
                      top: transferMenuAnchor.top,
                      right: transferMenuAnchor.right,
                      width: 176,
                      background: COLORS.sheet,
                      border: '1px solid rgba(var(--gold-rgb),0.2)',
                      borderRadius: 4,
                      padding: 6,
                      boxShadow: '0 10px 28px rgba(0,0,0,0.4)',
                      zIndex: 17,
                    }}
                  >
                    <div
                      onClick={() => {
                        setShowTransferMenu(false);
                        handleExportClient();
                      }}
                      role="button"
                      style={{ padding: '9px 8px', fontSize: fs(13), color: COLORS.textPrimary, cursor: 'pointer', borderRadius: 2 }}
                    >
                      Экспортировать
                    </div>
                    <div
                      onClick={() => {
                        setShowTransferMenu(false);
                        importFileRef.current?.click();
                      }}
                      role="button"
                      style={{ padding: '9px 8px', fontSize: fs(13), color: COLORS.textPrimary, cursor: 'pointer', borderRadius: 2 }}
                    >
                      Импортировать
                    </div>
                  </div>
                </>
              )}
              <input
                ref={importFileRef}
                type="file"
                accept="application/json"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImportFile(file);
                  e.target.value = '';
                }}
              />
              {importFeedback && (
                <div
                  style={{
                    position: 'fixed',
                    top: transferMenuAnchor?.top ?? 0,
                    right: transferMenuAnchor?.right ?? 24,
                    whiteSpace: 'nowrap',
                    fontSize: fs(11),
                    color: importFeedback.ok ? COLORS.gold : 'var(--urgent)',
                    background: COLORS.sheet,
                    border: '1px solid rgba(var(--gold-rgb),0.2)',
                    borderRadius: 4,
                    padding: '6px 10px',
                    boxShadow: '0 10px 28px rgba(0,0,0,0.4)',
                    zIndex: 17,
                  }}
                >
                  {importFeedback.text}
                </div>
              )}
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

            {/* Notes about the client — in the header, editable inline (tap the
                pencil or the text) so it can be changed without opening the
                full client-edit form. */}
            <CoverNoteEditor client={client} onSave={onSave} />
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
        <div onClick={() => onTab('consultations')} style={tabStyle('consultations')}>
          Консультации
        </div>
        <div onClick={() => onTab('extra')} style={tabStyle('extra')}>
          Заметки
        </div>
        <div onClick={() => onTab('info')} style={tabStyle('info')}>
          Инфо
        </div>
      </div>

      {/* Sub-header — pinned below the tab bar (never scrolls), shown on
          both the Сессии and Консультации tabs, labelled per tab now that
          they're split. Adding an entry is only reachable from the nav
          FAB's contextual «Создать» (shown on this screen too) — no local
          add button duplicating it here. */}
      {(activeTab === 'sessions' || activeTab === 'consultations') && (
        <div
          style={{
            padding: '14px 24px',
            background: COLORS.bg,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              fontFamily: "'Kelly Slab', 'Playfair Display', serif",
              fontSize: fs(11),
              color: COLORS.textGhost,
              letterSpacing: '3.5px',
              textTransform: 'uppercase',
            }}
          >
            {activeTab === 'sessions' ? 'История сессий' : 'История консультаций'}
          </div>
        </div>
      )}

      {/* Tab content */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', position: 'relative', padding: '22px 24px 50px' }}>
        {(activeTab === 'sessions' || activeTab === 'consultations') && (
          <SessionsTab
            kind={activeTab}
            client={client}
            onEditSession={onEditSession}
            onDeleteSession={onDeleteSession}
            onUpdateSessionPhotos={onUpdateSessionPhotos}
            onToggleSessionDone={onToggleSessionDone}
            onEditConsultation={onEditConsultation}
            onDeleteConsultation={onDeleteConsultation}
            onViewSession={onViewSession}
            onViewConsultation={onViewConsultation}
          />
        )}
        {activeTab === 'info' && (
          <InfoTab
            client={client}
            projects={projects}
            onSave={onSave}
            onAddDocument={onAddDocument}
            onRemoveDocument={onRemoveDocument}
            onOpenProject={onOpenProject}
            onCreateProject={onCreateProject}
          />
        )}
        {activeTab === 'extra' && (
          <AdditionalTab
            client={client}
            projects={getProjectsByClientId(projects, client.id)}
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
  projects,
  onSave,
  onAddDocument,
  onRemoveDocument,
  onOpenProject,
  onCreateProject,
}: {
  client: Client;
  // Проекты этого клиента (Этап 3a) — видно сразу, что их может быть
  // несколько, без похода в Мастерскую и фильтра по клиенту.
  projects: Project[];
  onSave: (client: Client) => void;
  onAddDocument: (doc: ClientDocument) => void;
  onRemoveDocument: (docId: string) => void;
  onOpenProject: (project: Project) => void;
  onCreateProject: () => void;
}) {
  const metaCell = (span = false): React.CSSProperties => ({
    background: 'rgba(var(--surface-rgb),0.018)',
    border: '1px solid rgba(var(--gold-rgb),0.1)',
    borderRadius: 2,
    padding: 13,
    gridColumn: span ? 'span 2' : undefined,
  });
  const clientProjects = getProjectsByClientId(projects, client.id);

  return (
    <div style={{ animation: 'fadeSlideIn 0.3s ease' }}>
      {/* Contacts — moved to the top (was master notes) */}
      <ContactsSection client={client} onSave={onSave} first />

      <SectionDivider />

      {/* Проекты клиента (Этап 3a) — один клиент может иметь несколько. */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div
            style={{
              fontFamily: "'Kelly Slab', 'Playfair Display', serif",
              fontSize: fs(11),
              color: COLORS.textGhost,
              letterSpacing: '3.5px',
              textTransform: 'uppercase',
            }}
          >
            Проекты
          </div>
          <span onClick={onCreateProject} style={{ fontSize: fs(12), color: COLORS.gold, cursor: 'pointer', letterSpacing: '0.5px' }}>
            + Новый
          </span>
        </div>
        {clientProjects.length === 0 ? (
          <div style={{ fontSize: fs(13), color: COLORS.textGhost, fontStyle: 'italic' }}>Пока нет проектов</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {clientProjects.map((p) => (
              <div
                key={p.id}
                onClick={() => onOpenProject(p)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '9px 11px',
                  borderRadius: 2,
                  cursor: 'pointer',
                  border: '1px solid rgba(var(--gold-rgb),0.15)',
                  background: 'rgba(var(--surface-rgb),0.018)',
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
                <span style={{ fontSize: fs(14), color: COLORS.textPrimary, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.title || 'Без названия'}
                </span>
                <span style={{ fontSize: fs(10.5), color: COLORS.textFaint, flexShrink: 0 }}>
                  {PROJECT_STAGES.find((s) => s.key === p.stage)?.label ?? p.stage}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

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

      {/* Language auto-generated messages (reminders etc.) get written in —
          see REMINDER_TEXTS/localizedWhen above. */}
      <ClientLanguageSection client={client} onSave={onSave} />

      {/* Skin: type + tone + notes */}
      <SkinSection client={client} onSave={onSave} />

      {/* Master's own notes — written inline right here, at the bottom */}
      <MasterNoteSection client={client} onSave={onSave} />

      {/* Attachments — documents / photos / any file for this client */}
      <AttachmentsSection client={client} onAddDocument={onAddDocument} onRemoveDocument={onRemoveDocument} />
    </div>
  );
}

// ── Client language — which language auto-generated messages (reminders
// etc., see REMINDER_TEXTS) get written in for this client. ──
function ClientLanguageSection({ client, onSave }: { client: Client; onSave: (client: Client) => void }) {
  return (
    <div style={{ marginTop: 22 }}>
      <SectionDivider />
      <SectionHeader>Язык клиента</SectionHeader>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        {CLIENT_LANGUAGES.map((o) => (
          <div
            key={o.value}
            onClick={() => onSave({ ...client, language: o.value })}
            style={{
              flex: 1,
              textAlign: 'center',
              padding: '10px 0',
              borderRadius: 2,
              cursor: 'pointer',
              fontSize: fs(13),
              letterSpacing: '0.5px',
              border: client.language === o.value ? '1px solid rgba(var(--gold-rgb),0.6)' : '1px solid rgba(var(--gold-rgb),0.15)',
              background: client.language === o.value ? 'rgba(var(--gold-rgb),0.08)' : 'transparent',
              color: client.language === o.value ? COLORS.gold : COLORS.textFaint,
            }}
          >
            {o.label}
          </div>
        ))}
      </div>
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
  const [expanded, setExpanded] = useState(false);
  const selected = value ? value.toLowerCase() : '';
  const hasSel = !!selected;
  // Once a tone is picked the rest collapse away and the chosen swatch grows for
  // readability; picking again (or «изменить») expands the full palette back.
  const pinned = SKIN_TONES.filter((_, i) => i % SKIN_TONES_PINNED_STEP === 0);
  const visible = hasSel || expanded ? SKIN_TONES : pinned;
  const hiddenCount = SKIN_TONES.length - visible.length;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center' }}>
      {visible.map((t) => {
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
      {!hasSel && hiddenCount > 0 && (
        <span
          onClick={() => setExpanded(true)}
          style={{ margin: 4, fontSize: fs(12), color: COLORS.textGhost, fontStyle: 'italic', cursor: 'pointer', letterSpacing: '0.3px', whiteSpace: 'nowrap' }}
        >
          Ещё тона ({hiddenCount}) ▾
        </span>
      )}
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
            minWidth: 0,
            textAlign: 'center',
            padding: '9px 4px',
            borderRadius: 2,
            border: '1px solid rgba(var(--gold-rgb),0.15)',
            color: COLORS.textFaint,
            fontSize: fs(13),
            letterSpacing: '1px',
            textTransform: 'uppercase',
            cursor: 'pointer',
            wordBreak: 'break-word',
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
            minWidth: 0,
            textAlign: 'center',
            padding: '9px 4px',
            borderRadius: 2,
            border: '1px solid rgba(var(--gold-rgb),0.35)',
            background: 'rgba(var(--gold-rgb),0.05)',
            color: COLORS.gold,
            fontSize: fs(13),
            letterSpacing: '1px',
            textTransform: 'uppercase',
            cursor: 'pointer',
            wordBreak: 'break-word',
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

// A note clamped to a few lines with a «Показать полностью ▾ / Свернуть ▴»
// toggle — only shown when the text actually overflows that clamp, so a
// short note never grows an affordance it doesn't need. Measured via
// scrollHeight vs clientHeight: -webkit-line-clamp hides the extra content
// visually but scrollHeight still reports the full, un-clamped height.
function ExpandableText({ text, style, clampLines = 4 }: { text: string; style?: React.CSSProperties; clampLines?: number }) {
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setExpanded(false);
    const el = ref.current;
    if (el) setOverflowing(el.scrollHeight > el.clientHeight + 1);
  }, [text]);

  return (
    <div>
      <div
        ref={ref}
        dir="auto"
        style={{
          ...style,
          ...(expanded
            ? {}
            : { display: '-webkit-box', WebkitLineClamp: clampLines, WebkitBoxOrient: 'vertical', overflow: 'hidden' }),
        }}
      >
        {text}
      </div>
      {overflowing && (
        <span
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          role="button"
          style={{ fontSize: fs(11), color: COLORS.gold, fontStyle: 'italic', cursor: 'pointer', marginTop: 4, display: 'inline-block' }}
        >
          {expanded ? 'Свернуть ▴' : 'Показать полностью ▾'}
        </span>
      )}
    </div>
  );
}

// Small ✕ on a session card; a tap reveals "Удалить? Да/Нет" inline.
function SessionDeleteControl({
  onDelete,
  confirming,
  onConfirmingChange,
}: {
  onDelete: () => void;
  // Controlled so a swiped-open row (see useSwipeToReveal) can reveal the
  // same confirm this «×» would — one confirm state either way, not two.
  confirming: boolean;
  onConfirmingChange: (v: boolean) => void;
}) {
  if (confirming) {
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: fs(12), color: '#A85A66', fontStyle: 'italic' }}>Удалить?</span>
        <span onClick={onDelete} style={{ fontSize: fs(12), color: '#C56676', textTransform: 'uppercase', letterSpacing: '0.5px', cursor: 'pointer' }}>
          Да
        </span>
        <span
          onClick={() => onConfirmingChange(false)}
          style={{ fontSize: fs(12), color: COLORS.textFaint, textTransform: 'uppercase', letterSpacing: '0.5px', cursor: 'pointer' }}
        >
          Нет
        </span>
      </span>
    );
  }

  return (
    <span onClick={() => onConfirmingChange(true)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }} aria-label="Удалить сессию">
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
  readOnly = false,
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
  // Read-only: just the thumbnails (tap-to-enlarge still works), no "Добавить
  // фото" button — used in timeline/preview cards.
  readOnly?: boolean;
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
        // A grid (not a wrapping flex row of fixed-size tiles) so thumbnails
        // stretch to fill whatever width is left on the last row — with just
        // one or two photos, fixed 78px tiles left most of the card's own
        // width sitting empty next to them.
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: 8, marginBottom: 10 }}>
          {photos.map((src, i) => (
            <div key={i} style={{ position: 'relative', width: '100%', aspectRatio: '1' }}>
              <img
                src={src}
                alt=""
                onClick={() => setViewerSrc(src)}
                style={{
                  width: '100%',
                  height: '100%',
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
                  <span style={{ fontSize: fs(11), color: '#A85A66', fontStyle: 'italic' }}>Удалить?</span>
                  <span style={{ display: 'flex', gap: 10 }}>
                    <span onClick={() => remove(i)} style={{ fontSize: fs(12), color: '#C56676', textTransform: 'uppercase', cursor: 'pointer' }}>
                      Да
                    </span>
                    <span onClick={() => setConfirmIndex(null)} style={{ fontSize: fs(12), color: COLORS.textFaint, textTransform: 'uppercase', cursor: 'pointer' }}>
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
      {readOnly ? (
        thumbnails
      ) : buttonFirst ? (
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
      {!readOnly && (
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
      )}

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

// A session's own date when it has one; otherwise its creation time (the
// timestamp baked into its id — see handleAddSession), converted to the same
// yyyy-mm-dd shape. This lets an undated session slot into the timeline where
// it was actually added, instead of always sinking to the very bottom below
// every dated session regardless of when it was created.
function sessionTimelineKey(session: Session): string {
  if (ISO_DATE_RE.test(session.date)) return session.date;
  const createdAt = Number(session.id);
  return Number.isFinite(createdAt) ? new Date(createdAt).toISOString().slice(0, 10) : '';
}

// ── Sessions tab (also used, filtered, for the separate Консультации tab) ──
// Sessions and consultations used to share one combined timeline under a
// single «Сессии» tab; they're now split into their own tabs, so this
// component takes `kind` to render just the one list, sorted the same way
// (most recent first; an undated session sorts by when it was added instead).
function SessionsTab({
  kind,
  client,
  onEditSession,
  onDeleteSession,
  onUpdateSessionPhotos,
  onToggleSessionDone,
  onEditConsultation,
  onDeleteConsultation,
  onViewSession,
  onViewConsultation,
}: {
  kind: 'sessions' | 'consultations';
  client: Client;
  onEditSession: (session: Session) => void;
  onDeleteSession: (sessionId: string) => void;
  onUpdateSessionPhotos: (sessionId: string, photos: string[]) => void;
  onToggleSessionDone: (sessionId: string) => void;
  onEditConsultation: (consultation: Consultation) => void;
  onDeleteConsultation: (consultationId: string) => void;
  onViewSession: (session: Session) => void;
  onViewConsultation: (consultation: Consultation) => void;
}) {
  if (kind === 'consultations') {
    const consultations = [...client.consultations].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return (
      <div style={{ animation: 'fadeSlideIn 0.3s ease' }}>
        {consultations.length === 0 && (
          <div style={{ fontSize: fs(15), color: COLORS.textGhost, fontStyle: 'italic', marginBottom: 14 }}>Консультаций пока нет.</div>
        )}
        {consultations.map((consultation) => (
          <ConsultationRow
            key={consultation.id}
            consultation={consultation}
            onEdit={onEditConsultation}
            onDelete={() => onDeleteConsultation(consultation.id)}
            onView={onViewConsultation}
          />
        ))}
      </div>
    );
  }

  const sessions = [...client.sessions].sort((a, b) => sessionTimelineKey(b).localeCompare(sessionTimelineKey(a)));
  return (
    <div style={{ animation: 'fadeSlideIn 0.3s ease' }}>
      {sessions.length === 0 && (
        <div style={{ fontSize: fs(15), color: COLORS.textGhost, fontStyle: 'italic', marginBottom: 14 }}>Сессий пока нет.</div>
      )}
      {sessions.map((session) => (
        <SessionRow
          key={session.id}
          session={session}
          onEdit={onEditSession}
          onDelete={() => onDeleteSession(session.id)}
          onView={onViewSession}
          onToggleDone={() => onToggleSessionDone(session.id)}
          onUpdatePhotos={(photos) => onUpdateSessionPhotos(session.id, photos)}
        />
      ))}
    </div>
  );
}

// One consultation card in the client's dated timeline. Swiping the card
// (see useSwipeToReveal) reveals the same «Удалить? Да/Нет» its «×» does —
// swiping never deletes outright.
function ConsultationRow({
  consultation,
  onEdit,
  onDelete,
  onView,
}: {
  consultation: Consultation;
  onEdit: (consultation: Consultation) => void;
  onDelete: () => void;
  onView: (consultation: Consultation) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const { swipeStyle, swipeHandlers, dragging } = useSwipeToReveal(() => setConfirming(true));
  const meta = urgencyMeta(consultation.urgency);
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        onClick={() => onView(consultation)}
        {...swipeHandlers}
        style={{
          background: 'rgba(var(--surface-rgb),0.018)',
          border: '1px solid rgba(var(--gold-rgb),0.22)',
          borderRadius: 2,
          padding: '12px 14px',
          cursor: 'pointer',
          transition: dragging ? 'none' : 'transform 0.2s ease',
          ...swipeStyle,
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
          {/* Controls sit outside the card's tap-to-view: their own clicks
              must not also open the viewer. */}
          <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 11, flexShrink: 0 }}>
            {consultation.cancelled && (
              <span
                style={{
                  fontSize: fs(10),
                  color: COLORS.textFaint,
                  border: '1px solid rgba(var(--gold-rgb),0.2)',
                  borderRadius: 2,
                  padding: '2px 6px',
                  letterSpacing: '0.8px',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                }}
              >
                Отменена
              </span>
            )}
            <span style={{ fontSize: fs(13) }} title={meta.label}>{meta.emoji}</span>
            <div
              className="inka-back"
              onClick={() => onEdit(consultation)}
              style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', opacity: 0.75 }}
              title="Редактировать консультацию"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ color: COLORS.gold }}>
                <path d="M11 2.5L13.5 5L5.5 13H3V10.5L11 2.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
              </svg>
            </div>
            {/* Extra gap + divider before delete — pencil and × used to sit
                right next to each other, easy to mis-tap. */}
            <div style={{ display: 'flex', alignItems: 'center', paddingLeft: 10, marginLeft: 2, borderLeft: '1px solid rgba(var(--gold-rgb),0.15)' }}>
              <SessionDeleteControl onDelete={onDelete} confirming={confirming} onConfirmingChange={setConfirming} />
            </div>
          </div>
        </div>
        {/* Photos moved up — right under the header — and read-only here. */}
        {consultation.photos.length > 0 && (
          <div onClick={(e) => e.stopPropagation()} style={{ marginBottom: 4 }}>
            <SessionPhotos photos={consultation.photos} onChange={() => {}} allowDelete={false} readOnly />
          </div>
        )}
        {(consultation.area || consultation.style) && (
          <div dir="auto" style={{ fontSize: fs(12), color: COLORS.textFaint, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 7 }}>
            {[consultation.area, consultation.style].filter(Boolean).join(' · ')}
          </div>
        )}
        {consultation.generalNotes && (
          <ExpandableText text={consultation.generalNotes} style={{ fontSize: fs(15), color: 'var(--text-soft2)', fontStyle: 'italic', lineHeight: 1.6 }} />
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
      </div>
    </div>
  );
}

// One session card in the client's dated timeline — same swipe-to-confirm
// delete as ConsultationRow above.
function SessionRow({
  session,
  onEdit,
  onDelete,
  onView,
  onToggleDone,
  onUpdatePhotos,
}: {
  session: Session;
  onEdit: (session: Session) => void;
  onDelete: () => void;
  onView: (session: Session) => void;
  onToggleDone: () => void;
  onUpdatePhotos: (photos: string[]) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const { swipeStyle, swipeHandlers, dragging } = useSwipeToReveal(() => setConfirming(true));
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        onClick={() => onView(session)}
        {...swipeHandlers}
        style={{
          background: 'rgba(var(--surface-rgb),0.018)',
          border: '1px solid rgba(var(--gold-rgb),0.1)',
          borderRadius: 2,
          padding: '12px 14px',
          cursor: 'pointer',
          transition: dragging ? 'none' : 'transform 0.2s ease',
          ...swipeStyle,
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
          <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 11, flexShrink: 0 }}>
            {session.cancelled && (
              <span
                style={{
                  fontSize: fs(10),
                  color: COLORS.textFaint,
                  border: '1px solid rgba(var(--gold-rgb),0.2)',
                  borderRadius: 2,
                  padding: '2px 6px',
                  letterSpacing: '0.8px',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                }}
              >
                Отменена
              </span>
            )}
            {!session.done && !session.cancelled && (
              <span
                onClick={onToggleDone}
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
            {session.done && session.healed && (
              <span
                title="Зажила"
                style={{
                  fontSize: fs(10),
                  color: COLORS.textFaint,
                  border: '1px solid rgba(var(--gold-rgb),0.2)',
                  borderRadius: 2,
                  padding: '2px 6px',
                  letterSpacing: '0.8px',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                }}
              >
                Зажила
              </span>
            )}
            {session.duration && <span style={{ fontSize: fs(13), color: COLORS.textGhost, fontStyle: 'italic' }}>{session.duration}</span>}
            <div
              className="inka-back"
              onClick={() => onEdit(session)}
              style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', opacity: 0.75 }}
              title="Редактировать сессию"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ color: COLORS.gold }}>
                <path d="M11 2.5L13.5 5L5.5 13H3V10.5L11 2.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
              </svg>
            </div>
            {/* Extra gap + divider before delete — pencil and × used to sit
                right next to each other, easy to mis-tap. */}
            <div style={{ display: 'flex', alignItems: 'center', paddingLeft: 10, marginLeft: 2, borderLeft: '1px solid rgba(var(--gold-rgb),0.15)' }}>
              <SessionDeleteControl onDelete={onDelete} confirming={confirming} onConfirmingChange={setConfirming} />
            </div>
          </div>
        </div>
        {/* Photos right under the header — same order as ConsultationRow.
            Still the card's own quick-add (onChange, allowDelete={false}),
            not the read-only viewer — this is the one place a photo can be
            added without opening the full edit form. */}
        <div onClick={(e) => e.stopPropagation()}>
          <SessionPhotos photos={session.photos} onChange={onUpdatePhotos} allowDelete={false} />
        </div>
        {session.area && (
          <div dir="auto" style={{ fontSize: fs(12), color: COLORS.textFaint, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 7 }}>
            {session.area}
          </div>
        )}
        {session.note && <ExpandableText text={session.note} style={{ fontSize: fs(15), color: 'var(--text-soft2)', fontStyle: 'italic', lineHeight: 1.6 }} />}
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
      </div>
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

// ── Project category picker (single-select chips, no emoji) ──
function ProjectCategoryChips({ value, onPick }: { value: ProjectCategory; onPick: (c: ProjectCategory) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {PROJECT_CATEGORIES.map((c) => {
        const on = value === c.key;
        return (
          <div
            key={c.key}
            onClick={() => onPick(c.key)}
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: fs(12),
              padding: '5px 9px',
              borderRadius: 2,
              cursor: 'pointer',
              border: on ? '1px solid rgba(var(--gold-rgb),0.65)' : '1px solid rgba(var(--gold-rgb),0.15)',
              color: on ? COLORS.gold : COLORS.textFaint,
              background: on ? 'rgba(var(--gold-rgb),0.08)' : 'transparent',
              letterSpacing: '0.4px',
              whiteSpace: 'nowrap',
              transition: 'all 0.2s',
            }}
          >
            {c.label}
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
  projects,
}: {
  note: ClientNote;
  onToggleDone: () => void;
  onDelete?: () => void;
  onUpdatePhotos?: (photos: string[]) => void;
  onEdit?: (text: string, urgency: UrgencyKey, projectId: string | null) => void;
  client?: Client;
  // Candidate projects this note could be tied to — a client note only
  // offers that client's own projects, a master (client-less) note only
  // offers client-less projects. Omitted entirely hides the project field.
  projects?: Project[];
}) {
  const meta = urgencyMeta(note.urgency);
  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState(note.text);
  const [draftUrgency, setDraftUrgency] = useState<UrgencyKey>(note.urgency);
  const [draftProjectId, setDraftProjectId] = useState<string | null>(note.projectId);
  // Actions (Выполнено/Изменить/Удалить) live behind a «⋮» overflow menu —
  // only the urgency symbol stays visible at rest, mirroring the filter bar.
  const [showActions, setShowActions] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  // Swiping the row is a shortcut straight to the same «Удалить? Да/Нет» —
  // it only reveals the confirm (via the «⋮» menu), never deletes outright.
  const { swipeStyle, swipeHandlers, dragging } = useSwipeToReveal(() => {
    setShowActions(true);
    setDeleteConfirm(true);
  });

  const startEdit = () => {
    setDraftText(note.text);
    setDraftUrgency(note.urgency);
    setDraftProjectId(note.projectId);
    setEditing(true);
    setShowActions(false);
  };
  const saveEdit = () => {
    const trimmed = draftText.trim();
    if (trimmed && onEdit) onEdit(trimmed, draftUrgency, draftProjectId);
    setEditing(false);
  };

  const menuRowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 6px',
    borderRadius: 2,
    cursor: 'pointer',
    fontSize: fs(12.5),
    letterSpacing: '0.3px',
  };

  return (
    <div
      {...swipeHandlers}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        border: '1px solid rgba(var(--gold-rgb),0.12)',
        borderRadius: 2,
        padding: '10px 12px',
        background: 'rgba(var(--surface-rgb),0.018)',
        opacity: note.done ? 0.45 : 1,
        transition: dragging ? 'opacity 0.3s' : 'opacity 0.3s, transform 0.2s ease',
        ...swipeStyle,
      }}
    >
      {/* Status marker — decorative only, always visible. */}
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
            {projects && projects.length > 0 && (
              <select
                value={draftProjectId ?? ''}
                onChange={(e) => setDraftProjectId(e.target.value || null)}
                style={{ ...INPUT_STYLE, marginTop: 8 }}
              >
                <option value="">— без проекта —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.title || 'Проект'}</option>
                ))}
              </select>
            )}
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

        {/* Edit mode keeps its Save/Cancel buttons inside the body. */}
        {editing && (
          <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            <div
              onClick={saveEdit}
              style={{
                flex: '1 1 72px',
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
                flex: '1 1 72px',
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
          </div>
        )}
      </div>

      {/* «⋮» — Выполнено / Изменить / Удалить, collapsed exactly like the
          filter bar's overflow menu: one dot-icon at rest, a small opaque
          dropdown with labelled rows when tapped. */}
      {!editing && (
        <div style={{ position: 'relative', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
          <div
            onClick={() => {
              setShowActions((v) => !v);
              setDeleteConfirm(false);
            }}
            role="button"
            aria-label="Действия"
            style={{
              width: 26,
              height: 26,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              borderRadius: '50%',
              border: showActions ? '1px solid rgba(var(--gold-rgb),0.4)' : '1px solid transparent',
              background: showActions ? 'rgba(var(--gold-rgb),0.08)' : 'transparent',
            }}
          >
            <svg width="4" height="16" viewBox="0 0 4 16" fill="none">
              <circle cx="2" cy="2" r="1.6" fill={COLORS.textFaint} />
              <circle cx="2" cy="8" r="1.6" fill={COLORS.textFaint} />
              <circle cx="2" cy="14" r="1.6" fill={COLORS.textFaint} />
            </svg>
          </div>
          {showActions && (
            <>
              <div onClick={() => setShowActions(false)} style={{ position: 'fixed', inset: 0, zIndex: 15 }} />
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  right: 0,
                  width: 168,
                  background: COLORS.sheet,
                  border: '1px solid rgba(var(--gold-rgb),0.2)',
                  borderRadius: 4,
                  padding: 6,
                  boxShadow: '0 10px 28px rgba(0,0,0,0.4)',
                  zIndex: 17,
                }}
              >
                {deleteConfirm ? (
                  <div style={{ padding: '6px 6px 4px' }}>
                    <div style={{ fontSize: fs(12), color: '#A85A66', fontStyle: 'italic', marginBottom: 8 }}>Удалить заметку?</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <div
                        onClick={() => {
                          onDelete?.();
                          setShowActions(false);
                          setDeleteConfirm(false);
                        }}
                        style={{ flex: 1, textAlign: 'center', padding: '6px 0', fontSize: fs(11.5), color: '#C56676', textTransform: 'uppercase', letterSpacing: '0.5px', cursor: 'pointer', border: '1px solid rgba(138,48,64,0.4)', borderRadius: 2 }}
                      >
                        Да
                      </div>
                      <div
                        onClick={() => setDeleteConfirm(false)}
                        style={{ flex: 1, textAlign: 'center', padding: '6px 0', fontSize: fs(11.5), color: COLORS.textFaint, textTransform: 'uppercase', letterSpacing: '0.5px', cursor: 'pointer', border: '1px solid rgba(var(--gold-rgb),0.15)', borderRadius: 2 }}
                      >
                        Нет
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div
                      onClick={() => {
                        onToggleDone();
                        setShowActions(false);
                      }}
                      style={{ ...menuRowStyle, color: '#4A7A5A' }}
                    >
                      {note.done ? (
                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                          <path d="M6 3.5L3 6.5L6 9.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M3 6.5H9.5C11.4 6.5 13 8.1 13 10C13 11.9 11.4 13.5 9.5 13.5H6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : (
                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                          <path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                      {note.done ? 'Вернуть в работу' : 'Выполнено'}
                    </div>
                    {onEdit && (
                      <div onClick={startEdit} style={{ ...menuRowStyle, color: COLORS.gold }}>
                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                          <path d="M11 2.5L13.5 5L5.5 13H3V10.5L11 2.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                        </svg>
                        Изменить
                      </div>
                    )}
                    {onDelete && (
                      <div onClick={() => setDeleteConfirm(true)} style={{ ...menuRowStyle, color: '#A85A66' }}>
                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                          <line x1="4" y1="4" x2="12" y2="12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                          <line x1="12" y1="4" x2="4" y2="12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                        </svg>
                        Удалить
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}
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
  projects,
  onUpsertNote,
  onAddNote,
  onDeleteNote,
}: {
  client: Client;
  // This client's own projects — candidates a note/task can be tied to.
  projects: Project[];
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
              projects={projects}
              onToggleDone={() => toggleDone(n)}
              onDelete={() => onDeleteNote(n.id)}
              onUpdatePhotos={(photos) => onUpsertNote({ ...n, photos })}
              onEdit={(text, urgency, projectId) => onUpsertNote({ ...n, text, urgency, projectId })}
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
// Read-only fullscreen viewer for a consultation or session — opened by tapping
// a timeline/Задачи card. A single «Редактировать» button drops into the edit
// form. Everything else is display-only.
function ViewField({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div>
      <div style={{ fontSize: fs(10), color: COLORS.textGhost, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 5 }}>{label}</div>
      <div dir="auto" style={{ fontSize: fs(15), color: 'var(--text-soft)', lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{value}</div>
    </div>
  );
}

// Пресеты тона — под капотом просто master_instruction в тот же
// /api/ingest, см. contentSync.ts. Названы напрямую по семи архетипам
// contentINKA (см. lib/prompts/archetypes.txt в contentinka), а не по
// настроению («теплее»/«жёстче») — так кнопка сразу говорит, какой голос
// перегенерирует текст. Каждый пресет ставит выбранный архетип в роль
// opens — ищет в уже написанном черновике фразы/образы, которые стоит
// сохранить, вместо переписывания с нуля (см. regenerate ниже, шлёт
// entry.textDraft как previous_draft, backend сам решает, что удержать).
// Символ вместо полного имени — компактнее в ряд из 8 кнопок; полное имя
// остаётся в title (подсказка при наведении/долгом тапе).
// «Ещё вариант» остаётся отдельно как чистая перегенерация без смены архетипа.
const TONE_PRESETS: { label: string; icon: string; instruction: string }[] = [
  { label: 'Трикстер', icon: '🦊', instruction: 'открой материал в архетипе Трикстер — резче, прямее, с лёгкой дерзостью, без пафоса' },
  { label: 'Женщина/Тепло', icon: '🤍', instruction: 'открой материал в архетипе Женщина/Тепло — теплее, мягче, телесно' },
  { label: 'Исследователь', icon: '🧭', instruction: 'открой материал в архетипе Исследователь — через любопытство и процесс поиска' },
  { label: 'Мудрец', icon: '🦉', instruction: 'открой материал в архетипе Мудрец — точнее, через понимание сути, без лекции' },
  { label: 'Дурак', icon: '🃏', instruction: 'открой материал в архетипе Дурак — проще, легче, с сухим юмором' },
  { label: 'Lover', icon: '🌹', instruction: 'открой материал в архетипе Lover — через чувственность и телесность, без цены' },
  { label: 'Творец', icon: '🎨', instruction: 'открой материал в архетипе Творец — через форму, материал и рождение образа' },
  { label: 'Ещё вариант', icon: '🔄', instruction: '' },
];

// Полноценный рабочий интерфейс ContentINKA — отдельная страница
// (NavFab → «Контент»). В отличие от ленивых точек входа (ContentPanel в
// TimelineViewSheet, вкладка клиента), отсюда можно: собрать материал с
// нуля (клиент/мастерская, тема, фото — без обязательной привязки к
// сессии), подтянуть в работу любую сессию/консультацию любого клиента, и
// применить полный набор действий (тон, перегенерация, поделиться,
// удалить) к любой уже созданной записи. Все три поверхности читают и
// пишут в один и тот же contentEntries — не разные хранилища.
function ContentINKAScreen({
  clients,
  contentEntries,
  onSaveEntry,
  onDeleteEntry,
}: {
  clients: Client[];
  contentEntries: ContentEntry[];
  onSaveEntry: (entry: ContentEntry) => void;
  onDeleteEntry: (id: string) => void;
}) {
  const [composerClientId, setComposerClientId] = useState<string | null>(null); // null = мастерская
  const [composerItemKey, setComposerItemKey] = useState<string>(''); // '' | 's:<id>' | 'c:<id>'
  const [composerText, setComposerText] = useState('');
  const [composerPhotos, setComposerPhotos] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterClientId, setFilterClientId] = useState<string>('all'); // 'all' | 'studio' | clientId

  const composerClient = clients.find((c) => c.id === composerClientId) ?? null;
  const composerItem = (() => {
    if (!composerClient || !composerItemKey) return null;
    const [kind, id] = composerItemKey.split(':');
    if (kind === 's') return { kind: 'session' as const, item: composerClient.sessions.find((s) => s.id === id) };
    if (kind === 'c') return { kind: 'consultation' as const, item: composerClient.consultations.find((c) => c.id === id) };
    return null;
  })();

  const resetComposer = () => {
    setComposerText('');
    setComposerPhotos([]);
  };

  const handleGenerate = async () => {
    if (!composerText.trim() && composerPhotos.length === 0 && !composerItem) return;
    setSending(true);
    setError(null);
    try {
      const clientName = composerClient ? `${composerClient.name} ${composerClient.surname}`.trim() : '';
      const linkedItem = composerItem?.item;
      const sourceType: 'session' | 'consultation' | 'freeform' =
        composerItem?.kind === 'session' ? 'session' : composerItem?.kind === 'consultation' ? 'consultation' : 'freeform';
      const sourceId = linkedItem?.id ?? null;
      const zone = linkedItem ? (linkedItem as Session & Consultation).area : '';
      const style = linkedItem?.style ?? '';
      const work = composerItem?.kind === 'session' ? (linkedItem as Session).name : undefined;
      const noteFallback =
        composerItem?.kind === 'session'
          ? (linkedItem as Session).note
          : composerItem?.kind === 'consultation'
          ? [
              (linkedItem as Consultation).generalNotes,
              (linkedItem as Consultation).feeling,
              (linkedItem as Consultation).creative,
              (linkedItem as Consultation).inspirationSources,
            ]
              .filter(Boolean)
              .join('\n\n')
          : '';
      const description = composerText.trim() || noteFallback;
      const photos = composerPhotos.length > 0 ? composerPhotos : linkedItem?.photos ?? [];

      const previews = await Promise.all(
        photos.map(async (photo, i) => ({ id: `new-${i}`, preview_data_url: await downsizeToPreview(photo) })),
      );
      const result = await sendToContent({
        sessionId: sourceId ?? `freeform-${Date.now()}`,
        sourceType,
        session: { client: clientName, work, zone, style, description },
        media: previews,
      });
      onSaveEntry({
        id: Date.now().toString(),
        createdDate: new Date().toISOString(),
        clientId: composerClientId,
        sourceType,
        sourceId,
        format: null,
        text: composerText,
        context: { client: clientName, work, zone, style, description },
        photos,
        contentDraft: result.media,
        visualArchetype: result.visual_archetype,
        textTriad: result.text_triad,
        textDraft: result.text_draft,
        status: 'draft',
      });
      resetComposer();
    } catch (err) {
      setError(err instanceof ContentSyncError ? err.message : 'Не удалось сгенерировать контент.');
    } finally {
      setSending(false);
    }
  };

  const regenerate = async (entry: ContentEntry, instruction: string) => {
    setError(null);
    try {
      const previews = await Promise.all(
        entry.photos.map(async (photo, i) => ({ id: `${entry.id}-${i}`, preview_data_url: await downsizeToPreview(photo) })),
      );
      const result = await sendToContent({
        sessionId: entry.sourceId ?? entry.id,
        sourceType: entry.sourceType,
        session: entry.context,
        media: previews,
        masterInstruction: instruction || undefined,
        previousDraft: entry.textDraft || undefined,
      });
      onSaveEntry({
        ...entry,
        contentDraft: result.media,
        visualArchetype: result.visual_archetype,
        textTriad: result.text_triad,
        textDraft: result.text_draft,
      });
    } catch (err) {
      setError(err instanceof ContentSyncError ? err.message : 'Не удалось перегенерировать.');
    }
  };

  const visibleEntries = contentEntries
    .filter((e) => (filterClientId === 'all' ? true : filterClientId === 'studio' ? e.clientId === null : e.clientId === filterClientId))
    .sort((a, b) => b.createdDate.localeCompare(a.createdDate));

  const clientLabel = (clientId: string | null) => {
    if (clientId === null) return 'Мастерская';
    const c = clients.find((x) => x.id === clientId);
    return c ? `${c.name} ${c.surname}`.trim() : '—';
  };

  return (
    <div style={{ minHeight: '100%' }}>
      <div style={{ height: 'calc(env(safe-area-inset-top) + 18px)' }} />
      <div style={{ padding: '6px 24px 12px' }}>
        <InkaLogo height={fs(15)} />
        <div style={{ fontSize: fs(24), color: COLORS.textPrimary, fontWeight: 300, letterSpacing: '1px', marginTop: 6 }}>ContentINKA</div>
        <StarDivider />
      </div>

      <div style={{ padding: '0 24px 40px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* ── Composer ── */}
        <GoldFrame plain style={{ padding: '16px 18px' }}>
          <div style={{ fontSize: fs(12), color: COLORS.gold, letterSpacing: '0.3px', marginBottom: 10 }}>Новая запись</div>

          <select
            value={composerClientId ?? ''}
            onChange={(e) => {
              setComposerClientId(e.target.value || null);
              setComposerItemKey('');
            }}
            style={{ ...INPUT_STYLE, marginBottom: 10 }}
          >
            <option value="">Мастерская (без клиента)</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {`${c.name} ${c.surname}`.trim()}
              </option>
            ))}
          </select>

          {composerClient && (composerClient.sessions.length > 0 || composerClient.consultations.length > 0) && (
            <select value={composerItemKey} onChange={(e) => setComposerItemKey(e.target.value)} style={{ ...INPUT_STYLE, marginBottom: 10 }}>
              <option value="">Без привязки к сессии</option>
              {composerClient.sessions.map((s) => (
                <option key={`s:${s.id}`} value={`s:${s.id}`}>
                  Сессия · {s.name || formatDate(s.date) || 'без названия'}
                </option>
              ))}
              {composerClient.consultations.map((c) => (
                <option key={`c:${c.id}`} value={`c:${c.id}`}>
                  Консультация · {formatDate(c.date) || 'без даты'}
                </option>
              ))}
            </select>
          )}

          <textarea
            value={composerText}
            onChange={(e) => setComposerText(e.target.value)}
            placeholder="Тема, мысль, инструкция — свободный ввод"
            rows={4}
            style={{ ...INPUT_STYLE, marginBottom: 10, resize: 'vertical', fontFamily: "'Inter', sans-serif" }}
          />

          <SessionPhotos photos={composerPhotos} onChange={setComposerPhotos} allowDelete buttonFirst />

          <div
            className="inka-submit"
            onClick={sending ? undefined : handleGenerate}
            style={{ ...SUBMIT_STYLE, marginTop: 12, opacity: sending ? 0.6 : 1, cursor: sending ? 'default' : 'pointer' }}
          >
            {sending ? 'Генерирую…' : 'Сгенерировать'}
          </div>
          {error && <div style={{ fontSize: fs(12), color: 'var(--urgent, #c0392b)', marginTop: 8 }}>{error}</div>}
        </GoldFrame>

        {/* ── Filter ── */}
        <select value={filterClientId} onChange={(e) => setFilterClientId(e.target.value)} style={INPUT_STYLE}>
          <option value="all">Все записи</option>
          <option value="studio">Мастерская</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {`${c.name} ${c.surname}`.trim()}
            </option>
          ))}
        </select>

        {/* ── List ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {visibleEntries.length === 0 && (
            <div style={{ fontSize: fs(14), color: COLORS.textGhost, fontStyle: 'italic' }}>Пока пусто.</div>
          )}
          {visibleEntries.map((entry) => (
            <GoldFrame key={entry.id} plain style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: fs(10), color: COLORS.textGhost, letterSpacing: '0.5px', marginBottom: 8 }}>
                {clientLabel(entry.clientId)}
                {entry.format === 'story' ? ' · сторис' : ''}
              </div>
              {entry.photos.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                  {entry.photos.map((p, i) => (
                    <img key={i} src={p} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 2, border: '1px solid rgba(var(--gold-rgb),0.15)' }} />
                  ))}
                </div>
              )}
              {entry.textDraft && (
                <div dir="auto" style={{ fontSize: fs(14), color: 'var(--text-soft)', lineHeight: 1.6, whiteSpace: 'pre-wrap', marginBottom: 10 }}>
                  {entry.textDraft}
                </div>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                {TONE_PRESETS.map((preset) => (
                  <span
                    key={preset.label}
                    title={preset.label}
                    aria-label={preset.label}
                    onClick={() => regenerate(entry, preset.instruction)}
                    style={{
                      fontSize: fs(15),
                      lineHeight: 1,
                      color: COLORS.textPrimary,
                      border: '1px solid rgba(var(--gold-rgb),0.3)',
                      borderRadius: 2,
                      padding: '6px 10px',
                      cursor: 'pointer',
                    }}
                  >
                    {preset.icon}
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 16 }}>
                <span onClick={() => shareContentEntry(entry.photos, entry.textDraft)} style={{ fontSize: fs(12), color: COLORS.textGhost, cursor: 'pointer', textDecoration: 'underline' }}>
                  Поделиться
                </span>
                <span onClick={() => onDeleteEntry(entry.id)} style={{ fontSize: fs(12), color: 'var(--urgent, #c0392b)', cursor: 'pointer', textDecoration: 'underline' }}>
                  Удалить
                </span>
              </div>
            </GoldFrame>
          ))}
        </div>
      </div>
    </div>
  );
}

function ContentPanel({
  clientId,
  clientName,
  sourceType,
  sourceId,
  photos,
  work,
  zone,
  style,
  description,
  entries,
  onSaveEntry,
  onDeleteEntry,
}: {
  clientId: string | null;
  clientName: string;
  sourceType: 'session' | 'consultation';
  sourceId: string;
  photos: string[];
  work?: string;
  zone: string;
  style: string;
  description: string;
  entries: ContentEntry[];
  onSaveEntry: (entry: ContentEntry) => void;
  onDeleteEntry: (id: string) => void;
}) {
  const fullEntry = entries.find((e) => e.sourceType === sourceType && e.sourceId === sourceId && e.format === null) ?? null;
  const storyEntry = entries.find((e) => e.sourceType === sourceType && e.sourceId === sourceId && e.format === 'story') ?? null;

  const [sendingFull, setSendingFull] = useState(false);
  const [sendingStory, setSendingStory] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (photos.length === 0 && !fullEntry && !storyEntry) return null;

  // Фолбэк на work/zone/style, если заметка пустая — «текст для сторис»
  // шлётся как freeform с media: [], а бэкенд требует непустой description.
  const richDescription = description.trim() || [work, zone, style].filter(Boolean).join(', ');

  const handleSendFull = async () => {
    if (photos.length === 0) return;
    setSendingFull(true);
    setError(null);
    try {
      const previews = await Promise.all(
        photos.map(async (photo, i) => ({
          id: `${sourceId}-${i}`,
          preview_data_url: await downsizeToPreview(photo),
        })),
      );
      const result = await sendToContent({
        sessionId: sourceId,
        sourceType,
        session: { client: clientName, work, zone, style, description },
        media: previews,
      });
      onSaveEntry({
        id: fullEntry?.id ?? `${sourceId}-full`,
        createdDate: fullEntry?.createdDate ?? new Date().toISOString(),
        clientId,
        sourceType,
        sourceId,
        format: null,
        text: '',
        context: { client: clientName, work, zone, style, description },
        photos,
        contentDraft: result.media,
        visualArchetype: result.visual_archetype,
        textTriad: result.text_triad,
        textDraft: result.text_draft,
        status: 'draft',
      });
    } catch (err) {
      setError(err instanceof ContentSyncError ? err.message : 'Не удалось отправить в контент.');
    } finally {
      setSendingFull(false);
    }
  };

  const handleQuickStory = async () => {
    setSendingStory(true);
    setError(null);
    try {
      const result = await sendToContent({
        sessionId: `${sourceId}-story`,
        sourceType: 'freeform',
        session: { client: clientName, work, zone, style, description: richDescription },
        media: [],
        masterInstruction: 'нужен короткий текст для формата сторис — не полный разбор, просто живая строка-две',
      });
      onSaveEntry({
        id: storyEntry?.id ?? `${sourceId}-story`,
        createdDate: storyEntry?.createdDate ?? new Date().toISOString(),
        clientId,
        sourceType,
        sourceId,
        format: 'story',
        text: '',
        context: { client: clientName, work, zone, style, description: richDescription },
        photos: [],
        contentDraft: null,
        visualArchetype: result.visual_archetype,
        textTriad: result.text_triad,
        textDraft: result.text_draft,
        status: 'draft',
      });
    } catch (err) {
      setError(err instanceof ContentSyncError ? err.message : 'Не удалось сгенерировать текст.');
    } finally {
      setSendingStory(false);
    }
  };

  const photoByIndexId = (id: string): string | undefined => {
    const idx = Number(id.slice(sourceId.length + 1));
    return Number.isFinite(idx) ? photos[idx] : undefined;
  };

  const linkStyle: React.CSSProperties = { fontSize: fs(12), color: COLORS.textGhost, cursor: 'pointer', textDecoration: 'underline' };
  const buttonStyle = (busy: boolean): React.CSSProperties => ({
    border: '1px solid rgba(var(--gold-rgb),0.35)',
    borderRadius: 2,
    padding: '10px 0',
    textAlign: 'center',
    fontSize: fs(13),
    letterSpacing: '1px',
    textTransform: 'uppercase',
    color: COLORS.textPrimary,
    opacity: busy ? 0.6 : 1,
    cursor: busy ? 'default' : 'pointer',
  });

  return (
    <div>
      <div style={{ fontSize: fs(10), color: COLORS.textGhost, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 8 }}>
        Контент
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {photos.length > 0 && (
          <div>
            {!fullEntry ? (
              <div className="inka-submit" onClick={sendingFull ? undefined : handleSendFull} style={buttonStyle(sendingFull)}>
                {sendingFull ? 'Отправляю…' : 'Отправить в контент'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {fullEntry.textDraft && (
                  <div dir="auto" style={{ fontSize: fs(14), color: 'var(--text-soft)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                    {fullEntry.textDraft}
                  </div>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {(fullEntry.contentDraft ?? [])
                    .filter((m) => m.technical_status === 'kept')
                    .map((m) => {
                      const src = photoByIndexId(m.id);
                      return (
                        <div key={m.id} style={{ width: 92 }}>
                          {src && (
                            <img
                              src={src}
                              alt=""
                              style={{
                                width: 92,
                                height: 92,
                                objectFit: 'cover',
                                borderRadius: 2,
                                border: m.cover_candidate ? '1px solid rgba(var(--gold-rgb),0.6)' : '1px solid rgba(var(--gold-rgb),0.15)',
                                display: 'block',
                              }}
                            />
                          )}
                          {(m.role || m.format) && (
                            <div style={{ fontSize: fs(9.5), color: COLORS.textGhost, marginTop: 4, textAlign: 'center', letterSpacing: '0.3px' }}>
                              {[m.role, m.format].filter(Boolean).join(' · ')}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
                <div style={{ display: 'flex', gap: 16 }}>
                  <span onClick={sendingFull ? undefined : handleSendFull} style={linkStyle}>
                    {sendingFull ? 'Отправляю…' : 'Отправить заново'}
                  </span>
                  <span
                    onClick={() =>
                      shareContentEntry(
                        photos.filter((_, i) => (fullEntry.contentDraft ?? []).some((m) => m.id === `${sourceId}-${i}` && m.technical_status === 'kept')),
                        fullEntry.textDraft,
                      )
                    }
                    style={linkStyle}
                  >
                    Поделиться
                  </span>
                  <span onClick={() => onDeleteEntry(fullEntry.id)} style={{ ...linkStyle, color: 'var(--urgent, #c0392b)' }}>
                    Удалить
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        <div>
          {!storyEntry ? (
            <span onClick={sendingStory ? undefined : handleQuickStory} style={linkStyle}>
              {sendingStory ? 'Генерирую…' : 'Текст для сторис'}
            </span>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: fs(10), color: COLORS.textGhost, letterSpacing: '1px', textTransform: 'uppercase' }}>Сторис</div>
              {storyEntry.textDraft && (
                <div dir="auto" style={{ fontSize: fs(14), color: 'var(--text-soft)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                  {storyEntry.textDraft}
                </div>
              )}
              <div style={{ display: 'flex', gap: 16 }}>
                <span onClick={sendingStory ? undefined : handleQuickStory} style={linkStyle}>
                  {sendingStory ? 'Генерирую…' : 'Ещё вариант'}
                </span>
                <span onClick={() => shareContentEntry([], storyEntry.textDraft)} style={linkStyle}>
                  Поделиться
                </span>
                <span onClick={() => onDeleteEntry(storyEntry.id)} style={{ ...linkStyle, color: 'var(--urgent, #c0392b)' }}>
                  Удалить
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {error && <div style={{ fontSize: fs(12), color: 'var(--urgent, #c0392b)', marginTop: 8 }}>{error}</div>}
    </div>
  );
}

function TimelineViewSheet({
  open,
  session,
  consultation,
  clientId,
  clientName,
  clientProjects,
  contentEntries,
  onClose,
  onEdit,
  onReassignProject,
  onSaveContentEntry,
  onDeleteContentEntry,
}: {
  open: boolean;
  session: Session | null;
  consultation: Consultation | null;
  clientId: string | null;
  clientName: string;
  // Проекты этого клиента — для быстрой смены проекта записи без захода в
  // полную форму редактирования (Этап 3a).
  clientProjects: Project[];
  contentEntries: ContentEntry[];
  onClose: () => void;
  onEdit: () => void;
  onReassignProject: (projectId: string | null) => void;
  onSaveContentEntry: (entry: ContentEntry) => void;
  onDeleteContentEntry: (id: string) => void;
}) {
  const isConsult = !!consultation;
  const dateLine = (() => {
    const d = isConsult ? consultation!.date : session?.date ?? '';
    const t = isConsult ? consultation!.time : session?.time ?? '';
    return [formatDate(d) || 'Дата не указана', t].filter(Boolean).join(' · ');
  })();
  const urgency = consultation ? urgencyMeta(consultation.urgency) : null;
  const currentProjectId = (isConsult ? consultation?.projectId : session?.projectId) ?? null;

  return (
    <BottomSheet open={open} heightPct={94}>
      <div style={{ padding: '16px 24px 14px', position: 'relative' }}>
        <SheetEditButton onClick={onEdit} />
        <SheetCloseButton onClose={onClose} />
        <div style={{ marginBottom: 5 }}>
          <InkaLogo height={fs(15)} />
        </div>
        <div style={{ fontSize: fs(22), color: COLORS.textPrimary, fontWeight: 300, letterSpacing: '1px' }}>
          {isConsult ? 'Консультация' : session?.name || 'Сессия'}
        </div>
        <div style={{ fontSize: fs(13), color: COLORS.textGhost, marginTop: 4, letterSpacing: '0.3px' }}>{dateLine}</div>
        <SheetStarDivider />
      </div>

      <div style={{ padding: '4px 24px 60px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {clientProjects.length > 0 && (
          <div>
            <div style={{ fontSize: fs(10), color: COLORS.textGhost, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 5 }}>Проект</div>
            <select
              value={currentProjectId ?? ''}
              onChange={(e) => onReassignProject(e.target.value || null)}
              style={{ ...INPUT_STYLE, fontSize: fs(14) }}
            >
              <option value="">— без проекта —</option>
              {clientProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title || 'Без названия'}
                </option>
              ))}
            </select>
          </div>
        )}
        {isConsult && consultation ? (
          <>
            {consultation.photos.length > 0 && <SessionPhotos photos={consultation.photos} onChange={() => {}} allowDelete={false} readOnly />}
            <ViewField label="Место" value={consultation.area} />
            <ViewField label="Общие заметки" value={consultation.generalNotes} />
            <ViewField label="Чувство / ощущение" value={consultation.feeling} />
            <ViewField label="Источники вдохновения" value={consultation.inspirationSources} />
            <ViewField label="Креатив" value={consultation.creative} />
            <ViewField label="Техника и стиль" value={consultation.style} />
            {urgency && <ViewField label="Срочность" value={`${urgency.emoji} ${urgency.label}`} />}
            <ContentPanel
              clientId={clientId}
              clientName={clientName}
              sourceType="consultation"
              sourceId={consultation.id}
              photos={consultation.photos}
              zone={consultation.area}
              style={consultation.style}
              description={[consultation.generalNotes, consultation.feeling, consultation.creative, consultation.inspirationSources]
                .filter(Boolean)
                .join('\n\n')}
              entries={contentEntries}
              onSaveEntry={onSaveContentEntry}
              onDeleteEntry={onDeleteContentEntry}
            />
          </>
        ) : session ? (
          <>
            {session.photos.length > 0 && <SessionPhotos photos={session.photos} onChange={() => {}} allowDelete={false} readOnly />}
            <ViewField label="Статус" value={session.done ? 'Выполнена' : 'Запланирована'} />
            <ViewField label="Длительность" value={session.duration} />
            <ViewField label="Место" value={session.area} />
            <ViewField label="Стиль" value={session.style} />
            <ViewField label="Заметка" value={session.note} />
            <ViewField label="Краски" value={session.colors} />
            <ViewField label="Иглы" value={session.needles} />
            <ViewField label="Реакция кожи" value={session.skinReaction} />
            <ContentPanel
              clientId={clientId}
              clientName={clientName}
              sourceType="session"
              sourceId={session.id}
              photos={session.photos}
              work={session.name}
              zone={session.area}
              style={session.style}
              description={session.note}
              entries={contentEntries}
              onSaveEntry={onSaveContentEntry}
              onDeleteEntry={onDeleteContentEntry}
            />
          </>
        ) : null}
      </div>
    </BottomSheet>
  );
}

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

// Тот же карандаш, что и «править» в шапке карточки клиента (см.
// DetailScreen) — единый визуальный язык для «редактировать» по всему
// приложению, вместо разнобоя из текстовых кнопок. Сидит слева от крестика
// закрытия, в том же верхнем правом углу read-only просмотров (Timeline/
// ProjectViewSheet), а не отдельной кнопкой внизу листа.
function SheetEditButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="inka-back" onClick={onClick} style={{ position: 'absolute', top: 17, right: 52, cursor: 'pointer', color: COLORS.gold, opacity: 0.85 }}>
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <path d="M11 2.5L13.5 5L5.5 13H3V10.5L11 2.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

// Sits in the same top-right corner as SheetCloseButton, same size — swapped
// in briefly after saving an edit (Session/Consultation) so the confirmation
// reads as "the close button turned into a checkmark" rather than an
// unrelated toast appearing elsewhere on the sheet.
function SheetSavedCheck() {
  return (
    <div style={{ position: 'absolute', top: 18, right: 24 }}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M2.5 8.3L6 11.8L13.5 4.3" stroke="#5E8C4A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

// ===================== CALENDAR SHEET =====================
// A month calendar opened from the «Ближайшая» badge on the client list.
// Days holding a session or consultation get a marker dot (gold = session,
// terracotta = consultation); tapping a day lists its entries below, and
// tapping an entry opens the read-only fullscreen viewer.
const WEEKDAYS_RU = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTHS_RU_FULL = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const CONSULT_MARK = '#B0413E';
// Открытые (ещё не забронированные) WALKIN/ONLINE-слоты от бота — тот же
// приглушённый шалфейный тон, что уже есть в палитре маркеров клиента.
const OPEN_SLOT_MARK = '#5E8C4A';

interface CalendarEvent {
  date: string;
  time: string;
  kind: 'session' | 'consultation';
  clientId: string;
  clientName: string;
  id: string;
  done: boolean;
}

// Buckets every dated session/consultation across all clients by ISO date,
// each day's list sorted by time (untimed entries sink to the bottom).
function collectCalendarEvents(clients: Client[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  const add = (e: CalendarEvent) => {
    const arr = map.get(e.date) ?? [];
    arr.push(e);
    map.set(e.date, arr);
  };
  for (const c of clients) {
    const clientName = [c.name, c.surname].filter(Boolean).join(' ').trim() || 'Клиент';
    for (const s of c.sessions) {
      if (ISO_DATE_RE.test(s.date)) add({ date: s.date, time: s.time, kind: 'session', clientId: c.id, clientName, id: s.id, done: s.done });
    }
    for (const cs of c.consultations) {
      if (ISO_DATE_RE.test(cs.date)) add({ date: cs.date, time: cs.time, kind: 'consultation', clientId: c.id, clientName, id: cs.id, done: cs.done });
    }
  }
  for (const arr of map.values()) arr.sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
  return map;
}

// День по календарю Asia/Jerusalem для ISO-времени бота — тот же приём,
// что и на стороне бота (jerusalemDayKey в lib/calendar.ts), только тут
// на чистом Intl, без сервера.
function botSlotDayKey(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
}

function CalendarSheet({
  open,
  onClose,
  clients,
  initialDate,
  calendarSync,
  onOpenEntry,
  onCreateEvent,
}: {
  open: boolean;
  onClose: () => void;
  clients: Client[];
  initialDate: string;
  calendarSync: CalendarSyncSettings;
  onOpenEntry: (kind: 'session' | 'consultation', clientId: string, id: string) => void;
  // Starts the record-a-session-or-consultation walk for the selected day.
  onCreateEvent: (date: string) => void;
}) {
  const events = useMemo(() => collectCalendarEvents(clients), [clients]);

  // Открытые (ещё не забронированные) WALKIN/ONLINE-слоты от бота — только
  // для отображения (точка в сетке + строка в списке дня), read-only,
  // никак не привязаны к клиентам. Тянем заново при каждом открытии листа,
  // а не один раз при монтировании — лист не размонтируется между
  // открытиями (см. BottomSheet), данные могли устареть.
  const [openSlots, setOpenSlots] = useState<BotBooking[]>([]);
  useEffect(() => {
    if (!open || !syncActive(calendarSync)) return;
    fetchBotBookings(calendarSync)
      .then((all) => setOpenSlots(all.filter((b) => b.kind === 'open_slot')))
      .catch(() => {
        /* тихо — календарь и без этого полезен, свои записи он показывает всегда */
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const openSlotsByDay = useMemo(() => {
    const map = new Map<string, BotBooking[]>();
    for (const s of openSlots) {
      const key = botSlotDayKey(s.start);
      const arr = map.get(key) ?? [];
      arr.push(s);
      map.set(key, arr);
    }
    for (const arr of map.values()) arr.sort((a, b) => a.start.localeCompare(b.start));
    return map;
  }, [openSlots]);
  const parseISO = (iso: string) => {
    const [y, mo, d] = iso.split('-').map(Number);
    return { y, m: mo - 1, d };
  };
  const startFrom = () => {
    if (ISO_DATE_RE.test(initialDate)) return parseISO(initialDate);
    const t = new Date();
    return { y: t.getFullYear(), m: t.getMonth(), d: t.getDate() };
  };

  const [cursor, setCursor] = useState(() => {
    const s = startFrom();
    return { y: s.y, m: s.m };
  });
  const [selected, setSelected] = useState<string | null>(ISO_DATE_RE.test(initialDate) ? initialDate : null);

  // Re-centre on the initial month/day each time the sheet opens.
  useEffect(() => {
    if (!open) return;
    const s = startFrom();
    setCursor({ y: s.y, m: s.m });
    setSelected(ISO_DATE_RE.test(initialDate) ? initialDate : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialDate]);

  const today = todayISO();

  // 6-week grid, Monday-first.
  const firstOfMonth = new Date(cursor.y, cursor.m, 1);
  const leading = (firstOfMonth.getDay() + 6) % 7; // JS 0=Sun → Mon-first offset
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < leading; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${cursor.y}-${String(cursor.m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const shiftMonth = (delta: number) =>
    setCursor((c) => {
      const nm = c.m + delta;
      return { y: c.y + Math.floor(nm / 12), m: ((nm % 12) + 12) % 12 };
    });

  const selectedEvents = selected ? events.get(selected) ?? [] : [];
  const selectedOpenSlots = selected ? openSlotsByDay.get(selected) ?? [] : [];

  const navArrowStyle: React.CSSProperties = {
    width: 40,
    height: 40,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '50%',
    cursor: 'pointer',
    fontSize: fs(22),
    color: COLORS.gold,
    border: '1px solid rgba(var(--gold-rgb),0.2)',
    userSelect: 'none',
  };
  const legendStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontSize: fs(10.5),
    letterSpacing: '0.5px',
    textTransform: 'uppercase',
    color: COLORS.textFaint,
  };

  return (
    <BottomSheet open={open} heightPct={94}>
      <SheetCloseButton onClose={onClose} />
      <div style={{ padding: '8px 22px 48px' }}>
        <div style={{ textAlign: 'center', fontSize: fs(11), letterSpacing: '2.5px', textTransform: 'uppercase', color: COLORS.textGhost, marginBottom: 18 }}>
          Календарь
        </div>

        {/* Month navigation */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div onClick={() => shiftMonth(-1)} role="button" aria-label="Предыдущий месяц" style={navArrowStyle}>
            ‹
          </div>
          <div style={{ fontFamily: DROP_CAP_FONT, fontSize: fs(21), color: COLORS.gold, letterSpacing: '0.5px' }}>
            {MONTHS_RU_FULL[cursor.m]} {cursor.y}
          </div>
          <div onClick={() => shiftMonth(1)} role="button" aria-label="Следующий месяц" style={navArrowStyle}>
            ›
          </div>
        </div>

        {/* Weekday header */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', marginBottom: 6 }}>
          {WEEKDAYS_RU.map((w) => (
            <div key={w} style={{ textAlign: 'center', fontSize: fs(9.5), letterSpacing: '0.5px', textTransform: 'uppercase', color: COLORS.textTrace }}>
              {w}
            </div>
          ))}
        </div>

        {/* Day grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3 }}>
          {cells.map((iso, i) => {
            if (!iso) return <div key={i} />;
            const dayEvents = events.get(iso) ?? [];
            const hasSession = dayEvents.some((e) => e.kind === 'session');
            const hasConsult = dayEvents.some((e) => e.kind === 'consultation');
            const dayOpenSlots = openSlotsByDay.get(iso) ?? [];
            const hasOpenSlot = dayOpenSlots.length > 0;
            const isToday = iso === today;
            const isSelected = iso === selected;
            const dayNum = Number(iso.split('-')[2]);
            return (
              <div
                key={i}
                onClick={() => setSelected(iso)}
                role="button"
                style={{
                  aspectRatio: '1 / 1',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 3,
                  cursor: 'pointer',
                  border: isSelected
                    ? '1px solid rgba(var(--gold-rgb),0.6)'
                    : isToday
                    ? '1px solid rgba(var(--gold-rgb),0.28)'
                    : '1px solid transparent',
                  background: isSelected ? 'rgba(var(--gold-rgb),0.08)' : 'transparent',
                }}
              >
                <div style={{ fontSize: fs(13.5), color: dayEvents.length || hasOpenSlot ? COLORS.textPrimary : COLORS.textFaint, fontWeight: isToday ? 700 : 400 }}>
                  {dayNum}
                </div>
                <div style={{ display: 'flex', gap: 2, height: 5, marginTop: 2 }}>
                  {hasSession && <span style={{ width: 4, height: 4, borderRadius: '50%', background: COLORS.gold }} />}
                  {hasConsult && <span style={{ width: 4, height: 4, borderRadius: '50%', background: CONSULT_MARK }} />}
                  {hasOpenSlot && <span style={{ width: 4, height: 4, borderRadius: '50%', background: OPEN_SLOT_MARK }} />}
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 20, margin: '18px 0 6px', flexWrap: 'wrap' }}>
          <span style={legendStyle}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: COLORS.gold, display: 'inline-block' }} /> сессия
          </span>
          <span style={legendStyle}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: CONSULT_MARK, display: 'inline-block' }} /> консультация
          </span>
          {syncActive(calendarSync) && (
            <span style={legendStyle}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: OPEN_SLOT_MARK, display: 'inline-block' }} /> свободный слот бота
            </span>
          )}
        </div>

        <div style={{ height: 1, background: 'rgba(var(--gold-rgb),0.12)', margin: '14px 0 16px' }} />

        {/* Selected day's entries */}
        {selected ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: fs(12), letterSpacing: '1px', textTransform: 'uppercase', color: COLORS.textGhost }}>
                {formatDate(selected)}
              </div>
              <div
                onClick={() => onCreateEvent(selected)}
                role="button"
                aria-label="Создать событие"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  fontSize: fs(11),
                  color: COLORS.gold,
                  letterSpacing: '0.5px',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  padding: '5px 10px',
                  border: '1px solid rgba(var(--gold-rgb),0.35)',
                  borderRadius: 2,
                }}
              >
                <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
                  <line x1="7" y1="2" x2="7" y2="12" stroke="var(--gold)" strokeWidth="1.5" strokeLinecap="round" />
                  <line x1="2" y1="7" x2="12" y2="7" stroke="var(--gold)" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                Создать
              </div>
            </div>
            {selectedEvents.length === 0 && selectedOpenSlots.length === 0 ? (
              <div style={{ fontStyle: 'italic', color: COLORS.textFaint, fontSize: fs(13) }}>Нет записей на этот день</div>
            ) : (
              <>
                {selectedEvents.map((e) => (
                  <div
                    key={e.kind + e.id}
                    onClick={() => onOpenEntry(e.kind, e.clientId, e.id)}
                    className="inka-dashed"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '11px 13px',
                      marginBottom: 8,
                      borderRadius: 3,
                      cursor: 'pointer',
                      border: '1px solid rgba(var(--gold-rgb),0.15)',
                      opacity: e.done ? 0.55 : 1,
                    }}
                  >
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: e.kind === 'session' ? COLORS.gold : CONSULT_MARK, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: fs(14.5), color: COLORS.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.clientName}</div>
                      <div style={{ fontSize: fs(10.5), color: COLORS.textFaint, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        {e.kind === 'session' ? 'Сессия' : 'Консультация'}
                        {e.done ? ' · выполнено' : ''}
                      </div>
                    </div>
                    {e.time && <div style={{ fontSize: fs(13.5), color: COLORS.gold, fontVariantNumeric: 'tabular-nums' }}>{e.time}</div>}
                  </div>
                ))}
                {/* Открытые слоты бота — read-only справка, клиента тут нет,
                    поэтому не кликабельны и не смешаны со списком выше. */}
                {selectedOpenSlots.map((s) => (
                  <div
                    key={s.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '11px 13px',
                      marginBottom: 8,
                      borderRadius: 3,
                      border: `1px dashed ${OPEN_SLOT_MARK}66`,
                    }}
                  >
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: OPEN_SLOT_MARK, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: fs(14.5), color: COLORS.textPrimary }}>{tagLabel(s.tag)}</div>
                      <div style={{ fontSize: fs(10.5), color: OPEN_SLOT_MARK, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        свободный слот бота
                      </div>
                    </div>
                    <div style={{ fontSize: fs(13.5), color: COLORS.gold, fontVariantNumeric: 'tabular-nums' }}>
                      {new Date(s.start).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' })}
                    </div>
                  </div>
                ))}
              </>
            )}
          </>
        ) : (
          <div style={{ fontStyle: 'italic', color: COLORS.textFaint, fontSize: fs(13), textAlign: 'center' }}>Выберите день, чтобы увидеть записи</div>
        )}
      </div>
    </BottomSheet>
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
  clientProjects,
  presetProjectId,
  initial,
  initialDate,
  onClose,
  onAdd,
}: {
  open: boolean;
  clientName: string;
  // Проекты этого клиента — для опциональной привязки сессии (Этап 2).
  clientProjects: Project[];
  // Предзаполняет «Проект» для новой сессии, созданной из просмотра проекта
  // (Этап 3b) — игнорируется при редактировании существующей.
  presetProjectId?: string | null;
  initial?: Session | null;
  // Prefills the date field for a brand-new session (e.g. started from a day
  // picked in the calendar) — ignored once `initial` is set (editing wins).
  initialDate?: string;
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
    healed: boolean;
    projectId: string | null;
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
  // New sessions default to «Выполнена»; editing reflects the session's
  // status; started from a calendar date (clearly a future booking), default
  // to «Запланирована» instead.
  const [done, setDone] = useState(true);
  const [healed, setHealed] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  // Briefly swaps the close «×» for a green check after saving an edit — see
  // SheetSavedCheck — so the save reads as confirmed rather than the sheet
  // just vanishing. Shown unconditionally on every edit-save, even when
  // nothing in the form actually changed.
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    if (open) {
      // Prefill from the session being edited, or start blank for a new one.
      setName(initial?.name ?? '');
      setDate(initial?.date ?? initialDate ?? '');
      setTime(initial?.time ?? '');
      setDuration(initial?.duration ?? '');
      setStyle(initial?.style ?? '');
      setArea(initial?.area ?? '');
      setColors(initial?.colors ?? '');
      setNeedles(initial?.needles ?? '');
      setSkinReaction(initial?.skinReaction ?? '');
      setNote(initial?.note ?? '');
      setPhotos(initial?.photos ?? []);
      setDone(initial ? initial.done : !initialDate);
      setHealed(initial?.healed ?? false);
      setProjectId(initial?.projectId ?? presetProjectId ?? null);
      setJustSaved(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSave = () => {
    const data = { name, date, time, duration, style, area, colors, needles, skinReaction, note, photos, done, healed, projectId };
    if (isEdit) {
      setJustSaved(true);
      setTimeout(() => onAdd(data), 700);
    } else {
      onAdd(data);
    }
  };

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
        {justSaved ? <SheetSavedCheck /> : <SheetCloseButton onClose={onClose} />}
        <div style={{ fontSize: fs(15), color: COLORS.textMuted, fontStyle: 'italic', marginBottom: 3, letterSpacing: '0.3px' }}>{clientName}</div>
        <div style={{ fontSize: fs(22), color: COLORS.textPrimary, fontWeight: 300, letterSpacing: '1px' }}>
          {isEdit ? 'Редактировать сессию' : 'Новая сессия'}
        </div>
        <SheetStarDivider />
      </div>

      <div style={{ padding: '4px 24px 50px' }}>
        {/* Photos first — same order as the consultation form (see
            NewConsultationSheet), rather than tacked on near the end. */}
        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Фото</FieldLabel>
          <SessionPhotos photos={photos} onChange={setPhotos} buttonFirst />
        </div>

        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Название сессии</FieldLabel>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Первая, контур..." style={INPUT_STYLE} />
        </div>

        {clientProjects.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <FieldLabel>Проект</FieldLabel>
            <select value={projectId ?? ''} onChange={(e) => setProjectId(e.target.value || null)} style={INPUT_STYLE}>
              <option value="">— без проекта —</option>
              {clientProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title || 'Без названия'}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Date & time stacked full-width. Side-by-side used to overlap on
            iOS, where the native pickers keep a large intrinsic width and
            won't shrink into a flex half-column. */}
        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Дата</FieldLabel>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...INPUT_STYLE, fontSize: fs(15) }} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Время</FieldLabel>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={{ ...INPUT_STYLE, fontSize: fs(15) }} />
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

        {/* Manually ticked once a healed-skin photo has been added — drives
            the ~30-day «напомнить о себе» reminder in Задачи/Мастер. */}
        <div
          onClick={() => setHealed((v) => !v)}
          role="button"
          aria-label="Зажив"
          style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22, cursor: 'pointer' }}
        >
          <div
            style={{
              width: 20,
              height: 20,
              borderRadius: 2,
              flexShrink: 0,
              border: healed ? '1px solid rgba(var(--gold-rgb),0.7)' : '1px solid rgba(var(--gold-rgb),0.3)',
              background: healed ? 'rgba(var(--gold-rgb),0.15)' : 'transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {healed && (
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                <path d="M2.5 7.3L5.5 10.3L11.5 3.7" stroke="var(--gold)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
          <span style={{ fontSize: fs(14), color: healed ? COLORS.gold : COLORS.textFaint }}>Зажив</span>
        </div>

        <div
          className="inka-submit"
          onClick={handleSave}
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
      role="button"
      aria-label={title}
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

// Мастерская's own «Создать»: «Новый проект» (бриф-карточка, как раньше) или
// «Сессия» без клиента (сразу просит выбрать/создать проект — см.
// ProjectSessionPickerSheet ниже), Этап 3b-доп.
function WorkshopCreateChoiceSheet({
  open,
  onClose,
  onPickProject,
  onPickSession,
}: {
  open: boolean;
  onClose: () => void;
  onPickProject: () => void;
  onPickSession: () => void;
}) {
  const choice = (title: string, desc: string, onClick: () => void, icon: React.ReactNode) => (
    <div
      onClick={onClick}
      role="button"
      aria-label={title}
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
          'Новый проект',
          'Бриф: тип, место, стиль, референсы...',
          onPickProject,
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
            <path d="M10 3v14M3 10h14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>,
        )}
        {choice(
          'Сессия',
          'Без клиента — привяжете позже',
          onPickSession,
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
            <rect x="3" y="4.5" width="14" height="12" rx="1" stroke="currentColor" strokeWidth="1.2" />
            <line x1="3" y1="8" x2="17" y2="8" stroke="currentColor" strokeWidth="1.2" />
            <line x1="6.5" y1="2.5" x2="6.5" y2="5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            <line x1="13.5" y1="2.5" x2="13.5" y2="5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>,
        )}
      </div>
    </BottomSheet>
  );
}

// Пикер «в какой проект» для сессии без клиента — список проектов БЕЗ
// клиента (у клиентских проектов сессия создаётся из вкладки клиента, там
// её и разместим). Пусто → сразу предлагает создать первый проект.
function ProjectSessionPickerSheet({
  open,
  projects,
  onClose,
  onPick,
  onCreateProject,
}: {
  open: boolean;
  projects: Project[];
  onClose: () => void;
  onPick: (project: Project) => void;
  onCreateProject: () => void;
}) {
  const clientless = projects.filter((p) => !p.clientId);
  return (
    <BottomSheet open={open} heightPct={50}>
      <div style={{ padding: '16px 24px 14px', position: 'relative' }}>
        <SheetCloseButton onClose={onClose} />
        <div style={{ fontSize: fs(22), color: COLORS.textPrimary, fontWeight: 300, letterSpacing: '1px' }}>В какой проект?</div>
        <SheetStarDivider />
      </div>
      <div style={{ padding: '4px 24px 40px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {clientless.length === 0 ? (
          <div style={{ fontSize: fs(13), color: COLORS.textGhost, fontStyle: 'italic' }}>
            Пока нет проектов без клиента — создайте первый.
          </div>
        ) : (
          clientless.map((p) => (
            <div
              key={p.id}
              onClick={() => onPick(p)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '11px 13px',
                borderRadius: 2,
                cursor: 'pointer',
                border: '1px solid rgba(var(--gold-rgb),0.2)',
                background: 'rgba(var(--surface-rgb),0.018)',
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
              <span style={{ fontSize: fs(15), color: COLORS.textPrimary, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.title || 'Без названия'}
              </span>
            </div>
          ))
        )}
        <div
          onClick={onCreateProject}
          style={{ textAlign: 'center', padding: '10px 0', color: COLORS.gold, fontSize: fs(13), letterSpacing: '0.5px', cursor: 'pointer', marginTop: 4 }}
        >
          + Новый проект
        </div>
      </div>
    </BottomSheet>
  );
}

// ===================== CALENDAR CREATION WALK: CLIENT KIND =====================
// Second step after picking Сессия/Консультация from the calendar — same
// two-card look as AddChoiceSheet, choosing between an existing client and a
// brand-new one.
function ClientKindChoiceSheet({
  open,
  onClose,
  onPickExisting,
  onPickNew,
}: {
  open: boolean;
  onClose: () => void;
  onPickExisting: () => void;
  onPickNew: () => void;
}) {
  const choice = (title: string, desc: string, onClick: () => void, icon: React.ReactNode) => (
    <div
      onClick={onClick}
      role="button"
      aria-label={title}
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
        <div style={{ fontSize: fs(22), color: COLORS.textPrimary, fontWeight: 300, letterSpacing: '1px' }}>Кто клиент?</div>
        <SheetStarDivider />
      </div>
      <div style={{ padding: '4px 24px 40px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {choice(
          'Существующий клиент',
          'Выбрать из уже сохранённых',
          onPickExisting,
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="6.6" r="3.3" stroke="currentColor" strokeWidth="1.3" />
            <path d="M4 17C4 13.4 6.6 11.7 10 11.7C13.4 11.7 16 13.4 16 17" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>,
        )}
        {choice(
          'Новый клиент',
          'Имя, цвет и телефон — остальное потом',
          onPickNew,
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
            <circle cx="8" cy="6.6" r="3" stroke="currentColor" strokeWidth="1.2" />
            <path d="M3 17C3 13.6 5.3 12 8 12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            <line x1="14.5" y1="9" x2="14.5" y2="15" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            <line x1="11.5" y1="12" x2="17.5" y2="12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>,
        )}
      </div>
    </BottomSheet>
  );
}

// ===================== CALENDAR CREATION WALK: EXISTING-CLIENT PICKER =====================
// A quick search + tap-to-pick list — compact rows, not the big grid cards
// used on the main list screen, since this is a fast lookup mid-flow.
function ClientPickerSheet({
  open,
  onClose,
  clients,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  clients: Client[];
  onPick: (clientId: string) => void;
}) {
  const [query, setQuery] = useState('');
  // BottomSheet content stays mounted even while closed (only translated
  // off-screen), so a plain `autoFocus` attribute would fire once on the
  // sheet's very first mount — regardless of `open` — and drag the whole
  // (still-hidden) sheet into view via the browser's focus-scroll behaviour.
  // Focusing explicitly on the open transition avoids that.
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      searchRef.current?.focus();
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...clients].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    if (!q) return sorted;
    return sorted.filter((c) => [c.name, c.surname].filter(Boolean).join(' ').toLowerCase().includes(q));
  }, [clients, query]);

  return (
    <BottomSheet open={open} heightPct={80}>
      <div style={{ padding: '16px 24px 14px', position: 'relative' }}>
        <SheetCloseButton onClose={onClose} />
        <div style={{ fontSize: fs(22), color: COLORS.textPrimary, fontWeight: 300, letterSpacing: '1px' }}>Выберите клиента</div>
        <SheetStarDivider />
      </div>
      <div style={{ padding: '4px 24px 12px' }}>
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Найти клиента..."
          style={INPUT_STYLE}
        />
      </div>
      <div style={{ padding: '4px 24px 40px', display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{ fontStyle: 'italic', color: COLORS.textGhost, fontSize: fs(14), textAlign: 'center', marginTop: 16 }}>
            {clients.length === 0 ? 'Клиентов пока нет' : 'Никого не нашлось'}
          </div>
        ) : (
          filtered.map((c) => (
            <div
              key={c.id}
              onClick={() => onPick(c.id)}
              className="inka-dashed"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '11px 13px',
                borderRadius: 3,
                cursor: 'pointer',
                border: '1px solid rgba(var(--gold-rgb),0.15)',
              }}
            >
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
              <div dir="auto" style={{ fontSize: fs(15), color: COLORS.textPrimary }}>
                {[c.name, c.surname].filter(Boolean).join(' ') || '—'}
              </div>
            </div>
          ))
        )}
      </div>
    </BottomSheet>
  );
}

// ===================== CALENDAR CREATION WALK: QUICK NEW CLIENT =====================
// Minimal client creation for the calendar flow — just enough to attach a
// session/consultation to somebody real; the rest of the profile (styles,
// skin, notes...) gets filled in later from the client's own card.
function QuickClientSheet({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (data: { name: string; color: string; phone: string }) => void;
}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(MARKER_COLORS[0]);
  const [phone, setPhone] = useState('');
  // See ClientPickerSheet — BottomSheet content stays mounted while closed,
  // so focusing is driven by the `open` transition, not a raw `autoFocus`
  // attribute (which would fire once on first mount regardless of visibility
  // and drag the still-hidden sheet into view).
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName('');
      setColor(MARKER_COLORS[0]);
      setPhone('');
      nameRef.current?.focus();
    }
  }, [open]);

  const canSubmit = name.trim().length > 0;

  return (
    <BottomSheet open={open} heightPct={62}>
      <div style={{ padding: '16px 24px 14px', position: 'relative' }}>
        <SheetCloseButton onClose={onClose} />
        <div style={{ fontSize: fs(22), color: COLORS.textPrimary, fontWeight: 300, letterSpacing: '1px' }}>Новый клиент</div>
        <SheetStarDivider />
      </div>
      <div style={{ padding: '4px 24px 40px' }}>
        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Имя</FieldLabel>
          <input ref={nameRef} dir="auto" value={name} onChange={(e) => setName(e.target.value)} placeholder="Александра" style={INPUT_STYLE} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Телефон</FieldLabel>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+7 900 000-00-00" style={INPUT_STYLE} />
        </div>
        <div style={{ marginBottom: 22 }}>
          <FieldLabel>Цвет-маркер</FieldLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {MARKER_COLORS.map((c) => (
              <div
                key={c}
                onClick={() => setColor(c)}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  background: c,
                  cursor: 'pointer',
                  border: color === c ? '2px solid var(--text)' : '2px solid transparent',
                  boxShadow: color === c ? '0 0 0 2px rgba(var(--gold-rgb),0.5)' : 'none',
                }}
              />
            ))}
          </div>
        </div>
        <div
          className="inka-submit"
          onClick={() => canSubmit && onCreate({ name, color, phone })}
          style={{ ...SUBMIT_STYLE, opacity: canSubmit ? 1 : 0.4, cursor: canSubmit ? 'pointer' : 'default' }}
        >
          <span style={{ fontFamily: "'Kelly Slab', 'Playfair Display', serif", fontSize: fs(13), color: COLORS.gold, letterSpacing: '2px' }}>
            Создать и продолжить
          </span>
        </div>
      </div>
    </BottomSheet>
  );
}

function NewConsultationSheet({
  open,
  clientName,
  client,
  clientProjects,
  presetProjectId,
  initial,
  initialDate,
  onClose,
  onAdd,
}: {
  open: boolean;
  clientName: string;
  client: Client | null;
  // Проекты этого клиента — для опциональной привязки консультации (Этап 2).
  clientProjects: Project[];
  // Предзаполняет «Проект» для новой консультации из просмотра проекта (3b).
  presetProjectId?: string | null;
  initial?: Consultation | null;
  // Prefills the date field for a brand-new consultation (e.g. started from a
  // day picked in the calendar) — ignored once `initial` is set.
  initialDate?: string;
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
    projectId: string | null;
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
  const [projectId, setProjectId] = useState<string | null>(null);
  // See NewSessionSheet's justSaved for why this shows unconditionally on
  // every edit-save, not just when something actually changed.
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    if (open) {
      setDate(initial?.date ?? initialDate ?? '');
      setTime(initial?.time ?? '');
      setArea(initial?.area ?? '');
      setStyle(initial?.style ?? '');
      setGeneralNotes(initial?.generalNotes ?? '');
      setFeeling(initial?.feeling ?? '');
      setCreative(initial?.creative ?? '');
      setInspirationSources(initial?.inspirationSources ?? '');
      setUrgency(initial?.urgency ?? 'important');
      setPhotos(initial?.photos ?? []);
      setProjectId(initial?.projectId ?? presetProjectId ?? null);
      setJustSaved(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSave = () => {
    const data = { date, time, area, style, generalNotes, feeling, creative, inspirationSources, urgency, photos, projectId };
    if (isEdit) {
      setJustSaved(true);
      setTimeout(() => onAdd(data), 700);
    } else {
      onAdd(data);
    }
  };

  return (
    <BottomSheet open={open} heightPct={85}>
      <div style={{ padding: '16px 24px 14px', position: 'relative' }}>
        {justSaved ? <SheetSavedCheck /> : <SheetCloseButton onClose={onClose} />}
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
          {/* Stacked full-width (see NewSessionSheet) — avoids the iOS overlap
              of side-by-side native date/time pickers. */}
          <div style={{ marginBottom: 16 }}>
            <FieldLabel>Дата</FieldLabel>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...INPUT_STYLE, fontSize: fs(15) }} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <FieldLabel>Время</FieldLabel>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={{ ...INPUT_STYLE, fontSize: fs(15) }} />
          </div>

          <div style={{ marginBottom: 16 }}>
            <FieldLabel>Место</FieldLabel>
            <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Левое плечо, рёбра..." style={INPUT_STYLE} />
          </div>

          {clientProjects.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <FieldLabel>Проект</FieldLabel>
              <select value={projectId ?? ''} onChange={(e) => setProjectId(e.target.value || null)} style={INPUT_STYLE}>
                <option value="">— без проекта —</option>
                {clientProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title || 'Без названия'}
                  </option>
                ))}
              </select>
            </div>
          )}

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
          onClick={handleSave}
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

// ── Read-only просмотр проекта (Этап 2) ──
// Открывается по тапу на проект (в Мастерской или в «Активных проектах»
// Планнера). Сверху статус, следующий шаг и записи проекта; редактирование
// — отдельной кнопкой, а не сразу форма. Записи тапабельны — открывают
// существующий просмотр сессии/консультации.
function ProjectViewSheet({
  open,
  project,
  clients,
  masterNotes,
  onClose,
  onEdit,
  onOpenEntry,
  onEditProjectSession,
  onToggleTaskDone,
}: {
  open: boolean;
  project: Project | null;
  clients: Client[];
  // Master's own (client-less) tasks — a project without a client draws its
  // «Задачи» from here instead of a client's notes.
  masterNotes: ClientNote[];
  onClose: () => void;
  onEdit: (project: Project) => void;
  onOpenEntry: (clientId: string, kind: 'session' | 'consultation', id: string) => void;
  // Тап по «сессии без клиента» в списке записей — открыть её на
  // редактирование. Создание новых записей теперь только через главную
  // кнопку «Создать» (остаётся видна поверх этого просмотра — см. onCreate
  // у NavFab), отдельных кнопок создания здесь больше нет.
  onEditProjectSession: (projectId: string, session: Session) => void;
  onToggleTaskDone: (clientId: string | null, note: ClientNote) => void;
}) {
  const clientName = project ? clientNameFor(clients, project.clientId) : null;
  const linkedClient = project?.clientId ? clients.find((c) => c.id === project.clientId) ?? null : null;
  const linkedSessions = linkedClient && project ? getSessionsByProjectId(linkedClient.sessions, project.id) : [];
  const linkedConsults = linkedClient && project ? getConsultationsByProjectId(linkedClient.consultations, project.id) : [];
  const ownSessions = project && !linkedClient ? project.sessions : [];
  const linkedTasks = project
    ? linkedClient
      ? getTasksByProjectId(linkedClient.notes, project.id)
      : getTasksByProjectId(masterNotes, project.id)
    : [];

  const chipStyle: React.CSSProperties = {
    fontSize: fs(11),
    color: COLORS.textFaint,
    border: '1px solid rgba(var(--gold-rgb),0.3)',
    borderRadius: 2,
    padding: '3px 9px',
    letterSpacing: '0.5px',
  };
  const entryRowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '9px 11px',
    borderRadius: 2,
    cursor: 'pointer',
    border: '1px solid rgba(var(--gold-rgb),0.15)',
    background: 'rgba(var(--surface-rgb),0.018)',
  };

  return (
    <BottomSheet open={open} heightPct={90}>
      <div style={{ padding: '16px 24px 14px', position: 'relative' }}>
        {project && <SheetEditButton onClick={() => onEdit(project)} />}
        <SheetCloseButton onClose={onClose} />
        <div style={{ fontSize: fs(15), color: COLORS.textMuted, fontStyle: 'italic', marginBottom: 3, letterSpacing: '0.3px' }}>
          {clientName ?? 'Мастерская'}
        </div>
        <div style={{ fontSize: fs(22), color: COLORS.textPrimary, fontWeight: 300, letterSpacing: '1px' }}>
          {project?.title || 'Проект'}
        </div>
        <SheetStarDivider />
      </div>

      <div style={{ padding: '4px 24px 40px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {project && (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <span style={chipStyle}>{PROJECT_STAGES.find((s) => s.key === project.stage)?.label ?? project.stage}</span>
              <span style={chipStyle}>{PROJECT_STATES.find((s) => s.key === project.state)?.label ?? project.state}</span>
              {project.waitingFor !== 'none' && (
                <span style={chipStyle}>Ждём: {PROJECT_WAITING_FOR.find((w) => w.key === project.waitingFor)?.label}</span>
              )}
              {project.priority !== 'normal' && (
                <span style={chipStyle}>{PROJECT_PRIORITIES.find((p) => p.key === project.priority)?.label}</span>
              )}
            </div>

            {project.nextActionText && (
              <div>
                <div style={{ fontSize: fs(10), color: COLORS.textGhost, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 5 }}>Следующий шаг</div>
                <div dir="auto" style={{ fontSize: fs(15), color: COLORS.textPrimary, lineHeight: 1.5 }}>
                  {project.nextActionText}
                  {project.nextActionDate ? ` · ${formatDate(project.nextActionDate)}` : ''}
                </div>
              </div>
            )}

            {project.photos.length > 0 && <SessionPhotos photos={project.photos} onChange={() => {}} allowDelete={false} readOnly />}

            <ViewField label="Место" value={project.area} />
            <ViewField label="Техника и стиль" value={project.style} />
            <ViewField label="Общие заметки" value={project.generalNotes} />
            <ViewField label="Чувство / ощущение" value={project.feeling} />
            <ViewField label="Креатив" value={project.creative} />
            <ViewField label="Источники вдохновения" value={project.inspirationSources} />

            {(linkedSessions.length > 0 || linkedConsults.length > 0 || ownSessions.length > 0) && (
              <div>
                <div style={{ fontSize: fs(10), color: COLORS.textGhost, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 5 }}>Записи проекта</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {linkedSessions.map((s) => (
                    <div key={`s-${s.id}`} onClick={() => linkedClient && onOpenEntry(linkedClient.id, 'session', s.id)} style={entryRowStyle}>
                      <span style={{ fontSize: fs(9), color: COLORS.gold, letterSpacing: '1px', textTransform: 'uppercase', flexShrink: 0 }}>Сессия</span>
                      <span style={{ fontSize: fs(14), color: COLORS.textPrimary, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.name || s.area || '—'}
                      </span>
                      <span style={{ fontSize: fs(12), color: COLORS.textGhost, flexShrink: 0 }}>
                        {s.date ? formatDate(s.date).replace(/ \d{4}$/, '') : ''}
                      </span>
                    </div>
                  ))}
                  {linkedConsults.map((c) => (
                    <div key={`c-${c.id}`} onClick={() => linkedClient && onOpenEntry(linkedClient.id, 'consultation', c.id)} style={entryRowStyle}>
                      <span style={{ fontSize: fs(9), color: COLORS.gold, letterSpacing: '1px', textTransform: 'uppercase', flexShrink: 0 }}>Консультация</span>
                      <span style={{ fontSize: fs(14), color: COLORS.textPrimary, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.area || '—'}
                      </span>
                      <span style={{ fontSize: fs(12), color: COLORS.textGhost, flexShrink: 0 }}>
                        {c.date ? formatDate(c.date).replace(/ \d{4}$/, '') : ''}
                      </span>
                    </div>
                  ))}
                  {ownSessions.map((s) => (
                    <div key={`os-${s.id}`} onClick={() => project && onEditProjectSession(project.id, s)} style={entryRowStyle}>
                      <span style={{ fontSize: fs(9), color: COLORS.gold, letterSpacing: '1px', textTransform: 'uppercase', flexShrink: 0 }}>Сессия · без клиента</span>
                      <span style={{ fontSize: fs(14), color: COLORS.textPrimary, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.name || s.area || '—'}
                      </span>
                      <span style={{ fontSize: fs(12), color: COLORS.textGhost, flexShrink: 0 }}>
                        {s.date ? formatDate(s.date).replace(/ \d{4}$/, '') : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {linkedTasks.length > 0 && (
              <div>
                <div style={{ fontSize: fs(10), color: COLORS.textGhost, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 5 }}>Задачи</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {linkedTasks.map((n) => (
                    <div
                      key={`t-${n.id}`}
                      onClick={() => onToggleTaskDone(linkedClient?.id ?? null, n)}
                      style={{ ...entryRowStyle, opacity: n.done ? 0.45 : 1 }}
                    >
                      <span style={{ fontSize: fs(16), lineHeight: 1.2, flexShrink: 0 }}>{n.done ? DONE_EMOJI : urgencyMeta(n.urgency).emoji}</span>
                      <span
                        dir="auto"
                        style={{
                          fontSize: fs(14),
                          color: COLORS.textPrimary,
                          flex: 1,
                          minWidth: 0,
                          textDecoration: n.done ? 'line-through' : 'none',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {n.text}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </BottomSheet>
  );
}

// ── Новый / редактирование проекта («Творческая мастерская») — same field
// set as NewConsultationSheet (same kind of creative brief), minus the
// client-skin block (there's no client) and urgency chips, plus a title and
// a colour tag (MarkerColorPalette) since a project has no client.color to
// borrow for its cover. ──
function NewProjectSheet({
  open,
  initial,
  presetClientId,
  clients,
  onClose,
  onAdd,
  onDelete,
}: {
  open: boolean;
  initial?: Project | null;
  // Предзаполняет клиента для НОВОГО проекта (Этап 3a, кнопка «+ Новый» во
  // вкладке клиента) — игнорируется при редактировании существующего.
  presetClientId?: string | null;
  clients: Client[];
  onClose: () => void;
  onAdd: (data: {
    title: string;
    color: string;
    category: ProjectCategory;
    clientId: string | null;
    stage: ProjectStage;
    state: ProjectState;
    waitingFor: ProjectWaitingFor;
    nextActionText: string;
    nextActionDate: string | null;
    priority: ProjectPriority;
    area: string;
    style: string;
    generalNotes: string;
    feeling: string;
    creative: string;
    inspirationSources: string;
    photos: string[];
  }) => void;
  // Present only when editing an existing project — omitted for a new one.
  onDelete?: () => void;
}) {
  const isEdit = !!initial;
  const [title, setTitle] = useState('');
  const [color, setColor] = useState(MARKER_COLORS[0]);
  const [category, setCategory] = useState<ProjectCategory>('tattoo');
  const [clientId, setClientId] = useState<string | null>(null);
  const [stage, setStage] = useState<ProjectStage>('idea');
  const [state, setState] = useState<ProjectState>('active');
  const [waitingFor, setWaitingFor] = useState<ProjectWaitingFor>('none');
  const [nextActionText, setNextActionText] = useState('');
  const [nextActionDate, setNextActionDate] = useState('');
  const [priority, setPriority] = useState<ProjectPriority>('normal');
  const [area, setArea] = useState('');
  const [style, setStyle] = useState('');
  const [generalNotes, setGeneralNotes] = useState('');
  const [feeling, setFeeling] = useState('');
  const [creative, setCreative] = useState('');
  const [inspirationSources, setInspirationSources] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // See NewSessionSheet's justSaved — same «крестик превращается в зелёную
  // галочку» подтверждение, единообразно для всех форм редактирования.
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(initial?.title ?? '');
      setColor(initial?.color ?? MARKER_COLORS[0]);
      setCategory(initial?.category ?? 'tattoo');
      setClientId(initial?.clientId ?? presetClientId ?? null);
      setStage(initial?.stage ?? 'idea');
      setState(initial?.state ?? 'active');
      setWaitingFor(initial?.waitingFor ?? 'none');
      setNextActionText(initial?.nextActionText ?? '');
      setNextActionDate(initial?.nextActionDate ?? '');
      setPriority(initial?.priority ?? 'normal');
      setArea(initial?.area ?? '');
      setStyle(initial?.style ?? '');
      setGeneralNotes(initial?.generalNotes ?? '');
      setFeeling(initial?.feeling ?? '');
      setCreative(initial?.creative ?? '');
      setInspirationSources(initial?.inspirationSources ?? '');
      setPhotos(initial?.photos ?? []);
      setConfirmingDelete(false);
      setJustSaved(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <BottomSheet open={open} heightPct={85}>
      <div style={{ padding: '16px 24px 14px', position: 'relative' }}>
        {justSaved ? <SheetSavedCheck /> : <SheetCloseButton onClose={onClose} />}
        <div style={{ fontSize: fs(15), color: COLORS.textMuted, fontStyle: 'italic', marginBottom: 3, letterSpacing: '0.3px' }}>Мастерская</div>
        <div style={{ fontSize: fs(22), color: COLORS.textPrimary, fontWeight: 300, letterSpacing: '1px' }}>
          {isEdit ? 'Редактировать проект' : 'Новый проект'}
        </div>
        <SheetStarDivider />
      </div>

      <div className="inka-consult-grid" style={{ padding: '4px 24px 20px' }}>
        <div className="inka-consult-left">
          <div style={{ marginBottom: 16 }}>
            <FieldLabel>Фотографии</FieldLabel>
            <SessionPhotos photos={photos} onChange={setPhotos} buttonFirst />
          </div>

          <div style={{ marginBottom: 16 }}>
            <FieldLabel>Цветовая метка</FieldLabel>
            <MarkerColorPalette value={color} onPick={setColor} />
          </div>
        </div>

        <div className="inka-consult-right">
          <div style={{ marginBottom: 16 }}>
            <FieldLabel>Название</FieldLabel>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Дракон в стиле джапан..." style={INPUT_STYLE} />
          </div>

          <div style={{ marginBottom: 16 }}>
            <FieldLabel>Тип</FieldLabel>
            <ProjectCategoryChips value={category} onPick={setCategory} />
          </div>

          <div style={{ marginBottom: 16 }}>
            <FieldLabel>Клиент</FieldLabel>
            <select value={clientId ?? ''} onChange={(e) => setClientId(e.target.value || null)} style={INPUT_STYLE}>
              <option value="">Мастерская (без клиента)</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {`${c.name} ${c.surname}`.trim()}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 16, display: 'flex', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <FieldLabel>Этап</FieldLabel>
              <select value={stage} onChange={(e) => setStage(e.target.value as ProjectStage)} style={INPUT_STYLE}>
                {PROJECT_STAGES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <FieldLabel>Состояние</FieldLabel>
              <select value={state} onChange={(e) => setState(e.target.value as ProjectState)} style={INPUT_STYLE}>
                {PROJECT_STATES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 16, display: 'flex', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <FieldLabel>Ждём</FieldLabel>
              <select value={waitingFor} onChange={(e) => setWaitingFor(e.target.value as ProjectWaitingFor)} style={INPUT_STYLE}>
                {PROJECT_WAITING_FOR.map((w) => (
                  <option key={w.key} value={w.key}>
                    {w.label}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <FieldLabel>Приоритет</FieldLabel>
              <select value={priority} onChange={(e) => setPriority(e.target.value as ProjectPriority)} style={INPUT_STYLE}>
                {PROJECT_PRIORITIES.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <FieldLabel>Следующий шаг</FieldLabel>
            <input
              value={nextActionText}
              onChange={(e) => setNextActionText(e.target.value)}
              placeholder="Уточнить размер, получить фото спины..."
              style={{ ...INPUT_STYLE, marginBottom: 8 }}
            />
            <div style={{ fontSize: fs(10), color: COLORS.textGhost, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 5 }}>
              Дата (когда сделать)
            </div>
            <input type="date" value={nextActionDate} onChange={(e) => setNextActionDate(e.target.value)} style={INPUT_STYLE} />
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
              placeholder="Идея, договорённости, мысли мастера..."
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

        </div>
      </div>

      <div style={{ padding: '0 24px 40px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div
          className="inka-submit"
          onClick={() => {
            const data = {
              title,
              color,
              category,
              clientId,
              stage,
              state,
              waitingFor,
              nextActionText,
              nextActionDate: nextActionDate || null,
              priority,
              area,
              style,
              generalNotes,
              feeling,
              creative,
              inspirationSources,
              photos,
            };
            if (isEdit) {
              setJustSaved(true);
              setTimeout(() => onAdd(data), 700);
            } else {
              onAdd(data);
            }
          }}
          style={SUBMIT_STYLE}
        >
          <span style={{ fontFamily: "'Kelly Slab', 'Playfair Display', serif", fontSize: fs(13), color: COLORS.gold, letterSpacing: '2px' }}>
            {isEdit ? 'Сохранить' : 'Добавить проект'}
          </span>
        </div>

        {onDelete && (
          confirmingDelete ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <div
                onClick={() => setConfirmingDelete(false)}
                style={{ flex: 1, minWidth: 0, textAlign: 'center', padding: '10px 4px', borderRadius: 2, border: '1px solid rgba(var(--gold-rgb),0.15)', color: COLORS.textFaint, fontSize: fs(13), letterSpacing: '1px', textTransform: 'uppercase', cursor: 'pointer', wordBreak: 'break-word' }}
              >
                Отмена
              </div>
              <div
                onClick={onDelete}
                style={{ flex: 1, minWidth: 0, textAlign: 'center', padding: '10px 4px', borderRadius: 2, border: '1px solid rgba(200,90,90,0.4)', color: '#C56676', fontSize: fs(13), letterSpacing: '1px', textTransform: 'uppercase', cursor: 'pointer', wordBreak: 'break-word' }}
              >
                Удалить проект
              </div>
            </div>
          ) : (
            <div
              onClick={() => setConfirmingDelete(true)}
              style={{ textAlign: 'center', padding: '10px 0', color: COLORS.textFaint, fontSize: fs(12), letterSpacing: '1px', textTransform: 'uppercase', cursor: 'pointer' }}
            >
              Удалить проект
            </div>
          )
        )}
      </div>
    </BottomSheet>
  );
}
