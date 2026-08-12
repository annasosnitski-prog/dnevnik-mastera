import { useId, type ReactNode } from 'react';

export type NaturalStoneKind =
  | 'rhodonite'
  | 'malachite'
  | 'star-sapphire'
  | 'fire-opal'
  | 'honey-jadeite'
  | 'turquoise';

const STONE_MATERIALS: Record<NaturalStoneKind, { body: string; deep: string; rim: string }> = {
  rhodonite: { body: '#C987A5', deep: '#70465D', rim: '#F0C7D9' },
  malachite: { body: '#087A4B', deep: '#03422F', rim: '#70C294' },
  'star-sapphire': { body: '#684086', deep: '#2B173D', rim: '#D2A7E8' },
  'fire-opal': { body: '#E88716', deep: '#71300B', rim: '#FFD16F' },
  'honey-jadeite': { body: '#B67A28', deep: '#60401B', rim: '#E6B96B' },
  turquoise: { body: '#159DD2', deep: '#074D7A', rim: '#9AEAFF' },
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
    ? 'M27.9 31.3C28.8 28.4 31.4 26.8 34.5 27.2'
    : 'M13.9 28.6C16.5 18.8 25.6 11.9 36.1 12.8C38.6 13 40.8 13.6 42.7 14.7';
  const upperCore = medallion
    ? 'M28.8 30.2C29.8 28.4 31.8 27.5 33.8 27.8'
    : 'M16.7 25.3C20.8 17.2 29.5 13.1 37.8 14.2';
  const lowerArc = medallion
    ? 'M36.4 34.9C35.2 36.6 33.5 37.5 31.4 37.5'
    : 'M49 40.7C46.6 47.4 40.2 51.9 32.8 52.7';

  const bevelStroke = medallion ? 1.55 : 5.4;
  const bevelBlur = medallion ? 0.22 : 0.72;
  const bevelShift = medallion ? 0.48 : 1.35;

  return (
    <g clipPath={`url(#${clipId})`} fill="none" strokeLinecap="round">
      {/* The stone is a shallow inward dish. Only the inner half of these
          oversized rim strokes survives the clip, which turns them into a
          physical inner bevel rather than an outer cabochon highlight. */}
      <circle
        cx="32"
        cy="32"
        r={stoneR}
        stroke="#FFFFFF"
        strokeWidth={bevelStroke}
        opacity={medallion ? '.34' : '.29'}
        transform={`translate(${-bevelShift} ${-bevelShift})`}
        filter={`url(#${softGlossId})`}
      />
      <circle
        cx="32"
        cy="32"
        r={stoneR}
        stroke={deepColor}
        strokeWidth={bevelStroke}
        opacity={medallion ? '.52' : '.5'}
        transform={`translate(${bevelShift} ${bevelShift})`}
        style={{ filter: `blur(${bevelBlur}px)` }}
      />

      {/* A narrow reflected line rides the upper inner wall; the broader
          glossy cabochon stripe is deliberately gone. */}
      <path d={upperArc} stroke={`url(#${glossId})`} strokeWidth={medallion ? '1.05' : '3.2'} opacity={medallion ? '.42' : '.32'} filter={`url(#${softGlossId})`} />
      <path d={upperArc} stroke={`url(#${glossId})`} strokeWidth={medallion ? '.48' : '1.08'} opacity={medallion ? '.72' : '.64'} />
      <path d={upperCore} stroke="#FFFFFF" strokeWidth={medallion ? '.22' : '.46'} opacity=".74" />

      {/* The lower wall catches a weak coloured reflection while staying
          darker than the raised upper rim, reinforcing the concavity. */}
      <path d={lowerArc} stroke={rimColor} strokeWidth={medallion ? '.5' : '1.45'} opacity=".25" />
      <path d={lowerArc} stroke={deepColor} strokeWidth={medallion ? '1.15' : '3.4'} opacity=".18" filter={`url(#${softGlossId})`} />
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
  const metalId = `copper-metal-${rawId}`;
  const edgeId = `copper-edge-${rawId}`;
  const flatId = `flat-copper-${rawId}`;
  const clipId = `stone-clip-${rawId}`;
  const shadowId = `copper-shadow-${rawId}`;
  const insetId = `stone-inset-${rawId}`;
  const depthId = `stone-depth-${rawId}`;
  const wallShadeId = `stone-wall-shade-${rawId}`;
  const floorLightId = `stone-floor-light-${rawId}`;
  const glossId = `stone-gloss-${rawId}`;
  const softGlossId = `stone-soft-gloss-${rawId}`;
  const material = kind ? STONE_MATERIALS[kind] : undefined;
  const stoneColor = material?.body ?? '#A2613C';
  const outerR = medallion ? 25.5 : 29;
  const stoneR = medallion ? 5.25 : 23;
  const stoneDiameter = stoneR * 2;
  const spriteIndex = kind ? STONE_SPRITE_INDEX[kind] : 0;

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
        <linearGradient id={metalId} x1=".08" y1=".06" x2=".92" y2=".96">
          <stop offset="0" stopColor="#CC9D75" />
          <stop offset=".14" stopColor="#A2775A" />
          <stop offset=".38" stopColor="#94694E" />
          <stop offset=".59" stopColor="#543323" />
          <stop offset=".81" stopColor="#724C39" />
          <stop offset="1" stopColor="#875B43" />
        </linearGradient>
        <linearGradient id={flatId} x1=".1" y1="0" x2=".9" y2="1">
          <stop offset="0" stopColor="#A2775A" />
          <stop offset=".46" stopColor="#94694E" />
          <stop offset="1" stopColor="#584335" />
        </linearGradient>
        <linearGradient id={edgeId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2F1D13" />
          <stop offset=".18" stopColor="#CC9D75" />
          <stop offset=".38" stopColor="#724C39" />
          <stop offset=".56" stopColor="#A2775A" />
          <stop offset=".76" stopColor="#506A61" />
          <stop offset="1" stopColor="#7C9388" />
        </linearGradient>
        <clipPath id={clipId}>
          <circle cx="32" cy="32" r={stoneR} />
        </clipPath>
        <filter id={shadowId} x="-45%" y="-45%" width="190%" height="200%">
          <feDropShadow dx="0" dy="1.4" stdDeviation="1.25" floodColor="#050606" floodOpacity=".58" />
        </filter>
        <filter id={insetId} x="-35%" y="-35%" width="170%" height="170%">
          <feGaussianBlur in="SourceAlpha" stdDeviation={medallion ? '.35' : '.9'} result="blur" />
          <feOffset dx={medallion ? '.28' : '.65'} dy={medallion ? '.38' : '.9'} result="offset" />
          <feComposite in="offset" in2="SourceAlpha" operator="out" result="inner" />
          <feColorMatrix in="inner" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 .62 0" />
          <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>

        {/* The bowl floor is darker around the optical centre, then opens back
            toward the walls. The stone texture remains visible underneath. */}
        <radialGradient id={depthId} gradientUnits="userSpaceOnUse" cx="33.5" cy="34" r={stoneR * 1.08}>
          <stop offset="0" stopColor={material?.deep ?? '#4B2C25'} stopOpacity={medallion ? '.31' : '.28'} />
          <stop offset=".37" stopColor={material?.deep ?? '#4B2C25'} stopOpacity={medallion ? '.18' : '.14'} />
          <stop offset=".68" stopColor={stoneColor} stopOpacity="0" />
          <stop offset="1" stopColor={material?.deep ?? '#4B2C25'} stopOpacity={medallion ? '.16' : '.11'} />
        </radialGradient>
        <linearGradient id={wallShadeId} gradientUnits="userSpaceOnUse" x1="18" y1="16" x2="47" y2="49">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity={medallion ? '.11' : '.09'} />
          <stop offset=".4" stopColor="#FFFFFF" stopOpacity="0" />
          <stop offset=".72" stopColor={material?.deep ?? '#4B2C25'} stopOpacity=".08" />
          <stop offset="1" stopColor={material?.deep ?? '#4B2C25'} stopOpacity={medallion ? '.24' : '.2'} />
        </linearGradient>
        <radialGradient id={floorLightId} gradientUnits="userSpaceOnUse" cx="28" cy="39" r={stoneR * .86}>
          <stop offset="0" stopColor={material?.rim ?? stoneColor} stopOpacity={medallion ? '.09' : '.08'} />
          <stop offset=".48" stopColor={material?.rim ?? stoneColor} stopOpacity=".035" />
          <stop offset="1" stopColor={material?.rim ?? stoneColor} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={glossId} gradientUnits="userSpaceOnUse" x1="14" y1="18" x2="43" y2="24">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity=".08" />
          <stop offset=".26" stopColor="#FFFFFF" stopOpacity=".72" />
          <stop offset=".68" stopColor="#FFFFFF" stopOpacity=".36" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity=".04" />
        </linearGradient>
        <filter id={softGlossId} x="-30%" y="-40%" width="160%" height="180%">
          <feGaussianBlur stdDeviation={medallion ? '.28' : '.92'} />
        </filter>
      </defs>

      <g filter={`url(#${shadowId})`}>
        <circle cx="32" cy="32" r={outerR} fill={`url(#${metalId})`} stroke="#2F1D13" strokeWidth="1.15" />
        <circle cx="32" cy="32" r={outerR - 1.8} fill="none" stroke={`url(#${edgeId})`} strokeWidth="1" />
        <circle cx="32" cy="32" r={outerR - 3.8} fill="none" stroke="#584335" strokeWidth="1.05" opacity=".9" />
        <path d="M13 17a25 25 0 0 1 12-8M48 48a24 24 0 0 1-14 8" fill="none" stroke="#657C72" strokeWidth="1.2" strokeLinecap="round" strokeDasharray="4 2 1 4" opacity=".46" />
        <path d="M50 18a24 24 0 0 1 5 13M9 37a24 24 0 0 1 3-12" fill="none" stroke="#3F5A52" strokeWidth=".95" strokeLinecap="round" strokeDasharray="3 3 1 4" opacity=".52" />

        {plate || !kind ? (
          <>
            <circle cx="32" cy="32" r={outerR - 5.2} fill={`url(#${flatId})`} stroke="#AA866A" strokeWidth=".55" />
            <circle cx="32" cy="32" r={outerR - 8.2} fill="none" stroke="#735D4D" strokeWidth=".65" opacity=".75" />
            <path d="M16 24c5-7 13-10 21-8M44 46c-7 4-15 4-22 0" fill="none" stroke="#657C72" strokeWidth="1.15" strokeLinecap="round" strokeDasharray="5 2 1 5" opacity=".38" />
            <path d="M18 43c-3-5-4-10-2-15M47 22c3 5 3 10 2 15" fill="none" stroke="#3F5A52" strokeWidth=".75" strokeLinecap="round" strokeDasharray="3 4" opacity=".46" />
          </>
        ) : (
          <>
            <circle cx="32" cy="32" r={stoneR + (medallion ? 2.2 : 1.6)} fill="#584335" stroke={`url(#${edgeId})`} strokeWidth={medallion ? 1.1 : 1.25} />
            <path d={medallion ? 'M27 30a6 6 0 0 1 4-4M36 37a6 6 0 0 1-4 1' : 'M14 26a21 21 0 0 1 13-13M49 45a21 21 0 0 1-13 6'} fill="none" stroke="#657C72" strokeWidth={medallion ? '.55' : '.9'} strokeLinecap="round" opacity=".48" />
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
              />
              <circle cx="32" cy="32" r={stoneR} fill={`url(#${wallShadeId})`} opacity=".9" />
              <circle cx="32" cy="32" r={stoneR} fill={`url(#${depthId})`} opacity=".94" />
              <circle cx="32" cy="32" r={stoneR} fill={`url(#${floorLightId})`} opacity=".85" />
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
                strokeWidth={medallion ? '.36' : '.62'}
                opacity=".42"
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
