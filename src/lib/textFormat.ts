// Мелкие чистые текстовые/цветовые хелперы. Вынесено из TattoDiary.tsx
// (PR 3 рефакторинга). Логика не менялась — только перенос.

// Converts a #rrggbb hex to an rgba() string at the given alpha.
export function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return hex;
  const int = parseInt(m[1], 16);
  return `rgba(${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}, ${alpha})`;
}

// True for strings that start in a right-to-left script (Hebrew, Arabic, …), so
// the layout can flip the drop-cap + name into their natural reading order.
const RTL_RE = /[֐-׿؀-ۿ܀-ݏހ-޿יִ-﷿ﹰ-﻿]/;
export const isRTL = (s: string) => RTL_RE.test((s || '').trim().charAt(0));

export const firstLetter = (name: string) => (name ? name.charAt(0).toUpperCase() : '?');
export const nameRest = (name: string) => (name ? name.slice(1) : '');
