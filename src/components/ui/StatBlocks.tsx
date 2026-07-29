import { COLORS, fs } from '../TattoDiary';
import { DROP_CAP_FONT } from '../InkaLogo';
import { GoldFrame } from './Stripes';

// Вынесено из TattoDiary.tsx (PR 4 рефакторинга). Логика и разметка не
// менялись — только перенос в отдельный модуль.

// A single "ability score" style tile for the master dashboard's stat grid —
// bracketed corners and a big centered number, like a tabletop character
// sheet's stat block, but in the app's own gold/dark palette.
export function StatBlock({ label, value, big = true, plain = false }: { label: string; value: string | number; big?: boolean; plain?: boolean }) {
  return (
    <GoldFrame plain={plain} style={{ textAlign: 'center', padding: '18px 10px 16px' }}>
      <div style={{ fontSize: fs(10), color: COLORS.textGhost, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 8 }}>{label}</div>
      <div
        style={{
          fontFamily: DROP_CAP_FONT,
          fontSize: big ? fs(30) : fs(16),
          fontWeight: 600,
          lineHeight: 1.15,
          color: COLORS.gold,
          fontStyle: !big && value === 'Пока нет данных' ? 'italic' : 'normal',
        }}
      >
        {value}
      </div>
    </GoldFrame>
  );
}

// One stat tile split in half, sharing a single frame — used to fit two
// related counters (e.g. Срочно/Важно, or a period count stacked over an
// all-time count) into the space of one grid cell.
export function SplitStatBlock({
  direction = 'row',
  a,
  b,
}: {
  direction?: 'row' | 'column';
  a: { label: string; value: string | number; onClick?: () => void };
  b: { label: string; value: string | number; onClick?: () => void };
}) {
  const cell = (item: { label: string; value: string | number; onClick?: () => void }) => (
    <div
      onClick={item.onClick}
      role={item.onClick ? 'button' : undefined}
      aria-label={item.onClick ? item.label : undefined}
      style={{ flex: 1, textAlign: 'center', cursor: item.onClick ? 'pointer' : undefined }}
    >
      <div style={{ fontSize: fs(9.5), color: COLORS.textGhost, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 5 }}>
        {item.label}
      </div>
      <div style={{ fontFamily: DROP_CAP_FONT, fontSize: fs(20), fontWeight: 600, color: COLORS.gold }}>{item.value}</div>
    </div>
  );

  return (
    <GoldFrame style={{ padding: direction === 'row' ? '16px 10px' : '13px 10px' }}>
      <div style={{ display: 'flex', flexDirection: direction, alignItems: 'center', gap: direction === 'row' ? 8 : 10 }}>
        {cell(a)}
        <div
          style={{
            background: 'rgba(var(--gold-rgb),0.15)',
            width: direction === 'row' ? 1 : '100%',
            height: direction === 'row' ? 34 : 1,
            flexShrink: 0,
          }}
        />
        {cell(b)}
      </div>
    </GoldFrame>
  );
}
