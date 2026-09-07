import { useId } from 'react';
import './ProgressRail.css';

// Same beveled-metal tube and gold gradient stops as PendantRail (the chain
// pendants hang from — see ClientCardTabBar.tsx) — reused here as a fillable
// progress bar for Админка's project timeline instead of a flat 2px div.
// The unfilled track is the same gradient at low opacity (dim, unlit metal);
// the filled portion is the full-bright tube plus the same two-layer glow
// drop-shadow the rest of the app puts on lit gold edges.
export function ProgressRail({ progress }: { progress: number }) {
  const rawId = useId().replace(/:/g, '');
  const trackId = `progress-rail-track-${rawId}`;
  const fillId = `progress-rail-fill-${rawId}`;
  const pct = Math.max(0, Math.min(1, progress)) * 1000;

  return (
    <svg aria-hidden="true" className="progress-rail" viewBox="0 0 1000 24" preserveAspectRatio="none">
      <defs>
        <linearGradient id={trackId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--two-pendant-ray-highlight)" stopOpacity=".3" />
          <stop offset=".5" stopColor="var(--two-pendant-ray-mid)" stopOpacity=".38" />
          <stop offset="1" stopColor="var(--two-pendant-ray-shadow)" stopOpacity=".5" />
        </linearGradient>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--two-pendant-ray-highlight)" />
          <stop offset=".28" stopColor="var(--two-pendant-ray-light)" />
          <stop offset=".6" stopColor="var(--two-pendant-ray-mid)" />
          <stop offset=".82" stopColor="var(--two-pendant-ray-recess)" />
          <stop offset="1" stopColor="var(--two-pendant-ray-shadow)" />
        </linearGradient>
      </defs>
      {/* A real tube (8 of 24 viewBox units — was a 1-unit hairline) worth
          filling, with rounded caps reading as a pill cross-section. */}
      <path
        d="M4 8 L996 8 A4 4 0 0 1 996 16 L4 16 A4 4 0 0 1 4 8 Z"
        fill={`url(#${trackId})`}
        stroke="var(--two-pendant-ray-shadow)"
        strokeOpacity=".45"
        strokeWidth=".6"
      />
      {pct > 4 && (
        <path
          className="progress-rail__fill"
          d={`M4 8 L${pct} 8 L${pct} 16 L4 16 A4 4 0 0 1 4 8 Z`}
          fill={`url(#${fillId})`}
        />
      )}
    </svg>
  );
}
