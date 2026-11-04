import { PendantRail, TubeDividerBeads } from '../client/ClientCardTabBar';
// Вынесено из TattoDiary.tsx (PR 2 рефакторинга) — чистые презентационные
// иконки без связи с состоянием приложения.

// Заменяет прежний разделитель со звёздочкой (убран по фидбеку) — линия с
// рядом мелких точек вместо линии+звезды, без свечения на конце.
// Section divider — the same metal rail and threaded beads as the gem bar
// (PendantRail + TubeDividerBeads from ClientCardTabBar), just without the
// gems and without the active-section glow, so every divider in the app is
// one piece of hardware with the tab bar above the gems.
export function GoldDotDivider({ marginTop, marginBottom }: { marginTop?: number; marginBottom?: number }) {
  return (
    <div className="gold-rail-divider" aria-hidden="true" style={{ position: 'relative', height: 8, marginTop, marginBottom }}>
      <PendantRail count={4} />
      <TubeDividerBeads count={4} />
    </div>
  );
}

// A single filled star (same silhouette as StarDivider's), reused by the
// celebration bursts below. Defaults to the theme gold; callers can override
// with a card marker colour for variety.
export function StarIcon({ size = 14, color = 'var(--gold)', outline }: { size?: number; color?: string; outline?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" style={{ display: 'block' }}>
      <path
        d="M7 1L8.2 5.3H13L9.4 7.7L10.6 12L7 9.6L3.4 12L4.6 7.7L1 5.3H5.8Z"
        fill={color}
        stroke={outline}
        strokeWidth={outline ? 0.6 : 0}
        strokeLinejoin="round"
      />
    </svg>
  );
}
