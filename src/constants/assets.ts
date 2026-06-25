import { ThemeMode } from '../context/ThemeContext';

// Asset counts per theme
const ASSET_COUNTS = {
  light: { masks: 8, vitrage: 5, decorative: 3, castles: 0, vitrageGlow: 0 },
  dark: { masks: 1, vitrage: 10, decorative: 2, castles: 6, vitrageGlow: 8 },
};

// Get a random asset path for a given category
export function getAssetPath(theme: ThemeMode, category: string, index: number): string {
  return `/assets/${theme}/${category}/${category === 'castles' ? 'castle' : category === 'masks' ? 'mask' : category === 'vitrage' ? 'vitrage' : category === 'decorative' ? 'decor' : 'icon'}_${index}.png`;
}

// Get a random mask for a client card (seeded by client id for consistency)
export function getRandomMask(theme: ThemeMode, clientId: string): string {
  const count = ASSET_COUNTS[theme].masks;
  if (count === 0) return '';
  const seed = hashCode(clientId);
  const index = (Math.abs(seed) % count) + 1;
  return `/assets/${theme}/masks/mask_${index}.png`;
}

// Get a random vitrage element (seeded for consistency)
export function getRandomVitrage(theme: ThemeMode, seed: string): { path: string; isGlow: boolean } {
  const regular = ASSET_COUNTS[theme].vitrage;
  const glow = ASSET_COUNTS[theme].vitrageGlow;
  const total = regular + glow;
  if (total === 0) return { path: '', isGlow: false };
  
  const h = Math.abs(hashCode(seed));
  const pick = (h % total) + 1;
  
  if (pick <= regular) {
    return { path: `/assets/${theme}/vitrage/vitrage_${pick}.png`, isGlow: false };
  } else {
    return { path: `/assets/${theme}/vitrage/vitrage_glow_${pick - regular}.png`, isGlow: true };
  }
}

// Get a random castle overlay (dark theme only)
export function getRandomCastle(theme: ThemeMode, seed: string): string {
  const count = ASSET_COUNTS[theme].castles;
  if (count === 0) return '';
  const h = Math.abs(hashCode(seed));
  const index = (h % count) + 1;
  return `/assets/${theme}/castles/castle_${index}.png`;
}

// Get texture background
export function getTexturePath(theme: ThemeMode): string {
  return `/assets/textures/texture_${theme}.png`;
}

// Simple string hash for seeded randomness (same client always gets same mask)
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash;
}

// Theme color palettes
export const THEME_COLORS = {
  light: {
    bg: '#F7F4EE',
    bgCard: '#FFFAF5',
    accent: '#CBB48A',
    accentHover: '#E7D6A6',
    text: '#8B7D6B',
    textMuted: '#B8A896',
    textDark: '#5C4A3D',
    border: '#E0D5C7',
    borderStrong: '#D9D0C4',
    rose: '#EED6D2',
    amber: '#F3E4C4',
    error: '#C97B6B',
    success: '#8BAB7A',
  },
  dark: {
    bg: '#111010',
    bgCard: '#1A1A1A',
    accent: '#D4A574',
    accentHover: '#E8C547',
    text: '#D4A574',
    textMuted: '#8B8B8B',
    textDark: '#E8DCC8',
    border: '#3A3A3A',
    borderStrong: '#8B3A3A',
    rose: '#2A1A1A',
    amber: '#2A2010',
    error: '#8B3A3A',
    success: '#3A6B3A',
  },
};
