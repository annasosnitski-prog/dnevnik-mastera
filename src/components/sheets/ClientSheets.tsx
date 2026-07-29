import { useState, useEffect, useRef, useMemo } from 'react';
import { InkaLogo } from '../InkaLogo';
import { type ClientType, type Client, clientStyles } from '../../domain/client';
import {
  COLORS,
  fs,
  MARKER_COLORS,
  SKIN_TYPES,
  INPUT_STYLE,
  SUBMIT_STYLE,
  DeleteButton,
  SkinTonePalette,
  MarkerColorPalette,
  ClientTypeToggle,
  StyleChips,
} from '../TattoDiary';
import { BottomSheet, SheetCloseButton } from '../ui/Sheet';
import { FieldLabel, SheetStarDivider } from '../ui/TextAtoms';

// Вынесено из TattoDiary.tsx (PR 5 рефакторинга). Логика и разметка не
// менялись — только перенос в отдельный модуль.

export function NewClientSheet({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (data: {
    name: string;
    surname: string;
    phone: string;
    styles: string[];
    color: string;
    clientType: ClientType;
    skinType: string;
    skinTone: string;
    skinNotes: string;
    note: string;
  }) => void;
}) {
  const [name, setName] = useState('');
  const [surname, setSurname] = useState('');
  const [phone, setPhone] = useState('');
  const [styles, setStyles] = useState<string[]>([]);
  const [color, setColor] = useState(MARKER_COLORS[0]);
  const [clientType, setClientType] = useState<ClientType>('client');
  const [skinType, setSkinType] = useState('');
  const [skinTone, setSkinTone] = useState('');
  const [skinNotes, setSkinNotes] = useState('');
  const [note, setNote] = useState('');

  // Reset fields whenever the sheet is closed.
  useEffect(() => {
    if (!open) {
      setName('');
      setSurname('');
      setPhone('');
      setStyles([]);
      setColor(MARKER_COLORS[0]);
      setClientType('client');
      setSkinType('');
      setSkinTone('');
      setSkinNotes('');
      setNote('');
    }
  }, [open]);

  const toggleStyle = (s: string) => setStyles((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  const canSubmit = name.trim().length > 0;

  return (
    <BottomSheet open={open} heightPct={88}>
      <div style={{ padding: '16px 24px 14px', position: 'relative' }}>
        <SheetCloseButton onClose={onClose} />
        <div style={{ marginBottom: 5 }}>
          <InkaLogo height={fs(15)} />
        </div>
        <div style={{ fontSize: fs(22), color: COLORS.textPrimary, fontWeight: 300, letterSpacing: '1px' }}>Новый клиент</div>
        <SheetStarDivider />
      </div>

      <div style={{ padding: '4px 24px 50px' }}>
        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Имя *</FieldLabel>
          {/* dir="auto": Hebrew/Arabic names flow right-to-left automatically,
              Latin/Cyrillic stay left-to-right. */}
          <input dir="auto" value={name} onChange={(e) => setName(e.target.value)} placeholder="Александра" style={INPUT_STYLE} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Фамилия</FieldLabel>
          <input dir="auto" value={surname} onChange={(e) => setSurname(e.target.value)} placeholder="Вертинская" style={INPUT_STYLE} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Телефон</FieldLabel>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+7 999 123-45-67"
            style={INPUT_STYLE}
          />
        </div>
        <div style={{ marginBottom: 18 }}>
          <FieldLabel>Цвет-маркер</FieldLabel>
          <MarkerColorPalette value={color} onPick={setColor} />
        </div>
        <div style={{ marginBottom: 18 }}>
          <FieldLabel>Тип</FieldLabel>
          <ClientTypeToggle value={clientType} onChange={setClientType} />
        </div>
        <div style={{ marginBottom: 18 }}>
          <FieldLabel>Стиль</FieldLabel>
          <StyleChips selected={styles} onToggle={toggleStyle} />
        </div>
        <div style={{ marginBottom: 18 }}>
          <FieldLabel>Тон кожи</FieldLabel>
          <SkinTonePalette value={skinTone} onPick={(t) => setSkinTone(t === skinTone ? '' : t)} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Тип кожи</FieldLabel>
          <select value={skinType} onChange={(e) => setSkinType(e.target.value)} style={{ ...INPUT_STYLE, appearance: 'none' }}>
            {SKIN_TYPES.map((s) => (
              <option key={s.value} value={s.value} style={{ background: COLORS.bg }}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Заметки о коже</FieldLabel>
          <textarea
            dir="auto"
            value={skinNotes}
            onChange={(e) => setSkinNotes(e.target.value)}
            placeholder="Аллергии, чувствительные зоны, реакции..."
            style={{ ...INPUT_STYLE, resize: 'none', height: 70 }}
          />
        </div>
        <div style={{ marginBottom: 22 }}>
          <FieldLabel>Заметки о клиенте</FieldLabel>
          <textarea
            dir="auto"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Идеи, пожелания, особенности..."
            style={{ ...INPUT_STYLE, resize: 'none', height: 100 }}
          />
        </div>
        <div
          className="inka-submit"
          onClick={() => canSubmit && onCreate({ name, surname, phone, styles, color, clientType, skinType, skinTone, skinNotes, note })}
          style={{ ...SUBMIT_STYLE, opacity: canSubmit ? 1 : 0.4, cursor: canSubmit ? 'pointer' : 'default' }}
        >
          <span style={{ fontFamily: "'Kelly Slab', 'Playfair Display', serif", fontSize: fs(13), color: COLORS.gold, letterSpacing: '2px' }}>
            Создать клиента
          </span>
        </div>
      </div>
    </BottomSheet>
  );
}

export function EditClientSheet({
  open,
  client,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  client: Client | null;
  onClose: () => void;
  onSave: (data: { name: string; surname: string; styles: string[]; color: string; clientType: ClientType; note: string }) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState('');
  const [surname, setSurname] = useState('');
  const [styles, setStyles] = useState<string[]>([]);
  const [color, setColor] = useState(MARKER_COLORS[0]);
  const [clientType, setClientType] = useState<ClientType>('client');
  const [note, setNote] = useState('');

  // Populate fields from the client each time the sheet opens.
  useEffect(() => {
    if (open && client) {
      setName(client.name);
      setSurname(client.surname);
      setStyles(clientStyles(client));
      setColor(client.color || MARKER_COLORS[0]);
      setClientType(client.clientType || 'client');
      setNote(client.note);
    }
  }, [open, client?.id]);

  const canSubmit = name.trim().length > 0;
  const toggleStyle = (s: string) => setStyles((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  return (
    <BottomSheet open={open} heightPct={84}>
      <div style={{ padding: '16px 24px 14px', position: 'relative' }}>
        <SheetCloseButton onClose={onClose} />
        <div style={{ marginBottom: 5 }}>
          <InkaLogo height={fs(15)} />
        </div>
        <div style={{ fontSize: fs(22), color: COLORS.textPrimary, fontWeight: 300, letterSpacing: '1px' }}>Редактировать</div>
        <SheetStarDivider />
      </div>

      <div style={{ padding: '4px 24px 50px' }}>
        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Имя *</FieldLabel>
          <input dir="auto" value={name} onChange={(e) => setName(e.target.value)} placeholder="Александра" style={INPUT_STYLE} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Фамилия</FieldLabel>
          <input dir="auto" value={surname} onChange={(e) => setSurname(e.target.value)} placeholder="Вертинская" style={INPUT_STYLE} />
        </div>
        <div style={{ marginBottom: 18 }}>
          <FieldLabel>Цвет-маркер</FieldLabel>
          <MarkerColorPalette value={color} onPick={setColor} />
        </div>
        <div style={{ marginBottom: 18 }}>
          <FieldLabel>Тип</FieldLabel>
          <ClientTypeToggle value={clientType} onChange={setClientType} />
        </div>
        <div style={{ marginBottom: 18 }}>
          <FieldLabel>Стиль</FieldLabel>
          <StyleChips selected={styles} onToggle={toggleStyle} />
        </div>
        <div style={{ marginBottom: 22 }}>
          <FieldLabel>Заметки о клиенте</FieldLabel>
          <textarea
            dir="auto"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Идеи, пожелания, особенности..."
            style={{ ...INPUT_STYLE, resize: 'none', height: 100 }}
          />
        </div>
        <div
          className="inka-submit"
          onClick={() => canSubmit && onSave({ name, surname, styles, color, clientType, note })}
          style={{ ...SUBMIT_STYLE, opacity: canSubmit ? 1 : 0.4, cursor: canSubmit ? 'pointer' : 'default' }}
        >
          <span style={{ fontFamily: "'Kelly Slab', 'Playfair Display', serif", fontSize: fs(13), color: COLORS.gold, letterSpacing: '2px' }}>
            Сохранить
          </span>
        </div>

        {/* Danger zone: delete client — always last */}
        <div style={{ marginTop: 32 }}>
          <div style={{ fontSize: fs(10), color: '#A85A66', letterSpacing: '2px', textTransform: 'uppercase', textAlign: 'center', marginBottom: 8, opacity: 0.7 }}>
            Danger
          </div>
          <DeleteButton label="Удалить клиента" confirmLabel="Удалить клиента безвозвратно?" onConfirm={onDelete} />
        </div>
      </div>
    </BottomSheet>
  );
}

export function ClientKindChoiceSheet({
  open,
  onClose,
  onPickExisting,
  onPickNew,
}: {
  open: boolean;
  onClose: () => void;
  onPickExisting: () => void;
  onPickNew: () => void;
}) {
  const choice = (title: string, desc: string, onClick: () => void, icon: React.ReactNode) => (
    <div
      onClick={onClick}
      role="button"
      aria-label={title}
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
        {icon}
      </div>
      <div>
        <div style={{ fontSize: fs(16), color: COLORS.textPrimary }}>{title}</div>
        <div style={{ fontSize: fs(12), color: COLORS.textGhost, fontStyle: 'italic', marginTop: 2 }}>{desc}</div>
      </div>
    </div>
  );

  return (
    <BottomSheet open={open} heightPct={34}>
      <div style={{ padding: '16px 24px 14px', position: 'relative' }}>
        <SheetCloseButton onClose={onClose} />
        <div style={{ fontSize: fs(22), color: COLORS.textPrimary, fontWeight: 300, letterSpacing: '1px' }}>Кто клиент?</div>
        <SheetStarDivider />
      </div>
      <div style={{ padding: '4px 24px 40px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {choice(
          'Существующий клиент',
          'Выбрать из уже сохранённых',
          onPickExisting,
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="6.6" r="3.3" stroke="currentColor" strokeWidth="1.3" />
            <path d="M4 17C4 13.4 6.6 11.7 10 11.7C13.4 11.7 16 13.4 16 17" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>,
        )}
        {choice(
          'Новый клиент',
          'Имя, цвет и телефон — остальное потом',
          onPickNew,
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
            <circle cx="8" cy="6.6" r="3" stroke="currentColor" strokeWidth="1.2" />
            <path d="M3 17C3 13.6 5.3 12 8 12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            <line x1="14.5" y1="9" x2="14.5" y2="15" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            <line x1="11.5" y1="12" x2="17.5" y2="12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>,
        )}
      </div>
    </BottomSheet>
  );
}

// ===================== CALENDAR CREATION WALK: EXISTING-CLIENT PICKER =====================
// A quick search + tap-to-pick list — compact rows, not the big grid cards
// used on the main list screen, since this is a fast lookup mid-flow.
export function ClientPickerSheet({
  open,
  onClose,
  clients,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  clients: Client[];
  onPick: (clientId: string) => void;
}) {
  const [query, setQuery] = useState('');
  // BottomSheet content stays mounted even while closed (only translated
  // off-screen), so a plain `autoFocus` attribute would fire once on the
  // sheet's very first mount — regardless of `open` — and drag the whole
  // (still-hidden) sheet into view via the browser's focus-scroll behaviour.
  // Focusing explicitly on the open transition avoids that.
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      searchRef.current?.focus();
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...clients].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    if (!q) return sorted;
    return sorted.filter((c) => [c.name, c.surname].filter(Boolean).join(' ').toLowerCase().includes(q));
  }, [clients, query]);

  return (
    <BottomSheet open={open} heightPct={80}>
      <div style={{ padding: '16px 24px 14px', position: 'relative' }}>
        <SheetCloseButton onClose={onClose} />
        <div style={{ fontSize: fs(22), color: COLORS.textPrimary, fontWeight: 300, letterSpacing: '1px' }}>Выберите клиента</div>
        <SheetStarDivider />
      </div>
      <div style={{ padding: '4px 24px 12px' }}>
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Найти клиента..."
          style={INPUT_STYLE}
        />
      </div>
      <div style={{ padding: '4px 24px 40px', display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{ fontStyle: 'italic', color: COLORS.textGhost, fontSize: fs(14), textAlign: 'center', marginTop: 16 }}>
            {clients.length === 0 ? 'Клиентов пока нет' : 'Никого не нашлось'}
          </div>
        ) : (
          filtered.map((c) => (
            <div
              key={c.id}
              onClick={() => onPick(c.id)}
              className="inka-dashed"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '11px 13px',
                borderRadius: 3,
                cursor: 'pointer',
                border: '1px solid rgba(var(--gold-rgb),0.15)',
              }}
            >
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
              <div dir="auto" style={{ fontSize: fs(15), color: COLORS.textPrimary }}>
                {[c.name, c.surname].filter(Boolean).join(' ') || '—'}
              </div>
            </div>
          ))
        )}
      </div>
    </BottomSheet>
  );
}

// ===================== CALENDAR CREATION WALK: QUICK NEW CLIENT =====================
// Minimal client creation for the calendar flow — just enough to attach a
// session/consultation to somebody real; the rest of the profile (styles,
// skin, notes...) gets filled in later from the client's own card.
export function QuickClientSheet({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (data: { name: string; color: string; phone: string }) => void;
}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(MARKER_COLORS[0]);
  const [phone, setPhone] = useState('');
  // See ClientPickerSheet — BottomSheet content stays mounted while closed,
  // so focusing is driven by the `open` transition, not a raw `autoFocus`
  // attribute (which would fire once on first mount regardless of visibility
  // and drag the still-hidden sheet into view).
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName('');
      setColor(MARKER_COLORS[0]);
      setPhone('');
      nameRef.current?.focus();
    }
  }, [open]);

  const canSubmit = name.trim().length > 0;

  return (
    <BottomSheet open={open} heightPct={62}>
      <div style={{ padding: '16px 24px 14px', position: 'relative' }}>
        <SheetCloseButton onClose={onClose} />
        <div style={{ fontSize: fs(22), color: COLORS.textPrimary, fontWeight: 300, letterSpacing: '1px' }}>Новый клиент</div>
        <SheetStarDivider />
      </div>
      <div style={{ padding: '4px 24px 40px' }}>
        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Имя</FieldLabel>
          <input ref={nameRef} dir="auto" value={name} onChange={(e) => setName(e.target.value)} placeholder="Александра" style={INPUT_STYLE} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Телефон</FieldLabel>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+7 900 000-00-00" style={INPUT_STYLE} />
        </div>
        <div style={{ marginBottom: 22 }}>
          <FieldLabel>Цвет-маркер</FieldLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {MARKER_COLORS.map((c) => (
              <div
                key={c}
                onClick={() => setColor(c)}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  background: c,
                  cursor: 'pointer',
                  border: color === c ? '2px solid var(--text)' : '2px solid transparent',
                  boxShadow: color === c ? '0 0 0 2px rgba(var(--gold-rgb),0.5)' : 'none',
                }}
              />
            ))}
          </div>
        </div>
        <div
          className="inka-submit"
          onClick={() => canSubmit && onCreate({ name, color, phone })}
          style={{ ...SUBMIT_STYLE, opacity: canSubmit ? 1 : 0.4, cursor: canSubmit ? 'pointer' : 'default' }}
        >
          <span style={{ fontFamily: "'Kelly Slab', 'Playfair Display', serif", fontSize: fs(13), color: COLORS.gold, letterSpacing: '2px' }}>
            Создать и продолжить
          </span>
        </div>
      </div>
    </BottomSheet>
  );
}
