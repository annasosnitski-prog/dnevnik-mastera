import { useId, type CSSProperties } from 'react';
import './ProgressRail.css';

// Same beveled-metal tube and gold gradient stops as PendantRail (the chain
// pendants hang from — see ClientCardTabBar.tsx) — reused here as a fillable
// progress bar for Админка's project timeline instead of a flat 2px div.
// The unfilled track is the same gradient at low opacity (dim, unlit metal);
// the filled portion is the full-bright tube plus the same two-layer glow
// drop-shadow the rest of the app puts on lit gold edges.

// Бусина-кольцо на рельсе: «дутый» золотой обруч, сквозь который проходит
// стеклянная трубка. Ближняя половина обруча (левая дуга) лежит ПЕРЕД
// трубкой, дальняя (правая) — ПОЗАДИ неё, отсюда ощущение, что кольцо
// надето на рельсу, а не нарисовано поверх плоским кружком.
//  - actual — факт: полный блеск и свечение;
//  - committed — обещание: тот же обруч без свечения;
//  - forecast — прогноз: тусклый, тоньше.
export type RailBeadKind = 'actual' | 'committed' | 'forecast';
export type RailBead = { at: number; kind: RailBeadKind; pulse?: boolean };

const BEAD_STROKE: Record<RailBeadKind, number> = { actual: 5, committed: 4.4, forecast: 3.6 };

function BeadHalf({ half, kind, gradId }: { half: 'back' | 'front'; kind: RailBeadKind; gradId: string }) {
  // Правая дуга (дальняя) — сверху вниз через правый край; левая (ближняя) —
  // снизу вверх через левый.
  const d = half === 'back' ? 'M8 3 A6 11 0 0 1 8 25' : 'M8 25 A6 11 0 0 1 8 3';
  return (
    <svg aria-hidden="true" viewBox="0 0 16 28" className="progress-rail__bead-svg">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--two-pendant-ray-highlight)" />
          <stop offset=".3" stopColor="var(--two-pendant-ray-light)" />
          <stop offset=".62" stopColor="var(--two-pendant-ray-mid)" />
          <stop offset="1" stopColor="var(--two-pendant-ray-shadow)" />
        </linearGradient>
      </defs>
      <path d={d} fill="none" stroke={`url(#${gradId})`} strokeWidth={BEAD_STROKE[kind]} strokeLinecap="round" />
      {half === 'front' && (
        <path d="M5.2 11 A6 11 0 0 1 8 5" fill="none" stroke="var(--two-pendant-ray-highlight)" strokeOpacity=".7" strokeWidth=".9" strokeLinecap="round" />
      )}
    </svg>
  );
}

export function ProgressRail({ progress, beads = [] }: { progress: number; beads?: RailBead[] }) {
  const rawId = useId().replace(/:/g, '');
  const trackId = `progress-rail-track-${rawId}`;
  const fillId = `progress-rail-fill-${rawId}`;
  const pct = Math.max(0, Math.min(1, progress)) * 1000;

  const beadStyle = (b: RailBead): CSSProperties => ({ left: `${b.at}%` });
  const beadClass = (b: RailBead, layer: 'back' | 'front') =>
    `progress-rail__bead progress-rail__bead--${b.kind} progress-rail__bead--${layer}${b.pulse ? ' progress-rail__bead--pulse' : ''}`;

  return (
    <div className="progress-rail-wrap">
      {beads.map((b, i) => (
        <span key={`back-${i}`} className={beadClass(b, 'back')} style={beadStyle(b)}>
          <BeadHalf half="back" kind={b.kind} gradId={`${trackId}-bb${i}`} />
        </span>
      ))}
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
      {beads.map((b, i) => (
        <span key={`front-${i}`} className={beadClass(b, 'front')} style={beadStyle(b)}>
          <BeadHalf half="front" kind={b.kind} gradId={`${trackId}-bf${i}`} />
        </span>
      ))}
    </div>
  );
}
