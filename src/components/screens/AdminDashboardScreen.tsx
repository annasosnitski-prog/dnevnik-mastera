import { useRef, useState } from 'react';
import type * as React from 'react';
import type { Client } from '../../domain/client';
import type { ContentEntry } from '../../domain/content';
import type { Project } from '../../domain/project';
import type { ClientNote } from '../../domain/task';
import { URGENCY, type UrgencyKey } from '../../domain/urgency';
import { upcomingItems } from '../../domain/plannerSelectors';
import { notesUrgencyCounts, urgencyCounts } from '../../domain/taskSelectors';
import {
  fetchBotBookings,
  syncActive,
  type BotBooking,
  type CalendarSyncSettings,
} from '../../lib/calendarSync';
import { formatBookingTime, OPEN_SLOT_MARK, stripTagPrefix, tagLabel } from '../../lib/botBookingFormat';
import { normalizeClient, normalizeClientNote, normalizeProject } from '../../lib/normalize';
import { shareOrDownloadJSON } from '../../lib/contentShare';
import type {
  HealingItem,
  OverdueItem,
  ProjectSessionReminderItem,
  TaskReminderItem,
  UpcomingSoonItem,
} from '../../reminders/types';
import { formatDate } from '../../utils/dates';
import { DROP_CAP_FONT } from '../InkaLogo';
import { StarDivider } from '../icons/StarIcons';
import { RemindersSection } from '../reminders/RemindersSection';
import { GoldFrame } from '../ui/Stripes';
import { SplitStatBlock } from '../ui/StatBlocks';
import { COLORS, fs } from '../ui/designTokens';
import { DASHBOARD_WINDOW_OPTIONS, type Prefs } from '../ui/preferences';

// ===================== ADMIN DASHBOARD =====================
// The control panel: every reminder, the upcoming-sessions lookahead, the
// client/session/consultation stats (minus «Частый стиль», which stays a
// personal Мастер stat), scheduling, and backup — everything that's about
// running the practice rather than the master's own profile.
export function AdminDashboardScreen({
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
  overdueProjectSessions,
  soonProjectSessions,
  dueProjects,
  tasks,
  onOpenProject,
  onOpenEntry,
  onDismissReminder,
  onSnoozeReminder,
  onCancelEntry,
  onCompleteTask,
  onOpenTask,
  calendarSync,
  onOpenNotes,
  onMigrateRecords,
}: {
  clients: Client[];
  masterNotes: ClientNote[];
  prefs: Prefs;
  onChangePrefs: (p: Prefs) => void;
  onOpenSession: (clientId: string, itemId: string, kind: 'session' | 'consultation') => void;
  // Импорт полного бэкапа: clients + опционально projects/contentEntries/masterNotes.
  onImport: (bundle: { clients: Client[]; projects?: Project[]; contentEntries?: ContentEntry[]; masterNotes?: ClientNote[] }) => void;
  // Нужны для полного экспорта в backup.
  projects: Project[];
  contentEntries: ContentEntry[];
  overdue: OverdueItem[];
  healing: HealingItem[];
  soon: UpcomingSoonItem[];
  overdueProjectSessions: ProjectSessionReminderItem[];
  soonProjectSessions: ProjectSessionReminderItem[];
  // Проекты с просроченным «следующим шагом» — в напоминания (Этап 3b).
  dueProjects: Project[];
  // Task-напоминания (ClientNote.dueDate) — поверх того же engine.
  tasks: TaskReminderItem[];
  onOpenProject: (project: Project) => void;
  onOpenEntry: (clientId: string, itemId: string, kind: 'session' | 'consultation') => void;
  onDismissReminder: (key: string) => void;
  onSnoozeReminder: (key: string, showAfter: string) => void;
  onCancelEntry: (clientId: string, itemId: string, kind: 'session' | 'consultation') => void;
  onCompleteTask: (item: TaskReminderItem) => void;
  onOpenTask: (item: TaskReminderItem) => void;
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
    // Версия 3 добавляет только задачи мастера. Остальные поля masterInfo
    // намеренно не экспортируются. Backup version 1/2 продолжают читаться.
    const payload = { version: 3, exportedAt: new Date().toISOString(), clients, projects, contentEntries, masterNotes };
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
        <RemindersSection
          overdue={overdue}
          healing={healing}
          soon={soon}
          overdueProjectSessions={overdueProjectSessions}
          soonProjectSessions={soonProjectSessions}
          dueProjects={dueProjects}
          tasks={tasks}
          onOpenProject={onOpenProject}
          onOpenEntry={onOpenEntry}
          onDismiss={onDismissReminder}
          onSnooze={onSnoozeReminder}
          onCancel={onCancelEntry}
          onCompleteTask={onCompleteTask}
          onOpenTask={onOpenTask}
        />

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
