import { useId } from 'react';
import './ProgressRail.css';

export interface ProgressRailMilestone {
  key: string;
  // 0..1 position along the tube.
  position: number;
  // Ring lights up gold once the milestone itself has been reached.
  reached: boolean;
}

// A glass tube banded by gold rings at each milestone (like a mana potion —
// the reference was literally "green Sims diamond, tube of glowing liquid,
// gold holder rings that light up gold the moment you reach them"). The
// glass itself and its gold rings reuse the same --two-pendant-ray-* gold
// gradient stops as PendantRail (the chain pendants hang from — see
// ClientCardTabBar.tsx), so the metal reads as the same material system;
// only the liquid is new (an emerald-green fill with its own glow, standing
// in for "mana").
export function ProgressRail({ progress, milestones = [] }: { progress: number; milestones?: ProgressRailMilestone[] }) {
  const rawId = useId().replace(/:/g, '');
  const glassId = `progress-rail-glass-${rawId}`;
  const liquidId = `progress-rail-liquid-${rawId}`;
  const ringLitId = `progress-rail-ring-lit-${rawId}`;
  const ringDimId = `progress-rail-ring-dim-${rawId}`;
  const pct = Math.max(0, Math.min(1, progress)) * 1000;

  return (
    <svg aria-hidden="true" className="progress-rail" viewBox="0 0 1000 28" preserveAspectRatio="none">
      <defs>
        {/* Empty glass — a cool, near-neutral translucent gradient with a
            highlight streak down one side, not the warm gold of the metal. */}
        <linearGradient id={glassId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#EAF2F5" stopOpacity=".22" />
          <stop offset=".3" stopColor="#BFD3D8" stopOpacity=".1" />
          <stop offset=".7" stopColor="#5C6E72" stopOpacity=".16" />
          <stop offset="1" stopColor="#1A2224" stopOpacity=".3" />
        </linearGradient>
        {/* Glowing green liquid — the "mana" fill. */}
        <linearGradient id={liquidId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#D8FFEA" />
          <stop offset=".22" stopColor="#7CF5B2" />
          <stop offset=".55" stopColor="#2ED97F" />
          <stop offset=".8" stopColor="#0FA160" />
          <stop offset="1" stopColor="#0A5C3B" />
        </linearGradient>
        <linearGradient id={ringLitId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--two-pendant-ray-highlight)" />
          <stop offset=".3" stopColor="var(--two-pendant-ray-light)" />
          <stop offset=".65" stopColor="var(--two-pendant-ray-mid)" />
          <stop offset="1" stopColor="var(--two-pendant-ray-recess)" />
        </linearGradient>
        <linearGradient id={ringDimId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--two-pendant-ray-mid)" stopOpacity=".55" />
          <stop offset="1" stopColor="var(--two-pendant-ray-shadow)" stopOpacity=".75" />
        </linearGradient>
      </defs>

      {/* Glass tube. */}
      <rect x="4" y="9" width="992" height="10" rx="5" fill={`url(#${glassId})`} stroke="rgba(255,255,255,.3)" strokeWidth=".6" />

      {/* Liquid, clipped to the same rounded tube so it never pokes past the
          glass — the leading edge stays a flat vertical face (a meniscus),
          not rounded, since it isn't the tube's own end. */}
      {pct > 0 && (
        <clipPath id={`${liquidId}-clip`}>
          <rect x="4" y="9" width="992" height="10" rx="5" />
        </clipPath>
      )}
      {pct > 0 && (
        <g clipPath={`url(#${liquidId}-clip)`}>
          <rect className="progress-rail__liquid" x="4" y="9" width={Math.max(0, pct - 4)} height="10" fill={`url(#${liquidId})`} />
          {/* Surface glint at the liquid's leading edge. */}
          <rect x={Math.max(4, pct - 2.4)} y="9" width="1.6" height="10" fill="#EFFFF6" opacity=".55" />
        </g>
      )}

      {/* Gold holder rings — one per milestone, banding the glass like a
          bracelet. Lit gold the moment its own milestone is reached,
          independent of how far the liquid itself has risen past it. */}
      {milestones.map((m) => {
        const x = Math.max(0, Math.min(1, m.position)) * 1000;
        return (
          <rect
            key={m.key}
            className={m.reached ? 'progress-rail__ring progress-rail__ring--lit' : 'progress-rail__ring'}
            x={x - 6}
            y="3"
            width="12"
            height="22"
            rx="2.4"
            fill={`url(#${m.reached ? ringLitId : ringDimId})`}
            stroke={m.reached ? 'var(--two-pendant-ray-highlight)' : 'var(--two-pendant-ray-shadow)'}
            strokeOpacity={m.reached ? '.8' : '.5'}
            strokeWidth=".6"
          />
        );
      })}
    </svg>
  );
}
