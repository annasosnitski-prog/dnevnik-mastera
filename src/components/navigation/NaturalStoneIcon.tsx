import { useId, type ReactNode } from 'react';

export type NaturalStoneKind =
  | 'rhodonite'
  | 'malachite'
  | 'star-sapphire'
  | 'fire-opal'
  | 'honey-jadeite'
  | 'turquoise';

const STONE_MATERIALS: Record<NaturalStoneKind, { light: string; body: string; deep: string; rim: string }> = {
  rhodonite: { light: '#F28AAA', body: '#C53F6C', deep: '#671C3B', rim: '#FFB1C5' },
  malachite: { light: '#69C496', body: '#087A4B', deep: '#03422F', rim: '#70C294' },
  'star-sapphire': { light: '#8278E0', body: '#3D348F', deep: '#16164C', rim: '#AAA8FF' },
  'fire-opal': { light: '#FF9C35', body: '#E64B18', deep: '#8E1712', rim: '#FFD36E' },
  'honey-jadeite': { light: '#FFE782', body: '#D4A42F', deep: '#7B5816', rim: '#FFF0A9' },
  turquoise: { light: '#3DDBE2', body: '#129CB2', deep: '#086176', rim: '#91F1EA' },
};

function StoneTexture({
  kind,
  clipId,
  veinId,
  noiseId,
  glowId,
}: {
  kind: NaturalStoneKind;
  clipId: string;
  veinId: string;
  noiseId: string;
  glowId: string;
}) {
  const mineralNoise = (
    <g clipPath={`url(#${clipId})`} opacity=".44" style={{ mixBlendMode: 'soft-light' }}>
      <rect x="7" y="7" width="50" height="50" filter={`url(#${noiseId})`} />
    </g>
  );

  switch (kind) {
    case 'rhodonite':
      return (
        <>
          {mineralNoise}
          <g clipPath={`url(#${clipId})`} fill="#8B294E" opacity=".38" filter={`url(#${glowId})`}>
            <ellipse cx="17" cy="16" rx="8.5" ry="5.5" transform="rotate(18 17 16)" />
            <ellipse cx="46" cy="42" rx="11" ry="6.5" transform="rotate(-21 46 42)" />
          </g>
          <g clipPath={`url(#${clipId})`} fill="none" strokeLinecap="round" strokeLinejoin="round" filter={`url(#${veinId})`}>
            <path d="M4 17c9 2 10 9 18 10 7 1 8-8 16-7 9 1 10-8 24-12" stroke="#24171D" strokeWidth="2.4" opacity=".9" />
            <path d="M-2 49c10-3 14-11 23-10 8 1 9-7 17-8 8-1 15 4 29-6" stroke="#301920" strokeWidth="1.65" opacity=".9" />
            <path d="M22 27c-3 6 3 8 0 13m16-20c-4 5-1 8-6 12m6-1c4 4 5 8 11 10" stroke="#151115" strokeWidth=".75" opacity=".88" />
            <path d="M3 33c8-2 11 5 17 3m27-20c3 5 8 5 14 3M31 45c2 5 6 8 11 11" stroke="#592035" strokeWidth=".55" opacity=".8" />
            <path d="M8 9c7 8 14 8 20 13 6 5 13 6 23 4" stroke="#F17F9F" strokeWidth="3.6" opacity=".2" />
          </g>
        </>
      );
    case 'malachite':
      return (
        <g clipPath={`url(#${clipId})`} fill="none" strokeLinecap="round">
          <ellipse cx="25" cy="29" rx="25" ry="15" transform="rotate(-24 25 29)" stroke="#053D2B" strokeWidth="5.2" opacity=".9" />
          <ellipse cx="25" cy="29" rx="18" ry="10.2" transform="rotate(-24 25 29)" stroke="#3EBD78" strokeWidth="3.8" opacity=".82" />
          <ellipse cx="25" cy="29" rx="11" ry="6" transform="rotate(-24 25 29)" stroke="#032E21" strokeWidth="3" opacity=".86" />
          <path d="M-2 13C12 3 22 7 34 2s23-5 35 0M-4 52c14-12 28-8 40-16s20-7 34-6" stroke="#7ED39D" strokeWidth="2.2" opacity=".55" />
          <path d="M-5 19C8 11 18 15 31 9S51 2 68 8M0 61c15-10 26-6 40-14s20-7 31-5" stroke="#063B2A" strokeWidth="2.4" opacity=".7" />
        </g>
      );
    case 'star-sapphire':
      return (
        <g clipPath={`url(#${clipId})`}>
          {mineralNoise}
          <ellipse cx="24" cy="22" rx="16" ry="11" fill="#A8A1F2" opacity=".17" filter={`url(#${glowId})`} />
          <ellipse cx="43" cy="42" rx="15" ry="11" fill="#11164D" opacity=".27" filter={`url(#${glowId})`} />
          <path d="M8 38c12-8 20-5 30-11s17-7 27-4" fill="none" stroke="#706AC2" strokeWidth="4.5" opacity=".09" filter={`url(#${glowId})`} />
          <g fill="none" strokeLinecap="round" opacity=".2" filter={`url(#${glowId})`}>
            <path d="M9 29c11-6 21-8 34-5s17 1 23-1" stroke="#BAB7FF" strokeWidth="2.4" />
            <path d="M3 42c14 2 23-1 32-6s18-4 28-1" stroke="#25205F" strokeWidth="3.1" />
          </g>
          <g fill="none" stroke="#9690DC" strokeWidth=".42" opacity=".18" filter={`url(#${veinId})`}>
            <path d="M7 18c12 5 20 3 29-2s16-3 24 1" /><path d="M4 47c10-4 17-2 26-5s18-3 31 1" />
          </g>
          <g fill="none" strokeLinecap="round" opacity=".3">
            <path d="M10 25c9-4 18-4 27-7s15-2 21 1" stroke="#C7C5FF" strokeWidth=".52" />
            <path d="M7 44c11-1 19-4 27-8s16-5 24-2" stroke="#7771C8" strokeWidth=".66" />
            <path d="M16 52c8-5 15-7 23-8" stroke="#27255F" strokeWidth=".78" />
          </g>
          <g transform="translate(28 27) rotate(-4)" stroke="#EEEFFF" strokeLinecap="round">
            <path d="M0-22V20M-18-10 17 10M18-10.5-17 9.5" stroke="#BDBDFF" strokeWidth="4.8" opacity=".09" filter={`url(#${glowId})`} />
            <path d="M0-20V18" stroke="#DFDEFF" strokeWidth=".72" opacity=".45" />
            <path d="M-17-9.5 16 9M17-9.8-16 9" stroke="#D6D5FF" strokeWidth=".62" opacity=".36" />
            <circle r="1.6" fill="#DAD9FF" stroke="none" opacity=".3" filter={`url(#${glowId})`} />
          </g>
        </g>
      );
    case 'fire-opal':
      return (
        <g clipPath={`url(#${clipId})`}>
          {mineralNoise}
          <g filter={`url(#${veinId})`} style={{ mixBlendMode: 'screen' }}>
            <path d="M4 15c7-8 13-4 19-7 6-4 12-5 19-2-5 4-9 10-17 11-8 2-13-4-21-2Z" fill="#FFD85E" opacity=".36" />
            <path d="M31 9c7-5 17-2 27 4-7 1-11 7-18 8-6-1-9-5-9-12Z" fill="#FF8B2C" opacity=".25" />
            <path d="M5 47c7-7 14-6 20-14 3 8 8 11 15 12-8 8-22 12-35 2Z" fill="#FF6A28" opacity=".25" />
            <path d="M28 37c7-5 15-4 28-1-5 10-14 16-25 18-5-5-6-11-3-17Z" fill="#FFB13D" opacity=".28" />
            <path d="M9 10c5 0 8 3 10 7-5 0-8 4-13 3 1-4 2-7 3-10ZM38 24c5-3 9-2 13 1-4 2-6 6-11 7-3-2-3-5-2-8Z" fill="#83DF93" opacity=".2" />
            <path d="M16 46c6-4 13-4 20-2-4 3-9 5-17 6Z" fill="#FFF06A" opacity=".32" />
          </g>
          <g filter={`url(#${glowId})`} style={{ mixBlendMode: 'screen' }}>
            <ellipse cx="17" cy="16" rx="5" ry="2.5" fill="#FFF06A" opacity=".34" transform="rotate(-22 17 16)" />
            <ellipse cx="43" cy="27" rx="3.5" ry="2.2" fill="#77D98B" opacity=".2" />
            <ellipse cx="29" cy="46" rx="4.5" ry="2" fill="#FFD75C" opacity=".3" transform="rotate(-12 29 46)" />
          </g>
          <g fill="none" strokeLinecap="round" strokeLinejoin="round" opacity=".38" style={{ mixBlendMode: 'screen' }}>
            <path d="M7 18c7 2 13 1 18-2s10-3 16-1" stroke="#FFE270" strokeWidth=".58" />
            <path d="M15 36c6-3 11-7 14-13 3 6 8 9 14 10" stroke="#FF8F3F" strokeWidth=".65" />
            <path d="M27 49c7-5 15-7 24-6" stroke="#9CEB9F" strokeWidth=".52" />
          </g>
          <g fill="#FFF4A8" opacity=".58">
            <circle cx="17" cy="28" r="1.05" />
            <circle cx="34" cy="22" r=".7" />
            <circle cx="47" cy="40" r=".9" />
            <circle cx="24" cy="51" r=".55" />
          </g>
          <g opacity=".48" style={{ mixBlendMode: 'screen' }}>
            <circle cx="13" cy="37" r=".72" fill="#7DE894" /><circle cx="22" cy="20" r=".52" fill="#FFE95F" />
            <circle cx="38" cy="13" r=".62" fill="#8EE5A1" /><circle cx="51" cy="31" r=".55" fill="#FFF178" />
            <circle cx="35" cy="52" r=".48" fill="#70C9ED" /><circle cx="44" cy="45" r=".7" fill="#FFB14B" />
          </g>
        </g>
      );
    case 'honey-jadeite':
      return (
        <g clipPath={`url(#${clipId})`}>
          {mineralNoise}
          <ellipse cx="18" cy="18" rx="15" ry="10" fill="#FFF3B5" opacity=".3" filter={`url(#${glowId})`} />
          <ellipse cx="45" cy="42" rx="20" ry="15" fill="#755019" opacity=".27" filter={`url(#${glowId})`} />
          <ellipse cx="37" cy="18" rx="8" ry="13" fill="#F8CE58" opacity=".2" filter={`url(#${glowId})`} />
          <g fill="#FFF0A0" opacity=".14" filter={`url(#${glowId})`}>
            <ellipse cx="14" cy="39" rx="6" ry="3.4" /><ellipse cx="34" cy="31" rx="8" ry="4" /><ellipse cx="50" cy="23" rx="5" ry="3" />
          </g>
          <g clipPath={`url(#${clipId})`} filter={`url(#${veinId})`} opacity=".24">
            <path d="M5 25c5-5 10-4 14-1s8 2 12-2c1 7-4 10-11 10-6 0-11-2-15-7Z" fill="#FFF0A0" />
            <path d="M31 39c7-5 14-4 21 1-4 6-11 8-20 6-3-2-3-4-1-7Z" fill="#80611F" />
            <path d="M37 10c5 0 10 3 14 7-5 4-10 4-15 1-2-3-2-6 1-8Z" fill="#F5D56C" />
          </g>
          <g fill="none" strokeLinecap="round" filter={`url(#${veinId})`}>
            <path d="M-4 37c12-9 20-5 30-11s21-5 43 5" stroke="#FFE58A" strokeWidth="3.2" opacity=".11" />
            <path d="M4 55c10-11 19-8 27-16s17-6 31-2" stroke="#6B4E18" strokeWidth="1.4" opacity=".16" />
            <path d="M3 12c12 7 20 6 29 1s17-3 27 2" stroke="#FFF0A0" strokeWidth="1.3" opacity=".12" />
            <path d="M8 45c7-3 12-1 17-4m11-15c5 2 10 2 16-1M20 19c3 4 6 6 11 7" stroke="#9B731E" strokeWidth=".7" opacity=".28" />
          </g>
          <g fill="none" strokeLinecap="round" opacity=".34">
            <path d="M8 29c7-4 12-3 18 0s12 3 18-1" stroke="#FFF0A0" strokeWidth=".58" />
            <path d="M13 43c6-3 11-2 16 1s11 3 18-1" stroke="#8A641A" strokeWidth=".72" />
            <path d="M19 15c5 2 10 2 15-1" stroke="#FFF6C2" strokeWidth=".44" />
          </g>
          <g fill="#6E5117" opacity=".34">
            <circle cx="20" cy="34" r=".62" /><circle cx="39" cy="22" r=".48" /><circle cx="45" cy="46" r=".7" /><circle cx="28" cy="51" r=".42" />
          </g>
        </g>
      );
    case 'turquoise':
      return (
        <>
          {mineralNoise}
          <g clipPath={`url(#${clipId})`} filter={`url(#${glowId})`} opacity=".22">
            <ellipse cx="18" cy="19" rx="13" ry="8" fill="#8DF3EC" transform="rotate(-17 18 19)" />
            <ellipse cx="45" cy="39" rx="16" ry="10" fill="#075365" transform="rotate(21 45 39)" />
            <ellipse cx="25" cy="46" rx="9" ry="5" fill="#45CAD2" transform="rotate(-12 25 46)" />
          </g>
          <g clipPath={`url(#${clipId})`} fill="none" strokeLinecap="round" strokeLinejoin="round" filter={`url(#${veinId})`}>
            <path d="M-5 16c11-7 18 4 28-1S34 3 47 8c10 4 14-2 22-5M-3 49c12-9 20-2 31-9 10-7 18-11 39-5" stroke="#3E302A" strokeWidth="2.45" opacity=".88" />
            <path d="M10-5c0 11 9 14 7 25-2 9-8 15-3 27 5 11 0 17-4 23M44-4c-5 13 3 18 0 28-3 11-10 14-7 26 3 10 7 13 3 21" stroke="#6B4934" strokeWidth="1.65" opacity=".78" />
            <path d="M17 20c7 1 10 7 16 7m-20 20c7-5 13-1 18-5m13-18c5 4 10 4 16 1" stroke="#291F1D" strokeWidth=".85" opacity=".82" />
            <path d="M2 33c7 1 9 5 15 5m12-29c4 4 7 7 12 7M37 49c6-1 11 2 17 7" stroke="#8A6751" strokeWidth=".55" opacity=".72" />
            <path d="M4 28c8-6 14 1 22-3" stroke="#B9FFF4" strokeWidth="1.1" opacity=".46" />
          </g>
          <g clipPath={`url(#${clipId})`} fill="#123D46" opacity=".46">
            <circle cx="23" cy="13" r=".75" /><circle cx="50" cy="20" r=".55" /><circle cx="29" cy="48" r=".65" /><circle cx="10" cy="40" r=".45" />
          </g>
        </>
      );
  }
}

function StoneSurfaceLight({
  medallion,
  clipId,
  glossId,
  softGlossId,
  rimColor,
}: {
  medallion: boolean;
  clipId: string;
  glossId: string;
  softGlossId: string;
  rimColor: string;
}) {
  // A cabochon reflects a window as a band bent around its dome. The broad,
  // soft band establishes volume; the narrow core keeps it glossy without
  // masking the mineral structure. A lower reflected arc closes the curve.
  const upperArc = medallion
    ? 'M28.4 31.2C29.1 28.5 31.8 26.7 34.5 27.2'
    : 'M14.8 27.6C17.5 18.4 26.1 12.4 35.8 12.9C38.1 13 40.2 13.6 42 14.5';
  const upperCore = medallion
    ? 'M29.1 30C30 28.3 31.8 27.5 33.6 27.6'
    : 'M17.6 24.2C21.4 16.9 29.8 13.5 37.5 14.4';
  const lowerArc = medallion
    ? 'M35.8 35.3C34.7 36.5 33.2 37.1 31.7 37.2'
    : 'M47.9 41.8C44.9 47.3 39.2 51 32.9 52.1';

  return (
    <g clipPath={`url(#${clipId})`} fill="none" strokeLinecap="round">
      <path d={upperArc} stroke={`url(#${glossId})`} strokeWidth={medallion ? '1.35' : '4.8'} opacity={medallion ? '.5' : '.38'} filter={`url(#${softGlossId})`} />
      <path d={upperArc} stroke={`url(#${glossId})`} strokeWidth={medallion ? '.62' : '1.65'} opacity={medallion ? '.76' : '.68'} />
      <path d={upperCore} stroke="#FFFFFF" strokeWidth={medallion ? '.28' : '.58'} opacity=".82" />
      <path d={lowerArc} stroke={rimColor} strokeWidth={medallion ? '.42' : '1.25'} opacity=".28" />
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
  const stoneId = `stone-body-${rawId}`;
  const clipId = `stone-clip-${rawId}`;
  const shadowId = `copper-shadow-${rawId}`;
  const insetId = `stone-inset-${rawId}`;
  const veinId = `mineral-vein-${rawId}`;
  const noiseId = `mineral-noise-${rawId}`;
  const glowId = `mineral-glow-${rawId}`;
  const depthId = `stone-depth-${rawId}`;
  const glossId = `stone-gloss-${rawId}`;
  const softGlossId = `stone-soft-gloss-${rawId}`;
  const material = kind ? STONE_MATERIALS[kind] : undefined;
  const stoneColor = material?.body ?? '#A2613C';
  const outerR = medallion ? 25.5 : 29;
  const stoneR = medallion ? 5.25 : 23;

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
        {kind === 'malachite' ? (
          <radialGradient id={stoneId} cx=".3" cy=".22" r=".86">
              <stop offset="0" stopColor="color-mix(in srgb, #087A4B 58%, white)" />
              <stop offset=".24" stopColor="#087A4B" />
              <stop offset=".7" stopColor="color-mix(in srgb, #087A4B 78%, #101314)" />
              <stop offset="1" stopColor="color-mix(in srgb, #087A4B 58%, black)" />
          </radialGradient>
        ) : (
          <radialGradient id={stoneId} gradientUnits="userSpaceOnUse" cx="24" cy="18" r="47">
              <stop offset="0" stopColor={material?.light ?? '#C7885D'} />
              <stop offset=".28" stopColor={material?.body ?? '#A2613C'} />
              <stop offset=".72" stopColor={material?.deep ?? '#4B2C25'} />
              <stop offset="1" stopColor="#171518" />
          </radialGradient>
        )}
        <clipPath id={clipId}>
          <circle cx="32" cy="32" r={stoneR} />
        </clipPath>
        <filter id={shadowId} x="-45%" y="-45%" width="190%" height="200%">
          <feDropShadow dx="0" dy="1.4" stdDeviation="1.25" floodColor="#050606" floodOpacity=".58" />
        </filter>
        <filter id={insetId} x="-35%" y="-35%" width="170%" height="170%">
          <feGaussianBlur in="SourceAlpha" stdDeviation={medallion ? '.45' : '1.1'} result="blur" />
          <feOffset dx={medallion ? '.35' : '.8'} dy={medallion ? '.45' : '1.1'} result="offset" />
          <feComposite in="offset" in2="SourceAlpha" operator="out" result="inner" />
          <feColorMatrix in="inner" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 .75 0" />
          <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id={veinId} x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency=".025 .06" numOctaves="2" seed="8" result="warp" />
          <feDisplacementMap in="SourceGraphic" in2="warp" scale="3.2" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <filter id={noiseId} x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency=".08" numOctaves="3" seed="13" />
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer><feFuncA type="table" tableValues="0 .55" /></feComponentTransfer>
        </filter>
        <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.7" />
        </filter>
        <radialGradient id={depthId} gradientUnits="userSpaceOnUse" cx="20" cy="17" r="43">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity=".12" />
          <stop offset=".34" stopColor="#FFFFFF" stopOpacity="0" />
          <stop offset=".72" stopColor={material?.deep ?? '#4B2C25'} stopOpacity=".08" />
          <stop offset="1" stopColor={material?.deep ?? '#4B2C25'} stopOpacity=".42" />
        </radialGradient>
        <linearGradient id={glossId} gradientUnits="userSpaceOnUse" x1="14" y1="18" x2="43" y2="24">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity=".12" />
          <stop offset=".26" stopColor="#FFFFFF" stopOpacity=".78" />
          <stop offset=".68" stopColor="#FFFFFF" stopOpacity=".42" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity=".06" />
        </linearGradient>
        <filter id={softGlossId} x="-30%" y="-40%" width="160%" height="180%">
          <feGaussianBlur stdDeviation={medallion ? '.32' : '1.05'} />
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
            <g className="natural-stone-cabochon" filter={`url(#${insetId})`}>
              <circle cx="32" cy="32" r={stoneR} fill={`url(#${stoneId})`} />
              <StoneTexture kind={kind} clipId={clipId} veinId={veinId} noiseId={noiseId} glowId={glowId} />
              <circle cx="32" cy="32" r={stoneR} fill={`url(#${depthId})`} opacity={kind === 'malachite' ? '.62' : '.88'} />
              <circle
                cx="32"
                cy="32"
                r={stoneR - 0.35}
                fill="none"
                stroke={kind === 'malachite' ? 'color-mix(in srgb, #087A4B 42%, white)' : (material?.rim ?? stoneColor)}
                strokeWidth={medallion ? '.45' : '.75'}
                opacity={kind === 'malachite' ? '.62' : '.56'}
              />
              <StoneSurfaceLight
                medallion={medallion}
                clipId={clipId}
                glossId={glossId}
                softGlossId={softGlossId}
                rimColor={material?.rim ?? stoneColor}
              />
            </g>
          </>
        )}
      </g>

      {children && (
        <g
          className="natural-stone-glyph"
          transform="translate(32 32)"
          stroke="#121516"
          fill="none"
          style={{ filter: 'drop-shadow(0 .6px .35px rgba(255,255,255,.7))' }}
        >
          {children}
        </g>
      )}
    </svg>
  );
}
