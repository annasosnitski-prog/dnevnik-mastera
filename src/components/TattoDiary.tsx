import { useState, useEffect, useRef } from 'react';

// ===================== DESIGN TOKENS =====================
const COLORS = {
  bg: '#0D0B08',
  card: 'linear-gradient(148deg, #191510, #0D0B09)',
  sheet: '#0F0D0A',
  gold: '#C8943A',
  textPrimary: '#EDE4CC',
  textSecondary: '#9A8E7A',
  textMuted: '#6A6056',
  textFaint: '#5A5248',
  textGhost: '#3E3830',
  textTrace: '#2A2825',
};

// Per-client accent colours, assigned on creation (rotated through the list).
const ACCENT_COLORS = ['#4A7A5A', '#8A3040', '#6B7A4A', '#3A5A7A', '#7A4A6A', '#7A6A3A', '#3A6A7A'];

const DURATIONS = ['2 ч', '3 ч', '4 ч', '5 ч', '6 ч'];
const STYLES = ['Реализм', 'Графика', 'Орнамент', 'Японский', 'Акварель', 'Другой'];

// ===================== DATA TYPES =====================
interface Session {
  id: string;
  date: string; // free text, e.g. "15 фев 2025"
  duration: string; // e.g. "4 ч"
  style: string; // work style for this session
  area: string; // work zone, e.g. "Левое плечо"
  note: string;
  photoUrl?: string; // optional captured/uploaded photo (data URL)
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
  chatLinks: ChatLink[]; // WhatsApp / Telegram / Instagram / etc.
  sessions: Session[];
  documents: ClientDocument[];
  createdDate: string;
}

// ===================== DERIVED HELPERS =====================
const firstLetter = (name: string) => (name ? name.charAt(0).toUpperCase() : '?');
const nameRest = (name: string) => (name ? name.slice(1) : '');
const lastSessionDate = (c: Client) => (c.sessions.length ? c.sessions[c.sessions.length - 1].date : '—');

// Normalises a raw IndexedDB record (which may predate this schema) into a
// complete Client so the UI never has to guard against missing fields.
function normalizeClient(raw: any, index: number): Client {
  const sessions: Session[] = Array.isArray(raw?.sessions)
    ? raw.sessions.map((s: any, i: number) => ({
        id: String(s?.id ?? `${Date.now()}-${i}`),
        date: s?.date ?? '',
        duration: s?.duration ?? '',
        style: s?.style ?? '',
        area: s?.area ?? s?.proportions ?? '',
        note: s?.note ?? s?.notes ?? '',
        photoUrl: s?.photoUrl,
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
    note: raw?.note ?? raw?.skinNotes ?? raw?.chatHistory ?? '',
    phone: raw?.phone ?? '',
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
function MaskSVG({ width, height, withSmile = false }: { width: number; height: number; withSmile?: boolean }) {
  return (
    <svg viewBox="0 0 200 140" xmlns="http://www.w3.org/2000/svg" width={width} height={height}>
      <path
        d="M100,14 L128,20 L156,34 L170,54 L165,74 L152,86 L138,94 L122,98 L114,112 L100,120 L86,112 L78,98 L62,94 L48,86 L35,74 L30,54 L44,34 L72,20 Z"
        stroke={COLORS.gold}
        strokeWidth="4"
        fill="none"
        strokeLinejoin="round"
      />
      <path d="M56,56 Q70,44 84,56 Q70,68 56,56 Z" stroke={COLORS.gold} strokeWidth="3" fill={COLORS.gold} fillOpacity="0.4" />
      <path d="M116,56 Q130,44 144,56 Q130,68 116,56 Z" stroke={COLORS.gold} strokeWidth="3" fill={COLORS.gold} fillOpacity="0.4" />
      <line x1="100" y1="14" x2="100" y2="4" stroke={COLORS.gold} strokeWidth="3" strokeLinecap="round" />
      <circle cx="100" cy="2" r="4" fill={COLORS.gold} />
      <path d="M100,8 Q88,5 79,9" stroke={COLORS.gold} strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <path d="M100,8 Q112,5 121,9" stroke={COLORS.gold} strokeWidth="2.5" fill="none" strokeLinecap="round" />
      {withSmile && <path d="M88,112 Q100,122 112,112" stroke={COLORS.gold} strokeWidth="2" fill="none" />}
    </svg>
  );
}

function StarDivider({ marginTop = 11 }: { marginTop?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop }}>
      <div style={{ flex: 1, height: 1, background: 'linear-gradient(to right, rgba(200,148,58,0.55), transparent)' }} />
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path
          d="M7 1L8.2 5.3H13L9.4 7.7L10.6 12L7 9.6L3.4 12L4.6 7.7L1 5.3H5.8Z"
          stroke={COLORS.gold}
          strokeWidth="0.8"
          fill="rgba(200,148,58,0.18)"
          strokeLinejoin="round"
        />
      </svg>
      <div style={{ flex: 1, height: 1, background: 'linear-gradient(to left, rgba(200,148,58,0.55), transparent)' }} />
    </div>
  );
}

function SheetStarDivider() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 11 }}>
      <div style={{ flex: 1, height: 1, background: 'linear-gradient(to right, rgba(200,148,58,0.5), transparent)' }} />
      <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
        <path d="M4.5 0.5L5.2 3.5H8.5L5.9 5.2L6.6 8.5L4.5 6.8L2.4 8.5L3.1 5.2L0.5 3.5H3.8Z" fill="rgba(200,148,58,0.3)" />
      </svg>
      <div style={{ flex: 1, height: 1, background: 'linear-gradient(to left, rgba(200,148,58,0.5), transparent)' }} />
    </div>
  );
}

// Form field label — 8.5px uppercase, wide tracking.
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: '8.5px',
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
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(200,148,58,0.18)',
  borderRadius: 2,
  padding: '10px 14px',
  fontFamily: "'Cormorant Garamond', serif",
  color: COLORS.textPrimary,
  outline: 'none',
  letterSpacing: '0.3px',
};

const SUBMIT_STYLE: React.CSSProperties = {
  border: '1px solid rgba(200,148,58,0.35)',
  borderRadius: 2,
  padding: 14,
  textAlign: 'center',
  cursor: 'pointer',
  background: 'rgba(200,148,58,0.05)',
};

// ===================== MAIN APP =====================
export default function TattoDiary() {
  const [clients, setClients] = useState<Client[]>([]);
  const [db, setDb] = useState<IDBDatabase | null>(null);
  const [dbError, setDbError] = useState<string | null>(null);

  const [screen, setScreen] = useState<'list' | 'detail'>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'info' | 'sessions' | 'documents'>('info');
  const [searchQuery, setSearchQuery] = useState('');

  const [showNewClientForm, setShowNewClientForm] = useState(false);
  const [showNewSessionForm, setShowNewSessionForm] = useState(false);

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
  const closeNewSession = () => setShowNewSessionForm(false);
  const closeBackdrop = () => {
    setShowNewClientForm(false);
    setShowNewSessionForm(false);
  };

  const handleCreateClient = (data: { name: string; surname: string; phone: string; note: string }) => {
    const client: Client = {
      id: Date.now().toString(),
      name: data.name.trim(),
      surname: data.surname.trim(),
      style: '',
      color: ACCENT_COLORS[clients.length % ACCENT_COLORS.length],
      note: data.note.trim(),
      phone: data.phone.trim(),
      chatLinks: [],
      sessions: [],
      documents: [],
      createdDate: new Date().toISOString(),
    };
    saveClient(client);
    setShowNewClientForm(false);
  };

  const handleAddSession = (data: {
    date: string;
    duration: string;
    style: string;
    area: string;
    note: string;
    photoUrl?: string;
  }) => {
    if (!selectedClient) return;
    const session: Session = {
      id: Date.now().toString(),
      date: data.date.trim() || new Date().toLocaleDateString('ru-RU'),
      duration: data.duration,
      style: data.style,
      area: data.area.trim(),
      note: data.note.trim(),
      photoUrl: data.photoUrl,
      done: true,
    };
    const updated: Client = {
      ...selectedClient,
      style: data.style || selectedClient.style,
      sessions: [...selectedClient.sessions, session],
    };
    saveClient(updated);
    setShowNewSessionForm(false);
  };

  const sheetOpen = showNewClientForm || showNewSessionForm;

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
            backgroundImage: 'radial-gradient(circle, rgba(200,148,58,0.035) 1px, transparent 1px)',
            backgroundSize: '22px 22px',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />

        {/* Safe-area / status spacer */}
        <div style={{ height: 'calc(env(safe-area-inset-top) + 18px)', flexShrink: 0 }} />

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
              fontSize: 11,
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
              background: 'rgba(255,255,255,0.022)',
              border: '1px solid rgba(200,148,58,0.11)',
              borderRadius: 3,
              padding: '8px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 9,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ flexShrink: 0 }}>
              <circle cx="5.5" cy="5.5" r="4" stroke="#2E2B28" strokeWidth="1.2" />
              <line x1="8.7" y1="8.7" x2="12" y2="12" stroke="#2E2B28" strokeWidth="1.2" strokeLinecap="round" />
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
            <span style={{ flex: 1, fontSize: 13, color: '#C99', fontStyle: 'italic' }}>{dbError}</span>
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
            padding: '2px 16px 110px',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 10,
            position: 'relative',
            zIndex: 5,
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
              height: 210,
              border: '1px dashed rgba(200,148,58,0.17)',
              borderRadius: 3,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 11,
              cursor: 'pointer',
              background: 'rgba(200,148,58,0.008)',
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                border: '1px solid rgba(200,148,58,0.22)',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <line x1="7" y1="2" x2="7" y2="12" stroke="rgba(200,148,58,0.45)" strokeWidth="1.2" strokeLinecap="round" />
                <line x1="2" y1="7" x2="12" y2="7" stroke="rgba(200,148,58,0.45)" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </div>
            <span
              style={{
                fontSize: '9.5px',
                color: 'rgba(200,148,58,0.32)',
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
              fontSize: 14,
              fontStyle: 'italic',
              color: COLORS.textGhost,
              pointerEvents: 'none',
            }}
          >
            Ничего не найдено
          </div>
        )}

        {/* Bottom navigation */}
        <BottomNav />
      </div>

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
            onAddSession={() => setShowNewSessionForm(true)}
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

      {/* ═══════════ NEW SESSION SHEET ═══════════ */}
      <NewSessionSheet
        open={showNewSessionForm}
        clientName={selectedClient?.name || ''}
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
        border: '1px solid rgba(200,148,58,0.2)',
        borderRadius: 3,
        height: 210,
        overflow: 'hidden',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Top accent stripe */}
      <div style={{ height: 2, background: client.color, flexShrink: 0 }} />

      {/* Corner triangle accent */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: 0,
          height: 0,
          borderStyle: 'solid',
          borderWidth: '0 26px 26px 0',
          borderColor: 'transparent rgba(200,148,58,0.13) transparent transparent',
          zIndex: 1,
          pointerEvents: 'none',
        }}
      />

      {/* Mask watermark */}
      <div
        style={{
          position: 'absolute',
          right: -10,
          bottom: -8,
          opacity: 0.042,
          color: COLORS.gold,
          pointerEvents: 'none',
          animation: 'goldGlow 5s ease-in-out infinite',
        }}
      >
        <MaskSVG width={88} height={62} />
      </div>

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
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 5, flex: 1, minHeight: 0 }}>
          <span
            style={{
              fontFamily: "'Cinzel Decorative', serif",
              fontSize: 52,
              lineHeight: 0.79,
              color: COLORS.gold,
              letterSpacing: '-2px',
              flexShrink: 0,
              marginTop: -1,
            }}
          >
            {firstLetter(client.name)}
          </span>
          <div style={{ paddingTop: 7, minWidth: 0, overflow: 'hidden' }}>
            <div
              style={{
                fontSize: 13,
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
                fontSize: 10,
                color: '#5E5448',
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
        <div style={{ height: 1, background: 'linear-gradient(to right, rgba(200,148,58,0.42), transparent)', margin: '7px 0' }} />

        {/* Style tag + session count */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 6 }}>
          {client.style ? (
            <span
              style={{
                fontSize: 9,
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
            <span style={{ fontSize: 9, color: COLORS.textGhost, fontStyle: 'italic', letterSpacing: '0.5px' }}>—</span>
          )}
          <span style={{ fontSize: 10, color: COLORS.textGhost, flexShrink: 0 }}>{client.sessions.length} сес.</span>
        </div>

        {/* Date */}
        <div style={{ fontSize: 9, color: COLORS.textTrace, letterSpacing: '0.4px' }}>{lastSessionDate(client)}</div>
      </div>
    </div>
  );
}

// ===================== BOTTOM NAV =====================
function BottomNav() {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 'calc(84px + env(safe-area-inset-bottom))',
        background: 'linear-gradient(to top, rgba(13,11,8,0.97) 75%, transparent)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        borderTop: '1px solid rgba(200,148,58,0.07)',
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'center',
        paddingBottom: 'calc(20px + env(safe-area-inset-bottom))',
        zIndex: 50,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M3 9.5L10 3L17 9.5V17H13V12.5H7V17H3V9.5Z" stroke={COLORS.gold} strokeWidth="1.3" strokeLinejoin="round" fill="rgba(200,148,58,0.07)" />
        </svg>
        <span style={{ fontSize: '8.5px', color: COLORS.gold, letterSpacing: '1px', textTransform: 'uppercase' }}>Клиенты</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, opacity: 0.28 }}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <rect x="2.5" y="12" width="3.5" height="5.5" rx="0.5" stroke={COLORS.textPrimary} strokeWidth="1.2" />
          <rect x="8.3" y="8" width="3.5" height="9.5" rx="0.5" stroke={COLORS.textPrimary} strokeWidth="1.2" />
          <rect x="14" y="4" width="3.5" height="13.5" rx="0.5" stroke={COLORS.textPrimary} strokeWidth="1.2" />
        </svg>
        <span style={{ fontSize: '8.5px', color: COLORS.textFaint, letterSpacing: '1px', textTransform: 'uppercase' }}>Сводка</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, opacity: 0.28 }}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="2.8" stroke={COLORS.textPrimary} strokeWidth="1.2" />
          <path
            d="M10 2.5L10 4.5M10 15.5L10 17.5M2.5 10L4.5 10M15.5 10L17.5 10M5.05 5.05L6.46 6.46M13.54 13.54L14.95 14.95M5.05 14.95L6.46 13.54M13.54 6.46L14.95 5.05"
            stroke={COLORS.textPrimary}
            strokeWidth="1.1"
            strokeLinecap="round"
          />
        </svg>
        <span style={{ fontSize: '8.5px', color: COLORS.textFaint, letterSpacing: '1px', textTransform: 'uppercase' }}>Настройки</span>
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
  onAddSession,
  onAddDocument,
  onRemoveDocument,
}: {
  client: Client;
  activeTab: 'info' | 'sessions' | 'documents';
  onTab: (t: 'info' | 'sessions' | 'documents') => void;
  onBack: () => void;
  onSave: (client: Client) => void;
  onAddSession: () => void;
  onAddDocument: (doc: ClientDocument) => void;
  onRemoveDocument: (docId: string) => void;
}) {
  const tabStyle = (tab: typeof activeTab): React.CSSProperties => ({
    flex: 1,
    textAlign: 'center',
    padding: '11px 0',
    fontSize: 11,
    letterSpacing: '1.5px',
    textTransform: 'uppercase',
    color: activeTab === tab ? COLORS.gold : '#2E2B28',
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
          background: 'linear-gradient(160deg, #131008 0%, #0D0B08 60%)',
          flexShrink: 0,
          paddingTop: 'env(safe-area-inset-top)',
        }}
      >
        {/* Large mask decoration */}
        <div
          style={{
            position: 'absolute',
            right: -28,
            top: 18,
            opacity: 0.068,
            color: COLORS.gold,
            pointerEvents: 'none',
            animation: 'goldGlow 4s ease-in-out infinite',
          }}
        >
          <MaskSVG width={220} height={155} withSmile />
        </div>

        {/* Status bar with back */}
        <div style={{ height: 56, padding: '18px 24px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 10 }}>
          <div className="inka-back" onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M11 4L6 9L11 14" stroke={COLORS.gold} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span style={{ fontSize: 13, color: COLORS.gold, fontStyle: 'italic', letterSpacing: '0.3px' }}>вернуться</span>
          </div>
        </div>

        {/* Giant drop cap hero */}
        <div style={{ padding: '12px 24px 18px', position: 'relative', zIndex: 5 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
            <span
              style={{
                fontFamily: "'Cinzel Decorative', serif",
                fontSize: 96,
                lineHeight: 0.79,
                color: COLORS.gold,
                letterSpacing: '-4px',
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
              <div style={{ fontSize: 13, color: COLORS.textMuted, fontStyle: 'italic', marginTop: 5, letterSpacing: '0.5px' }}>
                {client.surname}
              </div>
            </div>
          </div>
          {/* Style + session count */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 13 }}>
            <div style={{ width: 22, height: 2, background: client.color, borderRadius: 1, flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: '#8A7E72', letterSpacing: '2.5px', textTransform: 'uppercase' }}>
              {client.style || 'Без стиля'}
            </span>
            <span style={{ fontSize: 11, color: COLORS.textGhost }}>· {client.sessions.length} сессий</span>
          </div>
        </div>

        {/* Client color stripe */}
        <div style={{ height: 3, background: client.color, width: '100%', flexShrink: 0 }} />
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(200,148,58,0.1)', padding: '0 24px', background: COLORS.bg, flexShrink: 0 }}>
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
        {activeTab === 'info' && <InfoTab client={client} onSave={onSave} />}
        {activeTab === 'sessions' && <SessionsTab client={client} onAddSession={onAddSession} />}
        {activeTab === 'documents' && (
          <DocumentsTab client={client} onAddDocument={onAddDocument} onRemoveDocument={onRemoveDocument} />
        )}
      </div>
    </>
  );
}

// ── Info tab ──
function InfoTab({ client, onSave }: { client: Client; onSave: (client: Client) => void }) {
  const note = client.note || '';
  const metaCell = (span = false): React.CSSProperties => ({
    background: 'rgba(255,255,255,0.018)',
    border: '1px solid rgba(200,148,58,0.1)',
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
            fontFamily: "'Cinzel Decorative', serif",
            fontSize: 8,
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
                fontFamily: "'Cinzel Decorative', serif",
                fontSize: 50,
                lineHeight: 0.81,
                color: 'rgba(200,148,58,0.42)',
                float: 'left',
                marginRight: 7,
                paddingBottom: 2,
                marginTop: 1,
              }}
            >
              {note.charAt(0)}
            </span>
            <span style={{ fontSize: 14, color: '#8A7E72', lineHeight: 1.75, fontStyle: 'italic', display: 'block', overflow: 'hidden' }}>
              {note.slice(1)}
            </span>
          </div>
        ) : (
          <div style={{ fontSize: 14, color: COLORS.textGhost, fontStyle: 'italic' }}>Заметок пока нет.</div>
        )}
      </div>

      {/* Ornamental divider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18, clear: 'both' }}>
        <div style={{ flex: 1, height: 1, background: 'linear-gradient(to right, rgba(200,148,58,0.28), transparent)' }} />
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M5 1L5.8 4H9L6.5 5.8L7.3 9L5 7.2L2.7 9L3.5 5.8L1 4H4.2Z" fill="rgba(200,148,58,0.28)" />
        </svg>
        <div style={{ flex: 1, height: 1, background: 'linear-gradient(to left, rgba(200,148,58,0.28), transparent)' }} />
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

      {/* Contacts: phone + chat links */}
      <ContactsSection client={client} onSave={onSave} />
    </div>
  );
}

function MetaLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: '8.5px', color: COLORS.textGhost, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 6 }}>
      {children}
    </div>
  );
}
function MetaValue({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 15, color: COLORS.textPrimary, fontWeight: 300 }}>{children}</div>;
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
        <div style={{ flex: 1, height: 1, background: 'linear-gradient(to right, rgba(200,148,58,0.28), transparent)' }} />
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M5 1L5.8 4H9L6.5 5.8L7.3 9L5 7.2L2.7 9L3.5 5.8L1 4H4.2Z" fill="rgba(200,148,58,0.28)" />
        </svg>
        <div style={{ flex: 1, height: 1, background: 'linear-gradient(to left, rgba(200,148,58,0.28), transparent)' }} />
      </div>

      <div
        style={{
          fontFamily: "'Cinzel Decorative', serif",
          fontSize: 8,
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
          background: 'rgba(255,255,255,0.018)',
          border: '1px solid rgba(200,148,58,0.1)',
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
            stroke={COLORS.gold}
            strokeWidth="1.2"
            fill="rgba(200,148,58,0.06)"
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
              style={{ fontSize: 11, color: COLORS.textFaint, fontStyle: 'italic', cursor: 'pointer' }}
            >
              изменить
            </span>
          </>
        ) : (
          <span
            onClick={() => setEditingPhone(true)}
            style={{ flex: 1, fontSize: 14, color: COLORS.textGhost, fontStyle: 'italic', cursor: 'pointer' }}
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
            background: 'rgba(255,255,255,0.018)',
            border: '1px solid rgba(200,148,58,0.1)',
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
            <span style={{ fontSize: 13, color: COLORS.gold, letterSpacing: '0.5px' }}>{PLATFORM_LABELS[link.platform]}</span>
            <span
              style={{
                fontSize: 11,
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
            style={{ background: 'none', border: 'none', color: COLORS.textFaint, cursor: 'pointer', flexShrink: 0, fontSize: 14 }}
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
          border: '1px dashed rgba(200,148,58,0.18)',
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
          <line x1="5.5" y1="1.5" x2="5.5" y2="9.5" stroke="rgba(200,148,58,0.48)" strokeWidth="1.2" strokeLinecap="round" />
          <line x1="1.5" y1="5.5" x2="9.5" y2="5.5" stroke="rgba(200,148,58,0.48)" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
        <span style={{ fontSize: 11, color: 'rgba(200,148,58,0.5)', letterSpacing: '1px', textTransform: 'uppercase', fontStyle: 'italic' }}>
          Добавить ссылку
        </span>
      </div>
    );
  }

  const selectStyle: React.CSSProperties = {
    width: '100%',
    background: COLORS.bg,
    border: '1px solid rgba(200,148,58,0.18)',
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
        border: '1px solid rgba(200,148,58,0.18)',
        borderRadius: 2,
        padding: 13,
        background: 'rgba(255,255,255,0.018)',
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
            border: '1px solid rgba(200,148,58,0.15)',
            color: COLORS.textFaint,
            fontSize: 11,
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
            border: '1px solid rgba(200,148,58,0.35)',
            background: 'rgba(200,148,58,0.05)',
            color: COLORS.gold,
            fontSize: 11,
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

// ── Sessions tab ──
function SessionsTab({ client, onAddSession }: { client: Client; onAddSession: () => void }) {
  return (
    <div style={{ animation: 'fadeSlideIn 0.3s ease' }}>
      <div
        style={{
          fontFamily: "'Cinzel Decorative', serif",
          fontSize: 8,
          color: COLORS.textGhost,
          letterSpacing: '3.5px',
          textTransform: 'uppercase',
          marginBottom: 18,
        }}
      >
        История работы
      </div>

      {client.sessions.length === 0 && (
        <div style={{ fontSize: 13, color: COLORS.textGhost, fontStyle: 'italic', marginBottom: 14 }}>Сессий пока нет.</div>
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
                border: session.done ? 'none' : '1px solid rgba(200,148,58,0.25)',
              }}
            />
            <div style={{ width: 1, flex: 1, background: 'rgba(200,148,58,0.08)', marginTop: 5 }} />
          </div>
          <div
            style={{
              flex: 1,
              background: 'rgba(255,255,255,0.018)',
              border: '1px solid rgba(200,148,58,0.1)',
              borderRadius: 2,
              padding: '12px 14px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
              <span style={{ fontSize: 13, color: '#D4C8B8', fontWeight: 500, letterSpacing: '0.3px' }}>{session.date}</span>
              {session.duration && <span style={{ fontSize: 11, color: COLORS.textGhost, fontStyle: 'italic' }}>{session.duration}</span>}
            </div>
            {session.area && (
              <div style={{ fontSize: 10, color: COLORS.textFaint, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 7 }}>
                {session.area}
              </div>
            )}
            {session.note && <div style={{ fontSize: 12, color: '#4A4238', fontStyle: 'italic', lineHeight: 1.6 }}>{session.note}</div>}
            {session.photoUrl && (
              <a href={session.photoUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'block', marginTop: 10 }}>
                <img
                  src={session.photoUrl}
                  alt=""
                  style={{
                    width: '100%',
                    maxHeight: 180,
                    objectFit: 'cover',
                    borderRadius: 2,
                    border: '1px solid rgba(200,148,58,0.15)',
                    display: 'block',
                  }}
                />
              </a>
            )}
          </div>
        </div>
      ))}

      {/* Add session button */}
      <div
        className="inka-dashed"
        onClick={onAddSession}
        style={{
          marginTop: 14,
          border: '1px dashed rgba(200,148,58,0.18)',
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
          <line x1="5.5" y1="1.5" x2="5.5" y2="9.5" stroke="rgba(200,148,58,0.48)" strokeWidth="1.2" strokeLinecap="round" />
          <line x1="1.5" y1="5.5" x2="9.5" y2="5.5" stroke="rgba(200,148,58,0.48)" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
        <span style={{ fontSize: 11, color: 'rgba(200,148,58,0.5)', letterSpacing: '1px', textTransform: 'uppercase', fontStyle: 'italic' }}>
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
        <>
          <div style={{ opacity: 0.13, color: COLORS.gold, animation: 'goldGlow 3s ease-in-out infinite' }}>
            <MaskSVG width={80} height={56} />
          </div>
          <div style={{ fontSize: 13, color: COLORS.textGhost, fontStyle: 'italic', textAlign: 'center', letterSpacing: '0.2px' }}>
            Документы не добавлены
          </div>
        </>
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
                border: '1px solid rgba(200,148,58,0.12)',
                borderRadius: 2,
                padding: '11px 14px',
                background: 'rgba(255,255,255,0.018)',
              }}
            >
              <span style={{ fontSize: 11, color: COLORS.gold }}>{doc.kind === 'photo' ? '◈' : '▤'}</span>
              <a
                href={doc.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ flex: 1, minWidth: 0, textDecoration: 'none' }}
              >
                <div style={{ fontSize: 13, color: COLORS.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {doc.name}
                </div>
                <div style={{ fontSize: 9, color: COLORS.textGhost, letterSpacing: '0.4px', marginTop: 2 }}>{doc.uploadedDate}</div>
              </a>
              <button
                onClick={() => onRemoveDocument(doc.id)}
                style={{ background: 'none', border: 'none', color: COLORS.textFaint, cursor: 'pointer', flexShrink: 0, fontSize: 14 }}
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
            border: '1px solid rgba(200,148,58,0.32)',
            borderRadius: 2,
            padding: '13px 18px',
            cursor: 'pointer',
            background: 'rgba(200,148,58,0.05)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="2" y="1" width="10" height="13" rx="1.5" stroke={COLORS.gold} strokeWidth="1.2" />
            <line x1="5" y1="5.5" x2="9" y2="5.5" stroke={COLORS.gold} strokeWidth="1" strokeLinecap="round" />
            <line x1="5" y1="8" x2="9" y2="8" stroke={COLORS.gold} strokeWidth="1" strokeLinecap="round" />
            <line x1="5" y1="10.5" x2="7" y2="10.5" stroke={COLORS.gold} strokeWidth="1" strokeLinecap="round" />
            <circle cx="13" cy="13" r="3" fill={COLORS.sheet} stroke={COLORS.gold} strokeWidth="1" />
            <line x1="13" y1="11.5" x2="13" y2="14.5" stroke={COLORS.gold} strokeWidth="1" strokeLinecap="round" />
            <line x1="11.5" y1="13" x2="14.5" y2="13" stroke={COLORS.gold} strokeWidth="1" strokeLinecap="round" />
          </svg>
          <span style={{ fontSize: 13, color: COLORS.gold, letterSpacing: '1px', textTransform: 'uppercase' }}>Добавить документ</span>
        </div>

        {/* Add photo */}
        <div
          className="inka-doc-secondary"
          onClick={() => photoInput.current?.click()}
          style={{
            border: '1px solid rgba(200,148,58,0.18)',
            borderRadius: 2,
            padding: '13px 18px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6" stroke={COLORS.textFaint} strokeWidth="1.2" />
            <rect x="5.5" y="5.5" width="5" height="4" rx="0.5" stroke={COLORS.textFaint} strokeWidth="1" />
            <line x1="5.5" y1="11" x2="10.5" y2="11" stroke={COLORS.textFaint} strokeWidth="1" strokeLinecap="round" />
          </svg>
          <span style={{ fontSize: 13, color: COLORS.textFaint, letterSpacing: '1px', textTransform: 'uppercase', fontStyle: 'italic' }}>
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
        border: '1px solid rgba(200,148,58,0.18)',
        borderBottom: 'none',
        zIndex: 15,
        overflowY: 'auto',
        transform: open ? 'translateY(0)' : 'translateY(105%)',
        transition: 'transform 0.42s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
      }}
    >
      <div style={{ width: 36, height: 3, background: 'rgba(200,148,58,0.2)', borderRadius: 2, margin: '14px auto 0' }} />
      {children}
    </div>
  );
}

function SheetCloseButton({ onClose }: { onClose: () => void }) {
  return (
    <div className="inka-close" onClick={onClose} style={{ position: 'absolute', top: 18, right: 24, cursor: 'pointer', opacity: 0.4 }}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <line x1="3" y1="3" x2="13" y2="13" stroke={COLORS.gold} strokeWidth="1.5" strokeLinecap="round" />
        <line x1="13" y1="3" x2="3" y2="13" stroke={COLORS.gold} strokeWidth="1.5" strokeLinecap="round" />
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
  onCreate: (data: { name: string; surname: string; phone: string; note: string }) => void;
}) {
  const [name, setName] = useState('');
  const [surname, setSurname] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');

  // Reset fields whenever the sheet is closed.
  useEffect(() => {
    if (!open) {
      setName('');
      setSurname('');
      setPhone('');
      setNote('');
    }
  }, [open]);

  const canSubmit = name.trim().length > 0;

  return (
    <BottomSheet open={open} heightPct={88}>
      <div style={{ padding: '16px 24px 14px', position: 'relative' }}>
        <SheetCloseButton onClose={onClose} />
        <div style={{ fontFamily: "'Cinzel Decorative', serif", fontSize: 9, color: COLORS.textGhost, letterSpacing: '3px', textTransform: 'uppercase', marginBottom: 5 }}>
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
          onClick={() => canSubmit && onCreate({ name, surname, phone, note })}
          style={{ ...SUBMIT_STYLE, opacity: canSubmit ? 1 : 0.4, cursor: canSubmit ? 'pointer' : 'default' }}
        >
          <span style={{ fontFamily: "'Cinzel Decorative', serif", fontSize: 11, color: COLORS.gold, letterSpacing: '2px' }}>
            Создать клиента
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
  onClose,
  onAdd,
}: {
  open: boolean;
  clientName: string;
  onClose: () => void;
  onAdd: (data: { date: string; duration: string; style: string; area: string; note: string; photoUrl?: string }) => void;
}) {
  const [date, setDate] = useState('');
  const [duration, setDuration] = useState('');
  const [style, setStyle] = useState('');
  const [area, setArea] = useState('');
  const [note, setNote] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const stopCamera = () => {
    const stream = videoRef.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((t) => t.stop());
    setCameraActive(false);
  };

  useEffect(() => {
    if (!open) {
      setDate('');
      setDuration('');
      setStyle('');
      setArea('');
      setNote('');
      setPhotoUrl('');
      stopCamera();
    }
    // Stop the camera if the sheet closes while it's running.
    return () => {
      if (!open) stopCamera();
    };
  }, [open]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setCameraActive(true);
      }
    } catch (err) {
      console.error('Camera error:', err);
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0);
    setPhotoUrl(canvas.toDataURL('image/jpeg', 0.85));
    stopCamera();
  };

  const onPickPhoto = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhotoUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

  const chipStyle = (selected: boolean, big: boolean): React.CSSProperties => ({
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: big ? 12 : 10,
    padding: big ? '7px 13px' : '6px 11px',
    borderRadius: 2,
    cursor: 'pointer',
    border: selected ? '1px solid rgba(200,148,58,0.65)' : '1px solid rgba(200,148,58,0.15)',
    color: selected ? COLORS.gold : COLORS.textFaint,
    background: selected ? 'rgba(200,148,58,0.08)' : 'transparent',
    letterSpacing: big ? undefined : '0.8px',
    textTransform: big ? undefined : 'uppercase',
    whiteSpace: 'nowrap',
    transition: 'all 0.2s',
  });

  return (
    <BottomSheet open={open} heightPct={80}>
      <div style={{ padding: '16px 24px 14px', position: 'relative' }}>
        <SheetCloseButton onClose={onClose} />
        <div style={{ fontSize: 13, color: COLORS.textMuted, fontStyle: 'italic', marginBottom: 3, letterSpacing: '0.3px' }}>{clientName}</div>
        <div style={{ fontSize: 22, color: COLORS.textPrimary, fontWeight: 300, letterSpacing: '1px' }}>Новая сессия</div>
        <SheetStarDivider />
      </div>

      <div style={{ padding: '4px 24px 50px' }}>
        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Дата</FieldLabel>
          <input value={date} onChange={(e) => setDate(e.target.value)} placeholder="15 фев 2025" style={INPUT_STYLE} />
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
          <FieldLabel>Заметки</FieldLabel>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Что делали, наблюдения..."
            style={{ ...INPUT_STYLE, resize: 'none', height: 80 }}
          />
        </div>

        {/* Photo: camera capture or upload */}
        <div style={{ marginBottom: 22 }}>
          <FieldLabel>Фото</FieldLabel>
          {cameraActive ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{ width: '100%', maxHeight: 200, borderRadius: 2, border: '1px solid rgba(200,148,58,0.18)', background: '#000' }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <div className="inka-submit" onClick={capturePhoto} style={{ ...SUBMIT_STYLE, flex: 1, padding: 11 }}>
                  <span style={{ fontFamily: "'Cinzel Decorative', serif", fontSize: 10, color: COLORS.gold, letterSpacing: '1.5px' }}>Снять</span>
                </div>
                <div
                  onClick={stopCamera}
                  style={{
                    flex: 1,
                    textAlign: 'center',
                    padding: 11,
                    borderRadius: 2,
                    border: '1px solid rgba(200,148,58,0.15)',
                    color: COLORS.textFaint,
                    fontSize: 10,
                    letterSpacing: '1.5px',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                  }}
                >
                  Отмена
                </div>
              </div>
            </div>
          ) : photoUrl ? (
            <div style={{ position: 'relative' }}>
              <img
                src={photoUrl}
                alt=""
                style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 2, border: '1px solid rgba(200,148,58,0.18)', display: 'block' }}
              />
              <div
                onClick={() => setPhotoUrl('')}
                style={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  background: 'rgba(13,11,8,0.85)',
                  border: '1px solid rgba(200,148,58,0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <line x1="3" y1="3" x2="13" y2="13" stroke={COLORS.gold} strokeWidth="1.5" strokeLinecap="round" />
                  <line x1="13" y1="3" x2="3" y2="13" stroke={COLORS.gold} strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <div
                className="inka-doc-secondary"
                onClick={startCamera}
                style={{
                  flex: 1,
                  border: '1px solid rgba(200,148,58,0.18)',
                  borderRadius: 2,
                  padding: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  cursor: 'pointer',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <rect x="1.5" y="4.5" width="13" height="9" rx="1.5" stroke={COLORS.gold} strokeWidth="1.2" />
                  <circle cx="8" cy="9" r="2.5" stroke={COLORS.gold} strokeWidth="1.2" />
                  <path d="M5.5 4.5L6.3 3H9.7L10.5 4.5" stroke={COLORS.gold} strokeWidth="1.2" strokeLinejoin="round" />
                </svg>
                <span style={{ fontSize: 12, color: COLORS.gold, letterSpacing: '1px', textTransform: 'uppercase' }}>Камера</span>
              </div>
              <div
                className="inka-doc-secondary"
                onClick={() => photoInputRef.current?.click()}
                style={{
                  flex: 1,
                  border: '1px solid rgba(200,148,58,0.18)',
                  borderRadius: 2,
                  padding: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  cursor: 'pointer',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M8 10.5V2.5M8 2.5L5 5.5M8 2.5L11 5.5" stroke={COLORS.gold} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M2.5 10V12.5C2.5 13 2.9 13.5 3.5 13.5H12.5C13 13.5 13.5 13 13.5 12.5V10" stroke={COLORS.gold} strokeWidth="1.2" strokeLinecap="round" />
                </svg>
                <span style={{ fontSize: 12, color: COLORS.gold, letterSpacing: '1px', textTransform: 'uppercase' }}>Загрузить</span>
              </div>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  onPickPhoto(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </div>
          )}
        </div>

        <div
          className="inka-submit"
          onClick={() => onAdd({ date, duration, style, area, note, photoUrl: photoUrl || undefined })}
          style={SUBMIT_STYLE}
        >
          <span style={{ fontFamily: "'Cinzel Decorative', serif", fontSize: 11, color: COLORS.gold, letterSpacing: '2px' }}>
            Добавить сессию
          </span>
        </div>
      </div>
    </BottomSheet>
  );
}
