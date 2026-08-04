import { useState, useEffect, useMemo, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { InkaLogo, DROP_CAP_FONT } from '../InkaLogo';
import { type Session } from '../../domain/session';
import { type Consultation } from '../../domain/consultation';
import { type Client } from '../../domain/client';
import { type Project, type NextActionType } from '../../domain/project';
import { urgencyMeta } from '../../domain/taskSelectors';
import {
  resolveContentEntryLink,
  isContentEntryLinked,
  buildContentProjectOptions,
  buildContentSessionOptions,
  type ContentEntryLink,
} from '../../lib/contentLink';
import { type ContentWorkspaceNavigation } from '../../lib/contentWorkspace';
import {
  syncActive,
  fetchBotBookings,
  type CalendarSyncSettings,
  type BotBooking,
} from '../../lib/calendarSync';
import { collectCalendarEvents, botSlotDayKey } from '../../lib/calendarEvents';
import { OPEN_SLOT_MARK, tagLabel } from '../../lib/botBookingFormat';
import { ISO_DATE_RE, formatDate, todayISO } from '../../utils/dates';
import {
  COLORS,
  fs,
  INPUT_STYLE,
  SUBMIT_STYLE,
  ViewField,
  ContentPanel,
  clientNameFor,
  type ContentEntry,
} from '../TattoDiary';
import { SessionPhotos, NextStepRow } from '../client/ClientControls';
import { BottomSheet, SheetCloseButton, SheetEditButton } from '../ui/Sheet';
import { SheetStarDivider } from '../ui/TextAtoms';

// Вынесено из TattoDiary.tsx (PR 7 рефакторинга). Логика и разметка не
// менялись — только перенос в отдельный модуль.

export function ContentShareSheet({
  carouselCount,
  storiesCount,
  onInstagramCarousel,
  onInstagramStories,
  onOtherApps,
  onClose,
}: {
  carouselCount: number;
  storiesCount: number;
  onInstagramCarousel: () => void;
  onInstagramStories: () => void;
  onOtherApps: () => void;
  onClose: () => void;
}) {
  return createPortal(
    <div className="content-share-sheet-backdrop" onClick={onClose}>
      <div
        className="content-share-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Поделиться контентом"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="content-share-sheet__title">Поделиться</div>
        <button type="button" disabled={carouselCount === 0} onClick={onInstagramCarousel}>
          Instagram · Карусель · {carouselCount}
        </button>
        <button type="button" disabled={storiesCount === 0} onClick={onInstagramStories}>
          Instagram · Сториз · {storiesCount}
        </button>
        <button type="button" onClick={onOtherApps}>Другие приложения</button>
        <button type="button" className="content-share-sheet__cancel" onClick={onClose}>Отмена</button>
      </div>
    </div>,
    document.body,
  );
}

export function TimelineViewSheet({
  open,
  session,
  consultation,
  consultationNumber,
  clientId,
  clientProjects,
  contentEntries,
  onClose,
  onEdit,
  onReassignProject,
  onOpenContent,
  onConvertToSession,
  onOpenConvertedSession,
  onChainNextConsultation,
  onOpenNextConsultation,
  onSaveNextStep,
}: {
  open: boolean;
  session: Session | null;
  consultation: Consultation | null;
  // Порядковый номер консультации внутри её проекта — см.
  // getConsultationNumber в domain/projectSelectors.ts. null/undefined для
  // консультации без проекта или для сессии.
  consultationNumber?: number | null;
  clientId: string;
  // Проекты этого клиента — для быстрой смены проекта записи без захода в
  // полную форму редактирования (Этап 3a).
  clientProjects: Project[];
  contentEntries: ContentEntry[];
  onClose: () => void;
  onEdit: () => void;
  onReassignProject: (projectId: string | null) => void;
  onOpenContent: (navigation: ContentWorkspaceNavigation) => void;
  // Consultation happened, work session was agreed — moves this record into
  // a session. Only rendered for a consultation view (isConsult below), and
  // only while it's still convertible (status !== 'converted').
  onConvertToSession?: () => void;
  // Открыть сессию, в которую эта консультация уже была переведена (см.
  // Consultation.convertedToSessionId) — рендерится вместо «Перевести в
  // сессию →» once status === 'converted'.
  onOpenConvertedSession?: () => void;
  // «Назначить следующую консультацию» — консультация никогда не заменяется
  // другой (см. Consultation.previousConsultationId); независимо от
  // onConvertToSession/onOpenConvertedSession выше.
  onChainNextConsultation?: () => void;
  // Следующая консультация уже назначена (Consultation.nextConsultationId) —
  // рендерится вместо «Назначить следующую консультацию →».
  onOpenNextConsultation?: () => void;
  // Единственный next step ПРОЕКТА (не сессии/консультации — см.
  // NextStepRow) — рендерится только когда запись привязана к проекту
  // (currentProject ниже), пишет напрямую в тот же объект Project.
  onSaveNextStep?: (text: string, date: string | null, type: NextActionType | null) => void;
}) {
  const isConsult = !!consultation;
  const dateLine = (() => {
    const d = isConsult ? consultation!.date : session?.date ?? '';
    const t = isConsult ? consultation!.time : session?.time ?? '';
    return [formatDate(d) || 'Дата не указана', t].filter(Boolean).join(' · ');
  })();
  const urgency = consultation ? urgencyMeta(consultation.urgency) : null;
  const currentProjectId = (isConsult ? consultation?.projectId : session?.projectId) ?? null;
  const currentProject = currentProjectId ? clientProjects.find((p) => p.id === currentProjectId) ?? null : null;

  return (
    <BottomSheet open={open} heightPct={94}>
      <div style={{ padding: '16px 24px 14px', position: 'relative' }}>
        <SheetEditButton onClick={onEdit} />
        <SheetCloseButton onClose={onClose} />
        <div style={{ marginBottom: 5 }}>
          <InkaLogo height={fs(15)} />
        </div>
        <div style={{ fontSize: fs(22), color: COLORS.textPrimary, fontWeight: 300, letterSpacing: '1px' }}>
          {isConsult ? (consultationNumber ? `Консультация ${consultationNumber}` : 'Консультация') : session?.name || 'Сессия'}
        </div>
        <div style={{ fontSize: fs(13), color: COLORS.textGhost, marginTop: 4, letterSpacing: '0.3px' }}>{dateLine}</div>
        <SheetStarDivider />
      </div>

      <div style={{ padding: '4px 24px 60px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {clientProjects.length > 0 && (
          <div>
            <div style={{ fontSize: fs(10), color: COLORS.textGhost, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 5 }}>Проект</div>
            <select
              value={currentProjectId ?? ''}
              onChange={(e) => onReassignProject(e.target.value || null)}
              style={{ ...INPUT_STYLE, fontSize: fs(14) }}
            >
              <option value="">— без проекта —</option>
              {clientProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title || 'Без названия'}
                </option>
              ))}
            </select>
          </div>
        )}
        {currentProject && onSaveNextStep && (
          <NextStepRow
            nextActionText={currentProject.nextActionText}
            nextActionDate={currentProject.nextActionDate}
            nextActionType={currentProject.nextActionType}
            onSave={onSaveNextStep}
          />
        )}
        {isConsult && consultation ? (
          <>
            {consultation.photos.length > 0 && <SessionPhotos photos={consultation.photos} onChange={() => {}} allowDelete={false} readOnly />}
            <ViewField label="Место" value={consultation.area} />
            <ViewField label="Общие заметки" value={consultation.generalNotes} />
            <ViewField label="Чувство / ощущение" value={consultation.feeling} />
            <ViewField label="Источники вдохновения" value={consultation.inspirationSources} />
            <ViewField label="Креатив" value={consultation.creative} />
            <ViewField label="Техника и стиль" value={consultation.style} />
            <ViewField label="Итог" value={consultation.outcome} />
            {urgency && <ViewField label="Срочность" value={`${urgency.emoji} ${urgency.label}`} />}
            {consultation.status === 'converted' ? (
              <div
                onClick={onOpenConvertedSession}
                role={onOpenConvertedSession ? 'button' : undefined}
                style={{
                  textAlign: 'center',
                  padding: '9px 12px',
                  border: '1px solid rgba(var(--gold-rgb),0.15)',
                  borderRadius: 2,
                  cursor: onOpenConvertedSession ? 'pointer' : 'default',
                  color: COLORS.textFaint,
                  fontSize: fs(12),
                  letterSpacing: '1px',
                  textTransform: 'uppercase',
                  fontStyle: 'italic',
                }}
              >
                Переведена в сессию{onOpenConvertedSession ? ' →' : ''}
              </div>
            ) : (
              onConvertToSession &&
              !consultation.cancelled && (
                <div
                  onClick={onConvertToSession}
                  role="button"
                  style={{
                    textAlign: 'center',
                    padding: '9px 12px',
                    border: '1px solid rgba(var(--gold-rgb),0.3)',
                    borderRadius: 2,
                    cursor: 'pointer',
                    color: COLORS.gold,
                    fontSize: fs(12),
                    letterSpacing: '1px',
                    textTransform: 'uppercase',
                    fontStyle: 'italic',
                  }}
                >
                  Перевести в сессию →
                </div>
              )
            )}
            {/* «Назначить следующую консультацию» — независимо от статуса
                конвертации выше: консультация никогда не заменяется другой
                (см. Consultation.previousConsultationId). Скрыто только для
                отменённой — продолжать нечего. */}
            {!consultation.cancelled &&
              (onOpenNextConsultation ? (
                <div
                  onClick={onOpenNextConsultation}
                  role="button"
                  style={{
                    textAlign: 'center',
                    padding: '9px 12px',
                    border: '1px solid rgba(var(--gold-rgb),0.15)',
                    borderRadius: 2,
                    cursor: 'pointer',
                    color: COLORS.textFaint,
                    fontSize: fs(12),
                    letterSpacing: '1px',
                    textTransform: 'uppercase',
                    fontStyle: 'italic',
                  }}
                >
                  Следующая консультация →
                </div>
              ) : (
                onChainNextConsultation && (
                  <div
                    onClick={onChainNextConsultation}
                    role="button"
                    style={{
                      textAlign: 'center',
                      padding: '9px 12px',
                      border: '1px solid rgba(var(--gold-rgb),0.3)',
                      borderRadius: 2,
                      cursor: 'pointer',
                      color: COLORS.gold,
                      fontSize: fs(12),
                      letterSpacing: '1px',
                      textTransform: 'uppercase',
                      fontStyle: 'italic',
                    }}
                  >
                    Назначить следующую консультацию →
                  </div>
                )
              ))}
            {consultation.history.length > 0 && (
              <div>
                <div style={{ fontSize: fs(10), color: COLORS.textGhost, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 5 }}>
                  История изменений
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {consultation.history.map((entry) => (
                    <div key={entry.id} style={{ fontSize: fs(12), color: 'var(--text-soft)', display: 'flex', gap: 8 }}>
                      <span style={{ color: COLORS.textGhost, flexShrink: 0 }}>{formatDate(entry.date.slice(0, 10))}</span>
                      <span>{entry.note}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <ContentPanel
              clientId={clientId}
              sourceType="consultation"
              sourceId={consultation.id}
              entries={contentEntries}
              onOpenContent={onOpenContent}
            />
          </>
        ) : session ? (
          <>
            {session.photos.length > 0 && <SessionPhotos photos={session.photos} onChange={() => {}} allowDelete={false} readOnly />}
            <ViewField label="Статус" value={session.done ? 'Выполнена' : 'Запланирована'} />
            <ViewField label="Длительность" value={session.duration} />
            <ViewField label="Место" value={session.area} />
            <ViewField label="Стиль" value={session.style} />
            <ViewField label="Заметка" value={session.note} />
            <ViewField label="Краски" value={session.colors} />
            <ViewField label="Иглы" value={session.needles} />
            <ViewField label="Реакция кожи" value={session.skinReaction} />
            <ContentPanel
              clientId={clientId}
              sourceType="session"
              sourceId={session.id}
              entries={contentEntries}
              onOpenContent={onOpenContent}
            />
          </>
        ) : null}
      </div>
    </BottomSheet>
  );
}

// Компактная строка связи в карточке — название проекта, либо название/дату
// сессии, либо «Не привязан»/«Связь не найдена». Вся логика вычисления — в
// resolveContentEntryLink/isContentEntryLinked (src/lib/contentLink.ts).
export function ContentLinkStatus({
  entry,
  projects,
  clients,
  onOpenPicker,
}: {
  entry: ContentEntry;
  projects: Project[];
  clients: Client[];
  onOpenPicker: () => void;
}) {
  const resolved = resolveContentEntryLink(entry, projects, clients);
  const linked = isContentEntryLinked(entry);

  let label: string;
  if (resolved.kind === 'project') {
    label = resolved.project.title || 'Без названия';
  } else if (resolved.kind === 'session') {
    const dateLabel = ISO_DATE_RE.test(resolved.session.date) ? formatDate(resolved.session.date) : resolved.session.date;
    label = [resolved.session.name || 'Без названия', dateLabel].filter(Boolean).join(' · ');
  } else if (resolved.kind === 'missing') {
    label = 'Связь не найдена';
  } else {
    label = 'Не привязан';
  }

  return (
    <div className="content-link-status" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: '2px 0 8px' }}>
      <span
        style={{
          fontSize: fs(12),
          color: resolved.kind === 'none' || resolved.kind === 'missing' ? COLORS.textGhost : COLORS.textSecondary,
          fontStyle: resolved.kind === 'none' ? 'italic' : 'normal',
        }}
      >
        {label}
      </span>
      <span onClick={onOpenPicker} role="button" style={{ fontSize: fs(11), color: COLORS.gold, cursor: 'pointer', textDecoration: 'underline' }}>
        {linked ? 'Изменить привязку' : 'Привязать'}
      </span>
    </div>
  );
}

// Sheet «Сохранить в…» — открывается либо автоматически один раз после
// одобрения непривязанной записи, либо вручную из карточки
// («Привязать»/«Изменить привязку»). Один экран с двумя вкладками
// (Проект/Сессия) — без промежуточного шага выбора и без тупиковых пустых
// состояний: создание нового проекта/сессии всегда доступно рядом со
// списком и запускает уже существующие сценарии (onCreateProject/
// onCreateSession), а не копию формы внутри этого sheet. Вся
// группировка/фильтрация проектов и сессий — в src/lib/contentLink.ts
// (buildContentProjectOptions/buildContentSessionOptions), не меняется.
export function ContentLinkPickerSheet({
  open,
  entry,
  projects,
  clients,
  target,
  onTargetChange,
  onClose,
  onPick,
  onCreateProject,
  onCreateSession,
}: {
  open: boolean;
  entry: ContentEntry | null;
  projects: Project[];
  clients: Client[];
  target: 'project' | 'session';
  onTargetChange: (target: 'project' | 'session') => void;
  onClose: () => void;
  onPick: (link: ContentEntryLink | null) => void;
  onCreateProject: () => void;
  onCreateSession: () => void;
}) {
  const preferredClientId = entry?.clientId ?? null;
  const projectOptions = entry ? buildContentProjectOptions(projects, preferredClientId) : [];
  const sessionOptions = entry ? buildContentSessionOptions(clients, projects, preferredClientId) : [];

  const row = (key: string, title: string, subtitle: string | null, color: string, onClick: () => void) => (
    <div
      key={key}
      onClick={onClick}
      role="button"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '11px 13px',
        borderRadius: 2,
        cursor: 'pointer',
        border: '1px solid rgba(var(--gold-rgb),0.2)',
        background: 'rgba(var(--surface-rgb),0.018)',
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0, marginTop: 2 }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: fs(15), color: COLORS.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
        {subtitle && (
          <div style={{ fontSize: fs(11), color: COLORS.textGhost, fontStyle: 'italic', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {subtitle}
          </div>
        )}
      </span>
    </div>
  );

  const groupLabel = (text: string) => (
    <div style={{ fontSize: fs(10), color: COLORS.textGhost, letterSpacing: '1.5px', textTransform: 'uppercase', margin: '6px 0 0' }}>{text}</div>
  );

  const createLinkText = (label: string, onClick: () => void) => (
    <div
      onClick={onClick}
      role="button"
      style={{ textAlign: 'center', padding: '10px 0 2px', color: COLORS.gold, fontSize: fs(13), letterSpacing: '0.5px', cursor: 'pointer' }}
    >
      + {label}
    </div>
  );

  const createPrimaryButton = (label: string, onClick: () => void) => (
    <div className="inka-submit" onClick={onClick} style={{ ...SUBMIT_STYLE, marginTop: 4, textAlign: 'center' }}>
      {label}
    </div>
  );

  return (
    <BottomSheet open={open} heightPct={62}>
      <div style={{ padding: '16px 24px 14px', position: 'relative' }}>
        <SheetCloseButton onClose={onClose} />
        <div style={{ fontSize: fs(20), color: COLORS.textPrimary, fontWeight: 300, letterSpacing: '1px' }}>Сохранить в…</div>
        <SheetStarDivider />
      </div>

      <div style={{ padding: '0 24px', display: 'flex', gap: 8 }} role="tablist" aria-label="Тип привязки">
        <button
          type="button"
          role="tab"
          aria-selected={target === 'project'}
          className={`content-link-tab${target === 'project' ? ' is-active' : ''}`}
          onClick={() => onTargetChange('project')}
        >
          Проект
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={target === 'session'}
          className={`content-link-tab${target === 'session' ? ' is-active' : ''}`}
          onClick={() => onTargetChange('session')}
        >
          Сессия
        </button>
      </div>

      <div style={{ padding: '12px 24px 8px', display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '46vh', overflowY: 'auto' }}>
        {target === 'project' ? (
          projectOptions.length === 0 ? (
            <>
              <div style={{ fontSize: fs(13), color: COLORS.textGhost, fontStyle: 'italic' }}>Пока нет проектов.</div>
              {createPrimaryButton('Создать проект', onCreateProject)}
            </>
          ) : (
            <>
              {projectOptions.map((opt, i) => (
                <Fragment key={opt.project.id}>
                  {i > 0 && projectOptions[i - 1].isPreferredClient && !opt.isPreferredClient && groupLabel('Все проекты')}
                  {row(
                    opt.project.id,
                    opt.project.title || 'Без названия',
                    clientNameFor(clients, opt.project.clientId) ?? 'Мастерская',
                    opt.project.color,
                    () => {
                      onPick({ type: 'project', projectId: opt.project.id });
                      onClose();
                    },
                  )}
                </Fragment>
              ))}
              {createLinkText('Создать проект', onCreateProject)}
            </>
          )
        ) : sessionOptions.length === 0 ? (
          <>
            <div style={{ fontSize: fs(13), color: COLORS.textGhost, fontStyle: 'italic' }}>Пока нет сессий.</div>
            {createPrimaryButton('Создать сессию', onCreateSession)}
          </>
        ) : (
          <>
            {sessionOptions.map((opt, i) => {
              const dateLabel = ISO_DATE_RE.test(opt.session.date) ? formatDate(opt.session.date) : opt.session.date;
              const subtitle = [opt.project.title || 'Без названия', dateLabel].filter(Boolean).join(' · ');
              return (
                <Fragment key={opt.session.id}>
                  {i > 0 && sessionOptions[i - 1].isPreferredClient && !opt.isPreferredClient && groupLabel('Все сессии')}
                  {row(opt.session.id, opt.session.name || 'Без названия', subtitle, opt.project.color, () => {
                    onPick({ type: 'session', sessionId: opt.session.id });
                    onClose();
                  })}
                </Fragment>
              );
            })}
            {createLinkText('Создать сессию', onCreateSession)}
          </>
        )}
      </div>

      <div style={{ padding: '4px 24px calc(20px + env(safe-area-inset-bottom))' }}>
        <span
          onClick={() => {
            onPick(null);
            onClose();
          }}
          role="button"
          style={{ fontSize: fs(12), color: COLORS.textGhost, cursor: 'pointer', textDecoration: 'underline' }}
        >
          Оставить без привязки
        </span>
      </div>
    </BottomSheet>
  );
}

// ===================== CALENDAR SHEET =====================
// A month calendar opened from the «Ближайшая» badge on the client list.
// Days holding a session or consultation get a marker dot (gold = session,
// terracotta = consultation); tapping a day lists its entries below, and
// tapping an entry opens the read-only fullscreen viewer.
const WEEKDAYS_RU = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTHS_RU_FULL = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const CONSULT_MARK = '#B0413E';
// Открытые (ещё не забронированные) WALKIN/ONLINE-слоты от бота — тот же
// приглушённый шалфейный тон, что уже есть в палитре маркеров клиента.
// Экспортирован — тот же цвет используется в BotBookingsList (AdminDashboardScreen.tsx).
export { OPEN_SLOT_MARK } from '../../lib/botBookingFormat';

export function CalendarSheet({
  open,
  onClose,
  clients,
  initialDate,
  calendarSync,
  onOpenEntry,
  onCreateEvent,
}: {
  open: boolean;
  onClose: () => void;
  clients: Client[];
  initialDate: string;
  calendarSync: CalendarSyncSettings;
  onOpenEntry: (kind: 'session' | 'consultation', clientId: string, id: string) => void;
  // Starts the record-a-session-or-consultation walk for the selected day.
  onCreateEvent: (date: string) => void;
}) {
  const events = useMemo(() => collectCalendarEvents(clients), [clients]);

  // Открытые (ещё не забронированные) WALKIN/ONLINE-слоты от бота — только
  // для отображения (точка в сетке + строка в списке дня), read-only,
  // никак не привязаны к клиентам. Тянем заново при каждом открытии листа,
  // а не один раз при монтировании — лист не размонтируется между
  // открытиями (см. BottomSheet), данные могли устареть.
  const [openSlots, setOpenSlots] = useState<BotBooking[]>([]);
  useEffect(() => {
    if (!open || !syncActive(calendarSync)) return;
    fetchBotBookings(calendarSync)
      .then((all) => setOpenSlots(all.filter((b) => b.kind === 'open_slot')))
      .catch(() => {
        /* тихо — календарь и без этого полезен, свои записи он показывает всегда */
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const openSlotsByDay = useMemo(() => {
    const map = new Map<string, BotBooking[]>();
    for (const s of openSlots) {
      const key = botSlotDayKey(s.start);
      const arr = map.get(key) ?? [];
      arr.push(s);
      map.set(key, arr);
    }
    for (const arr of map.values()) arr.sort((a, b) => a.start.localeCompare(b.start));
    return map;
  }, [openSlots]);
  const parseISO = (iso: string) => {
    const [y, mo, d] = iso.split('-').map(Number);
    return { y, m: mo - 1, d };
  };
  const startFrom = () => {
    if (ISO_DATE_RE.test(initialDate)) return parseISO(initialDate);
    const t = new Date();
    return { y: t.getFullYear(), m: t.getMonth(), d: t.getDate() };
  };

  const [cursor, setCursor] = useState(() => {
    const s = startFrom();
    return { y: s.y, m: s.m };
  });
  const [selected, setSelected] = useState<string | null>(ISO_DATE_RE.test(initialDate) ? initialDate : null);

  // Re-centre on the initial month/day each time the sheet opens.
  useEffect(() => {
    if (!open) return;
    const s = startFrom();
    setCursor({ y: s.y, m: s.m });
    setSelected(ISO_DATE_RE.test(initialDate) ? initialDate : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialDate]);

  const today = todayISO();

  // 6-week grid, Monday-first.
  const firstOfMonth = new Date(cursor.y, cursor.m, 1);
  const leading = (firstOfMonth.getDay() + 6) % 7; // JS 0=Sun → Mon-first offset
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < leading; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${cursor.y}-${String(cursor.m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const shiftMonth = (delta: number) =>
    setCursor((c) => {
      const nm = c.m + delta;
      return { y: c.y + Math.floor(nm / 12), m: ((nm % 12) + 12) % 12 };
    });

  const selectedEvents = selected ? events.get(selected) ?? [] : [];
  const selectedOpenSlots = selected ? openSlotsByDay.get(selected) ?? [] : [];

  const navArrowStyle: React.CSSProperties = {
    width: 40,
    height: 40,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '50%',
    cursor: 'pointer',
    fontSize: fs(22),
    color: COLORS.gold,
    border: '1px solid rgba(var(--gold-rgb),0.2)',
    userSelect: 'none',
  };
  const legendStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontSize: fs(10.5),
    letterSpacing: '0.5px',
    textTransform: 'uppercase',
    color: COLORS.textFaint,
  };

  return (
    <BottomSheet open={open} heightPct={94}>
      <SheetCloseButton onClose={onClose} />
      <div style={{ padding: '8px 22px 48px' }}>
        <div style={{ textAlign: 'center', fontSize: fs(11), letterSpacing: '2.5px', textTransform: 'uppercase', color: COLORS.textGhost, marginBottom: 18 }}>
          Календарь
        </div>

        {/* Month navigation */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div onClick={() => shiftMonth(-1)} role="button" aria-label="Предыдущий месяц" style={navArrowStyle}>
            ‹
          </div>
          <div style={{ fontFamily: DROP_CAP_FONT, fontSize: fs(21), color: COLORS.gold, letterSpacing: '0.5px' }}>
            {MONTHS_RU_FULL[cursor.m]} {cursor.y}
          </div>
          <div onClick={() => shiftMonth(1)} role="button" aria-label="Следующий месяц" style={navArrowStyle}>
            ›
          </div>
        </div>

        {/* Weekday header */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', marginBottom: 6 }}>
          {WEEKDAYS_RU.map((w) => (
            <div key={w} style={{ textAlign: 'center', fontSize: fs(9.5), letterSpacing: '0.5px', textTransform: 'uppercase', color: COLORS.textTrace }}>
              {w}
            </div>
          ))}
        </div>

        {/* Day grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3 }}>
          {cells.map((iso, i) => {
            if (!iso) return <div key={i} />;
            const dayEvents = events.get(iso) ?? [];
            const hasSession = dayEvents.some((e) => e.kind === 'session');
            const hasConsult = dayEvents.some((e) => e.kind === 'consultation');
            const dayOpenSlots = openSlotsByDay.get(iso) ?? [];
            const hasOpenSlot = dayOpenSlots.length > 0;
            const isToday = iso === today;
            const isSelected = iso === selected;
            const dayNum = Number(iso.split('-')[2]);
            return (
              <div
                key={i}
                onClick={() => setSelected(iso)}
                role="button"
                style={{
                  aspectRatio: '1 / 1',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 3,
                  cursor: 'pointer',
                  border: isSelected
                    ? '1px solid rgba(var(--gold-rgb),0.6)'
                    : isToday
                    ? '1px solid rgba(var(--gold-rgb),0.28)'
                    : '1px solid transparent',
                  background: isSelected ? 'rgba(var(--gold-rgb),0.08)' : 'transparent',
                }}
              >
                <div style={{ fontSize: fs(13.5), color: dayEvents.length || hasOpenSlot ? COLORS.textPrimary : COLORS.textFaint, fontWeight: isToday ? 700 : 400 }}>
                  {dayNum}
                </div>
                <div style={{ display: 'flex', gap: 2, height: 5, marginTop: 2 }}>
                  {hasSession && <span style={{ width: 4, height: 4, borderRadius: '50%', background: COLORS.gold }} />}
                  {hasConsult && <span style={{ width: 4, height: 4, borderRadius: '50%', background: CONSULT_MARK }} />}
                  {hasOpenSlot && <span style={{ width: 4, height: 4, borderRadius: '50%', background: OPEN_SLOT_MARK }} />}
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 20, margin: '18px 0 6px', flexWrap: 'wrap' }}>
          <span style={legendStyle}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: COLORS.gold, display: 'inline-block' }} /> сессия
          </span>
          <span style={legendStyle}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: CONSULT_MARK, display: 'inline-block' }} /> консультация
          </span>
          {syncActive(calendarSync) && (
            <span style={legendStyle}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: OPEN_SLOT_MARK, display: 'inline-block' }} /> свободный слот бота
            </span>
          )}
        </div>

        <div style={{ height: 1, background: 'rgba(var(--gold-rgb),0.12)', margin: '14px 0 16px' }} />

        {/* Selected day's entries */}
        {selected ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: fs(12), letterSpacing: '1px', textTransform: 'uppercase', color: COLORS.textGhost }}>
                {formatDate(selected)}
              </div>
              <div
                onClick={() => onCreateEvent(selected)}
                role="button"
                aria-label="Создать событие"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  fontSize: fs(11),
                  color: COLORS.gold,
                  letterSpacing: '0.5px',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  padding: '5px 10px',
                  border: '1px solid rgba(var(--gold-rgb),0.35)',
                  borderRadius: 2,
                }}
              >
                <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
                  <line x1="7" y1="2" x2="7" y2="12" stroke="var(--gold)" strokeWidth="1.5" strokeLinecap="round" />
                  <line x1="2" y1="7" x2="12" y2="7" stroke="var(--gold)" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                Создать
              </div>
            </div>
            {selectedEvents.length === 0 && selectedOpenSlots.length === 0 ? (
              <div style={{ fontStyle: 'italic', color: COLORS.textFaint, fontSize: fs(13) }}>Нет записей на этот день</div>
            ) : (
              <>
                {selectedEvents.map((e) => (
                  <div
                    key={e.kind + e.id}
                    onClick={() => onOpenEntry(e.kind, e.clientId, e.id)}
                    className="inka-dashed"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '11px 13px',
                      marginBottom: 8,
                      borderRadius: 3,
                      cursor: 'pointer',
                      border: '1px solid rgba(var(--gold-rgb),0.15)',
                      opacity: e.done ? 0.55 : 1,
                    }}
                  >
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: e.kind === 'session' ? COLORS.gold : CONSULT_MARK, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: fs(14.5), color: COLORS.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.clientName}</div>
                      <div style={{ fontSize: fs(10.5), color: COLORS.textFaint, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        {e.kind === 'session' ? 'Сессия' : 'Консультация'}
                        {e.done ? ' · выполнено' : ''}
                      </div>
                    </div>
                    {e.time && <div style={{ fontSize: fs(13.5), color: COLORS.gold, fontVariantNumeric: 'tabular-nums' }}>{e.time}</div>}
                  </div>
                ))}
                {/* Открытые слоты бота — read-only справка, клиента тут нет,
                    поэтому не кликабельны и не смешаны со списком выше. */}
                {selectedOpenSlots.map((s) => (
                  <div
                    key={s.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '11px 13px',
                      marginBottom: 8,
                      borderRadius: 3,
                      border: `1px dashed ${OPEN_SLOT_MARK}66`,
                    }}
                  >
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: OPEN_SLOT_MARK, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: fs(14.5), color: COLORS.textPrimary }}>{tagLabel(s.tag)}</div>
                      <div style={{ fontSize: fs(10.5), color: OPEN_SLOT_MARK, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        свободный слот бота
                      </div>
                    </div>
                    <div style={{ fontSize: fs(13.5), color: COLORS.gold, fontVariantNumeric: 'tabular-nums' }}>
                      {new Date(s.start).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' })}
                    </div>
                  </div>
                ))}
              </>
            )}
          </>
        ) : (
          <div style={{ fontStyle: 'italic', color: COLORS.textFaint, fontSize: fs(13), textAlign: 'center' }}>Выберите день, чтобы увидеть записи</div>
        )}
      </div>
    </BottomSheet>
  );
}
