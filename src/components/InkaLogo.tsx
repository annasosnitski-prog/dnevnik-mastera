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
