import { useRef, useState } from 'react';
import type { Client } from '../../domain/client';
import type { ContentEntry } from '../../domain/content';
import type { Project } from '../../domain/project';
import type { ClientNote } from '../../domain/task';
import { normalizeClient, normalizeClientNote, normalizeProject } from '../../lib/normalize';
import { shareOrDownloadJSON } from '../../lib/contentShare';
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
  prefs,
  onChange,
  onBack,
  clients,
  masterNotes,
  projects,
  contentEntries,
  onImport,
  onMigrateRecords,
}: {
  theme: Theme;
  onToggleTheme: () => void;
  prefs: Prefs;
  onChange: (p: Prefs) => void;
  onBack: () => void;
  clients: Client[];
  masterNotes: ClientNote[];
  // Нужны только для полного экспорта в backup.
  projects: Project[];
  contentEntries: ContentEntry[];
  // Импорт полного бэкапа: clients + опционально projects/contentEntries/masterNotes.
  onImport: (bundle: { clients: Client[]; projects?: Project[]; contentEntries?: ContentEntry[]; masterNotes?: ClientNote[] }) => void;
  // Собирает старые сессии/консультации (без projectId) в проекты-корзины
  // по клиенту. Возвращает сводку для показа результата.
  onMigrateRecords: () => { buckets: number; records: number };
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  // Parsed and normalized, waiting on the inline «Да/Нет» confirm below —
  // replaces window.confirm() so the prompt matches the app's own dialogs.
  // Опциональные поля отсутствуют в старых backup и тогда текущие данные
  // соответствующих хранилищ не меняются.
  const [pendingImport, setPendingImport] = useState<{
    clients: Client[];
    projects?: Project[];
    contentEntries?: ContentEntry[];
    masterNotes?: ClientNote[];
  } | null>(null);
  // Миграция «Собрать старые записи в проекты» — двухшаговое подтверждение
  // (сначала напоминаем про бэкап) + сообщение о результате.
  const [migrateConfirm, setMigrateConfirm] = useState(false);
  const [migrateResult, setMigrateResult] = useState<string | null>(null);
  const hasUnorganizedRecords = clients.some(
    (c) => c.sessions.some((s) => !s.projectId) || c.consultations.some((cs) => !cs.projectId),
  );

  const handleExport = async () => {
    // Версия 4 добавляет Consultation.status/convertedToSessionId и
    // Session.sourceConsultationId (см. domain/consultation.ts,
    // domain/session.ts) — сам номер версии нигде на импорте не читается,
    // normalize.ts дефолтит отсутствующие поля независимо от него; это чисто
    // информационная метка. Backup version 1/2/3 продолжают читаться.
    const payload = { version: 4, exportedAt: new Date().toISOString(), clients, projects, contentEntries, masterNotes };
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
          // чтобы импорт старого бэкапа не стёр текущие данные. Повреждённое
          // masterNotes тоже считается отсутствующим; [] остаётся валидным.
          projects: Array.isArray(parsed?.projects) ? parsed.projects.map((p: any, i: number) => normalizeProject(p, i)) : undefined,
          contentEntries: Array.isArray(parsed?.contentEntries) ? (parsed.contentEntries as ContentEntry[]) : undefined,
          masterNotes: Array.isArray(parsed?.masterNotes) ? parsed.masterNotes.map((n: any, i: number) => normalizeClientNote(n, i, 'm')) : undefined,
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

        {/* Backup — export the whole client list to a JSON file, or restore
            from one (replaces everything currently stored). */}
        <div style={rowStyle}>
          <div style={labelStyle}>Резервная копия</div>
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
        </div>

        {/* Организация записей — собирает старые сессии/консультации (ещё не
            привязанные к проекту) в проект-«корзину» по каждому клиенту.
            Аддитивно: сами записи не меняются и не удаляются. Показывается,
            только пока есть что собирать. */}
        {(hasUnorganizedRecords || migrateResult) && (
          <div style={rowStyle}>
            <div style={labelStyle}>Организация записей</div>
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
          </div>
        )}

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
