import type { ReactNode, SVGProps } from 'react';

// Минимализм's line-icon set for the client detail tabs — same visual
// language as NavFab's own minimal glyphs (see MinimalGlyph in
// navigation/NavFab.tsx): one shared viewBox, one stroke weight, no fill,
// currentColor so the caller drives colour (muted vs. the tab's own brand
// colour, matching the toolbar palette already baked into gem-icons.svg).
export type ClientTabIconName = 'sessions' | 'consultations' | 'content' | 'notes' | 'info';

const common = {
  fill: 'none' as const,
  strokeWidth: 1.45,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

function ClientTabGlyph({ name }: { name: ClientTabIconName }): ReactNode {
  switch (name) {
    case 'sessions':
      // A plain clock face — the session's own place in time.
      return (
        <g {...common}>
          <circle cx="0" cy="0" r="7" />
          <path d="M0-4v4.5l3.2 2" />
        </g>
      );
    case 'consultations':
      // Two overlapping dialog outlines — an exchange between master and client.
      return (
        <g {...common}>
          <rect x="-8" y="-7" width="10" height="7" rx="2" />
          <rect x="-2" y="0" width="10" height="7" rx="2" />
        </g>
      );
    case 'content':
      // The same three-spark ✨ glyph used by POSTiNKA in the radial toolbar.
      return (
        <g transform="translate(-16 -16)" fill="currentColor" stroke="none">
          <path d="M14 6C15 12 18 16 24 18C18 20 15 24 14 30C13 24 10 20 4 18C10 16 13 12 14 6Z" />
          <path d="M24 2C24.6 5.3 26.4 7.4 30 8C26.4 8.6 24.6 10.7 24 14C23.4 10.7 21.6 8.6 18 8C21.6 7.4 23.4 5.3 24 2Z" />
          <path d="M27 16C27.4 18.2 28.6 19.6 31 20C28.6 20.4 27.4 21.8 27 24C26.6 21.8 25.4 20.4 23 20C25.4 19.6 26.6 18.2 27 16Z" />
        </g>
      );
    case 'notes':
      // A notebook — same pictogram as NavFab's own "Заметки" glyph (the same referent).
      return (
        <g {...common}>
          <rect x="-6" y="-7" width="12" height="14" rx="1.4" />
          <path d="M-3-3h6M-3 0h6M-3 3h4" />
        </g>
      );
    case 'info':
      // A circled "i".
      return (
        <g {...common}>
          <circle cx="0" cy="0" r="7" />
          <line x1="0" y1="-1.5" x2="0" y2="4" />
          <circle cx="0" cy="-4.5" r="0.9" fill="currentColor" stroke="none" />
        </g>
      );
  }
}

export function ClientTabIcon({
  name,
  size = 26,
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
      // The global `svg { color: var(--gold) }` default (index.css) would
      // otherwise win over the caller's own colour — `inherit` opts this
      // back into the normal cascade from the tab button.
      style={{ display: 'block', color: 'inherit' }}
      {...props}
    >
      <ClientTabGlyph name={name} />
    </svg>
  );
}
