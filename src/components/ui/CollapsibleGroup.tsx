import { useState, type ReactNode } from 'react';
import { COLORS, fs } from './designTokens';

// Группа со стрелкой: заголовок + счётчик, тап сворачивает/раскрывает
// содержимое. Состояние локальное и не сохраняется — как у групп напоминаний.
export function CollapsibleGroup({
  title,
  count,
  defaultOpen,
  children,
}: {
  title: string;
  count: number;
  defaultOpen: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        onClick={() => setOpen((v) => !v)}
        role="button"
        aria-expanded={open}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 2px', cursor: 'pointer' }}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 18 18"
          fill="none"
          aria-hidden="true"
          style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}
        >
          <path d="M7 4L12 9L7 14" stroke={COLORS.gold} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span style={{ fontSize: fs(11), color: COLORS.textGhost, letterSpacing: '1.5px', textTransform: 'uppercase' }}>{title}</span>
        <span style={{ fontSize: fs(11), color: COLORS.textFaint }}>{count}</span>
      </div>
      {open && children}
    </div>
  );
}
