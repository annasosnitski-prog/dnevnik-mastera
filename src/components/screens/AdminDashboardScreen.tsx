import { useEffect, useState } from 'react';
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
  HealingItem,
  OverdueItem,
  ProjectSessionReminderItem,
  StaleProjectItem,
  TaskReminderItem,
  UpcomingSoonItem,
} from '../../reminders/types';
import { todayISO } from '../../utils/dates';
import { DROP_CAP_FONT } from '../InkaLogo';
import { StarDivider } from '../icons/StarIcons';
import { RemindersSection } from '../reminders/RemindersSection';
import { GoldFrame } from '../ui/Stripes';
import { COLORS, fs } from '../ui/designTokens';
import { DASHBOARD_WINDOW_OPTIONS, MANUAL_WINDOW_DAYS_MAX, type Prefs } from '../ui/preferences';
import { buildAdminNotesGroups } from './adminNotesList';
import { AdminNotesList } from './AdminNotesList';
import { buildAdminWorkSummary } from './adminWorkSummary';
import { AdminWorkSummary } from './AdminWorkSummary';
import { buildUpcomingSchedule } from './upcomingSchedule';
import { UpcomingScheduleSection } from './UpcomingScheduleSection';

type AdminTab = 'records' | 'tasks' | 'summary';

// ===================== ADMIN DASHBOARD =====================
// The control panel: every reminder, the upcoming-sessions lookahead, and the
// client/session/consultation stats (minus «Частый стиль», which stays a
// personal Мастер stat) — everything that's about running the practice day
// to day. Backup (export/import) and record organization moved to Настройки
// — they're one-off maintenance, not something to trip over here.
export function AdminDashboardScreen({
  clients,
  masterNotes,
  prefs,
  onChangePrefs,
  onOpenSession,
  overdue,
  healing,
  soon,
  overdueProjectSessions,
  soonProjectSessions,
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
  onMarkHealed,
  onHideAllHealing,
  calendarSync,
  onOpenNotes,
}: {
  clients: Client[];
  masterNotes: ClientNote[];
  prefs: Prefs;
  onChangePrefs: (p: Prefs) => void;
  onOpenSession: (clientId: string, itemId: string, kind: 'session' | 'consultation') => void;
  overdue: OverdueItem[];
  healing: HealingItem[];
  soon: UpcomingSoonItem[];
  overdueProjectSessions: ProjectSessionReminderItem[];
  soonProjectSessions: ProjectSessionReminderItem[];
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
  onMarkHealed: (clientId: string, sessionId: string) => void;
  onHideAllHealing: (sessionId: string) => void;
  calendarSync: CalendarSyncSettings;
  // Tapping a «Срочно»/«Важно» count — client or personal — jumps to
  // Блокнот pre-filtered to that urgency, rather than landing unfiltered.
  onOpenNotes: (urgency: UrgencyKey) => void;
}) {
  const [activeTab, setActiveTab] = useState<AdminTab>('tasks');

  const upcoming = upcomingItems(clients, prefs.upcomingWindowDays);
  const upcomingSchedule = buildUpcomingSchedule(upcoming, todayISO());
  const workSummary = buildAdminWorkSummary(clients, masterNotes, prefs.upcomingWindowDays);
  const notesGroups = buildAdminNotesGroups(clients, masterNotes);

  const tabStyle = (tab: AdminTab): React.CSSProperties => ({
    flex: 1,
    minWidth: 0,
    appearance: 'none',
    font: 'inherit',
    padding: '9px 4px',
    background: 'none',
    border: 'none',
    borderBottom: activeTab === tab ? `1px solid ${COLORS.gold}` : '1px solid transparent',
    color: activeTab === tab ? COLORS.gold : COLORS.textFaint,
    fontSize: fs(11),
    letterSpacing: '1px',
    textTransform: 'uppercase',
    cursor: 'pointer',
    transition: 'border-color 0.25s, color 0.25s',
  });

  const statLabelStyle: React.CSSProperties = {
    fontSize: fs(11),
    color: COLORS.textGhost,
    letterSpacing: '1.5px',
    textTransform: 'uppercase',
    marginBottom: 6,
  };

  return (
    <div style={{ minHeight: '100%' }}>
      {/* Шапка стабильна и «липкая» — тот же приём, что на карточке клиента:
          заголовок, переключатель периода и вкладки остаются на месте, пока
          прокручивается содержимое вкладки ниже. Родительский скролл-контейнер
          (TattoDiary.tsx) уже overflowY:'auto' — sticky работает без изменений
          снаружи этого компонента. */}
      <div style={{ position: 'sticky', top: 0, zIndex: 2, background: COLORS.bg }}>
        <div style={{ height: 'calc(env(safe-area-inset-top) + 18px)' }} />
        <div style={{ padding: '6px 24px 12px' }}>
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
            Управление и распорядок
          </div>
          <StarDivider />

          {/* Общий период Админки (M5D) — один переключатель на шапке вместо
              прежних двух независимых тумблеров у «Предстоящих записей» и
              «Рабочей сводки». Управляет только вкладками «Записи» и «Рабочая
              сводка»; вкладка «Задачи» от него не зависит. */}
          <div style={{ marginTop: 10 }}>
            <PeriodToggle days={prefs.upcomingWindowDays} onChange={(days) => onChangePrefs({ ...prefs, upcomingWindowDays: days })} />
          </div>
        </div>

        <div role="tablist" aria-label="Разделы админки" style={{ display: 'flex', borderBottom: '1px solid rgba(var(--gold-rgb),0.15)', padding: '0 20px' }}>
          <button type="button" role="tab" aria-selected={activeTab === 'records'} onClick={() => setActiveTab('records')} style={tabStyle('records')}>
            Записи
          </button>
          <button type="button" role="tab" aria-selected={activeTab === 'tasks'} onClick={() => setActiveTab('tasks')} style={tabStyle('tasks')}>
            Задачи
          </button>
          <button type="button" role="tab" aria-selected={activeTab === 'summary'} onClick={() => setActiveTab('summary')} style={tabStyle('summary')}>
            Рабочая сводка
          </button>
        </div>
      </div>

      <div style={{ padding: '16px 20px calc(env(safe-area-inset-bottom, 0px) + 84px)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {activeTab === 'records' && (
          <>
            {/* Предстоящие записи (M5C) — компактно, без внешней GoldFrame, та
                же визуальная логика, что у групп напоминаний и «Рабочей
                сводки». upcomingItems по-прежнему единственный источник того,
                какие записи попадают в список и в каком порядке — группировка
                по дням только раскладывает уже готовый результат. */}
            <UpcomingScheduleSection groups={upcomingSchedule} onOpenSession={onOpenSession} />

            {/* Обратный поток: брони от бота отдельным блоком (любой тег —
                бот мог оформить бронь и на [ТАТУ]/[ПРИЁМ]-слот, не только
                [ВИДЕО]/[ОКНО]). Без карточек клиентов и привязки — только
                справочный список, карточку мастер заводит в Дневнике сама
                (см. calendarSync.ts). Объединена с «Предстоящие записи» в одну
                вкладку (M5D) — обе про то, что запланировано впереди. */}
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

        {activeTab === 'tasks' && (
          <>
            {/* Уведомления и напоминания — то, что уже требует действия по
                дате (просрочки/скоро/заживление/давно не двигалось/задачи). */}
            <RemindersSection
              overdue={overdue}
              healing={healing}
              soon={soon}
              overdueProjectSessions={overdueProjectSessions}
              soonProjectSessions={soonProjectSessions}
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
              onMarkHealed={onMarkHealed}
              onHideAllHealing={onHideAllHealing}
            />

            {/* Расширенный список (M5D) — вообще все незавершённые заметки по
                всем четырём уровням срочности, включая заметки без срока;
                дополняет радар напоминаний выше, не дублирует его правила. */}
            <AdminNotesList groups={notesGroups} onOpenNotes={onOpenNotes} />
          </>
        )}

        {activeTab === 'summary' && (
          /* Рабочая сводка (M5B) — компактная замена прежней россыпи рамок:
             карточка «Клиентов» + два SplitStatBlock. Свой тумблер периода
             убран (M5D) — период общий, живёт в шапке. */
          <AdminWorkSummary model={workSummary} onOpenNotes={onOpenNotes} />
        )}
      </div>
    </div>
  );
}

// ===================== ПЕРЕКЛЮЧАТЕЛЬ ПЕРИОДА =====================
// Общий период Админки (M5D) — живёт в шапке, управляет вкладками «Записи» и
// «Рабочая сводка». Четыре быстрых пресета (DASHBOARD_WINDOW_OPTIONS) плюс
// свободный ввод числа дней вручную — значение больше не ограничено списком
// пресетов, только разумным потолком MANUAL_WINDOW_DAYS_MAX.
function PeriodToggle({ days, onChange }: { days: number; onChange: (days: number) => void }) {
  const [manualText, setManualText] = useState(String(days));

  useEffect(() => {
    setManualText(String(days));
  }, [days]);

  const commitManual = () => {
    const n = Math.round(Number(manualText));
    if (Number.isFinite(n) && n >= 1) {
      onChange(Math.min(n, MANUAL_WINDOW_DAYS_MAX));
    } else {
      setManualText(String(days));
    }
  };

  const presetBtnStyle = (selected: boolean): React.CSSProperties => ({
    appearance: 'none',
    font: 'inherit',
    fontSize: fs(12),
    padding: '4px 10px',
    borderRadius: 2,
    cursor: 'pointer',
    border: selected ? '1px solid rgba(var(--gold-rgb),0.6)' : '1px solid rgba(var(--gold-rgb),0.15)',
    background: selected ? 'rgba(var(--gold-rgb),0.08)' : 'transparent',
    color: selected ? COLORS.gold : COLORS.textFaint,
  });

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      {DASHBOARD_WINDOW_OPTIONS.map((o) => (
        <button key={o.days} type="button" onClick={() => onChange(o.days)} aria-pressed={days === o.days} style={presetBtnStyle(days === o.days)}>
          {o.label}
        </button>
      ))}
      <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: fs(12), color: COLORS.textFaint, marginLeft: 2 }}>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={MANUAL_WINDOW_DAYS_MAX}
          value={manualText}
          onChange={(e) => setManualText(e.target.value)}
          onBlur={commitManual}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              commitManual();
              (e.target as HTMLInputElement).blur();
            }
          }}
          aria-label="Свой период, дней"
          style={{
            width: 52,
            font: 'inherit',
            fontSize: fs(12),
            padding: '3px 6px',
            borderRadius: 2,
            border: '1px solid rgba(var(--gold-rgb),0.15)',
            background: 'transparent',
            color: COLORS.textPrimary,
          }}
        />
        дней
      </label>
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
