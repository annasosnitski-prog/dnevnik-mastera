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
    <g clipPath={`url(#${clipId})`} opacity=".32" style={{ mixBlendMode: 'soft-light' }}>
      <rect x="7" y="7" width="50" height="50" filter={`url(#${noiseId})`} />
    </g>
  );

  switch (kind) {
    case 'rhodonite':
      return (
        <>
          {mineralNoise}
          <g clipPath={`url(#${clipId})`} fill="none" strokeLinecap="round" strokeLinejoin="round" filter={`url(#${veinId})`}>
            <path d="M4 17c9 2 10 9 18 10 7 1 8-8 16-7 9 1 10-8 24-12" stroke="#24171D" strokeWidth="2.4" opacity=".9" />
            <path d="M-2 49c10-3 14-11 23-10 8 1 9-7 17-8 8-1 15 4 29-6" stroke="#301920" strokeWidth="1.65" opacity=".9" />
            <path d="M22 27c-3 6 3 8 0 13m16-20c-4 5-1 8-6 12m6-1c4 4 5 8 11 10" stroke="#151115" strokeWidth=".75" opacity=".88" />
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
          <ellipse cx="26" cy="25" rx="18" ry="13" fill="#A8A1F2" opacity=".13" filter={`url(#${glowId})`} />
          <g transform="translate(28 27) rotate(-4)" stroke="#EEEFFF" strokeLinecap="round">
            <path d="M0-22V20M-18-10 17 10M18-10.5-17 9.5" stroke="#BDBDFF" strokeWidth="5.4" opacity=".13" filter={`url(#${glowId})`} />
            <path d="M0-20V18" stroke="#DFDEFF" strokeWidth=".82" opacity=".67" />
            <path d="M-17-9.5 16 9M17-9.8-16 9" stroke="#D6D5FF" strokeWidth=".7" opacity=".57" />
            <circle r="2" fill="#DAD9FF" stroke="none" opacity=".46" filter={`url(#${glowId})`} />
          </g>
        </g>
      );
    case 'fire-opal':
      return (
        <g clipPath={`url(#${clipId})`}>
          {mineralNoise}
          <g filter={`url(#${veinId})`} style={{ mixBlendMode: 'screen' }}>
            <path d="M3 16c10-11 18-3 27-10 8-6 18-2 30 5-10 2-16 11-27 10C20 20 13 12 3 16Z" fill="#FFD85E" opacity=".72" />
            <path d="M5 47c10-11 18-6 24-17 7 11 18 12 29 7-4 13-16 20-29 20-10 0-18-3-24-10Z" fill="#FF6A28" opacity=".48" />
            <path d="M9 9c7 0 11 4 14 10-8 0-11 5-17 3 2-5 2-8 3-13Z" fill="#78E58F" opacity=".42" />
            <path d="M37 25c7-5 12-3 17 1-6 3-8 8-15 9-3-3-3-6-2-10Z" fill="#8AE5A0" opacity=".34" />
            <path d="M16 49c9-7 18-8 31-6-8 4-15 8-27 10Z" fill="#FFD65B" opacity=".58" />
          </g>
          <ellipse cx="42" cy="19" rx="9" ry="6" fill="#FFF4A8" opacity=".28" filter={`url(#${glowId})`} />
        </g>
      );
    case 'honey-jadeite':
      return (
        <g clipPath={`url(#${clipId})`}>
          {mineralNoise}
          <ellipse cx="20" cy="19" rx="19" ry="13" fill="#FFF3B5" opacity=".34" filter={`url(#${glowId})`} />
          <ellipse cx="46" cy="41" rx="23" ry="17" fill="#755019" opacity=".25" filter={`url(#${glowId})`} />
          <g fill="none" strokeLinecap="round" filter={`url(#${veinId})`}>
            <path d="M-4 37c12-9 20-5 30-11s21-5 43 5" stroke="#FFE58A" strokeWidth="7" opacity=".24" />
            <path d="M4 55c10-11 19-8 27-16s17-6 31-2" stroke="#6B4E18" strokeWidth="2" opacity=".21" />
            <path d="M3 12c12 7 20 6 29 1s17-3 27 2" stroke="#FFF0A0" strokeWidth="3" opacity=".18" />
          </g>
        </g>
      );
    case 'turquoise':
      return (
        <>
          {mineralNoise}
          <g clipPath={`url(#${clipId})`} fill="none" strokeLinecap="round" strokeLinejoin="round" filter={`url(#${veinId})`}>
            <path d="M-5 16c11-7 18 4 28-1S34 3 47 8c10 4 14-2 22-5M-3 49c12-9 20-2 31-9 10-7 18-11 39-5" stroke="#3E302A" strokeWidth="2.45" opacity=".88" />
            <path d="M10-5c0 11 9 14 7 25-2 9-8 15-3 27 5 11 0 17-4 23M44-4c-5 13 3 18 0 28-3 11-10 14-7 26 3 10 7 13 3 21" stroke="#6B4934" strokeWidth="1.65" opacity=".78" />
            <path d="M17 20c7 1 10 7 16 7m-20 20c7-5 13-1 18-5m13-18c5 4 10 4 16 1" stroke="#291F1D" strokeWidth=".85" opacity=".82" />
            <path d="M4 28c8-6 14 1 22-3" stroke="#B9FFF4" strokeWidth="1.1" opacity=".46" />
          </g>
        </>
      );
  }
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
          <stop offset="0" stopColor="#E4A66F" />
          <stop offset=".16" stopColor="#A55C38" />
          <stop offset=".39" stopColor="#6D3829" />
          <stop offset=".59" stopColor="#3B231F" />
          <stop offset=".8" stopColor="#8B4B32" />
          <stop offset="1" stopColor="#C47749" />
        </linearGradient>
        <linearGradient id={flatId} x1=".1" y1="0" x2=".9" y2="1">
          <stop offset="0" stopColor="#BC754C" />
          <stop offset=".46" stopColor="#855039" />
          <stop offset="1" stopColor="#5B352B" />
        </linearGradient>
        <linearGradient id={edgeId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#34201D" />
          <stop offset=".18" stopColor="#F0B77E" />
          <stop offset=".38" stopColor="#6D382A" />
          <stop offset=".56" stopColor="#AF6A45" />
          <stop offset=".76" stopColor="#365E55" />
          <stop offset="1" stopColor="#7DB09A" />
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
      </defs>

      <g filter={`url(#${shadowId})`}>
        <circle cx="32" cy="32" r={outerR} fill={`url(#${metalId})`} stroke="#2A1A18" strokeWidth="1.15" />
        <circle cx="32" cy="32" r={outerR - 1.8} fill="none" stroke={`url(#${edgeId})`} strokeWidth="1" />
        <circle cx="32" cy="32" r={outerR - 3.8} fill="none" stroke="#43271F" strokeWidth="1.05" opacity=".9" />
        <path d="M13 17a25 25 0 0 1 12-8M48 48a24 24 0 0 1-14 8" fill="none" stroke="#6EA28C" strokeWidth="1.4" strokeLinecap="round" strokeDasharray="4 2 1 4" opacity=".62" />
        <path d="M50 18a24 24 0 0 1 5 13M9 37a24 24 0 0 1 3-12" fill="none" stroke="#294D45" strokeWidth="1.1" strokeLinecap="round" strokeDasharray="3 3 1 4" opacity=".68" />

        {plate || !kind ? (
          <>
            <circle cx="32" cy="32" r={outerR - 5.2} fill={`url(#${flatId})`} stroke="#C8895E" strokeWidth=".55" />
            <circle cx="32" cy="32" r={outerR - 8.2} fill="none" stroke="#4D2D26" strokeWidth=".65" opacity=".75" />
            <path d="M16 24c5-7 13-10 21-8M44 46c-7 4-15 4-22 0" fill="none" stroke="#5D927F" strokeWidth="1.3" strokeLinecap="round" strokeDasharray="5 2 1 5" opacity=".48" />
            <path d="M18 43c-3-5-4-10-2-15M47 22c3 5 3 10 2 15" fill="none" stroke="#2E5349" strokeWidth=".8" strokeLinecap="round" strokeDasharray="3 4" opacity=".56" />
          </>
        ) : (
          <>
            <circle cx="32" cy="32" r={stoneR + (medallion ? 2.2 : 1.6)} fill="#38221E" stroke={`url(#${edgeId})`} strokeWidth={medallion ? 1.1 : 1.25} />
            <path d={medallion ? 'M27 30a6 6 0 0 1 4-4M36 37a6 6 0 0 1-4 1' : 'M14 26a21 21 0 0 1 13-13M49 45a21 21 0 0 1-13 6'} fill="none" stroke="#6DA18A" strokeWidth={medallion ? '.55' : '1'} strokeLinecap="round" opacity=".62" />
            <g className="natural-stone-cabochon" filter={`url(#${insetId})`}>
              <circle cx="32" cy="32" r={stoneR} fill={`url(#${stoneId})`} />
              <StoneTexture kind={kind} clipId={clipId} veinId={veinId} noiseId={noiseId} glowId={glowId} />
              <circle
                cx="32"
                cy="32"
                r={stoneR - 0.35}
                fill="none"
                stroke={kind === 'malachite' ? 'color-mix(in srgb, #087A4B 42%, white)' : (material?.rim ?? stoneColor)}
                strokeWidth={medallion ? '.45' : '.75'}
                opacity={kind === 'malachite' ? '.62' : '.56'}
              />
              <ellipse
                cx={medallion ? 30.4 : 25.5}
                cy={medallion ? 30.1 : 23.4}
                rx={medallion ? 1.8 : 10.8}
                ry={medallion ? .85 : 4.6}
                fill="#FFFFFF"
                opacity={medallion ? '.68' : '.58'}
                transform={`rotate(-28 ${medallion ? 30.4 : 25.5} ${medallion ? 30.1 : 23.4})`}
              />
              <ellipse cx="39" cy="42" rx={medallion ? 1.2 : 8.5} ry={medallion ? .6 : 3.4} fill={stoneColor} opacity=".2" transform="rotate(-28 39 42)" />
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
