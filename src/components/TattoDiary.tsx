import { useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react';
import { InkaLogo, DROP_CAP_FONT } from './InkaLogo';
import { NavFab } from './navigation/NavFab';
import {
  readSyncSettings,
  writeSyncSettings,
  diffAndSync,
  setConflictHandler,
  type CalendarSyncSettings,
} from '../lib/calendarSync';
import {
  ContentSyncError,
  readContentSyncSettings,
  writeContentSyncSettings,
  type ContentSyncSettings,
} from '../lib/contentSync';
import {
  CONTENT_INGEST_JOB_STORE,
  ContentJobDbUnavailableError,
  TATTO_DIARY_DB_VERSION,
  deleteContentEntryAndRefreshJobs,
  deleteContentIngestJob,
  ensureContentIngestJobStore,
  loadContentIngestJobs,
  putContentIngestJob,
  startContentIngestJobCoordinator,
  type ContentIngestJobRecord,
} from '../lib/contentJobQueue';
export { shareOrDownloadJSON } from '../lib/contentShare';
import { normalizeContentEntry } from '../lib/contentApproval';
import {
  findLinkedContentEntries,
  type ContentWorkspaceNavigation,
} from '../lib/contentWorkspace';
import {
  normalizeContentEntryLink,
  setContentEntryLink,
  type ContentEntryLink,
} from '../lib/contentLink';
import { type SessionFormData } from '../lib/sessionSave';
import { type ConsultationFormData } from '../lib/consultationSave';
import { ensureBucketProject } from '../lib/autoProject';
import {
  ERROR_LOG_KEY,
  appendErrorEntry,
  describeError,
  parseErrorLog,
  type DiaryErrorEntry,
  type DiaryErrorSource,
} from '../lib/errorLog';
import {
  STORAGE_ACTIONS,
  storageFailureMessage,
  storageFailureNeedsReconnect,
  type StorageFailureKind,
} from '../lib/storageMessages';
import {
  MASTER_INFO_STORE,
  MASTER_INFO_RECORD_ID,
  MASTER_INFO_LOCAL_KEY,
  DEFAULT_MASTER_INFO,
  normalizeMasterInfo,
  resolveMasterInfoSource,
  isMasterInfoEmpty,
  applyMasterInfoRestore,
  type MasterInfo,
  type MasterInfoRestore,
} from '../lib/masterInfoStore';
import {
  LAST_BACKUP_STORAGE_KEY,
  backupStatus,
  type PersistenceState,
} from '../lib/storageHealth';
import type {
  BackupArchiveProgress,
  ImportBackupArchiveResult,
  PrepareBackupArchiveOptions,
  PreparedBackupArchive,
} from '../lib/backupArchive';
import { readOrCreateInstallationId } from '../lib/backupIdentity';
// Все мутации сессий/консультаций после Этапа 2 — записи живут на проектах,
// вся чистая логика (цепочки, перевод в сессию, переезд между проектами) там.
import {
  upsertSessionInProjects,
  upsertConsultationInProjects,
  updateSessionInProjects,
  updateConsultationInProjects,
  moveSessionToProject,
  moveConsultationToProject,
  applyConsultationConversionInProjects,
  deleteSessionFromProjects,
  deleteConsultationFromProjects,
} from '../lib/projectRecordSave';
import { migrateClientRecordsIntoProjects } from '../lib/clientRecordsMigration';
// Чистые хелперы вынесены в отдельные модули (PR 3 рефакторинга). Логика
// не менялась — только перенос.
import { isRTL, firstLetter, nameRest } from '../lib/textFormat';
import { normalizeClient, normalizeProject } from '../lib/normalize';
// UI-примитивы вынесены в отдельные модули (PR 4 рефакторинга). Логика и
// разметка не менялись — только перенос.
import { TopStripe, RightStripe, GemCorner } from './ui/Stripes';
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
import { CreateChoiceSheet } from './sheets/CreateChoiceSheet';
import { NoteComposerSheet } from './sheets/NoteComposerSheet';
import {
  TimelineViewSheet,
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
// не менялись — только перенос; каждый экран prop-driven. Ни один из них не
// нужен для самого первого экрана (screen === 'list' на старте) — раньше все
// они (плюс DetailScreen ниже) всё равно безусловно попадали в один-
// единственный бандл (534 КБ/147 КБ gzip — Vite сам предупреждал об этом при
// сборке), и устройство разбирало и выполняло их код ещё до отрисовки списка
// клиентов. React.lazy откладывает загрузку каждого экрана до первого
// перехода на него.
const WorkshopScreen = lazy(() => import('./screens/WorkshopScreen').then((m) => ({ default: m.WorkshopScreen })));
const SettingsScreen = lazy(() => import('./screens/SettingsScreen').then((m) => ({ default: m.SettingsScreen })));
const SummaryScreen = lazy(() => import('./screens/SummaryScreen').then((m) => ({ default: m.SummaryScreen })));
const AdminDashboardScreen = lazy(() => import('./screens/AdminDashboardScreen').then((m) => ({ default: m.AdminDashboardScreen })));
const ContentINKAScreen = lazy(() => import('./screens/ContentINKAScreen').then((m) => ({ default: m.ContentINKAScreen })));
const MasterDashboardScreen = lazy(() => import('./screens/MasterDashboardScreen').then((m) => ({ default: m.MasterDashboardScreen })));
// Кластер «карточка клиента» вынесен в отдельный модуль (PR 11 рефакторинга) —
// самый большой из экранов (2600+ строк), поэтому лениво (см. выше про
// остальные экраны). AddChatLinkForm/AddMasterLinkForm (используются в
// MasterDashboardScreen) живут в client/ClientControls, а не здесь и не в
// screens/DetailScreen — иначе статический импорт утянул бы весь тот экран
// обратно в основной бандл.
const DetailScreen = lazy(() => import('./screens/DetailScreen').then((m) => ({ default: m.DetailScreen })));
// Только тип (стирается при сборке) — ленивый чанк карточки клиента от этого
// в основной бандл не возвращается.
import type { ClientCardTab } from './screens/DetailScreen';
// Иконки и мини-игры вынесены в отдельные модули (PR 2 рефакторинга).
// Логика и разметка не менялись — только перенос. Мини-игры показываются
// только внутри TrialGate — редкого overlay (обязателен для самого первого
// клиента, иначе шанс сработать 15% на создание карточки/сессии/заметки или
// на возврат в приложение) — поэтому тоже лениво.
import { StarDivider } from './icons/StarIcons';
const RPSGame = lazy(() => import('./games/RPSGame').then((m) => ({ default: m.RPSGame })));
const RPSTauntFace = lazy(() => import('./games/RPSGame').then((m) => ({ default: m.RPSTauntFace })));
const CupsGame = lazy(() => import('./games/CupsGame').then((m) => ({ default: m.CupsGame })));
const BlackjackGame = lazy(() => import('./games/BlackjackGame').then((m) => ({ default: m.BlackjackGame })));
// Доменные типы и их константы вынесены в src/domain/* (PR 2 рефакторинга).
// Форма данных и значения не изменились — это те же существующие типы,
// импортируемые обратно; второй модели Project не создавалось.
import { type UrgencyKey } from '../domain/urgency';
import { type Session } from '../domain/session';
import { type Consultation, isConsultationDeletable } from '../domain/consultation';
import { type ClientNote } from '../domain/task';
import {
  type ClientType,
  CLIENT_TYPES,
  ACCENT_COLORS,
  MARKER_COLORS,
  clientStyles,
  type Client,
} from '../domain/client';
export { ACCENT_COLORS, MARKER_COLORS } from '../domain/client';
// Чистые выборки/сортировки/агрегаты вынесены в domain/*Selectors и
// utils/dates (PR 3 рефакторинга). Алгоритмы и результаты не менялись.
import { ISO_DATE_RE, formatDate, dateParts, todayISO } from '../utils/dates';
import {
  getProjectById,
  getProjectsByClientId,
  getConsultationNumber,
  getClientSessions,
  getClientConsultations,
} from '../domain/projectSelectors';
export { clientNameFor } from '../domain/projectSelectors';
import {
  nextPlannedSession,
  type SortMode,
  SORT_MODES,
  sortClients,
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
  overdueProjectConsultations,
  upcomingSoonProjectConsultations,
  overdueProjects,
  staleProjects,
} from '../reminders/buildReminders';
import { taskReminderSources, taskReminders, filterVisibleTaskReminders } from '../reminders/buildTaskReminders';
import {
  overdueReminderKey,
  healingReminderKey,
  healingReminderKeysForSession,
  soonReminderKey,
  overdueProjectSessionReminderKey,
  soonProjectSessionReminderKey,
  overdueProjectConsultationReminderKey,
  soonProjectConsultationReminderKey,
  projectReminderKey,
  staleProjectReminderKey,
} from '../reminders/reminderKeys';
import {
  type ReminderState,
  loadReminderState,
  saveReminderState,
  filterVisibleReminders,
  dismissReminder,
  snoozeReminder,
  restoreReminder,
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
  isMeaningfulProjectChange,
  withAdvancedStage,
} from '../domain/project';
import { type ContentEntry } from '../domain/content';
export type { ContentEntry } from '../domain/content';
import { DASHBOARD_WINDOW_OPTIONS, DEFAULT_PREFS, type Prefs } from './ui/preferences';
export { DEFAULT_PREFS, type Prefs } from './ui/preferences';
import { readInitialMinimalism, applyMinimalism } from './ui/minimalism';

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

// Tear-off calendar square — weekday/day/month of TODAY, doubling as the
// «Открыть календарь» launcher. Always shows today's date (was the soonest
// upcoming session/consultation's date before — confusing next to a «today»
// -looking icon, and it vanished entirely once there was nothing upcoming).
// Positioned by the caller (each screen places it inside its own header), so
// it scrolls away with the rest of that header instead of staying pinned on
// screen — unlike the Сортировка/Фильтры/Поиск circles, which stay fixed
// regardless of scroll.
function TodayDateBadge({ onOpen }: { onOpen: () => void }) {
  const parts = dateParts(todayISO());
  if (!parts) return null;
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
// Сколько ждём ответа от indexedDB.open(), прежде чем считать попытку
// провалившейся и уйти на повтор.
const DB_OPEN_TIMEOUT_MS = 8000;

const initDB = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open('TattoDiaryDB', TATTO_DIARY_DB_VERSION);
    // Промис обязан завершиться при любом исходе, иначе повторные попытки
    // ниже просто не начнутся. Два случая, в которых он раньше не завершался
    // никогда: открытие заблокировано другой вкладкой с этим же дневником
    // (onblocked, обработчика не было вовсе) и молчаливое зависание open() на
    // iOS, когда система усыпила приложение прямо во время открытия — там не
    // приходит вообще ни одного события, и приложение висело бесконечно,
    // даже не показав плашку с «Повторить».
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (run: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      run();
    };
    timer = setTimeout(() => finish(() => reject(new Error('IndexedDB open timed out'))), DB_OPEN_TIMEOUT_MS);
    request.onerror = () => finish(() => reject(request.error));
    request.onsuccess = () => {
      // Если open() всё-таки ответил уже после таймаута, соединение нужно
      // закрыть: иначе оно останется висеть и заблокирует следующую попытку.
      if (settled) {
        request.result.close();
        return;
      }
      finish(() => resolve(request.result));
    };
    request.onblocked = () => finish(() => reject(new Error('IndexedDB upgrade blocked')));
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
      if (!db.objectStoreNames.contains(MASTER_INFO_STORE)) {
        db.createObjectStore(MASTER_INFO_STORE, { keyPath: 'id' });
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
  if (meta) meta.setAttribute('content', theme === 'light' ? '#F2EDE3' : '#0D0B08');
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
// Тип карточки мастера, её умолчания и нормализация переехали в
// lib/masterInfoStore.ts вместе с самим хранилищем: карточка живёт в
// IndexedDB, а не в localStorage, где ей не хватало квоты под фото в задачах.
// Старая копия в localStorage остаётся нетронутой как страховка.
function readLocalMasterInfo(): MasterInfo {
  try {
    const raw = localStorage.getItem(MASTER_INFO_LOCAL_KEY);
    return raw ? normalizeMasterInfo(JSON.parse(raw)) : { ...DEFAULT_MASTER_INFO };
  } catch {
    return { ...DEFAULT_MASTER_INFO };
  }
}

// ===================== MAIN APP =====================
export default function TattoDiary() {
  // Клиенты ровно как они лежат в базе. Их собственные sessions/consultations
  // (легаси-массивы) больше НЕ читаются: после Этапа 2 записи живут только на
  // проектах, а «записи клиента» собираются из них — см. clients ниже.
  // Массивы остаются в записи клиента как страховка после переноса (см.
  // lib/clientRecordsMigration.ts), поэтому их нельзя просто взять и
  // отобразить — они устаревают, как только запись правят через проект.
  const [storedClients, setStoredClients] = useState<Client[]>([]);
  // Distinguishes "still loading from IndexedDB" from "genuinely no clients
  // yet" — without it, the first-run empty state flashes on every load before
  // the (real) client list comes in.
  const [clientsLoaded, setClientsLoaded] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  // Клиент с записями — проекция, а не хранилище (Этап 2). Иерархия
  // Клиент → Проект → консультации/сессии: единственный источник истины —
  // Project.sessions/consultations, отсюда же собирается и «срез клиента».
  // Благодаря этому весь код ниже (карточка клиента, напоминания, планнер,
  // контент, календарь) продолжает работать с привычной формой Client, но
  // видит уже проектные данные — переписывать каждое чтение не пришлось.
  const clients = useMemo(
    () =>
      storedClients.map((c) => ({
        ...c,
        sessions: getClientSessions(projects, c.id),
        consultations: getClientConsultations(projects, c.id),
      })),
    [storedClients, projects],
  );
  // Единая сущность для всего, что проходит через ContentINKA — см.
  // ContentEntry ниже. Отдельный store ('contentEntries'), не часть
  // клиента — доступна и без выбранного клиента (страница ContentINKA,
  // «мастерская»).
  const [contentEntries, setContentEntries] = useState<ContentEntry[]>([]);
  const [contentIngestJobs, setContentIngestJobs] = useState<ContentIngestJobRecord[]>([]);
  const [db, setDb] = useState<IDBDatabase | null>(null);
  const [dbError, setDbError] = useState<string | null>(null);
  // Какого рода сбой показан — от этого зависит, предлагать ли «Повторить»
  // (см. storageFailureNeedsReconnect в lib/storageMessages.ts).
  const [dbErrorKind, setDbErrorKind] = useState<StorageFailureKind | null>(null);

  // ── Журнал сбоев ─────────────────────────────────────────────────────────
  // Консоль браузера на телефоне не открыть, поэтому раньше сбой не оставлял
  // следа вообще и разобрать «у меня что-то упало» было нечем. Журнал живёт
  // в localStorage осознанно: он обязан работать именно тогда, когда база
  // недоступна. Только текст, без данных клиентов и без фото.
  const [errorLog, setErrorLog] = useState<DiaryErrorEntry[]>(() => {
    try {
      return parseErrorLog(localStorage.getItem(ERROR_LOG_KEY));
    } catch {
      return [];
    }
  });
  const logError = (source: DiaryErrorSource, action: string, error: unknown) => {
    setErrorLog((prev) => {
      const next = appendErrorEntry(prev, {
        at: new Date().toISOString(),
        source,
        action,
        message: describeError(error),
      });
      try {
        localStorage.setItem(ERROR_LOG_KEY, JSON.stringify(next));
      } catch {
        // Журнал — вспомогательный: не смогли записать, показ всё равно идёт.
      }
      return next;
    });
  };
  const clearErrorLog = () => {
    setErrorLog([]);
    try {
      localStorage.removeItem(ERROR_LOG_KEY);
    } catch {
      /* ignore */
    }
  };

  // Единственная точка, где появляется сообщение о сбое хранилища. Раньше
  // здесь было двадцать разных формулировок про одно и то же — теперь текст
  // собирается из состояния и названия операции, и та же пара уходит в
  // журнал.
  const reportStorageFailure = (kind: StorageFailureKind, action: string, error?: unknown) => {
    setDbErrorKind(kind);
    setDbError(storageFailureMessage(kind, action));
    logError('storage', action, error ?? kind);
  };
  const clearStorageFailure = () => {
    setDbError(null);
    setDbErrorKind(null);
  };

  // Падения, до которых не дотягивается ни один try/catch: ошибка в рендере,
  // сорвавшийся промис. Мастеру они видны как «приложение странно себя ведёт»,
  // а в журнале останутся словами.
  useEffect(() => {
    // Без названия операции: у этих двух источников подпись уже всё говорит
    // («сбой приложения», «фоновая задача»), и повторять её значит писать
    // «фоновая задача · фоновая задача».
    const onError = (event: ErrorEvent) => logError('crash', '', event.error ?? event.message);
    const onRejection = (event: PromiseRejectionEvent) => logError('promise', '', event.reason);
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);
  const [theme, setTheme] = useState<Theme>(readInitialTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  // Минимализм — independent of theme (see ui/minimalism.ts): strips
  // decorative gems/pendants/rays down to a plain functional layer, on top
  // of whichever theme (dark/light) is active.
  const [minimalism, setMinimalism] = useState<boolean>(readInitialMinimalism);

  useEffect(() => {
    applyMinimalism(minimalism);
  }, [minimalism]);

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
  // Карточка мастера живёт в IndexedDB — там, где квоты хватает под фото в
  // задачах. Раньше она лежала в localStorage (~5 МБ на весь дневник), и
  // очередная заметка с фото просто переставала помещаться: запись падала,
  // заметка терялась. Клиенты, проекты и контент были в базе давно —
  // личное мастера оставалось защищено хуже всего остального.
  //
  // Стартовое значение читается из СТАРОЙ localStorage-копии синхронно:
  // карточка рисуется сразу, без пустого мига, даже пока база открывается
  // (и даже если она вообще не откроется). Как только база ответит, её
  // запись заменит это значение — см. эффект загрузки ниже.
  const [masterInfo, setMasterInfo] = useState<MasterInfo>(readLocalMasterInfo);
  // Стабильный на эту установку приложения — не на дневник и не на мастера:
  // им подписывается каждая резервная копия (см. lib/backupIdentity.ts),
  // чтобы отличить «копия с этого же устройства» от чужой при восстановлении.
  const [installationId] = useState(readOrCreateInstallationId);

  // САМОЕ ОПАСНОЕ МЕСТО ПЕРЕЕЗДА. Запись асинхронная, а состояние уже есть,
  // поэтому без этого флага порядок был бы такой: смонтировались со
  // стартовым значением → эффект записи тут же уложил его в базу → и только
  // потом пришёл ответ базы. То есть настоящая карточка затиралась бы
  // стартовой на каждом запуске, молча. Пока флаг не поднят, в базу не
  // пишется НИЧЕГО.
  const [masterInfoLoaded, setMasterInfoLoaded] = useState(false);

  useEffect(() => {
    if (!db || masterInfoLoaded) return;
    const tx = openTx(MASTER_INFO_STORE, db, 'readonly', STORAGE_ACTIONS.loadMasterInfo);
    if (!tx) return;
    const request = tx.objectStore(MASTER_INFO_STORE).get(MASTER_INFO_RECORD_ID);
    request.onsuccess = () => {
      const stored = request.result ? normalizeMasterInfo(request.result) : null;
      const { value, needsMigration } = resolveMasterInfoSource(stored, readLocalMasterInfo());
      setMasterInfo(value);
      // Флаг поднимаем ДО переезда: дальше карточку пишет обычный эффект
      // ниже, и переезд — это просто первая такая запись.
      setMasterInfoLoaded(true);
      if (needsMigration && isMasterInfoEmpty(value)) {
        // Переносить нечего: записи в базе нет и старая копия пуста. Запись
        // появится сама, с первой правкой.
        return;
      }
      if (needsMigration) {
        const writeTx = openWriteTx(MASTER_INFO_STORE, db, STORAGE_ACTIONS.migrateMasterInfo);
        if (!writeTx) return;
        writeTx.objectStore(MASTER_INFO_STORE).put({ ...value, id: MASTER_INFO_RECORD_ID });
        writeTx.onerror = () => reportStorageFailure('write', STORAGE_ACTIONS.migrateMasterInfo);
      }
    };
    request.onerror = () => reportStorageFailure('read', STORAGE_ACTIONS.loadMasterInfo);
  }, [db, masterInfoLoaded]);

  useEffect(() => {
    if (!db || !masterInfoLoaded) return;
    const tx = openWriteTx(MASTER_INFO_STORE, db, STORAGE_ACTIONS.saveMasterInfo);
    if (!tx) return;
    tx.objectStore(MASTER_INFO_STORE).put({ ...masterInfo, id: MASTER_INFO_RECORD_ID });
    tx.onerror = () => reportStorageFailure('write', STORAGE_ACTIONS.saveMasterInfo);
  }, [db, masterInfoLoaded, masterInfo]);
  // Старая копия в localStorage НЕ обновляется и не удаляется: она остаётся
  // страховкой на случай, если переезд куда-то положил данные неверно —
  // ровно тот же приём, что с легаси-массивами клиента в Этапе 2.

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
  const handleRestoreReminder = (key: string) => setReminderState((prev) => restoreReminder(prev, key));
  // «Не напоминать больше» на карточке заживления — скрывает разом ключи
  // всех 4 стадий этой сессии (не только видимую сейчас), см.
  // healingReminderKeysForSession. Окна стадий не пересекаются, так что
  // скрытые впрок ключи будущих стадий просто не дадут им показаться позже.
  const handleHideAllHealing = (sessionId: string) =>
    setReminderState((prev) => healingReminderKeysForSession(sessionId).reduce((s, k) => dismissReminder(s, k), prev));

  const [screen, setScreen] = useState<'list' | 'detail' | 'settings' | 'summary' | 'master' | 'admin' | 'workshop' | 'content'>('list');
  const [contentNavigation, setContentNavigation] = useState<ContentWorkspaceNavigation | null>(null);
  // Узкий navigation target «открыть вот эту запись» по entry.id — для
  // клика по карточке в разделе «Контент» экрана проекта, где записи могут
  // быть freeform/без клиента (ContentWorkspaceNavigation сюда не подходит).
  // Так же транзиентно и не persisted, как contentNavigation.
  const [contentFocusEntryId, setContentFocusEntryId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Карточка клиента открывается на «Проектах» — сессии и консультации
  // собственных вкладок больше не имеют, работа идёт через проект (см.
  // CLIENT_TABS в DetailScreen.tsx).
  const [activeTab, setActiveTab] = useState<ClientCardTab>('projects');
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
  // Единая шторка выбора создаваемой сущности (CreateChoiceSheet) — какой
  // контекст сейчас её открыл, решает набор опций и то, куда ведёт выбор
  // (см. onCreate у NavFab и рендер CreateChoiceSheet ниже). 'workshop'
  // обслуживает и «Мастерскую», и «Личный кабинет» мастера — оба места
  // создают client-less сущности одинаково.
  const [createChoiceContext, setCreateChoiceContext] = useState<'detail' | 'workshop' | 'viewProject' | 'admin' | null>(null);
  const [showNewConsultationForm, setShowNewConsultationForm] = useState(false);
  const [editConsultation, setEditConsultation] = useState<Consultation | null>(null);
  // Consultation being turned into a session («Перевести в сессию») —
  // prefills NewSessionSheet (area/style/photos/project + notes) and, once
  // the session is saved, the consultation is removed so it doesn't stick
  // around as a stale duplicate. See startConvertConsultationToSession /
  // handleAddSession below.
  const [convertingConsultation, setConvertingConsultation] = useState<Consultation | null>(null);
  // Консультация, от которой назначается следующая («Назначить следующую
  // консультацию») — prefills NewConsultationSheet (проект/зона/стиль), а
  // после сохранения связывает новую запись с этой через
  // previousConsultationId/nextConsultationId (см. upsertConsultation в
  // lib/consultationSave.ts). Консультация-источник при этом не меняется и
  // не исчезает — цепочка только растёт, ничего не заменяется (см.
  // startChainNextConsultation ниже).
  const [chainFromConsultation, setChainFromConsultation] = useState<Consultation | null>(null);
  // Сессия, от которой назначается следующая («Назначить следующую сессию»)
  // — тот же паттерн, что chainFromConsultation выше, но для сессий (см.
  // Session.previousSessionId/nextSessionId в lib/sessionSave.ts). Отдельное
  // состояние от convertingConsultation — их источники не пересекаются
  // (startChainNextSession/startConvertConsultationToSession каждый сбрасывает
  // состояние другого, чтобы в NewSessionSheet не утёк чужой префилл).
  const [chainFromSession, setChainFromSession] = useState<Session | null>(null);
  // «Творческая мастерская» — standalone projects, not tied to any client.
  const [showNewProjectForm, setShowNewProjectForm] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);
  // Пикер «в какой проект» для сессии/консультации (Мастерская, Личный
  // кабинет, Админка) — projectPickerKind решает, какая форма откроется
  // после выбора/создания проекта; projectPickerScope — 'clientless' (как
  // раньше, Мастерская/Личный кабинет) или 'all' (Админка — все проекты,
  // сгруппированные по клиенту, см. ProjectSessionPickerSheet scope='all').
  const [showProjectSessionPicker, setShowProjectSessionPicker] = useState(false);
  const [projectPickerKind, setProjectPickerKind] = useState<'session' | 'consultation'>('session');
  const [projectPickerScope, setProjectPickerScope] = useState<'clientless' | 'all'>('clientless');
  // Заметка через CreateChoiceSheet (карточка клиента/мастера, «Мастерская»,
  // открытый проект) — контекст решает clientId/projectId, с которыми
  // заметка создаётся.
  const [noteComposerContext, setNoteComposerContext] = useState<{ clientId: string | null; projectId: string | null } | null>(null);
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
  // Зеркало sessionTargetProjectId выше, для Project.consultations.
  const [consultationTargetProjectId, setConsultationTargetProjectId] = useState<string | null>(null);
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

  // ── Сохранность хранилища ────────────────────────────────────────────────
  // Данные мастера живут только в этом браузере, поэтому один раз при
  // запуске просим перевести хранилище в «постоянное»: браузер вправе
  // вычистить данные сайта под нехватку места, при чистке «данных сайтов», а
  // на iOS — просто потому, что приложение неделю не открывали. Никакого
  // предупреждения при этом не будет, поэтому просим заранее.
  //
  // Запрос идемпотентный и дешёвый; отказ — не ошибка, просто показываем
  // честный статус в Настройках (см. persistenceText в lib/storageHealth.ts).
  const [persistence, setPersistence] = useState<PersistenceState>('unsupported');
  const [storageEstimate, setStorageEstimate] = useState<{ usage?: number; quota?: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const storage = navigator.storage as StorageManager | undefined;
      if (!storage?.persist || !storage.persisted) return;
      try {
        const already = await storage.persisted();
        const granted = already || (await storage.persist());
        if (!cancelled) setPersistence(granted ? 'persisted' : 'not-persisted');
      } catch {
        // Браузер отказался отвечать — состояние остаётся «не знаем».
      }
      try {
        if (storage.estimate) {
          const estimate = await storage.estimate();
          if (!cancelled) setStorageEstimate({ usage: estimate.usage, quota: estimate.quota });
        }
      } catch {
        /* оценка объёма необязательна */
      }
    };
    check();
    return () => {
      cancelled = true;
    };
  }, []);

  // Когда в последний раз мастер реально унесла копию из телефона. Пишется
  // только на успешную отдачу файла (см. handleSharePrepared в SettingsScreen) — попытка
  // и отмена копией не считаются.
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LAST_BACKUP_STORAGE_KEY);
    } catch {
      return null;
    }
  });
  // Плашку можно закрыть — но только до перезапуска: копия от этого не
  // появляется, поэтому насовсем прятать напоминание нечем.
  const [backupNoticeHidden, setBackupNoticeHidden] = useState(false);
  const markBackupDone = () => {
    const now = new Date().toISOString();
    try {
      localStorage.setItem(LAST_BACKUP_STORAGE_KEY, now);
    } catch {
      // Отметку не сохранили — не беда: копия сделана, напомним лишний раз.
    }
    setLastBackupAt(now);
  };

  const connectDb = () => {
    initDBWithRetry()
      .then((database) => {
        clearStorageFailure();
        setDb(database);
        // Браузер может закрыть соединение сам (нехватка памяти — вероятнее
        // всего на больших фото), а другая вкладка — начать обновление схемы.
        // Раньше об этом узнавали только при следующей записи, то есть уже
        // потеряв действие мастера; теперь плашка с «Повторить» появляется
        // сразу, как только соединение исчезло.
        database.onclose = () => {
          setDb(null);
          reportStorageFailure('lost', STORAGE_ACTIONS.open);
        };
        database.onversionchange = () => {
          database.close();
          setDb(null);
          reportStorageFailure('conflicting', STORAGE_ACTIONS.open);
        };
        loadClients(database);
        loadProjects(database);
        loadContentEntries(database);
        reloadContentIngestJobs(database);
      })
      .catch((err) => {
        console.error('IndexedDB init failed:', err);
        reportStorageFailure('lost', STORAGE_ACTIONS.open);
      });
  };

  useEffect(() => {
    connectDb();
  }, []);

  // db.transaction() бросает исключение синхронно, если соединение уже
  // закрылось (браузер может закрыть его сам под давлением памяти — вероятнее
  // при больших фото, см. downsizeForStorage). Раньше это исключение никем не
  // ловилось и роняло всё приложение вместо понятной ошибки с «Повторить».
  // Соединение уже закрыто — это всегда «хранилище отключилось», независимо
  // от того, какую операцию пытались начать; операция нужна только чтобы
  // назвать её в журнале.
  const openTx = (storeNames: string | string[], database: IDBDatabase, mode: IDBTransactionMode, action: string): IDBTransaction | null => {
    try {
      return database.transaction(storeNames, mode);
    } catch (err) {
      setDb(null);
      reportStorageFailure('lost', action, err);
      return null;
    }
  };
  const openWriteTx = (storeNames: string | string[], database: IDBDatabase, action: string): IDBTransaction | null =>
    openTx(storeNames, database, 'readwrite', action);

  const loadClients = (database: IDBDatabase) => {
    const tx = openTx('clients', database, 'readonly', STORAGE_ACTIONS.loadClients);
    if (!tx) return;
    const request = tx.objectStore('clients').getAll();
    request.onsuccess = () => {
      setStoredClients((request.result || []).map(normalizeClient));
      setClientsLoaded(true);
    };
    request.onerror = () => reportStorageFailure('read', STORAGE_ACTIONS.loadClients);
  };

  const loadProjects = (database: IDBDatabase) => {
    const tx = openTx('projects', database, 'readonly', STORAGE_ACTIONS.loadProjects);
    if (!tx) return;
    const request = tx.objectStore('projects').getAll();
    request.onsuccess = () => {
      setProjects((request.result || []).map(normalizeProject));
      setProjectsLoaded(true);
    };
    request.onerror = () => reportStorageFailure('read', STORAGE_ACTIONS.loadProjects);
  };

  const reloadMasterInfo = (database: IDBDatabase) => {
    const tx = openTx(MASTER_INFO_STORE, database, 'readonly', STORAGE_ACTIONS.loadMasterInfo);
    if (!tx) return;
    const request = tx.objectStore(MASTER_INFO_STORE).get(MASTER_INFO_RECORD_ID);
    request.onsuccess = () => {
      if (request.result) setMasterInfo(normalizeMasterInfo(request.result));
    };
    request.onerror = () => reportStorageFailure('read', STORAGE_ACTIONS.loadMasterInfo);
  };

  // ZIP v6 is written to OPFS record-by-record. In contrast to the old
  // getAll()+monolithic JSON path, export no longer materializes a second
  // copy of the entire photo library in page memory.
  const prepareFullBackup = async (options: PrepareBackupArchiveOptions): Promise<PreparedBackupArchive> => {
    if (!db) return Promise.reject(new Error('Хранилище сейчас недоступно. Нажмите «Повторить» и попробуйте снова.'));
    const { prepareBackupArchive } = await import('../lib/backupArchive');
    return prepareBackupArchive(db, options);
  };

  const restoreFullBackup = async (
    file: File,
    options: { signal?: AbortSignal; onProgress?: (progress: BackupArchiveProgress) => void },
  ): Promise<ImportBackupArchiveResult> => {
    if (!db) throw new Error('Хранилище сейчас недоступно. Нажмите «Повторить» и попробуйте снова.');
    try {
      const { importBackupArchive } = await import('../lib/backupArchive');
      const result = await importBackupArchive(db, file, options);
      if (result.masterInfo) setMasterInfo(result.masterInfo);
      return result;
    } finally {
      // A cancelled restore may already have safely upserted some records.
      // Always make React reflect IndexedDB before the user continues.
      loadClients(db);
      loadProjects(db);
      loadContentEntries(db);
      reloadContentIngestJobs(db);
      reloadMasterInfo(db);
    }
  };

  // Единственная точка записи в стор проектов — поэтому и единственное место,
  // где бампается lastMeaningfulActivityAt (M4): ищем предыдущую сохранённую
  // версию этого проекта и, если isMeaningfulProjectChange находит реальное
  // движение (или проект новый — prev не найден), проставляем «сейчас».
  // Иначе (правка текстовых полей/фото/заметок) значение остаётся как в
  // переданном project — обычно унаследованным от prev через спред на
  // вызывающей стороне.
  // Синхронизация записей клиента с Инка-календарём после записи проектов
  // (Этап 2). Сессии/консультации переехали на проект, поэтому их изменения
  // больше не проходят через saveClient — без этого синк молча перестал бы
  // работать (не сломался бы с ошибкой, а просто перестал: событий в
  // календаре бы не появлялось, и заметить это можно было бы только вручную).
  // Дифф считается на клиентском СРЕЗЕ: собираем, как он выглядел до и после
  // записи, и отдаём привычному diffAndSync.
  //
  // Затронутыми считаются клиенты обеих сторон: и тех проектов, что
  // изменились, и прежний владелец проекта, у которого сменился clientId
  // (иначе привязка проекта к клиенту оставила бы в календаре события,
  // висящие на старом владельце). Проекты без клиента («Мастерская») в
  // календарь не ходили и не ходят.
  const syncCalendarAfterProjectsSave = (before: Project[], after: Project[]) => {
    const beforeById = new Map(before.map((p) => [p.id, p]));
    const affected = new Set<string>();
    for (const project of after) {
      const prev = beforeById.get(project.id);
      if (prev === project) continue;
      if (project.clientId) affected.add(project.clientId);
      if (prev?.clientId && prev.clientId !== project.clientId) affected.add(prev.clientId);
    }
    for (const clientId of affected) {
      const client = storedClients.find((c) => c.id === clientId);
      if (!client) continue;
      const asSyncClient = (source: Project[]) => ({
        id: client.id,
        name: client.name,
        surname: client.surname,
        sessions: getClientSessions(source, client.id),
        consultations: getClientConsultations(source, client.id),
      });
      diffAndSync(asSyncClient(before), asSyncClient(after), calendarSync);
    }
  };

  // Единственная точка записи в стор проектов. Принимает ПОЛНЫЙ новый список
  // (см. lib/projectRecordSave.ts — все операции над записями возвращают
  // именно его) и пишет одной транзакцией только те проекты, у которых
  // сменилась ссылка.
  //
  // Почему одной: два saveProject подряд в одном тике теряют данные — второй
  // читает projects из ещё не обновившегося React-состояния и затирает
  // первый. Ровно так пропадала сессия в проекте без клиента (#248), и после
  // переезда всех записей на проекты этот же сценарий задевал бы уже каждую
  // связанную пару (запись + обратная ссылка цепочки, запись + автопроект).
  const saveProjects = (nextProjects: Project[]) => {
    if (!db) {
      reportStorageFailure('lost', STORAGE_ACTIONS.saveClient);
      return;
    }
    const beforeById = new Map(projects.map((p) => [p.id, p]));
    const changed = nextProjects.filter((p) => beforeById.get(p.id) !== p);
    if (changed.length === 0) return;
    const tx = openWriteTx('projects', db, STORAGE_ACTIONS.saveProject);
    if (!tx) return;
    const store = tx.objectStore('projects');
    // Бамп «последнего движения» — то же правило, что было в saveProject:
    // только значимые изменения (см. isMeaningfulProjectChange), новый проект
    // получает его всегда.
    const written = changed.map((project) => {
      const prev = beforeById.get(project.id);
      const next =
        prev && !isMeaningfulProjectChange(prev, project)
          ? project
          : { ...project, lastMeaningfulActivityAt: new Date().toISOString() };
      store.put(next);
      return next;
    });
    tx.oncomplete = () => {
      loadProjects(db);
      const writtenById = new Map(written.map((p) => [p.id, p]));
      syncCalendarAfterProjectsSave(projects, nextProjects.map((p) => writtenById.get(p.id) ?? p));
    };
    tx.onerror = () => reportStorageFailure('write', STORAGE_ACTIONS.saveClient);
  };

  // Записать один проект — та же запись, просто вход поудобнее для мест, где
  // меняется ровно один проект (форма проекта, next step, этап).
  const saveProject = (project: Project) => {
    const exists = projects.some((p) => p.id === project.id);
    saveProjects(exists ? projects.map((p) => (p.id === project.id ? project : p)) : [...projects, project]);
  };

  const deleteProject = (id: string) => {
    if (!db) {
      reportStorageFailure('lost', STORAGE_ACTIONS.deleteProject);
      return;
    }
    const tx = openWriteTx('projects', db, STORAGE_ACTIONS.deleteProject);
    if (!tx) return;
    tx.objectStore('projects').delete(id);
    tx.oncomplete = () => {
      loadProjects(db);
      setEditProject(null);
      setShowNewProjectForm(false);
    };
    tx.onerror = () => reportStorageFailure('write', STORAGE_ACTIONS.deleteProject);
  };

  // ── Перенос записей клиента на проекты (Этап 2) ──
  // Однократно после того, как загрузились И клиенты, И проекты: пока
  // загрузился только один из сторов, судить о том, что переносить, нельзя
  // (пустой список проектов выглядел бы как «все записи осиротели» и увёл бы
  // их в «Неразобранный»). Сама раскладка — чистая и идемпотентная, см.
  // lib/clientRecordsMigration.ts; здесь только запись результата.
  //
  // Все затронутые проекты пишутся ОДНОЙ транзакцией: перенос либо
  // применяется целиком, либо не применяется вовсе — половинчатого
  // состояния, где часть записей уже уехала, а часть нет, не возникает.
  // Легаси-массивы Client.sessions/consultations намеренно не чистятся —
  // остаются в базе как страховка (и как источник для повторного прогона,
  // если перенос не удался).
  //
  // Источник — ИМЕННО storedClients, клиенты как они лежат в базе. Передать
  // сюда вычисляемый clients нельзя: его sessions/consultations собраны из
  // тех же проектов, поэтому миграция сочла бы каждую запись уже
  // перенесённой (признак «уже перенесена» — совпадение id с записью в
  // проекте клиента) и не сделала бы ничего — молча, без ошибки, а реальные
  // легаси-записи так и остались бы невидимыми.
  const recordsMigrationRanRef = useRef(false);
  useEffect(() => {
    if (!db || !clientsLoaded || !projectsLoaded || recordsMigrationRanRef.current) return;
    const result = migrateClientRecordsIntoProjects(storedClients, projects);
    if (result.changedProjectIds.length === 0) {
      recordsMigrationRanRef.current = true;
      return;
    }
    const changed = new Set(result.changedProjectIds);
    const tx = openWriteTx('projects', db, STORAGE_ACTIONS.migrateRecords);
    if (!tx) return;
    const store = tx.objectStore('projects');
    for (const project of result.projects) {
      if (changed.has(project.id)) store.put(project);
    }
    tx.oncomplete = () => {
      recordsMigrationRanRef.current = true;
      loadProjects(db);
    };
    tx.onerror = () => reportStorageFailure('write', STORAGE_ACTIONS.migrateRecords);
  }, [db, clientsLoaded, projectsLoaded, storedClients, projects]);

  const loadContentEntries = (database: IDBDatabase) => {
    const tx = openTx('contentEntries', database, 'readonly', STORAGE_ACTIONS.loadContent);
    if (!tx) return;
    const request = tx.objectStore('contentEntries').getAll();
    request.onsuccess = () =>
      setContentEntries((request.result || []).map((entry) => normalizeContentEntry(entry)).map((entry) => normalizeContentEntryLink(entry)));
    request.onerror = () => reportStorageFailure('read', STORAGE_ACTIONS.loadContent);
  };

  // contentJobQueue's reads/writes throw ContentJobDbUnavailableError when
  // the connection died mid-call (see openJobTx there) — react the same way
  // openTx does for every other store: drop `db` so the (now shell-wide)
  // banner's «Повторить» shows up, instead of a dead-end message that leaves
  // `db` looking fine while every next attempt fails the same way.
  const handleContentJobDbError = (err: unknown, action: string): boolean => {
    if (!(err instanceof ContentJobDbUnavailableError)) return false;
    setDb(null);
    reportStorageFailure('lost', action, err);
    return true;
  };

  const reloadContentIngestJobs = (database: IDBDatabase) => {
    loadContentIngestJobs(database)
      .then(setContentIngestJobs)
      .catch((err) => {
        if (!handleContentJobDbError(err, STORAGE_ACTIONS.loadJobs)) {
          reportStorageFailure('read', STORAGE_ACTIONS.loadJobs);
        }
      });
  };

  const saveContentIngestJob = async (record: ContentIngestJobRecord): Promise<void> => {
    if (!db) throw new ContentSyncError('Хранилище недоступно — задача не сохранена.');
    try {
      await putContentIngestJob(db, record);
    } catch (err) {
      if (handleContentJobDbError(err, STORAGE_ACTIONS.saveContent)) {
        throw new ContentSyncError('Хранилище недоступно — задача не сохранена.');
      }
      throw err;
    }
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
      if (!handleContentJobDbError(err, STORAGE_ACTIONS.deleteJob)) {
        reportStorageFailure('write', STORAGE_ACTIONS.deleteJob);
      }
    }
  };

  // Единственная точка записи для contentEntries — по аналогии с
  // saveClient. Апсерт по id: запись с тем же id перезаписывается
  // (перегенерация текста), иначе создаётся новая.
  const saveContentEntry = (entry: ContentEntry) => {
    if (!db) {
      reportStorageFailure('lost', STORAGE_ACTIONS.saveClient);
      return;
    }
    setContentEntries((current) => [entry, ...current.filter((candidate) => candidate.id !== entry.id)]);
    const tx = openWriteTx('contentEntries', db, STORAGE_ACTIONS.saveContent);
    if (!tx) return;
    tx.objectStore('contentEntries').put(entry);
    tx.oncomplete = () => loadContentEntries(db);
    tx.onerror = () => {
      reportStorageFailure('write', STORAGE_ACTIONS.saveContent);
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
      .catch(() => reportStorageFailure('write', STORAGE_ACTIONS.deleteContent));
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

  // Записывает карточку клиента. Сессии и консультации сюда больше не входят
  // — они живут на проектах (Этап 2), а в объекте client лежит их ПРОЕКЦИЯ
  // (см. clients выше). Записать проекцию обратно значило бы воскресить
  // дублирующее хранилище, поэтому легаси-массивы берём из storedClients и
  // оставляем ровно такими, какие они есть: они — страховка после переноса,
  // приложение их не читает и не меняет.
  //
  // Календарь: раньше saveClient был единственной воронкой всех изменений, и
  // дифф здесь ловил в том числе сессии/консультации. Теперь их изменения
  // идут через saveProject — синк по ним переехал туда (см. syncClientRecords
  // ниже), а здесь остаётся дифф остальной карточки.
  const saveClient = (client: Client) => {
    if (!db) {
      reportStorageFailure('lost', STORAGE_ACTIONS.saveClient);
      return;
    }
    const stored = storedClients.find((c) => c.id === client.id);
    const record: Client = {
      ...client,
      sessions: stored?.sessions ?? [],
      consultations: stored?.consultations ?? [],
    };
    const prevClient = clients.find((c) => c.id === client.id) ?? null;
    const tx = openWriteTx('clients', db, STORAGE_ACTIONS.saveClient);
    if (!tx) return;
    tx.objectStore('clients').put(record);
    tx.oncomplete = () => {
      loadClients(db);
      // client (а не record) — с актуальной проекцией записей, чтобы дифф
      // сравнивал одинаковые по природе снимки.
      diffAndSync(prevClient, client, calendarSync);
    };
    tx.onerror = () => reportStorageFailure('write', STORAGE_ACTIONS.saveClient);
  };

  const deleteClient = (id: string) => {
    if (!db) {
      reportStorageFailure('lost', STORAGE_ACTIONS.deleteClient);
      return;
    }
    // Удаление клиента убирает из календаря и все его синхронизированные
    // записи (diffAndSync со "старое есть, нового нет" шлёт delete).
    const prevClient = clients.find((c) => c.id === id) ?? null;
    const tx = openWriteTx('clients', db, STORAGE_ACTIONS.deleteClient);
    if (!tx) return;
    tx.objectStore('clients').delete(id);
    tx.oncomplete = () => {
      loadClients(db);
      diffAndSync(prevClient, null, calendarSync);
      setScreen('list');
      setSelectedId(null);
      setShowEditClientForm(false);
    };
    tx.onerror = () => reportStorageFailure('write', STORAGE_ACTIONS.deleteClient);
  };

  // Импорт полного бэкапа: clients + опционально projects/contentEntries и
  // личный кабинет. Старые бэкапы без опциональных массивов не стирают
  // текущие данные.
  //
  // Кабинет приходит одним из двух видов (см. masterInfoFromBackup): новая
  // копия несёт карточку целиком, старая — только задачи, и тогда имя,
  // реквизиты и подписи цветов остаются текущими. Он пишется той же
  // транзакцией, что и всё остальное: восстановление либо случилось
  // целиком, либо не случилось вовсе.
  const replaceAllData = (bundle: {
    clients: Client[];
    projects?: Project[];
    contentEntries?: ContentEntry[];
    master?: MasterInfoRestore;
  }) => {
    if (!db) {
      reportStorageFailure('lost', STORAGE_ACTIONS.importData);
      return;
    }
    const restoredMaster = bundle.master ? applyMasterInfoRestore(masterInfo, bundle.master) : null;
    const stores = ['clients'];
    if (bundle.projects) stores.push('projects');
    if (bundle.contentEntries) stores.push('contentEntries', CONTENT_INGEST_JOB_STORE);
    if (restoredMaster) stores.push(MASTER_INFO_STORE);
    const tx = openWriteTx(stores, db, STORAGE_ACTIONS.importData);
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
    if (restoredMaster) {
      tx.objectStore(MASTER_INFO_STORE).put({ ...restoredMaster, id: MASTER_INFO_RECORD_ID });
    }
    tx.oncomplete = () => {
      loadClients(db);
      if (bundle.projects) loadProjects(db);
      if (bundle.contentEntries) {
        loadContentEntries(db);
        reloadContentIngestJobs(db);
      }
      // Состояние приводится к тому, что уже лежит в базе. Обычный эффект
      // сохранения кабинета повторит эту же запись — она идентична, вреда нет.
      if (restoredMaster) setMasterInfo(restoredMaster);
    };
    tx.onerror = () => reportStorageFailure('write', STORAGE_ACTIONS.importData);
  };

  // Adds/updates just the given clients (put, no clear) — the counterpart to
  // a single-client export: importing that file merges it into whatever's
  // already stored instead of replacing the whole list.
  const importClients = (newClients: Client[]) => {
    if (!db) {
      reportStorageFailure('lost', STORAGE_ACTIONS.importData);
      return;
    }
    const tx = openWriteTx('clients', db, STORAGE_ACTIONS.importData);
    if (!tx) return;
    const store = tx.objectStore('clients');
    newClients.forEach((c) => store.put(c));
    tx.oncomplete = () => loadClients(db);
    tx.onerror = () => reportStorageFailure('write', STORAGE_ACTIONS.importData);
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
    setActiveTab('projects');
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
    setChainFromSession(null);
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
    setChainFromConsultation(null);
    setCalendarCreateDate(null);
    setCalendarEventKind(null);
    setPresetEntryProjectId(null);
    setConsultationTargetProjectId(null);
  };
  const closeEditClient = () => setShowEditClientForm(false);
  const closeBackdrop = () => {
    setShowNewClientForm(false);
    setShowNewSessionForm(false);
    setShowEditClientForm(false);
    setShowNewConsultationForm(false);
    setCreateChoiceContext(null);
    setEditSession(null);
    setEditConsultation(null);
    setChainFromConsultation(null);
    setShowCalendar(false);
    setViewEntry(null);
    cancelCalendarWalk();
  };

  // Reached once a client (existing or freshly created) is in place for the
  // event the master started from the calendar — opens that client's card
  // with the form already up and the date prefilled. Behind the form the
  // card sits on «Проекты» (its only entry point into work now that the
  // Сессии/Консультации tabs are gone).
  const openPendingCalendarEvent = () => {
    setScreen('detail');
    setActiveTab('projects');
    if (calendarEventKind === 'consultation') {
      setEditConsultation(null);
      setShowNewConsultationForm(true);
    } else {
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

  // ── Мутации записей: всегда в том проекте, где запись физически лежит ──
  // Единственная форма записи после Этапа 2. Раньше каждый обработчик
  // пересобирал client.sessions/consultations и звал saveClient; теперь
  // владелец записи — проект, а вся чистая логика (включая цепочки и
  // «перевести в сессию» через границу проекта) живёт в
  // lib/projectRecordSave.ts. Здесь остаются только «взять список — применить
  // — сохранить».
  const updateSession = (sessionId: string, update: (session: Session) => Session) => {
    saveProjects(updateSessionInProjects(projects, sessionId, update));
  };

  const updateConsultation = (consultationId: string, update: (consultation: Consultation) => Consultation) => {
    saveProjects(updateConsultationInProjects(projects, consultationId, update));
  };

  // Session created via «Перевести в сессию» — restore the consultation it
  // came from first, so deleting the session doesn't leave the consultation
  // pointing at a session that no longer exists. No-op for a session with no
  // sourceConsultationId link — an ordinary session deletes exactly as before.
  // Консультация-источник может лежать в другом проекте, чем сессия, — обе
  // стороны меняются одной записью (см. deleteSessionFromProjects).
  const deleteSession = (sessionId: string) => {
    saveProjects(deleteSessionFromProjects(projects, sessionId));
  };

  // «Сессия/консультация не может быть без проекта» — если форма не
  // предложила конкретный projectId (мастер оставила «— создать новый
  // проект —»), молча заводим/переиспользуем ОДИН проект-«отстойник» на
  // владельца (bucket-<clientId> / bucket-master), а не плодим новый проект
  // при каждом отдельном «не выбрала». Возвращает список ВМЕСТЕ с новым
  // проектом, чтобы он уехал в базу тем же сохранением, что и сама запись
  // (см. ensureBucketProject в lib/autoProject.ts).
  const ensureProject = (
    source: Project[],
    projectId: string | null,
    ownerClient: Client | null,
  ): { projects: Project[]; projectId: string } =>
    ensureBucketProject(source, projectId, ownerClient, masterInfo.name, MARKER_COLORS[0]);

  // Авто-переход этапа проекта ВНУТРИ списка (Этап 3b): создана будущая
  // сессия → «Записан», сессия выполнена → «В работе». Только вперёд, не
  // дальше нужного (см. withAdvancedStage). Раньше это была отдельная запись
  // в стор — теперь этап уезжает тем же сохранением, что и сама сессия: два
  // сохранения проектов в одном тике затирают друг друга (#248).
  const advanceStageIn = (source: Project[], projectId: string | null, target: ProjectStage): Project[] =>
    projectId ? source.map((p) => (p.id === projectId ? withAdvancedStage(p, target) : p)) : source;

  // Стиль, введённый в форме сессии, подхватывается в список стилей клиента —
  // это единственное, что сессия меняет в самой карточке клиента (остальное
  // живёт на проекте). Пишется в свой стор и только когда стиль правда новый.
  const mergeSessionStyleIntoClient = (client: Client | null, style: string) => {
    const trimmed = style.trim();
    if (!client || !trimmed) return;
    const styles = clientStyles(client);
    if (styles.includes(trimmed)) return;
    const merged = [...styles, trimmed];
    saveClient({ ...client, styles: merged, style: merged.join(' · ') });
  };

  // Общая точка сохранения сессии из формы «Новая сессия» — и с карточки
  // клиента, и из Мастерской, и из content-link цепочки. Владельца задаёт
  // проект, поэтому все три случая отличаются только тем, откуда взялся
  // ownerClient/projectId; запись, обратная ссылка цепочки, перевод
  // консультации в сессию и переход этапа уезжают ОДНИМ сохранением.
  const commitSession = (
    data: SessionFormData,
    ownerClient: Client | null,
    presetProjectId: string | null,
  ): string => {
    const { projects: withProject, projectId } = ensureProject(projects, presetProjectId ?? data.projectId, ownerClient);
    const { projects: withSession, sessionId } = upsertSessionInProjects(
      withProject,
      projectId,
      { ...data, projectId },
      editSession?.id ?? null,
      chainFromSession?.id ?? null,
    );
    // Конвертация консультации (см. startConvertConsultationToSession): она
    // остаётся в истории (status:'converted'), а не удаляется, и связывается
    // с получившейся сессией тем же сохранением — обе стороны меняются
    // одним изменением, даже если лежат в разных проектах.
    const withConversion = convertingConsultation
      ? applyConsultationConversionInProjects(withSession, sessionId, convertingConsultation.id)
      : withSession;
    saveProjects(advanceStageIn(withConversion, projectId, data.done ? 'in_progress' : 'booked'));
    mergeSessionStyleIntoClient(ownerClient, data.style);
    return sessionId;
  };

  // Консультация с карточки клиента. Чистая логика (список консультаций
  // проекта + связь цепочки) — в upsertConsultationInProjects
  // (src/lib/projectRecordSave.ts). previousConsultationId идёт от
  // chainFromConsultation (см. startChainNextConsultation ниже), null для
  // обычной «Новой консультации». Автопроект (если мастер не выбрала свой)
  // заводится тем же списком и уезжает в базу одной записью с консультацией.
  const handleAddConsultation = (data: ConsultationFormData) => {
    if (!selectedClient) return;
    const { projects: withProject, projectId } = ensureProject(projects, data.projectId, selectedClient);
    const { projects: next } = upsertConsultationInProjects(
      withProject,
      projectId,
      { ...data, projectId },
      editConsultation?.id ?? null,
      chainFromConsultation?.id ?? null,
    );
    saveProjects(next);
    setShowNewConsultationForm(false);
    setEditConsultation(null);
    setChainFromConsultation(null);
    setCalendarCreateDate(null);
    setCalendarEventKind(null);
    setPresetEntryProjectId(null);
  };

  // A converted consultation is linked to a real session
  // (Session.sourceConsultationId) — deleting it here would leave that
  // session pointing at a consultation that no longer exists.
  // ConsultationRow already hides the delete control for this case (see
  // isConsultationDeletable in domain/consultation.ts); this guards the
  // funnel itself too, so the protection doesn't rely on a hidden button
  // alone. Delete the linked session first (which restores the consultation
  // via deleteSession above), then the now-unconverted consultation can be
  // deleted normally.
  const deleteConsultation = (consultationId: string) => {
    if (!selectedClient) return;
    const consultation = selectedClient.consultations.find((c) => c.id === consultationId);
    if (consultation && !isConsultationDeletable(consultation, selectedClient.sessions)) return;
    saveProjects(deleteConsultationFromProjects(projects, consultationId));
  };

  // «Перевести в сессию» — consultation happened, master and client agreed on
  // a work session, so the consultation moves into a session instead of a new
  // one being created alongside it. Opens NewSessionSheet prefilled from the
  // consultation (see prefillConsultation there); the actual client.sessions/
  // client.consultations mutation happens together in handleAddSession once
  // the form is saved (see convertingConsultation below).
  const startConvertConsultationToSession = (consultation: Consultation) => {
    setActiveTab('projects');
    setEditSession(null);
    setConvertingConsultation(consultation);
    // NewSessionSheet's prefill source must be unambiguous — clear any
    // pending «next session» chain so it doesn't leak into this different
    // prefill (see chainFromSession/startChainNextSession below).
    setChainFromSession(null);
    setShowNewSessionForm(true);
    setViewEntry(null);
  };

  // «Назначить следующую консультацию» — та же консультация остаётся как
  // есть (см. заголовок Consultation.previousConsultationId), открывается
  // NewConsultationSheet в режиме создания (editConsultation===null),
  // предзаполненный проектом/зоной/стилем предыдущей встречи (см.
  // prefillFrom/chainFrom в NewConsultationSheet) — но с чистыми заметками/
  // итогом/next step, это отдельная запись. Связь проставляется в
  // handleAddConsultation через chainFromConsultation.
  const startChainNextConsultation = (consultation: Consultation) => {
    setActiveTab('projects');
    setEditConsultation(null);
    setChainFromConsultation(consultation);
    setShowNewConsultationForm(true);
    setViewEntry(null);
  };

  // «Назначить следующую сессию» — та же сессия остаётся как есть (см.
  // заголовок Session.previousSessionId), открывается NewSessionSheet в
  // режиме создания (editSession===null), предзаполненный зоной/стилем/
  // проектом предыдущей встречи (см. chainFrom в NewSessionSheet) — но с
  // чистыми заметками/фото/статусом, это отдельная запись. Связь
  // проставляется в handleAddSession через chainFromSession. Не пересекается
  // с «Перевести в сессию» — тот же взаимный сброс, что там.
  const startChainNextSession = (session: Session) => {
    setActiveTab('projects');
    setEditSession(null);
    setConvertingConsultation(null);
    setChainFromSession(session);
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
      // Привязка клиента к проекту, у которого уже есть записи, больше НЕ
      // требует их переноса: после Этапа 2 сессии и консультации и так лежат
      // на самом проекте, а «записи клиента» — вычисляемый срез по его
      // проектам (getClientSessions). Стоит проекту получить clientId, как
      // они появляются в карточке клиента сами, ничего физически не двигая.
      // Прежний перенос в client.sessions/consultations здесь удалён: теперь
      // он создавал бы ровно тот дубль, от которого Этап 2 избавляется.
      saveProject({ ...editProject, ...data });
    } else {
      const newProjectId = crypto.randomUUID();
      saveProject({ id: newProjectId, createdDate: new Date().toISOString(), lastMeaningfulActivityAt: new Date().toISOString(), sessions: [], consultations: [], ...data });
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

  // Сессия в конкретный проект (Мастерская, открытый проект, content-link) —
  // тот же commitSession, что и с карточки клиента: владельца определяет сам
  // проект, поэтому «сессия без клиента» больше не отдельный случай, а просто
  // сессия в проекте, у которого clientId === null.
  const handleAddProjectSession = (projectId: string, data: SessionFormData) => {
    const project = getProjectById(projects, projectId);
    if (!project) return;
    const owner = project.clientId ? clients.find((c) => c.id === project.clientId) ?? null : null;
    const sessionId = commitSession(data, owner, projectId);

    // Сессия создана из ContentLinkPickerSheet «Сохранить в…» — привязываем
    // её. !editSession отсекает обычное редактирование существующей сессии,
    // чтобы не переписывать уже сделанную привязку.
    if (!editSession && pendingContentLinkRef.current?.target === 'session') {
      linkContentEntryTo(pendingContentLinkRef.current.entryId, { type: 'session', sessionId });
      pendingContentLinkRef.current = null;
    }
  };

  // Консультация в конкретный проект — зеркало handleAddProjectSession выше.
  // Нет content-link привязки (content-link не поддерживает консультацию как
  // цель, только проект/сессию) и нет перехода этапа (этап двигают только
  // сессии, handleAddConsultation тоже его не трогает).
  const handleAddProjectConsultation = (projectId: string, data: ConsultationFormData) => {
    if (!getProjectById(projects, projectId)) return;
    const { projects: next } = upsertConsultationInProjects(
      projects,
      projectId,
      { ...data, projectId },
      editConsultation?.id ?? null,
      chainFromConsultation?.id ?? null,
    );
    saveProjects(next);
  };

  // Единственная точка сохранения для NewConsultationSheet — зеркало
  // saveSessionFromNewSessionSheet выше, без content-link-ветки (content-link
  // не поддерживает консультацию как цель, только проект/сессию, см.
  // lib/contentLink.ts).
  const saveConsultationFromNewConsultationSheet = (data: ConsultationFormData) => {
    if (consultationTargetProjectId) {
      handleAddProjectConsultation(consultationTargetProjectId, data);
      closeNewConsultation();
      return;
    }
    handleAddConsultation(data);
  };

  // Единственная точка сохранения для NewSessionSheet (кроме calendar-walk,
  // см. onAdd там же). Владельцев больше не три: после Этапа 2 сессия всегда
  // ложится в проект, а кому этот проект принадлежит, знает он сам — поэтому
  // и content-link цепочка для клиентской записи, и «Мастерская» без клиента
  // идут одним путём. Осталось единственное ветвление: выбран ли проект до
  // открытия формы (sessionTargetProjectId) или его выбирают/заводят в самой
  // форме с карточки клиента.
  const saveSessionFromNewSessionSheet = (data: SessionFormData) => {
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

  // Быстрая смена проекта записи без открытия полной формы редактирования
  // (Этап 3a) — из read-only просмотра (TimelineViewSheet). После Этапа 2 это
  // не правка поля projectId, а физический переезд записи в другой проект
  // (см. moveSessionToProject). clientId в подписи оставлен — им пользуется
  // вызывающая сторона, самой записи он больше не нужен: владельца знает
  // проект. «Без проекта» (projectId === null) больше не выбирается — запись
  // не может существовать вне проекта.
  const reassignEntryProject = (_clientId: string, kind: 'session' | 'consultation', entryId: string, projectId: string | null) => {
    if (!projectId) return;
    saveProjects(
      kind === 'session'
        ? moveSessionToProject(projects, entryId, projectId)
        : moveConsultationToProject(projects, entryId, projectId),
    );
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
    updateSession(sessionId, (s) => ({ ...s, photos }));
  };

  // Quick status flip for a planned session (or to revert a done one), without
  // opening the edit form.
  const toggleSessionDone = (sessionId: string) => {
    const session = clients.flatMap((c) => c.sessions).find((s) => s.id === sessionId)
      ?? projects.flatMap((p) => p.sessions).find((s) => s.id === sessionId);
    if (!session) return;
    const flipped = updateSessionInProjects(projects, sessionId, (s) => ({ ...s, done: !s.done }));
    // Отметили «выполнена» (было не выполнено) → двигаем проект в «В работе».
    // Тем же сохранением: отдельная запись этапа затёрла бы сам флаг (#248).
    saveProjects(session.done ? flipped : advanceStageIn(flipped, session.projectId, 'in_progress'));
  };

  // clientId-scoped variant of the toggle above — for the «Отменить» quick
  // action fired from the Задачи/Мастер screens' «Напоминания» section,
  // which acts on overdue entries across every client, not just whichever
  // one happens to be open (selectedClient may well be null there).
  // Overdue reminder's «Отменить» — this planned entry won't happen and
  // won't be rescheduled, distinct from done. Drops out of upcoming/overdue
  // everywhere; stays visible in the timeline tagged «Отменена».
  const markEntryCancelled = (_clientId: string, itemId: string, kind: 'session' | 'consultation') => {
    if (kind === 'session') {
      updateSession(itemId, (s) => ({ ...s, cancelled: true }));
    } else {
      updateConsultation(itemId, (cn) => ({
        ...cn,
        cancelled: true,
        history: [...cn.history, { id: crypto.randomUUID(), date: new Date().toISOString(), note: 'Отменена' }],
      }));
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
      setActiveTab('projects');
      setEditConsultation(consultation);
      setShowNewConsultationForm(true);
      return;
    }
    const session = client.sessions.find((s) => s.id === itemId);
    if (!session) return;
    setActiveTab('projects');
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

  // «Выполнено» на карточке заживления — контроль заживления для ЭТОЙ
  // сессии закрыт (session.healed), она перестаёт участвовать в
  // healingReminders() на всех дальнейших стадиях. Не имеет отношения к
  // тому, отправлено ли клиенту сообщение — это отдельная ручная кнопка
  // «Скопировать» рядом (см. RemindersSection/CopyMessageButton).
  const markSessionHealed = (_clientId: string, sessionId: string) => {
    updateSession(sessionId, (s) => ({ ...s, healed: true }));
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

  // Обычная форма «Новая сессия» с карточки клиента: владелец — открытый
  // клиент, проект выбирается в самой форме (или заводится автоматически).
  // Вся запись — в commitSession выше, общем для всех трёх точек создания.
  const handleAddSession = (data: SessionFormData) => {
    if (!selectedClient) return;
    commitSession(data, selectedClient, null);
    setShowNewSessionForm(false);
    setEditSession(null);
    setConvertingConsultation(null);
    setChainFromSession(null);
    setCalendarCreateDate(null);
    setCalendarEventKind(null);
    setPresetEntryProjectId(null);
  };

  const sheetOpen =
    showNewClientForm ||
    showNewSessionForm ||
    showEditClientForm ||
    showNewConsultationForm ||
    createChoiceContext !== null ||
    showProjectSessionPicker ||
    !!noteComposerContext ||
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
  // Возраст резервной копии — то же «состояние дневника», что и dbError выше.
  const backupState = backupStatus(lastBackupAt, remindersNow);
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
  const visibleOverdueProjectConsultations = filterVisibleReminders(
    overdueProjectConsultations(projects, remindersNow),
    overdueProjectConsultationReminderKey,
    reminderState,
    remindersNow,
  );
  const visibleSoonProjectConsultations = filterVisibleReminders(
    upcomingSoonProjectConsultations(projects, remindersNow),
    soonProjectConsultationReminderKey,
    reminderState,
    remindersNow,
  );
  // Проекты с просроченным «следующим шагом» (Этап 3b) — в те же напоминания.
  const visibleDueProjects = filterVisibleReminders(overdueProjects(projects, remindersNow), projectReminderKey, reminderState, remindersNow);
  // Активные проекты без значимого движения дольше порога (M4) — мягкое
  // напоминание «застыл», отдельное от visibleDueProjects (там — конкретный
  // просроченный next step, здесь — просто долгое отсутствие движения).
  const visibleStaleProjects = filterVisibleReminders(staleProjects(projects, clients, remindersNow), staleProjectReminderKey, reminderState, remindersNow);
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
          CloudsBackground/AviationBackground, which
          meant up to two full sets animating at once (List's, which is
          never unmounted, plus whichever other screen was open) — real GPU
          load and battery/heat cost on a phone for a purely decorative
          layer. A single fixed copy behind the sliding screens looks
          identical (the content was never screen-specific) at half the
          animation cost. */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 0, background: COLORS.bg }}>
        <StarfieldBackground />
        <CloudsBackground />
        <AviationBackground />
      </div>

      {/* Db-unavailable banner — lives at the shell root, above every
          screen's sliding panel, instead of inside the list screen's own
          panel. It used to only be reachable by navigating back to List, so
          hitting it mid content-generation (composerText/photos, the exact
          case memory pressure is most likely to close the connection under)
          left no visible way to hit «Повторить» without losing that screen. */}
      {dbError && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(env(safe-area-inset-top) + 12px)',
            left: 16,
            right: 16,
            padding: '10px 14px',
            borderRadius: 3,
            border: '1px solid rgba(138,48,64,0.5)',
            background: 'rgba(138,48,64,0.12)',
            display: 'flex',
            gap: 10,
            alignItems: 'flex-start',
            zIndex: 50,
          }}
        >
          <span style={{ flex: 1, fontSize: fs(15), color: '#C99', fontStyle: 'italic' }}>{dbError}</span>
          {/* «Повторить» чинит только потерю связи. При отказе записи
              переподключаться не к чему — там мастер повторяет само
              действие, и лишняя кнопка сбивала бы с толку. */}
          {!db && dbErrorKind !== null && storageFailureNeedsReconnect(dbErrorKind) && (
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
            onClick={clearStorageFailure}
            style={{ background: 'none', border: 'none', color: '#C99', cursor: 'pointer', flexShrink: 0 }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Копии давно не было. Намеренно НЕ карточка в «Напоминаниях»: те про
          работу с клиентами, а это про состояние самого дневника — как и
          плашка хранилища выше, и по той же причине видна на всех экранах.
          Прячется, пока открыта шторка, чтобы не спорить с формой, и пока
          показывается ошибка хранилища — там сообщение важнее.
          Закрывается на сессию: настойчивость здесь уместнее вежливости,
          но не до степени, когда её нечем убрать. */}
      {!dbError && !sheetOpen && !backupNoticeHidden && backupState.kind !== 'fresh' && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(env(safe-area-inset-top) + 12px)',
            left: 16,
            right: 16,
            padding: '10px 14px',
            borderRadius: 3,
            border: '1px solid rgba(var(--gold-rgb),0.45)',
            // Непрозрачная подложка, а не золотая плёнка: плашка ложится
            // поверх логотипа и бейджа календаря, и сквозь полупрозрачный фон
            // её собственный текст было не прочитать.
            background: COLORS.sheet,
            boxShadow: '0 10px 28px rgba(0,0,0,0.45)',
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            zIndex: 49,
          }}
        >
          <span style={{ flex: 1, fontSize: fs(14), color: COLORS.gold, fontStyle: 'italic' }}>
            {backupState.kind === 'never'
              ? 'Копии дневника ещё нет — данные есть только в этом телефоне'
              : `Копии нет ${backupState.days} дн. — данные есть только в этом телефоне`}
          </span>
          <button
            onClick={() => {
              setBackupNoticeHidden(true);
              setScreen('settings');
            }}
            style={{
              background: 'none',
              border: '1px solid rgba(var(--gold-rgb),0.5)',
              borderRadius: 2,
              padding: '2px 8px',
              color: COLORS.gold,
              fontSize: fs(13),
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            Сделать
          </button>
          <button
            onClick={() => setBackupNoticeHidden(true)}
            style={{ background: 'none', border: 'none', color: COLORS.gold, cursor: 'pointer', flexShrink: 0 }}
          >
            ✕
          </button>
        </div>
      )}

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
          moduleFlags={masterInfo.modules}
          adminBadges={[
            // Просроченная задача (task_overdue) — как urgent; задача на
            // сегодня (task_due) — как reminder, рядом с healing/soon/проекты.
            ...(visibleOverdue.length > 0 || visibleOverdueProjectSessions.length > 0 || visibleOverdueProjectConsultations.length > 0 || visibleTaskReminders.some((t) => t.rule === 'task_overdue')
              ? (['urgent'] as const)
              : []),
            ...(visibleHealing.length > 0 || visibleSoon.length > 0 || visibleSoonProjectSessions.length > 0 || visibleSoonProjectConsultations.length > 0 || visibleDueProjects.length > 0 || visibleTaskReminders.some((t) => t.rule === 'task_due')
              ? (['reminder'] as const)
              : []),
          ]}
          // Contextual create — открывает единую CreateChoiceSheet с нужным
          // контекстом; сам выбор внутри неё см. в её onPick ниже. Открытый
          // просмотр проекта (viewProject) переопределяет экранную логику —
          // «Создать» тут же предлагает сессию/консультацию/заметку именно
          // для этого проекта, а не то, что обычно делает текущий screen.
          onCreate={
            viewProject
              ? () => setCreateChoiceContext('viewProject')
              : screen === 'list' || screen === 'settings'
              ? () => runGated(clients.length === 0, () => setShowNewClientForm(true))
              : screen === 'summary'
                ? () => setShowSummaryComposer(true)
                : screen === 'admin'
                  ? () => setCreateChoiceContext('admin')
                  : screen === 'detail' && selectedClient
                    ? () => setCreateChoiceContext('detail')
                    // «Личный кабинет» и «Мастерская» создают одно и то же —
                    // client-less сущности, поэтому у них общий контекст
                    // выбора. Раньше (до единой CreateChoiceSheet) Личный
                    // кабинет умел заводить только проект мастера; теперь
                    // проект — просто одна из опций того же выбора.
                    : screen === 'master' || screen === 'workshop'
                      ? () => setCreateChoiceContext('workshop')
                      : undefined
          }
        />
      )}

      {/* Today's-date tag — pinned next to the logo (sibling of the screens,
          so it never scrolls away with the client grid underneath). Shown on
          every screen, no exceptions — the open project viewer (viewProject)
          doesn't count as a sheet (see sheetOpen above), so the badge stays
          visible over it too. Create-client moved to the nav FAB's
          contextual create action — see NavFab / onCreate below.
          Сортировка/Фильтры/Поиск, by contrast, live inside the List header
          itself and scroll away with it — see the header render below. */}
      {!sheetOpen && (
        <div style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top) + 31px)', right: 20, zIndex: 20 }}>
          <TodayDateBadge onOpen={() => setShowCalendar(true)} />
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
        {screen === 'summary' && masterInfo.modules.planner && (
          <Suspense fallback={null}>
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
              onAddMasterNote={(text, urgency, photos, dueDate, projectId) =>
                setMasterInfo({
                  ...masterInfo,
                  notes: [
                    ...masterInfo.notes,
                    { id: crypto.randomUUID(), text, urgency, done: false, createdDate: new Date().toISOString(), photos, projectId, dueDate },
                  ],
                })
              }
              onAddNote={(clientId, text, urgency, photos, dueDate, projectId) =>
                upsertNote(clientId, {
                  id: crypto.randomUUID(),
                  text,
                  urgency,
                  done: false,
                  createdDate: new Date().toISOString(),
                  photos,
                  projectId,
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
          </Suspense>
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
        {/* «Личный кабинет» не гасится флагом adminka, хоть и относится к
            этому модулю по реестру: это единственная дверь к «Настройкам»
            (там же живут тогглы самих модулей) — спрятав её, мастер
            лишилась бы способа снова включить admINKA. */}
        {screen === 'master' && (
          <Suspense fallback={null}>
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
              projects={projects}
              onOpenProject={(project) => setViewProject(project)}
              onCreateProject={() => {
                setEditProject(null);
                setNewProjectClientId(null);
                setShowNewProjectForm(true);
              }}
            />
          </Suspense>
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
        {screen === 'content' && masterInfo.modules.content && (
          <Suspense fallback={null}>
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
          </Suspense>
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
        {screen === 'admin' && masterInfo.modules.adminka && (
          <Suspense fallback={null}>
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
              overdueProjectConsultations={visibleOverdueProjectConsultations}
              soonProjectConsultations={visibleSoonProjectConsultations}
              dueProjects={visibleDueProjects}
              staleProjects={visibleStaleProjects}
              tasks={visibleTaskReminders}
              onOpenProject={(project) => setViewProject(project)}
              onOpenEntry={openEntryForEdit}
              onDismissReminder={handleDismissReminder}
              onSnoozeReminder={handleSnoozeReminder}
              onRestoreReminder={handleRestoreReminder}
              onCancelEntry={markEntryCancelled}
              onCompleteTask={completeTaskReminder}
              onOpenTask={openTaskReminder}
              onMarkHealed={markSessionHealed}
              onHideAllHealing={handleHideAllHealing}
              onOpenNotes={(urgency) => {
                setSummaryFilter(urgency);
                setScreen('summary');
              }}
            />
          </Suspense>
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
        {screen === 'workshop' && masterInfo.modules.workshop && (
          <Suspense fallback={null}>
            <WorkshopScreen
              projects={projects}
              projectsLoaded={projectsLoaded}
              clients={clients}
              onOpenProject={(project) => setViewProject(project)}
            />
          </Suspense>
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
          <Suspense fallback={null}>
            <SettingsScreen
              theme={theme}
              onToggleTheme={toggleTheme}
              minimalism={minimalism}
              onChangeMinimalism={setMinimalism}
              prefs={prefs}
              onChange={setPrefs}
              onBack={() => setScreen('master')}
              masterInfo={masterInfo}
              onChangeMasterInfo={setMasterInfo}
              installationId={installationId}
              onPrepareBackup={prepareFullBackup}
              persistence={persistence}
              storageEstimate={storageEstimate}
              lastBackupAt={lastBackupAt}
              onBackupDone={markBackupDone}
              errorLog={errorLog}
              onClearErrorLog={clearErrorLog}
              onImport={replaceAllData}
              onImportArchive={restoreFullBackup}
            />
          </Suspense>
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
          <Suspense fallback={null}>
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
              onChainSession={startChainNextSession}
              onEditConsultation={(consultation) => { setEditConsultation(consultation); setShowNewConsultationForm(true); }}
              onDeleteConsultation={deleteConsultation}
              onConvertConsultation={startConvertConsultationToSession}
              onChainConsultation={startChainNextConsultation}
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
              onAddNote={(text, urgency, photos, dueDate, projectId) =>
                upsertNote(selectedClient.id, {
                  id: crypto.randomUUID(),
                  text,
                  urgency,
                  done: false,
                  createdDate: new Date().toISOString(),
                  photos,
                  projectId,
                  dueDate,
                })
              }
              onDeleteNote={(noteId) => deleteNote(selectedClient.id, noteId)}
              contentEntries={contentEntries}
              onOpenContent={openContentWorkspace}
              onImportClients={importClients}
            />
          </Suspense>
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
          CreateChoiceSheet below — so submitting here just saves it. */}
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
        chainFrom={chainFromSession}
        onClose={closeNewSession}
        onAdd={saveSessionFromNewSessionSheet}
      />

      {/* ═══════════ CREATE CHOICE (карточка клиента / мастера, «Мастерская», открытый проект) ═══════════ */}
      <CreateChoiceSheet
        open={createChoiceContext !== null}
        onClose={() => setCreateChoiceContext(null)}
        options={
          createChoiceContext === 'viewProject'
            ? ['session', 'consultation', 'note']
            : createChoiceContext === 'admin'
              ? ['project', 'session', 'consultation']
              : ['project', 'session', 'consultation', 'note']
        }
        onPick={(kind) => {
          const context = createChoiceContext;
          setCreateChoiceContext(null);
          if (context === 'viewProject') {
            if (!viewProject) return;
            const project = viewProject;
            setViewProject(null);
            if (kind === 'session') {
              setEditSession(null);
              setSessionTargetProjectId(project.id);
              setShowNewSessionForm(true);
            } else if (kind === 'consultation') {
              setEditConsultation(null);
              setConsultationTargetProjectId(project.id);
              setShowNewConsultationForm(true);
            } else if (kind === 'note') {
              setNoteComposerContext({ clientId: project.clientId, projectId: project.id });
            }
            return;
          }
          if (context === 'detail') {
            if (!selectedClient) return;
            const client = selectedClient;
            runGated(false, () => {
              if (kind === 'project') {
                setEditProject(null);
                setNewProjectClientId(client.id);
                setShowNewProjectForm(true);
              } else if (kind === 'session') {
                setEditSession(null);
                setShowNewSessionForm(true);
              } else if (kind === 'consultation') {
                setEditConsultation(null);
                setShowNewConsultationForm(true);
              } else if (kind === 'note') {
                setNoteComposerContext({ clientId: client.id, projectId: null });
              }
            });
            return;
          }
          if (context === 'workshop') {
            if (kind === 'project') {
              setEditProject(null);
              setNewProjectClientId(null);
              setShowNewProjectForm(true);
            } else if (kind === 'session' || kind === 'consultation') {
              setProjectPickerKind(kind);
              setProjectPickerScope('clientless');
              setShowProjectSessionPicker(true);
            } else if (kind === 'note') {
              setNoteComposerContext({ clientId: null, projectId: null });
            }
            return;
          }
          if (context === 'admin') {
            if (kind === 'project') {
              setEditProject(null);
              setNewProjectClientId(null);
              setShowNewProjectForm(true);
            } else if (kind === 'session' || kind === 'consultation') {
              setProjectPickerKind(kind);
              setProjectPickerScope('all');
              setShowProjectSessionPicker(true);
            }
          }
        }}
      />
      <ProjectSessionPickerSheet
        open={showProjectSessionPicker}
        projects={projects}
        clients={projectPickerScope === 'all' ? clients : []}
        scope={projectPickerScope === 'all' ? 'all' : undefined}
        clientId={pendingContentLinkRef.current?.preferredClientId ?? null}
        onClose={() => {
          setShowProjectSessionPicker(false);
          pendingContentLinkRef.current = null;
        }}
        onPick={(project) => {
          setShowProjectSessionPicker(false);
          if (projectPickerKind === 'consultation') {
            setEditConsultation(null);
            setConsultationTargetProjectId(project.id);
            setShowNewConsultationForm(true);
          } else {
            setEditSession(null);
            setSessionTargetProjectId(project.id);
            setShowNewSessionForm(true);
          }
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
      <NoteComposerSheet
        open={!!noteComposerContext}
        onClose={() => setNoteComposerContext(null)}
        clients={clients}
        projects={projects}
        presetClientId={noteComposerContext?.clientId ?? null}
        presetProjectId={noteComposerContext?.projectId ?? null}
        onAdd={(text, urgency, photos, dueDate, clientId, projectId) => {
          if (clientId) {
            upsertNote(clientId, {
              id: crypto.randomUUID(),
              text,
              urgency,
              done: false,
              createdDate: new Date().toISOString(),
              photos,
              projectId,
              dueDate,
            });
          } else {
            setMasterInfo({
              ...masterInfo,
              notes: [
                ...masterInfo.notes,
                { id: crypto.randomUUID(), text, urgency, done: false, createdDate: new Date().toISOString(), photos, projectId, dueDate },
              ],
            });
          }
          setNoteComposerContext(null);
        }}
      />

      {/* ═══════════ NEW / EDIT CONSULTATION SHEET ═══════════ */}
      <NewConsultationSheet
        open={showNewConsultationForm}
        clientName={
          consultationTargetProjectId
            ? getProjectById(projects, consultationTargetProjectId)?.title || 'Проект'
            : selectedClient?.name || ''
        }
        client={consultationTargetProjectId ? null : selectedClient}
        clientProjects={
          consultationTargetProjectId
            ? projects.filter((p) => p.id === consultationTargetProjectId)
            : selectedClient
            ? getProjectsByClientId(projects, selectedClient.id)
            : []
        }
        presetProjectId={consultationTargetProjectId ?? presetEntryProjectId}
        initial={editConsultation}
        initialDate={calendarCreateDate ?? undefined}
        chainFrom={chainFromConsultation}
        onClose={closeNewConsultation}
        onAdd={saveConsultationFromNewConsultationSheet}
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
        onEditProjectConsultation={(projectId, consultation) => {
          setViewProject(null);
          setEditConsultation(consultation);
          setConsultationTargetProjectId(projectId);
          setShowNewConsultationForm(true);
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
        onSaveNextStep={(text, date, type) => {
          const current = viewProject ? getProjectById(projects, viewProject.id) : null;
          if (current) saveProject({ ...current, nextActionText: text, nextActionDate: date, nextActionType: type });
        }}
      />

      {/* ═══════════ TIMELINE VIEWER (read-only consultation / session) ═══════════ */}
      <TimelineViewSheet
        open={!!viewEntry && (!!viewedSession || !!viewedConsultation)}
        session={viewedSession}
        consultation={viewedConsultation}
        consultationNumber={viewedConsultation ? getConsultationNumber(viewClient?.consultations ?? [], viewedConsultation) : null}
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
        onChainNextConsultation={
          viewedConsultation
            ? () => {
                if (viewEntry) setSelectedId(viewEntry.clientId);
                startChainNextConsultation(viewedConsultation);
              }
            : undefined
        }
        onOpenNextConsultation={
          viewedConsultation?.nextConsultationId && viewEntry
            ? () => setViewEntry({ kind: 'consultation', clientId: viewEntry.clientId, id: viewedConsultation.nextConsultationId! })
            : undefined
        }
        onChainNextSession={
          viewedSession
            ? () => {
                if (viewEntry) setSelectedId(viewEntry.clientId);
                startChainNextSession(viewedSession);
              }
            : undefined
        }
        onOpenNextSession={
          viewedSession?.nextSessionId && viewEntry
            ? () => setViewEntry({ kind: 'session', clientId: viewEntry.clientId, id: viewedSession.nextSessionId! })
            : undefined
        }
        onSaveNextStep={(text, date, type) => {
          const projectId = (viewedConsultation ?? viewedSession)?.projectId ?? null;
          const current = projectId ? getProjectById(projects, projectId) : null;
          if (current) saveProject({ ...current, nextActionText: text, nextActionDate: date, nextActionType: type });
        }}
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
      <CreateChoiceSheet
        open={calendarWalkStep === 'kind'}
        onClose={cancelCalendarWalk}
        options={['session', 'consultation']}
        onPick={(kind) => {
          if (kind === 'session' || kind === 'consultation') {
            setCalendarEventKind(kind);
            setCalendarWalkStep('clientKind');
          }
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
          <Suspense fallback={null}>
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
          </Suspense>
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

// Read-only field display shared by several sheets (session/consultation
// viewers, content workspace) — a label plus pre-wrapped value, or nothing
// when the value is empty.
export function ViewField({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div>
      <div style={{ fontSize: fs(10), color: COLORS.textGhost, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 5 }}>{label}</div>
      <div dir="auto" style={{ fontSize: fs(15), color: 'var(--text-soft)', lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{value}</div>
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


// Единая шторка выбора создаваемой сущности вынесена в
// src/components/sheets/CreateChoiceSheet.tsx (см. импорт выше) — заменяет
// прежние отдельные AddChoiceSheet/WorkshopCreateChoiceSheet.
