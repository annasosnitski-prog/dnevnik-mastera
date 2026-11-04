import { useState } from 'react';
import { type ProjectNoteItem } from '../../lib/projectGallery';
import { formatDate } from '../../utils/dates';
import { COLORS, fs, DONE_EMOJI } from '../TattoDiary';

// «Все заметки проекта» — тексты всех записей проекта плиткой в 2 колонки
// (см. collectProjectNotes). Плитка показывает начало текста; тап
// разворачивает её на всю ширину с полным текстом, повторный тап — сворачивает.
export function ProjectNotesTiles({ items }: { items: ProjectNoteItem[] }) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  return (
    <div>
      <div style={{ fontSize: fs(10), color: COLORS.textGhost, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 5 }}>
        Все заметки проекта{items.length > 0 ? ` · ${items.length}` : ''}
      </div>
      {items.length === 0 ? (
        <div style={{ fontSize: fs(12), color: COLORS.textGhost, fontStyle: 'italic' }}>В записях проекта пока нет заметок</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6 }}>
          {items.map((item) => {
            const expanded = openKey === item.key;
            const dateLabel = /^\d{4}-\d{2}-\d{2}$/.test(item.date) ? formatDate(item.date).replace(/ \d{4}$/, '') : '';
            return (
              <div
                key={item.key}
                onClick={() => setOpenKey(expanded ? null : item.key)}
                style={{
                  gridColumn: expanded ? '1 / -1' : undefined,
                  padding: '8px 10px',
                  borderRadius: 2,
                  cursor: 'pointer',
                  border: '1px solid rgba(var(--gold-rgb),0.15)',
                  background: 'rgba(var(--surface-rgb),0.018)',
                  minHeight: 72,
                  opacity: item.done ? 0.55 : 1,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: fs(9), color: COLORS.gold, letterSpacing: '1px', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.done ? `${DONE_EMOJI} ` : ''}{item.label}
                  </span>
                  {dateLabel && <span style={{ fontSize: fs(10), color: COLORS.textGhost, flexShrink: 0 }}>{dateLabel}</span>}
                </div>
                <div
                  dir="auto"
                  style={{
                    fontSize: fs(12.5),
                    color: COLORS.textPrimary,
                    lineHeight: 1.4,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    ...(expanded ? {} : { display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }),
                  }}
                >
                  {item.text}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
