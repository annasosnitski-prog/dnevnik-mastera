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
// palettes cannot silently drift apart again. Values live in CSS
// (src/styles/tokens.css --territory-*) — this is a thin JS mirror, same
// pattern as COLORS above, so there's one source of truth instead of two.
export const TERRITORY_COLORS = {
  // Emerald · citrine · amethyst · dark sapphire · fire opal · ruby.
  clients: 'var(--territory-clients)',
  personal: 'var(--territory-personal)',
  content: 'var(--territory-content)',
  projects: 'var(--territory-projects)',
  notes: 'var(--territory-notes)',
  admin: 'var(--territory-admin)',
} as const;

// "Размер текста" scales typography only. TattoDiary sets the multiplier at
// the start of each render pass before child components call fs().
let textScale = 1;

export function setTextScale(scale: number): void {
  textScale = scale;
}

export const fs = (px: number): number => Math.round(px * textScale * 100) / 100;

export const DONE_EMOJI = '🍀';
