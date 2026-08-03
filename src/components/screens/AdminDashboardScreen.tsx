import { useState } from 'react';
import type * as React from 'react';
import type { Client } from '../../domain/client';
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
  // «Выполнено» на карточке заживления — см. RemindersSection.
  onMarkHealed: (clientId: string, sessionId: string) => void;
  calendarSync: CalendarSyncSettings;
  // Tapping a «Срочно»/«Важно» count — client or personal — jumps to
  // Блокнот pre-filtered to that urgency, rather than landing unfiltered.
  onOpenNotes: (urgency: UrgencyKey) => void;
}) {
  const upcoming = upcomingItems(clients, prefs.upcomingWindowDays);
  const { urgent, important } = urgencyCounts(clients);
  const personalNotes = notesUrgencyCounts(masterNotes);
  const statsUpcoming = upcomingItems(clients, prefs.statsWindowDays);
  const plannedSessionsCount = statsUpcoming.filter((i) => i.kind === 'session').length;
  const plannedConsultationsCount = statsUpcoming.filter((i) => i.kind === 'consultation').length;

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
          onRestore={onRestoreReminder}
          onCancel={onCancelEntry}
          onCompleteTask={onCompleteTask}
          onOpenTask={onOpenTask}
          onMarkHealed={onMarkHealed}
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
