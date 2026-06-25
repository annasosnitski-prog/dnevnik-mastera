import { useState, useEffect, useRef } from 'react';
import { ChevronRight, Plus, Search, Upload, Camera, X, Eye, MessageCircle, ExternalLink, Sun, Moon } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { getRandomMask, getRandomVitrage, getRandomCastle, getTexturePath } from '../constants/assets';

// ===================== DATA TYPES =====================
interface TattooSession {
  id: string;
  clientId: string;
  date: string;
  photoUrl?: string;
  colors: string[];
  proportions: string;
  needles: string;
  duration: string;
  notes: string;
  skinReaction?: string;
}

interface Document {
  id: string;
  clientId: string;
  type: 'contract' | 'healthForm' | 'receipt' | 'other';
  name: string;
  fileUrl?: string;
  uploadedDate: string;
}

type ChatPlatform = 'whatsapp' | 'telegram' | 'messenger' | 'instagram' | 'tiktok' | 'other';

interface ChatLink {
  id: string;
  platform: ChatPlatform;
  url: string;
}

const PLATFORM_LABELS: Record<ChatPlatform, string> = {
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  messenger: 'Messenger',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  other: 'Other',
};

function buildChatLink(platform: ChatPlatform, raw: string): string {
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (platform === 'whatsapp') {
    const digits = trimmed.replace(/[^\d]/g, '');
    return digits ? `https://wa.me/${digits}` : trimmed;
  }
  if (platform === 'telegram') {
    const handle = trimmed.replace(/^@/, '');
    return handle ? `https://t.me/${handle}` : trimmed;
  }
  if (platform === 'instagram') {
    const handle = trimmed.replace(/^@/, '');
    return handle ? `https://ig.me/m/${handle}` : trimmed;
  }
  if (platform === 'messenger') {
    const handle = trimmed.replace(/^@/, '');
    return handle ? `https://m.me/${handle}` : trimmed;
  }
  return trimmed;
}

interface Client {
  id: string;
  name: string;
  phone: string;
  skinType: string;
  skinNotes: string;
  chatHistory: string;
  chatLinks: ChatLink[];
  sessions: TattooSession[];
  documents: Document[];
  createdDate: string;
}

// ===================== DATABASE =====================
const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
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
};

// ===================== INSPIRATIONAL QUOTES =====================
const QUOTES = [
  "Ink is the dust of thought, traced into skin.",
  "Every needle tells a story.",
  "The skin remembers what the mind forgets.",
  "Art lives where the needle meets the soul.",
  "Behind every tattoo, a universe.",
  "Scars become art when guided by light.",
  "The mask reveals what the face conceals.",
  "In stillness, the needle speaks.",
];

function getDailyQuote(): string {
  const day = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
  return QUOTES[day % QUOTES.length];
}

// ===================== MAIN APP =====================
export default function TattoDiary() {
  const { theme, toggleTheme } = useTheme();
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewClientForm, setShowNewClientForm] = useState(false);
  const [showNewSessionForm, setShowNewSessionForm] = useState(false);
  const [db, setDb] = useState<IDBDatabase | null>(null);
  const [dbError, setDbError] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'client'>('list');
  const [celebration, setCelebration] = useState(false);

  useEffect(() => {
    initDB()
      .then((database) => {
        setDb(database as IDBDatabase);
        loadClients(database as IDBDatabase);
      })
      .catch((err) => {
        console.error('IndexedDB init failed:', err);
        setDbError('Storage unavailable. If using Private Browsing, switch to a regular tab.');
      });
  }, []);

  const loadClients = async (database: IDBDatabase) => {
    const tx = database.transaction('clients', 'readonly');
    const store = tx.objectStore('clients');
    const request = store.getAll();
    request.onsuccess = () => setClients(request.result);
    request.onerror = () => setDbError('Failed to load clients.');
  };

  const saveClient = async (client: Client) => {
    if (!db) {
      setDbError('Storage unavailable — client not saved.');
      return;
    }
    const tx = db.transaction('clients', 'readwrite');
    const store = tx.objectStore('clients');
    store.put(client);
    tx.oncomplete = () => loadClients(db);
    tx.onerror = () => setDbError('Failed to save client.');
  };

  const filteredClients = clients.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalSessions = clients.reduce((sum, c) => sum + c.sessions.length, 0);
  const texturePath = getTexturePath(theme);

  return (
    <div className="w-full app-shell flex flex-col relative" style={{ fontFamily: 'Heebo, sans-serif' }}>
      {/* Texture background */}
      <div className="texture-bg" style={{ backgroundImage: `url(${texturePath})` }} />

      {/* Header */}
      <div
        className="flex-shrink-0 relative z-10 p-4"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}
      >
        <div className="flex items-center justify-between mb-4">
          {(selectedClient || showNewSessionForm) ? (
            <button
              onClick={() => {
                if (showNewSessionForm) setShowNewSessionForm(false);
                else { setSelectedClient(null); setView('list'); }
              }}
              className="tap-spring"
              style={{ color: 'var(--color-accent)' }}
            >
              ←
            </button>
          ) : (
            <div style={{ width: 24 }} />
          )}

          <div className="text-center">
            <h1 className="text-xl tracking-[0.3em] font-light" style={{ color: 'var(--color-accent)' }}>
              INKA
            </h1>
            <p className="text-[9px] tracking-[0.2em] uppercase" style={{ color: 'var(--color-text-muted)' }}>
              Tattoo Master
            </p>
          </div>

          <button onClick={toggleTheme} className="theme-toggle tap-spring">
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Error banner */}
      {dbError && (
        <div className="flex-shrink-0 text-xs p-3 flex items-start gap-2 relative z-10"
          style={{ background: 'var(--color-error)', color: 'var(--color-text)' }}>
          <span className="flex-1">{dbError}</span>
          <button onClick={() => setDbError(null)} className="flex-shrink-0"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto relative z-10" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>

        {/* ========== CLIENT LIST VIEW ========== */}
        {view === 'list' && !showNewSessionForm && (
          <div className="p-4 space-y-4">

            {/* Streak + Daily Inspiration */}
            <div className="flex gap-3">
              <div className="streak-widget flex-1 p-4 text-center">
                <div className="text-2xl font-light" style={{ color: 'var(--color-accent)' }}>
                  {totalSessions}
                </div>
                <div className="text-[10px] tracking-[0.15em] uppercase mt-1" style={{ color: 'var(--color-text-muted)' }}>
                  Sessions
                </div>
              </div>
              <div className="streak-widget flex-[1.5] p-4 relative overflow-hidden">
                <div className="text-[10px] tracking-[0.15em] uppercase mb-2" style={{ color: 'var(--color-accent)' }}>
                  Daily Inspiration
                </div>
                <p className="text-xs italic font-light leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                  {getDailyQuote()}
                </p>
              </div>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-3 w-4 h-4" style={{ color: 'var(--color-text-muted)' }} />
              <input
                type="text"
                placeholder="Search clients, tattoos, notes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input-venetian pl-10 pr-4 py-2 rounded"
                style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-card)' }}
              />
            </div>

            {/* New Client Button */}
            <button
              onClick={() => setShowNewClientForm(true)}
              className="w-full btn-venetian py-3 flex items-center justify-center gap-2 tap-spring"
            >
              <Plus className="w-4 h-4" /> New Client
            </button>

            {/* Client Cards */}
            <div className="space-y-2">
              {filteredClients.length === 0 ? (
                <div className="text-center py-12" style={{ color: 'var(--color-text-muted)' }}>
                  {clients.length === 0 ? 'No clients yet.' : 'No match.'}
                </div>
              ) : (
                filteredClients.map((client) => {
                  const maskUrl = getRandomMask(theme, client.id);
                  const vitrage = getRandomVitrage(theme, client.id + '_v');
                  const shouldShowCastle = theme === 'dark' && (parseInt(client.id, 36) % 3 === 0);
                  const castleUrl = shouldShowCastle ? getRandomCastle(theme, client.id + '_c') : '';

                  return (
                    <button
                      key={client.id}
                      onClick={() => { setSelectedClient(client); setView('client'); }}
                      className="card-venetian w-full p-4 text-left tap-spring"
                    >
                      {/* Vitrage bg */}
                      {vitrage.path && (
                        <img src={vitrage.path} alt="" className="vitrage-bg" 
                          style={{ width: 120, height: 120, top: -20, right: -20, objectFit: 'contain' }} />
                      )}
                      {/* Castle overlay */}
                      {castleUrl && (
                        <img src={castleUrl} alt="" className="castle-overlay" 
                          style={{ width: 100, height: 100, bottom: -10, right: 10, objectFit: 'contain' }} />
                      )}

                      <div className="flex items-center gap-3 relative z-10">
                        {/* Mask avatar */}
                        <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0"
                          style={{ border: '1px solid var(--color-accent)', background: 'var(--color-bg)' }}>
                          {maskUrl && <img src={maskUrl} alt="" className="w-full h-full object-cover" />}
                        </div>

                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-light" style={{ color: 'var(--color-text)' }}>{client.name}</h3>
                          <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                            {client.sessions.length} tattoo{client.sessions.length !== 1 ? 's' : ''}
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--color-text-muted)' }} />
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ========== CLIENT CARD VIEW ========== */}
        {view === 'client' && selectedClient && !showNewSessionForm && (
          <ClientCard
            client={selectedClient}
            theme={theme}
            onSave={(updated) => { saveClient(updated); setSelectedClient(updated); }}
            onNewSession={() => setShowNewSessionForm(true)}
          />
        )}

        {/* ========== NEW SESSION FORM ========== */}
        {showNewSessionForm && selectedClient && (
          <NewSessionForm
            onSave={(session) => {
              const updated = { ...selectedClient, sessions: [...selectedClient.sessions, session] };
              saveClient(updated);
              setSelectedClient(updated);
              setShowNewSessionForm(false);
              setCelebration(true);
              setTimeout(() => setCelebration(false), 2000);
            }}
            onCancel={() => setShowNewSessionForm(false)}
            clientId={selectedClient.id}
          />
        )}
      </div>

      {/* Celebration overlay */}
      {celebration && (
        <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
          <div className="celebration text-center p-8">
            <div className="text-4xl mb-2">🎭</div>
            <div className="text-lg font-light tracking-widest" style={{ color: 'var(--color-accent)' }}>
              Session Saved
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
              Another mark has been written.
            </div>
          </div>
        </div>
      )}

      {/* New Client Modal */}
      {showNewClientForm && (
        <NewClientForm
          onSave={(client) => { saveClient(client); setShowNewClientForm(false); }}
          onCancel={() => setShowNewClientForm(false)}
        />
      )}
    </div>
  );
}

// ===================== CLIENT CARD =====================
function ClientCard({
  client,
  theme,
  onSave,
  onNewSession,
}: {
  client: Client;
  theme: string;
  onSave: (c: Client) => void;
  onNewSession: () => void;
}) {
  const [activeTab, setActiveTab] = useState<'about' | 'documents' | 'sessions'>('about');
  const [isEditing, setIsEditing] = useState(false);
  const [editClient, setEditClient] = useState(client);
  const maskUrl = getRandomMask(theme as 'light' | 'dark', client.id);

  useEffect(() => { setEditClient(client); }, [client]);

  return (
    <div className="p-4">
      {/* Client header */}
      <div className="text-center mb-6 relative">
        <div className="w-20 h-20 rounded-full mx-auto mb-3 overflow-hidden"
          style={{ border: '2px solid var(--color-accent)', background: 'var(--color-bg-card)' }}>
          {maskUrl && <img src={maskUrl} alt="" className="w-full h-full object-cover" />}
        </div>
        <h2 className="text-xl font-light" style={{ color: 'var(--color-text)' }}>{client.name}</h2>
        <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>{client.phone}</p>
        <hr className="divider-gold my-4" />

        <button
          onClick={() => {
            if (isEditing) { onSave(editClient); setIsEditing(false); }
            else setIsEditing(true);
          }}
          className="absolute top-0 right-0 text-xs" style={{ color: 'var(--color-accent)' }}
        >
          {isEditing ? 'Done' : 'Edit'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex justify-center gap-2 mb-6">
        {(['about', 'documents', 'sessions'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`tab-venetian ${activeTab === tab ? 'active' : ''}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'about' && (
        <div className="space-y-6">
          {isEditing && (
            <div className="space-y-4">
              <div>
                <label className="text-[10px] uppercase tracking-widest block mb-1" style={{ color: 'var(--color-text-muted)' }}>Name</label>
                <input value={editClient.name} onChange={(e) => setEditClient({ ...editClient, name: e.target.value })} className="input-venetian" />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-widest block mb-1" style={{ color: 'var(--color-text-muted)' }}>Phone</label>
                <input value={editClient.phone} onChange={(e) => setEditClient({ ...editClient, phone: e.target.value })} className="input-venetian" />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-widest block mb-1" style={{ color: 'var(--color-text-muted)' }}>Skin Type</label>
                <select value={editClient.skinType} onChange={(e) => setEditClient({ ...editClient, skinType: e.target.value })} className="input-venetian">
                  <option value="">Select...</option>
                  <option value="normal">Normal</option>
                  <option value="sensitive">Sensitive</option>
                  <option value="dry">Dry</option>
                  <option value="oily">Oily</option>
                  <option value="combination">Combination</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-widest block mb-1" style={{ color: 'var(--color-text-muted)' }}>Skin Notes</label>
                <textarea value={editClient.skinNotes} onChange={(e) => setEditClient({ ...editClient, skinNotes: e.target.value })} className="input-venetian resize-none h-20" />
              </div>
            </div>
          )}

          {/* Chat Links */}
          <div>
            <label className="text-[10px] uppercase tracking-widest block mb-2" style={{ color: 'var(--color-text-muted)' }}>Links</label>
            <div className="space-y-2">
              {(client.chatLinks || []).map((link) => (
                <div key={link.id} className="card-venetian p-3 flex items-center gap-2">
                  <a href={link.url} target="_blank" rel="noopener noreferrer"
                    className="flex-1 flex items-center gap-2 min-w-0 text-sm tap-spring"
                    style={{ color: 'var(--color-text)' }}>
                    <MessageCircle className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--color-accent)' }} />
                    <span className="flex-shrink-0 text-xs">{PLATFORM_LABELS[link.platform]}</span>
                    <span className="truncate text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                      {link.url.replace(/^https?:\/\//, '')}
                    </span>
                    <ExternalLink className="w-3 h-3 flex-shrink-0 ml-auto" style={{ color: 'var(--color-text-muted)' }} />
                  </a>
                  <button onClick={() => {
                    const updated = { ...client, chatLinks: (client.chatLinks || []).filter((l) => l.id !== link.id) };
                    onSave(updated);
                  }} style={{ color: 'var(--color-text-muted)' }}><X className="w-4 h-4" /></button>
                </div>
              ))}
              <AddChatLinkForm onAdd={(platform, raw) => {
                const newLink: ChatLink = { id: Date.now().toString(), platform, url: buildChatLink(platform, raw) };
                onSave({ ...client, chatLinks: [...(client.chatLinks || []), newLink] });
              }} />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-[10px] uppercase tracking-widest block mb-2" style={{ color: 'var(--color-text-muted)' }}>Notes</label>
            <textarea
              value={client.chatHistory}
              onChange={(e) => onSave({ ...client, chatHistory: e.target.value })}
              placeholder="Add notes about the client..."
              className="input-venetian resize-none h-24"
              style={{ background: 'var(--color-bg-card)', borderRadius: 8, padding: 12, border: '1px solid var(--color-border)' }}
            />
          </div>
        </div>
      )}

      {activeTab === 'documents' && (
        <div className="space-y-3">
          <label className="card-venetian p-3 cursor-pointer flex items-center gap-3 tap-spring">
            <Upload className="w-5 h-5" style={{ color: 'var(--color-accent)' }} />
            <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Upload Document</span>
            <input type="file" className="hidden" onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => {
                const newDoc: Document = {
                  id: Date.now().toString(), clientId: client.id,
                  type: 'other', name: file.name,
                  fileUrl: reader.result as string,
                  uploadedDate: new Date().toLocaleDateString(),
                };
                onSave({ ...client, documents: [...client.documents, newDoc] });
              };
              reader.readAsDataURL(file);
            }} />
          </label>

          {client.documents.map((doc) => (
            <div key={doc.id} className="card-venetian p-3 flex items-center gap-3">
              <div className="flex-1">
                <p className="text-sm" style={{ color: 'var(--color-text)' }}>{doc.name}</p>
                <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{doc.uploadedDate}</p>
              </div>
              {doc.fileUrl && (
                <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="tap-spring">
                  <Eye className="w-4 h-4" style={{ color: 'var(--color-accent)' }} />
                </a>
              )}
              <button onClick={() => onSave({ ...client, documents: client.documents.filter(d => d.id !== doc.id) })}>
                <X className="w-4 h-4" style={{ color: 'var(--color-text-muted)' }} />
              </button>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'sessions' && (
        <div className="space-y-3">
          <button onClick={onNewSession} className="w-full btn-venetian py-3 flex items-center justify-center gap-2 tap-spring">
            <Plus className="w-4 h-4" /> New Tattoo Session
          </button>

          {[...client.sessions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((session) => (
            <div key={session.id} className="card-venetian p-3 flex gap-3 tap-spring">
              {session.photoUrl && (
                <div className="w-20 h-20 rounded overflow-hidden flex-shrink-0"
                  style={{ border: '1px solid var(--color-border)' }}>
                  <img src={session.photoUrl} alt="" className="w-full h-full object-cover" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-light" style={{ color: 'var(--color-text)' }}>
                  {new Date(session.date).toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  {session.colors.slice(0, 3).map((c, i) => (
                    <span key={i} className="w-3 h-3 rounded-full" style={{ background: c || 'var(--color-accent)', border: '1px solid var(--color-border)' }} />
                  ))}
                  {session.duration && <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>⏱ {session.duration}</span>}
                </div>
                {session.proportions && (
                  <p className="text-[10px] mt-1" style={{ color: 'var(--color-text-muted)' }}>📍 {session.proportions}</p>
                )}
              </div>
              <ChevronRight className="w-4 h-4 flex-shrink-0 self-center" style={{ color: 'var(--color-text-muted)' }} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ===================== NEW CLIENT FORM =====================
function NewClientForm({ onSave, onCancel }: { onSave: (c: Client) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [skinType, setSkinType] = useState('');
  const [skinNotes, setSkinNotes] = useState('');

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-6"
      style={{ background: 'var(--color-modal-overlay)' }}>
      <div className="card-venetian p-6 w-full max-w-sm">
        <h2 className="text-center text-lg font-light mb-1" style={{ color: 'var(--color-text)' }}>New Client</h2>
        <hr className="divider-gold mb-6" />

        <div className="space-y-4">
          <div>
            <label className="text-[10px] uppercase tracking-widest block mb-1" style={{ color: 'var(--color-text-muted)' }}>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="input-venetian" placeholder="Name" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest block mb-1" style={{ color: 'var(--color-text-muted)' }}>Phone</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className="input-venetian" placeholder="Phone" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest block mb-1" style={{ color: 'var(--color-text-muted)' }}>Skin Type</label>
            <select value={skinType} onChange={(e) => setSkinType(e.target.value)} className="input-venetian">
              <option value="">Select...</option>
              <option value="normal">Normal</option>
              <option value="sensitive">Sensitive</option>
              <option value="dry">Dry</option>
              <option value="oily">Oily</option>
              <option value="combination">Combination</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest block mb-1" style={{ color: 'var(--color-text-muted)' }}>Skin Notes</label>
            <textarea value={skinNotes} onChange={(e) => setSkinNotes(e.target.value)} className="input-venetian resize-none h-16" placeholder="Notes about skin..." />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onCancel} className="flex-1 btn-ghost tap-spring">Cancel</button>
          <button onClick={() => {
            if (!name.trim()) return;
            onSave({
              id: Date.now().toString(), name: name.trim(), phone, skinType, skinNotes,
              chatHistory: '', chatLinks: [], sessions: [], documents: [],
              createdDate: new Date().toISOString(),
            });
          }} className="flex-1 btn-venetian tap-spring">Create</button>
        </div>
      </div>
    </div>
  );
}

// ===================== NEW SESSION FORM =====================
function NewSessionForm({ onSave, onCancel, clientId }: {
  onSave: (s: TattooSession) => void; onCancel: () => void; clientId: string;
}) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [photoUrl, setPhotoUrl] = useState('');
  const [colors, setColors] = useState('');
  const [proportions, setProportions] = useState('');
  const [needles, setNeedles] = useState('');
  const [duration, setDuration] = useState('');
  const [skinReaction, setSkinReaction] = useState('');
  const [notes, setNotes] = useState('');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    return () => {
      const stream = videoRef.current?.srcObject as MediaStream | null;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) { videoRef.current.srcObject = stream; setIsCameraActive(true); }
    } catch (err) { console.error('Camera error:', err); }
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0);
    setPhotoUrl(canvas.toDataURL('image/jpeg'));
    const stream = videoRef.current.srcObject as MediaStream;
    stream?.getTracks().forEach((track) => track.stop());
    setIsCameraActive(false);
  };

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-center text-lg font-light" style={{ color: 'var(--color-text)' }}>New Tattoo Session</h2>
      <hr className="divider-gold mb-4" />

      <div>
        <label className="text-[10px] uppercase tracking-widest block mb-1" style={{ color: 'var(--color-text-muted)' }}>Date</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input-venetian" />
      </div>

      <div>
        <label className="text-[10px] uppercase tracking-widest block mb-2" style={{ color: 'var(--color-text-muted)' }}>Photo</label>
        {isCameraActive ? (
          <div className="space-y-2">
            <video ref={videoRef} autoPlay playsInline muted className="w-full rounded max-h-48" style={{ background: 'var(--color-bg-card)' }} />
            <button onClick={capturePhoto} className="w-full btn-venetian tap-spring">Capture</button>
          </div>
        ) : photoUrl ? (
          <div className="relative">
            <img src={photoUrl} alt="" className="w-full rounded max-h-48 object-cover" style={{ border: '1px solid var(--color-border)' }} />
            <button onClick={() => setPhotoUrl('')} className="absolute top-2 right-2 tap-spring"
              style={{ background: 'var(--color-bg)', borderRadius: '50%', padding: 4 }}>
              <X className="w-4 h-4" style={{ color: 'var(--color-accent)' }} />
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button onClick={startCamera} className="flex-1 btn-ghost tap-spring flex items-center justify-center gap-2">
              <Camera className="w-4 h-4" /> Take Photo
            </button>
            <label className="flex-1 btn-ghost tap-spring flex items-center justify-center gap-2 cursor-pointer">
              <Upload className="w-4 h-4" /> Upload
              <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => setPhotoUrl(reader.result as string);
                reader.readAsDataURL(file);
              }} />
            </label>
          </div>
        )}
      </div>

      <div>
        <label className="text-[10px] uppercase tracking-widest block mb-1" style={{ color: 'var(--color-text-muted)' }}>Inks</label>
        <input value={colors} onChange={(e) => setColors(e.target.value)} className="input-venetian" placeholder="Colors used..." />
      </div>
      <div>
        <label className="text-[10px] uppercase tracking-widest block mb-1" style={{ color: 'var(--color-text-muted)' }}>Proportions</label>
        <input value={proportions} onChange={(e) => setProportions(e.target.value)} className="input-venetian" placeholder="e.g. 3:1:1" />
      </div>
      <div>
        <label className="text-[10px] uppercase tracking-widest block mb-1" style={{ color: 'var(--color-text-muted)' }}>Needles</label>
        <input value={needles} onChange={(e) => setNeedles(e.target.value)} className="input-venetian" placeholder="Needle config..." />
      </div>
      <div>
        <label className="text-[10px] uppercase tracking-widest block mb-1" style={{ color: 'var(--color-text-muted)' }}>Duration</label>
        <input value={duration} onChange={(e) => setDuration(e.target.value)} className="input-venetian" placeholder="e.g. 03:30" />
      </div>
      <div>
        <label className="text-[10px] uppercase tracking-widest block mb-1" style={{ color: 'var(--color-text-muted)' }}>Skin Reaction</label>
        <input value={skinReaction} onChange={(e) => setSkinReaction(e.target.value)} className="input-venetian" placeholder="Reaction..." />
      </div>
      <div>
        <label className="text-[10px] uppercase tracking-widest block mb-1" style={{ color: 'var(--color-text-muted)' }}>Work Notes</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="input-venetian resize-none h-20" placeholder="Notes..." />
      </div>

      <div className="flex gap-3 pt-4">
        <button onClick={onCancel} className="flex-1 btn-ghost tap-spring">Cancel</button>
        <button onClick={() => {
          onSave({
            id: Date.now().toString(), clientId, date, photoUrl: photoUrl || undefined,
            colors: colors.split(',').map((c) => c.trim()).filter(Boolean),
            proportions, needles, duration, notes, skinReaction: skinReaction || undefined,
          });
        }} className="flex-1 btn-venetian tap-spring">Save Session</button>
      </div>
    </div>
  );
}

// ===================== ADD CHAT LINK FORM =====================
function AddChatLinkForm({ onAdd }: { onAdd: (platform: ChatPlatform, raw: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [platform, setPlatform] = useState<ChatPlatform>('whatsapp');
  const [raw, setRaw] = useState('');

  if (!isOpen) {
    return (
      <button onClick={() => setIsOpen(true)}
        className="w-full text-xs py-2 flex items-center justify-center gap-1 tap-spring"
        style={{ color: 'var(--color-accent)', border: '1px dashed var(--color-border)', borderRadius: 6 }}>
        <Plus className="w-3 h-3" /> Add Link
      </button>
    );
  }

  return (
    <div className="card-venetian p-3 space-y-2">
      <select value={platform} onChange={(e) => setPlatform(e.target.value as ChatPlatform)} className="input-venetian"
        style={{ background: 'var(--color-bg)', borderRadius: 6, padding: '8px 12px' }}>
        <option value="whatsapp">WhatsApp</option>
        <option value="telegram">Telegram</option>
        <option value="messenger">Messenger</option>
        <option value="instagram">Instagram</option>
        <option value="tiktok">TikTok</option>
        <option value="other">Other</option>
      </select>
      <input value={raw} onChange={(e) => setRaw(e.target.value)} className="input-venetian"
        placeholder="Phone, @username, or link"
        style={{ background: 'var(--color-bg)', borderRadius: 6, padding: '8px 12px' }} />
      <div className="flex gap-2">
        <button onClick={() => { setIsOpen(false); setRaw(''); }} className="flex-1 btn-ghost text-xs tap-spring">Cancel</button>
        <button onClick={() => {
          if (!raw.trim()) return;
          onAdd(platform, raw);
          setRaw('');
          setIsOpen(false);
        }} className="flex-1 btn-venetian text-xs tap-spring">Add</button>
      </div>
    </div>
  );
}
