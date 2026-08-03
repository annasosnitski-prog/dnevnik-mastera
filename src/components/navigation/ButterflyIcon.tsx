import { useId, type CSSProperties, type ReactNode } from "react";

type ButterflyVariant = 0 | 1 | 2;

interface ButterflyIconProps {
  color: string;
  size: number;
  openness: number;
  active?: boolean;
  variant?: ButterflyVariant;
  flutterDurationMs?: number;
  flutterDelayMs?: number;
  children?: ReactNode;
}

const WING_PATHS: Record<ButterflyVariant, { upper: string; lower: string }> = {
  0: {
    upper: "M31 31C26 12 12 7 5 16C0 24 9 35 29 36Z",
    lower: "M29 35C19 35 7 40 9 50C12 58 23 52 31 39Z",
  },
  1: {
    upper: "M31 31C26 10 11 7 4 17C1 26 11 34 29 36Z",
    lower: "M29 35C18 35 10 40 12 49C15 55 21 50 25 46L20 59C28 54 31 45 32 39Z",
  },
  2: {
    upper: "M31 31C25 13 13 10 6 18C3 27 13 35 29 36Z",
    lower: "M29 35C20 34 11 39 11 48C12 55 22 52 31 39Z",
  },
};

function WingDrawing({
  upper,
  lower,
  fillId,
  shadeId,
  outline,
}: {
  upper: string;
  lower: string;
  fillId: string;
  shadeId: string;
  outline: string;
}) {
  return (
    <>
      <path d={upper} fill={`url(#${fillId})`} stroke={outline} strokeWidth="1.15" strokeLinejoin="round" />
      <path d={lower} fill={`url(#${shadeId})`} stroke={outline} strokeWidth="1.05" strokeLinejoin="round" />

      <g fill="none" stroke={outline} strokeLinecap="round" opacity=".64">
        <path d="M30.5 32C24 27 17 20 8 17" strokeWidth=".62" />
        <path d="M30 33C22 32 14 29 6 23" strokeWidth=".52" />
        <path d="M29.5 34C21 36 15 39 11 45" strokeWidth=".55" />
        <path d="M29 35C23 42 20 48 18 53" strokeWidth=".48" />
        <path d="M25 29C20 25 16 21 13 16" strokeWidth=".42" />
        <path d="M21 34C17 31 12 29 8 27" strokeWidth=".4" />
      </g>

      <g fill={outline} opacity=".72">
        <ellipse cx="10.5" cy="19.5" rx="1.6" ry="1.1" transform="rotate(24 10.5 19.5)" />
        <ellipse cx="15.5" cy="24.5" rx="1.25" ry=".85" transform="rotate(26 15.5 24.5)" />
        <circle cx="12.5" cy="43" r="1.05" />
        <circle cx="18" cy="47.5" r=".78" />
      </g>

      <g fill="#F5EAD7" opacity=".76">
        <circle cx="10.5" cy="19.5" r=".43" />
        <circle cx="12.5" cy="43" r=".3" />
      </g>

      <path d="M7 18C13 13 23 18 29 31" fill="none" stroke="#F7EFDF" strokeWidth=".7" strokeLinecap="round" opacity=".38" />
    </>
  );
}

export function ButterflyIcon({
  color,
  size,
  openness,
  active = false,
  variant = 0,
  flutterDurationMs = 2800,
  flutterDelayMs = 0,
  children,
}: ButterflyIconProps) {
  const uid = useId();
  const fillId = `butterfly-fill-${uid}`;
  const shadeId = `butterfly-shade-${uid}`;
  const glowId = `butterfly-glow-${uid}`;
  const { upper, lower } = WING_PATHS[variant];
  const outline = "#685142";
  const style = {
    "--wing-open": Math.max(0.28, Math.min(1, openness)),
    "--flutter-duration": `${flutterDurationMs}ms`,
    "--flutter-delay": `${flutterDelayMs}ms`,
  } as CSSProperties;

  return (
    <span
      aria-hidden="true"
      className={active ? "butterfly-icon butterfly-icon--active" : "butterfly-icon"}
      style={{ ...style, width: size, height: size }}
    >
      <svg width={size} height={size} viewBox="0 0 64 64" style={{ display: "block", overflow: "visible" }}>
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#F7EDDB" />
            <stop offset=".18" stopColor={color} stopOpacity=".72" />
            <stop offset=".68" stopColor={color} stopOpacity=".96" />
            <stop offset="1" stopColor="#4D3A30" stopOpacity=".32" />
          </linearGradient>
          <linearGradient id={shadeId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={color} stopOpacity=".88" />
            <stop offset=".58" stopColor={color} stopOpacity=".7" />
            <stop offset="1" stopColor="#4A352B" stopOpacity=".5" />
          </linearGradient>
          <filter id={glowId} x="-35%" y="-35%" width="170%" height="170%">
            <feGaussianBlur stdDeviation="1.8" result="blur" />
            <feFlood floodColor={color} floodOpacity={active ? ".28" : ".11"} />
            <feComposite in2="blur" operator="in" />
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g filter={`url(#${glowId})`}>
          <g className="butterfly-icon__wing butterfly-icon__wing--left">
            <WingDrawing upper={upper} lower={lower} fillId={fillId} shadeId={shadeId} outline={outline} />
          </g>
          <g className="butterfly-icon__wing butterfly-icon__wing--right">
            <g transform="translate(64 0) scale(-1 1)">
              <WingDrawing upper={upper} lower={lower} fillId={fillId} shadeId={shadeId} outline={outline} />
            </g>
          </g>

          <g>
            <ellipse cx="32" cy="33" rx="2.15" ry="9.2" fill="#5A4336" stroke="#2F211B" strokeWidth=".55" />
            <ellipse cx="32" cy="24.5" rx="2.65" ry="2.35" fill="#6B5140" stroke="#2F211B" strokeWidth=".55" />
            <path d="M31 23C27 17 24 15 21.5 14" fill="none" stroke="#4C382E" strokeWidth=".7" strokeLinecap="round" />
            <path d="M33 23C37 17 40 15 42.5 14" fill="none" stroke="#4C382E" strokeWidth=".7" strokeLinecap="round" />
            <circle cx="21.3" cy="13.8" r=".65" fill="#4C382E" />
            <circle cx="42.7" cy="13.8" r=".65" fill="#4C382E" />
            <path d="M30.6 29H33.4M30.3 33H33.7M30.6 37H33.4" stroke="#BDA68B" strokeWidth=".55" opacity=".72" />
          </g>

          {children && (
            <g transform="translate(32 33) scale(.68)" fill="none" stroke="#F8F0E2" opacity=".9">
              {children}
            </g>
          )}
        </g>
      </svg>
    </span>
  );
}
