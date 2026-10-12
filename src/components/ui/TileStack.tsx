import { COLORS, fs } from './designTokens';

export interface StackTileData {
  key: string;
  title: string;
  subtitle: string;
  // Подпись даты в углу плитки — готовая строка (форматирует вызывающий).
  note?: string;
  urgent?: boolean;
}

// Стопка плиток: свёрнутая — «стопка карточек» с числом, тап раскрывает её в
// сетку квадратных плиток по три в ряд (плитка вместо строк — общий принцип
// приложения). Раскрытием управляет родитель (open/onToggle), чтобы он мог
// развернуть открытую стопку на всю ширину.
export function TileStack({
  title,
  hint,
  accent,
  tiles,
  open,
  onToggle,
  onOpenTile,
}: {
  title: string;
  hint: string;
  accent: string;
  tiles: StackTileData[];
  open: boolean;
  onToggle: () => void;
  onOpenTile: (key: string) => void;
}) {
  const count = tiles.length;

  if (!open || count === 0) {
    const layers = Math.min(count, 3) - 1;
    return (
      <div
        onClick={count > 0 ? onToggle : undefined}
        role={count > 0 ? 'button' : undefined}
        aria-expanded={false}
        style={{ position: 'relative', cursor: count > 0 ? 'pointer' : 'default', paddingBottom: 8, paddingRight: 8 }}
      >
        {Array.from({ length: Math.max(layers, 0) }, (_, i) => (
          <div
            key={i}
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              transform: `translate(${(layers - i) * 4}px, ${(layers - i) * 4}px)`,
              border: `1px solid ${accent}55`,
              borderRadius: 3,
              background: COLORS.sheet,
            }}
          />
        ))}
        <div
          style={{
            position: 'relative',
            aspectRatio: '1 / 1',
            boxSizing: 'border-box',
            padding: 12,
            display: 'flex',
            flexDirection: 'column',
            border: `1px solid ${accent}99`,
            borderRadius: 3,
            background: COLORS.sheet,
            opacity: count === 0 ? 0.55 : 1,
          }}
        >
          <span style={{ fontSize: fs(10), color: COLORS.textGhost, letterSpacing: '1.5px', textTransform: 'uppercase' }}>{title}</span>
          <span style={{ fontSize: fs(34), color: accent, lineHeight: 1.1, marginTop: 6 }}>{count}</span>
          <span style={{ marginTop: 'auto', fontSize: fs(10), color: COLORS.textFaint, lineHeight: 1.3 }}>
            {count > 0 ? hint : 'пока пусто'}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div onClick={onToggle} role="button" aria-expanded style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 2px 10px', cursor: 'pointer' }}>
        <svg width="12" height="12" viewBox="0 0 18 18" fill="none" aria-hidden="true" style={{ transform: 'rotate(90deg)' }}>
          <path d="M7 4L12 9L7 14" stroke={accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span style={{ fontSize: fs(11), color: COLORS.textGhost, letterSpacing: '1.5px', textTransform: 'uppercase' }}>{title}</span>
        <span style={{ fontSize: fs(11), color: COLORS.textFaint }}>{count}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        {tiles.map((t) => (
          <div
            key={t.key}
            onClick={() => onOpenTile(t.key)}
            role="button"
            style={{
              aspectRatio: '1 / 1',
              minWidth: 0,
              boxSizing: 'border-box',
              padding: 10,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              cursor: 'pointer',
              border: `1px solid ${t.urgent ? 'var(--urgent)' : `${accent}66`}`,
              borderRadius: 3,
              background: 'rgba(var(--surface-rgb),0.022)',
              overflow: 'hidden',
            }}
          >
            <span
              dir="auto"
              style={{
                fontSize: fs(12),
                color: t.urgent ? 'var(--urgent)' : COLORS.textPrimary,
                lineHeight: 1.25,
                display: '-webkit-box',
                WebkitLineClamp: 4,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {t.title}
            </span>
            <span style={{ marginTop: 'auto', fontSize: fs(10), color: COLORS.textGhost, fontStyle: 'italic', lineHeight: 1.25, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
              {t.subtitle}
            </span>
            {t.note && <span style={{ fontSize: fs(10), color: t.urgent ? 'var(--urgent)' : COLORS.gold }}>{t.note}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
