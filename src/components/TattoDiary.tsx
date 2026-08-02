import { memo, useState, useEffect, useRef, useMemo, type ReactNode, type SVGProps } from 'react';
import { createPortal } from 'react-dom';
import { InkaLogo, DROP_CAP_FONT } from './InkaLogo';
import { NavFab } from './navigation/NavFab';
import { ToolbarIcon } from './navigation/ToolbarIcons';
import {
  readSyncSettings,
  writeSyncSettings,
  syncActive,
  diffAndSync,
  setConflictHandler,
  DEFAULT_ENDPOINT,
  type CalendarSyncSettings,
} from '../lib/calendarSync';
import {
  createContentIngestJob,
  translateContentText,
  ContentSyncError,
  readContentSyncSettings,
  writeContentSyncSettings,
  type ContentIngestParams,
  type ContentSyncSettings,
  type ContentTranslationLanguage,
} from '../lib/contentSync';
import {
  CONTENT_INGEST_JOB_STORE,
  TATTO_DIARY_DB_VERSION,
  deleteContentEntryAndRefreshJobs,
  deleteContentIngestJob,
  ensureContentIngestJobStore,
  loadContentIngestJobs,
  putContentIngestJob,
  startContentIngestJobCoordinator,
  type ContentCreateJobRecord,
  type ContentIngestJobRecord,
  type ContentRefreshJobRecord,
} from '../lib/contentJobQueue';
import {
  contentSelectionRoleLabel,
  createContentPhotoIds,
  hasContentPhotoSelectionContract,
  resolveAllContentPhotos,
  resolveContentPhotoPublicationSets,
  type ResolvedContentPhoto,
} from '../lib/contentPhotoSelection';
import {
  canShareInstagramContent,
  contentPhotoExtension,
  isShareAbortError,
  prepareInstagramContentShare,
  prepareStandardContentShare,
  type ContentSharePhoto,
} from '../lib/contentShare';
export { shareOrDownloadJSON } from '../lib/contentShare';
import { downsizePhotosSequentially, downsizeForStorage } from '../lib/imagePreview';
import { createContentEntryCardRevision } from '../lib/contentCardMemo';
import { buildInitialContentInstruction } from '../lib/contentPrompt';
import {
  confirmContentEntry,
  createContentEntryId,
  normalizeContentEntry,
  setContentEntryExemplar,
} from '../lib/contentApproval';
import { copyTextToClipboard, createCopyFeedbackController, type CopyFeedback } from '../lib/clipboard';
import {
  contentTranslationKey,
  createContentTranslationRunner,
  currentContentTranslation,
  isContentTranslationStale,
} from '../lib/contentTranslation';
import {
  MAX_CONTENT_TEXT_CHARACTERS,
  contentTextLength,
  isContentTextDirty,
  saveContentTextEdit,
} from '../lib/contentTextEditing';
import {
  contentComposerItemKey,
  findLinkedContentEntries,
  selectContentWorkspaceEntries,
  resolveContentFocusEntry,
  type ContentSourceRef,
  type ContentWorkspaceNavigation,
} from '../lib/contentWorkspace';
import {
  normalizeContentEntryLink,
  isContentEntryLinked,
  resolveContentEntryLink,
  setContentEntryLink,
  type ContentEntryLink,
} from '../lib/contentLink';
import { upsertClientSession, upsertProjectSession, applyConsultationConversion, type SessionFormData } from '../lib/sessionSave';
// Чистые хелперы вынесены в отдельные модули (PR 3 рефакторинга). Логика
// не менялась — только перенос.
import { isRTL, firstLetter, nameRest } from '../lib/textFormat';
import { buildChatLink } from '../lib/chatLink';
import { normalizeClientNote, normalizeClient, normalizeProject } from '../lib/normalize';
// UI-примитивы вынесены в отдельные модули (PR 4 рефакторинга). Логика и
// разметка не менялись — только перенос.
import { TopStripe, RightStripe, GemCorner, GoldFrame } from './ui/Stripes';
import { StatBlock } from './ui/StatBlocks';
import { SheetStarDivider } from './ui/TextAtoms';
import { BottomSheet, SheetCloseButton } from './ui/Sheet';
import { COLORS, fs, setTextScale } from './ui/designTokens';
export { COLORS, DONE_EMOJI, fs } from './ui/designTokens';
// Bottom sheets вынесены в отдельные модули (PR 5 рефакторинга). Логика и
// разметка не менялись — только перенос.
import { NewClientSheet, EditClientSheet, ClientKindChoiceSheet, ClientPickerSheet, QuickClientSheet } from './sheets/ClientSheets';
import {
  NewSessionSheet,
  ProjectSessionPickerSheet,
  NewConsultationSheet,
  ProjectViewSheet,
  NewProjectSheet,
} from './sheets/SessionAndProjectSheets';
import {
  ContentShareSheet,
  TimelineViewSheet,
  ContentLinkStatus,
  ContentLinkPickerSheet,
  CalendarSheet,
} from './sheets/ContentAndCalendarSheets';
import {
  CelebrationBurst,
  FunWinSalute,
  StarfieldBackground,
  CloudsBackground,
  AviationBackground,
} from './effects/SkyBackgrounds';
// Экраны вынесены в отдельные модули (PR 8+ рефакторинга). Логика и разметка
// не менялись — только перенос; каждый экран prop-driven.
import { WorkshopScreen } from './screens/WorkshopScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { SummaryScreen } from './screens/SummaryScreen';
import { AdminDashboardScreen } from './screens/AdminDashboardScreen';
// Общие форм-контролы клиента вынесены в отдельный модуль (PR 10 рефакторинга).
import { SessionPhotos } from './client/ClientControls';
// Кластер «карточка клиента» вынесен в отдельный модуль (PR 11 рефакторинга).
// AddChatLinkForm/AddMasterLinkForm переиспользуются дашбордами здесь,
// поэтому импортируются обратно.
import {
  DetailScreen,
  AddChatLinkForm,
  AddMasterLinkForm,
} from './screens/DetailScreen';
import { ArchetypeToolbar } from './content/ArchetypeToolbar';
import { ActionButton, ContentEntryActions } from './content/ContentEntryActions';
// Иконки и мини-игры вынесены в отдельные модули (PR 2 рефакторинга).
// Логика и разметка не менялись — только перенос.
import { InstagramIcon, TikTokIcon, PinterestIcon, FacebookIcon, WhatsAppIcon } from './icons/SocialIcons';
import { StarDivider } from './icons/StarIcons';
import { RPSGame, RPSTauntFace } from './games/RPSGame';
import { CupsGame } from './games/CupsGame';
import { BlackjackGame } from './games/BlackjackGame';
// Доменные типы и их константы вынесены в src/domain/* (PR 2 рефакторинга).
// Форма данных и значения не изменились — это те же существующие типы,
// импортируемые обратно; второй модели Project не создавалось.
import { type UrgencyKey } from '../domain/urgency';
import { type Session } from '../domain/session';
import { type Consultation } from '../domain/consultation';
import { type ClientNote } from '../domain/task';
import {
  type ChatPlatform,
  type ChatLink,
  PLATFORM_LABELS,
  type ClientType,
  CLIENT_TYPES,
  ACCENT_COLORS,
  MARKER_COLORS,
  type Client,
} from '../domain/client';
export { ACCENT_COLORS, MARKER_COLORS } from '../domain/client';
// Чистые выборки/сортировки/агрегаты вынесены в domain/*Selectors и
// utils/dates (PR 3 рефакторинга). Алгоритмы и результаты не менялись.
import { ISO_DATE_RE, formatDate, dateParts, todayISO } from '../utils/dates';
import {
  getProjectById,
  getProjectsByClientId,
} from '../domain/projectSelectors';
export { clientNameFor } from '../domain/projectSelectors';
import {
  nextPlannedSession,
  type SortMode,
  SORT_MODES,
  sortClients,
  mostUsedStyle,
  upcomingItems,
} from '../domain/plannerSelectors';
// Логика напоминаний вынесена в src/reminders/* (PR 4 рефакторинга). Строители
// теперь получают `now` аргументом; ключ проекта исправлен (см. reminderKeys).
import type { TaskReminderItem } from '../reminders/types';
import {
  overdueEntries,
  healingReminders,
  upcomingSoonReminders,
  overdueProjectSessions,
  upcomingSoonProjectSessions,
  overdueProjects,
} from '../reminders/buildReminders';
import { taskReminderSources, taskReminders, filterVisibleTaskReminders } from '../reminders/buildTaskReminders';
import {
  overdueReminderKey,
  healingReminderKey,
  soonReminderKey,
  overdueProjectSessionReminderKey,
  soonProjectSessionReminderKey,
  projectReminderKey,
} from '../reminders/reminderKeys';
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
  type NextActionType,
  type Project,
} from '../domain/project';
import { type ContentEntry } from '../domain/content';
export type { ContentEntry } from '../domain/content';
import { DASHBOARD_WINDOW_OPTIONS, DEFAULT_PREFS, type Prefs } from './ui/preferences';
export { DEFAULT_PREFS, type Prefs } from './ui/preferences';

export const DURATIONS = ['2 ч', '3 ч', '4 ч', '5 ч', '6 ч', '7 ч', '8 ч'];
// Full palette of tattoo style directions (Russian tattoo-slang naming). Only
// the first STYLES_PINNED_COUNT are shown by default — a master typically
// works in 3-4 main directions — the rest sit behind "Ещё стили" in the picker.
export const STYLES = [
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
export const STYLES_PINNED_COUNT = 6;

// ===================== DATA TYPES =====================

export const SKIN_TYPES: { value: string; label: string }[] = [
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


// ===================== DATABASE =====================
// Version bumped 1 → 2 to add two new stores at once — «projects»
// (Творческая мастерская) and «contentEntries» (единая сущность для всего,
// что проходит через ContentINKA — сессия/консультация/свободная заметка,
// см. ContentEntry ниже). Existing installs upgrade in place on next load;
// onupgradeneeded only touches stores that don't exist yet, so the clients
// store and its data are never re-created or wiped.
const initDB = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open('TattoDiaryDB', TATTO_DIARY_DB_VERSION);
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
      ensureContentIngestJobStore(db);
    };
  });

// iOS/WebKit sometimes fails the very first indexedDB.open() right after a
// cold launch (the storage subsystem isn't ready yet) — this is NOT the same
// as private browsing, which the previous error message wrongly assumed. A
// couple of quick retries clears up that transient case before we bother the
// user at all.
const initDBWithRetry = async (attempts = 3, delayMs = 400): Promise<IDBDatabase> => {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await initDB();
    } catch (err) {
      if (attempt === attempts) throw err;
      await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    }
  }
  throw new Error('unreachable');
};


export const INPUT_STYLE: React.CSSProperties = {
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

export const SUBMIT_STYLE: React.CSSProperties = {
  border: '1px solid rgba(var(--gold-rgb),0.35)',
  borderRadius: 2,
  padding: 14,
  textAlign: 'center',
  cursor: 'pointer',
  background: 'rgba(var(--gold-rgb),0.05)',
};

// ===================== THEME =====================
export type Theme = 'dark' | 'light';

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
        notes: Array.isArray(p.notes) ? p.notes.map((n: any, i: number) => normalizeClientNote(n, i, 'm')) : [],
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
  const [contentIngestJobs, setContentIngestJobs] = useState<ContentIngestJobRecord[]>([]);
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
  // Хранится в localStorage, а не IndexedDB — у него гораздо меньше квота
  // (обычно 5-10 МБ на весь ориджин) и запись синхронная. masterInfo.notes
  // может нести фото (тот же SessionPhotos, что и у заметок клиента) —
  // если после сжатия несколько таких заметок всё равно не влезли в квоту,
  // раньше это молча проглатывалось: заметка выглядела сохранённой в UI, но
  // пропадала после перезапуска без единого предупреждения.
  const [masterInfo, setMasterInfo] = useState<MasterInfo>(readInitialMasterInfo);
  useEffect(() => {
    try {
      localStorage.setItem('inka-master-info', JSON.stringify(masterInfo));
    } catch (err) {
      console.error('Failed to persist master info:', err);
      setDbError('Не удалось сохранить личные заметки — слишком много данных (обычно из-за фото). Удалите часть фото в заметках «Задачи».');
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

  // Reminder cards (see RemindersSection) the master has deleted (via the «⋯»
  // menu's «Удалить», or a swipe) or snoozed («Отложить …») — so they stay out
  // of the feed even though the underlying overdue/healing condition hasn't
  // changed. Keyed by a stable per-reminder string (see reminderKeys), not by
  // anything that would naturally clear this — marking done, rescheduling, or
  // ticking «Зажив» already removes the entry from its source list regardless.
  // Скрытые/отложенные напоминания — см. src/reminders/reminderState.ts. На
  // старте подхватываем прежний формат (массив) и чистим истёкшие snooze.
  const [reminderState, setReminderState] = useState<ReminderState>(() => removeExpiredSnoozes(loadReminderState(), new Date()));
  useEffect(() => {
    saveReminderState(reminderState);
  }, [reminderState]);
  const handleDismissReminder = (key: string) => setReminderState((prev) => dismissReminder(prev, key));
  const handleSnoozeReminder = (key: string, showAfter: string) => setReminderState((prev) => snoozeReminder(prev, key, showAfter));

  const [screen, setScreen] = useState<'list' | 'detail' | 'settings' | 'summary' | 'master' | 'admin' | 'workshop' | 'content'>('list');
  const [contentNavigation, setContentNavigation] = useState<ContentWorkspaceNavigation | null>(null);
  // Узкий navigation target «открыть вот эту запись» по entry.id — для
  // клика по карточке в разделе «Контент» экрана проекта, где записи могут
  // быть freeform/без клиента (ContentWorkspaceNavigation сюда не подходит).
  // Так же транзиентно и не persisted, как contentNavigation.
  const [contentFocusEntryId, setContentFocusEntryId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'info' | 'sessions' | 'consultations' | 'content' | 'extra'>('sessions');
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
  // Consultation being turned into a session («Перевести в сессию») —
  // prefills NewSessionSheet (area/style/photos/project + notes) and, once
  // the session is saved, the consultation is removed so it doesn't stick
  // around as a stale duplicate. See startConvertConsultationToSession /
  // handleAddSession below.
  const [convertingConsultation, setConvertingConsultation] = useState<Consultation | null>(null);
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
  // ContentLinkPickerSheet «Сохранить в…» → «Создать проект»/«Создать
  // сессию» запускает уже существующие сценарии (NewProjectSheet, либо
  // ProjectSessionPickerSheet+NewSessionSheet) — этот ref запоминает, какую
  // ContentEntry нужно привязать к результату, и что именно должно стать
  // итоговой привязкой: сам созданный проект ('project'), или сессию,
  // которую нужно создать следующим шагом внутри него ('session' — тогда
  // handleAddProject не привязывает проект напрямую, а продолжает цепочку в
  // создание сессии). Ref, а не state — handleAddProject{,Session} и
  // closeNewSession/onClose читают его синхронно в одном тике, до
  // следующего рендера, где обычный state ещё не обновился бы.
  // preferredClientId — entry.clientId записи, ради которой запущена
  // цепочка: null для Мастерской (сессия/проект без клиента), id клиента —
  // тогда сессия должна лечь в client.sessions этого клиента, а не в
  // Project.sessions (см. saveSessionFromNewSessionSheet ниже).
  const pendingContentLinkRef = useRef<{
    entryId: string;
    target: 'project' | 'session';
    preferredClientId: string | null;
  } | null>(null);
  const linkContentEntryTo = (entryId: string, link: ContentEntryLink | null) => {
    const entry = contentEntries.find((candidate) => candidate.id === entryId);
    if (entry) saveContentEntry(setContentEntryLink(entry, link));
  };
  // Пользователь отменил создание Project/Session, запущенное из
  // ContentLinkPickerSheet («Создать проект»/«Создать сессию») — цепочка
  // просто обрывается (см. pendingContentLinkRef.current = null в
  // closeNewSession/onClose ниже), sheet не переоткрывается сам. Раньше он
  // переоткрывался автоматически («чтобы не оставлять тупиковый экран»), но
  // это переоткрытие срабатывало и после того, как мастер уже переключился
  // на другую вкладку/фильтр внутри экрана контента — sheet «Сохранить в…»
  // возникал заново поверх никак не связанного с ним содержимого и выглядел
  // так, будто вообще не закрывается. Запись остаётся непривязанной и
  // доступна для привязки вручную через «Привязать»/«Изменить привязку».
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

  const connectDb = () => {
    initDBWithRetry()
      .then((database) => {
        setDbError(null);
        setDb(database);
        loadClients(database);
        loadProjects(database);
        loadContentEntries(database);
        reloadContentIngestJobs(database);
      })
      .catch((err) => {
        console.error('IndexedDB init failed:', err);
        setDbError('Хранилище недоступно. Если открыт режим приватного просмотра — переключитесь на обычную вкладку, иначе попробуйте ещё раз.');
      });
  };

  useEffect(() => {
    connectDb();
  }, []);

  // db.transaction() бросает исключение синхронно, если соединение уже
  // закрылось (браузер может закрыть его сам под давлением памяти — вероятнее
  // при больших фото, см. downsizeForStorage). Раньше это исключение никем не
  // ловилось и роняло всё приложение вместо понятной ошибки с «Повторить».
  const openTx = (storeNames: string | string[], database: IDBDatabase, mode: IDBTransactionMode, failMessage: string): IDBTransaction | null => {
    try {
      return database.transaction(storeNames, mode);
    } catch (err) {
      console.error('IndexedDB transaction failed to start:', err);
      setDb(null);
      setDbError(failMessage);
      return null;
    }
  };
  const openWriteTx = (storeNames: string | string[], database: IDBDatabase, failMessage: string): IDBTransaction | null =>
    openTx(storeNames, database, 'readwrite', failMessage);

  const loadClients = (database: IDBDatabase) => {
    const tx = openTx('clients', database, 'readonly', 'Не удалось загрузить клиентов.');
    if (!tx) return;
    const request = tx.objectStore('clients').getAll();
    request.onsuccess = () => {
      setClients((request.result || []).map(normalizeClient));
      setClientsLoaded(true);
    };
    request.onerror = () => setDbError('Не удалось загрузить клиентов.');
  };

  const loadProjects = (database: IDBDatabase) => {
    const tx = openTx('projects', database, 'readonly', 'Не удалось загрузить проекты.');
    if (!tx) return;
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
    const tx = openWriteTx('projects', db, 'Хранилище недоступно — изменения не сохранены.');
    if (!tx) return;
    tx.objectStore('projects').put(project);
    tx.oncomplete = () => loadProjects(db);
    tx.onerror = () => setDbError('Не удалось сохранить изменения.');
  };

  const deleteProject = (id: string) => {
    if (!db) {
      setDbError('Хранилище недоступно — проект не удалён.');
      return;
    }
    const tx = openWriteTx('projects', db, 'Хранилище недоступно — проект не удалён.');
    if (!tx) return;
    tx.objectStore('projects').delete(id);
    tx.oncomplete = () => {
      loadProjects(db);
      setEditProject(null);
      setShowNewProjectForm(false);
    };
    tx.onerror = () => setDbError('Не удалось удалить проект.');
  };

  const loadContentEntries = (database: IDBDatabase) => {
    const tx = openTx('contentEntries', database, 'readonly', 'Не удалось загрузить черновики контента.');
    if (!tx) return;
    const request = tx.objectStore('contentEntries').getAll();
    request.onsuccess = () =>
      setContentEntries((request.result || []).map((entry) => normalizeContentEntry(entry)).map((entry) => normalizeContentEntryLink(entry)));
    request.onerror = () => setDbError('Не удалось загрузить черновики контента.');
  };

  const reloadContentIngestJobs = (database: IDBDatabase) => {
    loadContentIngestJobs(database)
      .then(setContentIngestJobs)
      .catch(() => setDbError('Не удалось загрузить фоновые задачи POSTiNKA.'));
  };

  const saveContentIngestJob = async (record: ContentIngestJobRecord): Promise<void> => {
    if (!db) throw new ContentSyncError('Хранилище недоступно — задача не сохранена.');
    await putContentIngestJob(db, record);
    reloadContentIngestJobs(db);
  };

  // «Удалить»/«Отменить» на карточке задачи (см. ContentINKAScreen) зовут это
  // напрямую из onClick без await — если сохранение упадёт (например,
  // оборвалось соединение с IndexedDB), это раньше был необработанный reject
  // без единого следа для мастера. Ловим и показываем ту же плашку dbError.
  const removeContentIngestJob = async (id: string): Promise<void> => {
    if (!db) return;
    try {
      await deleteContentIngestJob(db, id);
      reloadContentIngestJobs(db);
    } catch (err) {
      console.error('Failed to delete content ingest job:', err);
      setDbError('Не удалось удалить задачу POSTiNKA.');
    }
  };

  // Единственная точка записи для contentEntries — по аналогии с
  // saveClient. Апсерт по id: запись с тем же id перезаписывается
  // (перегенерация текста), иначе создаётся новая.
  const saveContentEntry = (entry: ContentEntry) => {
    if (!db) {
      setDbError('Хранилище недоступно — изменения не сохранены.');
      return;
    }
    setContentEntries((current) => [entry, ...current.filter((candidate) => candidate.id !== entry.id)]);
    const tx = openWriteTx('contentEntries', db, 'Хранилище недоступно — изменения не сохранены.');
    if (!tx) return;
    tx.objectStore('contentEntries').put(entry);
    tx.oncomplete = () => loadContentEntries(db);
    tx.onerror = () => {
      setDbError('Не удалось сохранить черновик контента.');
      loadContentEntries(db);
    };
  };

  const deleteContentEntry = (id: string) => {
    if (!db) return;
    deleteContentEntryAndRefreshJobs(db, id)
      .then(() => {
        loadContentEntries(db);
        reloadContentIngestJobs(db);
      })
      .catch(() => setDbError('Не удалось удалить запись контента.'));
  };

  useEffect(() => {
    if (!db) return;
    return startContentIngestJobCoordinator({
      db,
      onChanged: () => {
        loadContentEntries(db);
        reloadContentIngestJobs(db);
      },
    });
  }, [db]);

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
    const tx = openWriteTx('clients', db, 'Хранилище недоступно — изменения не сохранены.');
    if (!tx) return;
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
    const tx = openWriteTx('clients', db, 'Хранилище недоступно — клиент не удалён.');
    if (!tx) return;
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

  // Импорт полного бэкапа: clients + опционально projects/contentEntries и
  // masterNotes. Старые бэкапы без опциональных массивов не стирают текущие
  // данные. masterNotes применяются только после успешной IDB-транзакции.
  const replaceAllData = (bundle: {
    clients: Client[];
    projects?: Project[];
    contentEntries?: ContentEntry[];
    masterNotes?: ClientNote[];
  }) => {
    if (!db) {
      setDbError('Хранилище недоступно — импорт не выполнен.');
      return;
    }
    const importedMasterNotes = bundle.masterNotes;
    const stores = ['clients'];
    if (bundle.projects) stores.push('projects');
    if (bundle.contentEntries) stores.push('contentEntries', CONTENT_INGEST_JOB_STORE);
    const tx = openWriteTx(stores, db, 'Хранилище недоступно — импорт не выполнен.');
    if (!tx) return;
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
      tx.objectStore(CONTENT_INGEST_JOB_STORE).clear();
    }
    tx.oncomplete = () => {
      loadClients(db);
      if (bundle.projects) loadProjects(db);
      if (bundle.contentEntries) {
        loadContentEntries(db);
        reloadContentIngestJobs(db);
      }
      if (importedMasterNotes !== undefined) {
        setMasterInfo((prev) => ({ ...prev, notes: importedMasterNotes }));
      }
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
    const tx = openWriteTx('clients', db, 'Хранилище недоступно — импорт не выполнен.');
    if (!tx) return;
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

  const openContentWorkspace = (navigation: ContentWorkspaceNavigation) => {
    setContentNavigation(navigation);
    setViewEntry(null);
    setScreen('content');
  };

  const closeNewClient = () => setShowNewClientForm(false);
  const closeNewSession = () => {
    setShowNewSessionForm(false);
    setEditSession(null);
    setConvertingConsultation(null);
    setCalendarCreateDate(null);
    setCalendarEventKind(null);
    setPresetEntryProjectId(null);
    setSessionTargetProjectId(null);
    // Called both after a successful project-session save (handleAddProjectSession
    // already cleared the ref there) and on a plain cancel — only the latter
    // still has a pending chain left to unwind.
    pendingContentLinkRef.current = null;
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
      id: crypto.randomUUID(),
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
        {
          id: crypto.randomUUID(),
          createdDate: new Date().toISOString(),
          cancelled: false,
          status: 'active',
          convertedToSessionId: null,
          ...fields,
        },
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

  // «Перевести в сессию» — consultation happened, master and client agreed on
  // a work session, so the consultation moves into a session instead of a new
  // one being created alongside it. Opens NewSessionSheet prefilled from the
  // consultation (see prefillConsultation there); the actual client.sessions/
  // client.consultations mutation happens together in handleAddSession once
  // the form is saved (see convertingConsultation below).
  const startConvertConsultationToSession = (consultation: Consultation) => {
    setActiveTab('sessions');
    setEditSession(null);
    setConvertingConsultation(consultation);
    setShowNewSessionForm(true);
    setViewEntry(null);
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
    nextActionType: NextActionType | null;
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
      const newProjectId = crypto.randomUUID();
      saveProject({ id: newProjectId, createdDate: new Date().toISOString(), sessions: [], ...data });
      // Проект создан из ContentLinkPickerSheet «Сохранить в…».
      if (pendingContentLinkRef.current) {
        if (pendingContentLinkRef.current.target === 'project') {
          // Цепочка заканчивается здесь — сам проект и есть привязка.
          linkContentEntryTo(pendingContentLinkRef.current.entryId, { type: 'project', projectId: newProjectId });
          pendingContentLinkRef.current = null;
        } else {
          // target === 'session': проектов не было — этот проект лишь шаг к
          // сессии, продолжаем прямо в её создание, без тупика. NewProjectSheet
          // позволяет сменить клиента прямо в форме — владельца цепочки берём
          // из фактически сохранённого data.clientId, а не из entry.clientId
          // (preferredClientId мог устареть, если мастер выбрал другого
          // клиента или «Мастерская» уже в форме создания проекта).
          pendingContentLinkRef.current = { ...pendingContentLinkRef.current, preferredClientId: data.clientId };
          setShowNewProjectForm(false);
          setEditProject(null);
          setNewProjectClientId(null);
          setEditSession(null);
          setSessionTargetProjectId(newProjectId);
          setShowNewSessionForm(true);
          return;
        }
      }
    }
    setShowNewProjectForm(false);
    setEditProject(null);
    setNewProjectClientId(null);
  };

  // «Сессия без клиента» — живёт прямо в проекте (Project.sessions), пока к
  // проекту не привязан клиент (см. миграцию в handleAddProject выше). Чистая
  // мутация вынесена в upsertProjectSession (src/lib/sessionSave.ts).
  const handleAddProjectSession = (projectId: string, data: SessionFormData) => {
    const p = getProjectById(projects, projectId);
    if (!p) return;
    const { project: updatedProject, sessionId } = upsertProjectSession(p, { ...data, projectId }, editSession?.id ?? null);
    saveProject(updatedProject);
    advanceProjectStage(projectId, data.done ? 'in_progress' : 'booked');

    // Сессия создана из ContentLinkPickerSheet «Сохранить в…» для
    // Мастерской (studio-запись, без клиента) — привязываем её. !editSession
    // отсекает обычное редактирование существующей сессии, чтобы не
    // переписывать уже сделанную привязку.
    if (!editSession && pendingContentLinkRef.current?.target === 'session') {
      linkContentEntryTo(pendingContentLinkRef.current.entryId, { type: 'session', sessionId });
      pendingContentLinkRef.current = null;
    }
  };

  // Единственная точка сохранения для NewSessionSheet (кроме calendar-walk,
  // см. onAdd там же) — три возможных владельца результата:
  // 1) content-link цепочка для КЛИЕНТСКОЙ ContentEntry (preferredClientId
  //    задан) → сессия ложится в client.sessions ЭТОГО клиента (см.
  //    entry.clientId), а не «текущего открытого» selectedClient и не в
  //    Project.sessions — так клиентский контент остаётся связан с историей
  //    клиента, а не превращается в анонимную «сессию без клиента»;
  // 2) «сессия без клиента» (sessionTargetProjectId без preferredClientId —
  //    и обычный сценарий «Мастерская», и content-link для studio-записи) →
  //    Project.sessions через handleAddProjectSession, как раньше;
  // 3) обычная форма с экрана клиента (ни то, ни другое) → handleAddSession.
  const saveSessionFromNewSessionSheet = (data: SessionFormData) => {
    const contentLinkClientId = pendingContentLinkRef.current?.preferredClientId;
    if (sessionTargetProjectId && contentLinkClientId) {
      const client = clients.find((c) => c.id === contentLinkClientId);
      if (client) {
        const { client: updatedClient, sessionId } = upsertClientSession(
          client,
          { ...data, projectId: sessionTargetProjectId },
          editSession?.id ?? null,
        );
        saveClient(updatedClient);
        advanceProjectStage(sessionTargetProjectId, data.done ? 'in_progress' : 'booked');
        if (!editSession && pendingContentLinkRef.current?.target === 'session') {
          linkContentEntryTo(pendingContentLinkRef.current.entryId, { type: 'session', sessionId });
          pendingContentLinkRef.current = null;
        }
      }
      closeNewSession();
      return;
    }
    if (sessionTargetProjectId) {
      handleAddProjectSession(sessionTargetProjectId, data);
      closeNewSession();
      return;
    }
    handleAddSession(data);
  };

  // Узкие callbacks для ContentLinkPickerSheet («Создать проект»/«Создать
  // сессию») — запускают уже существующие сценарии создания Project/Session
  // вместо второй копии формы внутри самого sheet'а. См. handleAddProject/
  // handleAddProjectSession/saveSessionFromNewSessionSheet выше — там
  // pendingContentLinkRef приводит к автоматической привязке результата к
  // нужной ContentEntry.
  const openCreateProjectForContentLink = (entryId: string, preferredClientId: string | null) => {
    pendingContentLinkRef.current = { entryId, target: 'project', preferredClientId };
    setEditProject(null);
    setNewProjectClientId(preferredClientId);
    setShowNewProjectForm(true);
  };
  const openCreateSessionForContentLink = (entryId: string, preferredClientId: string | null) => {
    // Проекты этого клиента (или без клиента для Мастерской) — та же логика
    // выбора проекта, что и в «Мастерская: Создать → Сессия без клиента»
    // (см. ProjectSessionPickerSheet ниже), только с client-aware фильтром.
    // Если подходящих проектов нет, сама ProjectSessionPickerSheet предлагает
    // создать его первым — цепочка продолжается в handleAddProject выше.
    pendingContentLinkRef.current = { entryId, target: 'session', preferredClientId };
    setShowProjectSessionPicker(true);
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
          nextActionType: null,
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

  // «Выполнить» на Task-напоминании — ставит done в ТОМ хранилище, откуда
  // задача пришла (scope), не трогая одноимённую задачу в другом. Само
  // напоминание после этого уходит через фильтр done в taskReminders(), без
  // отдельной записи в dismissedIds.
  const completeTaskReminder = (item: TaskReminderItem) => {
    if (item.scope === 'client') {
      const client = clients.find((c) => c.id === item.clientId);
      const task = client?.notes.find((n) => n.id === item.taskId);
      if (!client || !task) return;
      upsertNote(client.id, { ...task, done: true });
    } else {
      setMasterInfo({ ...masterInfo, notes: masterInfo.notes.map((n) => (n.id === item.taskId ? { ...n, done: true } : n)) });
    }
  };

  // «Открыть» — проект, если задача к нему привязана; иначе клиент (для
  // клиентской задачи) или существующий экран «Сводка» с мастерскими
  // задачами (для задачи без клиента) — новый экран не заводим.
  const openTaskReminder = (item: TaskReminderItem) => {
    if (item.projectId) {
      const project = projects.find((p) => p.id === item.projectId);
      if (project) {
        setViewProject(project);
        return;
      }
    }
    if (item.scope === 'client' && item.clientId) {
      setSelectedId(item.clientId);
      setActiveTab('extra');
      setScreen('detail');
      return;
    }
    setScreen('summary');
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
      id: crypto.randomUUID(),
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

  // Сохранение чистой логики (client.sessions + мёрдж стилей) вынесено в
  // upsertClientSession (src/lib/sessionSave.ts) — по явному clientId, а не
  // через selectedClient. handleAddSession по-прежнему читает владельца из
  // selectedClient (обычная форма «Новая сессия» с экрана клиента), но сама
  // мутация теперь testable в изоляции; ContentLinkPickerSheet использует тот
  // же helper со своим явным clientId (см. saveSessionForContentLink ниже).
  const handleAddSession = (data: SessionFormData) => {
    if (!selectedClient) return;
    const { client: updatedClient, sessionId } = upsertClientSession(selectedClient, data, editSession?.id ?? null);
    // Конвертация консультации (см. startConvertConsultationToSession) — она
    // остаётся в истории (status:'converted'), а не удаляется, но связывается
    // с получившейся сессией тем же saveClient, что её добавляет, так что обе
    // стороны меняются одним атомарным изменением (см. applyConsultationConversion).
    const finalClient = convertingConsultation
      ? applyConsultationConversion(updatedClient, sessionId, convertingConsultation.id)
      : updatedClient;
    saveClient(finalClient);
    // Авто-переход этапа проекта (Этап 3b): выполненная сессия → «В работе»,
    // запланированная (ещё не выполнена) → «Записан». Только вперёд.
    advanceProjectStage(data.projectId, data.done ? 'in_progress' : 'booked');
    setShowNewSessionForm(false);
    setEditSession(null);
    setConvertingConsultation(null);
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
  const visibleOverdueProjectSessions = filterVisibleReminders(
    overdueProjectSessions(projects, remindersNow),
    overdueProjectSessionReminderKey,
    reminderState,
    remindersNow,
  );
  const visibleSoonProjectSessions = filterVisibleReminders(
    upcomingSoonProjectSessions(projects, remindersNow),
    soonProjectSessionReminderKey,
    reminderState,
    remindersNow,
  );
  // Проекты с просроченным «следующим шагом» (Этап 3b) — в те же напоминания.
  const visibleDueProjects = filterVisibleReminders(overdueProjects(projects, remindersNow), projectReminderKey, reminderState, remindersNow);
  // Task-напоминания (ClientNote.dueDate) — поверх того же engine, оба
  // источника задач (client.notes + masterInfo.notes), не объединяя их.
  // Свой фильтр видимости: скрытие ключуется по reminder.id (с rule),
  // откладывание — по устойчивому actionKey (без rule), см.
  // filterVisibleTaskReminders.
  const visibleTaskReminders = filterVisibleTaskReminders(
    taskReminders(taskReminderSources(clients, masterInfo.notes), remindersNow),
    reminderState,
    remindersNow,
  );

  // Set the text-size multiplier for this render pass before any child renders.
  setTextScale(prefs.textScale);

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
            {!db && (
              <button
                onClick={connectDb}
                style={{
                  background: 'none',
                  border: '1px solid rgba(201,153,153,0.5)',
                  borderRadius: 2,
                  padding: '2px 8px',
                  color: '#C99',
                  fontSize: fs(13),
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                Повторить
              </button>
            )}
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
            // Просроченная задача (task_overdue) — как urgent; задача на
            // сегодня (task_due) — как reminder, рядом с healing/soon/проекты.
            ...(visibleOverdue.length > 0 || visibleOverdueProjectSessions.length > 0 || visibleTaskReminders.some((t) => t.rule === 'task_overdue')
              ? (['urgent'] as const)
              : []),
            ...(visibleHealing.length > 0 || visibleSoon.length > 0 || visibleSoonProjectSessions.length > 0 || visibleDueProjects.length > 0 || visibleTaskReminders.some((t) => t.rule === 'task_due')
              ? (['reminder'] as const)
              : []),
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
            onAddMasterNote={(text, urgency, photos, dueDate) =>
              setMasterInfo({
                ...masterInfo,
                notes: [
                  ...masterInfo.notes,
                  { id: crypto.randomUUID(), text, urgency, done: false, createdDate: new Date().toISOString(), photos, projectId: null, dueDate },
                ],
              })
            }
            onAddNote={(clientId, text, urgency, photos, dueDate) =>
              upsertNote(clientId, {
                id: crypto.randomUUID(),
                text,
                urgency,
                done: false,
                createdDate: new Date().toISOString(),
                photos,
                projectId: null,
                dueDate,
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
            projects={projects}
            contentEntries={contentEntries}
            contentIngestJobs={contentIngestJobs}
            navigation={contentNavigation}
            onNavigationApplied={() => setContentNavigation(null)}
            focusEntryId={contentFocusEntryId}
            onFocusEntryApplied={() => setContentFocusEntryId(null)}
            onSaveEntry={saveContentEntry}
            onDeleteEntry={deleteContentEntry}
            onSaveContentIngestJob={saveContentIngestJob}
            onDeleteContentIngestJob={removeContentIngestJob}
            onCreateProjectForLink={openCreateProjectForContentLink}
            onCreateSessionForLink={openCreateSessionForContentLink}
            onBack={goBack}
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
            calendarSync={calendarSync}
            overdue={visibleOverdue}
            healing={visibleHealing}
            soon={visibleSoon}
            overdueProjectSessions={visibleOverdueProjectSessions}
            soonProjectSessions={visibleSoonProjectSessions}
            dueProjects={visibleDueProjects}
            tasks={visibleTaskReminders}
            onOpenProject={(project) => setViewProject(project)}
            onOpenEntry={openEntryForEdit}
            onDismissReminder={handleDismissReminder}
            onSnoozeReminder={handleSnoozeReminder}
            onCancelEntry={markEntryCancelled}
            onCompleteTask={completeTaskReminder}
            onOpenTask={openTaskReminder}
            onOpenNotes={(urgency) => {
              setSummaryFilter(urgency);
              setScreen('summary');
            }}
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
            clients={clients}
            masterNotes={masterInfo.notes}
            projects={projects}
            contentEntries={contentEntries}
            onImport={replaceAllData}
            onMigrateRecords={migrateRecordsIntoProjects}
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
            onConvertConsultation={startConvertConsultationToSession}
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
            onAddNote={(text, urgency, photos, dueDate) =>
              upsertNote(selectedClient.id, {
                id: crypto.randomUUID(),
                text,
                urgency,
                done: false,
                createdDate: new Date().toISOString(),
                photos,
                projectId: null,
                dueDate,
              })
            }
            onDeleteNote={(noteId) => deleteNote(selectedClient.id, noteId)}
            contentEntries={contentEntries}
            onOpenContent={openContentWorkspace}
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
        prefillConsultation={convertingConsultation}
        onClose={closeNewSession}
        onAdd={saveSessionFromNewSessionSheet}
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
        clientId={pendingContentLinkRef.current?.preferredClientId ?? null}
        onClose={() => {
          setShowProjectSessionPicker(false);
          pendingContentLinkRef.current = null;
        }}
        onPick={(project) => {
          setShowProjectSessionPicker(false);
          setEditSession(null);
          setSessionTargetProjectId(project.id);
          setShowNewSessionForm(true);
        }}
        onCreateProject={() => {
          setShowProjectSessionPicker(false);
          setEditProject(null);
          // content-link цепочка для клиентской записи → новый проект должен
          // предзаполниться этим же клиентом, а не «Мастерская».
          setNewProjectClientId(pendingContentLinkRef.current?.preferredClientId ?? null);
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
          pendingContentLinkRef.current = null;
        }}
        onAdd={handleAddProject}
        onDelete={editProject ? () => deleteProject(editProject.id) : undefined}
      />

      {/* ═══════════ PROJECT VIEW (read-only) ═══════════ */}
      <ProjectViewSheet
        open={!!viewProject}
        project={viewProject ? getProjectById(projects, viewProject.id) ?? viewProject : null}
        projects={projects}
        clients={clients}
        contentEntries={contentEntries}
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
        onOpenContentEntry={(entry) => {
          // Открывает уже существующий экран ContentINKA и раскрывает
          // конкретную запись по её id (см. contentFocusEntryId ниже) —
          // новый экран не создаётся, редактор не меняется.
          setViewProject(null);
          setContentFocusEntryId(entry.id);
          setScreen('content');
        }}
      />

      {/* ═══════════ TIMELINE VIEWER (read-only consultation / session) ═══════════ */}
      <TimelineViewSheet
        open={!!viewEntry && (!!viewedSession || !!viewedConsultation)}
        session={viewedSession}
        consultation={viewedConsultation}
        clientId={viewClient?.id ?? ''}
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
        onOpenContent={openContentWorkspace}
        onConvertToSession={
          viewedConsultation
            ? () => {
                if (viewEntry) setSelectedId(viewEntry.clientId);
                startConvertConsultationToSession(viewedConsultation);
              }
            : undefined
        }
        onOpenConvertedSession={
          viewedConsultation?.convertedToSessionId && viewEntry
            ? () => setViewEntry({ kind: 'session', clientId: viewEntry.clientId, id: viewedConsultation.convertedToSessionId! })
            : undefined
        }
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


// ===================== CLIENT GRID CARD =====================
function ClientGridCard({ client, onClick }: { client: Client; onClick: () => void }) {
  const plannedSession = nextPlannedSession(client);

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

        {/* Only an upcoming session belongs on the cover. Completed-session
            dates remain available inside the client profile and timeline. */}
        {plannedSession && ISO_DATE_RE.test(plannedSession.date) && (
          <div style={{ marginBottom: 6, minWidth: 0 }}>
            <div style={{ fontSize: fs(9.5), color: COLORS.textGhost, letterSpacing: '1.5px', textTransform: 'uppercase' }}>
              Следующая сессия
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
              {formatDate(plannedSession.date)}
            </div>
          </div>
        )}

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
export function ProjectCard({ project, clientName, onClick }: { project: Project; clientName: string | null; onClick: () => void }) {
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


// Shared horizontal-swipe gesture: past SWIPE_THRESHOLD it calls onReveal
// then snaps back to rest — used to REVEAL a delete confirm («Удалить? Да/
// Нет»), never to delete outright, so an accidental swipe can't destroy data
// (unlike the reminder cards' swipe, which is safe to complete immediately
// because nothing is actually deleted there). Reused by every delete-confirm
// spot in the app (sessions/consultations, notes) so swiping to delete is one
// consistent gesture rather than a per-screen reimplementation.
export function useSwipeToReveal(onReveal: () => void) {
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

// Standard «Другие приложения» flow: keep sharing photos and text together,
// with the same text-only and clipboard fallbacks used by the old button.
async function shareContentEntry(entryId: string, photos: string[], text: string): Promise<void> {
  const preparation = prepareStandardContentShare({
    entryId,
    savedText: text,
    photos: photos.map((src, originalIndex) => ({ src, originalIndex })),
  });
  const { files, payload } = preparation;
  const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean };
  if (files.length > 0 && nav.canShare && nav.canShare({ files })) {
    try {
      await nav.share(payload);
      return;
    } catch (err) {
      if (isShareAbortError(err)) return;
    }
  }
  // Нет фото или платформа не поддерживает шеринг файлов — делимся хотя бы
  // текстом (или копируем в буфер, если и это недоступно).
  if (nav.share) {
    try {
      await nav.share({ text });
      return;
    } catch (err) {
      if (isShareAbortError(err)) return;
    }
  }
  await copyTextToClipboard(text).catch(() => false);
}

function downloadContentPhoto(entryId: string, photo: ResolvedContentPhoto): void {
  const link = document.createElement('a');
  link.href = photo.src;
  link.download = `contentinka-${entryId}-${photo.originalIndex}.${contentPhotoExtension(photo.src)}`;
  link.click();
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
    const link: MasterLink = { id: crypto.randomUUID(), label: label.trim(), value: value.trim() };
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
    const link: ChatLink = { id: crypto.randomUUID(), platform, url: buildChatLink(platform, raw) };
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
          Личный кабинет
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

// ===================== BOTTOM SHEET SHELL =====================
// Read-only fullscreen viewer for a consultation or session — opened by tapping
// a timeline/Задачи card. A single «Редактировать» button drops into the edit
// form. Everything else is display-only.
export function ViewField({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div>
      <div style={{ fontSize: fs(10), color: COLORS.textGhost, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 5 }}>{label}</div>
      <div dir="auto" style={{ fontSize: fs(15), color: 'var(--text-soft)', lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{value}</div>
    </div>
  );
}

// Архетипные chips — под капотом тот же master_instruction в
// POST /api/ingest-jobs (см. sendToContent в contentSync.ts). Названы напрямую по семи архетипам
// contentINKA (см. lib/prompts/archetypes.txt в contentinka), а не по
// настроению («теплее»/«жёстче») — так кнопка сразу говорит, какой голос
// перегенерирует текст. Каждый пресет ставит выбранный архетип в роль
// opens — ищет в уже написанном черновике фразы/образы, которые стоит
// сохранить, вместо переписывания с нуля (см. regenerate ниже, шлёт
// entry.textDraft как previous_draft, backend сам решает, что удержать).
// Названия и инструкции сохранены без изменений; отдельный refresh вынесен
// из этого набора ниже в действие «Обновить черновик».
const ARCHETYPE_CHIPS: { label: string; instruction: string }[] = [
  { label: 'Трикстер', instruction: 'открой материал в архетипе Трикстер — резче, прямее, с лёгкой дерзостью, без пафоса' },
  { label: 'Женщина/Тепло', instruction: 'открой материал в архетипе Женщина/Тепло — теплее, мягче, телесно' },
  { label: 'Исследователь', instruction: 'открой материал в архетипе Исследователь — через любопытство и процесс поиска' },
  { label: 'Мудрец', instruction: 'открой материал в архетипе Мудрец — точнее, через понимание сути, без лекции' },
  { label: 'Дурак', instruction: 'открой материал в архетипе Дурак — проще, легче, с сухим юмором' },
  { label: 'Lover', instruction: 'открой материал в архетипе Lover — через чувственность и телесность, без цены' },
  { label: 'Творец', instruction: 'открой материал в архетипе Творец — через форму, материал и рождение образа' },
];

const CONTENT_TRANSLATION_OPTIONS: {
  language: ContentTranslationLanguage;
  actionLabel: string;
  title: string;
  dir: 'rtl' | 'ltr';
}[] = [
  { language: 'he', actionLabel: 'На иврит', title: 'Иврит', dir: 'rtl' },
  { language: 'en', actionLabel: 'На английский', title: 'Английский', dir: 'ltr' },
];

type ContentTranslationFeedback = {
  state: 'loading' | 'success' | 'error';
  message: string;
  sourceText: string;
};

type ContentTextEditorState = {
  baseText: string;
  editedText: string;
};

type ContentTextEditFeedback = {
  kind: 'success' | 'error';
  message: string;
};

type ContentShareFeedback = {
  kind: 'success' | 'error';
  message: string;
};

const CONTENT_ENTRY_PAGE_SIZE = 8;

function ContentPhotoGallery({ entry }: { entry: ContentEntry }) {
  const [viewerPhoto, setViewerPhoto] = useState<ResolvedContentPhoto | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const input = { photos: entry.photos, photoIds: entry.photoIds, contentDraft: entry.contentDraft };
  const hasSelectionContract = hasContentPhotoSelectionContract(entry.contentDraft);
  const publicationSets = resolveContentPhotoPublicationSets(input);
  const selectedPhotos = [...publicationSets.carousel, ...publicationSets.stories];
  const allPhotos = resolveAllContentPhotos(input);

  const roleBadge = (photo: ResolvedContentPhoto) =>
    photo.selectionRole ? (
      <span className={`content-photo-role${photo.selectionRole === 'cover' ? ' is-cover' : ''}`}>
        {contentSelectionRoleLabel(photo.selectionRole)}
      </span>
    ) : null;

  const photoButton = (photo: ResolvedContentPhoto, className: string) => (
    <button
      key={photo.id}
      type="button"
      className={className}
      onClick={() => setViewerPhoto(photo)}
      aria-label={`Открыть фотографию ${photo.originalIndex + 1}`}
    >
      <img src={photo.src} alt="" loading="lazy" decoding="async" />
      {roleBadge(photo)}
      {hasSelectionContract && !photo.selected && <span className="content-photo-not-selected">Не выбрано</span>}
    </button>
  );

  return (
    <>
      {hasSelectionContract ? (
        <div className="content-photo-output">
          <div className="content-photo-output__title">Подборка Инки</div>
          {selectedPhotos.length === 0 ? (
            <div className="content-photo-output__empty">Инка не выбрала кадры для публикации</div>
          ) : (
            <div className="content-photo-publication-sets">
              {publicationSets.carousel.length > 0 && (
                <section className="content-photo-publication-set" aria-label="Карусель">
                  <div className="content-photo-publication-set__title">Карусель · {publicationSets.carousel.length}</div>
                  <div className="content-photo-selection">
                    {photoButton(publicationSets.carousel[0], 'content-photo-hero')}
                    {publicationSets.carousel.length > 1 && (
                      <div className="content-photo-grid">
                        {publicationSets.carousel.slice(1).map((photo) => photoButton(photo, 'content-photo-tile'))}
                      </div>
                    )}
                  </div>
                </section>
              )}
              {publicationSets.stories.length > 0 && (
                <section className="content-photo-publication-set" aria-label="Сториз">
                  <div className="content-photo-publication-set__title">Сториз · {publicationSets.stories.length}</div>
                  <div className="content-photo-selection">
                    {photoButton(publicationSets.stories[0], 'content-photo-hero')}
                    {publicationSets.stories.length > 1 && (
                      <div className="content-photo-grid">
                        {publicationSets.stories.slice(1).map((photo) => photoButton(photo, 'content-photo-tile'))}
                      </div>
                    )}
                  </div>
                </section>
              )}
            </div>
          )}
          <div className="content-photo-archive">
            <button
              type="button"
              className="content-photo-archive__toggle"
              aria-expanded={archiveOpen}
              onClick={() => setArchiveOpen((open) => !open)}
            >
              Все фотографии · {allPhotos.length}
            </button>
            {archiveOpen && allPhotos.length > 0 && (
              <div className="content-photo-archive__grid">
                {allPhotos.map((photo) => photoButton(photo, 'content-photo-tile'))}
              </div>
            )}
          </div>
        </div>
      ) : entry.photos.length > 0 ? (
        <div className="content-photo-legacy">
          {allPhotos.map((photo) => photoButton(photo, 'content-photo-legacy__tile'))}
        </div>
      ) : null}

      {viewerPhoto &&
        createPortal(
          <div className="content-photo-viewer" role="dialog" aria-modal="true" aria-label="Просмотр фотографии" onClick={() => setViewerPhoto(null)}>
            <button type="button" className="content-photo-viewer__close" aria-label="Закрыть" onClick={() => setViewerPhoto(null)}>
              ×
            </button>
            <div className="content-photo-viewer__content" onClick={(event) => event.stopPropagation()}>
              <img src={viewerPhoto.src} alt="" />
              <button type="button" className="content-photo-viewer__download" onClick={() => downloadContentPhoto(entry.id, viewerPhoto)}>
                Сохранить фото
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

type ContentEntryCardProps = {
  entry: ContentEntry;
  highlighted: boolean;
  clients: Client[];
  projects: Project[];
  revision: string;
  children: ReactNode;
};

const ContentEntryCard = memo(function ContentEntryCard({ entry, highlighted, children }: ContentEntryCardProps) {
  return (
    <div
      id={`content-entry-${entry.id}`}
      style={
        highlighted
          ? { boxShadow: '0 0 0 2px var(--gold)', borderRadius: 3, transition: 'box-shadow 0.3s ease' }
          : undefined
      }
    >
      <GoldFrame plain style={{ padding: '14px 16px' }}>
        {children}
      </GoldFrame>
    </div>
  );
}, (previous, next) =>
  previous.entry === next.entry &&
  previous.highlighted === next.highlighted &&
  previous.clients === next.clients &&
  previous.projects === next.projects &&
  previous.revision === next.revision,
);

// Полноценный рабочий интерфейс ContentINKA — отдельная страница
// (NavFab → «Контент»). Здесь собирается материал с нуля или из выбранной
// сессии/консультации и применяются все действия к черновику. Остальные
// поверхности показывают только компактный статус и переходят сюда; данные
// по-прежнему читаются и пишутся через единственный contentEntries store.
function ContentINKAScreen({
  clients,
  projects,
  contentEntries,
  contentIngestJobs,
  navigation,
  onNavigationApplied,
  focusEntryId,
  onFocusEntryApplied,
  onSaveEntry,
  onDeleteEntry,
  onSaveContentIngestJob,
  onDeleteContentIngestJob,
  onCreateProjectForLink,
  onCreateSessionForLink,
  onBack,
}: {
  clients: Client[];
  projects: Project[];
  contentEntries: ContentEntry[];
  contentIngestJobs: ContentIngestJobRecord[];
  navigation: ContentWorkspaceNavigation | null;
  onNavigationApplied: () => void;
  // Узкий target «раскрыть вот эту запись» по id (см. contentFocusEntryId в
  // родителе) — независим от navigation/ContentWorkspaceNavigation, которая
  // не подходит для freeform/безклиентских записей.
  focusEntryId: string | null;
  onFocusEntryApplied: () => void;
  onSaveEntry: (entry: ContentEntry) => void;
  onDeleteEntry: (id: string) => void;
  onSaveContentIngestJob: (record: ContentIngestJobRecord) => Promise<void>;
  onDeleteContentIngestJob: (id: string) => Promise<void>;
  // Узкие callbacks запуска УЖЕ существующих сценариев создания Project/
  // Session из ContentLinkPickerSheet (кнопка «Создать проект»/«Создать
  // сессию») — сам sheet не хранит вторую копию этих форм и не знает, как
  // именно родитель их открывает (см. TattoDiary root: NewProjectSheet/
  // ProjectSessionPickerSheet+NewSessionSheet).
  onCreateProjectForLink: (entryId: string, preferredClientId: string | null) => void;
  onCreateSessionForLink: (entryId: string, preferredClientId: string | null) => void;
  onBack: () => void;
}) {
  const [composerClientId, setComposerClientId] = useState<string | null>(null); // null = мастерская
  const [composerItemKey, setComposerItemKey] = useState<string>(''); // '' | 's:<id>' | 'c:<id>'
  const [composerText, setComposerText] = useState('');
  const [composerTextArchetype, setComposerTextArchetype] = useState('');
  const [composerPhotos, setComposerPhotos] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryingJobIds, setRetryingJobIds] = useState<Set<string>>(() => new Set());
  const refreshingEntryIds = new Set(
    contentIngestJobs
      .filter((job): job is ContentRefreshJobRecord => job.operation === 'refresh' && job.state !== 'failed')
      .map((job) => job.entryId),
  );
  const refreshJobByEntry = new Map(
    contentIngestJobs
      .filter((job): job is ContentRefreshJobRecord => job.operation === 'refresh')
      .map((job) => [job.entryId, job]),
  );
  const createIngestJobs = contentIngestJobs.filter((job): job is ContentCreateJobRecord => job.operation === 'create');
  const isEntryRefreshing = (entryId: string) => refreshingEntryIds.has(entryId);
  const [selectedArchetypeByEntry, setSelectedArchetypeByEntry] = useState<Record<string, string>>({});
  const [refreshFeedbackByEntry, setRefreshFeedbackByEntry] = useState<Record<string, {
    kind: 'success' | 'error';
    message: string;
  }>>({});
  const [copyFeedbackByEntry, setCopyFeedbackByEntry] = useState<Record<string, CopyFeedback>>({});
  // id записи, для которой сейчас открыт sheet «Сохранить в…» — и после
  // одобрения непривязанной записи (обязательный вопрос), и по ручному
  // «Привязать»/«Изменить привязку» из карточки (тот же sheet). Вкладка
  // (Проект/Сессия) — отдельный managed state, а не внутренний step sheet'а,
  // чтобы одинаково задавать её и при открытии, и при возврате после отмены
  // создания Project/Session.
  const [linkPickerEntryId, setLinkPickerEntryId] = useState<string | null>(null);
  const [linkPickerTarget, setLinkPickerTarget] = useState<'project' | 'session'>('project');
  // Учитывает не только явный entry.link, но и фактически resolved связь
  // (resolveContentEntryLink) — так legacy/source-session записи (link ещё
  // не задан явно, но sourceType==='session' резолвится в сессию) тоже
  // открываются сразу на вкладке «Сессия», а не «Проект» по умолчанию.
  const openLinkPicker = (entryId: string) => {
    const candidate = contentEntriesRef.current.find((entry) => entry.id === entryId);
    const resolved = candidate ? resolveContentEntryLink(candidate, projects, clients) : null;
    setLinkPickerTarget(resolved?.kind === 'session' ? 'session' : 'project');
    setLinkPickerEntryId(entryId);
  };
  const copyFeedbackController = useMemo(
    () => createCopyFeedbackController({ onChange: setCopyFeedbackByEntry }),
    [],
  );
  const translationRunner = useMemo(() => createContentTranslationRunner(), []);
  const [translationMenuEntryIds, setTranslationMenuEntryIds] = useState<Set<string>>(() => new Set());
  const [translationFeedbackByKey, setTranslationFeedbackByKey] = useState<Record<string, ContentTranslationFeedback>>({});
  const [translationCopyFeedbackByKey, setTranslationCopyFeedbackByKey] = useState<Record<string, CopyFeedback>>({});
  const [textEditorsByEntry, setTextEditorsByEntry] = useState<Record<string, ContentTextEditorState>>({});
  const [textEditFeedbackByEntry, setTextEditFeedbackByEntry] = useState<Record<string, ContentTextEditFeedback>>({});
  const [shareMenuEntryId, setShareMenuEntryId] = useState<string | null>(null);
  const [shareFeedbackByEntry, setShareFeedbackByEntry] = useState<Record<string, ContentShareFeedback>>({});
  const textEditFeedbackTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const translationCopyFeedbackController = useMemo(
    () => createCopyFeedbackController({ onChange: setTranslationCopyFeedbackByKey }),
    [],
  );
  const contentEntriesRef = useRef(contentEntries);
  contentEntriesRef.current = contentEntries;
  const saveEntryInWorkspace = (entry: ContentEntry) => {
    contentEntriesRef.current = [entry, ...contentEntriesRef.current.filter((candidate) => candidate.id !== entry.id)];
    onSaveEntry(entry);
  };
  const hasUnsavedTextEdit = (entry: ContentEntry): boolean => {
    const editor = textEditorsByEntry[entry.id];
    return entry.status === 'draft' && !!editor && isContentTextDirty(entry.textDraft, editor.editedText);
  };
  const showTextEditFeedback = (entryId: string, feedback: ContentTextEditFeedback) => {
    const currentTimer = textEditFeedbackTimers.current.get(entryId);
    if (currentTimer) clearTimeout(currentTimer);
    setTextEditFeedbackByEntry((current) => ({ ...current, [entryId]: feedback }));
    const timer = setTimeout(() => {
      textEditFeedbackTimers.current.delete(entryId);
      setTextEditFeedbackByEntry((current) => {
        const next = { ...current };
        delete next[entryId];
        return next;
      });
    }, 2200);
    textEditFeedbackTimers.current.set(entryId, timer);
  };
  const startTextEdit = (entry: ContentEntry) => {
    if (entry.status !== 'draft' || isEntryRefreshing(entry.id)) return;
    const currentTimer = textEditFeedbackTimers.current.get(entry.id);
    if (currentTimer) clearTimeout(currentTimer);
    textEditFeedbackTimers.current.delete(entry.id);
    setTextEditorsByEntry((current) => ({
      ...current,
      [entry.id]: { baseText: entry.textDraft, editedText: entry.textDraft },
    }));
    setTextEditFeedbackByEntry((current) => {
      const next = { ...current };
      delete next[entry.id];
      return next;
    });
  };
  const cancelTextEdit = (entryId: string) => {
    const currentTimer = textEditFeedbackTimers.current.get(entryId);
    if (currentTimer) clearTimeout(currentTimer);
    textEditFeedbackTimers.current.delete(entryId);
    setTextEditorsByEntry((current) => {
      const next = { ...current };
      delete next[entryId];
      return next;
    });
    setTextEditFeedbackByEntry((current) => {
      const next = { ...current };
      delete next[entryId];
      return next;
    });
  };
  const saveTextEdit = (entry: ContentEntry) => {
    const editor = textEditorsByEntry[entry.id];
    if (!editor) return;
    const currentEntry = contentEntriesRef.current.find((candidate) => candidate.id === entry.id) ?? entry;
    const outcome = saveContentTextEdit(currentEntry, {
      baseText: editor.baseText,
      editedText: editor.editedText,
    });

    if (outcome.status === 'saved') saveEntryInWorkspace(outcome.entry);
    if (outcome.status === 'saved' || outcome.status === 'unchanged') {
      cancelTextEdit(entry.id);
      showTextEditFeedback(entry.id, { kind: 'success', message: 'Сохранено' });
      return;
    }
    if (outcome.status === 'empty') {
      showTextEditFeedback(entry.id, { kind: 'error', message: 'Текст не может быть пустым' });
      return;
    }
    if (outcome.status === 'too_long') {
      showTextEditFeedback(entry.id, { kind: 'error', message: 'Сократите текст вручную до 650 символов' });
      return;
    }

    cancelTextEdit(entry.id);
    showTextEditFeedback(entry.id, {
      kind: 'error',
      message: outcome.status === 'conflict'
        ? 'Текст уже изменился. Откройте редактор заново.'
        : 'Одобренный текст нельзя редактировать',
    });
  };
  const approveEntry = (entry: ContentEntry) => {
    const currentEntry = contentEntriesRef.current.find((candidate) => candidate.id === entry.id) ?? entry;
    if (currentEntry.status === 'confirmed' || hasUnsavedTextEdit(currentEntry) || isEntryRefreshing(currentEntry.id)) return;
    saveEntryInWorkspace(confirmContentEntry(currentEntry));
    // Только после сохранения status: confirmed — и только если запись ещё
    // не связана (включая уже связанные через sourceType==='session') —
    // открываем обязательный вопрос «Куда сохранить контент?». confirmContentEntry
    // чистая и идемпотентная — повторный вызов не создаёт новое состояние.
    if (!isContentEntryLinked(confirmContentEntry(currentEntry))) openLinkPicker(currentEntry.id);
  };
  const updateEntryLink = (entry: ContentEntry, link: ContentEntryLink | null) => {
    const currentEntry = contentEntriesRef.current.find((candidate) => candidate.id === entry.id) ?? entry;
    saveEntryInWorkspace(setContentEntryLink(currentEntry, link));
  };
  const updateExemplar = (entry: ContentEntry, isExemplar: boolean) => {
    const currentEntry = contentEntriesRef.current.find((candidate) => candidate.id === entry.id) ?? entry;
    if (currentEntry.status !== 'confirmed') return;
    saveEntryInWorkspace(setContentEntryExemplar(currentEntry, isExemplar));
  };
  const contentTranslationsMountedRef = useRef(false);
  const knownContentEntryIds = useRef(new Set(contentEntries.map((entry) => entry.id)));
  const [filterClientId, setFilterClientId] = useState<string>('all'); // 'all' | 'studio' | clientId
  const [focusedSource, setFocusedSource] = useState<ContentSourceRef | null>(null);
  const [visibleEntryLimit, setVisibleEntryLimit] = useState(CONTENT_ENTRY_PAGE_SIZE);
  // Кратковременная подсветка записи, раскрытой через focusEntryId (клик по
  // карточке в разделе «Контент» экрана проекта) — гаснет сама, ничего не
  // меняет в данных.
  const [highlightedEntryId, setHighlightedEntryId] = useState<string | null>(null);
  const entriesListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const currentEntryIds = new Set(contentEntries.map((entry) => entry.id));
    for (const entryId of knownContentEntryIds.current) {
      if (!currentEntryIds.has(entryId)) {
        copyFeedbackController.clear(entryId);
        const textEditTimer = textEditFeedbackTimers.current.get(entryId);
        if (textEditTimer) clearTimeout(textEditTimer);
        textEditFeedbackTimers.current.delete(entryId);
        setTextEditorsByEntry((current) => {
          const next = { ...current };
          delete next[entryId];
          return next;
        });
        setTextEditFeedbackByEntry((current) => {
          const next = { ...current };
          delete next[entryId];
          return next;
        });
        if (shareMenuEntryId === entryId) setShareMenuEntryId(null);
        setShareFeedbackByEntry((current) => {
          const next = { ...current };
          delete next[entryId];
          return next;
        });
        for (const option of CONTENT_TRANSLATION_OPTIONS) {
          translationCopyFeedbackController.clear(contentTranslationKey(entryId, option.language));
        }
      }
    }
    knownContentEntryIds.current = currentEntryIds;
  }, [contentEntries, copyFeedbackController, shareMenuEntryId, translationCopyFeedbackController]);

  useEffect(() => () => copyFeedbackController.dispose(), [copyFeedbackController]);
  useEffect(() => () => {
    for (const timer of textEditFeedbackTimers.current.values()) clearTimeout(timer);
    textEditFeedbackTimers.current.clear();
  }, []);
  useEffect(() => {
    contentTranslationsMountedRef.current = true;
    return () => {
      contentTranslationsMountedRef.current = false;
      translationRunner.dispose();
      translationCopyFeedbackController.dispose();
    };
  }, [translationCopyFeedbackController, translationRunner]);

  const composerClient = clients.find((c) => c.id === composerClientId) ?? null;
  const composerItem = (() => {
    if (!composerClient || !composerItemKey) return null;
    const kind = composerItemKey.slice(0, 1);
    const id = composerItemKey.slice(2);
    if (kind === 's') return { kind: 'session' as const, item: composerClient.sessions.find((s) => s.id === id) };
    if (kind === 'c') return { kind: 'consultation' as const, item: composerClient.consultations.find((c) => c.id === id) };
    return null;
  })();
  // Mirrors the guard at the top of handleGenerate — kept in sync so the
  // button can show *why* it's inert instead of silently no-opping on tap.
  const canGenerate = !!composerText.trim() || composerPhotos.length > 0 || !!composerItem;

  useEffect(() => {
    if (!navigation) return;

    const source = { sourceType: navigation.sourceType, sourceId: navigation.sourceId };
    const client = clients.find((candidate) => candidate.id === navigation.clientId) ?? null;
    const sourceItem =
      navigation.sourceType === 'session'
        ? client?.sessions.find((session) => session.id === navigation.sourceId) ?? null
        : client?.consultations.find((consultation) => consultation.id === navigation.sourceId) ?? null;

    setComposerClientId(client?.id ?? navigation.clientId);
    setComposerItemKey(contentComposerItemKey(source));
    setFilterClientId(client?.id ?? 'all');
    setVisibleEntryLimit(CONTENT_ENTRY_PAGE_SIZE);

    if (navigation.mode === 'compose') {
      setFocusedSource(null);
      const sourceText = sourceItem
        ? navigation.sourceType === 'session'
          ? (sourceItem as Session).note
          : [
              (sourceItem as Consultation).generalNotes,
              (sourceItem as Consultation).feeling,
              (sourceItem as Consultation).creative,
              (sourceItem as Consultation).inspirationSources,
            ]
              .filter(Boolean)
              .join('\n\n')
        : '';
      setComposerText(sourceText);
      setComposerTextArchetype('');
      setComposerPhotos(sourceItem ? [...sourceItem.photos] : []);
    } else {
      setFocusedSource(source);
      requestAnimationFrame(() => entriesListRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
    }

    onNavigationApplied();
  }, [clients, navigation, onNavigationApplied]);

  // Раскрыть конкретную запись по entry.id (клик по карточке контента на
  // экране проекта) — резолвится через ту же чистую функцию, что и её
  // тесты (resolveContentFocusEntry), а не второй ad-hoc find() здесь.
  useEffect(() => {
    if (!focusEntryId) return;
    const target = resolveContentFocusEntry(contentEntries, focusEntryId);
    if (target) {
      setFocusedSource(null);
      setFilterClientId('all');
      const targetIndex = contentEntries
        .filter((entry) => !entry.removedFromWorkspace || entry.id === target.id)
        .findIndex((entry) => entry.id === target.id);
      setVisibleEntryLimit(Math.max(CONTENT_ENTRY_PAGE_SIZE, targetIndex + 1));
      setHighlightedEntryId(target.id);
      requestAnimationFrame(() => {
        document.getElementById(`content-entry-${target.id}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      });
    }
    onFocusEntryApplied();
  }, [contentEntries, focusEntryId, onFocusEntryApplied]);

  useEffect(() => {
    if (!highlightedEntryId) return;
    const timer = setTimeout(() => setHighlightedEntryId(null), 2500);
    return () => clearTimeout(timer);
  }, [highlightedEntryId]);

  const resetComposer = () => {
    setComposerText('');
    setComposerTextArchetype('');
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
      const rawPhotos = composerPhotos.length > 0 ? composerPhotos : linkedItem?.photos ?? [];
      const photoIds = createContentPhotoIds(rawPhotos.length);
      // linkedItem.photos может быть несжатым оригиналом (сессия создана до
      // downsizeForStorage) — пересжимаем перед тем как положить в ещё одну
      // IndexedDB-запись (contentIngestJobs, потом contentEntries), иначе то
      // же фото временно лежит в базе в 2-3 копиях одновременно, пока
      // POSTiNKA его обрабатывает.
      const storedPhotoResults = await downsizePhotosSequentially(rawPhotos, photoIds, (photo) => downsizeForStorage(photo).catch(() => photo));
      const photos = storedPhotoResults.map((p) => p.preview_data_url);
      const selectedTextArchetype = ARCHETYPE_CHIPS.find((preset) => preset.label === composerTextArchetype);
      const masterInstruction = photos.length > 0
        ? buildInitialContentInstruction(selectedTextArchetype?.instruction)
        : selectedTextArchetype?.instruction;
      const existingIds = [
        ...contentEntriesRef.current,
        ...createIngestJobs.map((job) => ({ id: job.entry.id })),
      ];
      const entryId = createContentEntryId(existingIds);
      const createdDate = new Date().toISOString();
      const sessionId = sourceId ?? `freeform-${entryId}`;
      const context = { client: clientName, work, zone, style, description };
      const previews = await downsizePhotosSequentially(photos, photoIds);
      const params: ContentIngestParams = {
        sessionId,
        sourceType,
        session: context,
        media: previews,
        masterInstruction,
      };
      const created = await createContentIngestJob(params);
      const record: ContentCreateJobRecord = {
        id: `create:${entryId}`,
        jobId: created.jobId,
        operation: 'create',
        state: 'queued',
        createdAt: createdDate,
        updatedAt: createdDate,
        request: {
          sessionId,
          sourceType,
          session: context,
          mediaIds: photoIds,
          masterInstruction,
        },
        entry: {
          id: entryId,
          createdDate,
          clientId: composerClientId,
          sourceType,
          sourceId,
          format: null,
          text: composerText,
          context,
          textArchetype: selectedTextArchetype?.label ?? null,
          photos,
          photoIds,
        },
      };
      await onSaveContentIngestJob(record);
      resetComposer();
    } catch (generationError) {
      setError(generationError instanceof ContentSyncError ? generationError.message : 'Не удалось отправить материал в POSTiNKA.');
    } finally {
      setSending(false);
    }
  };

  const regenerate = async (entry: ContentEntry, instruction: string, selectedArchetype?: string) => {
    const currentEntry = contentEntriesRef.current.find((candidate) => candidate.id === entry.id) ?? entry;
    if (currentEntry.status === 'confirmed' || hasUnsavedTextEdit(currentEntry) || isEntryRefreshing(currentEntry.id)) return;
    setError(null);
    setRefreshFeedbackByEntry((current) => {
      const next = { ...current };
      delete next[entry.id];
      return next;
    });
    try {
      const primaryTextArchetype = ARCHETYPE_CHIPS.find((preset) => preset.label === currentEntry.textArchetype);
      const requestPhotoIds =
        currentEntry.photoIds?.length === currentEntry.photos.length
          ? currentEntry.photoIds
          : currentEntry.contentDraft?.length === currentEntry.photos.length
            ? currentEntry.contentDraft.map((media) => media.id)
            : currentEntry.photos.map((_, index) => `${currentEntry.id}-${index}`);
      const previews = await downsizePhotosSequentially(currentEntry.photos, requestPhotoIds);
      const masterInstruction = instruction || primaryTextArchetype?.instruction;
      const params: ContentIngestParams = {
        sessionId: currentEntry.sourceId ?? currentEntry.id,
        sourceType: currentEntry.sourceType,
        session: currentEntry.context,
        media: previews,
        masterInstruction,
        previousDraft: currentEntry.textDraft || undefined,
      };
      const created = await createContentIngestJob(params);
      const now = new Date().toISOString();
      await onSaveContentIngestJob({
        id: `refresh:${currentEntry.id}`,
        jobId: created.jobId,
        operation: 'refresh',
        state: 'queued',
        createdAt: now,
        updatedAt: now,
        request: {
          sessionId: params.sessionId,
          sourceType: params.sourceType,
          session: params.session,
          mediaIds: requestPhotoIds,
          masterInstruction,
          previousDraft: currentEntry.textDraft || undefined,
        },
        entryId: currentEntry.id,
        baseTextDraft: currentEntry.textDraft,
        requestedArchetype: selectedArchetype ?? null,
      });
      if (selectedArchetype) {
        setSelectedArchetypeByEntry((current) => ({ ...current, [entry.id]: selectedArchetype }));
      }
    } catch (refreshError) {
      setRefreshFeedbackByEntry((current) => ({
        ...current,
        [entry.id]: {
          kind: 'error',
          message: refreshError instanceof ContentSyncError ? refreshError.message : 'Не удалось отправить обновление в POSTiNKA.',
        },
      }));
    }
  };

  const retryContentJob = async (job: ContentIngestJobRecord) => {
    if (retryingJobIds.has(job.id) || job.retryable === false) return;
    setRetryingJobIds((current) => new Set(current).add(job.id));
    try {
      const entry = job.operation === 'create'
        ? null
        : contentEntriesRef.current.find((candidate) => candidate.id === job.entryId) ?? null;
      if (job.operation === 'refresh' && !entry) {
        await onDeleteContentIngestJob(job.id);
        return;
      }
      const photos = job.operation === 'create' ? job.entry.photos : entry?.photos ?? [];
      const mediaIds = job.operation === 'create'
        ? job.entry.photoIds
        : entry?.photoIds?.length === photos.length
          ? entry.photoIds
          : job.request.mediaIds;
      const previewIds = photos.map((_, index) => mediaIds[index] ?? `${job.id}-${index}`);
      const previews = await downsizePhotosSequentially(photos, previewIds);
      const created = await createContentIngestJob({
        sessionId: job.request.sessionId,
        sourceType: job.request.sourceType,
        session: job.request.session,
        media: previews,
        masterInstruction: job.request.masterInstruction,
        previousDraft: job.request.previousDraft,
      });
      await onSaveContentIngestJob({
        ...job,
        jobId: created.jobId,
        state: 'queued',
        updatedAt: new Date().toISOString(),
        error: undefined,
        retryable: undefined,
      });
    } catch (retryError) {
      setError(retryError instanceof ContentSyncError ? retryError.message : 'Не удалось повторить задачу POSTiNKA.');
    } finally {
      setRetryingJobIds((current) => {
        const next = new Set(current);
        next.delete(job.id);
        return next;
      });
    }
  };

  const copyContentDraft = async (entry: ContentEntry) => {
    if (!entry.textDraft.trim()) return;
    const attempt = copyFeedbackController.begin(entry.id);
    try {
      const copied = await copyTextToClipboard(entry.textDraft);
      if (copied) copyFeedbackController.finish(entry.id, attempt, 'success');
    } catch {
      copyFeedbackController.finish(entry.id, attempt, 'error');
    }
  };

  const toggleTranslationMenu = (entryId: string) => {
    const entry = contentEntriesRef.current.find((candidate) => candidate.id === entryId);
    if (entry && (hasUnsavedTextEdit(entry) || isEntryRefreshing(entry.id))) return;
    setTranslationMenuEntryIds((current) => {
      const next = new Set(current);
      if (next.has(entryId)) next.delete(entryId);
      else next.add(entryId);
      return next;
    });
  };

  const translateEntry = async (entry: ContentEntry, language: ContentTranslationLanguage) => {
    const currentEntry = contentEntriesRef.current.find((candidate) => candidate.id === entry.id) ?? entry;
    if (hasUnsavedTextEdit(currentEntry) || isEntryRefreshing(currentEntry.id) || !currentEntry.textDraft.trim() || currentContentTranslation(currentEntry, language)) return;
    if (translationRunner.isRunning(currentEntry.id, language)) return;

    const key = contentTranslationKey(currentEntry.id, language);
    setTranslationFeedbackByKey((current) => ({
      ...current,
      [key]: { state: 'loading', message: 'Перевожу…', sourceText: currentEntry.textDraft },
    }));

    try {
      const outcome = await translationRunner.run({
        entry: currentEntry,
        language,
        request: () => translateContentText({ sourceText: currentEntry.textDraft, targetLanguage: language }),
        getCurrentEntry: () => contentEntriesRef.current.find((candidate) => candidate.id === currentEntry.id) ?? currentEntry,
        save: saveEntryInWorkspace,
      });
      if (outcome.status === 'ignored' || !contentTranslationsMountedRef.current) return;
      setTranslationFeedbackByKey((current) => ({
        ...current,
        [key]: { state: 'success', message: 'Перевод готов', sourceText: currentEntry.textDraft },
      }));
    } catch (translationError) {
      if (!contentTranslationsMountedRef.current) return;
      setTranslationFeedbackByKey((current) => ({
        ...current,
        [key]: {
          state: 'error',
          message: translationError instanceof ContentSyncError ? translationError.message : 'Не удалось перевести текст.',
          sourceText: currentEntry.textDraft,
        },
      }));
    }
  };

  const copyContentTranslation = async (entry: ContentEntry, language: ContentTranslationLanguage) => {
    const translation = entry.translations?.[language];
    if (!translation?.translatedText.trim()) return;

    const key = contentTranslationKey(entry.id, language);
    const attempt = translationCopyFeedbackController.begin(key);
    try {
      const copied = await copyTextToClipboard(translation.translatedText);
      if (copied && contentTranslationsMountedRef.current) {
        translationCopyFeedbackController.finish(key, attempt, 'success');
      }
    } catch {
      if (contentTranslationsMountedRef.current) {
        translationCopyFeedbackController.finish(key, attempt, 'error');
      }
    }
  };

  const deleteContentEntry = (entryId: string) => {
    copyFeedbackController.clear(entryId);
    for (const option of CONTENT_TRANSLATION_OPTIONS) {
      translationCopyFeedbackController.clear(contentTranslationKey(entryId, option.language));
    }
    setTranslationFeedbackByKey((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([key]) => !CONTENT_TRANSLATION_OPTIONS.some((option) => key === contentTranslationKey(entryId, option.language))),
      ),
    );
    // A linked entry is still shown inside its project/session — "Удалить"
    // here should only take it out of POSTiNKA's own draft list, not erase
    // the content the project already points at. Only truly unlinked drafts
    // get hard-deleted (nothing else references them, nothing to keep).
    const entry = contentEntriesRef.current.find((candidate) => candidate.id === entryId);
    if (entry && isContentEntryLinked(entry)) {
      const hidden: ContentEntry = { ...entry, removedFromWorkspace: true };
      contentEntriesRef.current = contentEntriesRef.current.map((candidate) => (candidate.id === entryId ? hidden : candidate));
      onSaveEntry(hidden);
      return;
    }
    contentEntriesRef.current = contentEntriesRef.current.filter((entry) => entry.id !== entryId);
    onDeleteEntry(entryId);
  };

  const contentPublicationSets = (entry: ContentEntry) =>
    resolveContentPhotoPublicationSets({
      photos: entry.photos,
      photoIds: entry.photoIds,
      contentDraft: entry.contentDraft,
    });

  const contentSharePhotos = (
    entry: ContentEntry,
    target: 'carousel' | 'stories',
  ): ContentSharePhoto[] =>
    contentPublicationSets(entry)[target].map((photo) => ({
      src: photo.src,
      originalIndex: photo.originalIndex,
    }));

  const openContentShareMenu = (entryId: string) => {
    setShareFeedbackByEntry((current) => {
      const next = { ...current };
      delete next[entryId];
      return next;
    });
    setShareMenuEntryId(entryId);
  };

  const shareContentToInstagram = async (
    entry: ContentEntry,
    target: 'carousel' | 'stories',
  ) => {
    setShareMenuEntryId(null);
    const currentEntry = contentEntriesRef.current.find((candidate) => candidate.id === entry.id) ?? entry;
    const preparation = prepareInstagramContentShare({
      entryId: currentEntry.id,
      savedText: currentEntry.textDraft,
      photos: contentSharePhotos(currentEntry, target),
    });

    if (preparation.status === 'no_photo') {
      const targetLabel = target === 'carousel' ? 'карусели' : 'сториз';
      setShareFeedbackByEntry((current) => ({
        ...current,
        [entry.id]: { kind: 'error', message: 'В подборке для ' + targetLabel + ' нет фотографий' },
      }));
      return;
    }
    if (preparation.status === 'invalid_photo') {
      setShareFeedbackByEntry((current) => ({
        ...current,
        [entry.id]: { kind: 'error', message: 'Не удалось подготовить исходное фото для Instagram' },
      }));
      return;
    }

    const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean };
    const canShareFile = canShareInstagramContent(
      preparation,
      nav.canShare ? (data) => nav.canShare?.(data) === true : undefined,
    );
    if (!canShareFile || typeof nav.share !== 'function') {
      setShareFeedbackByEntry((current) => ({
        ...current,
        [entry.id]: { kind: 'error', message: 'Этот браузер не поддерживает передачу фото в системное меню' },
      }));
      return;
    }

    // Both permission-sensitive calls start in the same direct user gesture.
    const copyPromise = copyTextToClipboard(preparation.clipboardText);
    let sharePromise: Promise<void>;
    try {
      sharePromise = nav.share(preparation.payload);
    } catch (shareError) {
      const copied = await copyPromise.catch(() => false);
      if (copied) {
        setShareFeedbackByEntry((current) => ({
          ...current,
          [entry.id]: { kind: 'success', message: 'Текст скопирован — вставьте его в Instagram' },
        }));
      }
      if (!isShareAbortError(shareError)) {
        setShareFeedbackByEntry((current) => ({
          ...current,
          [entry.id]: {
            kind: 'error',
            message: copied
              ? 'Текст скопирован — вставьте его в Instagram. Не удалось открыть системное меню фото.'
              : 'Не удалось открыть системное меню Instagram',
          },
        }));
      }
      return;
    }

    let copied = false;
    try {
      copied = await copyPromise;
      if (copied) {
        setShareFeedbackByEntry((current) => ({
          ...current,
          [entry.id]: { kind: 'success', message: 'Текст скопирован — вставьте его в Instagram' },
        }));
      }
    } catch {
      setShareFeedbackByEntry((current) => ({
        ...current,
        [entry.id]: { kind: 'error', message: 'Фото готово, но текст не удалось скопировать' },
      }));
    }

    try {
      await sharePromise;
    } catch (shareError) {
      if (isShareAbortError(shareError)) return;
      setShareFeedbackByEntry((current) => ({
        ...current,
        [entry.id]: {
          kind: 'error',
          message: copied
            ? 'Текст скопирован — вставьте его в Instagram. Не удалось передать фото.'
            : 'Не удалось передать фото в системное меню',
        },
      }));
    }
  };

  const shareContentToOtherApps = async (entry: ContentEntry) => {
    setShareMenuEntryId(null);
    const currentEntry = contentEntriesRef.current.find((candidate) => candidate.id === entry.id) ?? entry;
    await shareContentEntry(currentEntry.id, currentEntry.photos, currentEntry.textDraft);
  };

  // ContentEntryCard intentionally ignores the freshly-created children prop
  // while its per-entry revision is unchanged. Keep every event handler inside
  // those children stable and delegate to the latest render's implementation,
  // so memoization cannot retain stale state or parent callbacks.
  const contentCardActionHandlersRef = useRef({
    updateExemplar,
    approveEntry,
    openLinkPicker,
    saveTextEdit,
    cancelTextEdit,
    startTextEdit,
    copyContentTranslation,
    translateEntry,
    regenerate,
    retryContentJob,
    onDeleteContentIngestJob,
    copyContentDraft,
    toggleTranslationMenu,
    openContentShareMenu,
    deleteContentEntry,
    shareContentToInstagram,
    shareContentToOtherApps,
  });
  contentCardActionHandlersRef.current = {
    updateExemplar,
    approveEntry,
    openLinkPicker,
    saveTextEdit,
    cancelTextEdit,
    startTextEdit,
    copyContentTranslation,
    translateEntry,
    regenerate,
    retryContentJob,
    onDeleteContentIngestJob,
    copyContentDraft,
    toggleTranslationMenu,
    openContentShareMenu,
    deleteContentEntry,
    shareContentToInstagram,
    shareContentToOtherApps,
  };
  const contentCardActions = useMemo(() => ({
    updateExemplar: (entry: ContentEntry, value: boolean) => contentCardActionHandlersRef.current.updateExemplar(entry, value),
    approveEntry: (entry: ContentEntry) => contentCardActionHandlersRef.current.approveEntry(entry),
    openLinkPicker: (entryId: string) => contentCardActionHandlersRef.current.openLinkPicker(entryId),
    saveTextEdit: (entry: ContentEntry) => contentCardActionHandlersRef.current.saveTextEdit(entry),
    cancelTextEdit: (entryId: string) => contentCardActionHandlersRef.current.cancelTextEdit(entryId),
    startTextEdit: (entry: ContentEntry) => contentCardActionHandlersRef.current.startTextEdit(entry),
    copyContentTranslation: (entry: ContentEntry, language: ContentTranslationLanguage) =>
      contentCardActionHandlersRef.current.copyContentTranslation(entry, language),
    translateEntry: (entry: ContentEntry, language: ContentTranslationLanguage) =>
      contentCardActionHandlersRef.current.translateEntry(entry, language),
    regenerate: (entry: ContentEntry, instruction: string, selectedArchetype?: string) =>
      contentCardActionHandlersRef.current.regenerate(entry, instruction, selectedArchetype),
    retryContentJob: (job: ContentIngestJobRecord) => contentCardActionHandlersRef.current.retryContentJob(job),
    deleteContentIngestJob: (jobId: string) => contentCardActionHandlersRef.current.onDeleteContentIngestJob(jobId),
    copyContentDraft: (entry: ContentEntry) => contentCardActionHandlersRef.current.copyContentDraft(entry),
    toggleTranslationMenu: (entryId: string) => contentCardActionHandlersRef.current.toggleTranslationMenu(entryId),
    openContentShareMenu: (entryId: string) => contentCardActionHandlersRef.current.openContentShareMenu(entryId),
    deleteContentEntry: (entryId: string) => contentCardActionHandlersRef.current.deleteContentEntry(entryId),
    shareContentToInstagram: (entry: ContentEntry, target: 'carousel' | 'stories') =>
      contentCardActionHandlersRef.current.shareContentToInstagram(entry, target),
    shareContentToOtherApps: (entry: ContentEntry) => contentCardActionHandlersRef.current.shareContentToOtherApps(entry),
  }), []);

  // Linked entries "deleted" from POSTiNKA (see deleteContentEntry above)
  // stay in the store but drop out of this workspace's own list — except
  // the one explicitly being focused (opened from its linked project/
  // session via focusEntryId below), which still needs to render so the
  // scroll-into-view/highlight effect has something to find.
  const workspaceEntries = contentEntries.filter((entry) => !entry.removedFromWorkspace || entry.id === focusEntryId);
  const visibleEntries = selectContentWorkspaceEntries({
    entries: workspaceEntries,
    clientFilter: filterClientId,
    focusedSource,
  });
  const pagedVisibleEntries = visibleEntries.slice(0, visibleEntryLimit);

  const clientLabel = (clientId: string | null) => {
    if (clientId === null) return 'Мастерская';
    const c = clients.find((x) => x.id === clientId);
    return c ? `${c.name} ${c.surname}`.trim() : '—';
  };

  return (
    <div style={{ minHeight: '100%' }}>
      <div style={{ height: 'calc(env(safe-area-inset-top) + 18px)' }} />
      {/* ── Шапка POSTiNKA ── */}
      <div style={{ padding: '6px 24px 12px' }}>
        <div className="inka-back" onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', marginBottom: 8 }}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M11 4L6 9L11 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span style={{ fontSize: fs(15), color: COLORS.gold, fontStyle: 'italic', letterSpacing: '0.3px' }}>вернуться</span>
        </div>
        <InkaLogo height={fs(15)} />
        <div style={{ fontSize: fs(24), color: COLORS.textPrimary, fontWeight: 300, letterSpacing: '1px', marginTop: 6 }}>POSTiNKA</div>
        <div style={{ fontSize: fs(13), color: COLORS.textGhost, marginTop: 2 }}>Собрать материал</div>
        <StarDivider />
      </div>

      <div style={{ padding: '0 24px 40px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* ── Верхний toolbar архетипов: основной текстовый архетип НОВОЙ генерации ── */}
        <div>
          <div className="content-archetype-label">
            {composerTextArchetype ? `Голос текста · ${composerTextArchetype}` : 'Голос текста · Инка выберет сама'}
          </div>
          <ArchetypeToolbar
            chips={ARCHETYPE_CHIPS}
            value={composerTextArchetype || null}
            disabled={sending}
            allowClear
            ariaLabel="Основной текстовый архетип новой публикации"
            onSelect={setComposerTextArchetype}
          />
        </div>


        {createIngestJobs.length > 0 && (
          <GoldFrame plain style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: fs(12), color: COLORS.gold, letterSpacing: '0.4px', marginBottom: 10 }}>В работе</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {createIngestJobs.map((job) => (
                <div key={job.id} style={{ borderTop: '1px solid rgba(var(--gold-rgb),0.14)', paddingTop: 10 }}>
                  <div style={{ fontSize: fs(13), color: COLORS.textPrimary }}>
                    {job.state === 'failed' ? 'Не удалось собрать материал' : 'POSTiNKA собирает материал…'}
                  </div>
                  <div style={{ fontSize: fs(11), color: COLORS.textGhost, marginTop: 3 }}>
                    {clientLabel(job.entry.clientId)} · {job.entry.sourceType === 'session' ? 'сессия' : job.entry.sourceType === 'consultation' ? 'консультация' : 'свободный материал'}
                  </div>
                  {job.state === 'failed' ? (
                    <>
                      <div className="content-refresh-feedback is-error" role="alert">{job.error ?? 'Задача завершилась ошибкой'}</div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        {job.retryable !== false && (
                          <button type="button" onClick={() => retryContentJob(job)} disabled={retryingJobIds.has(job.id)}>
                            {retryingJobIds.has(job.id) ? 'Повторяю…' : 'Повторить'}
                          </button>
                        )}
                        <button type="button" onClick={() => onDeleteContentIngestJob(job.id)}>Удалить</button>
                      </div>
                    </>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 6 }}>
                      <span style={{ fontSize: fs(11), color: COLORS.textGhost }}>Можно перейти в другой раздел</span>
                      <button type="button" onClick={() => onDeleteContentIngestJob(job.id)}>Отменить</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </GoldFrame>
        )}

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
            onClick={sending || !canGenerate ? undefined : handleGenerate}
            style={{
              ...SUBMIT_STYLE,
              marginTop: 12,
              opacity: sending ? 0.6 : canGenerate ? 1 : 0.4,
              cursor: sending || !canGenerate ? 'default' : 'pointer',
            }}
          >
            {sending ? 'Отправляю…' : 'Сгенерировать'}
          </div>
          {!sending && !canGenerate && (
            <div style={{ fontSize: fs(11), color: COLORS.textGhost, fontStyle: 'italic', marginTop: 6 }}>
              Впишите тему, добавьте фото или выберите сессию/консультацию.
            </div>
          )}
          {error && <div style={{ fontSize: fs(12), color: 'var(--urgent, #c0392b)', marginTop: 8 }}>{error}</div>}
        </GoldFrame>

        {/* ── Filter ── */}
        <select
          aria-label="Фильтр записей"
          value={filterClientId}
          onChange={(e) => {
            setFocusedSource(null);
            setFilterClientId(e.target.value);
            setVisibleEntryLimit(CONTENT_ENTRY_PAGE_SIZE);
          }}
          style={INPUT_STYLE}
        >
          <option value="all">Все</option>
          <option value="studio">Мастерская</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {`${c.name} ${c.surname}`.trim()}
            </option>
          ))}
        </select>

        {/* ── List ── */}
        <div ref={entriesListRef} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {focusedSource && (
            <div className="content-linked-heading">
              <span>Связанные черновики · {visibleEntries.length}</span>
              <button type="button" onClick={() => {
                setFocusedSource(null);
                setVisibleEntryLimit(CONTENT_ENTRY_PAGE_SIZE);
              }}>
                Показать все
              </button>
            </div>
          )}
          {visibleEntries.length === 0 && (
            <div style={{ fontSize: fs(14), color: COLORS.textGhost, fontStyle: 'italic' }}>Пока пусто.</div>
          )}
          {pagedVisibleEntries.map((entry) => {
            const revision = createContentEntryCardRevision(entry.id, [
              refreshingEntryIds.has(entry.id),
              refreshJobByEntry.get(entry.id),
              selectedArchetypeByEntry[entry.id],
              textEditorsByEntry[entry.id],
              textEditFeedbackByEntry[entry.id],
              copyFeedbackByEntry[entry.id],
              translationMenuEntryIds.has(entry.id),
              CONTENT_TRANSLATION_OPTIONS.map((option) => {
                const key = contentTranslationKey(entry.id, option.language);
                return [translationFeedbackByKey[key], translationCopyFeedbackByKey[key]];
              }),
              shareMenuEntryId === entry.id,
              shareFeedbackByEntry[entry.id],
            ], refreshFeedbackByEntry);
            return (
            <ContentEntryCard
              key={entry.id}
              entry={entry}
              highlighted={highlightedEntryId === entry.id}
              clients={clients}
              projects={projects}
              revision={revision}
            >
              <div className="content-card-header">
                <div style={{ fontSize: fs(10), color: COLORS.textGhost, letterSpacing: '0.5px' }}>
                  {clientLabel(entry.clientId)}
                  {entry.format === 'story' ? ' · сторис' : ''}
                </div>
                <div className="content-approval-row">
                  {entry.status === 'confirmed' ? (
                    <>
                      <span className="content-approved-status">Одобрено</span>
                      <label className={`content-exemplar-toggle${entry.isExemplar ? ' is-active' : ''}`}>
                        <input
                          type="checkbox"
                          checked={entry.isExemplar}
                          onChange={(event) => contentCardActions.updateExemplar(entry, event.target.checked)}
                        />
                        <span>Эталон</span>
                      </label>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="content-approve-action"
                      disabled={!entry.textDraft.trim() || hasUnsavedTextEdit(entry) || isEntryRefreshing(entry.id)}
                      onClick={() => contentCardActions.approveEntry(entry)}
                    >
                      Одобрить текст
                    </button>
                  )}
                </div>
                <ContentLinkStatus
                  entry={entry}
                  projects={projects}
                  clients={clients}
                  onOpenPicker={() => contentCardActions.openLinkPicker(entry.id)}
                />
              </div>
              {hasUnsavedTextEdit(entry) && (
                <div className="content-text-edit-guard">Сначала сохраните или отмените правки</div>
              )}
              <ContentPhotoGallery entry={entry} />
              {entry.status === 'draft' && textEditorsByEntry[entry.id] ? (
                <div className="content-text-editor">
                  <textarea
                    value={textEditorsByEntry[entry.id].editedText}
                    onChange={(event) => setTextEditorsByEntry((current) => ({
                      ...current,
                      [entry.id]: {
                        baseText: current[entry.id]?.baseText ?? entry.textDraft,
                        editedText: event.target.value,
                      },
                    }))}
                    rows={8}
                    dir="auto"
                    autoFocus
                    aria-label="Текст публикации"
                    aria-invalid={contentTextLength(textEditorsByEntry[entry.id].editedText.trim()) > MAX_CONTENT_TEXT_CHARACTERS}
                  />
                  <div className="content-text-editor__meta">
                    <span className={hasUnsavedTextEdit(entry) ? 'is-dirty' : ''}>
                      {hasUnsavedTextEdit(entry) ? 'Не сохранено' : 'Без изменений'}
                    </span>
                  </div>
                  {contentTextLength(textEditorsByEntry[entry.id].editedText.trim()) > MAX_CONTENT_TEXT_CHARACTERS && (
                    <div className="content-text-edit-feedback is-error" role="alert">
                      Сократите текст вручную до 650 символов
                    </div>
                  )}
                  {textEditFeedbackByEntry[entry.id] && (
                    <div className={`content-text-edit-feedback is-${textEditFeedbackByEntry[entry.id].kind}`} role="alert">
                      {textEditFeedbackByEntry[entry.id].message}
                    </div>
                  )}
                  <div className="content-text-editor__actions">
                    <ActionButton
                      icon="save"
                      label="Сохранить"
                      variant="primary"
                      disabled={
                        !textEditorsByEntry[entry.id].editedText.trim() ||
                        contentTextLength(textEditorsByEntry[entry.id].editedText.trim()) > MAX_CONTENT_TEXT_CHARACTERS
                      }
                      onClick={() => contentCardActions.saveTextEdit(entry)}
                    />
                    <ActionButton icon="cancel" label="Отмена" onClick={() => contentCardActions.cancelTextEdit(entry.id)} />
                  </div>
                </div>
              ) : entry.textDraft ? (
                <div className="content-text-output">
                  <div dir="auto" className="content-text-output__body">{entry.textDraft}</div>
                  {entry.status === 'draft' && !isEntryRefreshing(entry.id) && (
                    <ActionButton icon="edit" label="Редактировать" onClick={() => contentCardActions.startTextEdit(entry)} />
                  )}
                </div>
              ) : null}
              {!textEditorsByEntry[entry.id] && textEditFeedbackByEntry[entry.id] && (
                <div className={`content-text-edit-feedback is-${textEditFeedbackByEntry[entry.id].kind}`} role="status">
                  {textEditFeedbackByEntry[entry.id].message}
                </div>
              )}
              {CONTENT_TRANSLATION_OPTIONS.map((option) => {
                const translation = entry.translations?.[option.language];
                if (!translation) return null;
                const key = contentTranslationKey(entry.id, option.language);
                const isStale = isContentTranslationStale(entry, option.language);
                const feedback = translationFeedbackByKey[key];
                const copyFeedback = translationCopyFeedbackByKey[key];
                return (
                  <div key={option.language} className={`content-translation-block${isStale ? ' is-stale' : ''}`}>
                    <div className="content-translation-block__heading">
                      <span>{option.title}</span>
                      {isStale && <span>Перевод предыдущей версии</span>}
                    </div>
                    <div
                      className="content-translation-block__text"
                      dir={option.dir}
                      lang={option.language}
                    >
                      {translation.translatedText}
                    </div>
                    <div className="content-translation-block__actions">
                      <button type="button" onClick={() => contentCardActions.copyContentTranslation(entry, option.language)}>
                        {copyFeedback === 'success'
                          ? 'Скопировано'
                          : copyFeedback === 'error'
                            ? 'Не удалось скопировать'
                            : 'Копировать перевод'}
                      </button>
                      {isStale && (
                        <button
                          type="button"
                          disabled={feedback?.state === 'loading' || !entry.textDraft.trim() || hasUnsavedTextEdit(entry) || isEntryRefreshing(entry.id)}
                          onClick={() => contentCardActions.translateEntry(entry, option.language)}
                        >
                          {feedback?.state === 'loading' ? 'Перевожу…' : 'Обновить перевод'}
                        </button>
                      )}
                    </div>
                    {isStale && feedback?.state === 'error' && (
                      <div className="content-translation-feedback is-error" role="alert">
                        {feedback.message}
                      </div>
                    )}
                  </div>
                );
              })}
              {(entry.textArchetype || entry.visualArchetype || entry.textTriad) && (
                <div className="content-archetype-context">
                  {entry.textArchetype && <div>Основной текстовый архетип · {entry.textArchetype}</div>}
                  {entry.visualArchetype && <div>Визуальный архетип · {entry.visualArchetype}</div>}
                  {entry.textTriad && (
                    <div>
                      Текстовая триада · {entry.textTriad.opens} · {entry.textTriad.leads} · {entry.textTriad.closes}
                    </div>
                  )}
                </div>
              )}
              <div className="content-archetype-label">
                Голос текста — перегенерировать
              </div>
              <ArchetypeToolbar
                chips={ARCHETYPE_CHIPS}
                value={selectedArchetypeByEntry[entry.id] ?? null}
                disabled={entry.status === 'confirmed' || refreshingEntryIds.has(entry.id) || hasUnsavedTextEdit(entry)}
                ariaLabel="Перегенерировать текст публикации"
                onSelect={(label) => {
                  const preset = ARCHETYPE_CHIPS.find((candidate) => candidate.label === label);
                  if (preset) contentCardActions.regenerate(entry, preset.instruction, preset.label);
                }}
              />
              {entry.status === 'draft' && (
                <div className="content-refresh-row">
                  {refreshJobByEntry.get(entry.id)?.state !== 'failed' && refreshJobByEntry.has(entry.id) && (
                    <div className="content-refresh-feedback" role="status">POSTiNKA обновляет черновик… Можно перейти в другой раздел.</div>
                  )}
                  {refreshJobByEntry.get(entry.id)?.state === 'failed' && (
                    <div className="content-refresh-feedback is-error" role="alert">
                      {refreshJobByEntry.get(entry.id)?.error ?? 'Не удалось обновить черновик'}
                      <div style={{ display: 'flex', gap: 8, marginTop: 7 }}>
                        {refreshJobByEntry.get(entry.id)?.retryable !== false && (
                          <button type="button" onClick={() => {
                            const job = refreshJobByEntry.get(entry.id);
                            if (job) contentCardActions.retryContentJob(job);
                          }}>Повторить</button>
                        )}
                        <button type="button" onClick={() => {
                          const job = refreshJobByEntry.get(entry.id);
                          if (job) contentCardActions.deleteContentIngestJob(job.id);
                        }}>Удалить</button>
                      </div>
                    </div>
                  )}
                  <button
                    type="button"
                    className="content-refresh-action"
                    disabled={refreshingEntryIds.has(entry.id) || hasUnsavedTextEdit(entry)}
                    onClick={() => contentCardActions.regenerate(entry, '')}
                  >
                    <span className={refreshingEntryIds.has(entry.id) ? 'is-spinning' : ''} aria-hidden="true">
                      ↻
                    </span>
                    {refreshingEntryIds.has(entry.id) ? 'Обновляю…' : 'Обновить черновик'}
                  </button>
                  {refreshFeedbackByEntry[entry.id] && (
                    <div
                      className={`content-refresh-feedback is-${refreshFeedbackByEntry[entry.id].kind}`}
                      role={refreshFeedbackByEntry[entry.id].kind === 'error' ? 'alert' : 'status'}
                    >
                      {refreshFeedbackByEntry[entry.id].message}
                    </div>
                  )}
                </div>
              )}
              <ContentEntryActions
                primary={
                  <>
                    <button
                      type="button"
                      className={`content-action-button content-copy-action${copyFeedbackByEntry[entry.id] ? ` is-${copyFeedbackByEntry[entry.id]}` : ''}`}
                      aria-label="Копировать текст публикации"
                      aria-live="polite"
                      disabled={!entry.textDraft.trim()}
                      onClick={() => contentCardActions.copyContentDraft(entry)}
                    >
                      {copyFeedbackByEntry[entry.id] === 'success'
                        ? 'Скопировано'
                        : copyFeedbackByEntry[entry.id] === 'error'
                          ? 'Не удалось скопировать'
                          : 'Копировать текст'}
                    </button>
                    <button
                      type="button"
                      className="content-action-button content-translate-action"
                      aria-expanded={translationMenuEntryIds.has(entry.id)}
                      disabled={!entry.textDraft.trim() || hasUnsavedTextEdit(entry)}
                      onClick={() => contentCardActions.toggleTranslationMenu(entry.id)}
                    >
                      Перевести
                    </button>
                    {hasUnsavedTextEdit(entry) && <span className="content-text-edit-guard">Сначала сохраните текст</span>}
                    <button
                      type="button"
                      className="content-action-button content-share-action"
                      onClick={() => contentCardActions.openContentShareMenu(entry.id)}
                    >
                      Поделиться
                    </button>
                  </>
                }
                danger={
                  <ActionButton
                    icon="delete"
                    label="Удалить"
                    variant="danger"
                    onClick={() => contentCardActions.deleteContentEntry(entry.id)}
                  />
                }
              />
              {shareFeedbackByEntry[entry.id] && (
                <div
                  className={`content-share-feedback is-${shareFeedbackByEntry[entry.id].kind}`}
                  role={shareFeedbackByEntry[entry.id].kind === 'error' ? 'alert' : 'status'}
                >
                  {shareFeedbackByEntry[entry.id].message}
                </div>
              )}
              {shareMenuEntryId === entry.id && (
                <ContentShareSheet
                  carouselCount={contentPublicationSets(entry).carousel.length}
                  storiesCount={contentPublicationSets(entry).stories.length}
                  onInstagramCarousel={() => void contentCardActions.shareContentToInstagram(entry, 'carousel')}
                  onInstagramStories={() => void contentCardActions.shareContentToInstagram(entry, 'stories')}
                  onOtherApps={() => void contentCardActions.shareContentToOtherApps(entry)}
                  onClose={() => setShareMenuEntryId(null)}
                />
              )}
              {translationMenuEntryIds.has(entry.id) && (
                <div className="content-translation-menu">
                  {CONTENT_TRANSLATION_OPTIONS.map((option) => {
                    const key = contentTranslationKey(entry.id, option.language);
                    const feedback = translationFeedbackByKey[key];
                    const hasCurrentTranslation = !!currentContentTranslation(entry, option.language);
                    return (
                      <div key={option.language} className="content-translation-menu__option">
                        <button
                          type="button"
                          disabled={!entry.textDraft.trim() || hasUnsavedTextEdit(entry) || feedback?.state === 'loading' || hasCurrentTranslation}
                          onClick={() => contentCardActions.translateEntry(entry, option.language)}
                        >
                          {feedback?.state === 'loading' ? 'Перевожу…' : option.actionLabel}
                        </button>
                        {hasCurrentTranslation && (
                          <span className="content-translation-feedback is-success" role="status">
                            {feedback?.state === 'success' ? feedback.message : 'Перевод актуален'}
                          </span>
                        )}
                        {!hasCurrentTranslation && feedback?.state === 'error' && (
                          <span
                            className="content-translation-feedback is-error"
                            role="alert"
                          >
                            {feedback.message}
                          </span>
                        )}
                        {!hasCurrentTranslation &&
                          feedback?.state === 'success' &&
                          feedback.sourceText === entry.textDraft && (
                            <span className="content-translation-feedback is-success" role="status">
                              {feedback.message}
                            </span>
                          )}
                      </div>
                    );
                  })}
                </div>
              )}
            </ContentEntryCard>
            );
          })}
          {pagedVisibleEntries.length < visibleEntries.length && (
            <button
              type="button"
              className="content-filter-chip content-show-more"
              onClick={() => setVisibleEntryLimit((current) => Math.min(current + CONTENT_ENTRY_PAGE_SIZE, visibleEntries.length))}
            >
              Показать ещё
            </button>
          )}
        </div>
      </div>
      <ContentLinkPickerSheet
        open={!!linkPickerEntryId}
        entry={contentEntries.find((e) => e.id === linkPickerEntryId) ?? null}
        projects={projects}
        clients={clients}
        target={linkPickerTarget}
        onTargetChange={setLinkPickerTarget}
        onClose={() => setLinkPickerEntryId(null)}
        onPick={(link) => {
          const entry = contentEntries.find((e) => e.id === linkPickerEntryId);
          if (entry) updateEntryLink(entry, link);
        }}
        onCreateProject={() => {
          const entry = contentEntries.find((e) => e.id === linkPickerEntryId);
          if (!entry) return;
          setLinkPickerEntryId(null);
          onCreateProjectForLink(entry.id, entry.clientId);
        }}
        onCreateSession={() => {
          const entry = contentEntries.find((e) => e.id === linkPickerEntryId);
          if (!entry) return;
          setLinkPickerEntryId(null);
          onCreateSessionForLink(entry.id, entry.clientId);
        }}
      />
    </div>
  );
}

export function ContentPanel({
  clientId,
  sourceType,
  sourceId,
  entries,
  onOpenContent,
}: {
  clientId: string;
  sourceType: 'session' | 'consultation';
  sourceId: string;
  entries: ContentEntry[];
  onOpenContent: (navigation: ContentWorkspaceNavigation) => void;
}) {
  const linkedEntries = findLinkedContentEntries(entries, { sourceType, sourceId });
  const hasLinkedEntries = linkedEntries.length > 0;

  const navigate = () =>
    onOpenContent({
      sourceType,
      sourceId,
      clientId,
      mode: hasLinkedEntries ? 'open-linked' : 'compose',
    });

  return (
    <div className="content-source-panel">
      <div className="content-source-panel__heading">Контент</div>
      {hasLinkedEntries && (
        <div className="content-source-panel__status">
          <span>В ContentINKA</span>
          {linkedEntries.length > 1 && <span>{linkedEntries.length} черновика</span>}
        </div>
      )}
      <button type="button" className="content-source-panel__action" onClick={navigate}>
        {hasLinkedEntries ? 'Открыть в ContentINKA' : 'Передать в ContentINKA'}
      </button>
    </div>
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

