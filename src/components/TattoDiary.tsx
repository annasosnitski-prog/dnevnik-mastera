import { useState, useEffect, useRef } from 'react';

// ===================== DESIGN TOKENS =====================
// Values resolve to CSS variables (see index.css), so the same component
// re-skins itself when the document's data-theme switches between dark/light.
const COLORS = {
  bg: 'var(--bg)',
  card: 'var(--bg-card)',
  sheet: 'var(--sheet)',
  gold: 'var(--gold)',
  textPrimary: 'var(--text)',
  textSecondary: 'var(--text-secondary)',
  textMuted: 'var(--text-muted)',
  textFaint: 'var(--text-faint)',
  textGhost: 'var(--text-ghost)',
  textTrace: 'var(--text-trace)',
};

// Per-client accent colours, assigned on creation (rotated through the list).
const ACCENT_COLORS = ['#4A7A5A', '#8A3040', '#6B7A4A', '#3A5A7A', '#7A4A6A', '#7A6A3A', '#3A6A7A'];

const DURATIONS = ['2 ч', '3 ч', '4 ч', '5 ч', '6 ч', '7 ч', '8 ч'];
const STYLES = ['Реализм', 'Графика', 'Орнамент', 'Японский', 'Акварель', 'Другой'];

// ===================== DATA TYPES =====================
interface Session {
  id: string;
  name: string; // session title, e.g. "Первая", "Голубика"
  date: string; // ISO yyyy-mm-dd (or legacy free text)
  duration: string; // e.g. "4 ч"
  style: string; // work style for this session
  area: string; // work zone, e.g. "Левое плечо"
  colors: string; // inks / colours used
  needles: string; // needle configuration
  skinReaction: string; // how the skin reacted
  note: string;
  photos: string[]; // captured/uploaded photos (data URLs)
  done: boolean;
}

interface ClientDocument {
  id: string;
  name: string;
  fileUrl: string;
  kind: 'document' | 'photo';
  uploadedDate: string;
}

type ChatPlatform = 'whatsapp' | 'telegram' | 'instagram' | 'facebook' | 'messenger' | 'tiktok' | 'other';

interface ChatLink {
  id: string;
  platform: ChatPlatform;
  url: string;
}

const PLATFORM_LABELS: Record<ChatPlatform, string> = {
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  instagram: 'Instagram',
  facebook: 'Facebook',
  messenger: 'Messenger',
  tiktok: 'TikTok',
  other: 'Ссылка',
};

// Turns a raw input (phone, @handle or full URL) into an openable chat link.
function buildChatLink(platform: ChatPlatform, raw: string): string {
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const handle = trimmed.replace(/^@/, '');
  switch (platform) {
    case 'whatsapp': {
      const digits = trimmed.replace(/[^\d]/g, '');
      return digits ? `https://wa.me/${digits}` : trimmed;
    }
    case 'telegram':
      return handle ? `https://t.me/${handle}` : trimmed;
    case 'instagram':
      return handle ? `https://ig.me/m/${handle}` : trimmed;
    case 'facebook':
      return handle ? `https://facebook.com/${handle}` : trimmed;
    case 'messenger':
      return handle ? `https://m.me/${handle}` : trimmed;
    case 'tiktok':
      return handle ? `https://tiktok.com/@${handle}` : trimmed;
    default:
      return trimmed;
  }
}

interface Client {
  id: string;
  name: string; // first name, e.g. "Александра"
  surname: string;
  style: string; // current style (mirrors the latest session's style)
  color: string; // accent hex
  note: string; // master's notes
  phone: string; // contact phone number
  skinType: string; // normal / sensitive / dry / oily / combination
  skinNotes: string; // free notes about the client's skin
  chatLinks: ChatLink[]; // WhatsApp / Telegram / Instagram / etc.
  sessions: Session[];
  documents: ClientDocument[];
  createdDate: string;
}

const SKIN_TYPES: { value: string; label: string }[] = [
  { value: '', label: 'Не указан' },
  { value: 'normal', label: 'Нормальная' },
  { value: 'sensitive', label: 'Чувствительная' },
  { value: 'dry', label: 'Сухая' },
  { value: 'oily', label: 'Жирная' },
  { value: 'combination', label: 'Комбинированная' },
  { value: 'porous', label: 'Пористая' },
  { value: 'dense', label: 'Плотная' },
  { value: 'thick', label: 'Толстая' },
  { value: 'thin', label: 'Тонкая' },
];

// ===================== DERIVED HELPERS =====================
const MONTHS_RU = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

// Formats an ISO yyyy-mm-dd as "24 мая 2026"; leaves legacy free-text as-is.
function formatDate(value: string): string {
  if (!value) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return value;
  const [, y, mo, d] = m;
  return `${Number(d)} ${MONTHS_RU[Number(mo) - 1]} ${y}`;
}

// Decorative drop-cap face (Loreley Antiqua — supports both Latin and Cyrillic).
// Playfair/serif fall back if the webfont hasn't loaded.
const DROP_CAP_FONT = "'Loreley Antiqua', 'Playfair Display', serif";

const firstLetter = (name: string) => (name ? name.charAt(0).toUpperCase() : '?');
const nameRest = (name: string) => (name ? name.slice(1) : '');
const lastSession = (c: Client): Session | null => (c.sessions.length ? c.sessions[c.sessions.length - 1] : null);
const lastSessionDate = (c: Client) => {
  const s = lastSession(c);
  return s ? formatDate(s.date) || '—' : '—';
};

// Normalises a raw IndexedDB record (which may predate this schema) into a
// complete Client so the UI never has to guard against missing fields.
function normalizeClient(raw: any, index: number): Client {
  const sessions: Session[] = Array.isArray(raw?.sessions)
    ? raw.sessions.map((s: any, i: number) => ({
        id: String(s?.id ?? `${Date.now()}-${i}`),
        name: s?.name ?? '',
        date: s?.date ?? '',
        duration: s?.duration ?? '',
        style: s?.style ?? '',
        area: s?.area ?? s?.proportions ?? '',
        colors: Array.isArray(s?.colors) ? s.colors.join(', ') : s?.colors ?? '',
        needles: s?.needles ?? '',
        skinReaction: s?.skinReaction ?? '',
        note: s?.note ?? s?.notes ?? '',
        photos: Array.isArray(s?.photos) ? s.photos : s?.photoUrl ? [s.photoUrl] : [],
        done: s?.done ?? true,
      }))
    : [];

  const latestStyle = sessions.length ? sessions[sessions.length - 1].style : '';

  return {
    id: String(raw?.id ?? Date.now() + index),
    name: raw?.name ?? '',
    surname: raw?.surname ?? '',
    style: raw?.style ?? latestStyle ?? '',
    color: raw?.color ?? ACCENT_COLORS[index % ACCENT_COLORS.length],
    note: raw?.note ?? raw?.chatHistory ?? '',
    phone: raw?.phone ?? '',
    skinType: raw?.skinType ?? '',
    skinNotes: raw?.skinNotes ?? '',
    chatLinks: Array.isArray(raw?.chatLinks) ? raw.chatLinks : [],
    sessions,
    documents: Array.isArray(raw?.documents) ? raw.documents : [],
    createdDate: raw?.createdDate ?? new Date().toISOString(),
  };
}

// ===================== DATABASE =====================
const initDB = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open('TattoDiaryDB', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('clients')) {
        db.createObjectStore('clients', { keyPath: 'id' });
      }
    };
  });

// ===================== SHARED SVG =====================
function StarDivider({ marginTop = 11 }: { marginTop?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop }}>
      <div style={{ flex: 1, height: 1, background: 'linear-gradient(to right, rgba(var(--gold-rgb),0.55), transparent)' }} />
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path
          d="M7 1L8.2 5.3H13L9.4 7.7L10.6 12L7 9.6L3.4 12L4.6 7.7L1 5.3H5.8Z"
          stroke="currentColor"
          strokeWidth="0.8"
          fill="currentColor" fillOpacity="0.18"
          strokeLinejoin="round"
        />
      </svg>
      <div style={{ flex: 1, height: 1, background: 'linear-gradient(to left, rgba(var(--gold-rgb),0.55), transparent)' }} />
    </div>
  );
}

function SheetStarDivider() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 11 }}>
      <div style={{ flex: 1, height: 1, background: 'linear-gradient(to right, rgba(var(--gold-rgb),0.5), transparent)' }} />
      <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
        <path d="M4.5 0.5L5.2 3.5H8.5L5.9 5.2L6.6 8.5L4.5 6.8L2.4 8.5L3.1 5.2L0.5 3.5H3.8Z" fill="currentColor" fillOpacity="0.3" />
      </svg>
      <div style={{ flex: 1, height: 1, background: 'linear-gradient(to left, rgba(var(--gold-rgb),0.5), transparent)' }} />
    </div>
  );
}

// Form field label — 8.5px uppercase, wide tracking.
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: '11px',
        color: COLORS.textGhost,
        letterSpacing: '2.5px',
        textTransform: 'uppercase',
        marginBottom: 7,
      }}
    >
      {children}
    </div>
  );
}

const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  background: 'rgba(var(--surface-rgb),0.03)',
  border: '1px solid rgba(var(--gold-rgb),0.18)',
  borderRadius: 2,
  padding: '10px 14px',
  fontFamily: "'Cormorant Garamond', serif",
  color: COLORS.textPrimary,
  outline: 'none',
  letterSpacing: '0.3px',
};

const SUBMIT_STYLE: React.CSSProperties = {
  border: '1px solid rgba(var(--gold-rgb),0.35)',
  borderRadius: 2,
  padding: 14,
  textAlign: 'center',
  cursor: 'pointer',
  background: 'rgba(var(--gold-rgb),0.05)',
};

// ===================== THEME =====================
type Theme = 'dark' | 'light';

function readInitialTheme(): Theme {
  if (typeof document !== 'undefined') {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'light' || attr === 'dark') return attr;
  }
  try {
    const stored = localStorage.getItem('inka-theme');
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    /* ignore */
  }
  return 'dark';
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem('inka-theme', theme);
  } catch {
    /* ignore */
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'light' ? '#E4E1D8' : '#0D0B08');
}

// ===================== MAIN APP =====================
export default function TattoDiary() {
  const [clients, setClients] = useState<Client[]>([]);
  const [db, setDb] = useState<IDBDatabase | null>(null);
  const [dbError, setDbError] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>(readInitialTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  const [screen, setScreen] = useState<'list' | 'detail'>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'info' | 'sessions' | 'documents'>('info');
  const [searchQuery, setSearchQuery] = useState('');

  const [showNewClientForm, setShowNewClientForm] = useState(false);
  const [showNewSessionForm, setShowNewSessionForm] = useState(false);
  const [showEditClientForm, setShowEditClientForm] = useState(false);
  // Session being edited (null when adding a new one).
  const [editSession, setEditSession] = useState<Session | null>(null);

  useEffect(() => {
    initDB()
      .then((database) => {
        setDb(database);
        loadClients(database);
      })
      .catch((err) => {
        console.error('IndexedDB init failed:', err);
        setDbError('Хранилище недоступно. В режиме приватного просмотра переключитесь на обычную вкладку.');
      });
  }, []);

  const loadClients = (database: IDBDatabase) => {
    const tx = database.transaction('clients', 'readonly');
    const request = tx.objectStore('clients').getAll();
    request.onsuccess = () => setClients((request.result || []).map(normalizeClient));
    request.onerror = () => setDbError('Не удалось загрузить клиентов.');
  };

  const saveClient = (client: Client) => {
    if (!db) {
      setDbError('Хранилище недоступно — изменения не сохранены.');
      return;
    }
    const tx = db.transaction('clients', 'readwrite');
    tx.objectStore('clients').put(client);
    tx.oncomplete = () => loadClients(db);
    tx.onerror = () => setDbError('Не удалось сохранить изменения.');
  };

  const deleteClient = (id: string) => {
    if (!db) {
      setDbError('Хранилище недоступно — клиент не удалён.');
      return;
    }
    const tx = db.transaction('clients', 'readwrite');
    tx.objectStore('clients').delete(id);
    tx.oncomplete = () => {
      loadClients(db);
      setScreen('list');
      setSelectedId(null);
    };
    tx.onerror = () => setDbError('Не удалось удалить клиента.');
  };

  const selectedClient = clients.find((c) => c.id === selectedId) || null;

  const filteredClients = clients.filter((c) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return `${c.name} ${c.surname} ${c.style}`.toLowerCase().includes(q);
  });

  const openClient = (client: Client) => {
    setSelectedId(client.id);
    setActiveTab('info');
    setScreen('detail');
  };

  const goBack = () => setScreen('list');

  const closeNewClient = () => setShowNewClientForm(false);
  const closeNewSession = () => {
    setShowNewSessionForm(false);
    setEditSession(null);
  };
  const closeEditClient = () => setShowEditClientForm(false);
  const closeBackdrop = () => {
    setShowNewClientForm(false);
    setShowNewSessionForm(false);
    setShowEditClientForm(false);
    setEditSession(null);
  };

  const handleUpdateClient = (data: { name: string; surname: string; style: string; note: string }) => {
    if (!selectedClient) return;
    saveClient({
      ...selectedClient,
      name: data.name.trim(),
      surname: data.surname.trim(),
      style: data.style,
      note: data.note.trim(),
    });
    setShowEditClientForm(false);
  };

  const deleteSession = (sessionId: string) => {
    if (!selectedClient) return;
    saveClient({ ...selectedClient, sessions: selectedClient.sessions.filter((s) => s.id !== sessionId) });
  };

  const updateSessionPhotos = (sessionId: string, photos: string[]) => {
    if (!selectedClient) return;
    saveClient({
      ...selectedClient,
      sessions: selectedClient.sessions.map((s) => (s.id === sessionId ? { ...s, photos } : s)),
    });
  };

  const handleCreateClient = (data: {
    name: string;
    surname: string;
    phone: string;
    skinType: string;
    skinNotes: string;
    note: string;
  }) => {
    const client: Client = {
      id: Date.now().toString(),
      name: data.name.trim(),
      surname: data.surname.trim(),
      style: '',
      color: ACCENT_COLORS[clients.length % ACCENT_COLORS.length],
      note: data.note.trim(),
      phone: data.phone.trim(),
      skinType: data.skinType,
      skinNotes: data.skinNotes.trim(),
      chatLinks: [],
      sessions: [],
      documents: [],
      createdDate: new Date().toISOString(),
    };
    saveClient(client);
    setShowNewClientForm(false);
  };

  const handleAddSession = (data: {
    name: string;
    date: string;
    duration: string;
    style: string;
    area: string;
    colors: string;
    needles: string;
    skinReaction: string;
    note: string;
    photos: string[];
  }) => {
    if (!selectedClient) return;
    const fields = {
      name: data.name.trim(),
      date: data.date || new Date().toISOString().slice(0, 10),
      duration: data.duration,
      style: data.style,
      area: data.area.trim(),
      colors: data.colors.trim(),
      needles: data.needles.trim(),
      skinReaction: data.skinReaction.trim(),
      note: data.note.trim(),
      photos: data.photos,
    };
    let sessions: Session[];
    if (editSession) {
      // Update the existing session in place, keeping its id and done flag.
      sessions = selectedClient.sessions.map((s) =>
        s.id === editSession.id ? { ...s, ...fields } : s,
      );
    } else {
      sessions = [...selectedClient.sessions, { id: Date.now().toString(), done: true, ...fields }];
    }
    saveClient({
      ...selectedClient,
      style: data.style || selectedClient.style,
      sessions,
    });
    setShowNewSessionForm(false);
    setEditSession(null);
  };

  const sheetOpen = showNewClientForm || showNewSessionForm || showEditClientForm;

  return (
    <div
      className="app-shell"
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: 480,
        margin: '0 auto',
        overflow: 'hidden',
        background: COLORS.bg,
        fontFamily: "'Cormorant Garamond', serif",
      }}
    >
      {/* ═══════════ LIST SCREEN ═══════════ */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: screen === 'list' ? 'translateX(0)' : 'translateX(-110%)',
          transition: 'transform 0.45s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
          overflowY: 'auto',
          overflowX: 'hidden',
          zIndex: 1,
          background: COLORS.bg,
        }}
      >
        {/* Dot-grid texture overlay */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: 'radial-gradient(circle, rgba(var(--gold-rgb),0.035) 1px, transparent 1px)',
            backgroundSize: '22px 22px',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />

        {/* Safe-area / status spacer */}
        <div style={{ height: 'calc(env(safe-area-inset-top) + 18px)', flexShrink: 0 }} />

        {/* Theme toggle (top-right) */}
        <div
          style={{
            position: 'absolute',
            top: 'calc(env(safe-area-inset-top) + 16px)',
            right: 20,
            zIndex: 20,
          }}
        >
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </div>

        {/* App header */}
        <div style={{ padding: '6px 24px 12px', position: 'relative', zIndex: 10 }}>
          <div
            style={{
              fontFamily: "'Cinzel Decorative', serif",
              fontSize: 26,
              color: COLORS.gold,
              letterSpacing: '6px',
              lineHeight: 1,
              textTransform: 'uppercase',
            }}
          >
            INKA
          </div>
          <div
            style={{
              fontSize: 13,
              color: COLORS.textGhost,
              letterSpacing: '5px',
              textTransform: 'uppercase',
              marginTop: 3,
              fontStyle: 'italic',
            }}
          >
            Дневник Мастера
          </div>
          <StarDivider />
        </div>

        {/* Search bar */}
        <div style={{ padding: '0 20px 14px', position: 'relative', zIndex: 10 }}>
          <div
            style={{
              background: 'rgba(var(--surface-rgb),0.022)',
              border: '1px solid rgba(var(--gold-rgb),0.11)',
              borderRadius: 3,
              padding: '8px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 9,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ flexShrink: 0, color: 'var(--ink-faint)' }}>
              <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.2" />
              <line x1="8.7" y1="8.7" x2="12" y2="12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Найти клиента..."
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                fontFamily: "'Cormorant Garamond', serif",
                color: COLORS.textPrimary,
                fontStyle: searchQuery ? 'normal' : 'italic',
                letterSpacing: '0.3px',
              }}
            />
          </div>
        </div>

        {/* Error banner */}
        {dbError && (
          <div
            style={{
              margin: '0 16px 12px',
              padding: '10px 14px',
              borderRadius: 3,
              border: '1px solid rgba(138,48,64,0.5)',
              background: 'rgba(138,48,64,0.12)',
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
              position: 'relative',
              zIndex: 10,
            }}
          >
            <span style={{ flex: 1, fontSize: 15, color: '#C99', fontStyle: 'italic' }}>{dbError}</span>
            <button
              onClick={() => setDbError(null)}
              style={{ background: 'none', border: 'none', color: '#C99', cursor: 'pointer', flexShrink: 0 }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Cards grid */}
        <div
          style={{
            padding: '2px 16px 88px',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 10,
            position: 'relative',
            zIndex: 5,
            // Promote the whole grid to a single GPU layer so both columns move
            // together during momentum scroll (prevents the columns from
            // desyncing/"jumping" as the compositor re-tiles the scroll area).
            transform: 'translateZ(0)',
          }}
        >
          {filteredClients.map((client) => (
            <ClientGridCard key={client.id} client={client} onClick={() => openClient(client)} />
          ))}

          {/* Add new client tile */}
          <div
            className="inka-add-tile"
            onClick={() => setShowNewClientForm(true)}
            style={{
              height: 250,
              border: '1px dashed rgba(var(--gold-rgb),0.17)',
              borderRadius: 3,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 11,
              cursor: 'pointer',
              background: 'rgba(var(--gold-rgb),0.008)',
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                border: '1px solid rgba(var(--gold-rgb),0.22)',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <line x1="7" y1="2" x2="7" y2="12" stroke="currentColor" strokeOpacity="0.45" strokeWidth="1.2" strokeLinecap="round" />
                <line x1="2" y1="7" x2="12" y2="7" stroke="currentColor" strokeOpacity="0.45" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </div>
            <span
              style={{
                fontSize: '11px',
                color: 'rgba(var(--gold-rgb),0.32)',
                letterSpacing: '1.5px',
                textTransform: 'uppercase',
              }}
            >
              Новый
            </span>
          </div>
        </div>

        {/* Empty state */}
        {clients.length > 0 && filteredClients.length === 0 && (
          <div
            style={{
              position: 'absolute',
              top: 280,
              left: 0,
              right: 0,
              textAlign: 'center',
              fontSize: 15,
              fontStyle: 'italic',
              color: COLORS.textGhost,
              pointerEvents: 'none',
            }}
          >
            Ничего не найдено
          </div>
        )}
      </div>

      {/* Bottom navigation — sibling of the screens so it pins to the shell
          bottom (never scrolls). Shown only on the list screen, and hidden while
          a bottom sheet is open so it can't sit over the sheet's controls. */}
      {screen === 'list' && !sheetOpen && <BottomNav />}

      {/* ═══════════ DETAIL SCREEN ═══════════ */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: screen === 'detail' ? 'translateX(0)' : 'translateX(110%)',
          transition: 'transform 0.45s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
          overflow: 'hidden',
          zIndex: 2,
          background: COLORS.bg,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {selectedClient && (
          <DetailScreen
            client={selectedClient}
            activeTab={activeTab}
            onTab={setActiveTab}
            onBack={goBack}
            onSave={saveClient}
            onEditClient={() => setShowEditClientForm(true)}
            onDeleteClient={() => deleteClient(selectedClient.id)}
            onAddSession={() => { setEditSession(null); setShowNewSessionForm(true); }}
            onEditSession={(session) => { setEditSession(session); setShowNewSessionForm(true); }}
            onDeleteSession={deleteSession}
            onUpdateSessionPhotos={updateSessionPhotos}
            onAddDocument={(doc) => saveClient({ ...selectedClient, documents: [...selectedClient.documents, doc] })}
            onRemoveDocument={(docId) =>
              saveClient({ ...selectedClient, documents: selectedClient.documents.filter((d) => d.id !== docId) })
            }
          />
        )}
      </div>

      {/* ═══════════ BACKDROP ═══════════ */}
      <div
        onClick={closeBackdrop}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.65)',
          zIndex: 14,
          opacity: sheetOpen ? 1 : 0,
          pointerEvents: sheetOpen ? 'auto' : 'none',
          transition: 'opacity 0.3s',
        }}
      />

      {/* ═══════════ NEW CLIENT SHEET ═══════════ */}
      <NewClientSheet open={showNewClientForm} onClose={closeNewClient} onCreate={handleCreateClient} />

      {/* ═══════════ EDIT CLIENT SHEET ═══════════ */}
      <EditClientSheet
        open={showEditClientForm}
        client={selectedClient}
        onClose={closeEditClient}
        onSave={handleUpdateClient}
      />

      {/* ═══════════ NEW / EDIT SESSION SHEET ═══════════ */}
      <NewSessionSheet
        open={showNewSessionForm}
        clientName={selectedClient?.name || ''}
        initial={editSession}
        onClose={closeNewSession}
        onAdd={handleAddSession}
      />
    </div>
  );
}

// ===================== CLIENT GRID CARD =====================
function ClientGridCard({ client, onClick }: { client: Client; onClick: () => void }) {
  return (
    <div
      className="inka-card"
      onClick={onClick}
      style={{
        position: 'relative',
        background: COLORS.card,
        border: '1px solid rgba(var(--gold-rgb),0.2)',
        borderRadius: 3,
        height: 250,
        overflow: 'hidden',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Top accent stripe */}
      <div style={{ height: 2, background: client.color, flexShrink: 0 }} />

      {/* Gilded corner accent (top-right) */}
      <div
        style={{
          position: 'absolute',
          top: 2,
          right: 0,
          width: 0,
          height: 0,
          borderStyle: 'solid',
          borderWidth: '0 26px 26px 0',
          borderColor: 'transparent rgba(var(--gold-rgb),0.13) transparent transparent',
          zIndex: 1,
          pointerEvents: 'none',
        }}
      />

      {/* Content */}
      <div
        style={{
          padding: '10px 12px',
          display: 'flex',
          flexDirection: 'column',
          height: 'calc(100% - 2px)',
          position: 'relative',
          zIndex: 2,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, flexShrink: 0 }}>
          <span
            style={{
              fontFamily: DROP_CAP_FONT,
              fontSize: 46,
              // Taller line box so the ornate letter's descending swash stays
              // within its own line and doesn't hang down onto the note text.
              lineHeight: 1.12,
              color: COLORS.gold,
              letterSpacing: '0px',
              flexShrink: 0,
              marginTop: -2,
            }}
          >
            {firstLetter(client.name)}
          </span>
          <div style={{ paddingTop: 7, minWidth: 0, overflow: 'hidden' }}>
            <div
              style={{
                fontSize: 15,
                color: COLORS.textPrimary,
                lineHeight: 1.2,
                letterSpacing: '0.3px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {nameRest(client.name)}
            </div>
            <div
              style={{
                fontSize: 12,
                color: 'var(--surname)',
                fontStyle: 'italic',
                marginTop: 2,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {client.surname}
            </div>
          </div>
        </div>

        {/* Gold divider */}
        <div style={{ height: 1, background: 'linear-gradient(to right, rgba(var(--gold-rgb),0.42), transparent)', margin: '7px 0' }} />

        {/* Note preview fills the middle */}
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {client.note ? (
            <div
              style={{
                fontSize: 13,
                color: 'var(--text-secondary)',
                fontStyle: 'italic',
                lineHeight: 1.42,
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {client.note}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: COLORS.textTrace, fontStyle: 'italic' }}>Без заметок</div>
          )}
        </div>

        {/* Last session name + date */}
        <div style={{ marginBottom: 6, minWidth: 0 }}>
          <div style={{ fontSize: '11px', color: COLORS.textGhost, letterSpacing: '1.5px', textTransform: 'uppercase' }}>
            Последний сеанс
          </div>
          <div
            style={{
              fontSize: 12,
              color: 'var(--text-strong)',
              marginTop: 2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {(() => {
              const s = lastSession(client);
              if (!s) return 'Нет сеансов';
              const d = formatDate(s.date);
              return [s.name, d].filter(Boolean).join(' · ') || '—';
            })()}
          </div>
        </div>

        {/* Style tag + session count */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
          {client.style ? (
            <span
              style={{
                fontSize: 11,
                color: client.color,
                border: `0.5px solid ${client.color}`,
                padding: '2px 7px',
                borderRadius: 1,
                letterSpacing: '1px',
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {client.style}
            </span>
          ) : (
            <span style={{ fontSize: 11, color: COLORS.textGhost, fontStyle: 'italic', letterSpacing: '0.5px' }}>—</span>
          )}
          <span style={{ fontSize: 12, color: COLORS.textGhost, flexShrink: 0 }}>{client.sessions.length} сес.</span>
        </div>
      </div>
    </div>
  );
}

// ===================== BOTTOM NAV =====================
// ===================== THEME TOGGLE =====================
function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  return (
    <div
      className="inka-theme-toggle"
      onClick={onToggle}
      role="button"
      aria-label="Переключить тему"
      style={{
        width: 34,
        height: 34,
        borderRadius: '50%',
        border: '1px solid rgba(var(--gold-rgb),0.25)',
        background: 'rgba(var(--gold-rgb),0.03)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
      }}
    >
      {theme === 'dark' ? (
        // Sun → switch to light
        <svg width="17" height="17" viewBox="0 0 18 18" fill="none">
          <circle cx="9" cy="9" r="3.4" stroke="currentColor" strokeWidth="1.3" />
          <path
            d="M9 1.5V3M9 15V16.5M1.5 9H3M15 9H16.5M3.7 3.7L4.8 4.8M13.2 13.2L14.3 14.3M3.7 14.3L4.8 13.2M13.2 4.8L14.3 3.7"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        // Moon → switch to dark
        <svg width="17" height="17" viewBox="0 0 18 18" fill="none">
          <path
            d="M14.5 10.6A6 6 0 1 1 7.4 3.5a4.7 4.7 0 0 0 7.1 7.1Z"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </div>
  );
}

function BottomNav() {
  return (
    <div
      style={{
        // Rendered as a direct child of the (non-scrolling) app shell, so
        // absolute bottom:0 pins the ribbon to the bottom of the screen and it
        // no longer scrolls away with the card list.
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 'calc(48px + env(safe-area-inset-bottom))',
        // Solid (no backdrop-filter): the blur repainted every frame during
        // scroll and was a major source of jank. A flat bar is also visually
        // slimmer, hugging the icons.
        background: 'var(--bg)',
        borderTop: '1px solid rgba(var(--gold-rgb),0.08)',
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'center',
        paddingTop: 4,
        paddingBottom: 'calc(4px + env(safe-area-inset-bottom))',
        zIndex: 50,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M3 9.5L10 3L17 9.5V17H13V12.5H7V17H3V9.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" fill="currentColor" fillOpacity="0.07" />
        </svg>
        <span style={{ fontSize: '11px', color: COLORS.gold, letterSpacing: '1px', textTransform: 'uppercase' }}>Клиенты</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, opacity: 0.28 }}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ color: 'var(--text)' }}>
          <rect x="2.5" y="12" width="3.5" height="5.5" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
          <rect x="8.3" y="8" width="3.5" height="9.5" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
          <rect x="14" y="4" width="3.5" height="13.5" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
        </svg>
        <span style={{ fontSize: '11px', color: COLORS.textFaint, letterSpacing: '1px', textTransform: 'uppercase' }}>Сводка</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, opacity: 0.28 }}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ color: 'var(--text)' }}>
          <circle cx="10" cy="10" r="2.8" stroke="currentColor" strokeWidth="1.2" />
          <path
            d="M10 2.5L10 4.5M10 15.5L10 17.5M2.5 10L4.5 10M15.5 10L17.5 10M5.05 5.05L6.46 6.46M13.54 13.54L14.95 14.95M5.05 14.95L6.46 13.54M13.54 6.46L14.95 5.05"
            stroke="currentColor"
            strokeWidth="1.1"
            strokeLinecap="round"
          />
        </svg>
        <span style={{ fontSize: '11px', color: COLORS.textFaint, letterSpacing: '1px', textTransform: 'uppercase' }}>Настройки</span>
      </div>
    </div>
  );
}

// ===================== DETAIL SCREEN =====================
function DetailScreen({
  client,
  activeTab,
  onTab,
  onBack,
  onSave,
  onEditClient,
  onDeleteClient,
  onAddSession,
  onEditSession,
  onDeleteSession,
  onUpdateSessionPhotos,
  onAddDocument,
  onRemoveDocument,
}: {
  client: Client;
  activeTab: 'info' | 'sessions' | 'documents';
  onTab: (t: 'info' | 'sessions' | 'documents') => void;
  onBack: () => void;
  onSave: (client: Client) => void;
  onEditClient: () => void;
  onDeleteClient: () => void;
  onAddSession: () => void;
  onEditSession: (session: Session) => void;
  onDeleteSession: (sessionId: string) => void;
  onUpdateSessionPhotos: (sessionId: string, photos: string[]) => void;
  onAddDocument: (doc: ClientDocument) => void;
  onRemoveDocument: (docId: string) => void;
}) {
  const tabStyle = (tab: typeof activeTab): React.CSSProperties => ({
    flex: 1,
    textAlign: 'center',
    padding: '11px 0',
    fontSize: 13,
    letterSpacing: '1.5px',
    textTransform: 'uppercase',
    color: activeTab === tab ? COLORS.gold : 'var(--ink-faint)',
    borderBottom: activeTab === tab ? `1px solid ${COLORS.gold}` : '1px solid transparent',
    cursor: 'pointer',
    transition: 'color 0.25s',
  });

  return (
    <>
      {/* Hero header */}
      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          background: 'var(--hero-grad)',
          flexShrink: 0,
          paddingTop: 'env(safe-area-inset-top)',
        }}
      >
        {/* Status bar with back */}
        <div style={{ height: 56, padding: '18px 24px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 10 }}>
          <div className="inka-back" onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M11 4L6 9L11 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span style={{ fontSize: 15, color: COLORS.gold, fontStyle: 'italic', letterSpacing: '0.3px' }}>вернуться</span>
          </div>
          {/* Edit client */}
          <div
            className="inka-back"
            onClick={onEditClient}
            style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
          >
            <span style={{ fontSize: 15, color: COLORS.gold, fontStyle: 'italic', letterSpacing: '0.3px' }}>править</span>
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <path d="M11 2.5L13.5 5L5.5 13H3V10.5L11 2.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
            </svg>
          </div>
        </div>

        {/* Giant drop cap hero */}
        <div style={{ padding: '12px 24px 18px', position: 'relative', zIndex: 5 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
            <span
              style={{
                fontFamily: DROP_CAP_FONT,
                fontSize: 100,
                lineHeight: 0.79,
                color: COLORS.gold,
                letterSpacing: '-2px',
                flexShrink: 0,
                marginLeft: -5,
              }}
            >
              {firstLetter(client.name)}
            </span>
            <div style={{ paddingTop: 16, paddingLeft: 6, minWidth: 0 }}>
              <div style={{ fontSize: 26, color: COLORS.textPrimary, fontWeight: 300, lineHeight: 1.05, letterSpacing: '1px' }}>
                {nameRest(client.name)}
              </div>
              <div style={{ fontSize: 15, color: COLORS.textMuted, fontStyle: 'italic', marginTop: 5, letterSpacing: '0.5px' }}>
                {client.surname}
              </div>
            </div>
          </div>
          {/* Style + session count */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 13 }}>
            <div style={{ width: 22, height: 2, background: client.color, borderRadius: 1, flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: 'var(--text-soft)', letterSpacing: '2.5px', textTransform: 'uppercase' }}>
              {client.style || 'Без стиля'}
            </span>
            <span style={{ fontSize: 13, color: COLORS.textGhost }}>· {client.sessions.length} сессий</span>
          </div>
        </div>

        {/* Client color stripe */}
        <div style={{ height: 3, background: client.color, width: '100%', flexShrink: 0 }} />
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(var(--gold-rgb),0.1)', padding: '0 24px', background: COLORS.bg, flexShrink: 0 }}>
        <div onClick={() => onTab('info')} style={tabStyle('info')}>
          Инфо
        </div>
        <div onClick={() => onTab('sessions')} style={tabStyle('sessions')}>
          Сессии
        </div>
        <div onClick={() => onTab('documents')} style={tabStyle('documents')}>
          Документы
        </div>
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '22px 24px 50px', background: COLORS.bg }}>
        {activeTab === 'info' && <InfoTab client={client} onSave={onSave} onDeleteClient={onDeleteClient} />}
        {activeTab === 'sessions' && (
          <SessionsTab
            client={client}
            onAddSession={onAddSession}
            onEditSession={onEditSession}
            onDeleteSession={onDeleteSession}
            onUpdateSessionPhotos={onUpdateSessionPhotos}
          />
        )}
        {activeTab === 'documents' && (
          <DocumentsTab client={client} onAddDocument={onAddDocument} onRemoveDocument={onRemoveDocument} />
        )}
      </div>
    </>
  );
}

// ── Info tab ──
function InfoTab({
  client,
  onSave,
  onDeleteClient,
}: {
  client: Client;
  onSave: (client: Client) => void;
  onDeleteClient: () => void;
}) {
  const note = client.note || '';
  const metaCell = (span = false): React.CSSProperties => ({
    background: 'rgba(var(--surface-rgb),0.018)',
    border: '1px solid rgba(var(--gold-rgb),0.1)',
    borderRadius: 2,
    padding: 13,
    gridColumn: span ? 'span 2' : undefined,
  });

  return (
    <div style={{ animation: 'fadeSlideIn 0.3s ease' }}>
      {/* Notes with drop cap */}
      <div style={{ marginBottom: 22 }}>
        <div
          style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: 11,
            color: COLORS.textGhost,
            letterSpacing: '3.5px',
            textTransform: 'uppercase',
            marginBottom: 12,
          }}
        >
          Заметки мастера
        </div>
        {note ? (
          <div style={{ overflow: 'hidden', lineHeight: 1 }}>
            <span
              style={{
                fontFamily: DROP_CAP_FONT,
                fontSize: 52,
                lineHeight: 0.81,
                color: 'rgba(var(--gold-rgb),0.42)',
                float: 'left',
                marginRight: 7,
                paddingBottom: 2,
                marginTop: 1,
              }}
            >
              {note.charAt(0)}
            </span>
            <span style={{ fontSize: 15, color: 'var(--text-soft)', lineHeight: 1.75, fontStyle: 'italic', display: 'block', overflow: 'hidden' }}>
              {note.slice(1)}
            </span>
          </div>
        ) : (
          <div style={{ fontSize: 15, color: COLORS.textGhost, fontStyle: 'italic' }}>Заметок пока нет.</div>
        )}
      </div>

      {/* Ornamental divider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18, clear: 'both' }}>
        <div style={{ flex: 1, height: 1, background: 'linear-gradient(to right, rgba(var(--gold-rgb),0.28), transparent)' }} />
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M5 1L5.8 4H9L6.5 5.8L7.3 9L5 7.2L2.7 9L3.5 5.8L1 4H4.2Z" fill="currentColor" fillOpacity="0.28" />
        </svg>
        <div style={{ flex: 1, height: 1, background: 'linear-gradient(to left, rgba(var(--gold-rgb),0.28), transparent)' }} />
      </div>

      {/* Meta grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div style={metaCell()}>
          <MetaLabel>Стиль</MetaLabel>
          <MetaValue>{client.style || '—'}</MetaValue>
        </div>
        <div style={metaCell()}>
          <MetaLabel>Сессий</MetaLabel>
          <MetaValue>{String(client.sessions.length)}</MetaValue>
        </div>
        <div style={metaCell(true)}>
          <MetaLabel>Последняя сессия</MetaLabel>
          <MetaValue>{lastSessionDate(client)}</MetaValue>
        </div>
      </div>

      {/* Skin: type + notes */}
      <SkinSection client={client} onSave={onSave} />

      {/* Contacts: phone + chat links */}
      <ContactsSection client={client} onSave={onSave} />

      {/* Danger zone: delete client */}
      <div style={{ marginTop: 28 }}>
        <DeleteButton label="Удалить клиента" confirmLabel="Удалить клиента безвозвратно?" onConfirm={onDeleteClient} />
      </div>
    </div>
  );
}

// Two-step delete control: first tap reveals an inline confirm row.
function DeleteButton({
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

function MetaLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: '11px', color: COLORS.textGhost, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 6 }}>
      {children}
    </div>
  );
}
function MetaValue({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 15, color: COLORS.textPrimary, fontWeight: 300 }}>{children}</div>;
}

// ── Skin (type + notes) ──
function SectionDivider() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, clear: 'both' }}>
      <div style={{ flex: 1, height: 1, background: 'linear-gradient(to right, rgba(var(--gold-rgb),0.28), transparent)' }} />
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
        <path d="M5 1L5.8 4H9L6.5 5.8L7.3 9L5 7.2L2.7 9L3.5 5.8L1 4H4.2Z" fill="currentColor" fillOpacity="0.28" />
      </svg>
      <div style={{ flex: 1, height: 1, background: 'linear-gradient(to left, rgba(var(--gold-rgb),0.28), transparent)' }} />
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: "'Playfair Display', serif",
        fontSize: 11,
        color: COLORS.textGhost,
        letterSpacing: '3.5px',
        textTransform: 'uppercase',
        marginBottom: 12,
      }}
    >
      {children}
    </div>
  );
}

function SkinSection({ client, onSave }: { client: Client; onSave: (client: Client) => void }) {
  const [skinType, setSkinType] = useState(client.skinType || '');
  const [skinNotes, setSkinNotes] = useState(client.skinNotes || '');

  useEffect(() => {
    setSkinType(client.skinType || '');
    setSkinNotes(client.skinNotes || '');
  }, [client.id]);

  const saveType = (value: string) => {
    setSkinType(value);
    if (value !== (client.skinType || '')) onSave({ ...client, skinType: value });
  };
  const saveNotes = () => {
    if (skinNotes.trim() !== (client.skinNotes || '')) onSave({ ...client, skinNotes: skinNotes.trim() });
  };

  return (
    <div style={{ marginTop: 22 }}>
      <SectionDivider />
      <SectionHeader>Кожа</SectionHeader>

      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: '11px', color: COLORS.textGhost, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 6 }}>
          Тип кожи
        </div>
        <select
          value={skinType}
          onChange={(e) => saveType(e.target.value)}
          style={{
            width: '100%',
            background: 'rgba(var(--surface-rgb),0.018)',
            border: '1px solid rgba(var(--gold-rgb),0.1)',
            borderRadius: 2,
            padding: '11px 13px',
            fontFamily: "'Cormorant Garamond', serif",
            color: skinType ? COLORS.textPrimary : COLORS.textGhost,
            outline: 'none',
            appearance: 'none',
          }}
        >
          {SKIN_TYPES.map((s) => (
            <option key={s.value} value={s.value} style={{ background: COLORS.bg }}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <div style={{ fontSize: '11px', color: COLORS.textGhost, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 6 }}>
          Заметки о коже
        </div>
        <textarea
          value={skinNotes}
          onChange={(e) => setSkinNotes(e.target.value)}
          onBlur={saveNotes}
          placeholder="Аллергии, чувствительные зоны, реакции..."
          style={{
            width: '100%',
            background: 'rgba(var(--surface-rgb),0.018)',
            border: '1px solid rgba(var(--gold-rgb),0.1)',
            borderRadius: 2,
            padding: '11px 13px',
            fontFamily: "'Cormorant Garamond', serif",
            color: COLORS.textPrimary,
            outline: 'none',
            resize: 'none',
            height: 70,
            letterSpacing: '0.3px',
          }}
        />
      </div>
    </div>
  );
}

// ── Contacts (phone + chat links) ──
function ContactsSection({ client, onSave }: { client: Client; onSave: (client: Client) => void }) {
  const [phone, setPhone] = useState(client.phone || '');
  const [editingPhone, setEditingPhone] = useState(false);

  // Re-sync local phone when switching to another client.
  useEffect(() => {
    setPhone(client.phone || '');
    setEditingPhone(false);
  }, [client.id]);

  const savePhone = () => {
    setEditingPhone(false);
    if (phone.trim() !== (client.phone || '')) onSave({ ...client, phone: phone.trim() });
  };

  const addLink = (platform: ChatPlatform, raw: string) => {
    const link: ChatLink = { id: Date.now().toString(), platform, url: buildChatLink(platform, raw) };
    onSave({ ...client, chatLinks: [...(client.chatLinks || []), link] });
  };
  const removeLink = (id: string) => onSave({ ...client, chatLinks: (client.chatLinks || []).filter((l) => l.id !== id) });

  return (
    <div style={{ marginTop: 22 }}>
      {/* Ornamental divider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, clear: 'both' }}>
        <div style={{ flex: 1, height: 1, background: 'linear-gradient(to right, rgba(var(--gold-rgb),0.28), transparent)' }} />
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M5 1L5.8 4H9L6.5 5.8L7.3 9L5 7.2L2.7 9L3.5 5.8L1 4H4.2Z" fill="currentColor" fillOpacity="0.28" />
        </svg>
        <div style={{ flex: 1, height: 1, background: 'linear-gradient(to left, rgba(var(--gold-rgb),0.28), transparent)' }} />
      </div>

      <div
        style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: 11,
          color: COLORS.textGhost,
          letterSpacing: '3.5px',
          textTransform: 'uppercase',
          marginBottom: 12,
        }}
      >
        Контакты
      </div>

      {/* Phone row */}
      <div
        style={{
          background: 'rgba(var(--surface-rgb),0.018)',
          border: '1px solid rgba(var(--gold-rgb),0.1)',
          borderRadius: 2,
          padding: '11px 13px',
          display: 'flex',
          alignItems: 'center',
          gap: 11,
          marginBottom: 8,
        }}
      >
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
          <path
            d="M3 3.5C3 3 3.4 2.5 4 2.5H5.5C5.9 2.5 6.3 2.8 6.4 3.2L7 5.4C7.1 5.8 7 6.2 6.7 6.4L5.7 7.2C6.4 8.7 7.3 9.6 8.8 10.3L9.6 9.3C9.8 9 10.2 8.9 10.6 9L12.8 9.6C13.2 9.7 13.5 10.1 13.5 10.5V12C13.5 12.6 13 13 12.5 13C7.3 13 3 8.7 3 3.5Z"
            stroke="currentColor"
            strokeWidth="1.2"
            fill="currentColor" fillOpacity="0.06"
            strokeLinejoin="round"
          />
        </svg>
        {editingPhone ? (
          <input
            autoFocus
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onBlur={savePhone}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            placeholder="+7 999 123-45-67"
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontFamily: "'Cormorant Garamond', serif",
              color: COLORS.textPrimary,
              letterSpacing: '0.3px',
            }}
          />
        ) : client.phone ? (
          <>
            <a
              href={`tel:${client.phone.replace(/[^\d+]/g, '')}`}
              style={{ flex: 1, fontSize: 15, color: COLORS.textPrimary, textDecoration: 'none', letterSpacing: '0.3px' }}
            >
              {client.phone}
            </a>
            <span
              onClick={() => setEditingPhone(true)}
              style={{ fontSize: 13, color: COLORS.textFaint, fontStyle: 'italic', cursor: 'pointer' }}
            >
              изменить
            </span>
          </>
        ) : (
          <span
            onClick={() => setEditingPhone(true)}
            style={{ flex: 1, fontSize: 15, color: COLORS.textGhost, fontStyle: 'italic', cursor: 'pointer' }}
          >
            Добавить телефон
          </span>
        )}
      </div>

      {/* Chat links */}
      {(client.chatLinks || []).map((link) => (
        <div
          key={link.id}
          style={{
            background: 'rgba(var(--surface-rgb),0.018)',
            border: '1px solid rgba(var(--gold-rgb),0.1)',
            borderRadius: 2,
            padding: '11px 13px',
            display: 'flex',
            alignItems: 'center',
            gap: 11,
            marginBottom: 8,
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: COLORS.gold,
              flexShrink: 0,
            }}
          />
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ flex: 1, minWidth: 0, textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: 1 }}
          >
            <span style={{ fontSize: 15, color: COLORS.gold, letterSpacing: '0.5px' }}>{PLATFORM_LABELS[link.platform]}</span>
            <span
              style={{
                fontSize: 13,
                color: COLORS.textFaint,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {link.url.replace(/^https?:\/\//, '')}
            </span>
          </a>
          <button
            onClick={() => removeLink(link.id)}
            style={{ background: 'none', border: 'none', color: COLORS.textFaint, cursor: 'pointer', flexShrink: 0, fontSize: 15 }}
          >
            ✕
          </button>
        </div>
      ))}

      <AddChatLinkForm onAdd={addLink} />
    </div>
  );
}

function AddChatLinkForm({ onAdd }: { onAdd: (platform: ChatPlatform, raw: string) => void }) {
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
        <span style={{ fontSize: 13, color: 'rgba(var(--gold-rgb),0.5)', letterSpacing: '1px', textTransform: 'uppercase', fontStyle: 'italic' }}>
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
    fontFamily: "'Cormorant Garamond', serif",
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
            textAlign: 'center',
            padding: '9px',
            borderRadius: 2,
            border: '1px solid rgba(var(--gold-rgb),0.15)',
            color: COLORS.textFaint,
            fontSize: 13,
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
            if (!raw.trim()) return;
            onAdd(platform, raw);
            setRaw('');
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
            fontSize: 13,
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

// One "label: value" line inside a session card (краски / иглы / реакция кожи).
function SessionMeta({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 6, fontSize: 13, lineHeight: 1.4 }}>
      <span style={{ color: COLORS.textFaint, letterSpacing: '0.5px', textTransform: 'uppercase', flexShrink: 0, fontSize: 11, paddingTop: 1 }}>
        {label}
      </span>
      <span style={{ color: 'var(--text-soft)', fontStyle: 'italic' }}>{value}</span>
    </div>
  );
}

// Small ✕ on a session card; a tap reveals "Удалить? Да/Нет" inline.
function SessionDeleteControl({ onDelete }: { onDelete: () => void }) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, color: '#A85A66', fontStyle: 'italic' }}>Удалить?</span>
        <span onClick={onDelete} style={{ fontSize: 12, color: '#C56676', textTransform: 'uppercase', letterSpacing: '0.5px', cursor: 'pointer' }}>
          Да
        </span>
        <span
          onClick={() => setConfirming(false)}
          style={{ fontSize: 12, color: COLORS.textFaint, textTransform: 'uppercase', letterSpacing: '0.5px', cursor: 'pointer' }}
        >
          Нет
        </span>
      </span>
    );
  }

  return (
    <span onClick={() => setConfirming(true)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }} aria-label="Удалить сессию">
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ color: COLORS.textFaint }}>
        <line x1="3" y1="3" x2="13" y2="13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <line x1="13" y1="3" x2="3" y2="13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    </span>
  );
}

// Photo gallery + upload for a session. On mobile the native file picker
// already offers "Take Photo", so there's no separate camera button. Deleting
// a photo takes two taps (✕ → confirm) so it can't happen by accident.
function SessionPhotos({
  photos,
  onChange,
  allowDelete = true,
}: {
  photos: string[];
  onChange: (photos: string[]) => void;
  allowDelete?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmIndex, setConfirmIndex] = useState<number | null>(null);

  const onPick = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const readers = Array.from(files).map(
      (file) =>
        new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        }),
    );
    Promise.all(readers).then((urls) => onChange([...photos, ...urls]));
  };

  const remove = (i: number) => {
    onChange(photos.filter((_, idx) => idx !== i));
    setConfirmIndex(null);
  };

  return (
    <div style={{ marginTop: 10 }}>
      {photos.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          {photos.map((src, i) => (
            <div key={i} style={{ position: 'relative', width: 78, height: 78 }}>
              <a href={src} target="_blank" rel="noopener noreferrer">
                <img
                  src={src}
                  alt=""
                  style={{
                    width: 78,
                    height: 78,
                    objectFit: 'cover',
                    borderRadius: 2,
                    border: '1px solid rgba(var(--gold-rgb),0.2)',
                    display: 'block',
                  }}
                />
              </a>
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
                  <span style={{ fontSize: 11, color: '#EDE4CC', fontStyle: 'italic' }}>Удалить?</span>
                  <span style={{ display: 'flex', gap: 10 }}>
                    <span onClick={() => remove(i)} style={{ fontSize: 12, color: '#E08694', textTransform: 'uppercase', cursor: 'pointer' }}>
                      Да
                    </span>
                    <span onClick={() => setConfirmIndex(null)} style={{ fontSize: 12, color: '#CFC3AE', textTransform: 'uppercase', cursor: 'pointer' }}>
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
      )}

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
          fontSize: 12,
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
    </div>
  );
}

// ── Sessions tab ──
function SessionsTab({
  client,
  onAddSession,
  onEditSession,
  onDeleteSession,
  onUpdateSessionPhotos,
}: {
  client: Client;
  onAddSession: () => void;
  onEditSession: (session: Session) => void;
  onDeleteSession: (sessionId: string) => void;
  onUpdateSessionPhotos: (sessionId: string, photos: string[]) => void;
}) {
  return (
    <div style={{ animation: 'fadeSlideIn 0.3s ease' }}>
      <div
        style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: 11,
          color: COLORS.textGhost,
          letterSpacing: '3.5px',
          textTransform: 'uppercase',
          marginBottom: 18,
        }}
      >
        История работы
      </div>

      {client.sessions.length === 0 && (
        <div style={{ fontSize: 15, color: COLORS.textGhost, fontStyle: 'italic', marginBottom: 14 }}>Сессий пока нет.</div>
      )}

      {client.sessions.map((session) => (
        <div key={session.id} style={{ display: 'flex', gap: 14, marginBottom: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: 8 }}>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                flexShrink: 0,
                marginTop: 4,
                background: session.done ? client.color : 'transparent',
                border: session.done ? 'none' : '1px solid rgba(var(--gold-rgb),0.25)',
              }}
            />
            <div style={{ width: 1, flex: 1, background: 'rgba(var(--gold-rgb),0.08)', marginTop: 5 }} />
          </div>
          <div
            style={{
              flex: 1,
              background: 'rgba(var(--surface-rgb),0.018)',
              border: '1px solid rgba(var(--gold-rgb),0.1)',
              borderRadius: 2,
              padding: '12px 14px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 7 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, color: 'var(--text-strong)', fontWeight: 500, letterSpacing: '0.3px' }}>
                  {session.name || formatDate(session.date) || 'Сессия'}
                </div>
                {session.name && formatDate(session.date) && (
                  <div style={{ fontSize: 12, color: COLORS.textGhost, marginTop: 2, letterSpacing: '0.3px' }}>{formatDate(session.date)}</div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, flexShrink: 0 }}>
                {session.duration && <span style={{ fontSize: 13, color: COLORS.textGhost, fontStyle: 'italic' }}>{session.duration}</span>}
                <div
                  className="inka-back"
                  onClick={() => onEditSession(session)}
                  style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', opacity: 0.75 }}
                  title="Редактировать сессию"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ color: COLORS.gold }}>
                    <path d="M11 2.5L13.5 5L5.5 13H3V10.5L11 2.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                  </svg>
                </div>
                <SessionDeleteControl onDelete={() => onDeleteSession(session.id)} />
              </div>
            </div>
            {session.area && (
              <div style={{ fontSize: 12, color: COLORS.textFaint, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 7 }}>
                {session.area}
              </div>
            )}
            {session.note && <div style={{ fontSize: 13, color: 'var(--text-soft2)', fontStyle: 'italic', lineHeight: 1.6 }}>{session.note}</div>}
            {(session.colors || session.needles || session.skinReaction) && (
              <div
                style={{
                  marginTop: 9,
                  paddingTop: 9,
                  borderTop: '1px solid rgba(var(--gold-rgb),0.08)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                {session.colors && <SessionMeta label="Краски" value={session.colors} />}
                {session.needles && <SessionMeta label="Иглы" value={session.needles} />}
                {session.skinReaction && <SessionMeta label="Реакция кожи" value={session.skinReaction} />}
              </div>
            )}
            <SessionPhotos
              photos={session.photos}
              onChange={(photos) => onUpdateSessionPhotos(session.id, photos)}
              allowDelete={false}
            />
          </div>
        </div>
      ))}

      {/* Add session button */}
      <div
        className="inka-dashed"
        onClick={onAddSession}
        style={{
          marginTop: 14,
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
        <span style={{ fontSize: 13, color: 'rgba(var(--gold-rgb),0.5)', letterSpacing: '1px', textTransform: 'uppercase', fontStyle: 'italic' }}>
          Добавить сессию
        </span>
      </div>
    </div>
  );
}

// ── Documents tab ──
function DocumentsTab({
  client,
  onAddDocument,
  onRemoveDocument,
}: {
  client: Client;
  onAddDocument: (doc: ClientDocument) => void;
  onRemoveDocument: (docId: string) => void;
}) {
  const docInput = useRef<HTMLInputElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);

  const handleFile = (file: File | undefined, kind: 'document' | 'photo') => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      onAddDocument({
        id: Date.now().toString(),
        name: file.name,
        fileUrl: reader.result as string,
        kind,
        uploadedDate: new Date().toLocaleDateString('ru-RU'),
      });
    };
    reader.readAsDataURL(file);
  };

  const hasDocs = client.documents.length > 0;

  return (
    <div style={{ animation: 'fadeSlideIn 0.3s ease', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: hasDocs ? 0 : '40px 0 0', gap: 14 }}>
      {!hasDocs && (
        <div style={{ fontSize: 15, color: COLORS.textGhost, fontStyle: 'italic', textAlign: 'center', letterSpacing: '0.2px' }}>
          Документы не добавлены
        </div>
      )}

      {hasDocs && (
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 6 }}>
          {client.documents.map((doc) => (
            <div
              key={doc.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                border: '1px solid rgba(var(--gold-rgb),0.12)',
                borderRadius: 2,
                padding: '11px 14px',
                background: 'rgba(var(--surface-rgb),0.018)',
              }}
            >
              <span style={{ fontSize: 13, color: COLORS.gold }}>{doc.kind === 'photo' ? '◈' : '▤'}</span>
              <a
                href={doc.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ flex: 1, minWidth: 0, textDecoration: 'none' }}
              >
                <div style={{ fontSize: 15, color: COLORS.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {doc.name}
                </div>
                <div style={{ fontSize: 11, color: COLORS.textGhost, letterSpacing: '0.4px', marginTop: 2 }}>{doc.uploadedDate}</div>
              </a>
              <button
                onClick={() => onRemoveDocument(doc.id)}
                style={{ background: 'none', border: 'none', color: COLORS.textFaint, cursor: 'pointer', flexShrink: 0, fontSize: 15 }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', marginTop: hasDocs ? 0 : 4 }}>
        {/* Add document */}
        <div
          className="inka-doc-primary"
          onClick={() => docInput.current?.click()}
          style={{
            border: '1px solid rgba(var(--gold-rgb),0.32)',
            borderRadius: 2,
            padding: '13px 18px',
            cursor: 'pointer',
            background: 'rgba(var(--gold-rgb),0.05)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="2" y="1" width="10" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
            <line x1="5" y1="5.5" x2="9" y2="5.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
            <line x1="5" y1="8" x2="9" y2="8" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
            <line x1="5" y1="10.5" x2="7" y2="10.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
            <circle cx="13" cy="13" r="3" style={{ fill: 'var(--sheet)' }} stroke="currentColor" strokeWidth="1" />
            <line x1="13" y1="11.5" x2="13" y2="14.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
            <line x1="11.5" y1="13" x2="14.5" y2="13" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
          </svg>
          <span style={{ fontSize: 15, color: COLORS.gold, letterSpacing: '1px', textTransform: 'uppercase' }}>Добавить документ</span>
        </div>

        {/* Add photo */}
        <div
          className="inka-doc-secondary"
          onClick={() => photoInput.current?.click()}
          style={{
            border: '1px solid rgba(var(--gold-rgb),0.18)',
            borderRadius: 2,
            padding: '13px 18px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ color: 'var(--text-faint)' }}>
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2" />
            <rect x="5.5" y="5.5" width="5" height="4" rx="0.5" stroke="currentColor" strokeWidth="1" />
            <line x1="5.5" y1="11" x2="10.5" y2="11" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
          </svg>
          <span style={{ fontSize: 15, color: COLORS.textFaint, letterSpacing: '1px', textTransform: 'uppercase', fontStyle: 'italic' }}>
            Добавить фото
          </span>
        </div>
      </div>

      <input
        ref={docInput}
        type="file"
        style={{ display: 'none' }}
        onChange={(e) => {
          handleFile(e.target.files?.[0], 'document');
          e.target.value = '';
        }}
      />
      <input
        ref={photoInput}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          handleFile(e.target.files?.[0], 'photo');
          e.target.value = '';
        }}
      />
    </div>
  );
}

// ===================== BOTTOM SHEET SHELL =====================
function BottomSheet({
  open,
  heightPct,
  children,
}: {
  open: boolean;
  heightPct: number;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: `${heightPct}%`,
        background: COLORS.sheet,
        borderRadius: '20px 20px 0 0',
        border: '1px solid rgba(var(--gold-rgb),0.18)',
        borderBottom: 'none',
        zIndex: 15,
        overflowY: 'auto',
        transform: open ? 'translateY(0)' : 'translateY(105%)',
        transition: 'transform 0.42s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
      }}
    >
      <div style={{ width: 36, height: 3, background: 'rgba(var(--gold-rgb),0.2)', borderRadius: 2, margin: '14px auto 0' }} />
      {children}
    </div>
  );
}

function SheetCloseButton({ onClose }: { onClose: () => void }) {
  return (
    <div className="inka-close" onClick={onClose} style={{ position: 'absolute', top: 18, right: 24, cursor: 'pointer', opacity: 0.4 }}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <line x1="3" y1="3" x2="13" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="13" y1="3" x2="3" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </div>
  );
}

// ===================== NEW CLIENT SHEET =====================
function NewClientSheet({
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
    skinType: string;
    skinNotes: string;
    note: string;
  }) => void;
}) {
  const [name, setName] = useState('');
  const [surname, setSurname] = useState('');
  const [phone, setPhone] = useState('');
  const [skinType, setSkinType] = useState('');
  const [skinNotes, setSkinNotes] = useState('');
  const [note, setNote] = useState('');

  // Reset fields whenever the sheet is closed.
  useEffect(() => {
    if (!open) {
      setName('');
      setSurname('');
      setPhone('');
      setSkinType('');
      setSkinNotes('');
      setNote('');
    }
  }, [open]);

  const canSubmit = name.trim().length > 0;

  return (
    <BottomSheet open={open} heightPct={88}>
      <div style={{ padding: '16px 24px 14px', position: 'relative' }}>
        <SheetCloseButton onClose={onClose} />
        <div style={{ fontFamily: "'Cinzel Decorative', serif", fontSize: 11, color: COLORS.textGhost, letterSpacing: '3px', textTransform: 'uppercase', marginBottom: 5 }}>
          INKA
        </div>
        <div style={{ fontSize: 22, color: COLORS.textPrimary, fontWeight: 300, letterSpacing: '1px' }}>Новый клиент</div>
        <SheetStarDivider />
      </div>

      <div style={{ padding: '4px 24px 50px' }}>
        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Имя *</FieldLabel>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Александра" style={INPUT_STYLE} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Фамилия</FieldLabel>
          <input value={surname} onChange={(e) => setSurname(e.target.value)} placeholder="Вертинская" style={INPUT_STYLE} />
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
            value={skinNotes}
            onChange={(e) => setSkinNotes(e.target.value)}
            placeholder="Аллергии, чувствительные зоны, реакции..."
            style={{ ...INPUT_STYLE, resize: 'none', height: 70 }}
          />
        </div>
        <div style={{ marginBottom: 22 }}>
          <FieldLabel>Заметки</FieldLabel>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Идеи, пожелания, особенности..."
            style={{ ...INPUT_STYLE, resize: 'none', height: 100 }}
          />
        </div>
        <div
          className="inka-submit"
          onClick={() => canSubmit && onCreate({ name, surname, phone, skinType, skinNotes, note })}
          style={{ ...SUBMIT_STYLE, opacity: canSubmit ? 1 : 0.4, cursor: canSubmit ? 'pointer' : 'default' }}
        >
          <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 13, color: COLORS.gold, letterSpacing: '2px' }}>
            Создать клиента
          </span>
        </div>
      </div>
    </BottomSheet>
  );
}

// ===================== EDIT CLIENT SHEET =====================
function EditClientSheet({
  open,
  client,
  onClose,
  onSave,
}: {
  open: boolean;
  client: Client | null;
  onClose: () => void;
  onSave: (data: { name: string; surname: string; style: string; note: string }) => void;
}) {
  const [name, setName] = useState('');
  const [surname, setSurname] = useState('');
  const [style, setStyle] = useState('');
  const [note, setNote] = useState('');

  // Populate fields from the client each time the sheet opens.
  useEffect(() => {
    if (open && client) {
      setName(client.name);
      setSurname(client.surname);
      setStyle(client.style);
      setNote(client.note);
    }
  }, [open, client?.id]);

  const canSubmit = name.trim().length > 0;

  const chipStyle = (selected: boolean): React.CSSProperties => ({
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: 12,
    padding: '6px 11px',
    borderRadius: 2,
    cursor: 'pointer',
    border: selected ? '1px solid rgba(var(--gold-rgb),0.65)' : '1px solid rgba(var(--gold-rgb),0.15)',
    color: selected ? COLORS.gold : COLORS.textFaint,
    background: selected ? 'rgba(var(--gold-rgb),0.08)' : 'transparent',
    letterSpacing: '0.8px',
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
    transition: 'all 0.2s',
  });

  return (
    <BottomSheet open={open} heightPct={84}>
      <div style={{ padding: '16px 24px 14px', position: 'relative' }}>
        <SheetCloseButton onClose={onClose} />
        <div style={{ fontFamily: "'Cinzel Decorative', serif", fontSize: 11, color: COLORS.textGhost, letterSpacing: '3px', textTransform: 'uppercase', marginBottom: 5 }}>
          INKA
        </div>
        <div style={{ fontSize: 22, color: COLORS.textPrimary, fontWeight: 300, letterSpacing: '1px' }}>Редактировать</div>
        <SheetStarDivider />
      </div>

      <div style={{ padding: '4px 24px 50px' }}>
        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Имя *</FieldLabel>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Александра" style={INPUT_STYLE} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Фамилия</FieldLabel>
          <input value={surname} onChange={(e) => setSurname(e.target.value)} placeholder="Вертинская" style={INPUT_STYLE} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Стиль</FieldLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {STYLES.map((s) => (
              <div key={s} onClick={() => setStyle(style === s ? '' : s)} style={chipStyle(style === s)}>
                {s}
              </div>
            ))}
          </div>
        </div>
        <div style={{ marginBottom: 22 }}>
          <FieldLabel>Заметки</FieldLabel>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Идеи, пожелания, особенности..."
            style={{ ...INPUT_STYLE, resize: 'none', height: 100 }}
          />
        </div>
        <div
          className="inka-submit"
          onClick={() => canSubmit && onSave({ name, surname, style, note })}
          style={{ ...SUBMIT_STYLE, opacity: canSubmit ? 1 : 0.4, cursor: canSubmit ? 'pointer' : 'default' }}
        >
          <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 13, color: COLORS.gold, letterSpacing: '2px' }}>
            Сохранить
          </span>
        </div>
      </div>
    </BottomSheet>
  );
}

// ===================== NEW SESSION SHEET =====================
function NewSessionSheet({
  open,
  clientName,
  initial,
  onClose,
  onAdd,
}: {
  open: boolean;
  clientName: string;
  initial?: Session | null;
  onClose: () => void;
  onAdd: (data: {
    name: string;
    date: string;
    duration: string;
    style: string;
    area: string;
    colors: string;
    needles: string;
    skinReaction: string;
    note: string;
    photos: string[];
  }) => void;
}) {
  const isEdit = !!initial;
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [duration, setDuration] = useState('');
  const [style, setStyle] = useState('');
  const [area, setArea] = useState('');
  const [colors, setColors] = useState('');
  const [needles, setNeedles] = useState('');
  const [skinReaction, setSkinReaction] = useState('');
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      // Prefill from the session being edited, or start blank for a new one.
      setName(initial?.name ?? '');
      setDate(initial?.date ?? '');
      setDuration(initial?.duration ?? '');
      setStyle(initial?.style ?? '');
      setArea(initial?.area ?? '');
      setColors(initial?.colors ?? '');
      setNeedles(initial?.needles ?? '');
      setSkinReaction(initial?.skinReaction ?? '');
      setNote(initial?.note ?? '');
      setPhotos(initial?.photos ?? []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const chipStyle = (selected: boolean, big: boolean): React.CSSProperties => ({
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: big ? 13 : 12,
    padding: big ? '7px 13px' : '6px 11px',
    borderRadius: 2,
    cursor: 'pointer',
    border: selected ? '1px solid rgba(var(--gold-rgb),0.65)' : '1px solid rgba(var(--gold-rgb),0.15)',
    color: selected ? COLORS.gold : COLORS.textFaint,
    background: selected ? 'rgba(var(--gold-rgb),0.08)' : 'transparent',
    letterSpacing: big ? undefined : '0.8px',
    textTransform: big ? undefined : 'uppercase',
    whiteSpace: 'nowrap',
    transition: 'all 0.2s',
  });

  return (
    <BottomSheet open={open} heightPct={80}>
      <div style={{ padding: '16px 24px 14px', position: 'relative' }}>
        <SheetCloseButton onClose={onClose} />
        <div style={{ fontSize: 15, color: COLORS.textMuted, fontStyle: 'italic', marginBottom: 3, letterSpacing: '0.3px' }}>{clientName}</div>
        <div style={{ fontSize: 22, color: COLORS.textPrimary, fontWeight: 300, letterSpacing: '1px' }}>
          {isEdit ? 'Редактировать сессию' : 'Новая сессия'}
        </div>
        <SheetStarDivider />
      </div>

      <div style={{ padding: '4px 24px 50px' }}>
        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Название сессии</FieldLabel>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Первая, контур..." style={INPUT_STYLE} />
        </div>

        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Дата</FieldLabel>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={INPUT_STYLE} />
        </div>

        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Продолжительность</FieldLabel>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {DURATIONS.map((d) => (
              <div key={d} onClick={() => setDuration(d)} style={chipStyle(duration === d, true)}>
                {d}
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Стиль работы</FieldLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {STYLES.map((s) => (
              <div key={s} onClick={() => setStyle(s)} style={chipStyle(style === s, false)}>
                {s}
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Зона работы</FieldLabel>
          <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Левое плечо, рёбра..." style={INPUT_STYLE} />
        </div>

        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Краски / чернила</FieldLabel>
          <input value={colors} onChange={(e) => setColors(e.target.value)} placeholder="Чёрный, серые тона..." style={INPUT_STYLE} />
        </div>

        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Иглы</FieldLabel>
          <input value={needles} onChange={(e) => setNeedles(e.target.value)} placeholder="Конфигурация игл..." style={INPUT_STYLE} />
        </div>

        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Реакция кожи</FieldLabel>
          <input
            value={skinReaction}
            onChange={(e) => setSkinReaction(e.target.value)}
            placeholder="Покраснение, отёк, спокойно..."
            style={INPUT_STYLE}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Заметки</FieldLabel>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Что делали, наблюдения..."
            style={{ ...INPUT_STYLE, resize: 'none', height: 80 }}
          />
        </div>

        {/* Photos: upload (native picker offers "Take Photo" on mobile) */}
        <div style={{ marginBottom: 22 }}>
          <FieldLabel>Фото</FieldLabel>
          <SessionPhotos photos={photos} onChange={setPhotos} />
        </div>

        <div
          className="inka-submit"
          onClick={() => onAdd({ name, date, duration, style, area, colors, needles, skinReaction, note, photos })}
          style={SUBMIT_STYLE}
        >
          <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 13, color: COLORS.gold, letterSpacing: '2px' }}>
            {isEdit ? 'Сохранить' : 'Добавить сессию'}
          </span>
        </div>
      </div>
    </BottomSheet>
  );
}
