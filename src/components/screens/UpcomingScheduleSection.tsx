import type * as React from 'react';
import { formatDate } from '../../utils/dates';
import { COLORS, fs } from '../ui/designTokens';
import type { UpcomingDayGroup } from './upcomingSchedule';

// Компактное «Предстоящие записи» (M5C, упрощена в M5D) — та же визуальная
// логика, что у групп напоминаний и «Рабочей сводки»: заголовок, тонкие
// разделители, компактные строки, без внешней рамки и без карточки вокруг
// каждой группы дня. Группы уже посчитаны снаружи (buildUpcomingSchedule) —
// здесь только раскладка; какие записи допустимы и в каком порядке —
// по-прежнему решает upcomingItems. Свой тумблер периода убран (M5D) —
// период теперь один общий, живёт в шапке Админки.
export function UpcomingScheduleSection({
  groups,
  onOpenSession,
}: {
  groups: UpcomingDayGroup[];
  onOpenSession: (clientId: string, itemId: string, kind: 'session' | 'consultation') => void;
}) {
  const totalCount = groups.reduce((sum, g) => sum + g.items.length, 0);

  const sectionHeadingStyle: React.CSSProperties = {
    fontSize: fs(11),
    color: COLORS.textGhost,
    letterSpacing: '1.5px',
    textTransform: 'uppercase',
  };
  const dayLabelStyle: React.CSSProperties = { ...sectionHeadingStyle, fontSize: fs(10), margin: '12px 0 6px' };
  const dividerStyle: React.CSSProperties = { background: 'rgba(var(--gold-rgb),0.15)', width: '100%', height: 1, margin: '12px 0' };

  return (
    <div>
      <div style={sectionHeadingStyle}>Предстоящие записи · {totalCount}</div>

      <div style={dividerStyle} />

      {groups.length === 0 ? (
        <div style={{ fontSize: fs(13), color: COLORS.textGhost, fontStyle: 'italic', marginTop: 12 }}>
          Нет записей на выбранный период
        </div>
      ) : (
        groups.map((group) => (
          <div key={group.date}>
            <div style={dayLabelStyle}>{group.label}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {group.items.map((item) => {
                const kindLabel = item.kind === 'consultation' ? 'Консультация' : 'Сессия';
                const name = item.client.name || '—';
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onOpenSession(item.client.id, item.id, item.kind)}
                    aria-label={`${name}, ${kindLabel}, ${formatDate(item.date)}${item.time ? `, ${item.time}` : ''}`}
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
                        {name}
                      </span>
                      <span
                        style={{
                          display: 'block',
                          fontSize: fs(10),
                          color: item.kind === 'consultation' ? COLORS.gold : COLORS.textGhost,
                          letterSpacing: '1px',
                          textTransform: 'uppercase',
                        }}
                      >
                        {kindLabel}
                      </span>
                    </span>
                    {item.time && <span style={{ fontSize: fs(12), color: COLORS.gold, flexShrink: 0 }}>{item.time}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
