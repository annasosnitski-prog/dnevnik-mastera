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
    <svg aria-hidden="true" className="progress-rail" viewBox="0 0 1000 12" preserveAspectRatio="none">
      <defs>
        <linearGradient id={trackId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--two-pendant-ray-highlight)" stopOpacity=".16" />
          <stop offset=".5" stopColor="var(--two-pendant-ray-mid)" stopOpacity=".2" />
          <stop offset="1" stopColor="var(--two-pendant-ray-shadow)" stopOpacity=".28" />
        </linearGradient>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--two-pendant-ray-highlight)" />
          <stop offset=".28" stopColor="var(--two-pendant-ray-light)" />
          <stop offset=".6" stopColor="var(--two-pendant-ray-mid)" />
          <stop offset=".82" stopColor="var(--two-pendant-ray-recess)" />
          <stop offset="1" stopColor="var(--two-pendant-ray-shadow)" />
        </linearGradient>
      </defs>
      <path d="M0 5.5 L0 6.5 L1000 6.5 L1000 5.5 Z" fill={`url(#${trackId})`} />
      {pct > 0 && (
        <path className="progress-rail__fill" d={`M0 5.5 L0 6.5 L${pct} 6.5 L${pct} 5.5 Z`} fill={`url(#${fillId})`} />
      )}
    </svg>
  );
}
