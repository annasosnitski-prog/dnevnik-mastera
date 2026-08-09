import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type * as React from 'react';
import { createPortal } from 'react-dom';
import { PLATFORM_LABELS, type Client } from '../../domain/client';
import type { Project } from '../../domain/project';
import {
  healingReminderKey,
  healingReminderKeysForSession,
  overdueProjectSessionReminderKey,
  overdueReminderKey,
  projectReminderKey,
  soonProjectSessionReminderKey,
  soonReminderKey,
  staleProjectReminderKey,
} from '../../reminders/reminderKeys';
import type {
  HealingItem,
  HealingStage,
  OverdueItem,
  ProjectSessionReminderItem,
  StaleProjectItem,
  TaskReminderItem,
  UpcomingSoonItem,
} from '../../reminders/types';
import { healingReminderMessage, soonReminderMessage } from '../../lib/reminderMessages';
import { addHiddenBanner, removeHiddenBanner, type HiddenReminderBanner } from '../../reminders/hiddenReminderBanners';
import { formatDate } from '../../utils/dates';
import { COLORS, fs } from '../ui/designTokens';
import { buildVisibleReminderGroups, totalReminderCount, type ReminderGroupCounts } from './reminderGroups';

// Короткая подпись каждой стадии заживления на карточке — что именно
// спросить на этом заходе (см. HealingStage/HEALING_STAGES).
const HEALING_STAGE_LABELS: Record<HealingStage, string> = {
  day1: 'День после сеанса · самочувствие',
  day4: '4-й день · шелушение',
  day15: '15-й день · заживление',
  day30: 'Узнать про заживление',
};

// Copies text to the clipboard, showing a brief «Скопировано» confirmation —
// shared by every healing-reminder card (Задачи + Мастер both render one).
// Copies the auto-message, then opens a small dropdown of the client's
// contacts (phone + chat links) so the master can jump straight to
// whichever app they'll paste it into — same anchored-dropdown pattern as
// the note card's «⋮» actions menu below.
function CopyMessageButton({
  text,
  client,
  onOpenChange,
}: {
  text: string;
  client: Client;
  // Lets the parent SwipeDismissCard raise itself above later siblings while
  // this popover is open — see the `raised` doc comment on SwipeDismissCard.
  onOpenChange?: (open: boolean) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [showContacts, setShowContacts] = useState(false);
  const setContacts = (open: boolean) => {
    setShowContacts(open);
    onOpenChange?.(open);
  };
  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
    setContacts(true);
  };
  const chatLinks = client.chatLinks || [];
  const hasContacts = Boolean(client.phone) || chatLinks.length > 0;
  return (
    <div style={{ position: 'relative', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
      <div
        onClick={copy}
        role="button"
        aria-label="Скопировать сообщение"
        style={{
          fontSize: fs(11),
          color: COLORS.gold,
          border: '1px solid rgba(var(--gold-rgb),0.4)',
          borderRadius: 2,
          padding: '4px 9px',
          letterSpacing: '0.6px',
          textTransform: 'uppercase',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        {copied ? 'Скопировано' : 'Скопировать'}
      </div>
      {showContacts && (
        <>
          <div onClick={() => setContacts(false)} style={{ position: 'fixed', inset: 0, zIndex: 15 }} />
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              right: 0,
              width: 220,
              background: COLORS.sheet,
              border: '1px solid rgba(var(--gold-rgb),0.2)',
              borderRadius: 4,
              padding: 10,
              boxShadow: '0 10px 28px rgba(0,0,0,0.4)',
              zIndex: 17,
            }}
          >
            <div style={{ fontSize: fs(10), color: COLORS.textGhost, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 6 }}>
              Открыть у клиента
            </div>
            {client.phone && (
              <a
                href={`tel:${client.phone.replace(/[^\d+]/g, '')}`}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 2px', fontSize: fs(13), color: COLORS.textPrimary, textDecoration: 'none' }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: COLORS.gold, flexShrink: 0 }} />
                {client.phone}
              </a>
            )}
            {chatLinks.map((link) => (
              <a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 2px', fontSize: fs(13), color: COLORS.textPrimary, textDecoration: 'none' }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: COLORS.gold, flexShrink: 0 }} />
                {PLATFORM_LABELS[link.platform]}
              </a>
            ))}
            {!hasContacts && (
              <div style={{ fontSize: fs(12), color: COLORS.textFaint, fontStyle: 'italic', padding: '4px 2px' }}>
                Нет контактов — добавьте в карточке клиента
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
// «Напоминания» — shared by both the Задачи and Мастер screens. Two kinds of
// card: overdue (planned entry whose date has passed while still not marked
// done — reschedule or mark done) and healing check-ins (a done session,
// ≥30 days old, not yet ticked «Зажив» — copy the ready-made message and jump
// to the session to tick it once the healed photo's in). Renders nothing
// when both lists are empty, so callers can drop it in unconditionally.
// yyyy-mm-ddThh:mm:ss местного времени начала дня через `days` суток от
// текущего момента — момент, после которого отложенная карточка снова
// показывается (см. snoozeReminder). Начало дня, чтобы «до завтра» означало
// именно завтрашнее утро, а не +24 часа от текущей минуты.
function snoozeShowAfter(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

// Русское склонение «N дней/дня/день» для карточки застоя проекта (M4).
function daysWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'день';
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return 'дня';
  return 'дней';
}

// yyyy-mm-dd самого раннего дня, который можно выбрать в «Выбрать дату
// возврата», — завтра местного времени. Сегодня и прошлое исключены (см.
// требование «нельзя выбрать сегодня или прошлое») — используется и как
// `min` инпута, и как защитная проверка перед отправкой.
function tomorrowDateInputValue(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Начало местного дня выбранной даты, ISO — та же логика, что у
// snoozeShowAfter (день, а не +24 часа от текущего момента).
function localDayStartISO(dateValue: string): string {
  const d = new Date(`${dateValue}T00:00:00`);
  return d.toISOString();
}

// Компактное меню карточки напоминания («⋯»): ровно три пункта — отложить до
// завтра / выбрать дату возврата / скрыть. «Отложить на 3 дня» сюда
// намеренно не входит — это единственное действие свайпа (см.
// SwipeDismissCard ниже), а не пункт меню. Стоит на месте прежней кнопки
// закрытия, чтобы не громоздить кнопки на карточке. «Скрыть» относится
// только к текущему reminder-ключу — новое событие той же сущности получит
// другой ключ (дата/время в нём, см. reminderKeys.ts) и покажется снова.
//
// Оверлей и выпадашка рендерятся через createPortal в document.body: карточки
// напоминаний оборачиваются в SwipeDismissCard с transform, а position:fixed
// внутри transformed-предка позиционируется относительно него, а не вьюпорта.
// Портал в body (без transform) чинит это и заодно снимает вопросы с
// overflow:hidden карточек и их z-index. Вертикально: открываем под кнопкой,
// если снизу хватает места, иначе над ней; с отступом ≥6px от краёв вьюпорта.
const REMINDER_MENU_MARGIN = 6;
function ReminderMenuButton({
  onSnoozeTomorrow,
  onPickDate,
  onHide,
}: {
  onSnoozeTomorrow: () => void;
  // showAfter — начало местного дня выбранной даты (localDayStartISO).
  onPickDate: (showAfter: string) => void;
  onHide: () => void;
}) {
  const btnRef = useRef<HTMLSpanElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  // anchor — rect кнопки на момент открытия; coords — итоговое положение меню
  // (считается после замера высоты меню в useLayoutEffect, до отрисовки).
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null);
  // Второй экран меню — инлайн-выбор даты вместо трёх пунктов.
  const [pickingDate, setPickingDate] = useState(false);
  const minDate = tomorrowDateInputValue();
  const [dateValue, setDateValue] = useState(minDate);

  const openMenu = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      setCoords(null); // пересчитать заново для этого открытия
      setPickingDate(false);
      setDateValue(minDate);
      setAnchor(r);
    }
  };
  const close = () => {
    setAnchor(null);
    setPickingDate(false);
  };

  useLayoutEffect(() => {
    if (!anchor || !menuRef.current) return;
    const menu = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const right = Math.max(REMINDER_MENU_MARGIN, vw - anchor.right);
    // Под кнопкой, если помещается; иначе над; иначе прижать к нижней границе.
    let top = anchor.bottom + 4;
    if (top + menu.height > vh - REMINDER_MENU_MARGIN) {
      const above = anchor.top - 4 - menu.height;
      top = above >= REMINDER_MENU_MARGIN ? above : Math.max(REMINDER_MENU_MARGIN, vh - REMINDER_MENU_MARGIN - menu.height);
    }
    setCoords({ top, right });
    // pickingDate: второй экран другого размера — пересчитать позицию меню.
  }, [anchor, pickingDate]);

  const rowStyle: React.CSSProperties = {
    padding: '9px 14px',
    fontSize: fs(12.5),
    color: COLORS.textPrimary,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    letterSpacing: '0.3px',
  };
  const runAndClose = (action: () => void) => {
    close();
    action();
  };
  const submitDate = () => {
    if (!dateValue || dateValue < minDate) return; // защитная проверка помимо `min` инпута
    const showAfter = localDayStartISO(dateValue);
    close();
    onPickDate(showAfter);
  };
  return (
    <span ref={btnRef} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
      <span
        onClick={openMenu}
        role="button"
        aria-label="Действия с напоминанием"
        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', opacity: 0.55, padding: 2 }}
      >
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ color: COLORS.textFaint }}>
          <circle cx="8" cy="3" r="1.4" fill="currentColor" />
          <circle cx="8" cy="8" r="1.4" fill="currentColor" />
          <circle cx="8" cy="13" r="1.4" fill="currentColor" />
        </svg>
      </span>
      {anchor &&
        createPortal(
          <>
            {/* Клик мимо — закрыть меню. */}
            <div onClick={close} style={{ position: 'fixed', inset: 0, zIndex: 240 }} />
            <div
              ref={menuRef}
              style={{
                position: 'fixed',
                top: coords?.top ?? 0,
                right: coords?.right ?? 0,
                // Скрыто до замера (useLayoutEffect до отрисовки), чтобы не
                // мигнуть в неправильной позиции при первом кадре.
                visibility: coords ? 'visible' : 'hidden',
                zIndex: 241,
                background: COLORS.bg,
                border: '1px solid rgba(var(--gold-rgb),0.3)',
                borderRadius: 4,
                boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
                overflow: 'hidden',
                minWidth: 176,
              }}
            >
              {pickingDate ? (
                <div style={{ padding: '10px 12px', width: 200 }} onClick={(e) => e.stopPropagation()}>
                  <div style={{ fontSize: fs(11), color: COLORS.textGhost, marginBottom: 6, letterSpacing: '0.4px' }}>
                    Вернуть напоминание
                  </div>
                  <input
                    type="date"
                    min={minDate}
                    value={dateValue}
                    onChange={(e) => setDateValue(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      fontSize: fs(13),
                      background: COLORS.bg,
                      color: COLORS.textPrimary,
                      border: '1px solid rgba(var(--gold-rgb),0.3)',
                      borderRadius: 2,
                      boxSizing: 'border-box',
                    }}
                  />
                  <div
                    role="button"
                    onClick={submitDate}
                    style={{
                      marginTop: 8,
                      textAlign: 'center',
                      padding: '7px 0',
                      fontSize: fs(12),
                      color: COLORS.gold,
                      letterSpacing: '0.6px',
                      textTransform: 'uppercase',
                      cursor: 'pointer',
                      border: '1px solid rgba(var(--gold-rgb),0.35)',
                      borderRadius: 2,
                    }}
                  >
                    Готово
                  </div>
                </div>
              ) : (
                <>
                  <div role="button" style={rowStyle} onClick={() => runAndClose(onSnoozeTomorrow)}>
                    Отложить до завтра
                  </div>
                  <div
                    role="button"
                    style={{ ...rowStyle, borderTop: '1px solid rgba(var(--gold-rgb),0.12)' }}
                    onClick={() => setPickingDate(true)}
                  >
                    Выбрать дату возврата
                  </div>
                  <div
                    role="button"
                    style={{ ...rowStyle, borderTop: '1px solid rgba(var(--gold-rgb),0.12)', color: COLORS.textFaint }}
                    onClick={() => runAndClose(onHide)}
                  >
                    Скрыть это напоминание
                  </div>
                </>
              )}
            </div>
          </>,
          document.body,
        )}
    </span>
  );
}

// Wraps a reminder card so it can be swiped left/right, like a native
// notification. Drags with the finger while held; past the threshold it
// flies the rest of the way out and THEN runs the swipe action — the swipe
// gesture and the card's own «⋯» menu actions can trigger DIFFERENT outcomes
// (swiping hides the card, while the menu also offers snooze), which is why
// the completion action isn't fixed to one prop: swiping calls
// onSwipeComplete, the menu items call whatever action the render prop is
// invoked with, and both play the same fly-out animation either way.
function SwipeDismissCard({
  onSwipeComplete,
  revealLabel,
  raised,
  children,
}: {
  onSwipeComplete: () => void;
  // Label shown in a strip revealed behind the card as it's dragged,
  // signalling what the swipe will do (e.g. «Выполнено»). Omit for a plain
  // hide with no particular action to announce.
  revealLabel?: string;
  // The card's own `transform` (used for the drag offset, always set — even
  // translateX(0) at rest) creates a CSS stacking context, which traps any
  // z-index inside it: a later sibling card, being its own equally-ranked
  // stacking context, paints over this one regardless of an inner element's
  // z-index. Set `raised` while this card has its own popover open (e.g. the
  // overdue card's snooze menu) so it outranks later siblings for real.
  raised?: boolean;
  children: (flyOutThen: (action: () => void) => void) => React.ReactNode;
}) {
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [flyingOut, setFlyingOut] = useState<'left' | 'right' | null>(null);
  const startXRef = useRef(0);
  const draggingRef = useRef(false);
  // Distinguishes a tap (lets the card's own onClick — open the entry —
  // through) from a real swipe (past this many px, the gesture is a
  // dismiss attempt, not a tap, so the following synthetic «click» the
  // browser fires on pointer-up must be swallowed before it reaches the
  // card's onClick).
  const MOVE_THRESHOLD = 8;
  const movedRef = useRef(false);
  const SWIPE_THRESHOLD = 84;

  const flyOutThen = (action: () => void, direction: 'left' | 'right') => {
    setFlyingOut(direction);
    setTimeout(action, 200);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (flyingOut) return;
    startXRef.current = e.clientX;
    draggingRef.current = true;
    movedRef.current = false;
    setDragging(true);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const delta = e.clientX - startXRef.current;
    if (Math.abs(delta) > MOVE_THRESHOLD) movedRef.current = true;
    setDragX(delta);
  };
  const finishDrag = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
    setDragX((x) => {
      if (Math.abs(x) > SWIPE_THRESHOLD) {
        flyOutThen(onSwipeComplete, x < 0 ? 'left' : 'right');
      }
      return Math.abs(x) > SWIPE_THRESHOLD ? x : 0;
    });
  };
  // Capture phase, so a dragged gesture's trailing click never reaches the
  // card's own onClick (which would otherwise open the entry mid-swipe).
  const onClickCapture = (e: React.MouseEvent) => {
    if (movedRef.current) {
      e.stopPropagation();
      e.preventDefault();
      movedRef.current = false;
    }
  };

  const offset = flyingOut ? (flyingOut === 'left' ? -400 : 400) : dragX;
  return (
    <div style={{ position: 'relative' }}>
      {revealLabel && dragX !== 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 2,
            display: 'flex',
            alignItems: 'center',
            // The strip sits on the side being uncovered — opposite the
            // direction the card is sliding.
            justifyContent: dragX > 0 ? 'flex-start' : 'flex-end',
            padding: '0 16px',
            background: 'rgba(var(--gold-rgb),0.14)',
            color: COLORS.gold,
            fontSize: fs(12),
            letterSpacing: '0.6px',
            textTransform: 'uppercase',
          }}
        >
          {revealLabel}
        </div>
      )}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onClickCapture={onClickCapture}
        style={{
          position: 'relative',
          // z-index only matters here (on the element that actually has the
          // transform) — see the `raised` doc comment above.
          zIndex: raised ? 5 : undefined,
          transform: `translateX(${offset}px)`,
          opacity: flyingOut ? 0 : 1,
          transition: dragging ? 'none' : 'transform 0.2s ease, opacity 0.2s ease',
          touchAction: 'pan-y',
        }}
      >
        {children((action) => flyOutThen(action, 'right'))}
      </div>
    </div>
  );
}

// One overdue reminder card: name/date up top with the «⋯» menu (snooze /
// hide), two quick actions (Отменить / Перенести) in their own full-width row
// below. No tap-to-open on the card body itself — the only way to open the
// underlying session/consultation is the explicit «Перенести» action, so a
// stray tap on the card can't accidentally navigate away. Swipe (like every
// other reminder card) snoozes for 3 days — it never touches «Закрыть»-style
// removal, which is why that action doesn't exist here any more; hiding a
// card for good is menu-only («Скрыть это напоминание»).
function OverdueReminderCard({
  item,
  onReschedule,
  onHide,
  onSnooze,
  onCancel,
}: {
  item: OverdueItem;
  onReschedule: () => void;
  onHide: () => void;
  onSnooze: (showAfter: string) => void;
  onCancel: () => void;
}) {
  const chipStyle: React.CSSProperties = {
    fontSize: fs(11),
    color: COLORS.textFaint,
    border: '1px solid rgba(var(--gold-rgb),0.2)',
    borderRadius: 2,
    padding: '4px 9px',
    letterSpacing: '0.6px',
    textTransform: 'uppercase',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    flex: '1 1 auto',
    textAlign: 'center',
  };
  return (
    <SwipeDismissCard onSwipeComplete={() => onSnooze(snoozeShowAfter(3))} revealLabel="Отложить на 3 дня">
      {(flyOutThen) => (
        <div
          style={{
            padding: '9px 10px',
            borderRadius: 2,
            border: '1px solid rgba(224,102,90,0.35)',
            background: 'rgba(224,102,90,0.06)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: fs(13), color: COLORS.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {item.client.name || '—'}
              </div>
              <div style={{ fontSize: fs(11), color: 'var(--urgent)', marginTop: 2 }}>
                {item.kind === 'session' ? 'Сессия' : 'Консультация'} просрочена · {formatDate(item.date)}
              </div>
            </div>
            <ReminderMenuButton
              onSnoozeTomorrow={() => flyOutThen(() => onSnooze(snoozeShowAfter(1)))}
              onPickDate={(showAfter) => flyOutThen(() => onSnooze(showAfter))}
              onHide={() => flyOutThen(onHide)}
            />
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 9 }}>
            <div onClick={onCancel} role="button" aria-label="Отменить" style={chipStyle}>
              Отменить
            </div>
            <div
              onClick={onReschedule}
              role="button"
              aria-label="Перенести"
              style={{ ...chipStyle, color: COLORS.gold, border: '1px solid rgba(var(--gold-rgb),0.4)' }}
            >
              Перенести
            </div>
          </div>
        </div>
      )}
    </SwipeDismissCard>
  );
}
function ProjectSessionReminderCard({
  item,
  rule,
  onOpenProject,
  onHide,
  onSnooze,
}: {
  item: ProjectSessionReminderItem;
  rule: 'overdue' | 'soon';
  onOpenProject: () => void;
  onHide: () => void;
  onSnooze: (showAfter: string) => void;
}) {
  const isOverdue = rule === 'overdue';
  const accent = isOverdue ? 'var(--urgent)' : COLORS.gold;
  const chipStyle: React.CSSProperties = {
    fontSize: fs(11),
    color: COLORS.gold,
    border: '1px solid rgba(var(--gold-rgb),0.3)',
    borderRadius: 2,
    padding: '4px 9px',
    letterSpacing: '0.6px',
    textTransform: 'uppercase',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  };

  return (
    <SwipeDismissCard onSwipeComplete={() => onSnooze(snoozeShowAfter(3))} revealLabel="Отложить на 3 дня">
      {(flyOutThen) => (
        <div
          style={{
            padding: '9px 10px',
            borderRadius: 2,
            border: isOverdue ? '1px solid rgba(224,102,90,0.35)' : '1px solid rgba(var(--gold-rgb),0.2)',
            background: isOverdue ? 'rgba(224,102,90,0.06)' : 'rgba(var(--surface-rgb),0.018)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <div onClick={onOpenProject} style={{ minWidth: 0, cursor: 'pointer', flex: 1 }}>
              <div style={{ fontSize: fs(13), color: COLORS.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {item.project.title || 'Проект'}
              </div>
              <div style={{ fontSize: fs(11), color: COLORS.textGhost, marginTop: 2 }}>Сессия без клиента</div>
              <div style={{ fontSize: fs(11), color: accent, marginTop: 2 }}>
                {isOverdue ? 'Просрочена' : 'Скоро'} · {formatDate(item.date)}
                {item.time && ` · ${item.time}`}
              </div>
            </div>
            <ReminderMenuButton
              onSnoozeTomorrow={() => flyOutThen(() => onSnooze(snoozeShowAfter(1)))}
              onPickDate={(showAfter) => flyOutThen(() => onSnooze(showAfter))}
              onHide={() => flyOutThen(onHide)}
            />
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 9 }}>
            <div onClick={onOpenProject} role="button" aria-label="Открыть проект" style={chipStyle}>
              Открыть проект
            </div>
          </div>
        </div>
      )}
    </SwipeDismissCard>
  );
}

// Раскрываемая секция одной приоритетной группы (M5A) — заголовок с
// количеством, полноценная фокусируемая <button> (клавиатура работает
// «из коробки», aria-expanded для скринридеров), тонкий разделитель вместо
// отдельной рамки/фона вокруг каждой группы. Ничего не знает о конкретных
// напоминаниях — просто раскрывающийся контейнер для children, поэтому
// одна и та же секция обслуживает все пять групп. Сворачивание — чисто
// локальный React state, никогда не трогает onDismiss/onSnooze/onRestore
// содержимого: карточки внутри остаются полностью себе на уме, секция лишь
// решает, показывать их сейчас или нет.
//
// defaultOpen — только НАЧАЛЬНОЕ значение useState, применяется один раз
// при монтировании (React так и задуман). Но группа не обязана
// перемонтироваться, когда становится единственной непустой — сосед мог
// просто опустеть, а эта секция как была смонтирована, так и осталась.
// forceOpen — отдельный ДИНАМИЧЕСКИЙ признак «сейчас единственная непустая
// группа» (см. RemindersSection ниже), пересчитывается на каждый рендер и
// раскрывает уже смонтированную секцию через эффект, а не только на
// монтировании. effectiveOpen = forceOpen || open — форс никогда не
// перекрывает ручной выбор мастера тем, что «забывает» его: как только
// forceOpen снова станет false (появился второй сосед), open уже равен
// true (эффект его выставил), так что секция остаётся раскрытой, а не
// откатывается обратно в свёрнутое defaultOpen.
function ReminderGroupSection({
  title,
  count,
  defaultOpen,
  forceOpen,
  children,
}: {
  title: string;
  count: number;
  defaultOpen: boolean;
  forceOpen: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);
  const effectiveOpen = forceOpen || open;
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          // Пока группа единственная непустая, её нельзя свернуть обратно —
          // иначе мастер увидела бы пустой экран без единственного
          // источника внимания. Кнопка при этом остаётся обычной доступной
          // кнопкой (не disabled), просто её клик временно не переключает.
          if (!forceOpen) setOpen((o) => !o);
        }}
        aria-expanded={effectiveOpen}
        aria-disabled={forceOpen}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          padding: '5px 0',
          margin: 0,
          background: 'none',
          border: 'none',
          borderBottom: '1px solid rgba(var(--gold-rgb),0.14)',
          cursor: 'pointer',
          font: 'inherit',
          color: 'inherit',
          textAlign: 'left',
        }}
      >
        <span style={{ fontSize: fs(11), color: COLORS.textGhost, letterSpacing: '1.2px', textTransform: 'uppercase', fontWeight: 600 }}>
          {title} · {count}
        </span>
        <span
          aria-hidden="true"
          style={{
            fontSize: fs(10),
            color: COLORS.textFaint,
            transform: effectiveOpen ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.15s ease',
            flexShrink: 0,
          }}
        >
          ▾
        </span>
      </button>
      {effectiveOpen && <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>{children}</div>}
    </div>
  );
}

export function RemindersSection({
  overdue,
  healing,
  soon,
  overdueProjectSessions,
  soonProjectSessions,
  dueProjects,
  staleProjects,
  tasks,
  clients,
  onOpenProject,
  onOpenEntry,
  onDismiss,
  onSnooze,
  onRestore,
  onCancel,
  onCompleteTask,
  onOpenTask,
  onMarkHealed,
  onHideAllHealing,
}: {
  overdue: OverdueItem[];
  healing: HealingItem[];
  soon?: UpcomingSoonItem[];
  overdueProjectSessions?: ProjectSessionReminderItem[];
  soonProjectSessions?: ProjectSessionReminderItem[];
  dueProjects?: Project[];
  // Активные проекты без значимого движения (M4) — «мягкое» напоминание,
  // отдельное от dueProjects (там — конкретный просроченный next step).
  staleProjects?: StaleProjectItem[];
  tasks?: TaskReminderItem[];
  // Для подписи имени клиента на карточках задач — TaskReminderItem
  // намеренно хранит только clientId (доменный слой не знает о React),
  // имя резолвится здесь, в презентационном слое.
  clients?: Client[];
  onOpenProject?: (project: Project) => void;
  onOpenEntry: (clientId: string, itemId: string, kind: 'session' | 'consultation') => void;
  onDismiss: (key: string) => void;
  onSnooze: (key: string, showAfter: string) => void;
  // Обратное к onDismiss/onSnooze для одного ключа — приводит карточку в
  // исходное видимое состояние. Питает временный баннер «Вернуть» после
  // «Скрыть это напоминание» (см. hideReminder ниже).
  onRestore: (key: string) => void;
  onCancel: (clientId: string, itemId: string, kind: 'session' | 'consultation') => void;
  onCompleteTask?: (item: TaskReminderItem) => void;
  onOpenTask?: (item: TaskReminderItem) => void;
  // «Выполнено» на карточке заживления — сессия помечается healed, все
  // дальнейшие стадии для неё перестают появляться (см. healingReminders).
  onMarkHealed: (clientId: string, sessionId: string) => void;
  // «Не напоминать больше» — скрывает разом все возможные стадии заживления
  // этой сессии (не только видимую сейчас), см. healingReminderKeysForSession.
  onHideAllHealing: (sessionId: string) => void;
}) {
  const soonList = soon ?? [];
  const overdueProjectSessionList = overdueProjectSessions ?? [];
  const soonProjectSessionList = soonProjectSessions ?? [];
  const dueProjectsList = dueProjects ?? [];
  const staleProjectsList = staleProjects ?? [];
  const taskList = tasks ?? [];
  const clientById = new Map((clients ?? []).map((c) => [c.id, c]));
  // Клиентская задача подписывается именем клиента; личная задача мастера
  // (без клиента, scope 'master') — тем же словом, что уже использует
  // «Рабочая сводка» (M5B) для различения клиентских/личных заметок.
  const taskOwnerLabel = (it: TaskReminderItem): string =>
    it.scope === 'master' ? 'Личная задача' : clientById.get(it.clientId ?? '')?.name || '—';
  const overdueFeed: ({ source: 'client'; item: OverdueItem } | { source: 'project'; item: ProjectSessionReminderItem })[] = [
    ...overdue.map((item) => ({ source: 'client' as const, item })),
    ...overdueProjectSessionList.map((item) => ({ source: 'project' as const, item })),
  ].sort((a, b) => a.item.date.localeCompare(b.item.date));
  const soonFeed: ({ source: 'client'; item: UpcomingSoonItem } | { source: 'project'; item: ProjectSessionReminderItem })[] = [
    ...soonList.map((item) => ({ source: 'client' as const, item })),
    ...soonProjectSessionList.map((item) => ({ source: 'project' as const, item })),
  ].sort((a, b) => `${a.item.date}T${a.item.time}`.localeCompare(`${b.item.date}T${b.item.time}`));
  // Which card's CopyMessageButton contacts popover is open, if any — that
  // card gets `raised` so its popover isn't trapped behind a later sibling's
  // own stacking context (see SwipeDismissCard's `raised` doc comment).
  const [raisedKey, setRaisedKey] = useState<string | null>(null);
  // Временные баннеры «Напоминание скрыто · Вернуть» после «Скрыть это
  // напоминание» (одна карточка) или «Не напоминать больше» (все стадии
  // заживления одной сессии сразу — keys.length > 1) — сама скрытая сущность
  // не трогается, баннер лишь предлагает откатить состояние напоминания.
  // Список, а не один объект: скрыть можно несколько разных напоминаний
  // подряд (например, «Скрыть» на одной карточке и «Не напоминать больше»
  // на другой, до истечения таймера первого) — каждое скрытие получает свой
  // независимый баннер со своим id/таймером/keys, не перезаписывая соседние.
  const [hiddenBanners, setHiddenBanners] = useState<HiddenReminderBanner[]>([]);
  // Keyed by banner id (not a single ref) — every banner runs its own ~6s
  // timer independently, so one expiring never touches another's.
  const hiddenBannerTimeouts = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  useEffect(() => () => {
    hiddenBannerTimeouts.current.forEach((timeout) => clearTimeout(timeout));
    hiddenBannerTimeouts.current.clear();
  }, []);
  const dismissHiddenBanner = (id: string) => {
    const timeout = hiddenBannerTimeouts.current.get(id);
    if (timeout) clearTimeout(timeout);
    hiddenBannerTimeouts.current.delete(id);
    setHiddenBanners((banners) => removeHiddenBanner(banners, id));
  };
  const showHiddenBanner = (keys: string[]) => {
    const id = crypto.randomUUID();
    setHiddenBanners((banners) => addHiddenBanner(banners, id, keys, Date.now()));
    hiddenBannerTimeouts.current.set(
      id,
      setTimeout(() => dismissHiddenBanner(id), 6000),
    );
  };
  const hideReminder = (key: string) => {
    onDismiss(key);
    showHiddenBanner([key]);
  };
  const hideAllHealing = (sessionId: string) => {
    onHideAllHealing(sessionId);
    showHiddenBanner(healingReminderKeysForSession(sessionId));
  };
  // Restores exactly this banner's own keys and removes only this banner —
  // an unrelated banner shown before or after it is untouched.
  const restoreHiddenBanner = (id: string) => {
    const banner = hiddenBanners.find((b) => b.id === id);
    if (!banner) return;
    dismissHiddenBanner(id);
    banner.keys.forEach((k) => onRestore(k));
  };
  // Пять приоритетных групп (M5A) — никакой новой бизнес-логики, только
  // раскладка уже отфильтрованных видимых списков под фиксированные
  // заголовки. «Требует действия» объединяет overdueFeed (overdue +
  // overdueProjectSessions, уже смерженные и отсортированные по дате выше)
  // и dueProjectsList — оба ряда конкретных просрочек, ничего заново не
  // сортируется. Каждый список — счётчик своей же группы; staleProjects в
  // «Требует действия» не входит: у застывшего проекта нет конкретного
  // просроченного действия, только мягкий сигнал (см. reminderGroups.ts).
  const counts: ReminderGroupCounts = {
    action: overdueFeed.length + dueProjectsList.length,
    tasks: taskList.length,
    soon: soonFeed.length,
    healing: healing.length,
    stale: staleProjectsList.length,
  };
  const totalCount = totalReminderCount(counts);
  const visibleGroups = buildVisibleReminderGroups(counts);
  // Динамический признак (не только для монтирования, в отличие от
  // group.defaultOpen выше) — пересчитывается на каждый рендер, поэтому
  // раскрывает уже смонтированную секцию, когда сосед опустел, а не только
  // секцию, которая монтируется впервые уже единственной.
  const forceOpen = visibleGroups.length === 1;
  const groupContentById: Record<string, React.ReactNode> = {
    action: (
      <>
        {overdueFeed.map((entry) => {
          if (entry.source === 'client') {
            const it = entry.item;
            const key = overdueReminderKey(it);
            return (
              <OverdueReminderCard
                key={key}
                item={it}
                onReschedule={() => onOpenEntry(it.client.id, it.id, it.kind)}
                onHide={() => hideReminder(key)}
                onSnooze={(showAfter) => onSnooze(key, showAfter)}
                onCancel={() => onCancel(it.client.id, it.id, it.kind)}
              />
            );
          }
          const it = entry.item;
          const key = overdueProjectSessionReminderKey(it);
          return (
            <ProjectSessionReminderCard
              key={key}
              item={it}
              rule="overdue"
              onOpenProject={() => onOpenProject?.(it.project)}
              onHide={() => hideReminder(key)}
              onSnooze={(showAfter) => onSnooze(key, showAfter)}
            />
          );
        })}
        {dueProjectsList.map((p) => {
          const key = projectReminderKey(p);
          return (
            <SwipeDismissCard key={key} onSwipeComplete={() => onSnooze(key, snoozeShowAfter(3))} revealLabel="Отложить на 3 дня" raised={raisedKey === key}>
              {(flyOutThen) => (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    padding: '9px 10px',
                    borderRadius: 2,
                    border: '1px solid rgba(var(--gold-rgb),0.2)',
                    background: 'rgba(var(--surface-rgb),0.018)',
                  }}
                >
                  <div onClick={() => onOpenProject?.(p)} style={{ minWidth: 0, cursor: 'pointer', flex: 1 }}>
                    <div style={{ fontSize: fs(13), color: COLORS.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {p.title || 'Проект'}
                    </div>
                    <div style={{ fontSize: fs(11), color: COLORS.gold, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      Следующий шаг: {p.nextActionText || '—'}
                      {p.nextActionDate ? ` · ${formatDate(p.nextActionDate)}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <ReminderMenuButton
                      onSnoozeTomorrow={() => flyOutThen(() => onSnooze(key, snoozeShowAfter(1)))}
                      onPickDate={(showAfter) => flyOutThen(() => onSnooze(key, showAfter))}
                      onHide={() => flyOutThen(() => hideReminder(key))}
                    />
                  </div>
                </div>
              )}
            </SwipeDismissCard>
          );
        })}
      </>
    ),
    tasks: (
      <>
        {taskList.map((it) => {
          // Скрыть → reminder.id (с rule, hideReminder); отложить/свайп →
          // actionKey (без rule), чтобы откладывание пережило переход
          // due→overdue (см. reminderKeys) — свайп ключуется ИМЕННО им, не
          // dismissKey, иначе «отложить» на самом деле скрывало бы карточку
          // без возможности вернуться свежим напоминанием после overdue.
          const dismissKey = it.id;
          const snoozeKey = it.actionKey;
          const chipStyle: React.CSSProperties = {
            fontSize: fs(11),
            color: COLORS.textFaint,
            border: '1px solid rgba(var(--gold-rgb),0.2)',
            borderRadius: 2,
            padding: '4px 9px',
            letterSpacing: '0.6px',
            textTransform: 'uppercase',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          };
          return (
            <SwipeDismissCard
              key={it.id}
              onSwipeComplete={() => onSnooze(snoozeKey, snoozeShowAfter(3))}
              revealLabel="Отложить на 3 дня"
              raised={raisedKey === it.id}
            >
              {(flyOutThen) => (
                <div
                  style={{
                    padding: '9px 10px',
                    borderRadius: 2,
                    border: it.rule === 'task_overdue' ? '1px solid rgba(224,102,90,0.35)' : '1px solid rgba(var(--gold-rgb),0.2)',
                    background: it.rule === 'task_overdue' ? 'rgba(224,102,90,0.06)' : 'rgba(var(--surface-rgb),0.018)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <div onClick={() => onOpenTask?.(it)} style={{ minWidth: 0, cursor: 'pointer', flex: 1 }}>
                      <div style={{ fontSize: fs(13), color: COLORS.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {it.text || 'Задача'}
                      </div>
                      <div style={{ fontSize: fs(11), color: COLORS.textGhost, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {taskOwnerLabel(it)}
                      </div>
                      <div style={{ fontSize: fs(11), color: it.rule === 'task_overdue' ? 'var(--urgent)' : COLORS.gold, marginTop: 2 }}>
                        {it.rule === 'task_overdue' ? 'Просрочена' : 'Срок сегодня'} · {formatDate(it.dueDate)}
                      </div>
                    </div>
                    <ReminderMenuButton
                      onSnoozeTomorrow={() => flyOutThen(() => onSnooze(snoozeKey, snoozeShowAfter(1)))}
                      onPickDate={(showAfter) => flyOutThen(() => onSnooze(snoozeKey, showAfter))}
                      onHide={() => flyOutThen(() => hideReminder(dismissKey))}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 9 }}>
                    <div onClick={() => flyOutThen(() => onCompleteTask?.(it))} role="button" aria-label="Выполнить" style={chipStyle}>
                      Выполнить
                    </div>
                    <div
                      onClick={() => onOpenTask?.(it)}
                      role="button"
                      aria-label="Открыть"
                      style={{ ...chipStyle, color: COLORS.gold, border: '1px solid rgba(var(--gold-rgb),0.4)' }}
                    >
                      Открыть
                    </div>
                  </div>
                </div>
              )}
            </SwipeDismissCard>
          );
        })}
      </>
    ),
    soon: (
      <>
        {soonFeed.map((entry) => {
          if (entry.source === 'project') {
            const it = entry.item;
            const key = soonProjectSessionReminderKey(it);
            return (
              <ProjectSessionReminderCard
                key={key}
                item={it}
                rule="soon"
                onOpenProject={() => onOpenProject?.(it.project)}
                onHide={() => hideReminder(key)}
                onSnooze={(showAfter) => onSnooze(key, showAfter)}
              />
            );
          }
          const it = entry.item;
          const key = soonReminderKey(it);
          return (
            <SwipeDismissCard key={key} onSwipeComplete={() => onSnooze(key, snoozeShowAfter(3))} revealLabel="Отложить на 3 дня" raised={raisedKey === key}>
              {(flyOutThen) => (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    padding: '9px 10px',
                    borderRadius: 2,
                    border: '1px solid rgba(var(--gold-rgb),0.2)',
                    background: 'rgba(var(--surface-rgb),0.018)',
                  }}
                >
                  <div onClick={() => onOpenEntry(it.client.id, it.id, it.kind)} style={{ minWidth: 0, cursor: 'pointer', flex: 1 }}>
                    <div style={{ fontSize: fs(13), color: COLORS.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {it.client.name || '—'}
                    </div>
                    <div style={{ fontSize: fs(11), color: COLORS.gold, marginTop: 2 }}>
                      Скоро: {it.kind === 'session' ? 'сессия' : 'консультация'} · {formatDate(it.date)}
                      {it.time && ` · ${it.time}`}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <CopyMessageButton
                      text={soonReminderMessage(it)}
                      client={it.client}
                      onOpenChange={(open) => setRaisedKey(open ? key : null)}
                    />
                    <ReminderMenuButton
                      onSnoozeTomorrow={() => flyOutThen(() => onSnooze(key, snoozeShowAfter(1)))}
                      onPickDate={(showAfter) => flyOutThen(() => onSnooze(key, showAfter))}
                      onHide={() => flyOutThen(() => hideReminder(key))}
                    />
                  </div>
                </div>
              )}
            </SwipeDismissCard>
          );
        })}
      </>
    ),
    healing: (
      <>
        {healing.map((it) => {
          const key = healingReminderKey(it);
          const chipStyle: React.CSSProperties = {
            fontSize: fs(11),
            color: COLORS.textFaint,
            border: '1px solid rgba(var(--gold-rgb),0.2)',
            borderRadius: 2,
            padding: '4px 9px',
            letterSpacing: '0.6px',
            textTransform: 'uppercase',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            flex: '1 1 auto',
            textAlign: 'center',
          };
          return (
            <SwipeDismissCard key={key} onSwipeComplete={() => onSnooze(key, snoozeShowAfter(3))} revealLabel="Отложить на 3 дня" raised={raisedKey === key}>
              {(flyOutThen) => (
              <div
                style={{
                  padding: '9px 10px',
                  borderRadius: 2,
                  border: '1px solid rgba(var(--gold-rgb),0.2)',
                  background: 'rgba(var(--surface-rgb),0.018)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div onClick={() => onOpenEntry(it.client.id, it.sessionId, 'session')} style={{ minWidth: 0, cursor: 'pointer', flex: 1 }}>
                    <div style={{ fontSize: fs(13), color: COLORS.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {it.client.name || '—'}
                    </div>
                    <div style={{ fontSize: fs(11), color: COLORS.textGhost, marginTop: 2 }}>
                      {HEALING_STAGE_LABELS[it.stage]} · сессия {formatDate(it.date)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <CopyMessageButton
                      text={healingReminderMessage(it.client, it.stage)}
                      client={it.client}
                      onOpenChange={(open) => setRaisedKey(open ? key : null)}
                    />
                    <ReminderMenuButton
                      onSnoozeTomorrow={() => flyOutThen(() => onSnooze(key, snoozeShowAfter(1)))}
                      onPickDate={(showAfter) => flyOutThen(() => onSnooze(key, showAfter))}
                      onHide={() => flyOutThen(() => hideReminder(key))}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 9 }}>
                  {/* «Выполнено» = контроль заживления ЭТОЙ сессии закрыт
                      (session.healed) — НЕ «сообщение клиенту отправлено»,
                      отсюда явная подсказка в title. */}
                  <div
                    onClick={() => flyOutThen(() => onMarkHealed(it.client.id, it.sessionId))}
                    role="button"
                    aria-label="Выполнено"
                    title="Контроль заживления для этой сессии завершён — это не означает, что сообщение отправлено клиенту"
                    style={chipStyle}
                  >
                    Выполнено
                  </div>
                  <div
                    onClick={() => flyOutThen(() => hideAllHealing(it.sessionId))}
                    role="button"
                    aria-label="Не напоминать больше"
                    style={chipStyle}
                  >
                    Не напоминать больше
                  </div>
                </div>
              </div>
              )}
            </SwipeDismissCard>
          );
        })}
      </>
    ),
    stale: (
      <>
        {staleProjectsList.map((it) => {
          const key = staleProjectReminderKey(it);
          const { project: p } = it;
          return (
            <SwipeDismissCard key={key} onSwipeComplete={() => onSnooze(key, snoozeShowAfter(3))} revealLabel="Отложить на 3 дня" raised={raisedKey === key}>
              {(flyOutThen) => (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    padding: '9px 10px',
                    borderRadius: 2,
                    border: '1px solid rgba(var(--gold-rgb),0.2)',
                    background: 'rgba(var(--surface-rgb),0.018)',
                  }}
                >
                  <div onClick={() => onOpenProject?.(p)} style={{ minWidth: 0, cursor: 'pointer', flex: 1 }}>
                    <div style={{ fontSize: fs(13), color: COLORS.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {p.title || 'Проект'}
                    </div>
                    <div style={{ fontSize: fs(11), color: COLORS.textFaint, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      Давно не двигался · {it.daysSince} {daysWord(it.daysSince)} без активности
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <ReminderMenuButton
                      onSnoozeTomorrow={() => flyOutThen(() => onSnooze(key, snoozeShowAfter(1)))}
                      onPickDate={(showAfter) => flyOutThen(() => onSnooze(key, showAfter))}
                      onHide={() => flyOutThen(() => hideReminder(key))}
                    />
                  </div>
                </div>
              )}
            </SwipeDismissCard>
          );
        })}
      </>
    ),
  };
  return (
    <div>
      <div style={{ fontSize: fs(11), color: COLORS.textGhost, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 8 }}>
        Напоминания · {totalCount}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {hiddenBanners.map((banner) => (
          <div
            key={banner.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              padding: '8px 12px',
              borderRadius: 2,
              border: '1px solid rgba(var(--gold-rgb),0.3)',
              background: 'rgba(var(--gold-rgb),0.08)',
            }}
          >
            <span style={{ fontSize: fs(12), color: COLORS.textPrimary }}>Напоминание скрыто</span>
            <span
              onClick={() => restoreHiddenBanner(banner.id)}
              role="button"
              aria-label="Вернуть"
              style={{ fontSize: fs(11), color: COLORS.gold, letterSpacing: '0.6px', textTransform: 'uppercase', cursor: 'pointer', flexShrink: 0 }}
            >
              Вернуть
            </span>
          </div>
        ))}
        {visibleGroups.map((group) => (
          <ReminderGroupSection key={group.id} title={group.title} count={group.count} defaultOpen={group.defaultOpen} forceOpen={forceOpen}>
            {groupContentById[group.id]}
          </ReminderGroupSection>
        ))}
        {totalCount === 0 && hiddenBanners.length === 0 && (
          <div style={{ fontSize: fs(13), color: COLORS.textFaint, fontStyle: 'italic', padding: '8px 2px' }}>
            Сейчас ничего не требует внимания
          </div>
        )}
      </div>
    </div>
  );
}
