import { useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { COLORS } from '../TattoDiary';

// Вынесено из TattoDiary.tsx (PR 4 рефакторинга). Логика и разметка не
// менялись — только перенос в отдельный модуль.

export function BottomSheet({
  open,
  heightPct,
  children,
}: {
  open: boolean;
  heightPct: number;
  children: React.ReactNode;
}) {
  // Same sheet DOM node is reused across opens (e.g. add-session then
  // edit-session), so its scroll position otherwise carries over — reset to
  // top each time it opens.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) scrollRef.current?.scrollTo(0, 0);
  }, [open]);

  // Portaled straight to <body> — same escape hatch already used by the
  // content photo viewer/share sheet (see createPortal usages above). Sheets
  // are opened from buttons that can sit anywhere inside a screen's own
  // scrollable content (e.g. a "Привязать" link far down a long list); a
  // sheet positioned as a normal DOM descendant of that scrollable ancestor
  // is placed relative to the ancestor's scrolled CONTENT, not the visible
  // viewport, so opening it while scrolled down could put it far above or
  // below what's actually on screen. position:fixed anchored at the real
  // document root sidesteps that entirely.
  return createPortal(
    <div
      ref={scrollRef}
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: `${heightPct}%`,
        background: COLORS.sheet,
        borderRadius: '20px 20px 0 0',
        border: '1px solid rgba(var(--gold-rgb),0.18)',
        borderBottom: 'none',
        zIndex: 950,
        overflowY: 'auto',
        // Closed state must be reliably invisible AND must not enlarge this
        // screen's own scrollable area. A translateY(105%) alone only buys
        // ~5% of the sheet's own height as clearance (a few dozen px on a
        // full-height screen) — thin enough for ordinary desktop
        // browser-chrome/viewport-height differences to leave it peeking up
        // from the bottom of the page. Pushing it further via transform
        // (e.g. +100vh) "fixes" that but backfires badly: transform still
        // contributes to the ancestor's scrollable overflow, and every
        // closed BottomSheet across the whole app (there are dozens mounted
        // at once) would each add a full extra viewport's worth of
        // scrollable height, bloating the screen's scroll area and causing
        // real jank. visibility:hidden is what actually guarantees nothing
        // is painted or clickable while closed, independent of the exact
        // transform distance — the delayed transition below keeps it
        // visible for the full slide-down close animation, then hides it.
        transform: open ? 'translateY(0)' : 'translateY(105%)',
        visibility: open ? 'visible' : 'hidden',
        transition: open
          ? 'transform 0.42s cubic-bezier(0.25, 0.46, 0.45, 0.94), visibility 0s'
          : 'transform 0.42s cubic-bezier(0.25, 0.46, 0.45, 0.94), visibility 0s linear 0.42s',
        pointerEvents: open ? 'auto' : 'none',
      }}
    >
      <div style={{ width: 36, height: 3, background: 'rgba(var(--gold-rgb),0.2)', borderRadius: 2, margin: '14px auto 0' }} />
      {children}
    </div>,
    document.body,
  );
}

export function SheetCloseButton({ onClose }: { onClose: () => void }) {
  return (
    <div className="inka-close" onClick={onClose} style={{ position: 'absolute', top: 18, right: 24, cursor: 'pointer', opacity: 0.4 }}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <line x1="3" y1="3" x2="13" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="13" y1="3" x2="3" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </div>
  );
}

// Тот же карандаш, что и «править» в шапке карточки клиента (см.
// DetailScreen) — единый визуальный язык для «редактировать» по всему
// приложению, вместо разнобоя из текстовых кнопок. Сидит слева от крестика
// закрытия, в том же верхнем правом углу read-only просмотров (Timeline/
// ProjectViewSheet), а не отдельной кнопкой внизу листа.
export function SheetEditButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="inka-back" onClick={onClick} style={{ position: 'absolute', top: 17, right: 52, cursor: 'pointer', color: COLORS.gold, opacity: 0.85 }}>
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <path d="M11 2.5L13.5 5L5.5 13H3V10.5L11 2.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

// Sits in the same top-right corner as SheetCloseButton, same size — swapped
// in briefly after saving an edit (Session/Consultation) so the confirmation
// reads as "the close button turned into a checkmark" rather than an
// unrelated toast appearing elsewhere on the sheet.
export function SheetSavedCheck() {
  return (
    <div style={{ position: 'absolute', top: 18, right: 24 }}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M2.5 8.3L6 11.8L13.5 4.3" stroke="#5E8C4A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
