import { useEffect, useState } from 'react';
import { COLORS, fs, INPUT_STYLE } from '../TattoDiary';
import { BottomSheet, SheetCloseButton } from '../ui/Sheet';
import { FieldLabel } from '../ui/TextAtoms';
import { GoldDotDivider } from '../icons/StarIcons';
import { canConfirmDraft, type VoiceDraft, type VoiceDraftField } from '../../voice/commands';

// Подсветка полей карточки: неуверенное — золотая рамка, ненадиктованное —
// пунктир, чтобы глазом было видно, что проверить и что дописать руками.
function fieldAccent(field: VoiceDraftField) {
  if (field.uncertain) return { borderColor: COLORS.gold, boxShadow: '0 0 0 1px rgba(201, 162, 78, 0.45)' };
  if (!field.value.trim()) return { borderStyle: 'dashed' as const, opacity: 0.8 };
  return {};
}

// Шторка подтверждения голосовой команды: что услышали + поля черновика,
// которые можно поправить. Красный крестик — отмена, зелёная галочка —
// сохранить (тем же путём, что и создание из круглого меню). Без галочки
// ничего не сохраняется.
export function VoiceDraftSheet({
  draft,
  onCancel,
  onConfirm,
}: {
  draft: VoiceDraft | null;
  onCancel: () => void;
  onConfirm: (draft: VoiceDraft) => void;
}) {
  const [current, setCurrent] = useState<VoiceDraft | null>(draft);
  useEffect(() => {
    if (draft) setCurrent(draft);
  }, [draft]);

  const shown = draft ? current : null;
  const canConfirm = !!shown && canConfirmDraft(shown);
  const setField = (key: string, value: string) =>
    setCurrent((prev) => (prev ? { ...prev, fields: prev.fields.map((f) => (f.key === key ? { ...f, value } : f)) } : prev));

  return (
    <BottomSheet open={!!draft} heightPct={70} zIndex={970}>
      <div style={{ padding: '16px 24px 14px', position: 'relative' }}>
        <SheetCloseButton onClose={onCancel} />
        <div
          role="button"
          aria-label="Сохранить"
          aria-disabled={!canConfirm}
          onClick={() => canConfirm && shown && onConfirm(shown)}
          style={{ position: 'absolute', top: 17, right: 52, cursor: canConfirm ? 'pointer' : 'default', opacity: canConfirm ? 1 : 0.35 }}
        >
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <path d="M2.5 8.3L6 11.8L13.5 4.3" stroke="#5E8C4A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div style={{ fontSize: fs(22), color: COLORS.textPrimary, fontWeight: 300, letterSpacing: '1px' }}>{shown?.title}</div>
        {shown?.transcript && (
          <div style={{ marginTop: 6, fontSize: fs(12), color: COLORS.textMuted, fontStyle: 'italic' }}>«{shown.transcript}»</div>
        )}
        {shown?.hint && <div style={{ marginTop: 8, fontSize: fs(13), color: COLORS.gold }}>{shown.hint}</div>}
        <GoldDotDivider marginTop={11} />
      </div>
      <div style={{ padding: '4px 24px 50px' }}>
        {shown?.fields.map((field) => (
          <div key={field.key} style={{ marginBottom: 16 }}>
            <FieldLabel>
              {field.label}
              {field.required ? ' *' : ''}
              {field.uncertain && <span style={{ color: COLORS.gold, marginLeft: 6 }}>· проверьте</span>}
              {!field.options && !field.value.trim() && <span style={{ color: COLORS.textMuted, marginLeft: 6, opacity: 0.7 }}>· не надиктовано</span>}
            </FieldLabel>
            {field.options ? (
              // Переспрос: плитки кандидатов (клиент/проект/сессия). Пока ни
              // одна не выбрана, галочка неактивна.
              <div role="radiogroup" aria-label={field.label} style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                {field.options.map((option) => {
                  const selected = option.value === field.value;
                  return (
                    <div
                      key={option.value}
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setField(field.key, !field.required && selected ? '' : option.value)}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 10,
                        minHeight: 44,
                        cursor: 'pointer',
                        fontSize: fs(13),
                        lineHeight: 1.3,
                        color: COLORS.textPrimary,
                        border: `1px solid ${selected ? COLORS.gold : 'rgba(201, 162, 78, 0.25)'}`,
                        background: selected ? 'rgba(201, 162, 78, 0.14)' : 'transparent',
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {option.label}
                    </div>
                  );
                })}
                {!field.options.length && <div style={{ fontSize: fs(13), color: COLORS.textMuted }}>Нет подходящих записей</div>}
              </div>
            ) : field.multiline ? (
              <textarea
                dir="auto"
                value={field.value}
                onChange={(e) => setField(field.key, e.target.value)}
                style={{ ...INPUT_STYLE, ...fieldAccent(field), resize: 'none', height: 80 }}
              />
            ) : (
              <input
                dir="auto"
                type={field.inputType ?? 'text'}
                value={field.value}
                onChange={(e) => setField(field.key, e.target.value)}
                style={{ ...INPUT_STYLE, ...fieldAccent(field) }}
              />
            )}
          </div>
        ))}
      </div>
    </BottomSheet>
  );
}

// Пузырь над хабом: «Слушаю…» с живым текстом, «Разбираю…», или короткое
// сообщение (не поняла / нет микрофона).
// ready=false в фазе listening — движок ещё включается: говорить рано,
// первые слова пропадут. Как только включился — «Говорите…» и вибрация.
export function VoiceStatusBubble({
  phase,
  text,
  ready = true,
}: {
  phase: 'idle' | 'listening' | 'thinking' | 'message';
  text: string;
  ready?: boolean;
}) {
  if (phase === 'idle') return null;
  const label = phase === 'listening' ? (ready ? 'Говорите…' : 'Включаю микрофон…') : phase === 'thinking' ? 'Разбираю…' : '';
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 112px)',
        transform: 'translateX(-50%)',
        zIndex: 962,
        maxWidth: 'calc(100vw - 32px)',
        width: 'max-content',
        padding: '10px 16px',
        borderRadius: 14,
        background: 'rgba(0, 0, 0, 0.78)',
        border: '1px solid rgba(201, 162, 78, 0.45)',
        color: '#F3EBDD',
        fontSize: fs(13),
        textAlign: 'center',
        pointerEvents: 'none',
      }}
    >
      {label && <div style={{ color: COLORS.gold, fontSize: fs(11), letterSpacing: '1px', marginBottom: text ? 4 : 0 }}>{label}</div>}
      {text && <div dir="auto">{text}</div>}
    </div>
  );
}
