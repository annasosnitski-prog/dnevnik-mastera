import { useId, type CSSProperties, type ReactNode } from "react";

type ButterflyVariant = 0 | 1 | 2 | 3;

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

type ExactWingSet = {
  left: string[];
  right: string[];
};

// Exact outer contours extracted from the four butterflies supplied by the
// user. No generic butterfly template is used: each toolbar position reuses
// one of these original silhouettes and only receives the INKA section colour.
const EXACT_WINGS: Record<ButterflyVariant, ExactWingSet> = {
  0: {
    left: [
      "M12,8 L6,13 L4,17 L4,31 L10,45 L23,63 L29,68 L36,70 L52,70 L51,72 L35,78 L23,88 L16,101 L18,115 L23,121 L52,121 L61,112 L71,92 L73,93 L75,104 L75,52 L70,49 L63,38 L61,28 L61,35 L73,53 L71,57 L39,18 L25,9Z",
    ],
    right: [
      "M140,8 L130,8 L118,14 L93,41 L84,55 L81,57 L79,53 L91,35 L91,28 L90,36 L86,44 L79,52 L76,52 L76,105 L79,100 L79,93 L82,92 L89,109 L100,121 L129,121 L135,113 L136,101 L129,88 L117,78 L107,73 L101,72 L100,70 L116,70 L123,68 L129,63 L142,45 L148,30 L148,17 L145,11Z",
    ],
  },
  1: {
    left: [
      "M6,9 L4,11 L4,18 L13,37 L17,42 L17,45 L13,51 L14,58 L23,72 L32,80 L30,85 L32,89 L31,94 L36,98 L37,105 L41,107 L40,119 L44,119 L46,116 L54,117 L56,119 L64,112 L66,96 L70,86 L72,87 L72,97 L75,105 L75,52 L72,52 L64,42 L60,33 L60,27 L59,32 L61,38 L73,54 L70,59 L56,42 L36,22 L16,10Z",
    ],
    right: [
      "M146,9 L138,9 L133,11 L115,23 L105,32 L82,59 L79,54 L91,38 L93,29 L92,27 L92,33 L88,42 L79,53 L76,52 L76,105 L79,101 L80,87 L82,86 L85,92 L87,110 L95,119 L106,116 L108,119 L112,119 L111,107 L115,105 L116,98 L120,95 L120,80 L132,68 L138,58 L139,51 L135,45 L135,42 L139,37 L148,18 L148,11Z",
    ],
  },
  2: {
    left: [
      "M51,29 L51,34 L54,39 L67,52 L65,56 L49,44 L33,36 L21,32 L12,32 L8,36 L8,47 L12,66 L17,73 L24,75 L22,79 L22,88 L25,94 L25,107 L32,109 L32,113 L28,117 L22,119 L20,121 L20,124 L23,124 L26,120 L31,118 L34,115 L37,108 L40,108 L42,110 L41,114 L43,116 L45,110 L50,111 L52,108 L53,99 L64,80 L66,81 L66,88 L69,93 L72,92 L74,87 L75,56 L73,52 L75,49 L73,51 L67,51 L53,36Z",
      "M24,5 L25,6 L26,6 L27,7 L28,7 L29,8 L31,8 L32,9 L39,9 L40,8 L43,8 L44,7 L46,7 L47,6 L48,6 L49,5Z",
    ],
    right: [
      "M128,32 L119,32 L102,38 L86,47 L76,56 L76,81 L87,100 L88,109 L90,111 L95,110 L96,111 L95,114 L97,116 L98,115 L98,110 L100,108 L102,108 L105,111 L106,115 L117,124 L120,123 L119,120 L112,117 L108,113 L108,109 L115,107 L114,100 L115,99 L115,94 L118,87 L118,80 L116,75 L123,73 L127,68 L129,63 L131,47 L132,46 L132,37Z",
      "M143,34 L142,35 L141,35 L137,39 L137,42 L136,43 L136,46 L137,47 L137,49 L138,50 L138,52 L140,54 L140,55 L144,59 L144,34Z",
      "M97,5 L98,5 L99,6 L100,6 L101,7 L102,7 L103,8 L106,8 L107,9 L114,9 L115,8 L117,8 L118,7 L119,7 L120,6 L121,6 L122,5Z",
      "M89,29 L88,29 L88,30 L87,31 L87,32 L88,33 L88,34 L86,36 L86,37 L82,41 L82,42 L76,48 L76,49 L84,41 L84,40 L87,37 L87,36 L89,34Z",
    ],
  },
  3: {
    left: [
      "M6,33 L4,34 L4,61 L20,77 L16,85 L16,94 L19,108 L27,117 L42,124 L50,124 L61,113 L67,98 L69,99 L70,105 L73,106 L75,100 L75,60 L74,59 L75,55 L74,57 L70,57 L58,42 L56,33 L55,33 L55,36 L58,43 L69,57 L68,61 L66,61 L50,48 L36,40 L19,34Z",
      "M42,5 L39,5 L38,6 L38,8 L37,9 L37,13 L39,15 L40,15 L42,13Z",
    ],
    right: [
      "M145,36 L137,33 L130,33 L129,34 L125,34 L115,37 L98,45 L76,62 L76,99 L78,100 L78,104 L82,112 L90,122 L93,124 L102,124 L115,118 L123,111 L125,107 L125,103 L127,97 L127,91 L128,90 L127,83 L124,79 L124,77 L145,55 L148,49 L148,40Z",
      "M105,5 L105,13 L107,15 L108,15 L110,13 L110,9 L109,8 L109,6 L108,5Z",
      "M88,33 L87,34 L87,39 L86,40 L86,41 L85,42 L85,43 L83,45 L83,46 L80,49 L80,50 L76,54 L76,55 L80,51 L80,50 L83,47 L83,46 L85,44 L85,43 L86,42 L86,41 L87,40 L87,39 L88,38Z",
    ],
  },
};

const LEFT_VEINS = [
  "M75 58C61 50 46 34 27 16",
  "M74 61C55 59 34 51 12 36",
  "M73 65C56 70 39 84 27 107",
  "M71 68C64 84 59 99 57 114",
  "M63 52C52 41 42 28 37 14",
];

const RIGHT_VEINS = [
  "M77 58C91 50 106 34 125 16",
  "M78 61C97 59 118 51 140 36",
  "M79 65C96 70 113 84 125 107",
  "M81 68C88 84 93 99 95 114",
  "M89 52C100 41 110 28 115 14",
];

function WingLayer({ paths, clipId, fillId, washId, textureId, veins }: {
  paths: string[];
  clipId: string;
  fillId: string;
  washId: string;
  textureId: string;
  veins: string[];
}) {
  return (
    <>
      {paths.map((path, index) => (
        <path key={`base-${index}`} d={path} fill={`url(#${fillId})`} stroke="#5F493D" strokeWidth="1.05" strokeLinejoin="round" />
      ))}
      <g clipPath={`url(#${clipId})`}>
        <rect x="0" y="0" width="152" height="128" fill={`url(#${washId})`} opacity=".68" />
        <rect x="0" y="0" width="152" height="128" filter={`url(#${textureId})`} opacity=".34" />
        <g fill="none" stroke="#604A3F" strokeLinecap="round" opacity=".54">
          {veins.map((path) => <path key={path} d={path} strokeWidth=".52" />)}
        </g>
        <g fill="#5A4338" opacity=".56">
          <circle cx="24" cy="38" r="2.1" />
          <circle cx="35" cy="53" r="1.25" />
          <circle cx="48" cy="81" r="1.7" />
          <circle cx="128" cy="38" r="2.1" />
          <circle cx="117" cy="53" r="1.25" />
          <circle cx="104" cy="81" r="1.7" />
        </g>
        <path d="M16 24C32 17 53 30 70 53" fill="none" stroke="#FFF8EA" strokeWidth="1" opacity=".28" />
        <path d="M136 24C120 17 99 30 82 53" fill="none" stroke="#FFF8EA" strokeWidth="1" opacity=".28" />
      </g>
      {paths.map((path, index) => (
        <path key={`edge-${index}`} d={path} fill="none" stroke="#F7EDDE" strokeWidth=".38" opacity=".3" />
      ))}
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
}: ButterflyIconProps) {
  const uid = useId().replace(/:/g, "");
  const fillId = `butterfly-fill-${uid}`;
  const washId = `butterfly-wash-${uid}`;
  const textureId = `butterfly-texture-${uid}`;
  const shadowId = `butterfly-shadow-${uid}`;
  const leftClipId = `butterfly-left-${uid}`;
  const rightClipId = `butterfly-right-${uid}`;
  const wings = EXACT_WINGS[variant];
  const height = Math.round(size * (128 / 152));
  const style = {
    "--wing-open": Math.max(0.28, Math.min(1, openness)),
    "--flutter-duration": `${flutterDurationMs}ms`,
    "--flutter-delay": `${flutterDelayMs}ms`,
  } as CSSProperties;

  return (
    <span aria-hidden="true" className={active ? "butterfly-icon butterfly-icon--active" : "butterfly-icon"} style={{ ...style, width: size, height }}>
      <svg width={size} height={height} viewBox="0 0 152 128" style={{ display: "block", overflow: "visible" }}>
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#F9F0DF" stopOpacity=".96" />
            <stop offset=".2" stopColor={color} stopOpacity=".58" />
            <stop offset=".62" stopColor={color} stopOpacity=".94" />
            <stop offset="1" stopColor="#46342C" stopOpacity=".46" />
          </linearGradient>
          <radialGradient id={washId} cx=".34" cy=".2" r=".9">
            <stop offset="0" stopColor="#FFF9EC" stopOpacity=".82" />
            <stop offset=".48" stopColor={color} stopOpacity=".08" />
            <stop offset="1" stopColor="#3F3029" stopOpacity=".34" />
          </radialGradient>
          <filter id={textureId} x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency=".055" numOctaves="3" seed={variant + 7} result="noise" />
            <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0.36  0 0 0 0 0.28  0 0 0 0 0.22  0 0 0 .38 0" />
          </filter>
          <filter id={shadowId} x="-28%" y="-28%" width="156%" height="156%">
            <feDropShadow dx="0" dy="2.2" stdDeviation="1.7" floodColor="#503D33" floodOpacity=".2" />
            {active && <feDropShadow dx="0" dy="0" stdDeviation="1.8" floodColor={color} floodOpacity=".23" />}
          </filter>
          <clipPath id={leftClipId}>{wings.left.map((path, index) => <path key={index} d={path} />)}</clipPath>
          <clipPath id={rightClipId}>{wings.right.map((path, index) => <path key={index} d={path} />)}</clipPath>
        </defs>

        <g filter={`url(#${shadowId})`}>
          <g className="butterfly-icon__wing butterfly-icon__wing--left" style={{ transformOrigin: "76px 64px" }}>
            <WingLayer paths={wings.left} clipId={leftClipId} fillId={fillId} washId={washId} textureId={textureId} veins={LEFT_VEINS} />
          </g>
          <g className="butterfly-icon__wing butterfly-icon__wing--right" style={{ transformOrigin: "76px 64px" }}>
            <WingLayer paths={wings.right} clipId={rightClipId} fillId={fillId} washId={washId} textureId={textureId} veins={RIGHT_VEINS} />
          </g>

          <g className="butterfly-icon__body">
            <path d="M76 45C72.5 47 72 56 73 68C74 82 75 95 76 108C77 95 78 82 79 68C80 56 79.5 47 76 45Z" fill="#584238" stroke="#2E211C" strokeWidth=".9" />
            <ellipse cx="76" cy="42" rx="4.6" ry="4.1" fill="#675044" stroke="#2E211C" strokeWidth=".9" />
            <ellipse cx="76" cy="55" rx="4.1" ry="6.5" fill="#5B443A" stroke="#2E211C" strokeWidth=".7" />
            <path d="M73.7 40C67 29 61 24 54 21" fill="none" stroke="#49362F" strokeWidth="1" strokeLinecap="round" />
            <path d="M78.3 40C85 29 91 24 98 21" fill="none" stroke="#49362F" strokeWidth="1" strokeLinecap="round" />
            <circle cx="53.6" cy="20.8" r="1" fill="#49362F" />
            <circle cx="98.4" cy="20.8" r="1" fill="#49362F" />
            <path d="M72.8 61H79.2M73 68H79M73.2 75H78.8M73.6 82H78.4M74 89H78" stroke="#C1AA90" strokeWidth=".72" opacity=".72" />
          </g>
        </g>
      </svg>
    </span>
  );
}
