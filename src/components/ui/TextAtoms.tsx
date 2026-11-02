import { COLORS, fs } from '../TattoDiary';

// Вынесено из TattoDiary.tsx (PR 4 рефакторинга). Логика и разметка не
// менялись — только перенос в отдельный модуль.

// Form field label — 8.5px uppercase, wide tracking.
export function FieldLabel({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: fs(11),
        color: COLORS.textGhost,
        letterSpacing: '2.5px',
        textTransform: 'uppercase',
        marginBottom: 7,
        display: action ? 'flex' : undefined,
        alignItems: action ? 'center' : undefined,
        gap: action ? 6 : undefined,
      }}
    >
      {children}
      {action}
    </div>
  );
}

export function MetaLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: fs(11), color: COLORS.textGhost, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 6 }}>
      {children}
    </div>
  );
}
export function MetaValue({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: fs(15), color: COLORS.textPrimary, fontWeight: 300 }}>{children}</div>;
}


export function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: "'Kelly Slab', 'Playfair Display', serif",
        fontSize: fs(11),
        color: COLORS.textGhost,
        letterSpacing: '3.5px',
        textTransform: 'uppercase',
        marginBottom: 12,
      }}
    >
      {children}
    </div>
  );
}
