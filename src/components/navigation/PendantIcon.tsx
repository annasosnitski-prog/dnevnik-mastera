import { useId, type ReactNode } from "react";

function point(cx: number, cy: number, deg: number, r: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [cx + r * Math.sin(rad), cy - r * Math.cos(rad)];
}

// A small round gold-pendant medallion, ported from a richer reference (a
// faceted ruby-and-diamond pendant render) and generalised so any of the
// seven destination colours can drop in: every ruby-specific hex in that
// reference became a `color-mix` off the `color` prop instead, at the same
// relative light/dark ratios. Structure, outer to inner:
//   gold disc + edge ring -> dark bezel groove -> the stone itself, cut
//   into a darker octagon core with four lighter/coloured quadrant facets,
//   a bright highlight flash, and an inner glow bleeding through them like
//   a lit potion bottle -> a pavé halo of small faceted diamonds with a
//   few sparkle glints. `plate` swaps the coloured stone for a plain gold
//   disc (for «Создать», which marks an action rather than a destination)
//   and renders `children` centred on top of it. Each instance gets its
//   own gradient/filter ids (via useId) so multiple copies can render on
//   the same page without colliding.
export function PendantIcon({
  color,
  size,
  plate = false,
  children,
}: {
  color: string;
  size: number;
  plate?: boolean;
  children?: ReactNode;
}) {
  const uid = useId();
  const goldFace = `pendant-goldface-${uid}`;
  const goldEdge = `pendant-goldedge-${uid}`;
  const diamondBase = `pendant-diamondbase-${uid}`;
  const qTop = `pendant-qtop-${uid}`;
  const qRight = `pendant-qright-${uid}`;
  const qBottom = `pendant-qbottom-${uid}`;
  const qLeft = `pendant-qleft-${uid}`;
  const flash = `pendant-flash-${uid}`;
  const transmit = `pendant-transmit-${uid}`;
  const coreGlow = `pendant-coreglow-${uid}`;
  const goldGlow = `pendant-goldglow-${uid}`;
  const stoneGlow = `pendant-stoneglow-${uid}`;

  const mix = (pct: number, tint: "white" | "black") => `color-mix(in srgb, ${color} ${100 - pct}%, ${tint} ${pct}%)`;

  const cx = 32;
  const cy = 32;
  const outerR = 29;
  const stoneR = 23;
  const innerR = stoneR * 0.7;
  const angles = [0, 45, 90, 135, 180, 225, 270, 315];
  const outerPts = angles.map((deg) => point(cx, cy, deg, stoneR));
  const innerPts = angles.map((deg) => point(cx, cy, deg, innerR));
  // k is an index into angles/outerPts/innerPts (0=top, 2=right, 4=bottom,
  // 6=left) — each quadrant spans that centre point and its two neighbours,
  // outer rim arc first, then back along the inner octagon.
  const quadrant = (k: number) => {
    const o1 = outerPts[(k + 7) % 8];
    const o2 = outerPts[k];
    const o3 = outerPts[(k + 1) % 8];
    const i3 = innerPts[(k + 1) % 8];
    const i2 = innerPts[k];
    const i1 = innerPts[(k + 7) % 8];
    return [o1, o2, o3, i3, i2, i1].map(([x, y]) => `${x},${y}`).join(" ");
  };

  const diamond = (x: number, y: number, id: string) => (
    <g key={`${x}-${y}`} transform={`translate(${x} ${y})`}>
      <circle r="2" fill="#7D5A2A" opacity=".7" />
      <circle r="1.5" fill={`url(#${id})`} stroke="#FFFFFF" strokeWidth=".22" />
      <path d="M0,-1.15 .55,-.35 0,0 -.55,-.35Z" fill="#FFFFFF" opacity=".95" />
      <path d="M1.15,0 .45,.55 0,0 .55,-.35Z" fill="#C7D2DF" opacity=".9" />
      <path d="M0,1.15 -.45,.42 0,0 .45,.55Z" fill="#FFFFFF" opacity=".82" />
      <path d="M-1.15,0 -.55,-.35 0,0 -.45,.42Z" fill="#AEB9C5" opacity=".9" />
      <circle r=".28" fill="#FFFFFF" opacity=".9" />
    </g>
  );

  // A catch-light along an *actual* facet edge — a real cut stone sparkles
  // where a specific edge happens to catch the light, so this brightens a
  // sub-segment of a real edge (t1..t2 along p1→p2) rather than a shape
  // floating free in the middle of a facet.
  const glint = (
    p1: readonly [number, number],
    p2: readonly [number, number],
    t1: number,
    t2: number,
    width: number,
    opacity: number,
  ) => {
    const [ax, ay] = p1;
    const [bx, by] = p2;
    const x1 = ax + (bx - ax) * t1;
    const y1 = ay + (by - ay) * t1;
    const x2 = ax + (bx - ax) * t2;
    const y2 = ay + (by - ay) * t2;
    return (
      <line
        key={`glint-${x1}-${y1}-${x2}-${y2}`}
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke="#FFFFFF"
        strokeWidth={width}
        strokeLinecap="round"
        opacity={opacity}
        style={{ filter: "blur(.3px)" }}
      />
    );
  };

  const sparkle = (x: number, y: number) => (
    <g key={`s-${x}-${y}`} transform={`translate(${x} ${y}) scale(.055)`} opacity=".85">
      <path d="M-18 0 H18 M0 -18 V18" stroke="#FFFFFF" strokeWidth="3.4" strokeLinecap="round" />
      <path d="M-10 -10 L10 10 M10 -10 L-10 10" stroke="#FFF2E6" strokeWidth="2.2" strokeLinecap="round" />
      <circle r="4" fill="#FFFFFF" />
    </g>
  );

  return (
    <span style={{ position: "relative", display: "block", width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" style={{ display: "block" }}>
        <defs>
          <radialGradient id={goldFace} cx=".34" cy=".2" r=".84">
            <stop offset="0" stopColor="#FFF8D7" />
            <stop offset=".14" stopColor="#FFD777" />
            <stop offset=".34" stopColor="#C77A14" />
            <stop offset=".56" stopColor="#793804" />
            <stop offset=".76" stopColor="#EFAD3C" />
            <stop offset=".91" stopColor="#8E4709" />
            <stop offset="1" stopColor="#431A00" />
          </radialGradient>
          <linearGradient id={goldEdge} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#6B2C00" />
            <stop offset=".16" stopColor="#FFF0B3" />
            <stop offset=".35" stopColor="#B45F0B" />
            <stop offset=".55" stopColor="#FFD36E" />
            <stop offset=".75" stopColor="#7D3603" />
            <stop offset="1" stopColor="#F1B54A" />
          </linearGradient>
          <radialGradient id={diamondBase} cx=".32" cy=".26" r=".75">
            <stop offset="0" stopColor="#FFFFFF" />
            <stop offset=".32" stopColor="#F8FBFF" />
            <stop offset=".63" stopColor="#CBD5DF" />
            <stop offset=".82" stopColor="#FFFFFF" />
            <stop offset="1" stopColor="#929DAA" />
          </radialGradient>
          <linearGradient id={qTop} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={mix(55, "white")} stopOpacity=".62" />
            <stop offset=".48" stopColor={color} stopOpacity=".38" />
            <stop offset="1" stopColor={mix(55, "black")} stopOpacity=".12" />
          </linearGradient>
          <linearGradient id={qRight} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={mix(45, "white")} stopOpacity=".6" />
            <stop offset=".62" stopColor={mix(65, "black")} stopOpacity=".18" />
            <stop offset="1" stopColor={mix(85, "black")} stopOpacity=".55" />
          </linearGradient>
          <linearGradient id={qBottom} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={mix(30, "white")} stopOpacity=".48" />
            <stop offset=".55" stopColor={mix(60, "black")} stopOpacity=".18" />
            <stop offset="1" stopColor={mix(90, "black")} stopOpacity=".55" />
          </linearGradient>
          <linearGradient id={qLeft} x1="1" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity=".34" />
            <stop offset=".58" stopColor={mix(75, "black")} stopOpacity=".28" />
            <stop offset="1" stopColor={mix(92, "black")} stopOpacity=".58" />
          </linearGradient>
          <linearGradient id={flash} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FFFFFF" stopOpacity=".98" />
            <stop offset=".55" stopColor="#FFF8F5" stopOpacity=".88" />
            <stop offset="1" stopColor={mix(20, "white")} stopOpacity=".18" />
          </linearGradient>
          {/* Light entering at the flash doesn't just stop there — some of
              it passes through the stone and exits the diagonally opposite
              side, so that corner gets its own lighter patch too (tinted by
              the stone's own colour, not neutral white like a reflection). */}
          <linearGradient id={transmit} x1="1" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor={mix(55, "white")} stopOpacity=".62" />
            <stop offset=".55" stopColor={mix(35, "white")} stopOpacity=".4" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
          {/* A lit-from-within core, like a magic potion's glowing liquid —
              drawn under the quadrant facets so their translucent colour
              still tints it, rather than a flat reflective surface. */}
          <radialGradient id={coreGlow} cx=".5" cy=".5" r=".5">
            <stop offset="0" stopColor={mix(70, "white")} />
            <stop offset=".4" stopColor={mix(35, "white")} stopOpacity=".85" />
            <stop offset=".7" stopColor={color} stopOpacity=".45" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </radialGradient>
          <filter id={goldGlow} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="1" result="blur" />
            <feFlood floodColor="#EF9D24" floodOpacity=".34" />
            <feComposite in2="blur" operator="in" />
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id={stoneGlow} x="-25%" y="-25%" width="150%" height="150%">
            <feGaussianBlur stdDeviation=".7" result="blur" />
            <feFlood floodColor={color} floodOpacity=".32" />
            <feComposite in2="blur" operator="in" />
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g filter={`url(#${goldGlow})`}>
          <circle cx={cx} cy={cy} r={outerR} fill={`url(#${goldFace})`} stroke="#4B1A00" strokeWidth=".7" />
          <circle cx={cx} cy={cy} r={outerR - 1} fill="none" stroke={`url(#${goldEdge})`} strokeWidth=".95" />
          <circle cx={cx} cy={cy} r={outerR - 4.5} fill="#2C0A00" stroke="#FFCF68" strokeWidth=".8" />
          <circle cx={cx} cy={cy} r={outerR - 5.35} fill="none" stroke="#6A2702" strokeWidth=".4" />
        </g>

        {plate ? (
          <g filter={`url(#${stoneGlow})`}>
            <circle cx={cx} cy={cy} r={stoneR} fill={`url(#${goldFace})`} stroke="#4B1A00" strokeWidth=".5" />
            <circle cx={cx} cy={cy} r={stoneR - 3} fill="none" stroke={`url(#${goldEdge})`} strokeWidth=".7" />
            <path d="M22 20 30 15" stroke="#FFF0B3" strokeWidth="1.6" strokeLinecap="round" opacity=".55" />
            {children && (
              <g
                transform={`translate(${cx} ${cy})`}
                fill="#4B1A00"
                stroke="#4B1A00"
                style={{ filter: "drop-shadow(-.4px -.5px 0 rgba(255,240,179,.6))" }}
              >
                {children}
              </g>
            )}
          </g>
        ) : (
          <g filter={`url(#${stoneGlow})`}>
            {/* Soft haze bleeding out past the stone's own edge, like light
                escaping a lit potion bottle rather than staying inside a
                solid surface. */}
            <circle cx={cx} cy={cy} r={stoneR * 1.08} fill={mix(30, "white")} opacity=".3" style={{ filter: "blur(1.4px)" }} />
            <circle cx={cx} cy={cy} r={stoneR} fill={mix(40, "black")} />
            <circle cx={cx} cy={cy} r={stoneR * 0.72} fill={`url(#${coreGlow})`} style={{ filter: "blur(.5px)" }} />
            <polygon points={quadrant(0)} fill={`url(#${qTop})`} />
            <polygon points={quadrant(2)} fill={`url(#${qRight})`} />
            <polygon points={quadrant(4)} fill={`url(#${qBottom})`} />
            <polygon points={quadrant(6)} fill={`url(#${qLeft})`} />
            <polygon points={innerPts.map(([x, y]) => `${x},${y}`).join(" ")} fill={mix(60, "black")} opacity=".5" />
            <polygon
              points={`${outerPts[7].join(",")} ${point(cx, cy, -12, stoneR * 0.97).join(",")} ${point(cx, cy, 12, stoneR * 0.97).join(",")} ${point(cx, cy, 0, innerR * 1.08).join(",")}`}
              fill={`url(#${flash})`}
            />
            <polygon
              points={`${outerPts[3].join(",")} ${point(cx, cy, 168, stoneR * 0.97).join(",")} ${point(cx, cy, 192, stoneR * 0.97).join(",")} ${point(cx, cy, 180, innerR * 1.08).join(",")}`}
              fill={`url(#${transmit})`}
            />
            <g fill="none" stroke={mix(45, "white")} strokeOpacity=".3" strokeWidth=".28">
              <polygon points={innerPts.map(([x, y]) => `${x},${y}`).join(" ")} />
              {[45, 135, 225, 315].map((deg) => {
                const [x1, y1] = outerPts[angles.indexOf(deg)];
                const [x2, y2] = innerPts[angles.indexOf(deg)];
                return <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} />;
              })}
            </g>
            {glint(innerPts[0], innerPts[1], 0.12, 0.88, 1.3, 0.9)}
            {glint(innerPts[4], innerPts[5], 0.15, 0.85, 1.1, 0.75)}
            {glint(outerPts[2], innerPts[2], 0.25, 0.75, 1, 0.6)}
            {glint(innerPts[6], innerPts[7], 0.2, 0.8, 0.85, 0.45)}
          </g>
        )}

        <circle cx={cx} cy={cy} r={stoneR + 0.6} fill="none" stroke="#4F1700" strokeWidth=".5" />
        <circle cx={cx} cy={cy} r={stoneR + 1.1} fill="none" stroke={`url(#${goldEdge})`} strokeWidth=".5" />

        {angles.map((deg) => {
          const [x, y] = point(cx, cy, deg, 26.8);
          return diamond(x, y, diamondBase);
        })}
        {[45, 135, 225, 315].map((deg) => sparkle(...point(cx, cy, deg, 26.8)))}
      </svg>
    </span>
  );
}
