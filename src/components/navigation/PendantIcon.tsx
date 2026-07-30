import { useId, type ReactNode } from "react";

// A small round gold-pendant medallion — same jewellery family as the client
// tab pendants (gold-metal gradient, pavé-diamond halo, hue-independent
// facet shading over a currentColor-free stone), just circular instead of
// the tabs' diamond-cut silhouette, to match the NavFab's own round buttons
// and the round reference pendants. Each instance gets its own gradient/
// filter ids (via useId) so multiple copies can render on the same page
// without colliding.
export function PendantIcon({
  color,
  size,
  icon,
}: {
  color: string;
  size: number;
  icon?: ReactNode;
}) {
  const uid = useId();
  const gold = `pendant-gold-${uid}`;
  const pave = `pendant-pave-${uid}`;
  const hi = `pendant-hi-${uid}`;
  const sh = `pendant-sh-${uid}`;
  const shadow = `pendant-shadow-${uid}`;
  // The glyph reads as carved into the stone rather than floating on top —
  // a darker shade of the stone's own colour, not a foreign tint.
  const engraved = `color-mix(in srgb, ${color} 55%, black 45%)`;

  const cx = 32;
  const cy = 34;
  const paveAngles = [0, 45, 90, 135, 180, 225, 270, 315];

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
          <radialGradient id={hi} cx=".32" cy=".28" r=".75">
            <stop offset="0" stopColor="#FFFFFF" stopOpacity=".6" />
            <stop offset=".6" stopColor="#FFFFFF" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={sh} cx=".5" cy=".5" r=".62">
            <stop offset="0" stopColor="#000000" stopOpacity="0" />
            <stop offset=".7" stopColor="#000000" stopOpacity="0" />
            <stop offset="1" stopColor="#000000" stopOpacity=".4" />
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
          {/* bail */}
          <circle cx={cx} cy="8" r="2.8" fill="none" stroke={`url(#${gold})`} strokeWidth="1.8" />
          <line x1={cx} y1="10.6" x2={cx} y2={cy - 17} stroke={`url(#${gold})`} strokeWidth="1.8" strokeLinecap="round" />

          {/* gold rim + pavé halo + cream bezel */}
          <circle cx={cx} cy={cy} r="17" fill={`url(#${gold})`} stroke="#5A3B10" strokeWidth=".9" />
          {paveAngles.map((deg) => {
            const rad = (deg * Math.PI) / 180;
            const r = deg % 90 === 0 ? 15.2 : 14.6;
            return (
              <circle
                key={deg}
                cx={cx + r * Math.sin(rad)}
                cy={cy - r * Math.cos(rad)}
                r={deg % 90 === 0 ? 1.9 : 1.6}
                fill={`url(#${pave})`}
                stroke="#8B98A4"
                strokeWidth=".35"
              />
            );
          })}
          <circle cx={cx} cy={cy} r="12.6" fill="#FCEFD8" stroke={`url(#${gold})`} strokeWidth=".7" />

          {/* stone */}
          <circle cx={cx} cy={cy} r="9.7" fill="#241608" />
          <circle cx={cx} cy={cy} r="9" fill={color} stroke="#000000" strokeOpacity=".3" strokeWidth=".45" />
          <circle cx={cx} cy={cy} r="9" fill={`url(#${hi})`} />
          <circle cx={cx} cy={cy} r="9" fill={`url(#${sh})`} />
          <path d="M27.7 29 30.5 32.2" stroke="#FFFFFF" strokeWidth="1" strokeLinecap="round" opacity=".6" />
        </g>
      </svg>
      {icon && (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            top: `${(cy / 64) * 100}%`,
            left: "50%",
            transform: "translate(-50%, -50%)",
            display: "flex",
            color: engraved,
            filter: "drop-shadow(.5px .6px 0 rgba(0,0,0,.55)) drop-shadow(-.4px -.5px 0 rgba(255,255,255,.32))",
          }}
        >
          {icon}
        </span>
      )}
    </span>
  );
}
