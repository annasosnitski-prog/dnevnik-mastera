import { useId, type ReactNode } from "react";

// A small round gold-pendant medallion — same jewellery family as the client
// tab pendants (gold-metal gradient, pavé-diamond halo, hue-independent
// facet shading over a currentColor-free stone), just circular instead of
// the tabs' diamond-cut silhouette, to match the NavFab's own round buttons
// and the round reference pendants. Sized to fill its own button almost
// edge to edge, so it sits fully inside the button's ambient glow halo
// rather than floating inside it with a gap. Each instance gets its own
// gradient/filter ids (via useId) so multiple copies can render on the same
// page without colliding.
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
  // a few shades lighter than the stone's own colour, not a foreign tint.
  const engraved = `color-mix(in srgb, ${color} 78%, white 22%)`;

  const cx = 32;
  const cy = 32;
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
          {/* gold rim + pavé halo + cream bezel — filling almost the whole
              viewBox now that there's no bail to leave headroom for. */}
          <circle cx={cx} cy={cy} r="29" fill={`url(#${gold})`} stroke="#5A3B10" strokeWidth="1.1" />
          {paveAngles.map((deg) => {
            const rad = (deg * Math.PI) / 180;
            const r = deg % 90 === 0 ? 25.9 : 24.9;
            return (
              <circle
                key={deg}
                cx={cx + r * Math.sin(rad)}
                cy={cy - r * Math.cos(rad)}
                r={deg % 90 === 0 ? 3.2 : 2.7}
                fill={`url(#${pave})`}
                stroke="#8B98A4"
                strokeWidth=".4"
              />
            );
          })}
          <circle cx={cx} cy={cy} r="21.5" fill="#FCEFD8" stroke={`url(#${gold})`} strokeWidth=".9" />

          {/* stone */}
          <circle cx={cx} cy={cy} r="16.6" fill="#241608" />
          <circle cx={cx} cy={cy} r="15.3" fill={color} stroke="#000000" strokeOpacity=".3" strokeWidth=".6" />
          <circle cx={cx} cy={cy} r="15.3" fill={`url(#${hi})`} />
          <circle cx={cx} cy={cy} r="15.3" fill={`url(#${sh})`} />
          <path d="M24.7 23.5 29.5 29" stroke="#FFFFFF" strokeWidth="1.4" strokeLinecap="round" opacity=".6" />
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
