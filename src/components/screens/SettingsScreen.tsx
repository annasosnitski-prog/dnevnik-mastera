import { useRef, useState } from 'react';
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
import { shareOrDownloadJSON } from '../../lib/contentShare';
import { buildBackupBlobParts } from '../../lib/backupSerialize';
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
  onReadBackupData,
  persistence,
  storageEstimate,
  lastBackupAt,
  onBackupDone,
  errorLog,
  onClearErrorLog,
  onImport,
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
  // что у остальных данных: база (см. onReadBackupData). Пригождается, если
  // записи в базе ещё нет — переезд карточки из localStorage мог не
  // случиться, — тогда в файл уедет то, что мастер видит на экране, а не
  // пустая карточка.
  masterInfo: MasterInfo;
  // Читает данные для копии прямо из IndexedDB. Отдельно от props выше именно
  // потому, что копия обязана отражать хранилище, а не экран: props могут быть
  // пустыми из-за сбоя загрузки, и тогда экспорт обязан отказать, а не отдать
  // пустой файл.
  onReadBackupData: () => Promise<{ clients: unknown[]; projects: unknown[]; contentEntries: unknown[]; masterInfo: unknown }>;
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
  // Собирает старые сессии/консультации (без projectId) в проекты-корзины
  // по клиенту. Возвращает сводку для показа результата.
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  // Исход экспорта показывается всегда — «ничего не произошло» больше не
  // выглядит как успех.
  const [exportState, setExportState] = useState<{ kind: 'idle' } | { kind: 'busy' } | { kind: 'ok'; text: string } | { kind: 'error'; text: string }>({ kind: 'idle' });
  // Parsed and normalized, waiting on the inline «Да/Нет» confirm below —
  // replaces window.confirm() so the prompt matches the app's own dialogs.
  // Опциональные поля отсутствуют в старых backup и тогда текущие данные
  // соответствующих хранилищ не меняются.
  const [pendingImport, setPendingImport] = useState<{
    clients: Client[];
    projects?: Project[];
    contentEntries?: ContentEntry[];
    master?: MasterInfoRestore;
  } | null>(null);

  const [logCopied, setLogCopied] = useState<string | null>(null);
  const backup = backupStatus(lastBackupAt, new Date());
  const storageUsedText = formatMegabytes(storageEstimate?.usage);

  // Резервная копия — единственное, что стоит между мастером и потерей всей
  // истории работы, поэтому здесь нет ни одного тихого исхода: либо файл
  // отдан, либо на экране написано, что именно не получилось.
  const handleExport = async () => {
    setExportState({ kind: 'busy' });
    let data: { clients: unknown[]; projects: unknown[]; contentEntries: unknown[]; masterInfo: unknown };
    try {
      // Читаем ИЗ БАЗЫ, а не из этого экрана: если хранилище отвалилось,
      // состояние осталось бы пустым и в файл уехал бы пустой, но с виду
      // нормальный бэкап (см. onReadBackupData в TattoDiary.tsx).
      data = await onReadBackupData();
    } catch {
      setExportState({ kind: 'error', text: 'Копия не сделана: хранилище сейчас недоступно. Нажмите «Повторить» на плашке вверху и попробуйте снова.' });
      return;
    }
    // Карточка из базы; если записи там ещё нет (переезд из localStorage не
    // случился), в копию идёт текущая — иначе копия окажется без кабинета
    // ровно у тех, у кого он ещё не переехал.
    const masterCard = data.masterInfo ?? masterInfo;
    if (data.clients.length === 0 && data.projects.length === 0 && isMasterInfoEmpty(normalizeMasterInfo(masterCard))) {
      setExportState({ kind: 'error', text: 'Копия не сделана: база вернулась пустой. Это похоже на сбой хранилища — перезагрузите приложение и попробуйте снова.' });
      return;
    }
    // Версия 5 добавляет личный кабинет целиком (ключ masterInfo): имя,
    // телефон, реквизиты, ссылку на бота, чат-ссылки и подписи цветов —
    // раньше из него сохранялись только задачи, и всё остальное терялось при
    // восстановлении на новом телефоне. Задачи теперь лежат ВНУТРИ него, а не
    // отдельным ключом masterNotes: они несут фото, и дублировать их в файле
    // значило бы удваивать самую тяжёлую его часть. Старые копии с masterNotes
    // читаются по-прежнему (см. masterInfoFromBackup).
    //
    // Сам номер версии нигде на импорте не читается, normalize.ts дефолтит
    // отсутствующие поля независимо от него; это чисто информационная метка.
    // Backup version 1/2/3/4 продолжают читаться.
    //
    // Журнал сбоев уезжает вместе с копией: чтобы разобрать «у меня упало»,
    // мастеру достаточно прислать файл. На импорте он игнорируется — это
    // диагностика, а не данные дневника.
    const payload = { version: 5, exportedAt: new Date().toISOString(), ...data, masterInfo: masterCard, errorLog };
    // Фото (session.photos/contentEntry.photos/задачи кабинета) вынесены из
    // payload отдельными частями Blob — иначе JSON.stringify целиком и
    // следующий File/Blob над той же строкой удваивали пиковую память и
    // роняли вкладку на телефонах с большой библиотекой фото (см.
    // buildBackupBlobParts).
    const parts = buildBackupBlobParts(payload);
    const filename = `inka-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const result = await shareOrDownloadJSON(parts, filename, 'INKA — резервная копия');
    if (result === 'cancelled') {
      setExportState({ kind: 'error', text: 'Копия не сохранена — окно «Поделиться» закрыли. Данные целы, попробуйте ещё раз.' });
      return;
    }
    if (result === 'failed') {
      setExportState({ kind: 'error', text: 'Не удалось отдать файл. Откройте дневник в обычной вкладке браузера и повторите экспорт оттуда.' });
      return;
    }
    onBackupDone();
    // Кабинет назван отдельно: он невидим в счёте клиентов и проектов, а
    // мастеру важно знать, что имя, реквизиты и подписи цветов тоже в файле.
    const cardPart = isMasterInfoEmpty(normalizeMasterInfo(masterCard)) ? '' : ', личный кабинет';
    setExportState({
      kind: 'ok',
      text: `Копия готова: ${data.clients.length} клиент(ов), ${data.projects.length} проект(ов)${cardPart}. Сохраните файл туда, где он переживёт телефон.`,
    });
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
          // чтобы импорт старого бэкапа не стёр текущие данные.
          projects: Array.isArray(parsed?.projects) ? parsed.projects.map((p: any, i: number) => normalizeProject(p, i)) : undefined,
          contentEntries: Array.isArray(parsed?.contentEntries) ? (parsed.contentEntries as ContentEntry[]) : undefined,
          // Тот же принцип для кабинета, но с двумя видами файлов: новая
          // копия несёт карточку целиком, старая — только задачи, и тогда
          // имя, реквизиты и подписи цветов остаются текущими.
          master: masterInfoFromBackup(parsed) ?? undefined,
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

        {/* Backup — export the whole client list to a JSON file, or restore
            from one (replaces everything currently stored). */}
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
                Импортировать {pendingImport.clients.length} клиент(ов)? Текущие данные будут заменены
                {pendingImport.master?.kind === 'full' && ', включая личный кабинет'}.
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
              <div onClick={exportState.kind === 'busy' ? undefined : handleExport} style={{ ...actionButtonStyle, opacity: exportState.kind === 'busy' ? 0.5 : 1 }}>
                {exportState.kind === 'busy' ? 'Готовим…' : 'Экспортировать'}
              </div>
              <div onClick={() => fileInputRef.current?.click()} style={actionButtonStyle}>
                Импортировать
              </div>
            </div>
          )}
          {(exportState.kind === 'ok' || exportState.kind === 'error') && (
            <div
              style={{
                marginTop: 10,
                fontSize: fs(12),
                fontStyle: 'italic',
                color: exportState.kind === 'ok' ? COLORS.gold : 'var(--urgent)',
              }}
            >
              {exportState.text}
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
