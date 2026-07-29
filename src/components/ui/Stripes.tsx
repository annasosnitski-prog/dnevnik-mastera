import { hexToRgba } from '../../lib/textFormat';

// Вынесено из TattoDiary.tsx (PR 4 рефакторинга). Логика и разметка не
// менялись — только перенос в отдельный модуль.

// Foil-look border pieces used on client cards (and the gold Мастер/Админка
// frames below). The top stripe runs the full width of the card's top edge
// (tapered to a nib on the left); the right stripe runs down the card's right
// edge (tapered to a nib at the bottom). They meet over the gem corner.
// Clip-path tapers live in index.css. Used in both themes.
export function TopStripe({ color }: { color: string }) {
  return (
    <div
      className="inka-stripe"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 2,
        zIndex: 6, // above the gem corner so it tucks under the stripe
        pointerEvents: 'none',
        background: `linear-gradient(90deg, ${color} 0%, #f6e8c4 48%, ${color} 100%)`,
        boxShadow: `0 1px 2px ${hexToRgba(color, 0.4)}`,
      }}
    />
  );
}

// Vertical stripe dropping down the card's right edge from the top-right corner,
// tapered to a point at the bottom (nib), over the gem corner.
export function RightStripe({ color }: { color: string }) {
  return (
    <div
      className="inka-stripe-right"
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        right: 0,
        width: 2,
        zIndex: 6,
        pointerEvents: 'none',
        background: `linear-gradient(180deg, ${color} 0%, #f6e8c4 48%, ${color} 100%)`,
        boxShadow: `-1px 0 2px ${hexToRgba(color, 0.4)}`,
      }}
    />
  );
}

// Coloured-glass "gem" corner: a small translucent bevelled triangle with
// gradient depth (глубина) and a soft colour reflection spilling onto the card
// surface (цветной отсвет). Tucked under the top stripe; no specular glint.
export function GemCorner({ color, size = 19 }: { color: string; size?: number }) {
  return (
    <>
      {/* colour reflection cast onto the surface */}
      <div
        style={{
          position: 'absolute',
          top: -6,
          right: -6,
          width: size + 20,
          height: size + 20,
          background: `radial-gradient(circle at top right, ${hexToRgba(color, 0.45)}, transparent 66%)`,
          filter: 'blur(5px)',
          zIndex: 2,
          pointerEvents: 'none',
        }}
      />
      {/* glass body */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: size,
          height: size,
          clipPath: 'polygon(100% 0, 0 0, 100% 100%)',
          background: `linear-gradient(215deg, ${color} 0%, ${hexToRgba(color, 0.6)} 52%, ${hexToRgba(color, 0.12)} 100%)`,
          boxShadow: `inset 2px -2px 3px ${hexToRgba(color, 0.5)}`,
          zIndex: 3,
          pointerEvents: 'none',
        }}
      />
    </>
  );
}

// Gold versions of the client card's foil stripes + gem corner — same recipe
// (gradient stripe with a bright sheen, glass corner with a soft reflection),
// just always gold instead of the per-client marker colour, and mirrored to
// the bottom-left (rather than the client card's top-right) so Админка's
// frames read as their own thing. Used to frame boxes on the master
// dashboard so they read as one family with the cards.
function GoldBottomStripe() {
  return (
    <div
      className="inka-stripe"
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 2,
        zIndex: 6,
        pointerEvents: 'none',
        background: 'linear-gradient(90deg, var(--gold) 0%, #f6e8c4 48%, var(--gold) 100%)',
        boxShadow: '0 -1px 2px rgba(var(--gold-rgb),0.4)',
      }}
    />
  );
}
function GoldLeftStripe() {
  return (
    <div
      className="inka-stripe-right"
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 0,
        width: 2,
        zIndex: 6,
        pointerEvents: 'none',
        background: 'linear-gradient(180deg, var(--gold) 0%, #f6e8c4 48%, var(--gold) 100%)',
        boxShadow: '1px 0 2px rgba(var(--gold-rgb),0.4)',
      }}
    />
  );
}
function GoldGemCorner({ size = 16 }: { size?: number }) {
  return (
    <>
      <div
        style={{
          position: 'absolute',
          bottom: -6,
          left: -6,
          width: size + 20,
          height: size + 20,
          background: 'radial-gradient(circle at bottom left, rgba(var(--gold-rgb),0.45), transparent 66%)',
          filter: 'blur(5px)',
          zIndex: 2,
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          width: size,
          height: size,
          clipPath: 'polygon(0 100%, 100% 100%, 0 0)',
          background: 'linear-gradient(35deg, var(--gold) 0%, rgba(var(--gold-rgb),0.6) 52%, rgba(var(--gold-rgb),0.12) 100%)',
          boxShadow: 'inset -2px 2px 3px rgba(var(--gold-rgb),0.5)',
          zIndex: 3,
          pointerEvents: 'none',
        }}
      />
    </>
  );
}
// Gold reads through the theme's --gold-rgb custom property (so it tracks
// light/dark theme changes); any other accent is a literal hex, tinted via
// hexToRgba instead. Shared by GemCornerBL/BR below.
// Wraps a box in the same stripe+gem-corner+inset-ring frame as a client
// card, all gold. Used throughout the master dashboard — pass `plain` to
// keep just the card surface, no stripes/corner (the Мастер tab's own cards
// go plain; Админка keeps the full frame).
export function GoldFrame({ children, style, plain = false }: { children: React.ReactNode; style?: React.CSSProperties; plain?: boolean }) {
  return (
    <div className="inka-static" style={{ position: 'relative', borderRadius: 3, overflow: 'hidden', background: 'rgba(var(--surface-rgb),0.018)', ...(plain ? { boxShadow: 'var(--card-rest-shadow)' } : {}), ...style }}>
      {!plain && (
        <>
          <GoldBottomStripe />
          <GoldLeftStripe />
          <GoldGemCorner />
        </>
      )}
      <div style={{ position: 'relative', zIndex: 2 }}>{children}</div>
    </div>
  );
}
