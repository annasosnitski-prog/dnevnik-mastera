// The "INKA" wordmark, set in the same face as the drop-caps/names
// (Kelly Slab) so the logo and the decorative letterforms read as one
// family throughout the app.
export const DROP_CAP_FONT = "'Kelly Slab', 'Playfair Display', 'Inter', sans-serif";

export function InkaLogo({ height = 34, className }: { height?: number; className?: string }) {
  return (
    <div
      className={className}
      style={{
        display: 'inline-block',
        fontFamily: DROP_CAP_FONT,
        fontSize: height * 1.1176,
        lineHeight: 1,
        color: 'var(--gold)',
        letterSpacing: height * 0.0588,
        filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.35))',
      }}
      aria-label="INKA"
      role="img"
    >
      INKA
    </div>
  );
}

// The "INKA" half of a compound screen title (АдмINKA, ContentINKA) — set
// in the wordmark's own face and colour so it reads as the same brand
// mark wherever a title happens to end in "инка", not just on the literal
// logo. `fontSize` should match the surrounding title text's own size.
export function InkaTitleSuffix({ fontSize }: { fontSize: number }) {
  return (
    <span style={{ fontFamily: DROP_CAP_FONT, color: 'var(--gold)', letterSpacing: fontSize * 0.03 }}>
      INKA
    </span>
  );
}
