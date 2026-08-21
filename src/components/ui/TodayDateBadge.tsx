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
export function TodayDateBadge({ onOpen }: { onOpen: () => void }) {
  const parts = dateParts(todayISO());
  if (!parts) return null;
  return (
    <div
      onClick={onOpen}
      role="button"
      aria-label="Открыть календарь"
      style={{
        width: 42,
        height: 42,
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
      }}
    >
      <div style={{ fontSize: 7, letterSpacing: '0.5px', textTransform: 'uppercase', color: COLORS.gold, marginBottom: 2 }}>{parts.weekday}</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: COLORS.textPrimary }}>{parts.day}</div>
      <div style={{ fontSize: 7, letterSpacing: '0.5px', textTransform: 'uppercase', color: COLORS.textGhost, marginTop: 2 }}>{parts.month}</div>
    </div>
  );
}
