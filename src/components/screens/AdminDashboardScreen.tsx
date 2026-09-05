import { useState } from 'react';
import type * as React from 'react';
import type { Client } from '../../domain/client';
import type { Project } from '../../domain/project';
import type { ClientNote } from '../../domain/task';
import type { UrgencyKey } from '../../domain/urgency';
import { upcomingItems } from '../../domain/plannerSelectors';
import {
  fetchBotBookings,
  syncActive,
  type BotBooking,
  type CalendarSyncSettings,
} from '../../lib/calendarSync';
import { formatBookingTime, OPEN_SLOT_MARK, stripTagPrefix, tagLabel } from '../../lib/botBookingFormat';
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
import { DROP_CAP_FONT } from '../InkaLogo';
import { StarDivider } from '../icons/StarIcons';
import { RemindersSection } from '../reminders/RemindersSection';
import { ClientCardTabBar, type ClientCardTabDef } from '../client/ClientCardTabBar';
import { ProjectTimelineList } from '../project/ProjectTimelineList';
import { GoldFrame } from '../ui/Stripes';
import { TodayDateBadge } from '../ui/TodayDateBadge';
import { COLORS, fs, TERRITORY_COLORS } from '../ui/designTokens';
import { type Prefs } from '../ui/preferences';
import { buildAdminWorkSummary } from './adminWorkSummary';
import { AdminWorkSummary } from './AdminWorkSummary';
import { buildUpcomingSchedule } from './upcomingSchedule';
import { UpcomingScheduleSection } from './UpcomingScheduleSection';

// «Оформим по форме как карточка клиента» (см. ClientCardTabBar) — те же
// геммы-иконки, что уже использует Личный кабинет (info/projects), плюс
// sessions/notes: своих гемм под админ-вкладки нет, а заводить новые ради
// одного экрана — лишняя работа под прототип. Порядок — от «требует
// внимания прямо сейчас» к «справочному»: Напоминания первыми, Таймлайн
// последним, он самый «посмотреть, а не подействовать».
const ADMIN_TABS: ClientCardTabDef<'reminders' | 'schedule' | 'summary' | 'timeline'>[] = [
  { id: 'reminders', kind: 'notes', label: 'Напоминания' },
  { id: 'schedule', kind: 'sessions', label: 'Расписание' },
  { id: 'summary', kind: 'info', label: 'Сводка' },
  { id: 'timeline', kind: 'projects', label: 'Таймлайн' },
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
  masterNotes,
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
  onOpenNotes,
  onOpenCalendar,
}: {
  clients: Client[];
  projects: Project[];
  masterNotes: ClientNote[];
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
  // Tapping a «Срочно»/«Важно» count — client or personal — jumps to
  // Блокнот pre-filtered to that urgency, rather than landing unfiltered.
  onOpenNotes: (urgency: UrgencyKey) => void;
  onOpenCalendar: () => void;
}) {
  const [tab, setTab] = useState<'reminders' | 'schedule' | 'summary' | 'timeline'>('schedule');
  const upcoming = upcomingItems(clients, prefs.upcomingWindowDays);
  const upcomingSchedule = buildUpcomingSchedule(upcoming, todayISO());
  const workSummary = buildAdminWorkSummary(clients, masterNotes, prefs.statsWindowDays);

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
        {/* Back in its original top-right corner — nothing else in this
            header shares that spot, so it no longer needs its own row
            pushing the gem tabs down (see #267, which only had to move it
            off Личный кабинет's gear and Мастерская's filter icon). */}
        <div style={{ position: 'absolute', top: 6, right: 24, zIndex: 2 }}>
          <TodayDateBadge onOpen={onOpenCalendar} />
        </div>
      </div>

      {/* Та же строка вкладок-самоцветов, что у карточки клиента и личного
          кабинета (см. ClientCardTabBar) — «оформим админку по форме как
          карточка клиента»: 4 вкладки вместо одной длинной прокрутки. */}
      <ClientCardTabBar
        tabs={ADMIN_TABS}
        activeTab={tab}
        onTab={setTab}
        ariaLabel="Разделы админки"
        accentColor={TERRITORY_COLORS.admin}
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

            {/* Обратный поток: брони от бота отдельным блоком (любой тег —
                бот мог оформить бронь и на [ТАТУ]/[ПРИЁМ]-слот, не только
                [ВИДЕО]/[ОКНО]). Без карточек клиентов и привязки — только
                справочный список, карточку мастер заводит в Дневнике сама
                (см. calendarSync.ts). Сгруппирован с «Предстоящие записи» —
                оба про то, что запланировано впереди. */}
            {syncActive(calendarSync) && (
              <GoldFrame style={{ padding: '14px 16px' }}>
                <div style={{ ...statLabelStyle, marginBottom: 0 }}>Брони от бота</div>
                <div style={{ marginTop: 8 }}>
                  <BotBookingsList settings={calendarSync} />
                </div>
              </GoldFrame>
            )}
          </>
        )}

        {tab === 'summary' && (
          /* Рабочая сводка (M5B) — компактная замена прежней россыпи рамок:
             тумблер периода статистики + карточка «Клиентов» + два
             SplitStatBlock. Все семь чисел прежние, посчитаны снаружи. */
          <AdminWorkSummary
            model={workSummary}
            selectedWindowDays={prefs.statsWindowDays}
            onChangeWindowDays={(days) => onChangePrefs({ ...prefs, statsWindowDays: days })}
            onOpenNotes={onOpenNotes}
          />
        )}

        {tab === 'timeline' && <ProjectTimelineList projects={projects} clients={clients} />}
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
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'не получилось загрузить — проверь секрет/соединение.')
      )
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
