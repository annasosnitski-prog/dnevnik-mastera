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
import { DROP_CAP_FONT } from '../InkaLogo';
import { StarDivider } from '../icons/StarIcons';
import { COLORS, fs, type Theme, type Prefs, DEFAULT_PREFS } from '../TattoDiary';

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
}: {
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
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
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
  const backup = backupStatus(lastBackupAt, new Date());
  const storageUsedText = formatMegabytes(storageEstimate?.usage);
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
    const result = await shareOrDownloadFile(preparedBackup.file, 'INKA — резервная копия', preparedBackup.filename);
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
    setExportState({
      kind: 'ok',
      text: `Копия сохранена: ${summary.counts.clients} клиент(ов), ${summary.counts.projects} проект(ов), ${summary.mediaCount} медиафайл(ов).`,
    });
  };

  const handleImportFile = async (file: File) => {
    setImportError(null);
    setImportSuccess(null);
    let isZip = false;
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
        isZip && error instanceof Error
          ? error.message
          : 'Не удалось прочитать файл — проверьте, что это резервная копия INKA.',
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
      setImportSuccess(
        `Импортировано ${result.summary.counts.clients} клиент(ов), ${result.summary.counts.projects} проект(ов) и ${result.summary.mediaCount} медиафайл(ов).`,
      );
      setPendingImport(null);
      setForeignImportAcknowledged(false);
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

        {/* Minimalism — independent of theme; keeps whichever theme is active,
            just strips the decorative gems/pendants/rays down to a plain
            functional layer (NavFab + client tabs). */}
        <div style={rowStyle}>
          <div style={labelStyle}>Минимализм</div>
          <div style={{ fontSize: fs(12), color: COLORS.textFaint, fontStyle: 'italic', marginBottom: 10 }}>
            Убрать камни, бабочек и декоративные эффекты
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {([
              { v: true, label: 'Включён' },
              { v: false, label: 'Выключен' },
            ] as { v: boolean; label: string }[]).map((o) => (
              <div
                key={String(o.v)}
                onClick={() => onChangeMinimalism(o.v)}
                style={{
                  flex: 1,
                  textAlign: 'center',
                  padding: '10px 0',
                  borderRadius: 2,
                  cursor: 'pointer',
                  fontSize: fs(13),
                  letterSpacing: '1px',
                  textTransform: 'uppercase',
                  border: minimalism === o.v ? '1px solid rgba(var(--gold-rgb),0.6)' : '1px solid rgba(var(--gold-rgb),0.15)',
                  background: minimalism === o.v ? 'rgba(var(--gold-rgb),0.08)' : 'transparent',
                  color: minimalism === o.v ? COLORS.gold : COLORS.textFaint,
                }}
              >
                {o.label}
              </div>
            ))}
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
          <input
            ref={fileInputRef}
            type="file"
            accept=".inka.zip,.zip,application/zip,.json,application/json"
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
