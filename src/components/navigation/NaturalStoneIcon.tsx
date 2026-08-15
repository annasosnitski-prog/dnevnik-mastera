import { useId, type ReactNode } from 'react';
import './NaturalStoneIcon.css';

export type NaturalStoneKind =
  | 'rhodonite'
  | 'malachite'
  | 'star-sapphire'
  | 'fire-opal'
  | 'honey-jadeite'
  | 'turquoise';

const STONE_MATERIALS: Record<NaturalStoneKind, { body: string; deep: string; rim: string }> = {
  rhodonite: { body: '#B94E7E', deep: '#55243D', rim: '#F09CBD' },
  malachite: { body: '#006B3C', deep: '#002F20', rim: '#5CCB8C' },
  'star-sapphire': { body: '#592174', deep: '#230B32', rim: '#C98EE7' },
  'fire-opal': { body: '#D56800', deep: '#5A2400', rim: '#FFB63F' },
  'honey-jadeite': { body: '#9F5A0A', deep: '#3F2308', rim: '#EFAE3F' },
  turquoise: { body: '#006EAC', deep: '#003550', rim: '#64CFFF' },
};

// Enlarged surface samples from the supplied macrovector / Freepik mineral
// set. Internal names stay stable so navigation semantics do not change.
const STONE_SPRITE_INDEX: Record<NaturalStoneKind, number> = {
  rhodonite: 0, // rose quartz
  malachite: 1,
  'star-sapphire': 2, // amethyst
  'fire-opal': 3, // amber
  'honey-jadeite': 4, // tiger's eye
  turquoise: 5, // blue agate
};

function StoneSurfaceLight({
  medallion,
  clipId,
  glossId,
  softGlossId,
  rimColor,
  deepColor,
  stoneR,
}: {
  medallion: boolean;
  clipId: string;
  glossId: string;
  softGlossId: string;
  rimColor: string;
  deepColor: string;
  stoneR: number;
}) {
  const upperArc = medallion
    ? 'M27.7 31.5C28.6 28.2 31.3 26.5 34.7 27.1'
    : 'M13.2 29.1C15.8 18.3 25.2 11.2 36.4 12.4C39 12.7 41.2 13.4 43.2 14.6';
  const upperCore = medallion
    ? 'M28.6 30.1C29.7 28.1 31.8 27.2 34 27.6'
    : 'M16 25.5C20.2 16.8 29.4 12.7 38.1 13.9';
  const lowerArc = medallion
    ? 'M36.6 34.7C35.4 36.8 33.5 37.8 31.1 37.7'
    : 'M49.5 40.3C47 47.8 40.3 52.5 32.5 53.2';

  const bevelStroke = medallion ? 1.82 : 6.25;
  const bevelBlur = medallion ? 0.26 : 0.84;
  const bevelShift = medallion ? 0.58 : 1.58;

  return (
    <g clipPath={`url(#${clipId})`} fill="none" strokeLinecap="round">
      {/* Oversized strokes are clipped to the stone, so only their inner half
          remains visible. The brighter upper wall and darker lower wall make
          the mineral read as a carved shallow bowl rather than a domed cabochon. */}
      <circle
        cx="32"
        cy="32"
        r={stoneR}
        stroke="#FFFFFF"
        strokeWidth={bevelStroke}
        opacity={medallion ? '.42' : '.37'}
        transform={`translate(${-bevelShift} ${-bevelShift})`}
        filter={`url(#${softGlossId})`}
      />
      <circle
        cx="32"
        cy="32"
        r={stoneR}
        stroke={deepColor}
        strokeWidth={bevelStroke}
        opacity={medallion ? '.68' : '.64'}
        transform={`translate(${bevelShift} ${bevelShift})`}
        style={{ filter: `blur(${bevelBlur}px)` }}
      />

      <path d={upperArc} stroke={`url(#${glossId})`} strokeWidth={medallion ? '1.22' : '3.7'} opacity={medallion ? '.5' : '.4'} filter={`url(#${softGlossId})`} />
      <path d={upperArc} stroke={`url(#${glossId})`} strokeWidth={medallion ? '.54' : '1.24'} opacity={medallion ? '.82' : '.75'} />
      <path d={upperCore} stroke="#FFFFFF" strokeWidth={medallion ? '.26' : '.54'} opacity=".9" />

      <path d={lowerArc} stroke={rimColor} strokeWidth={medallion ? '.62' : '1.72'} opacity=".38" />
      <path d={lowerArc} stroke={deepColor} strokeWidth={medallion ? '1.35' : '4'} opacity=".28" filter={`url(#${softGlossId})`} />
    </g>
  );
}

export function NaturalStoneIcon({
  kind,
  size,
  plate = false,
  medallion = false,
  children,
}: {
  kind?: NaturalStoneKind;
  size: number;
  plate?: boolean;
  medallion?: boolean;
  children?: ReactNode;
}) {
  const rawId = useId().replace(/:/g, '');
  const metalId = `bronze-metal-${rawId}`;
  const edgeId = `bronze-edge-${rawId}`;
  const flatId = `flat-bronze-${rawId}`;
  const plateClipId = `bronze-plate-clip-${rawId}`;
  const plateShineId = `bronze-plate-shine-${rawId}`;
  const plateShineMaskId = `bronze-plate-shine-mask-${rawId}`;
  const clipId = `stone-clip-${rawId}`;
  const shadowId = `bronze-shadow-${rawId}`;
  const insetId = `stone-inset-${rawId}`;
  const stoneToneId = `stone-tone-${rawId}`;
  const depthId = `stone-depth-${rawId}`;
  const wallShadeId = `stone-wall-shade-${rawId}`;
  const floorLightId = `stone-floor-light-${rawId}`;
  const glossId = `stone-gloss-${rawId}`;
  const softGlossId = `stone-soft-gloss-${rawId}`;
  const material = kind ? STONE_MATERIALS[kind] : undefined;
  const stoneColor = material?.body ?? '#9A5A28';
  const outerR = medallion ? 25.5 : 29;
  const stoneR = medallion ? 5.25 : 23;
  const stoneDiameter = stoneR * 2;
  const spriteIndex = kind ? STONE_SPRITE_INDEX[kind] : 0;
  const isHomePlate = plate && !children;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      className={medallion ? 'natural-stone-icon natural-stone-icon--medallion' : 'natural-stone-icon'}
      style={{ display: 'block', overflow: 'visible', ['--stone-color' as string]: stoneColor }}
    >
      <defs>
        <linearGradient id={metalId} x1=".06" y1=".03" x2=".94" y2=".97">
          <stop offset="0" stopColor="#633418" />
          <stop offset=".1" stopColor="#A86531" />
          <stop offset=".23" stopColor="#E2A35F" />
          <stop offset=".33" stopColor="#F4CB91" />
          <stop offset=".43" stopColor="#C47A3D" />
          <stop offset=".58" stopColor="#663317" />
          <stop offset=".72" stopColor="#A65C2A" />
          <stop offset=".87" stopColor="#E5A15A" />
          <stop offset="1" stopColor="#75401F" />
        </linearGradient>
        <linearGradient id={flatId} x1=".08" y1="0" x2=".92" y2="1">
          <stop offset="0" stopColor="#D99B56" />
          <stop offset=".2" stopColor="#F0C282" />
          <stop offset=".42" stopColor="#B96D34" />
          <stop offset=".68" stopColor="#7A3F1D" />
          <stop offset=".86" stopColor="#B86B31" />
          <stop offset="1" stopColor="#603017" />
        </linearGradient>
        <linearGradient id={edgeId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#271308" />
          <stop offset=".16" stopColor="#F5D09A" />
          <stop offset=".31" stopColor="#B46A34" />
          <stop offset=".48" stopColor="#6A3518" />
          <stop offset=".65" stopColor="#E1A35F" />
          <stop offset=".82" stopColor="#8A4A23" />
          <stop offset="1" stopColor="#D08A49" />
        </linearGradient>
        <linearGradient id={plateShineId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#D8893E" stopOpacity="0" />
          <stop offset=".16" stopColor="#E9A657" stopOpacity=".14" />
          <stop offset=".34" stopColor="#F0BB70" stopOpacity=".46" />
          <stop offset=".47" stopColor="#F5CA88" stopOpacity=".92" />
          <stop offset=".54" stopColor="#FFE2AA" stopOpacity="1" />
          <stop offset=".63" stopColor="#F3C078" stopOpacity=".88" />
          <stop offset=".8" stopColor="#E39A4B" stopOpacity=".18" />
          <stop offset="1" stopColor="#C97732" stopOpacity="0" />
        </linearGradient>
        <clipPath id={plateClipId}>
          <circle cx="32" cy="32" r={outerR - 0.8} />
        </clipPath>
        <mask id={plateShineMaskId} maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">
          <circle cx="32" cy="32" r={outerR - 0.8} fill="white" />
          <circle cx="32" cy="32" r={outerR - 3.8} fill="none" stroke="black" strokeWidth="1.55" />
          <circle cx="32" cy="32" r={outerR - 8.2} fill="none" stroke="black" strokeWidth="1.3" />
        </mask>
        <clipPath id={clipId}>
          <circle cx="32" cy="32" r={stoneR} />
        </clipPath>
        <filter id={shadowId} x="-45%" y="-45%" width="190%" height="200%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="1.2" floodColor="#1E0D05" floodOpacity=".62" />
          <feDropShadow dx="-.35" dy="-.35" stdDeviation=".34" floodColor="#F4C483" floodOpacity=".28" />
        </filter>
        <filter id={insetId} x="-35%" y="-35%" width="170%" height="170%">
          <feGaussianBlur in="SourceAlpha" stdDeviation={medallion ? '.4' : '1.08'} result="blur" />
          <feOffset dx={medallion ? '.34' : '.8'} dy={medallion ? '.48' : '1.12'} result="offset" />
          <feComposite in="offset" in2="SourceAlpha" operator="out" result="inner" />
          <feColorMatrix in="inner" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 .78 0" />
          <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id={stoneToneId} x="-8%" y="-8%" width="116%" height="116%" colorInterpolationFilters="sRGB">
          <feColorMatrix type="saturate" values="1.42" result="saturated" />
          <feComponentTransfer in="saturated">
            <feFuncR type="linear" slope="1.08" intercept="-.11" />
            <feFuncG type="linear" slope="1.08" intercept="-.11" />
            <feFuncB type="linear" slope="1.08" intercept="-.11" />
          </feComponentTransfer>
        </filter>

        <radialGradient id={depthId} gradientUnits="userSpaceOnUse" cx="33.7" cy="34.4" r={stoneR * 1.08}>
          <stop offset="0" stopColor={material?.deep ?? '#4B2C25'} stopOpacity={medallion ? '.43' : '.39'} />
          <stop offset=".38" stopColor={material?.deep ?? '#4B2C25'} stopOpacity={medallion ? '.27' : '.23'} />
          <stop offset=".68" stopColor={stoneColor} stopOpacity="0" />
          <stop offset="1" stopColor={material?.deep ?? '#4B2C25'} stopOpacity={medallion ? '.23' : '.2'} />
        </radialGradient>
        <linearGradient id={wallShadeId} gradientUnits="userSpaceOnUse" x1="17" y1="15" x2="48" y2="50">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity={medallion ? '.14' : '.12'} />
          <stop offset=".38" stopColor="#FFFFFF" stopOpacity="0" />
          <stop offset=".7" stopColor={material?.deep ?? '#4B2C25'} stopOpacity=".13" />
          <stop offset="1" stopColor={material?.deep ?? '#4B2C25'} stopOpacity={medallion ? '.34' : '.3'} />
        </linearGradient>
        <radialGradient id={floorLightId} gradientUnits="userSpaceOnUse" cx="27.5" cy="39.5" r={stoneR * .9}>
          <stop offset="0" stopColor={material?.rim ?? stoneColor} stopOpacity={medallion ? '.17' : '.15'} />
          <stop offset=".46" stopColor={material?.rim ?? stoneColor} stopOpacity=".07" />
          <stop offset="1" stopColor={material?.rim ?? stoneColor} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={glossId} gradientUnits="userSpaceOnUse" x1="13" y1="17" x2="44" y2="24">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity=".1" />
          <stop offset=".24" stopColor="#FFFFFF" stopOpacity=".82" />
          <stop offset=".65" stopColor="#FFFFFF" stopOpacity=".46" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity=".05" />
        </linearGradient>
        <filter id={softGlossId} x="-30%" y="-40%" width="160%" height="180%">
          <feGaussianBlur stdDeviation={medallion ? '.3' : '.98'} />
        </filter>
      </defs>

      <g filter={`url(#${shadowId})`}>
        <circle cx="32" cy="32" r={outerR} fill={`url(#${metalId})`} stroke="#271308" strokeWidth="1.15" />
        <circle cx="32" cy="32" r={outerR - 1.8} fill="none" stroke={`url(#${edgeId})`} strokeWidth="1.05" />
        <circle cx="32" cy="32" r={outerR - 3.8} fill="none" stroke="#6D381A" strokeWidth="1" opacity=".92" />
        <path d="M13 17a25 25 0 0 1 12-8M48 48a24 24 0 0 1-14 8" fill="none" stroke="#F1C282" strokeWidth=".72" strokeLinecap="round" opacity=".34" />
        <path d="M50 18a24 24 0 0 1 5 13M9 37a24 24 0 0 1 3-12" fill="none" stroke="#3E2112" strokeWidth=".78" strokeLinecap="round" opacity=".38" />

        {plate || !kind ? (
          <>
            <circle cx="32" cy="32" r={outerR - 5.2} fill={`url(#${flatId})`} stroke="#DCA363" strokeWidth=".62" />
            <circle cx="32" cy="32" r={outerR - 8.2} fill="none" stroke="#6F3D20" strokeWidth=".68" opacity=".82" />
            {!isHomePlate && (
              <>
                <path d="M16 24c5-7 13-10 21-8M44 46c-7 4-15 4-22 0" fill="none" stroke="#F0C181" strokeWidth=".72" strokeLinecap="round" opacity=".28" />
                <path d="M18 43c-3-5-4-10-2-15M47 22c3 5 3 10 2 15" fill="none" stroke="#4A2816" strokeWidth=".68" strokeLinecap="round" opacity=".38" />
              </>
            )}

            {isHomePlate && (
              <g
                className="natural-stone-home-shine"
                clipPath={`url(#${plateClipId})`}
                mask={`url(#${plateShineMaskId})`}
                pointerEvents="none"
              >
                <g transform="rotate(45 32 32)">
                  <rect x="-50" y="-24" width="19" height="112" fill={`url(#${plateShineId})`} opacity="0">
                    <animate
                      attributeName="x"
                      values="-50;-50;92;92"
                      keyTimes="0;0.52;0.8;1"
                      dur="18s"
                      calcMode="spline"
                      keySplines="0 0 1 1;0.18 0.82 0.2 1;0 0 1 1"
                      repeatCount="indefinite"
                    />
                    <animate
                      attributeName="opacity"
                      values="0;0;1;1;0;0"
                      keyTimes="0;.53;.57;.77;.81;1"
                      dur="18s"
                      calcMode="linear"
                      repeatCount="indefinite"
                    />
                  </rect>
                </g>
              </g>
            )}
          </>
        ) : (
          <>
            <circle cx="32" cy="32" r={stoneR + (medallion ? 2.2 : 1.6)} fill="#663317" stroke={`url(#${edgeId})`} strokeWidth={medallion ? 1.1 : 1.25} />
            <path d={medallion ? 'M27 30a6 6 0 0 1 4-4M36 37a6 6 0 0 1-4 1' : 'M14 26a21 21 0 0 1 13-13M49 45a21 21 0 0 1-13 6'} fill="none" stroke="#E8AF6A" strokeWidth={medallion ? '.46' : '.72'} strokeLinecap="round" opacity=".34" />
            <g className="natural-stone-cabochon natural-stone-cabochon--concave" filter={`url(#${insetId})`}>
              <circle cx="32" cy="32" r={stoneR} fill={stoneColor} />
              <image
                href="/mineral-cabochons.webp"
                x={32 - stoneR - spriteIndex * stoneDiameter}
                y={32 - stoneR}
                width={stoneDiameter * 6}
                height={stoneDiameter}
                preserveAspectRatio="none"
                clipPath={`url(#${clipId})`}
                filter={`url(#${stoneToneId})`}
              />
              <circle cx="32" cy="32" r={stoneR} fill={`url(#${wallShadeId})`} opacity=".98" />
              <circle cx="32" cy="32" r={stoneR} fill={`url(#${depthId})`} opacity="1" />
              <circle cx="32" cy="32" r={stoneR} fill={`url(#${floorLightId})`} opacity="1" />
              <StoneSurfaceLight
                medallion={medallion}
                clipId={clipId}
                glossId={glossId}
                softGlossId={softGlossId}
                rimColor={material?.rim ?? stoneColor}
                deepColor={material?.deep ?? '#4B2C25'}
                stoneR={stoneR}
              />
              <circle
                cx="32"
                cy="32"
                r={stoneR - (medallion ? .25 : .5)}
                fill="none"
                stroke={material?.rim ?? stoneColor}
                strokeWidth={medallion ? '.42' : '.7'}
                opacity=".52"
              />
            </g>
          </>
        )}
      </g>

      {children && (
        <g className="natural-stone-glyph" transform="translate(32 32)" stroke="#121516" fill="none" style={{ filter: 'drop-shadow(0 .6px .35px rgba(255,255,255,.7))' }}>
          {children}
        </g>
      )}
    </svg>
  );
}