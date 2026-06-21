import React, { useState, useEffect, useRef } from 'react';
import { ChevronRight, Plus, Search, Upload, Camera, X, Eye } from 'lucide-react';

// Types
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

interface Client {
  id: string;
  name: string;
  phone: string;
  skinType: string;
  skinNotes: string;
  chatHistory: string;
  sessions: TattooSession[];
  documents: Document[];
  createdDate: string;
}

// IndexedDB setup
const dbName = 'TattoDiaryDB';
const dbVersion = 1;

const initDB = async () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, dbVersion);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('clients')) {
        db.createObjectStore('clients', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('sessions')) {
        db.createObjectStore('sessions', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('documents')) {
        db.createObjectStore('documents', { keyPath: 'id' });
      }
    };
  });
};

// Main App
export default function TattoDiary() {
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewClientForm, setShowNewClientForm] = useState(false);
  const [showNewSessionForm, setShowNewSessionForm] = useState(false);
  const [db, setDb] = useState<IDBDatabase | null>(null);
  const [view, setView] = useState<'list' | 'client'>('list');

  // Initialize DB
  useEffect(() => {
    initDB().then((database) => {
      setDb(database as IDBDatabase);
      loadClients(database as IDBDatabase);
    });
  }, []);

  // Load clients from DB
  const loadClients = async (database: IDBDatabase) => {
    const tx = database.transaction('clients', 'readonly');
    const store = tx.objectStore('clients');
    const request = store.getAll();
    
    request.onsuccess = () => {
      setClients(request.result);
    };
  };

  // Save client
  const saveClient = async (client: Client) => {
    if (!db) return;
    const tx = db.transaction('clients', 'readwrite');
    const store = tx.objectStore('clients');
    store.put(client);
    
    tx.oncomplete = () => {
      loadClients(db);
    };
  };

  // Filter clients
  const filteredClients = clients.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="w-full app-shell flex flex-col bg-[#111010] text-white font-light" style={{ fontFamily: 'Heebo, sans-serif' }}>
      {/* Header */}
      <div
        className="flex-shrink-0 bg-[#111010] border-b border-[#2A2A2A] p-4 z-50"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-light">INKA</h1>
          {(selectedClient || showNewSessionForm) && (
            <button
              onClick={() => {
                if (showNewSessionForm) {
                  setShowNewSessionForm(false);
                } else {
                  setSelectedClient(null);
                  setView('list');
                }
              }}
              className="text-sm text-[#FAD5A5] hover:text-white transition"
            >
              ← Back
            </button>
          )}
        </div>

        {view === 'list' && !showNewSessionForm && (
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 w-4 h-4 text-[#666]" />
              <input
                type="text"
                placeholder="Search client..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#2A2A2A] text-white pl-10 pr-4 py-2 rounded text-sm focus:outline-none focus:ring-1 focus:ring-[#FAD5A5]"
              />
            </div>
            <button
              onClick={() => setShowNewClientForm(true)}
              className="bg-[#FAD5A5] text-[#111010] px-4 py-2 rounded text-sm font-medium hover:bg-white transition flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> New
            </button>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div
        className="flex-1 overflow-y-auto"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {view === 'list' && !showNewSessionForm && (
          <>
            {showNewClientForm && (
              <NewClientForm
                onSave={(client) => {
                  saveClient(client);
                  setShowNewClientForm(false);
                }}
                onCancel={() => setShowNewClientForm(false)}
              />
            )}

            <div className="p-4 space-y-2">
              {filteredClients.length === 0 ? (
                <div className="text-center py-12 text-[#666]">
                  {clients.length === 0
                    ? 'No clients yet. Create your first one.'
                    : 'No clients matching that name.'}
                </div>
              ) : (
                filteredClients.map((client) => (
                  <button
                    key={client.id}
                    onClick={() => {
                      setSelectedClient(client);
                      setView('client');
                    }}
                    className="w-full bg-[#2A2A2A] p-4 rounded hover:bg-[#333] transition text-left border border-[#333] hover:border-[#FAD5A5]"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-base font-light">{client.name}</h3>
                        <p className="text-xs text-[#999] mt-1">
                          {client.sessions.length} tattoo{client.sessions.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-[#666]" />
                    </div>
                  </button>
                ))
              )}
            </div>
          </>
        )}

        {view === 'client' && selectedClient && !showNewSessionForm && (
          <ClientCard
            client={selectedClient}
            onAddSession={() => setShowNewSessionForm(true)}
            onSave={(updated) => {
              saveClient(updated);
              setSelectedClient(updated);
            }}
          />
        )}

        {showNewSessionForm && selectedClient && (
          <NewSessionForm
            client={selectedClient}
            onSave={(updatedClient) => {
              saveClient(updatedClient);
              setSelectedClient(updatedClient);
              setShowNewSessionForm(false);
            }}
            onCancel={() => setShowNewSessionForm(false)}
          />
        )}
      </div>
    </div>
  );
}

// New Client Form
function NewClientForm({
  onSave,
  onCancel,
}: {
  onSave: (client: Client) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [skinType, setSkinType] = useState('');
  const [skinNotes, setSkinNotes] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const newClient: Client = {
      id: Date.now().toString(),
      name: name.trim(),
      phone,
      skinType,
      skinNotes,
      chatHistory: '',
      sessions: [],
      documents: [],
      createdDate: new Date().toISOString(),
    };

    onSave(newClient);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-[#2A2A2A] rounded-lg p-6 max-w-sm w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-light">New Client</h2>
          <button
            onClick={onCancel}
            className="text-[#666] hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-[#999] mb-2">Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-[#111010] text-white px-3 py-2 rounded text-sm focus:outline-none focus:ring-1 focus:ring-[#FAD5A5]"
              required
            />
          </div>

          <div>
            <label className="block text-xs text-[#999] mb-2">Phone</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full bg-[#111010] text-white px-3 py-2 rounded text-sm focus:outline-none focus:ring-1 focus:ring-[#FAD5A5]"
            />
          </div>

          <div>
            <label className="block text-xs text-[#999] mb-2">Skin Type</label>
            <select
              value={skinType}
              onChange={(e) => setSkinType(e.target.value)}
              className="w-full bg-[#111010] text-white px-3 py-2 rounded text-sm focus:outline-none focus:ring-1 focus:ring-[#FAD5A5]"
            >
              <option value="">Select...</option>
              <option value="dry">Dry</option>
              <option value="oily">Oily</option>
              <option value="combination">Combination</option>
              <option value="sensitive">Sensitive</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-[#999] mb-2">Skin Notes & Allergies</label>
            <textarea
              value={skinNotes}
              onChange={(e) => setSkinNotes(e.target.value)}
              placeholder="Allergies, reactions, sensitivities..."
              className="w-full bg-[#111010] text-white px-3 py-2 rounded text-sm focus:outline-none focus:ring-1 focus:ring-[#FAD5A5] resize-none h-24"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 bg-[#333] text-white px-4 py-2 rounded text-sm hover:bg-[#444] transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 bg-[#FAD5A5] text-[#111010] px-4 py-2 rounded text-sm font-medium hover:bg-white transition"
            >
              Create Client
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Client Card / Details
function ClientCard({
  client,
  onAddSession,
  onSave,
}: {
  client: Client;
  onAddSession: () => void;
  onSave: (client: Client) => void;
}) {
  const [activeTab, setActiveTab] = useState<'about' | 'documents' | 'sessions'>('about');
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState(client);

  const handleSave = () => {
    onSave(editData);
    setEditing(false);
  };

  return (
    <div className="p-4 space-y-4">
      {/* Client Header */}
      <div className="bg-[#2A2A2A] p-6 rounded border border-[#333]">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-2xl font-light">{client.name}</h1>
            {client.phone && (
              <p className="text-sm text-[#999] mt-1">{client.phone}</p>
            )}
          </div>
          <button
            onClick={() => setEditing(!editing)}
            className="text-xs text-[#FAD5A5] hover:text-white transition px-3 py-1 border border-[#FAD5A5] rounded"
          >
            {editing ? 'Done' : 'Edit'}
          </button>
        </div>

        {editing ? (
          <div className="space-y-3 mt-4">
            <input
              type="tel"
              value={editData.phone}
              onChange={(e) => setEditData({ ...editData, phone: e.target.value })}
              placeholder="Phone"
              className="w-full bg-[#111010] text-white px-3 py-2 rounded text-sm focus:outline-none focus:ring-1 focus:ring-[#FAD5A5]"
            />
            <select
              value={editData.skinType}
              onChange={(e) => setEditData({ ...editData, skinType: e.target.value })}
              className="w-full bg-[#111010] text-white px-3 py-2 rounded text-sm focus:outline-none focus:ring-1 focus:ring-[#FAD5A5]"
            >
              <option value="">Skin type...</option>
              <option value="dry">Dry</option>
              <option value="oily">Oily</option>
              <option value="combination">Combination</option>
              <option value="sensitive">Sensitive</option>
            </select>
            <textarea
              value={editData.skinNotes}
              onChange={(e) => setEditData({ ...editData, skinNotes: e.target.value })}
              placeholder="Skin notes & allergies..."
              className="w-full bg-[#111010] text-white px-3 py-2 rounded text-sm focus:outline-none focus:ring-1 focus:ring-[#FAD5A5] resize-none h-20"
            />
            <button
              onClick={handleSave}
              className="w-full bg-[#FAD5A5] text-[#111010] px-4 py-2 rounded text-sm font-medium hover:bg-white transition"
            >
              Save Changes
            </button>
          </div>
        ) : (
          <div className="text-sm text-[#BBB] space-y-2 mt-4">
            {client.skinType && (
              <p>
                <span className="text-[#999]">Skin:</span> {client.skinType}
              </p>
            )}
            {client.skinNotes && (
              <p>
                <span className="text-[#999]">Notes:</span> {client.skinNotes}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[#333]">
        {(['about', 'documents', 'sessions'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-3 text-sm border-b-2 transition ${
              activeTab === tab
                ? 'border-[#FAD5A5] text-white'
                : 'border-transparent text-[#666] hover:text-[#999]'
            }`}
          >
            {tab === 'about' && 'About'}
            {tab === 'documents' && `Documents (${client.documents.length})`}
            {tab === 'sessions' && `Sessions (${client.sessions.length})`}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'about' && (
        <div className="space-y-4">
          <div>
            <label className="text-xs text-[#999] block mb-2">Chat History</label>
            <textarea
              value={client.chatHistory}
              onChange={(e) => {
                const updated = { ...client, chatHistory: e.target.value };
                onSave(updated);
              }}
              placeholder="Paste chat history from WhatsApp, Telegram, Facebook, etc."
              className="w-full bg-[#2A2A2A] text-white px-3 py-2 rounded text-sm focus:outline-none focus:ring-1 focus:ring-[#FAD5A5] resize-none h-32 border border-[#333]"
            />
          </div>
        </div>
      )}

      {activeTab === 'documents' && (
        <div className="space-y-3">
          <button
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.onchange = (e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onload = (event) => {
                    const doc: Document = {
                      id: Date.now().toString(),
                      clientId: client.id,
                      type: 'other',
                      name: file.name,
                      fileUrl: event.target?.result as string,
                      uploadedDate: new Date().toISOString(),
                    };
                    const updated = { ...client, documents: [...client.documents, doc] };
                    onSave(updated);
                  };
                  reader.readAsDataURL(file);
                }
              };
              input.click();
            }}
            className="w-full bg-[#2A2A2A] border-2 border-dashed border-[#333] p-6 rounded text-center text-[#999] hover:border-[#FAD5A5] hover:text-[#FAD5A5] transition flex items-center justify-center gap-2"
          >
            <Upload className="w-4 h-4" />
            Upload Document
          </button>

          <div className="space-y-2">
            {client.documents.length === 0 ? (
              <p className="text-xs text-[#666] text-center py-4">
                No documents uploaded
              </p>
            ) : (
              client.documents.map((doc) => (
                <div
                  key={doc.id}
                  className="bg-[#2A2A2A] p-3 rounded border border-[#333] flex items-center justify-between"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-light truncate">{doc.name}</p>
                    <p className="text-xs text-[#666] mt-1">
                      {new Date(doc.uploadedDate).toLocaleDateString()}
                    </p>
                  </div>
                  {doc.fileUrl && (
                    <a
                      href={doc.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#FAD5A5] hover:text-white ml-2"
                    >
                      <Eye className="w-4 h-4" />
                    </a>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === 'sessions' && (
        <div className="space-y-3">
          <button
            onClick={onAddSession}
            className="w-full bg-[#FAD5A5] text-[#111010] px-4 py-3 rounded text-sm font-medium hover:bg-white transition flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" /> New Tattoo Session
          </button>

          <div className="space-y-2">
            {client.sessions.length === 0 ? (
              <p className="text-xs text-[#666] text-center py-8">
                No tattoo sessions yet
              </p>
            ) : (
              client.sessions
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                .map((session) => (
                  <div
                    key={session.id}
                    className="bg-[#2A2A2A] p-4 rounded border border-[#333] hover:border-[#FAD5A5] transition"
                  >
                    <div className="flex gap-3">
                      {session.photoUrl && (
                        <div className="w-16 h-16 bg-[#111010] rounded overflow-hidden flex-shrink-0">
                          <img
                            src={session.photoUrl}
                            alt="Tattoo"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-light">
                          {new Date(session.date).toLocaleDateString()}
                        </p>
                        {session.colors.length > 0 && (
                          <p className="text-xs text-[#999] mt-1 truncate">
                            Colors: {session.colors.join(', ')}
                          </p>
                        )}
                        {session.duration && (
                          <p className="text-xs text-[#999]">
                            Duration: {session.duration}
                          </p>
                        )}
                        {session.proportions && (
                          <p className="text-xs text-[#999]">
                            {session.proportions}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// New Session Form
function NewSessionForm({
  client,
  onSave,
  onCancel,
}: {
  client: Client;
  onSave: (client: Client) => void;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [photoUrl, setPhotoUrl] = useState<string>('');
  const [colors, setColors] = useState('');
  const [proportions, setProportions] = useState('');
  const [needles, setNeedles] = useState('');
  const [duration, setDuration] = useState('');
  const [notes, setNotes] = useState('');
  const [skinReaction, setSkinReaction] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);

  // Stop the camera if the user navigates away (e.g. taps "← Back" in the
  // header) while the camera is still open, instead of leaving it running.
  useEffect(() => {
    return () => {
      const stream = videoRef.current?.srcObject as MediaStream | null;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setPhotoUrl(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsCameraActive(true);
      }
    } catch (err) {
      console.error('Camera error:', err);
      alert('Could not access camera. Try uploading a photo instead.');
    }
  };

  const takePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      canvasRef.current.width = videoRef.current.videoWidth;
      canvasRef.current.height = videoRef.current.videoHeight;
      context?.drawImage(videoRef.current, 0, 0);
      const imageData = canvasRef.current.toDataURL('image/jpeg');
      setPhotoUrl(imageData);

      // Stop camera
      const stream = videoRef.current.srcObject as MediaStream;
      stream?.getTracks().forEach((track) => track.stop());
      setIsCameraActive(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const session: TattooSession = {
      id: Date.now().toString(),
      clientId: client.id,
      date,
      photoUrl,
      colors: colors
        .split(',')
        .map((c) => c.trim())
        .filter((c) => c),
      proportions,
      needles,
      duration,
      notes,
      skinReaction,
    };

    const updated = {
      ...client,
      sessions: [...client.sessions, session],
    };

    onSave(updated);
  };

  return (
    <div className="p-4 space-y-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Date */}
        <div>
          <label className="block text-xs text-[#999] mb-2">Date *</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full bg-[#2A2A2A] text-white px-3 py-2 rounded text-sm focus:outline-none focus:ring-1 focus:ring-[#FAD5A5]"
            required
          />
        </div>

        {/* Photo */}
        <div>
          <label className="block text-xs text-[#999] mb-2">Photo</label>
          {!isCameraActive && !photoUrl && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={startCamera}
                className="flex-1 bg-[#2A2A2A] border border-[#333] p-4 rounded text-center text-[#999] hover:border-[#FAD5A5] hover:text-[#FAD5A5] transition flex items-center justify-center gap-2 text-sm"
              >
                <Camera className="w-4 h-4" />
                Take Photo
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 bg-[#2A2A2A] border border-[#333] p-4 rounded text-center text-[#999] hover:border-[#FAD5A5] hover:text-[#FAD5A5] transition flex items-center justify-center gap-2 text-sm"
              >
                <Upload className="w-4 h-4" />
                Upload
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
                className="hidden"
              />
            </div>
          )}

          {isCameraActive && (
            <div className="space-y-2">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full bg-black rounded max-h-64"
              />
              <button
                type="button"
                onClick={takePhoto}
                className="w-full bg-[#FAD5A5] text-[#111010] px-4 py-2 rounded text-sm font-medium hover:bg-white transition"
              >
                Take Photo
              </button>
              <button
                type="button"
                onClick={() => {
                  const stream = videoRef.current?.srcObject as MediaStream;
                  stream?.getTracks().forEach((track) => track.stop());
                  setIsCameraActive(false);
                }}
                className="w-full bg-[#333] text-white px-4 py-2 rounded text-sm hover:bg-[#444] transition"
              >
                Cancel
              </button>
            </div>
          )}

          {photoUrl && !isCameraActive && (
            <div className="space-y-2">
              <img
                src={photoUrl}
                alt="Tattoo preview"
                className="w-full h-48 object-cover rounded"
              />
              <button
                type="button"
                onClick={() => setPhotoUrl('')}
                className="w-full bg-[#333] text-white px-4 py-2 rounded text-sm hover:bg-[#444] transition"
              >
                Clear Photo
              </button>
            </div>
          )}
        </div>

        {/* Colors */}
        <div>
          <label className="block text-xs text-[#999] mb-2">
            Colors (comma-separated)
          </label>
          <input
            type="text"
            value={colors}
            onChange={(e) => setColors(e.target.value)}
            placeholder="e.g. black, red, gold"
            className="w-full bg-[#2A2A2A] text-white px-3 py-2 rounded text-sm focus:outline-none focus:ring-1 focus:ring-[#FAD5A5]"
          />
        </div>

        {/* Proportions */}
        <div>
          <label className="block text-xs text-[#999] mb-2">Proportions & Placement</label>
          <input
            type="text"
            value={proportions}
            onChange={(e) => setProportions(e.target.value)}
            placeholder="e.g. 15cm x 10cm, forearm"
            className="w-full bg-[#2A2A2A] text-white px-3 py-2 rounded text-sm focus:outline-none focus:ring-1 focus:ring-[#FAD5A5]"
          />
        </div>

        {/* Needles */}
        <div>
          <label className="block text-xs text-[#999] mb-2">Needles</label>
          <input
            type="text"
            value={needles}
            onChange={(e) => setNeedles(e.target.value)}
            placeholder="e.g. 1RL, 5RL, 7RS"
            className="w-full bg-[#2A2A2A] text-white px-3 py-2 rounded text-sm focus:outline-none focus:ring-1 focus:ring-[#FAD5A5]"
          />
        </div>

        {/* Duration */}
        <div>
          <label className="block text-xs text-[#999] mb-2">Duration</label>
          <input
            type="text"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder="e.g. 2.5 hours, 120 minutes"
            className="w-full bg-[#2A2A2A] text-white px-3 py-2 rounded text-sm focus:outline-none focus:ring-1 focus:ring-[#FAD5A5]"
          />
        </div>

        {/* Skin Reaction */}
        <div>
          <label className="block text-xs text-[#999] mb-2">Skin Reaction & Observations</label>
          <textarea
            value={skinReaction}
            onChange={(e) => setSkinReaction(e.target.value)}
            placeholder="How did the skin react? Bleeding, redness, sensitivity?"
            className="w-full bg-[#2A2A2A] text-white px-3 py-2 rounded text-sm focus:outline-none focus:ring-1 focus:ring-[#FAD5A5] resize-none h-16"
          />
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs text-[#999] mb-2">Work Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Challenges encountered, technique notes, ideas for next session, follow-up instructions..."
            className="w-full bg-[#2A2A2A] text-white px-3 py-2 rounded text-sm focus:outline-none focus:ring-1 focus:ring-[#FAD5A5] resize-none h-20"
          />
        </div>

        <canvas ref={canvasRef} className="hidden" />

        {/* Actions */}
        <div className="flex gap-3 pt-4">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 bg-[#333] text-white px-4 py-2 rounded text-sm hover:bg-[#444] transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="flex-1 bg-[#FAD5A5] text-[#111010] px-4 py-2 rounded text-sm font-medium hover:bg-white transition"
          >
            Save Session
          </button>
        </div>
      </form>
    </div>
  );
}
