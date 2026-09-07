// Shared visual tokens used by screens and the root app shell. Values stay
// backed by the existing CSS variables, so theme behaviour is unchanged.
export const COLORS = {
  bg: 'var(--bg)',
  sheet: 'var(--sheet)',
  gold: 'var(--gold)',
  textPrimary: 'var(--text)',
  textSecondary: 'var(--text-secondary)',
  textMuted: 'var(--text-muted)',
  textFaint: 'var(--text-faint)',
  textGhost: 'var(--text-ghost)',
  textTrace: 'var(--text-trace)',
};

// One colour means one product territory everywhere it appears. The radial
// toolbar and the related client-card tabs both consume this object so their
// palettes cannot silently drift apart again.
export const TERRITORY_COLORS = {
  // Emerald · citrine · ruby · dark sapphire · fire opal · amethyst.
  // content and admin swapped territories (were amethyst/ruby) so admin
  // reads purple and content reads red everywhere this palette is used.
  clients: '#008A5A',
  personal: '#C99516',
  content: '#B01236',
  projects: '#1448A7',
  notes: '#D45A1F',
  admin: '#7935B2',
} as const;

// "Размер текста" scales typography only. TattoDiary sets the multiplier at
// the start of each render pass before child components call fs().
let textScale = 1;

export function setTextScale(scale: number): void {
  textScale = scale;
}

export const fs = (px: number): number => Math.round(px * textScale * 100) / 100;

export const DONE_EMOJI = '🍀';
