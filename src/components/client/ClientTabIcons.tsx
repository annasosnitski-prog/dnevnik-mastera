import type { ReactNode, SVGProps } from 'react';

// Monumental client-tab icon set only. No tab backgrounds, sizing rules,
// toolbar styling, glow system, or skin logic lives in this file.
export type ClientTabIconName = 'sessions' | 'consultations' | 'content' | 'notes' | 'info';

const common = {
  fill: 'none' as const,
  strokeWidth: 3.2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  vectorEffect: 'non-scaling-stroke' as const,
};

function ClientTabGlyph({ name }: { name: ClientTabIconName }): ReactNode {
  switch (name) {
    case 'sessions':
      return (
        <g {...common}>
          <circle cx="0" cy="0" r="9" />
          <path d="M0-5.5V.5L4.5 3.5" />
          <path d="M-7.5-7.5-5-10M7.5-7.5 5-10" />
        </g>
      );
    case 'consultations':
      return (
        <g {...common}>
          <path d="M-11-8h13a4 4 0 0 1 4 4v5a4 4 0 0 1-4 4h-5l-5 4V5h-3a4 4 0 0 1-4-4v-5a4 4 0 0 1 4-4Z" />
          <path d="M2 3h7a4 4 0 0 1 4 4v2a4 4 0 0 1-4 4H6l-4 3v-5" />
        </g>
      );
    case 'content':
      return (
        <g {...common}>
          <path d="M10-11C8 1 1 9-10 11-8-1-1-9 10-11Z" />
          <path d="M8-8-9 10" />
          <path d="M1-2-5-3M5-6 0-7M-3 3-7 2" />
        </g>
      );
    case 'notes':
      return (
        <g {...common}>
          <rect x="-9" y="-11" width="18" height="22" rx="2" />
          <path d="M-4-5h8M-4 0h8M-4 5h6" />
          <path d="M-9-7h-3M-9 0h-3M-9 7h-3" />
        </g>
      );
    case 'info':
      return (
        <g {...common}>
          <circle cx="0" cy="0" r="10" />
          <path d="M0-1v7" />
          <circle cx="0" cy="-6" r="1.8" fill="currentColor" stroke="none" />
        </g>
      );
  }
}

export function ClientTabIcon({
  name,
  size = 42,
  ...props
}: { name: ClientTabIconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="-16 -16 32 32"
      stroke="currentColor"
      aria-hidden="true"
      focusable={false}
      style={{ display: 'block', color: 'inherit' }}
      {...props}
    >
      <ClientTabGlyph name={name} />
    </svg>
  );
}
