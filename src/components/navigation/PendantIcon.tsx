import { useId } from "react";

// A small round gold-pendant medallion — same jewellery family as the client
// tab pendants (gold-metal gradient, pavé-diamond halo, hue-independent
// facet shading over a currentColor-free stone), just circular instead of
// the tabs' diamond-cut silhouette, to match the NavFab's own round buttons
// and the round reference pendants. Sized to fill its own button almost
// edge to edge, so it sits fully inside the button's ambient glow halo
// rather than floating inside it with a gap. The gold rim stays narrow so
// the coloured stone — the actual destination marker — gets most of the
// medallion, cut into eight alternating facets rather than carrying a
// glyph. Each instance gets its own gradient/filter ids (via useId) so
// multiple copies can render on the same page without colliding.
export function PendantIcon({ color, size }: { color: string; size: number }) {
  const uid = useId();
  const gold = `pendant-gold-${uid}`;
  const pave = `pendant-pave-${uid}`;
  const hi = `pendant-hi-${uid}`;
  const sh = `pendant-sh-${uid}`;
  const shadow = `pendant-shadow-${uid}`;

  const cx = 32;
  const cy = 32;
  const paveAngles = [0, 45, 90, 135, 180, 225, 270, 315];
  const stoneR = 21.6;
  // Eight brilliant-cut facets radiating from the centre, alternating a
  // light and a dark overlay so the cut reads clearly regardless of the
  // stone's own hue.
  const facetAngles = [0, 45, 90, 135, 180, 225, 270, 315, 360];
  const facetPoints = facetAngles.map((deg) => {
    const rad = (deg * Math.PI) / 180;
    return [cx + stoneR * Math.sin(rad), cy - stoneR * Math.cos(rad)];
  });

  return (
    <span style={{ position: "relative", display: "block", width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" style={{ display: "block" }}>
        <defs>
          <linearGradient id={gold} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#F7E4B8" />
            <stop offset=".35" stopColor="#D8A94A" />
            <stop offset=".7" stopColor="#A3722A" />
            <stop offset="1" stopColor="#6E4A16" />
          </linearGradient>
          <radialGradient id={pave} cx=".35" cy=".3" r=".8">
            <stop offset="0" stopColor="#FFFFFF" />
            <stop offset=".55" stopColor="#EFF4F8" />
            <stop offset="1" stopColor="#C3CFD8" />
          </radialGradient>
          <radialGradient id={hi} cx=".32" cy=".28" r=".78">
            <stop offset="0" stopColor="#FFFFFF" stopOpacity=".5" />
            <stop offset=".6" stopColor="#FFFFFF" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={sh} cx=".5" cy=".5" r=".62">
            <stop offset="0" stopColor="#000000" stopOpacity="0" />
            <stop offset=".7" stopColor="#000000" stopOpacity="0" />
            <stop offset="1" stopColor="#000000" stopOpacity=".38" />
          </radialGradient>
          <filter id={shadow} x="-40%" y="-30%" width="180%" height="170%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="1.1" result="blur" />
            <feOffset in="blur" dy=".8" result="off" />
            <feComponentTransfer in="off" result="cast">
              <feFuncA type="linear" slope=".38" />
            </feComponentTransfer>
            <feMerge>
              <feMergeNode in="cast" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g filter={`url(#${shadow})`}>
          {/* Narrow gold rim + pavé halo + a thin cream bezel line, leaving
              most of the medallion to the stone. */}
          <circle cx={cx} cy={cy} r="29" fill={`url(#${gold})`} stroke="#5A3B10" strokeWidth="1.1" />
          {paveAngles.map((deg) => {
            const rad = (deg * Math.PI) / 180;
            const r = deg % 90 === 0 ? 26.6 : 25.7;
            return (
              <circle
                key={deg}
                cx={cx + r * Math.sin(rad)}
                cy={cy - r * Math.cos(rad)}
                r={deg % 90 === 0 ? 2.15 : 1.85}
                fill={`url(#${pave})`}
                stroke="#8B98A4"
                strokeWidth=".3"
              />
            );
          })}
          <circle cx={cx} cy={cy} r="23.2" fill="none" stroke={`url(#${gold})`} strokeWidth="1.1" />

          {/* Stone, cut into eight alternating facets. */}
          <circle cx={cx} cy={cy} r={stoneR + 0.8} fill="#241608" />
          <circle cx={cx} cy={cy} r={stoneR} fill={color} stroke="#000000" strokeOpacity=".32" strokeWidth=".6" />
          <circle cx={cx} cy={cy} r={stoneR} fill={`url(#${hi})`} />
          <circle cx={cx} cy={cy} r={stoneR} fill={`url(#${sh})`} />
          {facetPoints.slice(0, -1).map(([x1, y1], i) => {
            const [x2, y2] = facetPoints[i + 1];
            const light = i % 2 === 0;
            return (
              <polygon
                key={i}
                points={`${cx},${cy} ${x1},${y1} ${x2},${y2}`}
                fill={light ? "#FFFFFF" : "#000000"}
                opacity={light ? 0.16 : 0.22}
              />
            );
          })}
          {facetPoints.slice(0, -1).map(([x, y], i) => (
            <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#FFFFFF" strokeWidth=".45" strokeOpacity=".4" />
          ))}
          <circle cx={cx} cy={cy} r={stoneR} fill="none" stroke="#FFFFFF" strokeOpacity=".3" strokeWidth=".5" />
          <path d="M23.5 22.2 29 28" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" opacity=".65" />
        </g>
      </svg>
    </span>
  );
}
