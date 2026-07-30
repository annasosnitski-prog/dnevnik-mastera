import { useId } from "react";

function point(cx: number, cy: number, deg: number, r: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [cx + r * Math.sin(rad), cy - r * Math.cos(rad)];
}

// A small round gold-pendant medallion — same jewellery family as the client
// tab pendants (gold-metal gradient, pavé-diamond halo, hue-independent
// facet shading over a currentColor-free stone), just circular instead of
// the tabs' diamond-cut silhouette, to match the NavFab's own round buttons
// and the round reference pendants. Sized to fill its own button almost
// edge to edge, so it sits fully inside the button's ambient glow halo
// rather than floating inside it with a gap. The gold rim stays narrow so
// the coloured stone — the actual destination marker — gets most of the
// medallion, cut like a real round-brilliant crown (two candidate patterns,
// picked via `cut`) rather than carrying a glyph. Each instance gets its
// own gradient/filter ids (via useId) so multiple copies can render on the
// same page without colliding.
export function PendantIcon({
  color,
  size,
  cut = "a",
}: {
  color: string;
  size: number;
  cut?: "a" | "b";
}) {
  const uid = useId();
  const gold = `pendant-gold-${uid}`;
  const pave = `pendant-pave-${uid}`;
  const hi = `pendant-hi-${uid}`;
  const sh = `pendant-sh-${uid}`;
  const shadow = `pendant-shadow-${uid}`;

  const cx = 32;
  const cy = 32;
  const paveAngles = [0, 45, 90, 135, 180, 225, 270, 315];
  const stoneR = 23.5;

  // Round-brilliant crown facets: a table octagon in the centre, star
  // facets fanning out from each table vertex to its two neighbouring
  // girdle points. Pattern B nests a second, smaller star inside that same
  // octagon for a denser cut.
  const girdle = paveAngles.map((deg) => point(cx, cy, deg, stoneR));
  const tableAngles = [22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5];
  const table = tableAngles.map((deg) => point(cx, cy, deg, stoneR * 0.4));
  const facetLines: [number, number, number, number][] = [];
  table.forEach(([tx, ty], i) => {
    const [gx1, gy1] = girdle[i];
    const [gx2, gy2] = girdle[(i + 1) % 8];
    facetLines.push([tx, ty, gx1, gy1], [tx, ty, gx2, gy2]);
  });
  table.forEach(([x1, y1], i) => {
    const [x2, y2] = table[(i + 1) % 8];
    facetLines.push([x1, y1, x2, y2]);
  });
  if (cut === "b") {
    const inner = paveAngles.map((deg) => point(cx, cy, deg, stoneR * 0.18));
    inner.forEach(([ix, iy], i) => {
      const [t1x, t1y] = table[(i + 7) % 8];
      const [t2x, t2y] = table[i];
      facetLines.push([ix, iy, t1x, t1y], [ix, iy, t2x, t2y]);
    });
    inner.forEach(([x1, y1], i) => {
      const [x2, y2] = inner[(i + 1) % 8];
      facetLines.push([x1, y1, x2, y2]);
    });
  }

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
          {/* Narrowed further — a thin gold rim + a hairline cream bezel,
              leaving almost the whole medallion to the stone. */}
          <circle cx={cx} cy={cy} r="29" fill={`url(#${gold})`} stroke="#5A3B10" strokeWidth="1" />
          {paveAngles.map((deg) => {
            const r = deg % 90 === 0 ? 27.5 : 26.8;
            const [x, y] = point(cx, cy, deg, r);
            return (
              <circle
                key={deg}
                cx={x}
                cy={y}
                r={deg % 90 === 0 ? 1.7 : 1.5}
                fill={`url(#${pave})`}
                stroke="#8B98A4"
                strokeWidth=".28"
              />
            );
          })}
          <circle cx={cx} cy={cy} r="25.1" fill="none" stroke={`url(#${gold})`} strokeWidth="1" />

          {/* Stone, cut like a round-brilliant crown. */}
          <circle cx={cx} cy={cy} r={stoneR + 0.8} fill="#241608" />
          <circle cx={cx} cy={cy} r={stoneR} fill={color} stroke="#000000" strokeOpacity=".32" strokeWidth=".6" />
          <circle cx={cx} cy={cy} r={stoneR} fill={`url(#${hi})`} />
          <circle cx={cx} cy={cy} r={stoneR} fill={`url(#${sh})`} />
          {facetLines.map(([x1, y1, x2, y2], i) => (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#FFFFFF" strokeWidth=".5" strokeOpacity=".45" />
          ))}
          <circle cx={cx} cy={cy} r={stoneR} fill="none" stroke="#FFFFFF" strokeOpacity=".3" strokeWidth=".5" />
          <path d="M25.5 24 31 30" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" opacity=".65" />
        </g>
      </svg>
    </span>
  );
}
