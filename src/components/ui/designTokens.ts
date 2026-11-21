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

// Единый источник цветов драгоценных камней: тулбар (NavFab), вкладки
// карточки клиента, «Мой кабинет», Админка, Мастерская, в тёмной и светлой
// теме. Меняя цвет территории, меняй и его тона здесь.
//   stone  — тело камня. Клиенты: индиго #17067E с образца Анны (сам
//            #000066 слишком тёмный, блики с него тусклые и другого характера).
//   light  — блики: бледный тон той же гаммы, без соседних цветов.
//   shadow — тени: глубокий тон той же гаммы (иначе камень «радужный»).
//   glow   — ореол вокруг камня, hex #RRGGBB (вызывающие дописывают альфу).
export interface GemTone { stone: string; light: string; shadow: string; glow: string }
export const GEM_TONES: Record<string, GemTone> = {
  [TERRITORY_COLORS.clients]: { stone: '#17067E', light: '#9C92E8', shadow: '#07022C', glow: '#4A2CFF' },
  [TERRITORY_COLORS.personal]: { stone: TERRITORY_COLORS.personal, light: '#FFE6A8', shadow: '#3A2806', glow: TERRITORY_COLORS.personal },
  [TERRITORY_COLORS.content]: { stone: TERRITORY_COLORS.content, light: '#FFC2CC', shadow: '#3A0614', glow: TERRITORY_COLORS.content },
  [TERRITORY_COLORS.projects]: { stone: TERRITORY_COLORS.projects, light: '#C6E6BC', shadow: '#06302A', glow: TERRITORY_COLORS.projects },
  [TERRITORY_COLORS.notes]: { stone: TERRITORY_COLORS.notes, light: '#FFCDA8', shadow: '#3A1406', glow: TERRITORY_COLORS.notes },
  [TERRITORY_COLORS.admin]: { stone: TERRITORY_COLORS.admin, light: '#E2C4FF', shadow: '#1E0A3E', glow: TERRITORY_COLORS.admin },
};
export const gemTone = (color: string): GemTone =>
  GEM_TONES[color] ?? { stone: color, light: 'white', shadow: 'black', glow: color };
export const glowOf = (color: string): string => gemTone(color).glow;

// "Размер текста" scales typography only. TattoDiary sets the multiplier at
// the start of each render pass before child components call fs().
let textScale = 1;

export function setTextScale(scale: number): void {
  textScale = scale;
}

export const fs = (px: number): number => Math.round(px * textScale * 100) / 100;

export const DONE_EMOJI = '🍀';
