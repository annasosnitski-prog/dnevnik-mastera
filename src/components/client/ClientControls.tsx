import { useState, useRef } from 'react';
import { type ClientType, CLIENT_TYPES, type ChatPlatform, PLATFORM_LABELS } from '../../domain/client';
import { type UrgencyKey, URGENCY } from '../../domain/urgency';
import { type ProjectCategory, PROJECT_CATEGORIES, type NextActionType, NEXT_ACTION_TYPES, resolveNextStep } from '../../domain/project';
import { downsizeForStorage } from '../../lib/imagePreview';
import { formatDate } from '../../utils/dates';
import { COLORS, fs, MARKER_COLORS, STYLES, STYLES_PINNED_COUNT, INPUT_STYLE } from '../TattoDiary';

// Вынесено из TattoDiary.tsx (PR 10 рефакторинга) — общие форм-контролы
// «карточки клиента», которые использует и сам экран деталей, и bottom
// sheets (New/EditClientSheet, NewSessionSheet, ...). Логика и разметка не
// менялись — только перенос; раньше эти компоненты были экспортированы из
// TattoDiary.tsx, теперь живут в своём модуле. SKIN_TONES/SKIN_TONES_PINNED_STEP
// использовались только SkinTonePalette — перенесены вместе с ним.

// Skin-tone swatches (light → deep) the master picks from when creating a card.
// Light → dark. Mostly a warm-undertone gradient, with a few cool-undertone
// tones (porcelain "blue-blood" pale + olive) and warm-red tones (Arab/South
// Asian) folded in at matching lightness so the row still reads as one scale.
const SKIN_TONES = [
  '#F5E6E8', '#F6E0D0', '#EDD9DC', '#F0D0B8', '#E2C9CE', '#E8C0A0', '#E0B090',
  '#D8A47E', '#C89268', '#A69477', '#B67E52', '#8A7B5C', '#A66E44', '#B5654A',
  '#925C38', '#6B5D42', '#8F4632', '#7E4C2E', '#6A3C24', '#54301C', '#3E2416',
  '#2C1810',
];
// Before anything's picked, showing all 22 swatches at once is a lot — pin
// every 3rd one (still spans the full light→dark range) and hide the rest
// behind "Ещё тона", same disclosure pattern as StyleChips below.
const SKIN_TONES_PINNED_STEP = 3;

// Two-step delete control: first tap reveals an inline confirm row.
export function DeleteButton({
  label,
  confirmLabel,
  onConfirm,
  compact = false,
}: {
  label: string;
  confirmLabel: string;
  onConfirm: () => void;
  compact?: boolean;
}) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <div
        onClick={() => setConfirming(true)}
        style={{
          border: '1px solid rgba(138,48,64,0.3)',
          borderRadius: 2,
          padding: compact ? '6px 10px' : '11px 14px',
          textAlign: 'center',
          cursor: 'pointer',
          color: '#A85A66',
          fontSize: compact ? 10 : 11,
          letterSpacing: '1px',
          textTransform: 'uppercase',
          fontStyle: 'italic',
        }}
      >
        {label}
      </div>
    );
  }

  return (
    <div
      style={{
        border: '1px solid rgba(138,48,64,0.45)',
        borderRadius: 2,
        padding: compact ? '6px 8px' : '11px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: 'rgba(138,48,64,0.06)',
      }}
    >
      <span style={{ flex: 1, fontSize: compact ? 10 : 12, color: '#A85A66', fontStyle: 'italic', letterSpacing: '0.3px' }}>
        {confirmLabel}
      </span>
      <span
        onClick={onConfirm}
        style={{
          fontSize: compact ? 10 : 11,
          color: '#C56676',
          letterSpacing: '1px',
          textTransform: 'uppercase',
          cursor: 'pointer',
          padding: '4px 8px',
          border: '1px solid rgba(138,48,64,0.5)',
          borderRadius: 2,
        }}
      >
        Да
      </span>
      <span
        onClick={() => setConfirming(false)}
        style={{
          fontSize: compact ? 10 : 11,
          color: COLORS.textFaint,
          letterSpacing: '1px',
          textTransform: 'uppercase',
          cursor: 'pointer',
          padding: '4px 8px',
        }}
      >
        Нет
      </span>
    </div>
  );
}


// ── Reusable pickers (skin tone / marker colour / styles) ──
export function SkinTonePalette({ value, onPick }: { value: string; onPick: (hex: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const selected = value ? value.toLowerCase() : '';
  const hasSel = !!selected;
  // Once a tone is picked the rest collapse away and the chosen swatch grows for
  // readability; picking again (or «изменить») expands the full palette back.
  const pinned = SKIN_TONES.filter((_, i) => i % SKIN_TONES_PINNED_STEP === 0);
  const visible = hasSel || expanded ? SKIN_TONES : pinned;
  const hiddenCount = SKIN_TONES.length - visible.length;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center' }}>
      {visible.map((t) => {
        const sel = selected === t.toLowerCase();
        const hidden = hasSel && !sel;
        const size = sel ? 46 : 26;
        return (
          <div
            key={t}
            onClick={() => onPick(t)}
            style={{
              width: hidden ? 0 : size,
              height: hidden ? 0 : size,
              margin: hidden ? 0 : 4,
              borderRadius: '50%',
              background: t,
              cursor: 'pointer',
              opacity: hidden ? 0 : 1,
              overflow: 'hidden',
              flexShrink: 0,
              border: sel ? '2px solid var(--gold)' : '1px solid rgba(var(--gold-rgb),0.2)',
              boxShadow: sel ? '0 0 0 3px rgba(var(--gold-rgb),0.28), 0 4px 12px rgba(0,0,0,0.25)' : undefined,
              transition:
                'width 0.42s cubic-bezier(0.34,1.56,0.64,1), height 0.42s cubic-bezier(0.34,1.56,0.64,1), margin 0.42s ease, opacity 0.3s ease, box-shadow 0.3s',
            }}
          />
        );
      })}
      {!hasSel && hiddenCount > 0 && (
        <span
          onClick={() => setExpanded(true)}
          style={{ margin: 4, fontSize: fs(12), color: COLORS.textGhost, fontStyle: 'italic', cursor: 'pointer', letterSpacing: '0.3px', whiteSpace: 'nowrap' }}
        >
          Ещё тона ({hiddenCount}) ▾
        </span>
      )}
      {hasSel && (
        <span
          onClick={() => onPick(value)}
          style={{ marginLeft: 12, fontSize: fs(13), color: COLORS.gold, fontStyle: 'italic', cursor: 'pointer' }}
        >
          изменить
        </span>
      )}
    </div>
  );
}

export function MarkerColorPalette({ value, onPick }: { value: string; onPick: (hex: string) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
      {MARKER_COLORS.map((c) => {
        const sel = value.toLowerCase() === c.toLowerCase();
        return (
          <div
            key={c}
            onClick={() => onPick(c)}
            style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              background: c,
              cursor: 'pointer',
              border: sel ? '2px solid var(--text)' : '1px solid rgba(var(--gold-rgb),0.25)',
              boxShadow: sel ? `0 0 0 2px ${c}` : undefined,
            }}
          />
        );
      })}
    </div>
  );
}

// Three-way segmented toggle for Client.clientType (Клиент / Модель / Другое).
export function ClientTypeToggle({ value, onChange }: { value: ClientType; onChange: (t: ClientType) => void }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {CLIENT_TYPES.map((t) => (
        <div
          key={t.value}
          onClick={() => onChange(t.value)}
          style={{
            flex: 1,
            textAlign: 'center',
            padding: '10px 0',
            borderRadius: 2,
            cursor: 'pointer',
            fontSize: fs(13),
            letterSpacing: '1px',
            textTransform: 'uppercase',
            border: value === t.value ? '1px solid rgba(var(--gold-rgb),0.6)' : '1px solid rgba(var(--gold-rgb),0.15)',
            background: value === t.value ? 'rgba(var(--gold-rgb),0.08)' : 'transparent',
            color: value === t.value ? COLORS.gold : COLORS.textFaint,
          }}
        >
          {t.label}
        </div>
      ))}
    </div>
  );
}

// Multi-select style picker. The full palette (20 styles) is too many chips to
// show at once — a master typically works in only 3-4 main directions — so
// only the first STYLES_PINNED_COUNT are shown by default, plus any already
// selected style outside that set (so a saved choice never looks "lost").
// "Ещё стили" reveals the rest.
export function StyleChips({ selected, onToggle }: { selected: string[]; onToggle: (s: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const pinned = STYLES.slice(0, STYLES_PINNED_COUNT);
  const rest = STYLES.slice(STYLES_PINNED_COUNT);
  const extraSelected = rest.filter((s) => selected.includes(s));
  const visible = expanded ? STYLES : [...pinned, ...extraSelected];
  const hiddenCount = STYLES.length - visible.length;

  const chip = (s: string) => {
    const on = selected.includes(s);
    return (
      <div
        key={s}
        onClick={() => onToggle(s)}
        style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: fs(12),
          padding: '6px 11px',
          borderRadius: 2,
          cursor: 'pointer',
          border: on ? '1px solid rgba(var(--gold-rgb),0.65)' : '1px solid rgba(var(--gold-rgb),0.15)',
          color: on ? COLORS.gold : COLORS.textFaint,
          background: on ? 'rgba(var(--gold-rgb),0.08)' : 'transparent',
          letterSpacing: '0.8px',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
          transition: 'all 0.2s',
          fontWeight: 500,
        }}
      >
        {s}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      {visible.map(chip)}
      {hiddenCount > 0 && (
        <div
          onClick={() => setExpanded(true)}
          style={{
            fontSize: fs(12),
            padding: '6px 11px',
            color: COLORS.textGhost,
            fontStyle: 'italic',
            cursor: 'pointer',
            letterSpacing: '0.3px',
            whiteSpace: 'nowrap',
          }}
        >
          Ещё стили ({hiddenCount}) ▾
        </div>
      )}
      {expanded && (
        <div
          onClick={() => setExpanded(false)}
          style={{
            fontSize: fs(12),
            padding: '6px 11px',
            color: COLORS.textGhost,
            fontStyle: 'italic',
            cursor: 'pointer',
            letterSpacing: '0.3px',
            whiteSpace: 'nowrap',
          }}
        >
          Свернуть ▴
        </div>
      )}
    </div>
  );
}

// Photo gallery + upload for a session. On mobile the native file picker
// already offers "Take Photo", so there's no separate camera button. Deleting
// a photo takes two taps (✕ → confirm) so it can't happen by accident.
export function SessionPhotos({
  photos,
  onChange,
  allowDelete = true,
  buttonFirst = false,
  topSlot,
  readOnly = false,
}: {
  photos: string[];
  onChange: (photos: string[]) => void;
  allowDelete?: boolean;
  // Puts the "Добавить фото" trigger above the thumbnails instead of below,
  // with topSlot (e.g. a widget attached right under the button) rendered
  // in between — used by the consultation form, where the read-only skin
  // data sits attached under the button and the uploaded photos fill the
  // remaining space below.
  buttonFirst?: boolean;
  topSlot?: React.ReactNode;
  // Read-only: just the thumbnails (tap-to-enlarge still works), no "Добавить
  // фото" button — used in timeline/preview cards.
  readOnly?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmIndex, setConfirmIndex] = useState<number | null>(null);
  // Tap to enlarge — an in-app overlay, never a navigation/link (that's what
  // caused the white-screen PWA crash before).
  const [viewerSrc, setViewerSrc] = useState<string | null>(null);

  const onPick = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const readers = Array.from(files).map(
      (file) =>
        new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        })
          // Несжатое фото с камеры телефона — это несколько мегабайт; без
          // сжатия оно ложится в IndexedDB как есть (см. downsizeForStorage).
          // Если сжатие почему-то не удалось — не теряем фото, кладём оригинал.
          .then((dataUrl) => downsizeForStorage(dataUrl).catch(() => dataUrl)),
    );
    Promise.all(readers).then((urls) => onChange([...photos, ...urls]));
  };

  const remove = (i: number) => {
    onChange(photos.filter((_, idx) => idx !== i));
    setConfirmIndex(null);
  };

  const thumbnails = photos.length > 0 && (
        // A grid (not a wrapping flex row of fixed-size tiles) so thumbnails
        // stretch to fill whatever width is left on the last row — with just
        // one or two photos, fixed 78px tiles left most of the card's own
        // width sitting empty next to them.
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: 8, marginBottom: 10 }}>
          {photos.map((src, i) => (
            <div key={i} style={{ position: 'relative', width: '100%', aspectRatio: '1' }}>
              <img
                src={src}
                alt=""
                onClick={() => setViewerSrc(src)}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  borderRadius: 2,
                  border: '1px solid rgba(var(--gold-rgb),0.2)',
                  display: 'block',
                  cursor: 'pointer',
                }}
              />
              {allowDelete && (confirmIndex === i ? (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: 2,
                    background: 'rgba(0,0,0,0.72)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                >
                  <span style={{ fontSize: fs(11), color: '#A85A66', fontStyle: 'italic' }}>Удалить?</span>
                  <span style={{ display: 'flex', gap: 10 }}>
                    <span onClick={() => remove(i)} style={{ fontSize: fs(12), color: '#C56676', textTransform: 'uppercase', cursor: 'pointer' }}>
                      Да
                    </span>
                    <span onClick={() => setConfirmIndex(null)} style={{ fontSize: fs(12), color: COLORS.textFaint, textTransform: 'uppercase', cursor: 'pointer' }}>
                      Нет
                    </span>
                  </span>
                </div>
              ) : (
                <div
                  onClick={() => setConfirmIndex(i)}
                  style={{
                    position: 'absolute',
                    bottom: 4,
                    right: 4,
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    background: 'rgba(0,0,0,0.55)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="none" style={{ color: '#EDE4CC' }}>
                    <line x1="3" y1="3" x2="13" y2="13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    <line x1="13" y1="3" x2="3" y2="13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </div>
              ))}
            </div>
          ))}
        </div>
      );

  const addButton = (
      <div
        className="inka-doc-secondary"
        onClick={() => fileRef.current?.click()}
        style={{
          border: '1px solid rgba(var(--gold-rgb),0.2)',
          borderRadius: 2,
          padding: '11px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 9,
          cursor: 'pointer',
          fontSize: fs(12),
          color: COLORS.gold,
          letterSpacing: '1px',
          textTransform: 'uppercase',
        }}
      >
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
          <path d="M8 10.5V2.5M8 2.5L5 5.5M8 2.5L11 5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M2.5 10V12.5C2.5 13 2.9 13.5 3.5 13.5H12.5C13 13.5 13.5 13 13.5 12.5V10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
        Добавить фото
      </div>
  );

  return (
    <div style={{ marginTop: 10 }}>
      {readOnly ? (
        thumbnails
      ) : buttonFirst ? (
        <>
          <div style={{ marginBottom: thumbnails ? 10 : 0 }}>{addButton}</div>
          {topSlot}
          {thumbnails}
        </>
      ) : (
        <>
          {thumbnails}
          {addButton}
        </>
      )}
      {!readOnly && (
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => {
            onPick(e.target.files);
            e.target.value = '';
          }}
        />
      )}

      {/* Tap-to-enlarge viewer — plain in-app overlay, no <a>/navigation. */}
      {viewerSrc && (
        <div
          onClick={() => setViewerSrc(null)}
          role="button"
          aria-label="Закрыть фото"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 500,
            background: 'rgba(0,0,0,0.92)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            onClick={() => setViewerSrc(null)}
            role="button"
            aria-label="Закрыть"
            style={{
              position: 'absolute',
              top: 'calc(env(safe-area-inset-top) + 16px)',
              right: 20,
              fontSize: fs(22),
              color: '#EDE4CC',
              cursor: 'pointer',
            }}
          >
            ✕
          </div>
          <img
            src={viewerSrc}
            alt=""
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 3 }}
          />
        </div>
      )}
    </div>
  );
}

// ── Urgency picker (single-select chips, emoji + label) ──
export function UrgencyChips({ value, onPick }: { value: UrgencyKey; onPick: (u: UrgencyKey) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {URGENCY.map((u) => {
        const on = value === u.key;
        return (
          <div
            key={u.key}
            onClick={() => onPick(u.key)}
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: fs(12),
              padding: '5px 9px',
              borderRadius: 2,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              border: on ? '1px solid rgba(var(--gold-rgb),0.65)' : '1px solid rgba(var(--gold-rgb),0.15)',
              color: on ? COLORS.gold : COLORS.textFaint,
              background: on ? 'rgba(var(--gold-rgb),0.08)' : 'transparent',
              letterSpacing: '0.4px',
              whiteSpace: 'nowrap',
              transition: 'all 0.2s',
            }}
          >
            <span style={{ fontSize: fs(12) }}>{u.emoji}</span>
            {u.label}
          </div>
        );
      })}
    </div>
  );
}

// Единственный next step проекта (nextActionText/Date/Type) — быстро
// видимый и редактируемый прямо здесь, без перехода в полную форму
// редактирования проекта. Используется на всех трёх рабочих уровнях
// (ProjectViewSheet, TimelineViewSheet для сессии/консультации) — Save
// всегда пишет напрямую в тот же объект Project через onSave, значения не
// копируются на сессию/консультацию (см. «Следующий шаг» — зафиксированная
// модель: next step существует ровно один на весь проект).
export function NextStepRow({
  nextActionText,
  nextActionDate,
  nextActionType,
  onSave,
}: {
  nextActionText: string;
  nextActionDate: string | null;
  nextActionType: NextActionType | null;
  onSave: (text: string, date: string | null, type: NextActionType | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(nextActionText);
  const [date, setDate] = useState(nextActionDate ?? '');
  const [type, setType] = useState<NextActionType | null>(nextActionType);

  const startEdit = () => {
    setText(nextActionText);
    setDate(nextActionDate ?? '');
    setType(nextActionType);
    setEditing(true);
  };
  const save = () => {
    const resolved = resolveNextStep(text, date || null, type);
    onSave(resolved.nextActionText, resolved.nextActionDate, resolved.nextActionType);
    setEditing(false);
  };
  // «Удалить следующий шаг» — явное действие, полностью очищает все три
  // поля разом (то же самое, что и очистка текста через save(), но без
  // необходимости сначала стирать поле руками).
  const clear = () => {
    onSave('', null, null);
    setEditing(false);
  };

  const labelStyle: React.CSSProperties = { fontSize: fs(10), color: COLORS.textGhost, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 5 };

  if (!editing) {
    return (
      <div onClick={startEdit} style={{ cursor: 'pointer' }}>
        <div style={labelStyle}>Следующий шаг</div>
        {nextActionText ? (
          <div dir="auto" style={{ fontSize: fs(15), color: COLORS.textPrimary, lineHeight: 1.5 }}>
            {nextActionText}
            {nextActionDate ? ` · ${formatDate(nextActionDate)}` : ''}
          </div>
        ) : (
          <div style={{ fontSize: fs(14), color: COLORS.textFaint, fontStyle: 'italic' }}>Не задан — нажмите, чтобы добавить</div>
        )}
      </div>
    );
  }

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <div style={labelStyle}>Следующий шаг</div>
      <input
        dir="auto"
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Например: Отправить мудборд"
        style={{ ...INPUT_STYLE, marginBottom: 8 }}
      />
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <select value={type ?? ''} onChange={(e) => setType((e.target.value || null) as NextActionType | null)} style={{ ...INPUT_STYLE, flex: 1 }}>
          <option value="">Тип действия — не выбран</option>
          {NEXT_ACTION_TYPES.map((t) => (
            <option key={t.key} value={t.key}>{t.label}</option>
          ))}
        </select>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...INPUT_STYLE, flex: 1 }} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <div
          onClick={save}
          role="button"
          style={{
            flex: 1,
            textAlign: 'center',
            padding: '8px 0',
            border: '1px solid rgba(var(--gold-rgb),0.35)',
            borderRadius: 2,
            cursor: 'pointer',
            color: COLORS.gold,
            fontSize: fs(12),
            letterSpacing: '1px',
            textTransform: 'uppercase',
          }}
        >
          Сохранить
        </div>
        <div
          onClick={() => setEditing(false)}
          role="button"
          style={{
            flex: 1,
            textAlign: 'center',
            padding: '8px 0',
            border: '1px solid rgba(var(--gold-rgb),0.15)',
            borderRadius: 2,
            cursor: 'pointer',
            color: COLORS.textFaint,
            fontSize: fs(12),
            letterSpacing: '1px',
            textTransform: 'uppercase',
          }}
        >
          Отмена
        </div>
      </div>
      {nextActionText && (
        <div
          onClick={clear}
          role="button"
          style={{
            marginTop: 8,
            textAlign: 'center',
            fontSize: fs(11),
            letterSpacing: '0.6px',
            textTransform: 'uppercase',
            color: COLORS.textFaint,
            cursor: 'pointer',
          }}
        >
          Удалить следующий шаг
        </div>
      )}
    </div>
  );
}

// ── Project category picker (single-select chips, no emoji) ──
export function ProjectCategoryChips({ value, onPick }: { value: ProjectCategory; onPick: (c: ProjectCategory) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {PROJECT_CATEGORIES.map((c) => {
        const on = value === c.key;
        return (
          <div
            key={c.key}
            onClick={() => onPick(c.key)}
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: fs(12),
              padding: '5px 9px',
              borderRadius: 2,
              cursor: 'pointer',
              border: on ? '1px solid rgba(var(--gold-rgb),0.65)' : '1px solid rgba(var(--gold-rgb),0.15)',
              color: on ? COLORS.gold : COLORS.textFaint,
              background: on ? 'rgba(var(--gold-rgb),0.08)' : 'transparent',
              letterSpacing: '0.4px',
              whiteSpace: 'nowrap',
              transition: 'all 0.2s',
            }}
          >
            {c.label}
          </div>
        );
      })}
    </div>
  );
}

// Вынесено из screens/DetailScreen.tsx: используются и им самим, и
// дашбордами в TattoDiary.tsx (карточка мастера/клиента), а DetailScreen
// лениво подгружается (React.lazy) — если бы эти формы остались там,
// статический импорт из TattoDiary.tsx утянул бы весь DetailScreen обратно
// в основной бандл. Логика и разметка не менялись — чистый перенос.
export function AddChatLinkForm({ onAdd }: { onAdd: (platform: ChatPlatform, raw: string) => void }) {
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<ChatPlatform>('whatsapp');
  const [raw, setRaw] = useState('');

  if (!open) {
    return (
      <div
        className="inka-dashed"
        onClick={() => setOpen(true)}
        style={{
          marginTop: 4,
          border: '1px dashed rgba(var(--gold-rgb),0.18)',
          borderRadius: 2,
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          cursor: 'pointer',
        }}
      >
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
          <line x1="5.5" y1="1.5" x2="5.5" y2="9.5" stroke="currentColor" strokeOpacity="0.48" strokeWidth="1.2" strokeLinecap="round" />
          <line x1="1.5" y1="5.5" x2="9.5" y2="5.5" stroke="currentColor" strokeOpacity="0.48" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
        <span style={{ fontSize: fs(13), color: 'rgba(var(--gold-rgb),0.5)', letterSpacing: '1px', textTransform: 'uppercase', fontStyle: 'italic' }}>
          Добавить ссылку
        </span>
      </div>
    );
  }

  const selectStyle: React.CSSProperties = {
    width: '100%',
    background: COLORS.bg,
    border: '1px solid rgba(var(--gold-rgb),0.18)',
    borderRadius: 2,
    padding: '9px 12px',
    fontFamily: "'Inter', sans-serif",
    color: COLORS.textPrimary,
    outline: 'none',
    marginBottom: 8,
  };

  return (
    <div
      style={{
        marginTop: 4,
        border: '1px solid rgba(var(--gold-rgb),0.18)',
        borderRadius: 2,
        padding: 13,
        background: 'rgba(var(--surface-rgb),0.018)',
      }}
    >
      <select value={platform} onChange={(e) => setPlatform(e.target.value as ChatPlatform)} style={selectStyle}>
        {(Object.keys(PLATFORM_LABELS) as ChatPlatform[]).map((p) => (
          <option key={p} value={p} style={{ background: COLORS.bg }}>
            {PLATFORM_LABELS[p]}
          </option>
        ))}
      </select>
      <input
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        placeholder="Телефон, @ник или ссылка"
        style={{ ...INPUT_STYLE, marginBottom: 8 }}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <div
          onClick={() => {
            setOpen(false);
            setRaw('');
          }}
          style={{
            flex: 1,
            minWidth: 0,
            textAlign: 'center',
            padding: '9px 4px',
            borderRadius: 2,
            border: '1px solid rgba(var(--gold-rgb),0.15)',
            color: COLORS.textFaint,
            fontSize: fs(13),
            letterSpacing: '1px',
            textTransform: 'uppercase',
            cursor: 'pointer',
            wordBreak: 'break-word',
          }}
        >
          Отмена
        </div>
        <div
          className="inka-submit"
          onClick={() => {
            if (!raw.trim()) return;
            onAdd(platform, raw);
            setRaw('');
            setOpen(false);
          }}
          style={{
            flex: 1,
            minWidth: 0,
            textAlign: 'center',
            padding: '9px 4px',
            borderRadius: 2,
            border: '1px solid rgba(var(--gold-rgb),0.35)',
            background: 'rgba(var(--gold-rgb),0.05)',
            color: COLORS.gold,
            fontSize: fs(13),
            letterSpacing: '1px',
            textTransform: 'uppercase',
            cursor: 'pointer',
            wordBreak: 'break-word',
          }}
        >
          Добавить
        </div>
      </div>
    </div>
  );
}

// Free-form add-a-row form for the master's own card (Настройки → Карточка
// мастера): unlike the client's ChatLink form, there's no fixed platform
// enum here — a label ("Instagram", "СБП Тинькофф"...) plus a free value.
export function AddMasterLinkForm({ onAdd }: { onAdd: (label: string, value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');

  if (!open) {
    return (
      <div
        className="inka-dashed"
        onClick={() => setOpen(true)}
        style={{
          marginTop: 4,
          border: '1px dashed rgba(var(--gold-rgb),0.18)',
          borderRadius: 2,
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          cursor: 'pointer',
        }}
      >
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
          <line x1="5.5" y1="1.5" x2="5.5" y2="9.5" stroke="currentColor" strokeOpacity="0.48" strokeWidth="1.2" strokeLinecap="round" />
          <line x1="1.5" y1="5.5" x2="9.5" y2="5.5" stroke="currentColor" strokeOpacity="0.48" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
        <span style={{ fontSize: fs(13), color: 'rgba(var(--gold-rgb),0.5)', letterSpacing: '1px', textTransform: 'uppercase', fontStyle: 'italic' }}>
          Добавить
        </span>
      </div>
    );
  }

  return (
    <div
      style={{
        marginTop: 4,
        border: '1px solid rgba(var(--gold-rgb),0.18)',
        borderRadius: 2,
        padding: 13,
        background: 'rgba(var(--surface-rgb),0.018)',
      }}
    >
      <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Название (Instagram, СБП...)" style={{ ...INPUT_STYLE, marginBottom: 8 }} />
      <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Ссылка, номер, реквизиты..." style={{ ...INPUT_STYLE, marginBottom: 8 }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <div
          onClick={() => {
            setOpen(false);
            setLabel('');
            setValue('');
          }}
          style={{
            flex: 1,
            textAlign: 'center',
            padding: '9px',
            borderRadius: 2,
            border: '1px solid rgba(var(--gold-rgb),0.15)',
            color: COLORS.textFaint,
            fontSize: fs(13),
            letterSpacing: '1px',
            textTransform: 'uppercase',
            cursor: 'pointer',
          }}
        >
          Отмена
        </div>
        <div
          className="inka-submit"
          onClick={() => {
            if (!label.trim() || !value.trim()) return;
            onAdd(label, value);
            setLabel('');
            setValue('');
            setOpen(false);
          }}
          style={{
            flex: 1,
            textAlign: 'center',
            padding: '9px',
            borderRadius: 2,
            border: '1px solid rgba(var(--gold-rgb),0.35)',
            background: 'rgba(var(--gold-rgb),0.05)',
            color: COLORS.gold,
            fontSize: fs(13),
            letterSpacing: '1px',
            textTransform: 'uppercase',
            cursor: 'pointer',
          }}
        >
          Добавить
        </div>
      </div>
    </div>
  );
}
