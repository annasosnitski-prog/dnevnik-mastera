import { useCallback, useEffect, useState } from 'react';
import type * as React from 'react';
import type { Client } from '../../domain/client';
import type { Project } from '../../domain/project';
import { upcomingItems } from '../../domain/plannerSelectors';
import {
  fetchBotBookings,
  syncActive,
  type BotBooking,
  type CalendarSyncSettings,
} from '../../lib/calendarSync';
import {
  bookingTitle,
  formatBookingTime,
  OPEN_SLOT_MARK,
  stripTagPrefix,
  tagLabel,
  upcomingBookedBookings,
} from '../../lib/botBookingFormat';
import type {
  OverdueItem,
  ProjectSessionReminderItem,
  ProjectConsultationReminderItem,
  StaleProjectItem,
  TaskReminderItem,
  UpcomingSoonItem,
} from '../../reminders/types';
import type { HealingCycleItem } from '../../reminders/healingCycle';
import { todayISO } from '../../utils/dates';
import { DROP_CAP_FONT, InkaTitleSuffix } from '../InkaLogo';
import { StarDivider } from '../icons/StarIcons';
import { RemindersSection } from '../reminders/RemindersSection';
import { ClientCardTabBar, type ClientCardTabDef } from '../client/ClientCardTabBar';
import { ProjectTimelineList } from '../project/ProjectTimelineList';
import { ClientActionsTab } from './ClientActionsTab';
import { CollapsibleGroup } from '../ui/CollapsibleGroup';
import { TodayDateBadge } from '../ui/TodayDateBadge';
import { COLORS, fs, TERRITORY_COLORS } from '../ui/designTokens';
import { type Prefs } from '../ui/preferences';
import { buildUpcomingSchedule } from './upcomingSchedule';
import { UpcomingScheduleSection } from './UpcomingScheduleSection';

// «Оформим по форме как карточка клиента» (см. ClientCardTabBar) — те же
// геммы-иконки, что уже использует Личный кабинет (info/projects), плюс
// sessions/notes: своих гемм под админ-вкладки нет, а заводить новые ради
// одного экрана — лишняя работа под прототип. Порядок — от «требует
// внимания прямо сейчас» к «справочному»: Напоминания первыми, Проекты
// последними, он самый «посмотреть, а не подействовать».
// «Проекты» — одна вкладка вместо прежней пары «Таймлайн» / «Без окна»:
// внутри пайплайны (рельсы) и проекты без окна плиткой в три колонки, каждая
// группа сворачивается стрелкой (см. ProjectTimelineList).
const ADMIN_TABS: ClientCardTabDef<'reminders' | 'schedule' | 'timeline' | 'clients'>[] = [
  { id: 'reminders', kind: 'notes', label: 'Напоминания' },
  { id: 'schedule', kind: 'sessions', label: 'Расписание' },
  { id: 'timeline', kind: 'projects', label: 'Проекты', color: TERRITORY_COLORS.clients },
  { id: 'clients', kind: 'info', label: 'Клиенты', color: TERRITORY_COLORS.admin },
];

// ===================== ADMIN DASHBOARD =====================
// The control panel: every reminder, the upcoming-sessions lookahead, and the
// client/session/consultation stats (minus «Частый стиль», which stays a
// personal Мастер stat) — everything that's about running the practice day
// to day. Backup (export/import) and record organization moved to Настройки
// — they're one-off maintenance, not something to trip over here.
export function AdminDashboardScreen({
  clients,
  projects,
  prefs,
  onChangePrefs,
  onOpenSession,
  overdue,
  healing,
  soon,
  overdueProjectSessions,
  soonProjectSessions,
  overdueProjectConsultations,
  soonProjectConsultations,
  dueProjects,
  staleProjects,
  tasks,
  onOpenProject,
  onOpenEntry,
  onDismissReminder,
  onSnoozeReminder,
  onRestoreReminder,
  onCancelEntry,
  onCompleteTask,
  onOpenTask,
  onAddHealingPhoto,
  onScheduleCorrection,
  onHideAllHealing,
  calendarSync,
  onOpenCalendar,
}: {
  clients: Client[];
  projects: Project[];
  prefs: Prefs;
  onChangePrefs: (p: Prefs) => void;
  onOpenSession: (clientId: string, itemId: string, kind: 'session' | 'consultation') => void;
  overdue: OverdueItem[];
  healing: HealingCycleItem[];
  soon: UpcomingSoonItem[];
  overdueProjectSessions: ProjectSessionReminderItem[];
  soonProjectSessions: ProjectSessionReminderItem[];
  overdueProjectConsultations: ProjectConsultationReminderItem[];
  soonProjectConsultations: ProjectConsultationReminderItem[];
  // Проекты с просроченным «следующим шагом» — в напоминания (Этап 3b).
  dueProjects: Project[];
  // Активные проекты без значимого движения дольше порога (M4) — «мягкое»
  // напоминание, отдельное от dueProjects.
  staleProjects: StaleProjectItem[];
  // Task-напоминания (ClientNote.dueDate) — поверх того же engine.
  tasks: TaskReminderItem[];
  onOpenProject: (project: Project) => void;
  onOpenEntry: (clientId: string, itemId: string, kind: 'session' | 'consultation') => void;
  onDismissReminder: (key: string) => void;
  onSnoozeReminder: (key: string, showAfter: string) => void;
  onRestoreReminder: (key: string) => void;
  onCancelEntry: (clientId: string, itemId: string, kind: 'session' | 'consultation') => void;
  onCompleteTask: (item: TaskReminderItem) => void;
  onOpenTask: (item: TaskReminderItem) => void;
  onAddHealingPhoto: (project: Project) => void;
  onScheduleCorrection: (project: Project) => void;
  onHideAllHealing: (it: HealingCycleItem) => void;
  calendarSync: CalendarSyncSettings;
  onOpenCalendar: () => void;
}) {
  // Открывая админку, мастер в первую очередь хочет увидеть, что происходит
  // с проектами прямо сейчас — таймлайн, а не расписание или напоминания.
  const [tab, setTab] = useState<'reminders' | 'schedule' | 'timeline' | 'clients'>('timeline');
  const upcoming = upcomingItems(clients, prefs.upcomingWindowDays);
  const upcomingSchedule = buildUpcomingSchedule(upcoming, todayISO());
  const botBookings = useBotBookings(calendarSync, tab === 'schedule' && syncActive(calendarSync));

  return (
    <div style={{ minHeight: '100%' }}>
      <div style={{ height: 'calc(env(safe-area-inset-top) + 18px)' }} />
      <div style={{ padding: '6px 24px 12px', position: 'relative', zIndex: 1 }}>
        {/* The calendar badge is a flex sibling of the whole title+subtitle
            column (not absolutely positioned) so it centers vertically
            against the full header block's height, pinned to the right
            edge — not just against the title's own line. */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div
              style={{
                fontFamily: DROP_CAP_FONT,
                fontSize: fs(24),
                lineHeight: 1,
                color: COLORS.gold,
                letterSpacing: '2px',
              }}
            >
              Admin<InkaTitleSuffix fontSize={fs(24)} />
            </div>
            <div style={{ fontSize: fs(9.66), color: COLORS.textGhost, letterSpacing: `${fs(2.97)}px`, textTransform: 'uppercase', marginTop: 3, fontStyle: 'italic' }}>
              Управление и статистика
            </div>
          </div>
          <TodayDateBadge onOpen={onOpenCalendar} size={35} />
        </div>
        <StarDivider />
      </div>

      {/* Та же строка вкладок-самоцветов, что у карточки клиента и личного
          кабинета (см. ClientCardTabBar) — «оформим админку по форме как
          карточка клиента»: 4 вкладки вместо одной длинной прокрутки. */}
      <ClientCardTabBar
        tabs={ADMIN_TABS}
        activeTab={tab}
        onTab={setTab}
        ariaLabel="Разделы админки"
      />

      <div style={{ padding: '4px 20px calc(env(safe-area-inset-bottom, 0px) + 84px)', position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* «Запланировать» now lives only behind the nav FAB's contextual
            create button (same calendar-driven creation walk) — this screen
            no longer duplicates it as its own standalone button. */}

        {tab === 'reminders' && (
          <RemindersSection
            overdue={overdue}
            healing={healing}
            soon={soon}
            overdueProjectSessions={overdueProjectSessions}
            soonProjectSessions={soonProjectSessions}
            overdueProjectConsultations={overdueProjectConsultations}
            soonProjectConsultations={soonProjectConsultations}
            dueProjects={dueProjects}
            staleProjects={staleProjects}
            tasks={tasks}
            clients={clients}
            onOpenProject={onOpenProject}
            onOpenEntry={onOpenEntry}
            onDismiss={onDismissReminder}
            onSnooze={onSnoozeReminder}
            onRestore={onRestoreReminder}
            onCancel={onCancelEntry}
            onCompleteTask={onCompleteTask}
            onOpenTask={onOpenTask}
            onAddHealingPhoto={onAddHealingPhoto}
            onScheduleCorrection={onScheduleCorrection}
            onHideAllHealing={onHideAllHealing}
          />
        )}

        {tab === 'schedule' && (
          <>
            {/* Предстоящие записи (M5C) — компактно, без внешней GoldFrame, та же
                визуальная логика, что у групп напоминаний и «Рабочей сводки».
                upcomingItems по-прежнему единственный источник того, какие
                записи попадают в список и в каком порядке — группировка по дням
                только раскладывает уже готовый результат. */}
            <UpcomingScheduleSection
              groups={upcomingSchedule}
              selectedWindowDays={prefs.upcomingWindowDays}
              onChangeWindowDays={(days) => onChangePrefs({ ...prefs, upcomingWindowDays: days })}
              onOpenSession={onOpenSession}
            />

            {/* Обратный поток: брони от бота. Занятые (настоящие брони с
                клиентом) — плиткой сразу под «Предстоящими записями», чтобы
                были видны всегда; раньше список грузился только по кнопке
                «обновить», и после открытия вкладки его просто не было.
                Полный список со свободными слотами и /закрой — ниже, в
                свёрнутой группе: для планирования, но не первостепенно.
                Без карточек клиентов и привязки (см. calendarSync.ts). */}
            {syncActive(calendarSync) && (
              <>
                <BookedBotTiles state={botBookings} />
                <CollapsibleGroup
                  title="Все слоты бота"
                  count={botBookings.bookings?.length ?? 0}
                  defaultOpen={false}
                >
                  <BotBookingsList state={botBookings} />
                </CollapsibleGroup>
              </>
            )}
          </>
        )}

        {/* «Проекты» — одна вкладка: пайплайны (рельсы) и проекты «без окна»
            плиткой, каждая группа сворачивается стрелкой (см. ProjectTimelineList). */}
        {tab === 'clients' && <ClientActionsTab projects={projects} clients={clients} healing={healing} onOpenProject={onOpenProject} />}

        {tab === 'timeline' && <ProjectTimelineList projects={projects} clients={clients} onOpenProject={onOpenProject} />}
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
// Загружаем сами при каждом открытии вкладки «Расписание» (содержимое
// вкладки монтируется заново при переключении), кнопка «обновить»
// остаётся для ручного перезапроса.
interface BotBookingsState {
  bookings: BotBooking[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

function useBotBookings(settings: CalendarSyncSettings, active: boolean): BotBookingsState {
  const [bookings, setBookings] = useState<BotBooking[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchBotBookings(settings)
      .then((b) => setBookings(b.slice().sort((a, b2) => a.start.localeCompare(b2.start))))
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'не получилось загрузить — проверь секрет/соединение.')
      )
      .finally(() => setLoading(false));
  }, [settings]);

  useEffect(() => {
    if (active) refresh();
    // Перезапрос только при входе во вкладку, не на каждый новый объект settings.
  }, [active]);

  return { bookings, loading, error, refresh };
}

// Занятые брони плиткой: имя клиента/пометка бота и время. Только чтение.
function BookedBotTiles({ state }: { state: BotBookingsState }) {
  const booked = upcomingBookedBookings(state.bookings ?? [], new Date());
  const headingStyle: React.CSSProperties = {
    fontSize: fs(11),
    color: COLORS.textGhost,
    letterSpacing: '1.5px',
    textTransform: 'uppercase',
    marginBottom: 8,
  };
  return (
    <div>
      <div style={headingStyle}>Брони от бота · {state.bookings === null ? '…' : booked.length}</div>
      {state.error && <div style={{ fontSize: fs(12), color: '#C99', fontStyle: 'italic' }}>{state.error}</div>}
      {state.bookings === null && !state.error && (
        <div style={{ fontSize: fs(13), color: COLORS.textGhost, fontStyle: 'italic' }}>гружу брони…</div>
      )}
      {state.bookings !== null && booked.length === 0 && !state.error && (
        <div style={{ fontSize: fs(13), color: COLORS.textGhost, fontStyle: 'italic' }}>занятых броней впереди нет.</div>
      )}
      {booked.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
          {booked.map((b) => (
            <div
              key={b.id}
              style={{
                padding: '10px 10px',
                borderRadius: 2,
                border: '1px solid rgba(var(--gold-rgb),0.25)',
                background: 'rgba(var(--gold-rgb),0.05)',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                minHeight: 72,
              }}
            >
              <span
                style={{
                  fontSize: fs(13),
                  color: COLORS.textPrimary,
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                }}
              >
                {bookingTitle(b)}
              </span>
              <span style={{ fontSize: fs(11), color: COLORS.gold, marginTop: 'auto' }}>{formatBookingTime(b.start)}</span>
              {b.tag && (
                <span style={{ fontSize: fs(9), color: COLORS.textGhost, letterSpacing: '1px', textTransform: 'uppercase' }}>
                  {tagLabel(b.tag)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BotBookingsList({ state }: { state: BotBookingsState }) {
  const { bookings, loading, error, refresh } = state;

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
