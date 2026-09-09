import { COLORS } from './designTokens';
import { dateParts, todayISO } from '../../utils/dates';

// Tear-off calendar square — weekday/day/month of TODAY, doubling as the
// «Открыть календарь» launcher. Always shows today's date (was the soonest
// upcoming session/consultation's date before — confusing next to a «today»
// -looking icon, and it vanished entirely once there was nothing upcoming).
// Placed by the caller inside its own screen header, in normal document
// flow — it scrolls away with the rest of that header rather than staying
// pinned on screen. Each screen decides for itself whether to show it (see
// callers) — Личный кабинет doesn't, since «сегодня» isn't relevant there.
// `size` scales the whole badge — every caller now passes 28 (was a fixed
// 42), a third smaller so the corner tag stops competing with the icon row
// next to it. Font sizes below are expressed relative to the original
// 42px reference so the glyphs keep the same proportions at any size.
export function TodayDateBadge({ onOpen, size = 42 }: { onOpen: () => void; size?: number }) {
  const parts = dateParts(todayISO());
  if (!parts) return null;
  const scale = size / 42;
  return (
    <div
      onClick={onOpen}
      role="button"
      aria-label="Открыть календарь"
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: 1,
        cursor: 'pointer',
        borderRadius: 4,
        border: '1px solid rgba(var(--gold-rgb),0.3)',
        background: 'rgba(var(--gold-rgb),0.04)',
        // Same soft gold halo as the client card gem corner (see GemCorner
        // in ui/Stripes.tsx) — ties the calendar badge visually to the
        // card family instead of sitting flat next to it.
        boxShadow: '0 0 14px 2px rgba(var(--gold-rgb),0.35), inset 0 0 5px rgba(var(--gold-rgb),0.15)',
      }}
    >
      <div style={{ fontSize: 7 * scale, letterSpacing: '0.5px', textTransform: 'uppercase', color: COLORS.gold, marginBottom: 2 * scale }}>{parts.weekday}</div>
      <div style={{ fontSize: 15 * scale, fontWeight: 600, color: COLORS.textPrimary }}>{parts.day}</div>
      <div style={{ fontSize: 7 * scale, letterSpacing: '0.5px', textTransform: 'uppercase', color: COLORS.textGhost, marginTop: 2 * scale }}>{parts.month}</div>
    </div>
  );
}
