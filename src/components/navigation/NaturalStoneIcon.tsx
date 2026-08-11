import { useId, type ReactNode } from 'react';

export type NaturalStoneKind =
  | 'rhodonite'
  | 'malachite'
  | 'star-sapphire'
  | 'fire-opal'
  | 'honey-jadeite'
  | 'turquoise';

const STONE_COLORS: Record<NaturalStoneKind, string> = {
  rhodonite: '#B53D64',
  malachite: '#087A4B',
  'star-sapphire': '#5143A6',
  'fire-opal': '#D7551E',
  'honey-jadeite': '#C69A2D',
  turquoise: '#169BB1',
};

function StoneTexture({ kind, clipId }: { kind: NaturalStoneKind; clipId: string }) {
  switch (kind) {
    case 'rhodonite':
      return (
        <g clipPath={`url(#${clipId})`}>
          <path d="M5 20C16 9 21 13 30 5S47 2 60-5" fill="none" stroke="#321F27" strokeWidth="3.4" opacity=".92" />
          <path d="M-2 48C11 39 18 43 28 34s19-5 39-18" fill="none" stroke="#21191E" strokeWidth="2.1" opacity=".82" />
          <path d="M7 58c9-9 15-8 21-14s11-8 21-8" fill="none" stroke="#5C263A" strokeWidth="1.2" opacity=".72" />
          <path d="M11 7c6 8 12 8 17 15s13 10 25 9" fill="none" stroke="#E78BA6" strokeWidth="2.6" opacity=".34" />
        </g>
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
          <ellipse cx="25" cy="22" rx="17" ry="11" fill="#8D85D4" opacity=".2" />
          <g transform="translate(27 27)" stroke="#F4F0FF" strokeLinecap="round">
            <path d="M0-29V29" strokeWidth="1.25" opacity=".88" />
            <path d="M-25-14 25 14" strokeWidth="1.05" opacity=".76" />
            <path d="M25-14-25 14" strokeWidth="1.05" opacity=".76" />
            <path d="M0-22V22M-19-11 19 11M19-11-19 11" strokeWidth="3.2" opacity=".15" />
          </g>
        </g>
      );
    case 'fire-opal':
      return (
        <g clipPath={`url(#${clipId})`}>
          <path d="M6 13c10-9 17 2 25-7s17-4 27 4c-8 8-11 13-19 13S21 14 6 13Z" fill="#FFD35A" opacity=".58" />
          <path d="M4 43c8-10 16-5 22-14 7 13 18 10 30 7-6 12-17 19-29 19S9 51 4 43Z" fill="#B71919" opacity=".42" />
          <path d="M18 11c5 8 8 15 5 24m23-27c-8 10-11 18-9 31" fill="none" stroke="#77C97B" strokeWidth="2.5" opacity=".55" />
          <circle cx="42" cy="20" r="7" fill="#FFED9B" opacity=".35" />
        </g>
      );
    case 'honey-jadeite':
      return (
        <g clipPath={`url(#${clipId})`}>
          <ellipse cx="19" cy="18" rx="18" ry="12" fill="#FFF0A8" opacity=".34" />
          <ellipse cx="46" cy="39" rx="21" ry="15" fill="#8D6D20" opacity=".23" />
          <path d="M-1 35c11-7 18-4 27-10s18-5 39 4" fill="none" stroke="#F7D977" strokeWidth="5" opacity=".22" />
          <path d="M8 54c9-10 18-8 25-16s16-6 27-3" fill="none" stroke="#74591B" strokeWidth="2.2" opacity=".2" />
        </g>
      );
    case 'turquoise':
      return (
        <g clipPath={`url(#${clipId})`}>
          <path d="M-4 17C8 11 13 19 23 15S35 4 48 8s13 0 20-5" fill="none" stroke="#49372F" strokeWidth="2.4" opacity=".85" />
          <path d="M9-4c1 11 9 14 8 24s-8 15-3 28 0 16-4 22M42-3c-4 12 4 17 2 27s-10 14-8 25 7 14 4 22" fill="none" stroke="#6A4B35" strokeWidth="1.7" opacity=".74" />
          <path d="M-3 48c12-8 21-3 31-8s18-12 37-6" fill="none" stroke="#2F2927" strokeWidth="2.1" opacity=".72" />
          <path d="M5 27c7-5 13 1 20-3" fill="none" stroke="#C4F4EF" strokeWidth="1.1" opacity=".55" />
        </g>
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
  const metalId = `silver-metal-${rawId}`;
  const edgeId = `silver-edge-${rawId}`;
  const stoneId = `stone-body-${rawId}`;
  const clipId = `stone-clip-${rawId}`;
  const shadowId = `silver-shadow-${rawId}`;
  const insetId = `stone-inset-${rawId}`;
  const stoneColor = kind ? STONE_COLORS[kind] : '#8E969B';
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
        <radialGradient id={metalId} cx=".29" cy=".2" r=".9">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset=".12" stopColor="#DCE2E5" />
          <stop offset=".29" stopColor="#858E93" />
          <stop offset=".49" stopColor="#262A2C" />
          <stop offset=".68" stopColor="#0D0F10" />
          <stop offset=".83" stopColor="#7C858A" />
          <stop offset="1" stopColor="#17191A" />
        </radialGradient>
        <linearGradient id={edgeId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#111314" />
          <stop offset=".18" stopColor="#F8FBFC" />
          <stop offset=".38" stopColor="#70797E" />
          <stop offset=".58" stopColor="#DDE3E6" />
          <stop offset=".78" stopColor="#17191A" />
          <stop offset="1" stopColor="#9CA5A9" />
        </linearGradient>
        <radialGradient id={stoneId} cx=".3" cy=".22" r=".86">
          <stop offset="0" stopColor={`color-mix(in srgb, ${stoneColor} 58%, white)`} />
          <stop offset=".24" stopColor={stoneColor} />
          <stop offset=".7" stopColor={`color-mix(in srgb, ${stoneColor} 78%, #101314)`} />
          <stop offset="1" stopColor={`color-mix(in srgb, ${stoneColor} 58%, black)`} />
        </radialGradient>
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
      </defs>

      <g filter={`url(#${shadowId})`}>
        <circle cx="32" cy="32" r={outerR} fill={`url(#${metalId})`} stroke="#080A0B" strokeWidth="1.2" />
        <circle cx="32" cy="32" r={outerR - 2.1} fill="none" stroke={`url(#${edgeId})`} strokeWidth="1.1" />
        <circle cx="32" cy="32" r={outerR - 4.1} fill="none" stroke="#080A0B" strokeWidth="1.15" opacity=".92" />

        {plate || !kind ? (
          <>
            <circle cx="32" cy="32" r={outerR - 6} fill={`url(#${metalId})`} stroke="#B8C0C4" strokeWidth=".55" />
            <ellipse cx="25" cy="21" rx="11" ry="5.5" fill="#FFFFFF" opacity=".12" transform="rotate(-25 25 21)" />
          </>
        ) : (
          <>
            <circle cx="32" cy="32" r={stoneR + (medallion ? 2.2 : 1.6)} fill="#080A0B" stroke={`url(#${edgeId})`} strokeWidth={medallion ? 1.1 : 1.25} />
            <g className="natural-stone-cabochon" filter={`url(#${insetId})`}>
              <circle cx="32" cy="32" r={stoneR} fill={`url(#${stoneId})`} />
              <StoneTexture kind={kind} clipId={clipId} />
              <circle cx="32" cy="32" r={stoneR - 0.35} fill="none" stroke={`color-mix(in srgb, ${stoneColor} 42%, white)`} strokeWidth={medallion ? '.45' : '.75'} opacity=".62" />
              <ellipse
                cx={medallion ? 30.4 : 25.5}
                cy={medallion ? 30.1 : 23.4}
                rx={medallion ? 1.8 : 10.8}
                ry={medallion ? .85 : 4.6}
                fill="#FFFFFF"
                opacity={medallion ? '.75' : '.48'}
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
