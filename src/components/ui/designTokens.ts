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
  // Navy · citrine · ruby · emerald · fire opal · amethyst.
  // content and admin swapped territories (were amethyst/ruby) so admin
  // reads purple and content reads red everywhere this palette is used.
  // clients and projects swapped too (were emerald/sapphire): клиент —
  // тёмно-синий navy #000080 (Crowdflower), проект — зелёный, везде, где цвет
  // систематизирует.
  // Клиенты — синий на 2 тона темнее исходного (ближе к чёрному) по
  // просьбе Анны; контент и админка — насыщеннее и светлее (тот же тон,
  // выше saturation/lightness), чтобы камни читались ярче.
  clients: '#000066',
  personal: '#C99516',
  content: '#EB0A3E',
  // Проекты — тёплая лесная зелень (был холодный изумруд #008A5A,
  // тон увели к жёлтому) по просьбе Анны.
  projects: '#3D7A2B',
  notes: '#D45A1F',
  admin: '#9536E2',
} as const;

// "Размер текста" scales typography only. TattoDiary sets the multiplier at
// the start of each render pass before child components call fs().
let textScale = 1;

export function setTextScale(scale: number): void {
  textScale = scale;
}

export const fs = (px: number): number => Math.round(px * textScale * 100) / 100;

export const DONE_EMOJI = '🍀';
