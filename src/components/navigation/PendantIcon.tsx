import { useId, type ReactNode } from "react";
import { glowOf } from "../ui/designTokens";

function point(cx: number, cy: number, deg: number, r: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [cx + r * Math.sin(rad), cy - r * Math.cos(rad)];
}

// Same direction as `point`, but the boundary is a rhombus (|x|+|y|=r in the
// axis-aligned local frame) instead of a circle — used by `shape="diamond"`
// so every ring, the pavé border and the stone's own silhouette trace one
// consistent diamond outline instead of a circle's.
function diamondPoint(cx: number, cy: number, deg: number, r: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);
  const t = r / (Math.abs(dx) + Math.abs(dy) || 1);
  return [cx + t * dx, cy + t * dy];
}

function ringPoints(edge: (deg: number, r: number) => [number, number], r: number): string {
  return [0, 90, 180, 270].map((deg) => edge(deg, r).join(',')).join(' ');
}

// A small round gold-pendant medallion, generalised so any of the seven
// destination colours can drop in (every hex is a `color-mix` off the
// `color` prop). Structure, outer to inner:
//   gold disc + edge ring -> dark bezel groove -> the stone itself, a
//   round brilliant seen from the crown (see the facet map below) with
//   hard, high-contrast flat facets and no diffuse glow inside -> a pavé
//   halo of small faceted diamonds with a few sparkle glints. `plate` swaps
//   the coloured stone for a plain gold
//   disc (for «Создать», which marks an action rather than a destination)
//   and renders `children` centred on top of it. Each instance gets its
//   own gradient/filter ids (via useId) so multiple copies can render on
//   the same page without colliding.
export function PendantIcon({
  color,
  size,
  plate = false,
  shape = 'round',
  children,
}: {
  color: string;
  size: number;
  plate?: boolean;
  // 'diamond' keeps every gradient, facet and the glow filter identical to
  // the round pendant — only the gold body, its rings and the pavé border
  // trace a rhombus instead of a circle, and the stone's own facet cut is
  // clipped to that same rhombus silhouette.
  shape?: 'round' | 'diamond';
  children?: ReactNode;
}) {
  const uid = useId();
  const stoneClip = `pendant-stoneclip-${uid}`;
  const goldFace = `pendant-goldface-${uid}`;
  const plateFace = `pendant-plateface-${uid}`;
  const goldEdge = `pendant-goldedge-${uid}`;
  const diamondBase = `pendant-diamondbase-${uid}`;
  const transmitFade = `pendant-transmitfade-${uid}`;
  const seaSoft = `pendant-seasoft-${uid}`;
  const softClip = `pendant-softclip-${uid}`;
  const stoneGlow = `pendant-stoneglow-${uid}`;

  const mix = (pct: number, tint: "white" | "black") => `color-mix(in srgb, ${color} ${100 - pct}%, ${tint} ${pct}%)`;

  const cx = 32;
  const cy = 32;
  const edge = (deg: number, r: number): [number, number] =>
    shape === 'diamond' ? diamondPoint(cx, cy, deg, r) : point(cx, cy, deg, r);
  const outerR = 29;
  const stoneR = 23;
  // Round-brilliant crown, top view, 8-fold: a table octagon (T) in the
  // middle; eight star facets (triangles on the table edges, tip S); eight
  // bezel kites (T -> S -> G -> S) and eight upper-girdle triangles
  // (S, G, G) that close the ring. Every vertex is shared, so the facets
  // tile the disc with no gaps: 8 + 8 + 8 + 8 flat planes + the table.
  // In the diamond setting the same facet map is laid onto a rhombus (every
  // vertex keeps its angle and radius but is measured in the rhombus metric,
  // and the whole map is turned 22.5° so girdle corners land exactly on the
  // rhombus' four tips). The stone then fills its bezel edge to edge instead
  // of a circle poking out past the setting's corners.
  const isDiamond = shape === 'diamond';
  const rot = isDiamond ? -22.5 : 0;
  // Round: the table is widened by 1/8 of the stone's diameter (2 * stoneR / 8).
  const tableR = isDiamond ? stoneR * 0.64 : stoneR * 0.54 + (2 * stoneR) / 16;
  const starR = stoneR * 0.8;
  const angles = [0, 45, 90, 135, 180, 225, 270, 315];
  const ks = [0, 1, 2, 3, 4, 5, 6, 7];
  const T = ks.map((k) => edge(45 * k + 22.5 + rot, tableR));
  const S = ks.map((k) => edge(45 * (k + 1) + rot, starR));
  const G = ks.map((k) => edge(45 * k + 22.5 + rot, stoneR));
  // Bevel (фаска): a narrow chamfer band running round the whole girdle,
  // between the girdle corners and the same corners pulled 12% inward.
  const GB = ks.map((k) => edge(45 * k + 22.5 + rot, stoneR * 0.88));
  const pts = (list: ReadonlyArray<readonly [number, number]>) => list.map(([x, y]) => `${x},${y}`).join(' ');
  // A real diamond is not smooth: neighbouring facets mirror either the
  // bright room or the dark one, so adjacent planes jump between near-white
  // and near-black. `tone` is facing-the-light (upper-left) plus a parity
  // flip on alternate facets; the buckets below are hard steps, not a
  // gradient — that stepping is the whole "cut stone" look.
  const lightAz = -38;
  const tone = (azimuth: number, flip: number) => {
    const t = Math.cos(((azimuth + rot - lightAz) * Math.PI) / 180) + flip;
    return Math.max(-1, Math.min(1, t));
  };
  const facetFill = (t: number) =>
    t > 0.5 ? mix(80, 'white')
    : t > 0.05 ? mix(50, 'white')
    : t > -0.35 ? mix(18, 'white')
    : t > -0.7 ? mix(38, 'black')
    : mix(54, 'black');

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
  // floating free in the middle of a facet. Drawn as a pointed lens (thin
  // at both tips, widest at the centre) instead of a flat-capped stroke, so
  // it tapers off like a real specular streak rather than ending abruptly.
  const glint = (
    p1: readonly [number, number],
    p2: readonly [number, number],
    t1: number,
    t2: number,
    maxWidth: number,
    opacity: number,
  ) => {
    const [ax, ay] = p1;
    const [bx, by] = p2;
    const x1 = ax + (bx - ax) * t1;
    const y1 = ay + (by - ay) * t1;
    const x2 = ax + (bx - ax) * t2;
    const y2 = ay + (by - ay) * t2;
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    const px = -(y2 - y1) / len;
    const py = (x2 - x1) / len;
    const w = maxWidth / 2;
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    return (
      <path
        key={`glint-${x1}-${y1}-${x2}-${y2}`}
        d={`M${x1},${y1} Q${mx + px * w},${my + py * w} ${x2},${y2} Q${mx - px * w},${my - py * w} ${x1},${y1}Z`}
        fill="#FFFFFF"
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
            <stop offset="0" stopColor="#F5E3B8" />
            <stop offset=".14" stopColor="#E0B569" />
            <stop offset=".34" stopColor="#C8943A" />
            <stop offset=".56" stopColor="#8A6428" />
            <stop offset=".76" stopColor="#C9A24E" />
            <stop offset=".91" stopColor="#6E4E1C" />
            <stop offset="1" stopColor="#4A3313" />
          </radialGradient>
          {/* A much gentler sheen than goldFace's dramatic dome-lit radial —
              «Создать» reads as a flat stamped plate, not another curved
              gemstone. */}
          <linearGradient id={plateFace} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#F0DEB0" />
            <stop offset=".35" stopColor="#C8943A" />
            <stop offset=".7" stopColor="#96701F" />
            <stop offset="1" stopColor="#5C4014" />
          </linearGradient>
          <linearGradient id={goldEdge} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#5C4014" />
            <stop offset=".16" stopColor="#EAD1A0" />
            <stop offset=".35" stopColor="#B08A3E" />
            <stop offset=".55" stopColor="#E0B569" />
            <stop offset=".75" stopColor="#6E4E1C" />
            <stop offset="1" stopColor="#C9A24E" />
          </linearGradient>
          <radialGradient id={diamondBase} cx=".32" cy=".26" r=".75">
            <stop offset="0" stopColor="#FFFFFF" />
            <stop offset=".32" stopColor="#F8FBFF" />
            <stop offset=".63" stopColor="#CBD5DF" />
            <stop offset=".82" stopColor="#FFFFFF" />
            <stop offset="1" stopColor="#929DAA" />
          </radialGradient>
          <filter id={stoneGlow} x="-25%" y="-25%" width="150%" height="150%">
            <feGaussianBlur stdDeviation=".7" result="blur" />
            <feFlood floodColor={glowOf(color)} floodOpacity=".32" />
            <feComposite in2="blur" operator="in" />
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id={transmitFade} gradientUnits="userSpaceOnUse" x1={cx + 5} y1={cy + 11} x2={cx - 6} y2={cy - 3}>
            <stop offset="0" stopColor={mix(74, 'white')} stopOpacity=".95" />
            <stop offset=".4" stopColor={mix(62, 'white')} stopOpacity=".7" />
            <stop offset=".75" stopColor={mix(50, 'white')} stopOpacity=".22" />
            <stop offset="1" stopColor={mix(50, 'white')} stopOpacity="0" />
          </linearGradient>
          {/* Sea-worn stone: a hair of blur on the facet layer rounds every
              edge and corner, then the girdle line and glints go back on top
              crisp. The clip keeps the blur from leaking past the stone. */}
          <filter id={seaSoft} x="-5%" y="-5%" width="110%" height="110%">
            <feGaussianBlur stdDeviation=".42" />
          </filter>
          <clipPath id={softClip}>
            {isDiamond ? (
              <polygon points={ringPoints(edge, stoneR)} />
            ) : (
              <circle cx={cx} cy={cy} r={stoneR} />
            )}
          </clipPath>
          {shape === 'diamond' && (
            <clipPath id={stoneClip}>
              <polygon points={ringPoints(edge, stoneR + 0.4)} />
            </clipPath>
          )}
        </defs>

        <g>
          {shape === 'diamond' ? (
            <>
              <polygon points={ringPoints(edge, outerR)} fill={`url(#${goldFace})`} stroke="#5C4014" strokeWidth=".7" />
              <polygon points={ringPoints(edge, outerR - 1)} fill="none" stroke={`url(#${goldEdge})`} strokeWidth=".95" />
              <polygon points={ringPoints(edge, outerR - 4.5)} fill="#3A2712" stroke="#E0B569" strokeWidth=".8" />
              <polygon points={ringPoints(edge, outerR - 5.35)} fill="none" stroke="#6E4E1C" strokeWidth=".4" />
            </>
          ) : (
            <>
              <circle cx={cx} cy={cy} r={outerR} fill={`url(#${goldFace})`} stroke="#5C4014" strokeWidth=".7" />
              <circle cx={cx} cy={cy} r={outerR - 1} fill="none" stroke={`url(#${goldEdge})`} strokeWidth=".95" />
              <circle cx={cx} cy={cy} r={outerR - 4.5} fill="#3A2712" stroke="#E0B569" strokeWidth=".8" />
              <circle cx={cx} cy={cy} r={outerR - 5.35} fill="none" stroke="#6E4E1C" strokeWidth=".4" />
            </>
          )}
        </g>

        {plate ? (
          <g className="pendant-stone" filter={`url(#${stoneGlow})`} clipPath={shape === 'diamond' ? `url(#${stoneClip})` : undefined}>
            <circle cx={cx} cy={cy} r={stoneR} fill={`url(#${plateFace})`} stroke="#5C4014" strokeWidth=".5" />
            <circle cx={cx} cy={cy} r={stoneR - 3} fill="none" stroke={`url(#${goldEdge})`} strokeWidth=".5" />
            <path d="M22 20 30 15" stroke="#EAD1A0" strokeWidth="1.2" strokeLinecap="round" opacity=".4" />
            {children && (
              <g
                transform={`translate(${cx} ${cy})`}
                fill="#5C4014"
                stroke="#5C4014"
                style={{ filter: "drop-shadow(-.4px -.5px 0 rgba(255,240,179,.6))" }}
              >
                {children}
              </g>
            )}
          </g>
        ) : (
          <g className="pendant-stone" filter={`url(#${stoneGlow})`} clipPath={shape === 'diamond' ? `url(#${stoneClip})` : undefined}>
            {isDiamond ? (
              <polygon points={ringPoints(edge, stoneR + 0.3)} fill={mix(92, 'black')} />
            ) : (
              <circle cx={cx} cy={cy} r={stoneR} fill={mix(92, 'black')} />
            )}
            <g data-optical-layer="soft-facets" clipPath={`url(#${softClip})`} filter={`url(#${seaSoft})`}>
              <g data-optical-layer="crown-facets" stroke={mix(62, 'white')} strokeOpacity=".32" strokeWidth=".22" strokeLinejoin="round">
                {ks.map((k) => {
                  const prev = (k + 7) % 8;
                  const next = (k + 1) % 8;
                  // Azimuths: kite k points at 45k+22.5, star/girdle tip S_k at 45(k+1).
                  const kite = [T[k], S[prev], G[k], S[k]];
                  const star = [T[k], T[next], S[k]];
                  const girdle = [G[k], G[next], S[k]];
                  const flip = k % 2 === 0 ? 0.32 : -0.32;
                  return (
                    <g key={`facet-${k}`}>
                      <polygon points={pts(kite)} fill={facetFill(tone(45 * k + 22.5, flip))} />
                      <polygon points={pts(star)} fill={facetFill(tone(45 * (k + 1), -flip * 1.4))} />
                      <polygon points={pts(girdle)} fill={facetFill(tone(45 * (k + 1), flip * 1.2))} />
                    </g>
                  );
                })}
              </g>
              {/* Chamfer around the rim: one narrow flat per girdle edge, bright
                  on the light side and dark opposite. */}
              <g data-optical-layer="bevel" stroke={mix(70, 'white')} strokeOpacity=".4" strokeWidth=".22" strokeLinejoin="round">
                {ks.map((k) => {
                  const next = (k + 1) % 8;
                  const t = tone(45 * (k + 1), k % 2 === 0 ? 0.18 : -0.18);
                  const fill = t > 0.45 ? mix(88, 'white') : t > 0 ? mix(64, 'white') : t > -0.45 ? mix(28, 'black') : mix(62, 'black');
                  return <polygon key={`bevel-${k}`} points={pts([G[k], G[next], GB[next], GB[k]])} fill={fill} />;
                })}
              </g>
            </g>
            {/* The table stays a clean dark window. The bright crown facets in
                the upper left throw their light straight through the stone, so
                it lands in the lower half of the table: hard edge on the rim
                side, thinning out toward the main flash. No chamfer round it. */}
            <g data-optical-layer="table-transmitted-light">
              <polygon points={pts(T)} fill={mix(52, 'black')} />
              <polygon points={pts(T)} fill={`url(#${transmitFade})`} />
              <polygon points={pts(T)} fill="none" stroke="#FFFFFF" strokeOpacity=".5" strokeWidth=".25" strokeLinejoin="round" />
            </g>
            {/* Hard specular glints on the facets that face the light. */}
            {glint(T[7], S[7], 0.1, 0.9, 1.2, 0.95)}
            {glint(S[6], G[7], 0.15, 0.85, 1, 0.8)}
            {glint(T[0], S[0], 0.2, 0.8, 0.9, 0.7)}
            {glint(G[6], G[7], 0.2, 0.8, 0.8, 0.6)}
            {/* Dispersion: a couple of tiny spectral flecks near the girdle,
                the way fire flashes off a cut stone's edge. */}
            <polygon points={pts([G[1], S[1], edge(45 * 2 - 14 + rot, stoneR * 0.9)])} fill="#9FE8FF" opacity=".42" />
            <polygon points={pts([G[4], S[4], edge(45 * 5 - 14 + rot, stoneR * 0.9)])} fill="#FFC27A" opacity=".38" />
            {isDiamond ? (
              <polygon
                data-optical-layer="girdle-edge"
                points={ringPoints(edge, stoneR - 0.3)}
                fill="none"
                stroke={mix(55, 'white')}
                strokeOpacity=".7"
                strokeWidth=".6"
                strokeLinejoin="round"
              />
            ) : (
              <circle
                data-optical-layer="girdle-edge"
                cx={cx}
                cy={cy}
                r={stoneR - 0.3}
                fill="none"
                stroke={mix(55, 'white')}
                strokeOpacity=".7"
                strokeWidth=".6"
              />
            )}
          </g>
        )}

        {shape === 'diamond' ? (
          <>
            <polygon points={ringPoints(edge, stoneR + 0.6)} fill="none" stroke="#5C4014" strokeWidth=".5" />
            <polygon points={ringPoints(edge, stoneR + 1.1)} fill="none" stroke={`url(#${goldEdge})`} strokeWidth=".5" />
          </>
        ) : (
          <>
            <circle cx={cx} cy={cy} r={stoneR + 0.6} fill="none" stroke="#5C4014" strokeWidth=".5" />
            <circle cx={cx} cy={cy} r={stoneR + 1.1} fill="none" stroke={`url(#${goldEdge})`} strokeWidth=".5" />
          </>
        )}

        {angles.map((deg) => {
          const [x, y] = edge(deg, 26.8);
          return diamond(x, y, diamondBase);
        })}
        {[45, 135, 225, 315].map((deg) => sparkle(...edge(deg, 26.8)))}
      </svg>
    </span>
  );
}
