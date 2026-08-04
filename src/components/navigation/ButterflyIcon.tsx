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

// Three silhouettes traced from the user's supplied butterfly collection.
// They are real SVG paths, duplicated around the toolbar and recoloured with
// the light-theme INKA palette rather than redrawn as generic icon wings.
const WING_PATHS: Record<ButterflyVariant, { left: string; right: string }> = {
  0: {
    left:
      "M11.6,2.4L5.2,8.1L4.4,18L8.7,30.5L18.3,43.5L27,49.9L48.5,49.7L26.4,58L15,70.8L14.2,81.4L19.3,90.7L26.8,93.7L35.6,93.1L46,86.9L57,63.8L59.5,76.7L59.5,36.5L52.8,30L48.8,21.7L49.1,18.1L50.7,27.3L58.6,38.2L56.1,41L56.9,44.1L50.5,32.1L30,8.7L22.6,3.9Z",
    right:
      "M109.3,2.3L101.6,2.7L92.4,6.9L71.5,30.3L64.6,42.4L61.9,38.3L70.5,26.2L71.6,18L69.4,27L60.3,38L60.3,77.3L63.5,63.8L73.2,84.8L85.1,93.1L94.9,93.7L103.6,88L106.5,80.3L105.9,72.5L102.2,65.3L93.7,57.4L71.8,49.7L91.1,50.2L100.5,45.9L111.2,31.6L115.8,19.6L115.2,6.8Z",
  },
  1: {
    left:
      "M8.9,2.2L6.9,4.1L7.2,8.7L17.7,28.7L14.4,32.7L14.7,38.4L19.3,47.1L28.8,56.4L27,59.4L27.8,67L35,77.1L32.5,92L35.2,93.8L38.7,83.1L46.7,85.3L52.3,80.2L54.9,65.1L58,58.3L59.5,71.8L59.5,36.1L51,24.8L49.7,16.2L50.8,24.8L59.2,36.5L58,42.2L42.5,23.2L30,11.4L18.9,4.4Z",
    right:
      "M113.9,2.2L104.2,4.3L91.7,12.6L80.3,23.3L64.9,42.2L63.6,36.5L71.8,25.5L73.1,16.2L73,22L63.6,36.1L62.2,35L61,37L60.3,35.1L60.7,74.6L62.1,74.9L63.7,71L64.9,58.4L70.9,80.5L76.2,85.3L84.4,83.2L87.9,93.9L90.5,91.8L87.9,76.8L91.1,74.6L91.7,69.9L95.1,66.6L95.8,59.2L94.2,56.3L103,47.8L108.2,39L108.7,33.3L105.1,28.9L115.9,8.2L116.2,4.3Z",
  },
  2: {
    left:
      "M45.8,22.7L47.3,28.5L58.4,40.3L57,44.1L46.3,35.3L31.5,27.8L17.8,24.6L13.7,28.6L17.1,51L20.5,55.5L26.3,56.3L24,64.5L27.3,77L26.3,80.7L31.8,83.1L30,87.3L23,91.2L23.3,93.8L31.3,88.6L35.8,81.6L38.7,82.6L39.4,87.4L41.4,82.9L45.4,83.6L47.3,75.5L56.7,55.9L57,65.7L59.6,70.4L59.4,38.4L58.6,40.2L50.2,31.5Z",
    right:
      "M73.8,22.7L70.5,30.6L61.2,40.3L60.4,38.5L60.3,70.4L62.8,66.3L63.2,56L65.6,63.6L72.6,75.5L74.4,83.5L78.5,82.9L80.5,87.4L81.3,82.5L84.1,81.6L87.8,87.8L96.4,93.9L96.9,91.2L90,87.4L88.1,83.2L89.7,81.3L93.3,81.1L93.5,71.5L95.9,65.7L93.5,56.3L99.4,55.6L103,50.6L106.3,28.8L104.3,25.7L100.8,24.6L89.3,27.5L73.6,35.3L62.9,44.1L61.4,40.3L72.6,28.5Z",
  },
};

function Wing({
  path,
  side,
  fillId,
  washId,
  outline,
}: {
  path: string;
  side: "left" | "right";
  fillId: string;
  washId: string;
  outline: string;
}) {
  const veins =
    side === "left"
      ? [
          "M59 48C48 43 35 28 18 11",
          "M58 49C42 47 27 40 12 29",
          "M57 51C43 54 29 63 19 78",
          "M56 53C49 66 45 78 43 88",
          "M49 43C39 34 30 24 25 13",
        ]
      : [
          "M61 48C72 43 85 28 102 11",
          "M62 49C78 47 93 40 108 29",
          "M63 51C77 54 91 63 101 78",
          "M64 53C71 66 75 78 77 88",
          "M71 43C81 34 90 24 95 13",
        ];

  return (
    <>
      <path d={path} fill={`url(#${fillId})`} stroke={outline} strokeWidth="1.05" strokeLinejoin="round" />
      <path d={path} fill={`url(#${washId})`} opacity=".34" />
      <g fill="none" stroke={outline} strokeLinecap="round" opacity=".55">
        {veins.map((d) => (
          <path key={d} d={d} strokeWidth=".48" />
        ))}
      </g>
      <path d={path} fill="none" stroke="#F6ECDD" strokeWidth=".42" opacity=".3" />
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
  const washId = `butterfly-wash-${uid}`;
  const glowId = `butterfly-glow-${uid}`;
  const outline = "#665044";
  const paths = WING_PATHS[variant];
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
      <svg width={size} height={size} viewBox="0 0 120 96" style={{ display: "block", overflow: "visible" }}>
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#F7EEDF" stopOpacity=".92" />
            <stop offset=".2" stopColor={color} stopOpacity=".58" />
            <stop offset=".7" stopColor={color} stopOpacity=".94" />
            <stop offset="1" stopColor="#46342C" stopOpacity=".42" />
          </linearGradient>
          <radialGradient id={washId} cx=".32" cy=".2" r=".9">
            <stop offset="0" stopColor="#FFF9ED" stopOpacity=".7" />
            <stop offset=".5" stopColor={color} stopOpacity=".12" />
            <stop offset="1" stopColor="#3C2D27" stopOpacity=".32" />
          </radialGradient>
          <filter id={glowId} x="-28%" y="-28%" width="156%" height="156%">
            <feGaussianBlur in="SourceAlpha" stdDeviation={active ? "1.35" : ".7"} result="blur" />
            <feFlood floodColor={color} floodOpacity={active ? ".24" : ".08"} />
            <feComposite in2="blur" operator="in" />
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g filter={`url(#${glowId})`}>
          <g className="butterfly-icon__wing butterfly-icon__wing--left">
            <Wing path={paths.left} side="left" fillId={fillId} washId={washId} outline={outline} />
          </g>
          <g className="butterfly-icon__wing butterfly-icon__wing--right">
            <Wing path={paths.right} side="right" fillId={fillId} washId={washId} outline={outline} />
          </g>

          <g>
            <ellipse cx="60" cy="51" rx="3.4" ry="13.8" fill="#574137" stroke="#2E211C" strokeWidth=".7" />
            <ellipse cx="60" cy="37.8" rx="4" ry="3.6" fill="#675044" stroke="#2E211C" strokeWidth=".7" />
            <path d="M58.4 36C52 27 47 23 42 21" fill="none" stroke="#49362F" strokeWidth=".85" strokeLinecap="round" />
            <path d="M61.6 36C68 27 73 23 78 21" fill="none" stroke="#49362F" strokeWidth=".85" strokeLinecap="round" />
            <circle cx="41.7" cy="20.8" r=".8" fill="#49362F" />
            <circle cx="78.3" cy="20.8" r=".8" fill="#49362F" />
            <path d="M57.6 45H62.4M57.3 50H62.7M57.6 55H62.4M58 60H62" stroke="#BCA58D" strokeWidth=".65" opacity=".74" />
          </g>

          {children && (
            <g transform="translate(60 49) scale(.82)" fill="none" stroke="#F8F0E2" opacity=".92">
              {children}
            </g>
          )}
        </g>
      </svg>
    </span>
  );
}
