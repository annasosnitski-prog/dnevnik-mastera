// Единая точка входа "+" — заменяет прежние отдельные AddChoiceSheet
// (сессия/консультация, карточка клиента) и WorkshopCreateChoiceSheet
// (проект/сессия, «Мастерская»). Одна и та же шторка везде, просто с разным
// подмножеством options под конкретный контекст (внутри открытого проекта —
// без «Проект», в админке — без «Заметка», и т.д.) — см. вызовы в
// TattoDiary.tsx.
import type * as React from 'react';
import { BottomSheet, SheetCloseButton } from '../ui/Sheet';
import { SheetStarDivider } from '../ui/TextAtoms';
import { COLORS, fs } from '../TattoDiary';

export type CreateOptionKind = 'project' | 'session' | 'consultation' | 'note';

const CREATE_OPTION_META: Record<CreateOptionKind, { title: string; desc: string; icon: React.ReactNode }> = {
  project: {
    title: 'Новый проект',
    desc: 'Бриф: тип, место, стиль, референсы...',
    icon: (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
        <path d="M10 3v14M3 10h14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
  session: {
    title: 'Сессия',
    desc: 'Дата, техника, стиль, зона работы...',
    icon: (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
        <rect x="3" y="4.5" width="14" height="12" rx="1" stroke="currentColor" strokeWidth="1.2" />
        <line x1="3" y1="8" x2="17" y2="8" stroke="currentColor" strokeWidth="1.2" />
        <line x1="6.5" y1="2.5" x2="6.5" y2="5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <line x1="13.5" y1="2.5" x2="13.5" y2="5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    ),
  },
  consultation: {
    title: 'Консультация',
    desc: 'Референсы, идея, данные о коже...',
    icon: (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
        <rect x="3" y="4" width="14" height="12" rx="1" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="7" cy="8" r="1.3" stroke="currentColor" strokeWidth="1.1" />
        <path d="M3 14L8 10L11 12.5L14 9.5L17 13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  note: {
    title: 'Заметка',
    desc: 'Мысль, задача со сроком или просто на память...',
    icon: (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
        <path d="M5 3h10v14l-3-2-2 2-2-2-3 2V3Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
        <line x1="7.5" y1="7" x2="12.5" y2="7" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        <line x1="7.5" y1="10" x2="12.5" y2="10" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      </svg>
    ),
  },
};

// heightPct растёт с числом опций — тот же 34% для прежних 2-вариантных
// шторок, пропорционально больше для 3-4.
function heightForOptionCount(count: number): number {
  return 10 + count * 12;
}

export function CreateChoiceSheet({
  open,
  onClose,
  options,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  // Порядок — порядок отображения; какие опции показывать в конкретном
  // контексте решает вызывающий код (TattoDiary.tsx), не сам компонент.
  options: CreateOptionKind[];
  onPick: (kind: CreateOptionKind) => void;
}) {
  const choice = (kind: CreateOptionKind) => {
    const meta = CREATE_OPTION_META[kind];
    return (
      <div
        key={kind}
        onClick={() => onPick(kind)}
        role="button"
        aria-label={meta.title}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          border: '1px solid rgba(var(--gold-rgb),0.25)',
          borderRadius: 2,
          padding: '16px',
          cursor: 'pointer',
          background: 'rgba(var(--gold-rgb),0.03)',
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            border: '1px solid rgba(var(--gold-rgb),0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            color: 'var(--gold)',
          }}
        >
          {meta.icon}
        </div>
        <div>
          <div style={{ fontSize: fs(16), color: COLORS.textPrimary }}>{meta.title}</div>
          <div style={{ fontSize: fs(12), color: COLORS.textGhost, fontStyle: 'italic', marginTop: 2 }}>{meta.desc}</div>
        </div>
      </div>
    );
  };

  return (
    <BottomSheet open={open} heightPct={heightForOptionCount(options.length)}>
      <div style={{ padding: '16px 24px 14px', position: 'relative' }}>
        <SheetCloseButton onClose={onClose} />
        <div style={{ fontSize: fs(22), color: COLORS.textPrimary, fontWeight: 300, letterSpacing: '1px' }}>Что добавить?</div>
        <SheetStarDivider />
      </div>
      <div style={{ padding: '4px 24px 40px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {options.map((kind) => choice(kind))}
      </div>
    </BottomSheet>
  );
}
