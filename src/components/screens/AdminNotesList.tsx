import type * as React from 'react';
import { URGENCY, type UrgencyKey } from '../../domain/urgency';
import { formatDate } from '../../utils/dates';
import { COLORS, fs } from '../ui/designTokens';
import type { AdminNotesUrgencyGroup } from './adminNotesList';

// Расширенный список заметок вкладки «Задачи» (M5D) — все незавершённые
// заметки (клиентские и личные), сгруппированные по всем четырём уровням
// срочности, включая заметки без срока. Дополняет радар напоминаний
// (RemindersSection) выше в той же вкладке — тот показывает только то, что
// уже требует действия по дате; здесь — вообще все открытые заметки для
// обзора. Клик по любой заметке открывает существующий Блокнот, отфильтрованный
// по её уровню срочности (onOpenNotes) — та же навигация, что уже
// используют кнопки «Блокнота» в «Рабочей сводке», новой логики фильтра нет.
export function AdminNotesList({
  groups,
  onOpenNotes,
}: {
  groups: AdminNotesUrgencyGroup[];
  onOpenNotes: (urgency: UrgencyKey) => void;
}) {
  const sectionHeadingStyle: React.CSSProperties = {
    fontSize: fs(11),
    color: COLORS.textGhost,
    letterSpacing: '1.5px',
    textTransform: 'uppercase',
  };
  const groupLabelStyle: React.CSSProperties = { ...sectionHeadingStyle, fontSize: fs(10), margin: '12px 0 6px' };
  const totalCount = groups.reduce((sum, g) => sum + g.items.length, 0);

  return (
    <div>
      <div style={sectionHeadingStyle}>Заметки · {totalCount}</div>

      {groups.length === 0 ? (
        <div style={{ fontSize: fs(13), color: COLORS.textGhost, fontStyle: 'italic', marginTop: 12 }}>
          Открытых заметок нет
        </div>
      ) : (
        groups.map((group) => {
          const meta = URGENCY.find((u) => u.key === group.urgency);
          return (
            <div key={group.urgency}>
              <div style={groupLabelStyle}>
                {meta?.emoji} {group.label} · {group.items.length}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {group.items.map((item) => (
                  <button
                    key={item.note.id}
                    type="button"
                    onClick={() => onOpenNotes(group.urgency)}
                    aria-label={`${item.ownerLabel}: ${item.note.text || 'Заметка'}${item.note.dueDate ? `, срок ${formatDate(item.note.dueDate)}` : ''}`}
                    style={{
                      appearance: 'none',
                      font: 'inherit',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      width: '100%',
                      gap: 8,
                      padding: '8px 10px',
                      borderRadius: 2,
                      cursor: 'pointer',
                      border: '1px solid rgba(var(--gold-rgb),0.1)',
                      background: 'transparent',
                      textAlign: 'left',
                    }}
                  >
                    <span style={{ minWidth: 0 }}>
                      <span
                        style={{
                          display: 'block',
                          fontSize: fs(14),
                          color: COLORS.textPrimary,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {item.note.text || 'Заметка'}
                      </span>
                      <span
                        style={{
                          display: 'block',
                          fontSize: fs(10),
                          color: COLORS.textGhost,
                          letterSpacing: '1px',
                          textTransform: 'uppercase',
                        }}
                      >
                        {item.ownerLabel}
                      </span>
                    </span>
                    {item.note.dueDate && (
                      <span style={{ fontSize: fs(12), color: COLORS.gold, flexShrink: 0 }}>{formatDate(item.note.dueDate)}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
