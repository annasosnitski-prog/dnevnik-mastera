import { useEffect, useRef, useState } from 'react';
import type { Client } from '../../domain/client';
import type { ContentEntry } from '../../domain/content';
import type { Project } from '../../domain/project';
import { normalizeClient, normalizeProject } from '../../lib/normalize';
import {
  masterInfoFromBackup,
  normalizeMasterInfo,
  isMasterInfoEmpty,
  type MasterInfo,
  type MasterInfoRestore,
} from '../../lib/masterInfoStore';
import { shareOrDownloadFile } from '../../lib/contentShare';
import {
  describeUnreadableBackupFile,
  rememberImportResult,
  takeImportResult,
} from '../../lib/backupImport';
import {
  BACKUP_ARCHIVE_MIME,
  inspectBackupArchive,
  type BackupArchiveProgress,
  type BackupArchiveSummary,
  type ImportBackupArchiveResult,
  type PreparedBackupArchive,
  type PrepareBackupArchiveOptions,
} from '../../lib/backupArchive';
import { compareBackupSource } from '../../lib/backupIdentity';
import { MODULE_REGISTRY } from '../../modules/registry';
import { copyTextToClipboard } from '../../lib/clipboard';
import { formatErrorLog, errorSourceLabel, type DiaryErrorEntry } from '../../lib/errorLog';
import {
  backupStatus,
  backupStatusText,
  persistenceText,
  formatMegabytes,
  type PersistenceState,
} from '../../lib/storageHealth';
import {
  breakdownLines,
  duplicateBytes,
  reclaimableBytes,
  totalPhotoBytes,
  type StorageBreakdown,
} from '../../lib/storageBreakdown';
import { DROP_CAP_FONT } from '../InkaLogo';
import { StarDivider } from '../icons/StarIcons';
import { TodayDateBadge } from '../ui/TodayDateBadge';
import { COLORS, fs, type Theme, type Prefs, DEFAULT_PREFS } from '../TattoDiary';
import type { SyncDriverState } from '../../sync/useSyncDriver';
import { syncActive, fetchBotBookings, DEFAULT_ENDPOINT, type CalendarSyncSettings } from '../../lib/calendarSync';
import { type ContentSyncSettings } from '../../lib/contentSync';

// Вынесено из TattoDiary.tsx (PR 9 рефакторинга). Логика и разметка не
// менялись — только перенос в отдельный модуль. Экран prop-driven; тема и
// preferences приходят сверху. SettingSlider использовался только здесь —
// перенесён вместе с экраном.
//
// Резервная копия и «Организация записей» переехали сюда из Админки —
// это разовое обслуживание, а не то, что должно мозолить глаза на
// главном экране управления практикой.

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

// Компактный вкл/выкл-тумблер для трёх бинарных переключателей (Тема,
// Минимализм, Игровой режим), поставленных в один ряд вместо трёх
// полноширинных карточек — они не требуют ни описания, ни текста
// подтверждения, только состояние.
function CompactToggle({
  label,
  sublabel,
  value,
  onChange,
}: {
  label: string;
  sublabel?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
      <div style={{ fontSize: fs(11), color: COLORS.textFaint, letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 9 }}>
        {label}
      </div>
      <div
        onClick={() => onChange(!value)}
        role="button"
        aria-pressed={value}
        aria-label={label}
        style={{
          margin: '0 auto',
          width: 44,
          height: 24,
          borderRadius: 12,
          border: '1px solid rgba(var(--gold-rgb),0.35)',
          background: value ? 'rgba(var(--gold-rgb),0.32)' : 'rgba(var(--gold-rgb),0.06)',
          position: 'relative',
          cursor: 'pointer',
          transition: 'background 0.2s ease',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 2,
            left: value ? 22 : 2,
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: value ? COLORS.gold : COLORS.textFaint,
            transition: 'left 0.2s ease',
          }}
        />
      </div>
      <div style={{ fontSize: fs(10.5), color: value ? COLORS.gold : COLORS.textGhost, fontStyle: 'italic', marginTop: 7 }}>
        {sublabel ?? (value ? 'Включён' : 'Выключен')}
      </div>
    </div>
  );
}

// Та же тумблер-механика, что у CompactToggle, но в один ряд с подписью
// слева — для секций «Автоматизация»/ContentINKA, где переключатель вкл/выкл
// сопровождает заголовок раздела, а не стоит отдельной подписанной колонкой.
function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      onClick={() => onChange(!value)}
      role="button"
      aria-pressed={value}
      aria-label={label}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, cursor: 'pointer' }}
    >
      <span style={{ fontSize: fs(12), color: COLORS.gold, letterSpacing: '0.3px' }}>{label}</span>
      <span
        style={{
          flexShrink: 0,
          width: 40,
          height: 22,
          borderRadius: 11,
          border: '1px solid rgba(var(--gold-rgb),0.35)',
          background: value ? 'rgba(var(--gold-rgb),0.32)' : 'rgba(var(--gold-rgb),0.06)',
          position: 'relative',
          transition: 'background 0.2s ease',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 1.5,
            left: value ? 20 : 2,
            width: 16,
            height: 16,
            borderRadius: '50%',
            background: value ? COLORS.gold : COLORS.textFaint,
            transition: 'left 0.2s ease',
          }}
        />
      </span>
    </div>
  );
}

// Единый компактный стиль для полей ввода секрета/адреса сервиса
// («Автоматизация», ContentINKA) — уже, ниже, без крупных отступов
// полноширинного INPUT_STYLE, который рассчитан на текстовые формы.
const CONNECTION_FIELD_STYLE: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '8px 10px',
  borderRadius: 2,
  border: '1px solid rgba(var(--gold-rgb),0.18)',
  background: 'rgba(var(--surface-rgb),0.03)',
  color: 'var(--text-secondary)',
  fontSize: fs(12),
  outline: 'none',
};

export interface SettingsScreenProps {
  theme: Theme;
  onToggleTheme: () => void;
  // Независим от темы (см. ui/minimalism.ts) — убирает декоративные камни/
  // подвески/лучи у NavFab и вкладок клиента поверх текущей тёмной/светлой темы.
  minimalism: boolean;
  onChangeMinimalism: (v: boolean) => void;
  prefs: Prefs;
  onChange: (p: Prefs) => void;
  onBack: () => void;
  // Текущий кабинет — ЗАПАСНОЙ вариант для копии. Основной источник тот же,
  // что у остальных данных: база (см. onPrepareBackup). Пригождается, если
  // записи в базе ещё нет — переезд карточки из localStorage мог не
  // случиться, — тогда в файл уедет то, что мастер видит на экране, а не
  // пустая карточка.
  masterInfo: MasterInfo;
  // Только для тоглов модулей (см. секцию «Модули» ниже) — остальные поля
  // карточки правятся из Личного кабинета, сюда не дублируются.
  onChangeMasterInfo: (m: MasterInfo) => void;
  // Stable per browser installation. Four masters can use the app without
  // their independent backup files looking interchangeable.
  installationId: string;
  // Собирает disk-backed ZIP прямо из IndexedDB, по одной записи за раз.
  // Большая копия не проходит ни через React state, ни через один общий
  // JSON.stringify — иначе 630 МБ базы превращались в несколько копий в RAM.
  onPrepareBackup: (options: PrepareBackupArchiveOptions) => Promise<PreparedBackupArchive>;
  // Состояние хранилища — см. lib/storageHealth.ts. Показывается честно, в
  // том числе когда браузер вообще не умеет отвечать на этот вопрос.
  persistence: PersistenceState;
  storageEstimate: { usage?: number; quota?: number } | null;
  // Разбор занятого места по смыслу (см. lib/storageBreakdown.ts). Считается
  // ТОЛЬКО по нажатию: это обход всей базы, и делать его на каждом открытии
  // Настроек значило бы платить за него постоянно ради цифры, которая нужна
  // раз в месяц. Возвращает null, если хранилище сейчас недоступно.
  onMeasureStorage: () => Promise<StorageBreakdown | null>;
  // Стирает легаси-массивы sessions/consultations во всех карточках клиентов
  // (см. lib/storageBreakdown.ts, раздел legacy) — только когда мастер сама
  // нажала «Освободить» под разбором места. null — сбой, тот же контракт,
  // что у onMeasureStorage; 0 — очищать было нечего.
  onClearLegacyRecords: () => Promise<number | null>;
  // Синк между устройствами (docs/SYNC_PLAN.md) — вся логика в
  // src/sync/useSyncDriver.ts, экран только показывает её и вызывает.
  sync: SyncDriverState;
  lastBackupAt: string | null;
  // Вызывается ТОЛЬКО когда копия реально уехала из телефона: отмена и сбой
  // копией не считаются, иначе напоминание замолчало бы, ничего не защитив.
  onBackupDone: () => void;
  // Журнал сбоев — см. lib/errorLog.ts. Нужен затем, что консоль браузера на
  // телефоне не открыть: без него любой сбой не оставлял следа вообще.
  errorLog: DiaryErrorEntry[];
  onClearErrorLog: () => void;
  // Импорт полного бэкапа: clients + опционально projects/contentEntries и
  // личный кабинет (целиком из новой копии либо одни задачи из старой,
  // см. masterInfoFromBackup).
  onImport: (bundle: { clients: Client[]; projects?: Project[]; contentEntries?: ContentEntry[]; master?: MasterInfoRestore }) => void;
  onImportArchive: (
    file: File,
    options: { signal?: AbortSignal; onProgress?: (progress: BackupArchiveProgress) => void },
  ) => Promise<ImportBackupArchiveResult>;
  // Собирает старые сессии/консультации (без projectId) в проекты-корзины
  // по клиенту. Возвращает сводку для показа результата.
  onOpenCalendar: () => void;
  // Бот в Telegram + синхронизация с Инка-календарём и ContentINKA —
  // переехали сюда из Личного кабинета (PR «перегруппировка настроек»):
  // это данные для подключения внешних сервисов, а не профиль мастера.
  calendarSync: CalendarSyncSettings;
  onChangeCalendarSync: (s: CalendarSyncSettings) => void;
  contentSync: ContentSyncSettings;
  onChangeContentSync: (s: ContentSyncSettings) => void;
  onOpenContent: () => void;
  // true — экран рендерится как вкладка «Настройки» в Личном кабинете (та
  // же ClientCardTabBar, что у Инфо/Проекты), не отдельный маршрут: без
  // собственной шапки/заголовка/«вернуться», просто список секций.
  embedded?: boolean;
}

export function SettingsScreen({
  theme,
  onToggleTheme,
  minimalism,
  onChangeMinimalism,
  prefs,
  onChange,
  onBack,
  masterInfo,
  onChangeMasterInfo,
  installationId,
  onPrepareBackup,
  persistence,
  storageEstimate,
  lastBackupAt,
  onBackupDone,
  errorLog,
  onClearErrorLog,
  onImport,
  onImportArchive,
  onOpenCalendar,
  onMeasureStorage,
  onClearLegacyRecords,
  sync,
  calendarSync,
  onChangeCalendarSync,
  contentSync,
  onChangeContentSync,
  onOpenContent,
  embedded,
}: SettingsScreenProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  // Успех восстановления пережил перезагрузку дневника — см. confirmImport.
  const [importSuccess, setImportSuccess] = useState<string | null>(takeImportResult);
  // Исход экспорта показывается всегда — «ничего не произошло» больше не
  // выглядит как успех.
  const [exportState, setExportState] = useState<
    | { kind: 'idle' }
    | { kind: 'preparing'; progress: BackupArchiveProgress | null }
    | { kind: 'sharing' }
    | { kind: 'ready'; text: string }
    | { kind: 'ok'; text: string }
    | { kind: 'error'; text: string }
  >({ kind: 'idle' });
  const [preparedBackup, setPreparedBackup] = useState<PreparedBackupArchive | null>(null);
  const preparedBackupRef = useRef<PreparedBackupArchive | null>(null);
  preparedBackupRef.current = preparedBackup;
  const exportAbortRef = useRef<AbortController | null>(null);
  // Parsed and normalized, waiting on the inline «Да/Нет» confirm below —
  // replaces window.confirm() so the prompt matches the app's own dialogs.
  // Опциональные поля отсутствуют в старых backup и тогда текущие данные
  // соответствующих хранилищ не меняются.
  const [pendingImport, setPendingImport] = useState<
    | {
        kind: 'legacy';
        clients: Client[];
        projects?: Project[];
        contentEntries?: ContentEntry[];
        master?: MasterInfoRestore;
      }
    | { kind: 'archive'; file: File; summary: BackupArchiveSummary }
    | null
  >(null);
  const [importProgress, setImportProgress] = useState<BackupArchiveProgress | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [foreignImportAcknowledged, setForeignImportAcknowledged] = useState(false);
  const importAbortRef = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      exportAbortRef.current?.abort();
      importAbortRef.current?.abort();
      void preparedBackupRef.current?.cleanup();
    },
    [],
  );

  const [logCopied, setLogCopied] = useState<string | null>(null);

  // Бот в Telegram + синхронизация (Инка-календарь, ContentINKA) — см.
  // комментарий у пропа calendarSync выше.
  const [editingTelegramBot, setEditingTelegramBot] = useState(false);
  const [telegramBotDraft, setTelegramBotDraft] = useState(masterInfo.telegramBotLink);
  useEffect(() => setTelegramBotDraft(masterInfo.telegramBotLink), [masterInfo.telegramBotLink]);
  const [copiedAutomationTag, setCopiedAutomationTag] = useState<'telegramBot' | null>(null);
  const copyAutomationToClipboard = (text: string, tag: 'telegramBot') => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopiedAutomationTag(tag);
      setTimeout(() => setCopiedAutomationTag((t) => (t === tag ? null : t)), 1400);
    }).catch(() => {});
  };
  const [showSyncSecret, setShowSyncSecret] = useState(false);
  const [showContentSecret, setShowContentSecret] = useState(false);
  // «Проверить соединение» — дёргает тот же bot-bookings, что виджет
  // «Брони от бота» в Админке, но здесь нужен только статус, а не список.
  const [syncCheck, setSyncCheck] = useState<{ status: 'idle' | 'checking' | 'ok' | 'error'; message?: string }>({
    status: 'idle',
  });
  const checkCalendarSync = () => {
    setSyncCheck({ status: 'checking' });
    fetchBotBookings(calendarSync)
      .then((b) => setSyncCheck({ status: 'ok', message: `подключено — записей от бота: ${b.length}.` }))
      .catch((err) =>
        setSyncCheck({ status: 'error', message: err instanceof Error ? err.message : 'не получилось проверить соединение.' })
      );
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

  const backup = backupStatus(lastBackupAt, new Date());
  const storageUsedText = formatMegabytes(storageEstimate?.usage);

  // Разбор занятого места. Три состояния вместо одного флага: пока не
  // считали — предложение посчитать; считаем — надпись (обход базы на
  // большой библиотеке занимает секунды); посчитали — таблица.
  const [breakdown, setBreakdown] = useState<StorageBreakdown | null>(null);
  const [measuring, setMeasuring] = useState(false);
  const [measureFailed, setMeasureFailed] = useState(false);
  const measureStorage = async () => {
    if (measuring) return;
    setMeasuring(true);
    setMeasureFailed(false);
    try {
      const result = await onMeasureStorage();
      if (result) setBreakdown(result);
      else setMeasureFailed(true);
    } catch {
      setMeasureFailed(true);
    } finally {
      setMeasuring(false);
    }
  };

  // Освободить легаси-копии — трёхшаговое подтверждение (кнопка → «Удалить»/
  // «Отмена» → результат), тем же приёмом, что и «Заменить» у импорта ниже:
  // удаление без возврата не должно случаться от одного случайного тапа.
  //
  // 'done' хранит freedBytes ИЗ ТЕКУЩЕГО breakdown, снятого ДО очистки: сам
  // акт удаления освобождает место в браузере не мгновенно и не выдаёт
  // точную цифру, а breakdown после переизмерения покажет уже 0 — сказать
  // мастеру, сколько было, можно только запомнив это заранее.
  // Синк между устройствами (docs/SYNC_PLAN.md) — само поле ввода кода
  // живёт на экране, вся логика привязки/синка — в sync (useSyncDriver).
  const [syncCode, setSyncCode] = useState('');
  const [syncCodeError, setSyncCodeError] = useState<string | null>(null);
  const [pairingBusy, setPairingBusy] = useState(false);
  const handlePair = async () => {
    if (sync.isCodeTooWeak(syncCode)) {
      setSyncCodeError('Слишком короткий код — придумайте подлиннее, как пароль от Wi-Fi.');
      return;
    }
    setPairingBusy(true);
    setSyncCodeError(null);
    const result = await sync.pairWithCode(syncCode);
    setPairingBusy(false);
    if (!result.ok) setSyncCodeError(result.message ?? 'Не удалось привязать устройство.');
    else setSyncCode('');
  };

  const [legacyClearState, setLegacyClearState] = useState<
    | { kind: 'idle' }
    | { kind: 'confirm' }
    | { kind: 'clearing' }
    | { kind: 'done'; freedBytes: number; clientsChanged: number }
    | { kind: 'error' }
  >({ kind: 'idle' });
  const handleClearLegacy = async () => {
    if (!breakdown) return;
    const freedBytes = breakdown.legacy.bytes;
    setLegacyClearState({ kind: 'clearing' });
    const changed = await onClearLegacyRecords();
    if (changed === null) {
      setLegacyClearState({ kind: 'error' });
      return;
    }
    setLegacyClearState({ kind: 'done', freedBytes, clientsChanged: changed });
    // Переизмеряем: раздел «Старые копии» в таблице ниже обязан пропасть
    // сам, а не висеть с прежней цифрой до следующего ручного нажатия.
    const result = await onMeasureStorage();
    if (result) setBreakdown(result);
  };
  const archiveSourceRelation =
    pendingImport?.kind === 'archive'
      ? compareBackupSource(pendingImport.summary.source, {
          installationId,
          ownerName: masterInfo.name,
        })
      : 'unknown';
  const isForeignOwner = archiveSourceRelation === 'different-owner';
  const needsSourceAcknowledgement =
    pendingImport?.kind === 'archive' && archiveSourceRelation !== 'same-installation';

  const handlePrepareExport = async () => {
    await preparedBackup?.cleanup();
    setPreparedBackup(null);
    setImportError(null);
    const controller = new AbortController();
    exportAbortRef.current = controller;
    setExportState({ kind: 'preparing', progress: null });
    try {
      const prepared = await onPrepareBackup({
        masterFallback: masterInfo,
        errorLog,
        source: { installationId, ownerName: masterInfo.name.trim() },
        signal: controller.signal,
        onProgress: (progress) => setExportState({ kind: 'preparing', progress }),
      });
      if (
        prepared.summary.counts.clients === 0 &&
        prepared.summary.counts.projects === 0 &&
        prepared.summary.counts.contentEntries === 0 &&
        isMasterInfoEmpty(normalizeMasterInfo(masterInfo))
      ) {
        await prepared.cleanup();
        setExportState({ kind: 'error', text: 'Копия не сделана: база вернулась пустой. Перезагрузите приложение и попробуйте снова.' });
        return;
      }
      setPreparedBackup(prepared);
      const size = formatMegabytes(prepared.file.size);
      setExportState({
        kind: 'ready',
        text: `Архив подготовлен${size ? ` · ${size}` : ''}. Теперь нажмите «Сохранить / поделиться».`,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setExportState({ kind: 'idle' });
      } else {
        setExportState({
          kind: 'error',
          text: error instanceof Error ? error.message : 'Копия не сделана: не удалось подготовить архив.',
        });
      }
    } finally {
      if (exportAbortRef.current === controller) exportAbortRef.current = null;
    }
  };

  // Отдельный тап после подготовки нужен Web Share API: Safari разрешает
  // открыть системное «Поделиться» только прямо из жеста пользователя.
  const handleSharePrepared = async () => {
    if (!preparedBackup) return;
    setExportState({ kind: 'sharing' });
    const result = await shareOrDownloadFile(preparedBackup.file, preparedBackup.filename, BACKUP_ARCHIVE_MIME);
    if (result === 'cancelled') {
      setExportState({ kind: 'ready', text: 'Окно «Поделиться» закрыли — архив всё ещё готов, можно повторить.' });
      return;
    }
    if (result === 'failed') {
      setExportState({ kind: 'ready', text: 'Не удалось отдать файл. Откройте дневник в обычной вкладке браузера и нажмите здесь ещё раз.' });
      return;
    }
    onBackupDone();
    const completedBackup = preparedBackup;
    const summary = completedBackup.summary;
    if (result === 'downloaded') {
      // A synthetic download starts after click() returns. Keep the OPFS file
      // alive until the browser has definitely consumed its blob URL.
      preparedBackupRef.current = null;
      setTimeout(() => void completedBackup.cleanup(), 120_000);
    } else {
      await completedBackup.cleanup();
    }
    setPreparedBackup(null);
    // Что система сделала с файлом дальше, страница узнать не может. Поэтому
    // успех называет имя и вес — по ним копию можно найти в «Файлах» и
    // отличить настоящий архив от того, что осталось от неудачной отдачи
    // (мастер получила «копию» в 38 байт и узнала об этом много позже).
    const saved = formatMegabytes(completedBackup.file.size);
    setExportState({
      kind: 'ok',
      text: `Копия сохранена: ${summary.counts.clients} клиент(ов), ${summary.counts.projects} проект(ов), ${summary.mediaCount} медиафайл(ов). Проверьте, что в «Файлах» лежит ${completedBackup.filename}${saved ? ` · ${saved}` : ''}.`,
    });
  };

  const handleImportFile = async (file: File) => {
    setImportError(null);
    setImportSuccess(null);
    let isZip = false;
    // Начало файла читается до всякого разбора и ради самого разбора не
    // нужно: по нему объясняется отказ, если файл окажется не копией.
    let head = '';
    try {
      head = new TextDecoder().decode(await file.slice(0, 512).arrayBuffer());
    } catch {
      // Не прочитали начало — объяснение будет общим, но отказ всё равно
      // покажется.
    }
    try {
      const signature = new Uint8Array(await file.slice(0, 4).arrayBuffer());
      isZip = signature[0] === 0x50 && signature[1] === 0x4b;
      if (isZip) {
        const summary = await inspectBackupArchive(file);
        setForeignImportAcknowledged(false);
        setPendingImport({ kind: 'archive', file, summary });
        return;
      }

      // JSON v1–v5 stays readable. Those old files were monolithic by
      // definition, so only this compatibility path still reads a whole file.
      const parsed = JSON.parse(await file.text());
      const rawClients = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.clients) ? parsed.clients : null;
      if (!rawClients) throw new Error('bad shape');
      setPendingImport({
        kind: 'legacy',
        clients: rawClients.map((c: any, i: number) => normalizeClient(c, i)),
        projects: Array.isArray(parsed?.projects) ? parsed.projects.map((p: any, i: number) => normalizeProject(p, i)) : undefined,
        contentEntries: Array.isArray(parsed?.contentEntries) ? (parsed.contentEntries as ContentEntry[]) : undefined,
        master: masterInfoFromBackup(parsed) ?? undefined,
      });
      setForeignImportAcknowledged(false);
    } catch (error) {
      setImportError(
        isZip && error instanceof Error ? error.message : describeUnreadableBackupFile(file, head),
      );
    }
  };

  const confirmImport = async () => {
    if (!pendingImport) return;
    if (pendingImport.kind === 'legacy') {
      const { kind: _kind, ...bundle } = pendingImport;
      onImport(bundle);
      setImportSuccess(`Импортировано ${pendingImport.clients.length} клиент(ов).`);
      setPendingImport(null);
      setForeignImportAcknowledged(false);
      return;
    }

    const controller = new AbortController();
    importAbortRef.current = controller;
    setImportBusy(true);
    setImportProgress(null);
    setImportError(null);
    try {
      const result = await onImportArchive(pendingImport.file, {
        signal: controller.signal,
        onProgress: setImportProgress,
      });
      setPendingImport(null);
      setForeignImportAcknowledged(false);
      // Данные уже в базе — дальше дневник перезапускается. Читать только что
      // восстановленную библиотеку обратно в ЭТУ страницу — самый тяжёлый шаг
      // всего восстановления: страница только что разобрала архив на сотни
      // мегабайт, и поверх этого в неё пятью getAll заливается вся библиотека
      // целиком. Это главный подозреваемый в белом экране, которым импорт
      // заканчивался на телефоне. После перезагрузки страница открывается
      // чистой и читает базу как при обычном запуске.
      const done = `Восстановлено: ${result.summary.counts.clients} клиент(ов), ${result.summary.counts.projects} проект(ов) и ${result.summary.mediaCount} медиафайл(ов).`;
      rememberImportResult(done);
      setImportSuccess(`${done} Перезапускаю дневник…`);
      setTimeout(() => window.location.reload(), 600);
      return;
    } catch (error) {
      const cancelled = error instanceof DOMException && error.name === 'AbortError';
      setImportError(
        cancelled
          ? 'Импорт остановлен. Уже проверенные записи не удалены; запустите этот же файл снова, чтобы завершить восстановление.'
          : error instanceof Error
            ? error.message
            : 'Не удалось восстановить резервную копию.',
      );
    } finally {
      if (importAbortRef.current === controller) importAbortRef.current = null;
      setImportBusy(false);
      setImportProgress(null);
    }
  };

  const progressText = (progress: BackupArchiveProgress | null, verb: string) => {
    if (!progress) return `${verb}…`;
    const percent = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 100;
    return `${verb}: ${percent}% · медиа ${progress.mediaCount}`;
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
      {/* embedded — Настройки живут третьей вкладкой в Личном кабинете (та
          же ClientCardTabBar, что у Инфо/Проекты): переключает вкладку сама
          гемма-подвеска, поэтому собственные заголовок/шапка/«вернуться»
          здесь лишние. */}
      {!embedded && (
        <>
          <div style={{ height: 'calc(env(safe-area-inset-top) + 18px)' }} />
          <div style={{ padding: '6px 24px 12px', position: 'relative', zIndex: 1 }}>
            {/* Absolute top-right corner, same spot on every screen (see
                AdminDashboardScreen). */}
            <div style={{ position: 'absolute', top: 6, right: 24, zIndex: 2 }}>
              <TodayDateBadge onOpen={onOpenCalendar} size={35} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
              <div className="inka-back" onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
                  <path d="M11 4L6 9L11 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ color: COLORS.gold }} />
                </svg>
                <span style={{ fontSize: fs(14), color: COLORS.gold, fontStyle: 'italic', letterSpacing: '0.3px' }}>вернуться</span>
              </div>
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
        </>
      )}

      <div style={{ padding: embedded ? '4px 0 8px' : '4px 20px calc(env(safe-area-inset-bottom, 0px) + 84px)', position: 'relative', zIndex: 1 }}>
        {/* Тема / Минимализм / Игровой режим — три независимых бинарных
            переключателя без сопроводительного текста, поэтому сведены в
            один компактный ряд вместо трёх полноширинных карточек. Стоит
            первым разделом, до модулей — самые частые настройки сверху. */}
        <div style={rowStyle}>
          <div style={{ display: 'flex', gap: 12 }}>
            <CompactToggle
              label="Тема"
              value={theme === 'light'}
              sublabel={theme === 'dark' ? 'Тёмная' : 'Светлая'}
              onChange={() => onToggleTheme()}
            />
            {/* Независим от темы (см. ui/minimalism.ts) — убирает декоративные
                камни/подвески/лучи у NavFab и вкладок клиента поверх текущей
                тёмной/светлой темы. */}
            <CompactToggle label="Минимализм" value={minimalism} onChange={onChangeMinimalism} />
            <CompactToggle
              label="Игровой режим"
              value={prefs.gameMode}
              onChange={(v) => onChange({ ...prefs, gameMode: v })}
            />
          </div>
        </div>

        {/* Modules — экраны поверх ядра (клиент → проект → сессии →
            консультации), которое всегда включено и в список не входит.
            Выключенный модуль исчезает из вкладок навигации, и его lazy-чанк
            вообще не грузится (см. modules/registry.ts). */}
        <div style={rowStyle}>
          <div style={labelStyle}>Модули</div>
          <div style={{ fontSize: fs(12), color: COLORS.textFaint, fontStyle: 'italic', marginBottom: 10 }}>
            Ядро — клиенты, проекты, сессии — отключить нельзя. Здесь можно скрыть то, что сейчас не нужно.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {MODULE_REGISTRY.map((m) => {
              const active = masterInfo.modules[m.key];
              return (
                <div
                  key={m.key}
                  onClick={() => onChangeMasterInfo({ ...masterInfo, modules: { ...masterInfo.modules, [m.key]: !active } })}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 13px',
                    borderRadius: 2,
                    cursor: 'pointer',
                    border: active ? '1px solid rgba(var(--gold-rgb),0.35)' : '1px solid rgba(var(--gold-rgb),0.1)',
                    background: active ? 'rgba(var(--gold-rgb),0.05)' : 'transparent',
                  }}
                >
                  <span style={{ fontSize: fs(13), color: active ? COLORS.textPrimary : COLORS.textFaint }}>
                    {m.icon} {m.label}
                  </span>
                  <span
                    style={{
                      fontSize: fs(11),
                      letterSpacing: '1px',
                      textTransform: 'uppercase',
                      color: active ? COLORS.gold : COLORS.textGhost,
                    }}
                  >
                    {active ? 'Включён' : 'Выключен'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Подключения — всё, что нужно для связи с внешними сервисами
            (бот в Telegram, синхронизация с Инка-календарём, ContentINKA):
            переехало сюда из Личного кабинета — это разовая настройка
            подключения, а не то, что мастер правит на каждом визите в
            профиль. Настоящий выключатель синхронизации — СЕКРЕТ: без
            него переключатель ничего не делает (бот ответит 401), поэтому
            другие пользователи приложения, не знающие секрета, писать в
            чужой календарь не могут. Секрет живёт только в localStorage
            этого устройства и НЕ попадает в резервную копию. */}
        <div style={{ ...rowStyle, position: 'relative' }}>
          <div style={labelStyle}>Автоматизация</div>

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
              style={{ ...CONNECTION_FIELD_STYLE, marginBottom: 10 }}
            />
          ) : (
            <div onClick={() => copyAutomationToClipboard(masterInfo.telegramBotLink, 'telegramBot')} role="button" aria-label="Скопировать ссылку на бота" style={{ cursor: 'pointer', marginBottom: 10 }}>
              <div style={{ fontSize: fs(13), color: COLORS.textPrimary, wordBreak: 'break-all' }}>{masterInfo.telegramBotLink}</div>
              <div style={{ fontSize: fs(10.5), color: COLORS.textGhost, marginTop: 4, fontStyle: 'italic' }}>Нажмите, чтобы скопировать</div>
            </div>
          )}
          {copiedAutomationTag === 'telegramBot' && <div style={copiedChipStyle}>Скопировано ✓</div>}

          <div style={{ height: 1, background: 'rgba(var(--gold-rgb),0.1)', margin: '2px 0 12px' }} />

          <div style={{ marginBottom: 10 }}>
            <ToggleRow
              label="Инка-календарь · Синхронизация"
              value={calendarSync.enabled}
              onChange={(v) => onChangeCalendarSync({ ...calendarSync, enabled: v })}
            />
          </div>
          <div style={{ position: 'relative', marginBottom: 6 }}>
            <input
              type={showSyncSecret ? 'text' : 'password'}
              value={calendarSync.secret}
              onChange={(e) => onChangeCalendarSync({ ...calendarSync, secret: e.target.value })}
              placeholder="Секретный код синхронизации"
              autoComplete="off"
              style={{ ...CONNECTION_FIELD_STYLE, paddingRight: 34 }}
            />
            <span
              onClick={() => setShowSyncSecret((v) => !v)}
              role="button"
              aria-label={showSyncSecret ? 'Скрыть код' : 'Показать код'}
              style={{
                position: 'absolute',
                top: '50%',
                right: 8,
                transform: 'translateY(-50%)',
                cursor: 'pointer',
                color: COLORS.textGhost,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {showSyncSecret ? (
                <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
                  <path d="M1.5 10S4.5 4 10 4s8.5 6 8.5 6-3 6-8.5 6-8.5-6-8.5-6Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                  <circle cx="10" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M3 3l14 14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
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
            style={CONNECTION_FIELD_STYLE}
          />
          <div style={{ marginTop: 6, fontSize: fs(11), color: COLORS.textGhost, fontStyle: 'italic', lineHeight: 1.5 }}>
            {syncActive(calendarSync)
              ? 'записи и консультации улетают в календарь Инки при сохранении.'
              : calendarSync.enabled
              ? 'нужен секретный код — без него синхронизация не работает.'
              : 'выключена: записи остаются только в дневнике.'}
          </div>
          {syncActive(calendarSync) && (
            <div style={{ marginTop: 8 }}>
              <span
                onClick={syncCheck.status === 'checking' ? undefined : checkCalendarSync}
                role="button"
                aria-label="Проверить соединение с ботом"
                style={{
                  fontSize: fs(11),
                  color: COLORS.gold,
                  letterSpacing: '1px',
                  textTransform: 'uppercase',
                  cursor: syncCheck.status === 'checking' ? 'default' : 'pointer',
                  opacity: syncCheck.status === 'checking' ? 0.5 : 1,
                }}
              >
                {syncCheck.status === 'checking' ? 'проверяю…' : 'проверить соединение'}
              </span>
              {syncCheck.message && (
                <div
                  style={{
                    marginTop: 6,
                    fontSize: fs(11),
                    fontStyle: 'italic',
                    color: syncCheck.status === 'error' ? '#C99' : COLORS.textGhost,
                  }}
                >
                  {syncCheck.message}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ContentINKA — тот же принцип, что «Инка-календарь» выше, свой
            секрет и свой адрес сервиса (не тот же деплой, что у бота). */}
        <div style={rowStyle}>
          <div style={{ marginBottom: 10 }}>
            <ToggleRow
              label="ContentINKA · Отбор и текст"
              value={contentSync.enabled}
              onChange={(v) => onChangeContentSync({ ...contentSync, enabled: v })}
            />
          </div>
          <div style={{ position: 'relative', marginBottom: 6 }}>
            <input
              type={showContentSecret ? 'text' : 'password'}
              value={contentSync.secret}
              onChange={(e) => onChangeContentSync({ ...contentSync, secret: e.target.value })}
              placeholder="Секретный код ContentINKA"
              autoComplete="off"
              style={{ ...CONNECTION_FIELD_STYLE, paddingRight: 34 }}
            />
            <span
              onClick={() => setShowContentSecret((v) => !v)}
              role="button"
              aria-label={showContentSecret ? 'Скрыть код' : 'Показать код'}
              style={{
                position: 'absolute',
                top: '50%',
                right: 8,
                transform: 'translateY(-50%)',
                cursor: 'pointer',
                color: COLORS.textGhost,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {showContentSecret ? (
                <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
                  <path d="M1.5 10S4.5 4 10 4s8.5 6 8.5 6-3 6-8.5 6-8.5-6-8.5-6Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                  <circle cx="10" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M3 3l14 14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
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
            style={CONNECTION_FIELD_STYLE}
          />
          <div style={{ marginTop: 6, fontSize: fs(11), color: COLORS.textGhost, fontStyle: 'italic', lineHeight: 1.5 }}>
            {contentSync.enabled && contentSync.secret && contentSync.endpoint
              ? '«Отправить в контент» доступна в карточке сессии/консультации.'
              : 'нужны адрес сервиса и секретный код — без них кнопка «Отправить в контент» не сработает.'}
          </div>
          <div
            onClick={onOpenContent}
            role="button"
            aria-label="Открыть ContentINKA"
            style={{
              marginTop: 10,
              fontSize: fs(12),
              color: COLORS.gold,
              textAlign: 'center',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            Открыть ContentINKA · контент мастерской
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

        {/* Журнал сбоев. Показывается, только когда есть что показывать —
            пустой раздел на экране настроек лишь пугал бы. */}
        {errorLog.length > 0 && (
          <div style={rowStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={labelStyle}>Последние сбои · {errorLog.length}</div>
              <span onClick={onClearErrorLog} role="button" style={{ fontSize: fs(12), color: COLORS.textFaint, cursor: 'pointer' }}>
                Очистить
              </span>
            </div>
            <div style={{ fontSize: fs(12), color: 'var(--text-soft)', fontStyle: 'italic', lineHeight: 1.5, marginBottom: 10 }}>
              Это записи для разбора: они уезжают в резервную копию, так что файл можно просто переслать.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
              {errorLog.slice(0, 5).map((e, i) => (
                <div key={`${e.at}-${i}`} style={{ fontSize: fs(11), color: COLORS.textFaint, lineHeight: 1.45 }}>
                  <span style={{ color: COLORS.textGhost }}>
                    {new Date(e.at).toLocaleString('ru-RU')} · {errorSourceLabel(e.source)}
                    {e.action ? ` · ${e.action}` : ''}
                  </span>
                  <br />
                  {e.message}
                </div>
              ))}
            </div>
            <div
              onClick={async () => {
                const ok = await copyTextToClipboard(formatErrorLog(errorLog));
                setLogCopied(ok ? 'Журнал скопирован' : 'Не удалось скопировать');
                setTimeout(() => setLogCopied(null), 2400);
              }}
              style={actionButtonStyle}
            >
              Скопировать журнал
            </div>
            {logCopied && (
              <div style={{ marginTop: 8, fontSize: fs(12), color: COLORS.gold, fontStyle: 'italic' }}>{logCopied}</div>
            )}
          </div>
        )}

        {/* Сохранность — состояние самого хранилища. Стоит ПЕРЕД резервной
            копией, потому что отвечает на первый вопрос: могут ли данные
            исчезнуть сами. Копия — ответ на второй: что будет, если исчезнет
            телефон. */}
        <div style={rowStyle}>
          <div style={labelStyle}>Сохранность данных</div>
          <div style={{ fontSize: fs(12), color: 'var(--text-soft)', fontStyle: 'italic', lineHeight: 1.5 }}>
            {persistenceText(persistence)}
            {storageUsedText && ` · занято ${storageUsedText}`}
          </div>
          {persistence === 'not-persisted' && (
            <div style={{ marginTop: 8, fontSize: fs(12), color: 'var(--urgent)', fontStyle: 'italic', lineHeight: 1.5 }}>
              Держите копию вне телефона — это единственная защита, если браузер всё-таки почистит данные.
            </div>
          )}

          {/* «Занято N МБ» не отвечает на главный вопрос: что удалить, чтобы
              дневник перестал спотыкаться. Фото лежат внутри записей, и у
              одного снимка бывает до трёх копий в разных местах — на глаз
              этого не видно. Здесь они разложены по смыслу, и отдельно
              показано, сколько можно освободить, ничего не потеряв.

              Считается по нажатию: это обход всей базы. */}
          {breakdown === null ? (
            <div style={{ marginTop: 12 }}>
              <div
                onClick={measureStorage}
                role="button"
                style={{
                  ...actionButtonStyle,
                  padding: '8px 0',
                  fontSize: fs(12),
                  opacity: measuring ? 0.6 : 1,
                  cursor: measuring ? 'default' : 'pointer',
                }}
              >
                {measuring ? 'Считаем…' : 'Куда ушло место'}
              </div>
              {measureFailed && (
                <div style={{ marginTop: 8, fontSize: fs(12), color: 'var(--urgent)', fontStyle: 'italic' }}>
                  Не удалось посчитать — хранилище сейчас недоступно. Попробуйте ещё раз.
                </div>
              )}
            </div>
          ) : (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: fs(12), color: COLORS.textFaint, fontStyle: 'italic', marginBottom: 8 }}>
                Фото занимают {formatMegabytes(totalPhotoBytes(breakdown)) ?? 'меньше 0,1 МБ'} — примерно, по весу
                самих снимков.
              </div>
              {/* Разделы ниже складывают КОПИИ: один снимок, попавший в
                  черновик и в задачу, весит в них трижды. Строка про
                  уникальные показывает, сколько дневник весит на самом
                  деле — это и есть цифра, с которой он поедет в облако. */}
              {duplicateBytes(breakdown) > 0 && (
                <div style={{ fontSize: fs(12), color: COLORS.textFaint, fontStyle: 'italic', marginBottom: 8 }}>
                  Разных снимков — {breakdown.unique.count} на{' '}
                  {formatMegabytes(breakdown.unique.bytes) ?? 'меньше 0,1 МБ'}; остальное копии одного и того же
                  ({formatMegabytes(duplicateBytes(breakdown)) ?? 'меньше 0,1 МБ'}).
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Пустые разделы не показываем: у мастера, начавшей дневник
                    после переезда записей, легаси-копий нет вовсе, и строка
                    «0 МБ» только пугала бы разговором о потерянном месте. */}
                {breakdownLines(breakdown)
                  .filter((line) => line.bucket.count > 0)
                  .map((line) => (
                    <div key={line.label}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: fs(13) }}>
                        <span style={{ color: COLORS.textSecondary }}>{line.label}</span>
                        <span style={{ color: COLORS.gold, flexShrink: 0 }}>
                          {formatMegabytes(line.bucket.bytes) ?? '—'} · {line.bucket.count} фото
                        </span>
                      </div>
                      {line.hint && (
                        <div style={{ fontSize: fs(11), color: COLORS.textFaint, fontStyle: 'italic', lineHeight: 1.45, marginTop: 2 }}>
                          {line.hint}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
              {/* Успех показываем ОТДЕЛЬНО от «можно освободить»: после
                  очистки breakdown переизмеряется, раздел legacy пропадает
                  из таблицы выше и reclaimableBytes падает до нуля — если бы
                  сообщение об успехе висело в том же условии, оно исчезло бы
                  вместе с ним, не успев показаться. */}
              {legacyClearState.kind === 'done' && (
                <div style={{ marginTop: 10, fontSize: fs(12), color: COLORS.gold, fontStyle: 'italic', lineHeight: 1.5 }}>
                  Освобождено {formatMegabytes(legacyClearState.freedBytes)} — очищено {legacyClearState.clientsChanged}{' '}
                  карточ{legacyClearState.clientsChanged === 1 ? 'ка' : 'ек'} клиентов.
                </div>
              )}
              {reclaimableBytes(breakdown) > 0 && legacyClearState.kind !== 'done' && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: fs(12), color: COLORS.gold, fontStyle: 'italic', lineHeight: 1.5 }}>
                    Можно освободить {formatMegabytes(reclaimableBytes(breakdown))}, ничего не потеряв — это старые
                    копии после переноса записей на проекты.
                  </div>
                  {legacyClearState.kind === 'confirm' ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                      <span style={{ fontSize: fs(12), color: 'var(--urgent)', fontStyle: 'italic', flex: 1, minWidth: 160 }}>
                        Удалить без возврата? Дневник их не читает — терять нечего.
                      </span>
                      <span
                        onClick={handleClearLegacy}
                        style={{ fontSize: fs(12), color: 'var(--urgent)', textTransform: 'uppercase', letterSpacing: '0.5px', cursor: 'pointer' }}
                      >
                        Удалить
                      </span>
                      <span
                        onClick={() => setLegacyClearState({ kind: 'idle' })}
                        style={{ fontSize: fs(12), color: COLORS.textFaint, textTransform: 'uppercase', letterSpacing: '0.5px', cursor: 'pointer' }}
                      >
                        Отмена
                      </span>
                    </div>
                  ) : (
                    <div
                      onClick={legacyClearState.kind === 'clearing' ? undefined : () => setLegacyClearState({ kind: 'confirm' })}
                      role="button"
                      style={{
                        ...actionButtonStyle,
                        marginTop: 8,
                        padding: '8px 0',
                        fontSize: fs(12),
                        opacity: legacyClearState.kind === 'clearing' ? 0.6 : 1,
                        cursor: legacyClearState.kind === 'clearing' ? 'default' : 'pointer',
                      }}
                    >
                      {legacyClearState.kind === 'clearing' ? 'Удаляем…' : 'Освободить'}
                    </div>
                  )}
                  {legacyClearState.kind === 'error' && (
                    <div style={{ marginTop: 8, fontSize: fs(12), color: 'var(--urgent)', fontStyle: 'italic' }}>
                      Не удалось очистить — хранилище сейчас недоступно. Попробуйте ещё раз.
                    </div>
                  )}
                </div>
              )}
              {breakdown.records === 0 && (
                <div style={{ fontSize: fs(12), color: COLORS.textFaint, fontStyle: 'italic' }}>
                  В дневнике пока нет записей.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Backup v6 is a disk-backed ZIP. Preparing and handing it off are
            separate taps because mobile share sheets require user activation. */}
        <div style={rowStyle}>
          <div style={labelStyle}>Резервная копия</div>
          {/* Возраст копии — прямо над кнопкой. Пока копии нет или она
              старая, это самая важная строчка на экране. */}
          <div
            style={{
              fontSize: fs(12),
              fontStyle: 'italic',
              lineHeight: 1.5,
              marginBottom: 10,
              color: backup.kind === 'fresh' ? 'var(--text-soft)' : 'var(--urgent)',
            }}
          >
            {backupStatusText(backup)}
            {backup.kind !== 'fresh' && ' — данные есть только в этом телефоне'}
          </div>
          {pendingImport ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: fs(12), color: 'var(--urgent)', fontStyle: 'italic', flex: 1, minWidth: 160 }}>
                {pendingImport.kind === 'archive' && pendingImport.summary.source.ownerName && (
                  <>Копия дневника «{pendingImport.summary.source.ownerName}». </>
                )}
                {archiveSourceRelation === 'same-owner' && <>Она создана на другом устройстве этого владельца. </>}
                {archiveSourceRelation === 'other-installation' && <>Копия создана в другой установке приложения. </>}
                {archiveSourceRelation === 'unknown' && pendingImport.kind === 'archive' && (
                  <>В этой копии нет сведений о владельце или устройстве. </>
                )}
                {isForeignOwner && (
                  <>
                    Сейчас открыт дневник «{masterInfo.name.trim() || 'без имени'}» — это данные другого человека.{' '}
                  </>
                )}
                Импортировать{' '}
                {pendingImport.kind === 'archive' ? pendingImport.summary.counts.clients : pendingImport.clients.length} клиент(ов)? Текущие данные будут заменены
                {(pendingImport.kind === 'archive' || pendingImport.master?.kind === 'full') && ', включая личный кабинет'}.
              </span>
              {importBusy ? (
                <span
                  onClick={() => importAbortRef.current?.abort()}
                  style={{ fontSize: fs(12), color: 'var(--urgent)', textTransform: 'uppercase', letterSpacing: '0.5px', cursor: 'pointer' }}
                >
                  Остановить
                </span>
              ) : (
                <>
                  <span
                    onClick={needsSourceAcknowledgement && !foreignImportAcknowledged ? () => setForeignImportAcknowledged(true) : confirmImport}
                    style={{ fontSize: fs(12), color: 'var(--urgent)', textTransform: 'uppercase', letterSpacing: '0.5px', cursor: 'pointer' }}
                  >
                    {needsSourceAcknowledgement && !foreignImportAcknowledged ? 'Это нужная копия' : 'Заменить'}
                  </span>
                  <span
                    onClick={() => {
                      setPendingImport(null);
                      setForeignImportAcknowledged(false);
                    }}
                    style={{ fontSize: fs(12), color: COLORS.textFaint, textTransform: 'uppercase', letterSpacing: '0.5px', cursor: 'pointer' }}
                  >
                    Отмена
                  </span>
                </>
              )}
            </div>
          ) : exportState.kind === 'preparing' ? (
            <div
              onClick={() => exportAbortRef.current?.abort()}
              style={{ ...actionButtonStyle, color: 'var(--urgent)' }}
            >
              Остановить
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              {preparedBackup ? (
                <>
                  <div
                    onClick={exportState.kind === 'sharing' ? undefined : handleSharePrepared}
                    style={{ ...actionButtonStyle, opacity: exportState.kind === 'sharing' ? 0.5 : 1 }}
                  >
                    {exportState.kind === 'sharing' ? 'Открываем…' : 'Сохранить / поделиться'}
                  </div>
                  <div
                    onClick={async () => {
                      await preparedBackup.cleanup();
                      setPreparedBackup(null);
                      setExportState({ kind: 'idle' });
                    }}
                    style={{ ...actionButtonStyle, flex: 0.55, color: COLORS.textFaint }}
                  >
                    Убрать
                  </div>
                </>
              ) : (
                <>
                  <div onClick={handlePrepareExport} style={actionButtonStyle}>
                    Подготовить копию
                  </div>
                  <div onClick={() => fileInputRef.current?.click()} style={actionButtonStyle}>
                    Импортировать
                  </div>
                </>
              )}
            </div>
          )}
          {exportState.kind === 'preparing' && (
            <div style={{ marginTop: 10, fontSize: fs(12), color: COLORS.gold, fontStyle: 'italic' }}>
              {progressText(exportState.progress, 'Готовим архив')}
            </div>
          )}
          {importBusy && (
            <div style={{ marginTop: 10, fontSize: fs(12), color: COLORS.gold, fontStyle: 'italic' }}>
              {progressText(importProgress, 'Восстанавливаем')}
            </div>
          )}
          {(exportState.kind === 'ready' || exportState.kind === 'ok' || exportState.kind === 'error') && (
            <div
              style={{
                marginTop: 10,
                fontSize: fs(12),
                fontStyle: 'italic',
                color: exportState.kind === 'error' ? 'var(--urgent)' : COLORS.gold,
              }}
            >
              {exportState.text}
            </div>
          )}
          {/* Без accept — намеренно. Телефон гасит в списке файлов всё, что
              не подошло под фильтр, а копия попадает туда через «Поделиться»
              и приезжает с каким угодно типом (или вовсе без него) — тогда
              недоступным для выбора оказывается сам архив, и импортировать
              просто нечего. Что это за файл, решает не расширение, а
              сигнатура PK внутри — см. handleImportFile. */}
          <input
            ref={fileInputRef}
            type="file"
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
        </div>

        {/* Синк между устройствами (docs/SYNC_PLAN.md) */}
        <div style={rowStyle}>
          <div style={labelStyle}>Синк между устройствами</div>
          {sync.phase === 'checking' && (
            <div style={{ fontSize: fs(12), color: COLORS.textFaint, fontStyle: 'italic' }}>Проверяем…</div>
          )}
          {sync.phase === 'unpaired' && (
            <>
              <div style={{ fontSize: fs(12), lineHeight: 1.5, marginBottom: 10, color: 'var(--text-soft)', fontStyle: 'italic' }}>
                Введите один и тот же код на всех устройствах — данные начнут появляться друг у друга примерно раз в
                час.
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input
                  value={syncCode}
                  onChange={(e) => {
                    setSyncCode(e.target.value);
                    setSyncCodeError(null);
                  }}
                  placeholder="Придумайте код, как пароль от Wi-Fi"
                  style={{
                    flex: 1,
                    minWidth: 180,
                    background: 'rgba(var(--surface-rgb),0.03)',
                    border: '1px solid rgba(var(--gold-rgb),0.18)',
                    borderRadius: 2,
                    padding: '10px 14px',
                    fontFamily: "'Inter', sans-serif",
                    color: COLORS.textPrimary,
                    outline: 'none',
                  }}
                />
                <div
                  onClick={pairingBusy ? undefined : handlePair}
                  style={{ ...actionButtonStyle, flex: '0 0 auto', opacity: pairingBusy ? 0.6 : 1 }}
                >
                  {pairingBusy ? 'Привязываем…' : 'Привязать'}
                </div>
              </div>
              {syncCodeError && (
                <div style={{ marginTop: 8, fontSize: fs(12), color: 'var(--urgent)', fontStyle: 'italic' }}>{syncCodeError}</div>
              )}
            </>
          )}
          {(sync.phase === 'paired' || sync.phase === 'syncing') && (
            <>
              <div style={{ fontSize: fs(12), lineHeight: 1.5, marginBottom: 10, color: 'var(--text-soft)', fontStyle: 'italic' }}>
                {sync.phase === 'syncing'
                  ? 'Синхронизируем…'
                  : sync.lastSyncAt
                    ? `Последняя синхронизация: ${new Date(sync.lastSyncAt).toLocaleString('ru-RU')}`
                    : 'Устройство привязано, первая синхронизация вот-вот пройдёт.'}
              </div>
              {/* Фото едут отдельно от записей и приходят не мгновенно —
                  сказать об этом здесь дешевле, чем оставить мастера гадать,
                  почему на втором устройстве проект уже есть, а снимки ещё
                  подтягиваются. */}
              <div style={{ fontSize: fs(11), lineHeight: 1.5, marginBottom: 10, color: COLORS.textFaint, fontStyle: 'italic' }}>
                Фото передаются отдельными файлами, поэтому на новом устройстве появляются чуть позже записей.
                Одинаковые снимки в облаке не дублируются.
              </div>
              {sync.lastError && (
                <div style={{ marginBottom: 10, fontSize: fs(12), color: 'var(--urgent)', fontStyle: 'italic' }}>{sync.lastError}</div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <div
                  onClick={sync.phase === 'syncing' ? undefined : () => void sync.syncNow()}
                  style={{ ...actionButtonStyle, opacity: sync.phase === 'syncing' ? 0.6 : 1 }}
                >
                  {sync.phase === 'syncing' ? 'Синхронизируем…' : 'Синхронизировать сейчас'}
                </div>
                <div
                  onClick={() => void sync.unpair()}
                  style={{ ...actionButtonStyle, flex: '0 0 auto', color: 'var(--urgent)', borderColor: 'var(--urgent)' }}
                >
                  Отвязать
                </div>
              </div>
            </>
          )}
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
