import type * as React from 'react';
import type { UrgencyKey } from '../../domain/urgency';
import { COLORS, fs } from '../ui/designTokens';
import { DASHBOARD_WINDOW_OPTIONS } from '../ui/preferences';
import type { AdminWorkSummaryModel } from './adminWorkSummary';

// Компактная «Рабочая сводка» (M5B) — заменяет прежнюю россыпь отдельных
// рамок (тумблер периода + большая карточка «Клиентов» + два SplitStatBlock)
// одной секцией: заголовки, компактные строки, тонкие разделители — без
// карточки-в-карточке и без нового расчёта. Все семь чисел уже посчитаны
// снаружи (buildAdminWorkSummary) — здесь только раскладка.
export function AdminWorkSummary({
  model,
  selectedWindowDays,
  onChangeWindowDays,
  onOpenNotes,
}: {
  model: AdminWorkSummaryModel;
  selectedWindowDays: number;
  onChangeWindowDays: (days: number) => void;
  onOpenNotes: (urgency: UrgencyKey) => void;
}) {
  const sectionHeadingStyle: React.CSSProperties = {
    fontSize: fs(11),
    color: COLORS.textGhost,
    letterSpacing: '1.5px',
    textTransform: 'uppercase',
  };
  const subheadStyle: React.CSSProperties = { ...sectionHeadingStyle, fontSize: fs(10), marginBottom: 8 };
  const dividerStyle: React.CSSProperties = { background: 'rgba(var(--gold-rgb),0.15)', width: '100%', height: 1 };
  const rowLabelStyle: React.CSSProperties = { fontSize: fs(13), color: COLORS.textPrimary };
  const rowValueStyle: React.CSSProperties = { fontSize: fs(13), color: COLORS.gold, fontWeight: 600 };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <div style={sectionHeadingStyle}>Рабочая сводка</div>
        <div style={{ fontSize: fs(12), color: COLORS.textGhost }}>
          Клиентов · <span style={{ color: COLORS.gold, fontWeight: 600 }}>{model.clientsCount}</span>
        </div>
      </div>

      <div style={dividerStyle} />

      <div style={{ padding: '12px 0' }}>
        <div style={subheadStyle}>Период нагрузки</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
          {DASHBOARD_WINDOW_OPTIONS.map((o) => (
            <button
              key={o.days}
              type="button"
              onClick={() => onChangeWindowDays(o.days)}
              aria-pressed={selectedWindowDays === o.days}
              style={{
                appearance: 'none',
                font: 'inherit',
                fontSize: fs(12),
                padding: '4px 10px',
                borderRadius: 2,
                cursor: 'pointer',
                border: selectedWindowDays === o.days ? '1px solid rgba(var(--gold-rgb),0.6)' : '1px solid rgba(var(--gold-rgb),0.15)',
                background: selectedWindowDays === o.days ? 'rgba(var(--gold-rgb),0.08)' : 'transparent',
                color: selectedWindowDays === o.days ? COLORS.gold : COLORS.textFaint,
              }}
            >
              {o.label}
            </button>
          ))}
        </div>

        <div style={subheadStyle}>Нагрузка</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
          <span style={rowLabelStyle}>Назначено сессий</span>
          <span style={rowValueStyle}>{model.plannedSessionsCount}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
          <span style={rowLabelStyle}>Консультаций</span>
          <span style={rowValueStyle}>{model.plannedConsultationsCount}</span>
        </div>
      </div>

      <div style={dividerStyle} />

      <div style={{ padding: '12px 0 2px' }}>
        <div style={subheadStyle}>Блокнот</div>
        <NotebookRow
          groupLabel="Клиентские"
          urgentCount={model.clientUrgentCount}
          importantCount={model.clientImportantCount}
          onOpenNotes={onOpenNotes}
        />
        <NotebookRow
          groupLabel="Личные"
          urgentCount={model.personalUrgentCount}
          importantCount={model.personalImportantCount}
          onOpenNotes={onOpenNotes}
        />
      </div>
    </div>
  );
}

// Один ряд «Блокнота»: подпись группы + две кнопки (Срочно/Важно), обе всегда
// кликабельны — даже при нуле, это сводка, а не список уведомлений (п. 11).
// Настоящие <button type="button">, не div role="button" — фикс из ТЗ M5B, п. 5.
function NotebookRow({
  groupLabel,
  urgentCount,
  importantCount,
  onOpenNotes,
}: {
  groupLabel: string;
  urgentCount: number;
  importantCount: number;
  onOpenNotes: (urgency: UrgencyKey) => void;
}) {
  const btnStyle: React.CSSProperties = {
    appearance: 'none',
    font: 'inherit',
    display: 'flex',
    alignItems: 'baseline',
    gap: 5,
    fontSize: fs(13),
    background: 'transparent',
    border: '1px solid transparent',
    borderRadius: 2,
    padding: '3px 6px',
    margin: '-3px 0',
    cursor: 'pointer',
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4, padding: '5px 0' }}>
      <span style={{ flex: '1 1 88px', fontSize: fs(12), color: COLORS.textGhost }}>{groupLabel}</span>
      <button
        type="button"
        onClick={() => onOpenNotes('urgent')}
        aria-label={`${groupLabel} · Срочно · ${urgentCount}`}
        style={btnStyle}
      >
        <span style={{ color: COLORS.textGhost }}>Срочно ·</span>
        <span style={{ color: COLORS.gold, fontWeight: 600 }}>{urgentCount}</span>
      </button>
      <button
        type="button"
        onClick={() => onOpenNotes('important')}
        aria-label={`${groupLabel} · Важно · ${importantCount}`}
        style={btnStyle}
      >
        <span style={{ color: COLORS.textGhost }}>Важно ·</span>
        <span style={{ color: COLORS.gold, fontWeight: 600 }}>{importantCount}</span>
      </button>
    </div>
  );
}
