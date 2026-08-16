import type { ReactNode } from 'react';
import './controls.css';

export interface ChipProps {
  children: ReactNode;
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
}

// Настоящая <button aria-pressed> — по образцу уже верно сделанного
// ArchetypeToolbar. Цель: свести независимые chipStyle-хелперы (минимум
// 7 штук по проекту, 4 из них — в одном RemindersSection.tsx) к одному
// компоненту.
export function Chip({ children, selected, onSelect, disabled }: ChipProps) {
  return (
    <button
      type="button"
      className={`ctl-chip${selected ? ' ctl-chip--selected' : ''}`}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
    >
      {children}
    </button>
  );
}
