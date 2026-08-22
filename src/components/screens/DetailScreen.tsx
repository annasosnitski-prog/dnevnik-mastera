import { useState, useEffect, useRef } from 'react';
import { DROP_CAP_FONT } from '../InkaLogo';
import {
  type Client,
  type ClientDocument,
  type ChatPlatform,
  type ChatLink,
  PLATFORM_LABELS,
  CLIENT_LANGUAGES,
  stylesLabel,
} from '../../domain/client';
import { type Session } from '../../domain/session';
import { type Consultation, isConsultationDeletable } from '../../domain/consultation';
import { type ClientNote } from '../../domain/task';
import { type UrgencyKey } from '../../domain/urgency';
import {
  type Project,
  type ProjectCategory,
  type ProjectState,
  PROJECT_CATEGORIES,
  PROJECT_STATES,
} from '../../domain/project';
import {
  getProjectsByClientId,
  getConsultationNumber,
  sortProjects,
  filterProjects,
  projectFiltersActive,
  EMPTY_PROJECT_FILTERS,
  PROJECT_SORT_MODES,
  type ProjectSortMode,
  type ProjectFilters,
} from '../../domain/projectSelectors';
import { urgencyMeta, urgencyRank } from '../../domain/taskSelectors';
import { lastSessionDate } from '../../domain/plannerSelectors';
import { isRTL, firstLetter, nameRest } from '../../lib/textFormat';
import { buildChatLink } from '../../lib/chatLink';
import { normalizeClient } from '../../lib/normalize';
import { downsizeForStorage } from '../../lib/imagePreview';
import { type ContentWorkspaceNavigation } from '../../lib/contentWorkspace';
import { getContentEntriesForProject } from '../../lib/contentProject';
import { ISO_DATE_RE, formatDate, todayISO } from '../../utils/dates';
import { COLORS, fs, DONE_EMOJI } from '../ui/designTokens';
import { type ContentEntry } from '../../domain/content';
import {
  SKIN_TYPES,
  INPUT_STYLE,
  ContentPanel,
  ProjectCard,
  useSwipeToReveal,
  shareOrDownloadJSON,
} from '../TattoDiary';
import { ProjectContentCard } from '../sheets/SessionAndProjectSheets';
import { SessionPhotos, SkinTonePalette, UrgencyChips, AddChatLinkForm, NoteComposer } from '../client/ClientControls';
import { ClientCardTabBar, type ClientCardTabDef } from '../client/ClientCardTabBar';
import { GoldFrame } from '../ui/Stripes';
import { MetaLabel, MetaValue, SectionDivider, SectionHeader } from '../ui/TextAtoms';
import { TodayDateBadge } from '../ui/TodayDateBadge';

// Вынесено из TattoDiary.tsx (PR 11 рефакторинга) — весь кластер «карточка
// клиента»: экран DetailScreen + его вкладки (Инфо/Сессии/Консультации/
// Заметки/Контент) и все их секции/строки. Логика и разметка не менялись —
// чистый перенос. NoteItem/NoteComposer экспортируются, т.к. их переиспользуют
// дашборды в TattoDiary.tsx. AddChatLinkForm/AddMasterLinkForm с тем же
// назначением с тех пор переехали в client/ClientControls.tsx — DetailScreen
// теперь грузится через React.lazy, и если бы они остались здесь, статический
// импорт из TattoDiary.tsx утянул бы весь этот файл обратно в основной бандл.


// Collapses/expands the client hero — sits at the end of whichever row is
// showing (collapsed strip or the expanded styles/count line) via marginLeft:
// auto, so it stays in the same place either way.
function HeaderCollapseToggle({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <div
      className="inka-back"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      role="button"
      aria-label={collapsed ? 'Развернуть карточку клиента' : 'Свернуть карточку клиента'}
      style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', marginLeft: 'auto', flexShrink: 0 }}
    >
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none" style={{ transform: collapsed ? 'none' : 'rotate(180deg)', transition: 'transform 0.25s' }}>
        <path d="M3.5 6.5L8 11L12.5 6.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

// The client's cover note ("Заметки о клиенте"), editable inline from the hero
// (tap the pencil or the text). Saves straight through onSave — no need to open
// the full client-edit form for a quick note change.
function CoverNoteEditor({ client, onSave }: { client: Client; onSave: (c: Client) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(client.note);
  useEffect(() => {
    if (!editing) setDraft(client.note);
  }, [client.note, editing]);

  const save = () => {
    onSave({ ...client, note: draft.trim() });
    setEditing(false);
  };

  const labelRow = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
      <div style={{ fontFamily: "'Kelly Slab', 'Playfair Display', serif", fontSize: fs(10), color: COLORS.textGhost, letterSpacing: '3px', textTransform: 'uppercase' }}>
        Заметки о клиенте
      </div>
      {!editing && (
        <span onClick={() => setEditing(true)} title="Редактировать" style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', opacity: 0.7 }}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ color: COLORS.gold }}>
            <path d="M11 2.5L13.5 5L5.5 13H3V10.5L11 2.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
          </svg>
        </span>
      )}
    </div>
  );

  return (
    <div style={{ marginTop: 16 }}>
      {labelRow}
      {editing ? (
        <div>
          <textarea
            dir="auto"
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Идеи, пожелания, особенности..."
            style={{
              width: '100%',
              background: 'rgba(var(--surface-rgb),0.03)',
              border: '1px solid rgba(var(--gold-rgb),0.3)',
              borderRadius: 2,
              padding: '9px 11px',
              fontFamily: "'Inter', sans-serif",
              color: COLORS.textPrimary,
              outline: 'none',
              resize: 'none',
              height: 90,
              fontStyle: 'italic',
              lineHeight: 1.5,
            }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <div onClick={save} style={{ flex: 1, padding: '7px 12px', textAlign: 'center', border: '1px solid rgba(var(--gold-rgb),0.3)', borderRadius: 2, cursor: 'pointer', color: COLORS.gold, fontSize: fs(11), letterSpacing: '1px', textTransform: 'uppercase', fontStyle: 'italic' }}>
              Сохранить
            </div>
            <div onClick={() => { setDraft(client.note); setEditing(false); }} style={{ flex: 1, padding: '7px 12px', textAlign: 'center', border: '1px solid rgba(var(--gold-rgb),0.15)', borderRadius: 2, cursor: 'pointer', color: COLORS.textFaint, fontSize: fs(11), letterSpacing: '1px', textTransform: 'uppercase', fontStyle: 'italic' }}>
              Отмена
            </div>
          </div>
        </div>
      ) : client.note ? (
        <div
          onClick={() => setEditing(true)}
          dir="auto"
          style={{ fontSize: fs(15), color: 'var(--text-soft)', fontStyle: 'italic', lineHeight: 1.5, cursor: 'pointer', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
        >
          {client.note}
        </div>
      ) : (
        <div onClick={() => setEditing(true)} style={{ fontSize: fs(14), color: COLORS.textGhost, fontStyle: 'italic', cursor: 'pointer' }}>
          Добавить заметку…
        </div>
      )}
    </div>
  );
}

// ===================== DETAIL SCREEN =====================
// Каркас вкладок (подвеска-самоцвет + строка вкладок) — в client/ClientCardTabBar.tsx,
// общий с Личным кабинетом мастера (см. его собственный комментарий).
// Сессии и консультации собственных вкладок больше не имеют: они живут
// внутри проекта (Клиент → Проект → консультации/сессии), поэтому смотреть их
// плоским списком «все сессии клиента вперемешку» больше незачем — вкладка
// «Проекты» стала входом в работу и стоит первой. Записи, которые почему-то
// не привязаны ни к одному проекту этого клиента (старые данные), не
// прячутся: ProjectsTab показывает их отдельным блоком «Записи без проекта»,
// откуда открывается тот же список, что был на прежних вкладках.
export type ClientCardTab = 'projects' | 'content' | 'extra' | 'info';

const CLIENT_TABS: ClientCardTabDef<ClientCardTab>[] = [
  { id: 'projects', kind: 'projects', label: 'Проекты' },
  { id: 'content', kind: 'content', label: 'Контент' },
  { id: 'extra', kind: 'notes', label: 'Заметки' },
  { id: 'info', kind: 'info', label: 'Инфо' },
];

export function DetailScreen({
  client,
  activeTab,
  onTab,
  onBack,
  onSave,
  onEditClient,
  onEditSession,
  onDeleteSession,
  onUpdateSessionPhotos,
  onToggleSessionDone,
  onChainSession,
  onEditConsultation,
  onDeleteConsultation,
  onConvertConsultation,
  onChainConsultation,
  onViewSession,
  onViewConsultation,
  onAddDocument,
  onRemoveDocument,
  onUpsertNote,
  onAddNote,
  onDeleteNote,
  contentEntries,
  onOpenContent,
  onOpenContentEntry,
  onImportClients,
  projects,
  onOpenProject,
  onCreateProject,
  onOpenCalendar,
}: {
  client: Client;
  activeTab: ClientCardTab;
  onTab: (t: ClientCardTab) => void;
  onBack: () => void;
  onSave: (client: Client) => void;
  onEditClient: () => void;
  onEditSession: (session: Session) => void;
  onDeleteSession: (sessionId: string) => void;
  onUpdateSessionPhotos: (sessionId: string, photos: string[]) => void;
  onToggleSessionDone: (sessionId: string) => void;
  // «Назначить следующую сессию» — session is never replaced; opens a fresh
  // session record linked to this one (see
  // Session.previousSessionId/nextSessionId), same pattern as
  // onChainConsultation below.
  onChainSession: (session: Session) => void;
  onEditConsultation: (consultation: Consultation) => void;
  onDeleteConsultation: (consultationId: string) => void;
  // Consultation happened, master and client agreed on a work session —
  // moves the consultation into a session (client.consultations →
  // client.sessions) instead of leaving it as a separate, now-stale record.
  onConvertConsultation: (consultation: Consultation) => void;
  // «Назначить следующую консультацию» — consultation is never replaced;
  // opens a fresh consultation record linked to this one (see
  // Consultation.previousConsultationId/nextConsultationId).
  onChainConsultation: (consultation: Consultation) => void;
  onViewSession: (session: Session) => void;
  onViewConsultation: (consultation: Consultation) => void;
  onAddDocument: (doc: ClientDocument) => void;
  onRemoveDocument: (docId: string) => void;
  onUpsertNote: (note: ClientNote) => void;
  onAddNote: (text: string, urgency: UrgencyKey, photos: string[], dueDate: string | null, projectId: string | null) => void;
  onDeleteNote: (noteId: string) => void;
  contentEntries: ContentEntry[];
  onOpenContent: (navigation: ContentWorkspaceNavigation) => void;
  // Открыть уже существующий ContentINKA на конкретной записи — тот же
  // callback, что и у ProjectViewSheet (см. TattoDiary.tsx), для контента,
  // привязанного к одному из проектов клиента (см. ClientContentTab ниже).
  onOpenContentEntry: (entry: ContentEntry) => void;
  // Merge-import (add/update, never clears) — the counterpart to this same
  // screen's client export, so a single exported client's file can be
  // brought back in without wiping the rest of the roster.
  onImportClients: (clients: Client[]) => void;
  projects: Project[];
  onOpenProject: (project: Project) => void;
  onCreateProject: () => void;
  onOpenCalendar: () => void;
}) {
  // The tab-content scroller is a single reused DOM node across every client
  // and every tab, so its scrollTop otherwise carries over — opening a new
  // client (or switching tabs) could land you mid-scroll instead of at top.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0);
  }, [client.id, activeTab]);

  // The hero (name, styles, client note) can be collapsed to a slim strip so
  // «Сессии»/«Доп.» get more room to work with — starts collapsed (and resets
  // to collapsed whenever a different client is opened), expand on demand.
  const [headerCollapsed, setHeaderCollapsed] = useState(true);
  useEffect(() => {
    setHeaderCollapsed(true);
  }, [client.id]);

  // «Записи без проекта» — страховка от того, что убранные вкладки Сессии/
  // Консультации спрятали бы старые записи, оставшиеся без projectId (или с
  // ссылкой на удалённый/чужой проект). Правило «сессия/консультация не без
  // проекта» действует только на новые записи, поэтому у уже накопленных
  // данных такие сироты возможны — они видны отдельным блоком во вкладке
  // «Проекты» и открываются тем же самым списком, что был на прежней вкладке.
  const clientProjectIds = new Set(getProjectsByClientId(projects, client.id).map((p) => p.id));
  const isOrphan = (projectId: string | null) => !projectId || !clientProjectIds.has(projectId);
  const orphanSessions = client.sessions.filter((s) => isOrphan(s.projectId));
  const orphanConsultations = client.consultations.filter((c) => isOrphan(c.projectId));
  const [orphanView, setOrphanView] = useState<'sessions' | 'consultations' | null>(null);
  useEffect(() => {
    setOrphanView(null);
  }, [client.id, activeTab]);

  // Legacy single-client JSON stays importable through the same input as the
  // full v6 ZIP. Unlike a full restore, it merges this client by id.
  const handleExportClient = async () => {
    const payload = { version: 1, exportedAt: new Date().toISOString(), clients: [client] };
    const json = JSON.stringify(payload, null, 2);
    const safeName = `${client.name} ${client.surname}`.trim().replace(/[^\p{L}\p{N}]+/gu, '_') || 'client';
    const filename = `inka-${safeName}-${new Date().toISOString().slice(0, 10)}.json`;
    await shareOrDownloadJSON([json], filename);
  };

  // Export and import share one button — a small menu picks which, since
  // both are the same «move a client to/from a file» idea and rarely used
  // side by side. The menu (and the feedback tooltip below) render via
  // `position: fixed` with a manually-tracked anchor point rather than
  // `absolute` — the hero header this button sits in has `overflow: hidden`
  // (it clips its own decorative art), which would otherwise clip the
  // dropdown too whenever the header is in its collapsed (short) state.
  const [showTransferMenu, setShowTransferMenu] = useState(false);
  const [transferMenuAnchor, setTransferMenuAnchor] = useState<{ top: number; right: number } | null>(null);
  const [importFeedback, setImportFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const transferBtnRef = useRef<HTMLDivElement>(null);
  const importFileRef = useRef<HTMLInputElement>(null);
  const openTransferMenu = () => {
    const rect = transferBtnRef.current?.getBoundingClientRect();
    if (rect) setTransferMenuAnchor({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    setShowTransferMenu(true);
  };
  const handleImportFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const rawClients = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.clients) ? parsed.clients : null;
        if (!rawClients || !rawClients.length) throw new Error('bad shape');
        onImportClients(rawClients.map((c: any, i: number) => normalizeClient(c, i)));
        setImportFeedback({ ok: true, text: rawClients.length > 1 ? `Импортировано ${rawClients.length} клиент(ов)` : 'Клиент импортирован' });
      } catch {
        setImportFeedback({ ok: false, text: 'Не удалось прочитать файл' });
      }
      setTimeout(() => setImportFeedback(null), 2400);
    };
    reader.readAsText(file);
  };

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
            <span style={{ fontSize: fs(15), color: COLORS.gold, fontStyle: 'italic', letterSpacing: '0.3px' }}>вернуться</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {/* Export/import this one client — a single button, a menu picks
                which. Same JSON shape the full backup uses (just a
                single-client array), so an exported file round-trips back
                in through either this button or Админка's own import. */}
            <div ref={transferBtnRef} style={{ position: 'relative', display: 'flex', flexShrink: 0 }}>
              <div
                className="inka-back"
                onClick={() => (showTransferMenu ? setShowTransferMenu(false) : openTransferMenu())}
                role="button"
                aria-label="Экспорт/импорт клиента"
                aria-expanded={showTransferMenu}
                title="Экспортировать или импортировать этого клиента"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, cursor: 'pointer' }}
              >
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                  <path d="M5 3V13M5 13L2.5 10.5M5 13L7.5 10.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M11 13V3M11 3L8.5 5.5M11 3L13.5 5.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              {showTransferMenu && transferMenuAnchor && (
                <>
                  <div onClick={() => setShowTransferMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 15 }} />
                  <div
                    style={{
                      position: 'fixed',
                      top: transferMenuAnchor.top,
                      right: transferMenuAnchor.right,
                      width: 176,
                      background: COLORS.sheet,
                      border: '1px solid rgba(var(--gold-rgb),0.2)',
                      borderRadius: 4,
                      padding: 6,
                      boxShadow: '0 10px 28px rgba(0,0,0,0.4)',
                      zIndex: 17,
                    }}
                  >
                    <div
                      onClick={() => {
                        setShowTransferMenu(false);
                        handleExportClient();
                      }}
                      role="button"
                      style={{ padding: '9px 8px', fontSize: fs(13), color: COLORS.textPrimary, cursor: 'pointer', borderRadius: 2 }}
                    >
                      Экспортировать
                    </div>
                    <div
                      onClick={() => {
                        setShowTransferMenu(false);
                        importFileRef.current?.click();
                      }}
                      role="button"
                      style={{ padding: '9px 8px', fontSize: fs(13), color: COLORS.textPrimary, cursor: 'pointer', borderRadius: 2 }}
                    >
                      Импортировать
                    </div>
                  </div>
                </>
              )}
              <input
                ref={importFileRef}
                type="file"
                accept="application/json"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImportFile(file);
                  e.target.value = '';
                }}
              />
              {importFeedback && (
                <div
                  style={{
                    position: 'fixed',
                    top: transferMenuAnchor?.top ?? 0,
                    right: transferMenuAnchor?.right ?? 24,
                    whiteSpace: 'nowrap',
                    fontSize: fs(11),
                    color: importFeedback.ok ? COLORS.gold : 'var(--urgent)',
                    background: COLORS.sheet,
                    border: '1px solid rgba(var(--gold-rgb),0.2)',
                    borderRadius: 4,
                    padding: '6px 10px',
                    boxShadow: '0 10px 28px rgba(0,0,0,0.4)',
                    zIndex: 17,
                  }}
                >
                  {importFeedback.text}
                </div>
              )}
            </div>
            {/* Edit client */}
            <div
              className="inka-back"
              onClick={onEditClient}
              style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
            >
              <span style={{ fontSize: fs(15), color: COLORS.gold, fontStyle: 'italic', letterSpacing: '0.3px' }}>править</span>
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                <path d="M11 2.5L13.5 5L5.5 13H3V10.5L11 2.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
              </svg>
            </div>
            <TodayDateBadge onOpen={onOpenCalendar} />
          </div>
        </div>

        {headerCollapsed ? (
          /* Collapsed strip — just enough to place the client, tap to re-expand */
          <div
            onClick={() => setHeaderCollapsed(false)}
            style={{ padding: '0 24px 16px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', position: 'relative', zIndex: 5 }}
          >
            <span dir="auto" style={{ fontFamily: DROP_CAP_FONT, fontSize: fs(17), color: COLORS.textPrimary, fontWeight: 600, letterSpacing: '0.5px' }}>
              {client.name}
              {client.surname ? ` ${client.surname}` : ''}
            </span>
            <span style={{ fontSize: fs(13), color: COLORS.textGhost }}>· {client.sessions.length} сессий</span>
            <HeaderCollapseToggle collapsed={headerCollapsed} onToggle={() => setHeaderCollapsed((v) => !v)} />
          </div>
        ) : (
          /* Giant drop cap hero */
          <div style={{ padding: '12px 24px 18px', position: 'relative', zIndex: 5 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 2, direction: isRTL(client.name) ? 'rtl' : 'ltr' }}>
              <span
                style={{
                  fontFamily: DROP_CAP_FONT,
                  fontSize: fs(125),
                  fontWeight: 600,
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
                <div dir="auto" style={{ fontFamily: DROP_CAP_FONT, fontSize: fs(33), color: COLORS.textPrimary, fontWeight: 600, lineHeight: 1.05, letterSpacing: '1px' }}>
                  {nameRest(client.name)}
                </div>
                <div dir="auto" style={{ fontFamily: DROP_CAP_FONT, fontSize: fs(19), color: COLORS.textMuted, fontWeight: 600, marginTop: 5, letterSpacing: '0.5px' }}>
                  {client.surname}
                </div>
              </div>
            </div>
            {/* Style(s) + session count — styles carry the client's marker colour */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 13, flexWrap: 'wrap' }}>
              <div style={{ width: 22, height: 2, background: client.color, borderRadius: 1, flexShrink: 0 }} />
              <span style={{ fontSize: fs(13), color: client.color, letterSpacing: '2.5px', textTransform: 'uppercase', fontWeight: 600 }}>
                {stylesLabel(client) || 'Без стиля'}
              </span>
              <span style={{ fontSize: fs(13), color: COLORS.textGhost }}>· {client.sessions.length} сессий</span>
              <HeaderCollapseToggle collapsed={headerCollapsed} onToggle={() => setHeaderCollapsed((v) => !v)} />
            </div>

            {/* Notes about the client — in the header, editable inline (tap the
                pencil or the text) so it can be changed without opening the
                full client-edit form. */}
            <CoverNoteEditor client={client} onSave={onSave} />
          </div>
        )}

        {/* Gold tube carrying the tab medallions. The client's marker colour
            is present as reflected light along the whole tube, not as a flat
            painted strip. */}
        <div
          style={{
            position: 'relative',
            boxSizing: 'border-box',
            height: 5,
            width: '100%',
            flexShrink: 0,
            overflow: 'visible',
            borderRadius: 999,
            borderTop: '1px solid #FFF0B3',
            borderBottom: '1px solid #431A00',
            background: `linear-gradient(180deg,
              #6B2C00 0%,
              #FFD777 18%,
              #FFF8D7 36%,
              #EFAD3C 52%,
              #A55408 72%,
              #431A00 100%)`,
            boxShadow: `
              0 1px 0 rgba(255,240,179,.34) inset,
              0 1px 3px rgba(0,0,0,.38),
              0 0 3px rgba(255,215,119,.42),
              0 0 7px color-mix(in srgb, ${client.color} 14%, rgba(226,182,85,.18) 86%)`,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: '36%',
              height: '32%',
              background: `linear-gradient(90deg,
                color-mix(in srgb, ${client.color} 60%, #793804 40%) 0%,
                ${client.color} 20%,
                color-mix(in srgb, ${client.color} 54%, white 46%) 50%,
                ${client.color} 80%,
                color-mix(in srgb, ${client.color} 60%, #793804 40%) 100%)`,
              opacity: 0.72,
              filter: 'blur(.45px)',
              mixBlendMode: 'screen',
            }}
          />
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: '1%',
              right: '1%',
              top: 1,
              height: 1,
              borderRadius: 999,
              background: 'linear-gradient(90deg, transparent, rgba(255,248,215,.75) 18%, rgba(255,248,215,.2) 72%, transparent)',
            }}
          />
          {/* Five raised gold separators sit on the tube at the exact
              boundaries of the six equal tab slots: each one is therefore
              centred between two neighbouring medallions at every width. */}
          <span
            aria-hidden="true"
            data-tube-dividers
            style={{
              position: 'absolute',
              left: 8,
              right: 8,
              top: '50%',
              height: 0,
              pointerEvents: 'none',
              zIndex: 3,
            }}
          >
            {CLIENT_TABS.slice(0, -1).map((tab, index) => (
              <span
                key={tab.id}
                data-tube-divider={index + 1}
                style={{
                  position: 'absolute',
                  left: `${((index + 1) / CLIENT_TABS.length) * 100}%`,
                  top: 0,
                  width: 5.5,
                  height: 5.5,
                  transform: 'translate(-50%, -50%)',
                  borderRadius: '50%',
                  border: '0.5px solid rgba(255,240,179,.82)',
                  background: `radial-gradient(circle at 34% 28%,
                    #FFFDF0 0%,
                    #FFF0B3 16%,
                    #FFD777 34%,
                    #B88B32 63%,
                    #6B2C00 82%,
                    #431A00 100%)`,
                  boxShadow: `
                    0 0 1.5px rgba(255,240,179,.78),
                    0 0 4px rgba(255,215,119,.36),
                    0 0 7px rgba(226,182,85,.14),
                    0 1px 1px rgba(0,0,0,.45)`,
                }}
              />
            ))}
          </span>
        </div>
      </div>

      <ClientCardTabBar tabs={CLIENT_TABS} activeTab={activeTab} onTab={onTab} ariaLabel="Разделы клиента" />

      {/* Tab content */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', position: 'relative', padding: '22px 24px 50px' }}>
        {activeTab === 'projects' && orphanView !== null && (
          <div style={{ animation: 'fadeSlideIn 0.3s ease' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div
                style={{
                  fontFamily: "'Kelly Slab', 'Playfair Display', serif",
                  fontSize: fs(11),
                  color: COLORS.textGhost,
                  letterSpacing: '3.5px',
                  textTransform: 'uppercase',
                }}
              >
                {orphanView === 'sessions' ? 'Сессии без проекта' : 'Консультации без проекта'}
              </div>
              <span onClick={() => setOrphanView(null)} role="button" style={{ fontSize: fs(12), color: COLORS.gold, cursor: 'pointer', letterSpacing: '0.5px' }}>
                ← к проектам
              </span>
            </div>
            {/* Тот же список, что был на убранных вкладках — просто клиент
                подменён его «сиротской» частью, без второй реализации
                строк/свайпов/действий. */}
            <SessionsTab
              kind={orphanView}
              client={{ ...client, sessions: orphanSessions, consultations: orphanConsultations }}
              onEditSession={onEditSession}
              onDeleteSession={onDeleteSession}
              onUpdateSessionPhotos={onUpdateSessionPhotos}
              onToggleSessionDone={onToggleSessionDone}
              onChainSession={onChainSession}
              onEditConsultation={onEditConsultation}
              onDeleteConsultation={onDeleteConsultation}
              onConvertConsultation={onConvertConsultation}
              onChainConsultation={onChainConsultation}
              onViewSession={onViewSession}
              onViewConsultation={onViewConsultation}
            />
          </div>
        )}
        {activeTab === 'info' && (
          <InfoTab
            client={client}
            onSave={onSave}
            onAddDocument={onAddDocument}
            onRemoveDocument={onRemoveDocument}
          />
        )}
        {activeTab === 'extra' && (
          <AdditionalTab
            client={client}
            projects={getProjectsByClientId(projects, client.id)}
            onUpsertNote={onUpsertNote}
            onAddNote={onAddNote}
            onDeleteNote={onDeleteNote}
          />
        )}
        {activeTab === 'content' && (
          <ClientContentTab
            client={client}
            entries={contentEntries}
            projects={projects}
            onOpenContent={onOpenContent}
            onOpenContentEntry={onOpenContentEntry}
          />
        )}
        {activeTab === 'projects' && orphanView === null && (
          <ProjectsTab
            client={client}
            projects={projects}
            onOpenProject={onOpenProject}
            onCreateProject={onCreateProject}
            orphanSessionCount={orphanSessions.length}
            orphanConsultationCount={orphanConsultations.length}
            onOpenOrphans={setOrphanView}
          />
        )}
      </div>
    </>
  );
}

function ClientContentTab({
  client,
  entries,
  projects,
  onOpenContent,
  onOpenContentEntry,
}: {
  client: Client;
  entries: ContentEntry[];
  projects: Project[];
  onOpenContent: (navigation: ContentWorkspaceNavigation) => void;
  onOpenContentEntry: (entry: ContentEntry) => void;
}) {
  const sources = [
    ...client.sessions.map((session) => ({
      sourceType: 'session' as const,
      sourceId: session.id,
      date: session.date,
      label: session.name || 'Сессия',
    })),
    ...client.consultations.map((consultation) => ({
      sourceType: 'consultation' as const,
      sourceId: consultation.id,
      date: consultation.date,
      label: 'Консультация',
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  // Контент, привязанный прямо к одному из проектов клиента (ручная
  // привязка к проекту, а не к конкретной сессии/консультации) — иначе он
  // нигде не был виден на карточке клиента, только внутри самого проекта
  // (ProjectViewSheet). getContentEntriesForProject уже реализует все
  // случаи связи (см. src/lib/contentProject.ts) — не повторяем их здесь.
  // [client] как список клиентов достаточен: сессии этого же проекта
  // всегда лежат в client.sessions (clientId проекта — этот же клиент).
  const clientProjects = getProjectsByClientId(projects, client.id);
  const projectContentSections = clientProjects
    .map((project) => ({ project, items: getContentEntriesForProject(entries, project.id, projects, [client]) }))
    .filter((section) => section.items.length > 0);

  if (sources.length === 0 && projectContentSections.length === 0) {
    return <div style={{ fontSize: fs(14), color: COLORS.textGhost, fontStyle: 'italic' }}>Сначала добавьте сессию или консультацию.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {projectContentSections.map(({ project, items }) => (
        <GoldFrame key={`project:${project.id}`} plain style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: fs(13), color: COLORS.textPrimary, marginBottom: 12 }}>{project.title || 'Без названия'}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {items.map((item) => (
              <ProjectContentCard key={item.entry.id} item={item} onClick={() => onOpenContentEntry(item.entry)} />
            ))}
          </div>
        </GoldFrame>
      ))}
      {sources.map((source) => (
        <GoldFrame key={`${source.sourceType}:${source.sourceId}`} plain style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: fs(13), color: COLORS.textPrimary, marginBottom: 4 }}>{source.label}</div>
          <div style={{ fontSize: fs(11), color: COLORS.textGhost, marginBottom: 12 }}>{formatDate(source.date) || 'Дата не указана'}</div>
          <ContentPanel
            clientId={client.id}
            sourceType={source.sourceType}
            sourceId={source.sourceId}
            entries={entries}
            onOpenContent={onOpenContent}
          />
        </GoldFrame>
      ))}
    </div>
  );
}

// ── Проекты клиента (Этап 3a, своя вкладка с PR «карточка клиента ↔ Личный
//    кабинет») — та же ProjectCard (и та же сетка), что и в Мастерской, а не
//    отдельный компактный список: здесь у вкладки есть собственное место,
//    как у Сессий/Заметок. ──
function ProjectsTab({
  client,
  projects,
  onOpenProject,
  onCreateProject,
  orphanSessionCount,
  orphanConsultationCount,
  onOpenOrphans,
}: {
  client: Client;
  projects: Project[];
  onOpenProject: (project: Project) => void;
  onCreateProject: () => void;
  orphanSessionCount: number;
  orphanConsultationCount: number;
  onOpenOrphans: (kind: 'sessions' | 'consultations') => void;
}) {
  // Фильтр и сортировка — та же пара «воронка + список», что на экране
  // клиентов, только по полям проекта. «Последний активный» стоит по
  // умолчанию: первым в карточке должен оказаться проект, который двигался
  // последним (см. sortProjects — та же производная активность, что у
  // напоминаний о застое).
  const [filters, setFilters] = useState<ProjectFilters>(EMPTY_PROJECT_FILTERS);
  const [sortMode, setSortMode] = useState<ProjectSortMode>('lastActive');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);

  const clientProjects = getProjectsByClientId(projects, client.id);
  const visibleProjects = sortProjects(filterProjects(clientProjects, filters), sortMode, {
    sessions: client.sessions,
    consultations: client.consultations,
    today: todayISO(),
  });
  const filtersActive = projectFiltersActive(filters);

  const circleStyle = (active: boolean): React.CSSProperties => ({
    width: 30,
    height: 30,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
    border: active ? '1px solid rgba(var(--gold-rgb),0.6)' : '1px solid rgba(var(--gold-rgb),0.15)',
    background: active ? 'rgba(var(--gold-rgb),0.08)' : 'rgba(var(--surface-rgb),0.022)',
  });
  const panelStyle: React.CSSProperties = {
    position: 'absolute',
    top: 'calc(100% + 6px)',
    right: 0,
    background: COLORS.sheet,
    border: '1px solid rgba(var(--gold-rgb),0.2)',
    borderRadius: 4,
    boxShadow: '0 10px 28px rgba(0,0,0,0.4)',
    zIndex: 17,
  };
  const chipStyle = (active: boolean): React.CSSProperties => ({
    fontSize: fs(11),
    padding: '4px 9px',
    borderRadius: 2,
    cursor: 'pointer',
    border: active ? '1px solid rgba(var(--gold-rgb),0.6)' : '1px solid rgba(var(--gold-rgb),0.15)',
    background: active ? 'rgba(var(--gold-rgb),0.08)' : 'transparent',
    color: active ? COLORS.gold : COLORS.textFaint,
    letterSpacing: '0.4px',
    textTransform: 'uppercase',
  });
  const groupLabelStyle: React.CSSProperties = {
    fontSize: fs(10),
    color: COLORS.textGhost,
    letterSpacing: '1.5px',
    textTransform: 'uppercase',
    marginBottom: 8,
  };

  return (
    <div style={{ animation: 'fadeSlideIn 0.3s ease' }}>
      {/* Закрывает открытую панель тапом мимо неё — тот же приём, что общий
          backdrop у Поиск/Фильтры/Сортировка на экране клиентов. Стоит ПЕРЕД
          строкой заголовка и перекрывает сетку: карточка проекта поднимает
          своё содержимое на zIndex 2 (см. ProjectCard), поэтому и подложка, и
          сама строка с панелью должны быть выше — иначе карточки рисуются
          поверх раскрытого фильтра (та же ловушка, что описана в
          WorkshopScreen). */}
      {(filtersOpen || sortOpen) && (
        <div
          onClick={() => {
            setFiltersOpen(false);
            setSortOpen(false);
          }}
          style={{ position: 'fixed', inset: 0, zIndex: 3 }}
        />
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, position: 'relative', zIndex: 4 }}>
        <div
          style={{
            fontFamily: "'Kelly Slab', 'Playfair Display', serif",
            fontSize: fs(11),
            color: COLORS.textGhost,
            letterSpacing: '3.5px',
            textTransform: 'uppercase',
          }}
        >
          Проекты
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* ── Фильтры (тип + статус) ── */}
          <div style={{ position: 'relative' }}>
            <div
              onClick={() => {
                setFiltersOpen((v) => !v);
                setSortOpen(false);
              }}
              role="button"
              aria-label={filtersOpen ? 'Скрыть фильтры' : 'Фильтры'}
              title="Фильтры"
              style={circleStyle(filtersActive || filtersOpen)}
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ color: filtersActive || filtersOpen ? COLORS.gold : COLORS.textFaint }}>
                <path d="M2 3.5h12l-4.7 5.3V13l-2.6-1.5V8.8L2 3.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
              </svg>
            </div>
            {filtersOpen && (
              <div style={{ ...panelStyle, width: 230, maxWidth: 'calc(100vw - 60px)', padding: 12 }}>
                <div style={groupLabelStyle}>Тип</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                  {([null, ...PROJECT_CATEGORIES.map((c) => c.key)] as (ProjectCategory | null)[]).map((v) => (
                    <div
                      key={v ?? 'all'}
                      onClick={() => setFilters((f) => ({ ...f, category: v }))}
                      style={chipStyle(filters.category === v)}
                    >
                      {v === null ? 'Все' : PROJECT_CATEGORIES.find((c) => c.key === v)?.label}
                    </div>
                  ))}
                </div>
                <div style={groupLabelStyle}>Статус</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {([null, ...PROJECT_STATES.map((s) => s.key)] as (ProjectState | null)[]).map((v) => (
                    <div
                      key={v ?? 'all'}
                      onClick={() => setFilters((f) => ({ ...f, state: v }))}
                      style={chipStyle(filters.state === v)}
                    >
                      {v === null ? 'Все' : PROJECT_STATES.find((s) => s.key === v)?.label}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Сортировка ── */}
          <div style={{ position: 'relative' }}>
            <div
              onClick={() => {
                setSortOpen((v) => !v);
                setFiltersOpen(false);
              }}
              role="button"
              aria-label={sortOpen ? 'Скрыть сортировку' : 'Сортировка'}
              title="Сортировка"
              style={circleStyle(sortOpen)}
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ color: sortOpen ? COLORS.gold : COLORS.textFaint }}>
                <line x1="2.5" y1="4" x2="11" y2="4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                <line x1="2.5" y1="8" x2="8.5" y2="8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                <line x1="2.5" y1="12" x2="6" y2="12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </div>
            {sortOpen && (
              <div style={{ ...panelStyle, minWidth: 170, padding: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {PROJECT_SORT_MODES.map((m) => {
                  const active = sortMode === m.key;
                  return (
                    <div
                      key={m.key}
                      onClick={() => {
                        setSortMode(m.key);
                        setSortOpen(false);
                      }}
                      style={{
                        fontSize: fs(12),
                        padding: '8px 10px',
                        borderRadius: 2,
                        cursor: 'pointer',
                        background: active ? 'rgba(var(--gold-rgb),0.1)' : 'transparent',
                        color: active ? COLORS.gold : COLORS.textFaint,
                        letterSpacing: '0.5px',
                        textTransform: 'uppercase',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {active ? '• ' : ''}
                      {m.label}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <span onClick={onCreateProject} role="button" style={{ fontSize: fs(12), color: COLORS.gold, cursor: 'pointer', letterSpacing: '0.5px' }}>
            + Новый
          </span>
        </div>
      </div>

      {clientProjects.length === 0 ? (
        <div style={{ fontSize: fs(14), color: COLORS.textGhost, fontStyle: 'italic' }}>
          Пока нет проектов — нажмите «+ Новый», чтобы добавить первый
        </div>
      ) : visibleProjects.length === 0 ? (
        <div style={{ fontSize: fs(14), color: COLORS.textGhost, fontStyle: 'italic' }}>
          Под фильтр не подошёл ни один проект
        </div>
      ) : (
        <div className="inka-client-grid" style={{ display: 'grid', gap: 10 }}>
          {visibleProjects.map((p) => (
            <ProjectCard key={p.id} project={p} clientName={null} onClick={() => onOpenProject(p)} />
          ))}
        </div>
      )}

      {(orphanSessionCount > 0 || orphanConsultationCount > 0) && (
        <div style={{ marginTop: 22 }}>
          <div style={{ ...groupLabelStyle, marginBottom: 8 }}>Записи без проекта</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {orphanSessionCount > 0 && (
              <div
                onClick={() => onOpenOrphans('sessions')}
                role="button"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '9px 11px',
                  borderRadius: 2,
                  cursor: 'pointer',
                  border: '1px solid rgba(var(--gold-rgb),0.15)',
                  background: 'rgba(var(--surface-rgb),0.018)',
                }}
              >
                <span style={{ fontSize: fs(13), color: COLORS.textPrimary }}>Сессии</span>
                <span style={{ fontSize: fs(12), color: COLORS.textGhost }}>{orphanSessionCount}</span>
              </div>
            )}
            {orphanConsultationCount > 0 && (
              <div
                onClick={() => onOpenOrphans('consultations')}
                role="button"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '9px 11px',
                  borderRadius: 2,
                  cursor: 'pointer',
                  border: '1px solid rgba(var(--gold-rgb),0.15)',
                  background: 'rgba(var(--surface-rgb),0.018)',
                }}
              >
                <span style={{ fontSize: fs(13), color: COLORS.textPrimary }}>Консультации</span>
                <span style={{ fontSize: fs(12), color: COLORS.textGhost }}>{orphanConsultationCount}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Info tab ──
function InfoTab({
  client,
  onSave,
  onAddDocument,
  onRemoveDocument,
}: {
  client: Client;
  onSave: (client: Client) => void;
  onAddDocument: (doc: ClientDocument) => void;
  onRemoveDocument: (docId: string) => void;
}) {
  const metaCell = (span = false): React.CSSProperties => ({
    background: 'rgba(var(--surface-rgb),0.018)',
    border: '1px solid rgba(var(--gold-rgb),0.1)',
    borderRadius: 2,
    padding: 13,
    gridColumn: span ? 'span 2' : undefined,
  });

  return (
    <div style={{ animation: 'fadeSlideIn 0.3s ease' }}>
      {/* Contacts — moved to the top (was master notes) */}
      <ContactsSection client={client} onSave={onSave} first />

      <SectionDivider />

      {/* Meta grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div style={metaCell()}>
          <MetaLabel>Стиль</MetaLabel>
          <div style={{ fontSize: fs(15), color: client.color, fontWeight: 600 }}>{stylesLabel(client) || '—'}</div>
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

      {/* Language auto-generated messages (reminders etc.) get written in —
          see REMINDER_TEXTS/localizedWhen above. */}
      <ClientLanguageSection client={client} onSave={onSave} />

      {/* Skin: type + tone + notes */}
      <SkinSection client={client} onSave={onSave} />

      {/* Master's own notes — written inline right here, at the bottom */}
      <MasterNoteSection client={client} onSave={onSave} />

      {/* Attachments — documents / photos / any file for this client */}
      <AttachmentsSection client={client} onAddDocument={onAddDocument} onRemoveDocument={onRemoveDocument} />
    </div>
  );
}

// ── Client language — which language auto-generated messages (reminders
// etc., see REMINDER_TEXTS) get written in for this client. ──
function ClientLanguageSection({ client, onSave }: { client: Client; onSave: (client: Client) => void }) {
  return (
    <div style={{ marginTop: 22 }}>
      <SectionDivider />
      <SectionHeader>Язык клиента</SectionHeader>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        {CLIENT_LANGUAGES.map((o) => (
          <div
            key={o.value}
            onClick={() => onSave({ ...client, language: o.value })}
            style={{
              flex: 1,
              textAlign: 'center',
              padding: '10px 0',
              borderRadius: 2,
              cursor: 'pointer',
              fontSize: fs(13),
              letterSpacing: '0.5px',
              border: client.language === o.value ? '1px solid rgba(var(--gold-rgb),0.6)' : '1px solid rgba(var(--gold-rgb),0.15)',
              background: client.language === o.value ? 'rgba(var(--gold-rgb),0.08)' : 'transparent',
              color: client.language === o.value ? COLORS.gold : COLORS.textFaint,
            }}
          >
            {o.label}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Master notes (written inline from the info tab, drop-cap styled) ──
function MasterNoteSection({ client, onSave }: { client: Client; onSave: (client: Client) => void }) {
  const [value, setValue] = useState(client.masterNote || '');
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setValue(client.masterNote || '');
    setEditing(false);
  }, [client.id]);

  const save = () => {
    setEditing(false);
    if (value.trim() !== (client.masterNote || '')) onSave({ ...client, masterNote: value.trim() });
  };

  const note = client.masterNote || '';
  return (
    <div style={{ marginTop: 22 }}>
      <SectionDivider />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <SectionHeader>Заметки мастера</SectionHeader>
        {!editing && (
          <span onClick={() => setEditing(true)} style={{ fontSize: fs(13), color: COLORS.gold, fontStyle: 'italic', cursor: 'pointer', marginTop: -10 }}>
            {note ? 'править' : 'добавить'}
          </span>
        )}
      </div>
      {editing ? (
        <textarea
          dir="auto"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
          placeholder="Ваши личные заметки о работе с клиентом..."
          style={{
            width: '100%',
            background: 'rgba(var(--surface-rgb),0.018)',
            border: '1px solid rgba(var(--gold-rgb),0.1)',
            borderRadius: 2,
            padding: '11px 13px',
            fontFamily: "'Inter', sans-serif",
            color: COLORS.textPrimary,
            outline: 'none',
            resize: 'none',
            height: 110,
            fontStyle: 'italic',
            lineHeight: 1.6,
            letterSpacing: '0.3px',
          }}
        />
      ) : note ? (
        <div dir="auto" onClick={() => setEditing(true)} style={{ overflow: 'hidden', lineHeight: 1, cursor: 'text' }}>
          <span
            style={{
              fontFamily: DROP_CAP_FONT,
              fontSize: fs(52),
              lineHeight: 0.81,
              color: 'rgba(var(--gold-rgb),0.42)',
              float: isRTL(note) ? 'right' : 'left',
              [isRTL(note) ? 'marginLeft' : 'marginRight']: 7,
              paddingBottom: 2,
              marginTop: 1,
            }}
          >
            {note.charAt(0)}
          </span>
          <span style={{ fontSize: fs(17), color: 'var(--text-soft)', lineHeight: 1.7, fontStyle: 'italic', display: 'block', overflow: 'hidden' }}>
            {note.slice(1)}
          </span>
        </div>
      ) : (
        <div onClick={() => setEditing(true)} style={{ fontSize: fs(15), color: COLORS.textGhost, fontStyle: 'italic', cursor: 'text' }}>
          Заметок пока нет — нажмите, чтобы добавить.
        </div>
      )}
    </div>
  );
}


function SkinSection({ client, onSave }: { client: Client; onSave: (client: Client) => void }) {
  const [skinType, setSkinType] = useState(client.skinType || '');
  const [allergies, setAllergies] = useState(client.allergies || '');
  const [skinReactions, setSkinReactions] = useState(client.skinReactions || '');

  useEffect(() => {
    setSkinType(client.skinType || '');
    setAllergies(client.allergies || '');
    setSkinReactions(client.skinReactions || '');
  }, [client.id]);

  const saveType = (value: string) => {
    setSkinType(value);
    if (value !== (client.skinType || '')) onSave({ ...client, skinType: value });
  };
  const saveTone = (tone: string) => {
    const next = tone === client.skinTone ? '' : tone;
    onSave({ ...client, skinTone: next });
  };
  const saveAllergies = () => {
    if (allergies.trim() !== (client.allergies || '')) onSave({ ...client, allergies: allergies.trim() });
  };
  const saveSkinReactions = () => {
    if (skinReactions.trim() !== (client.skinReactions || '')) onSave({ ...client, skinReactions: skinReactions.trim() });
  };

  return (
    <div style={{ marginTop: 22 }}>
      <SectionDivider />
      <SectionHeader>Кожа</SectionHeader>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: fs(11), color: COLORS.textGhost, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 8 }}>
          Тон кожи
        </div>
        <SkinTonePalette value={client.skinTone || ''} onPick={saveTone} />
      </div>

      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: fs(11), color: COLORS.textGhost, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 6 }}>
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
            fontFamily: "'Inter', sans-serif",
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

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: fs(11), color: COLORS.textGhost, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 6 }}>
          Аллергии
        </div>
        <textarea
          value={allergies}
          onChange={(e) => setAllergies(e.target.value)}
          onBlur={saveAllergies}
          placeholder="Перечислите известные аллергии..."
          style={{
            width: '100%',
            background: 'rgba(var(--surface-rgb),0.018)',
            border: '1px solid rgba(var(--gold-rgb),0.1)',
            borderRadius: 2,
            padding: '11px 13px',
            fontFamily: "'Inter', sans-serif",
            color: COLORS.textPrimary,
            outline: 'none',
            resize: 'none',
            height: 60,
            letterSpacing: '0.3px',
          }}
        />
      </div>

      <div>
        <div style={{ fontSize: fs(11), color: COLORS.textGhost, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 6 }}>
          Реакции кожи
        </div>
        <textarea
          value={skinReactions}
          onChange={(e) => setSkinReactions(e.target.value)}
          onBlur={saveSkinReactions}
          placeholder="Опишите возможные реакции кожи..."
          style={{
            width: '100%',
            background: 'rgba(var(--surface-rgb),0.018)',
            border: '1px solid rgba(var(--gold-rgb),0.1)',
            borderRadius: 2,
            padding: '11px 13px',
            fontFamily: "'Inter', sans-serif",
            color: COLORS.textPrimary,
            outline: 'none',
            resize: 'none',
            height: 60,
            letterSpacing: '0.3px',
          }}
        />
      </div>
    </div>
  );
}

// ── Contacts (phone + chat links) ──
function ContactsSection({ client, onSave, first }: { client: Client; onSave: (client: Client) => void; first?: boolean }) {
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
    const link: ChatLink = { id: crypto.randomUUID(), platform, url: buildChatLink(platform, raw) };
    onSave({ ...client, chatLinks: [...(client.chatLinks || []), link] });
  };
  const removeLink = (id: string) => onSave({ ...client, chatLinks: (client.chatLinks || []).filter((l) => l.id !== id) });

  return (
    <div style={{ marginTop: first ? 0 : 22 }}>
      {!first && <SectionDivider />}

      <div
        style={{
          fontFamily: "'Kelly Slab', 'Playfair Display', serif",
          fontSize: fs(11),
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
              fontFamily: "'Inter', sans-serif",
              color: COLORS.textPrimary,
              letterSpacing: '0.3px',
            }}
          />
        ) : client.phone ? (
          <>
            <a
              href={`tel:${client.phone.replace(/[^\d+]/g, '')}`}
              style={{ flex: 1, fontSize: fs(15), color: COLORS.textPrimary, textDecoration: 'none', letterSpacing: '0.3px' }}
            >
              {client.phone}
            </a>
            <span
              onClick={() => setEditingPhone(true)}
              style={{ fontSize: fs(13), color: COLORS.textFaint, fontStyle: 'italic', cursor: 'pointer' }}
            >
              изменить
            </span>
          </>
        ) : (
          <span
            onClick={() => setEditingPhone(true)}
            style={{ flex: 1, fontSize: fs(15), color: COLORS.textGhost, fontStyle: 'italic', cursor: 'pointer' }}
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
            <span style={{ fontSize: fs(15), color: COLORS.gold, letterSpacing: '0.5px' }}>{PLATFORM_LABELS[link.platform]}</span>
            <span
              style={{
                fontSize: fs(13),
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
            style={{ background: 'none', border: 'none', color: COLORS.textFaint, cursor: 'pointer', flexShrink: 0, fontSize: fs(15) }}
          >
            ✕
          </button>
        </div>
      ))}

      <AddChatLinkForm onAdd={addLink} />
    </div>
  );
}

// One "label: value" line inside a session card (краски / иглы / реакция кожи).
function SessionMeta({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 6, fontSize: fs(15), lineHeight: 1.4 }}>
      <span style={{ color: COLORS.textFaint, letterSpacing: '0.5px', textTransform: 'uppercase', flexShrink: 0, fontSize: fs(11), paddingTop: 2 }}>
        {label}
      </span>
      <span dir="auto" style={{ flex: 1, minWidth: 0, color: 'var(--text-soft)', fontStyle: 'italic', wordBreak: 'break-word' }}>
        {value}
      </span>
    </div>
  );
}

// A note clamped to a few lines with a «Показать полностью ▾ / Свернуть ▴»
// toggle — only shown when the text actually overflows that clamp, so a
// short note never grows an affordance it doesn't need. Measured via
// scrollHeight vs clientHeight: -webkit-line-clamp hides the extra content
// visually but scrollHeight still reports the full, un-clamped height.
function ExpandableText({ text, style, clampLines = 4 }: { text: string; style?: React.CSSProperties; clampLines?: number }) {
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setExpanded(false);
    const el = ref.current;
    if (el) setOverflowing(el.scrollHeight > el.clientHeight + 1);
  }, [text]);

  return (
    <div>
      <div
        ref={ref}
        dir="auto"
        style={{
          ...style,
          ...(expanded
            ? {}
            : { display: '-webkit-box', WebkitLineClamp: clampLines, WebkitBoxOrient: 'vertical', overflow: 'hidden' }),
        }}
      >
        {text}
      </div>
      {overflowing && (
        <span
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          role="button"
          style={{ fontSize: fs(11), color: COLORS.gold, fontStyle: 'italic', cursor: 'pointer', marginTop: 4, display: 'inline-block' }}
        >
          {expanded ? 'Свернуть ▴' : 'Показать полностью ▾'}
        </span>
      )}
    </div>
  );
}

// Small ✕ on a session card; a tap reveals "Удалить? Да/Нет" inline.
function SessionDeleteControl({
  onDelete,
  confirming,
  onConfirmingChange,
}: {
  onDelete: () => void;
  // Controlled so a swiped-open row (see useSwipeToReveal) can reveal the
  // same confirm this «×» would — one confirm state either way, not two.
  confirming: boolean;
  onConfirmingChange: (v: boolean) => void;
}) {
  if (confirming) {
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: fs(12), color: '#A85A66', fontStyle: 'italic' }}>Удалить?</span>
        <span onClick={onDelete} style={{ fontSize: fs(12), color: '#C56676', textTransform: 'uppercase', letterSpacing: '0.5px', cursor: 'pointer' }}>
          Да
        </span>
        <span
          onClick={() => onConfirmingChange(false)}
          style={{ fontSize: fs(12), color: COLORS.textFaint, textTransform: 'uppercase', letterSpacing: '0.5px', cursor: 'pointer' }}
        >
          Нет
        </span>
      </span>
    );
  }

  return (
    <span onClick={() => onConfirmingChange(true)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }} aria-label="Удалить сессию">
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ color: COLORS.textFaint }}>
        <line x1="3" y1="3" x2="13" y2="13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <line x1="13" y1="3" x2="3" y2="13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    </span>
  );
}


// A session's own date when it has one; otherwise its creation time (the
// timestamp baked into its id — see handleAddSession), converted to the same
// yyyy-mm-dd shape. This lets an undated session slot into the timeline where
// it was actually added, instead of always sinking to the very bottom below
// every dated session regardless of when it was created.
function sessionTimelineKey(session: Session): string {
  if (ISO_DATE_RE.test(session.date)) return session.date;
  const createdAt = Number(session.id);
  return Number.isFinite(createdAt) ? new Date(createdAt).toISOString().slice(0, 10) : '';
}

// ── Sessions tab (also used, filtered, for the separate Консультации tab) ──
// Sessions and consultations used to share one combined timeline under a
// single «Сессии» tab; they're now split into their own tabs, so this
// component takes `kind` to render just the one list, sorted the same way
// (most recent first; an undated session sorts by when it was added instead).
function SessionsTab({
  kind,
  client,
  onEditSession,
  onDeleteSession,
  onUpdateSessionPhotos,
  onToggleSessionDone,
  onChainSession,
  onEditConsultation,
  onDeleteConsultation,
  onConvertConsultation,
  onChainConsultation,
  onViewSession,
  onViewConsultation,
}: {
  kind: 'sessions' | 'consultations';
  client: Client;
  onEditSession: (session: Session) => void;
  onDeleteSession: (sessionId: string) => void;
  onUpdateSessionPhotos: (sessionId: string, photos: string[]) => void;
  onToggleSessionDone: (sessionId: string) => void;
  // «Назначить следующую сессию» — см. TattoDiary's startChainNextSession.
  onChainSession: (session: Session) => void;
  onEditConsultation: (consultation: Consultation) => void;
  onDeleteConsultation: (consultationId: string) => void;
  onConvertConsultation: (consultation: Consultation) => void;
  onChainConsultation: (consultation: Consultation) => void;
  onViewSession: (session: Session) => void;
  onViewConsultation: (consultation: Consultation) => void;
}) {
  if (kind === 'consultations') {
    const consultations = [...client.consultations].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return (
      <div style={{ animation: 'fadeSlideIn 0.3s ease' }}>
        {consultations.length === 0 && (
          <div style={{ fontSize: fs(15), color: COLORS.textGhost, fontStyle: 'italic', marginBottom: 14 }}>Консультаций пока нет.</div>
        )}
        {consultations.map((consultation) => {
          // «Следующая консультация» уже назначена — открываем её вместо
          // повторного создания (см. Consultation.nextConsultationId).
          // Ссылка не проверяется на существование цели намеренно — тот же
          // допустимый dangling-паттерн, что convertedToSessionId уже
          // использует ниже (удаление одной записи не чинит ссылки соседей,
          // см. milestone «удаление консультации не должно ломать остальные»).
          const nextConsultation = consultation.nextConsultationId
            ? client.consultations.find((c) => c.id === consultation.nextConsultationId) ?? null
            : null;
          return (
            <ConsultationRow
              key={consultation.id}
              consultation={consultation}
              number={getConsultationNumber(client.consultations, consultation)}
              deletable={isConsultationDeletable(consultation, client.sessions)}
              onEdit={onEditConsultation}
              onDelete={() => onDeleteConsultation(consultation.id)}
              onConvert={() => onConvertConsultation(consultation)}
              onChainNext={() => onChainConsultation(consultation)}
              onOpenNext={nextConsultation ? () => onViewConsultation(nextConsultation) : undefined}
              onView={onViewConsultation}
            />
          );
        })}
      </div>
    );
  }

  const sessions = [...client.sessions].sort((a, b) => sessionTimelineKey(b).localeCompare(sessionTimelineKey(a)));
  return (
    <div style={{ animation: 'fadeSlideIn 0.3s ease' }}>
      {sessions.length === 0 && (
        <div style={{ fontSize: fs(15), color: COLORS.textGhost, fontStyle: 'italic', marginBottom: 14 }}>Сессий пока нет.</div>
      )}
      {sessions.map((session) => {
        // «Следующая сессия» уже назначена — открываем её вместо повторного
        // создания (см. Session.nextSessionId). Тот же допустимый
        // dangling-паттерн, что nextConsultationId уже использует выше.
        const nextSession = session.nextSessionId
          ? client.sessions.find((s) => s.id === session.nextSessionId) ?? null
          : null;
        return (
          <SessionRow
            key={session.id}
            session={session}
            onEdit={onEditSession}
            onDelete={() => onDeleteSession(session.id)}
            onView={onViewSession}
            onToggleDone={() => onToggleSessionDone(session.id)}
            onUpdatePhotos={(photos) => onUpdateSessionPhotos(session.id, photos)}
            onChainNext={() => onChainSession(session)}
            onOpenNext={nextSession ? () => onViewSession(nextSession) : undefined}
          />
        );
      })}
    </div>
  );
}

// One consultation card in the client's dated timeline. Swiping the card
// (see useSwipeToReveal) reveals the same «Удалить? Да/Нет» its «×» does —
// swiping never deletes outright.
function ConsultationRow({
  consultation,
  number,
  deletable,
  onEdit,
  onDelete,
  onConvert,
  onChainNext,
  onOpenNext,
  onView,
}: {
  consultation: Consultation;
  // Порядковый номер внутри проекта — «Консультация N» (см.
  // getConsultationNumber в domain/projectSelectors.ts); null для
  // консультации без проекта, тогда просто «Консультация».
  number: number | null;
  // Computed by the caller (isConsultationDeletable(consultation,
  // client.sessions) — see SessionsTab above), not re-derived here: this
  // row only has the one consultation, not the client's full session list
  // needed to check the two-way link (see hasLiveConvertedSession in
  // domain/consultation.ts) — status alone isn't enough, a 'converted'
  // status with no live linked session must stay deletable.
  deletable: boolean;
  onEdit: (consultation: Consultation) => void;
  onDelete: () => void;
  onConvert: () => void;
  // «Назначить следующую консультацию» — см. TattoDiary's
  // startChainNextConsultation.
  onChainNext: () => void;
  // Следующая консультация уже назначена (Consultation.nextConsultationId) —
  // открывает её вместо повторного создания. undefined, если следующей нет.
  onOpenNext?: () => void;
  onView: (consultation: Consultation) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  // A converted consultation backed by a live linked session (deletable ===
  // false) isn't deleted here — that would leave the session pointing at a
  // consultation that no longer exists (see deleteConsultation/
  // applyConsultationRestoration in TattoDiary.tsx, and
  // isConsultationDeletable in domain/consultation.ts, the single source of
  // truth both places share). Swipe-to-reveal is a no-op and the «×»
  // control below is hidden entirely for this case — delete the linked
  // session first instead.
  const { swipeStyle, swipeHandlers, dragging } = useSwipeToReveal(deletable ? () => setConfirming(true) : () => {});
  const meta = urgencyMeta(consultation.urgency);
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        onClick={() => onView(consultation)}
        {...(deletable ? swipeHandlers : {})}
        style={{
          background: 'rgba(var(--surface-rgb),0.018)',
          border: '1px solid rgba(var(--gold-rgb),0.22)',
          borderRadius: 2,
          padding: '12px 14px',
          cursor: 'pointer',
          opacity: consultation.status === 'converted' ? 0.55 : 1,
          transition: dragging ? 'none' : 'transform 0.2s ease',
          ...swipeStyle,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 7 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: fs(10), color: COLORS.gold, letterSpacing: '1.5px', textTransform: 'uppercase' }}>
              {number ? `Консультация ${number}` : 'Консультация'}
            </div>
            <div style={{ fontSize: fs(12), color: COLORS.textGhost, marginTop: 2, letterSpacing: '0.3px' }}>
              {formatDate(consultation.date) || 'Дата не указана'}
              {consultation.time && <span style={{ color: COLORS.gold }}> · {consultation.time}</span>}
            </div>
          </div>
          {/* Controls sit outside the card's tap-to-view: their own clicks
              must not also open the viewer. */}
          <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 11, flexShrink: 0 }}>
            {(consultation.cancelled || consultation.status === 'converted') && (
              <span
                style={{
                  fontSize: fs(10),
                  color: COLORS.textFaint,
                  border: '1px solid rgba(var(--gold-rgb),0.2)',
                  borderRadius: 2,
                  padding: '2px 6px',
                  letterSpacing: '0.8px',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                }}
              >
                {consultation.status === 'converted' ? 'Переведена в сессию' : 'Отменена'}
              </span>
            )}
            <span style={{ fontSize: fs(13) }} title={meta.label}>{meta.emoji}</span>
            {/* Consultation happened, work session was agreed — moves this
                record into a session instead of leaving a stale duplicate;
                see TattoDiary's startConvertConsultationToSession. Hidden for
                a cancelled or already-converted consultation — nothing left
                to convert. */}
            {!consultation.cancelled && consultation.status !== 'converted' && (
              <div
                className="inka-back"
                onClick={onConvert}
                style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', opacity: 0.75 }}
                title="Перевести в сессию"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ color: COLORS.gold }}>
                  <path d="M2 8H13M13 8L9 4M13 8L9 12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            )}
            {/* «Назначить следующую консультацию» — консультация никогда не
                заменяется другой (см. Consultation.previousConsultationId),
                доступно независимо от «Перевести в сессию» и не зависит от
                статуса. Once a next one exists, taps open it instead of
                creating a duplicate branch. Hidden only for a cancelled
                consultation — nothing to continue. */}
            {!consultation.cancelled && (
              <div
                className="inka-back"
                onClick={onOpenNext ?? onChainNext}
                style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', opacity: 0.75 }}
                title={onOpenNext ? 'Открыть следующую консультацию' : 'Назначить следующую консультацию'}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ color: COLORS.gold }}>
                  {onOpenNext ? (
                    <path d="M4 3L11 8L4 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  ) : (
                    <path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  )}
                </svg>
              </div>
            )}
            <div
              className="inka-back"
              onClick={() => onEdit(consultation)}
              style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', opacity: 0.75 }}
              title="Редактировать консультацию"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ color: COLORS.gold }}>
                <path d="M11 2.5L13.5 5L5.5 13H3V10.5L11 2.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
              </svg>
            </div>
            {/* Extra gap + divider before delete — pencil and × used to sit
                right next to each other, easy to mis-tap. Hidden entirely
                for a converted consultation — see `deletable` above. */}
            {deletable && (
              <div style={{ display: 'flex', alignItems: 'center', paddingLeft: 10, marginLeft: 2, borderLeft: '1px solid rgba(var(--gold-rgb),0.15)' }}>
                <SessionDeleteControl onDelete={onDelete} confirming={confirming} onConfirmingChange={setConfirming} />
              </div>
            )}
          </div>
        </div>
        {/* Photos moved up — right under the header — and read-only here. */}
        {consultation.photos.length > 0 && (
          <div onClick={(e) => e.stopPropagation()} style={{ marginBottom: 4 }}>
            <SessionPhotos photos={consultation.photos} onChange={() => {}} allowDelete={false} readOnly />
          </div>
        )}
        {(consultation.area || consultation.style) && (
          <div dir="auto" style={{ fontSize: fs(12), color: COLORS.textFaint, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 7 }}>
            {[consultation.area, consultation.style].filter(Boolean).join(' · ')}
          </div>
        )}
        {consultation.generalNotes && (
          <ExpandableText text={consultation.generalNotes} style={{ fontSize: fs(15), color: 'var(--text-soft2)', fontStyle: 'italic', lineHeight: 1.6 }} />
        )}
        {consultation.feeling && (
          <div style={{ marginTop: 6 }}>
            <SessionMeta label="Чувство / ощущение" value={consultation.feeling} />
          </div>
        )}
        {consultation.inspirationSources && (
          <div style={{ marginTop: 6 }}>
            <SessionMeta label="Источники вдохновения" value={consultation.inspirationSources} />
          </div>
        )}
        {consultation.creative && (
          <div style={{ marginTop: 6 }}>
            <SessionMeta label="Креатив" value={consultation.creative} />
          </div>
        )}
        {consultation.outcome && (
          <div style={{ marginTop: 6 }}>
            <SessionMeta label="Итог" value={consultation.outcome} />
          </div>
        )}
      </div>
    </div>
  );
}

// One session card in the client's dated timeline — same swipe-to-confirm
// delete as ConsultationRow above.
function SessionRow({
  session,
  onEdit,
  onDelete,
  onView,
  onToggleDone,
  onUpdatePhotos,
  onChainNext,
  onOpenNext,
}: {
  session: Session;
  onEdit: (session: Session) => void;
  onDelete: () => void;
  onView: (session: Session) => void;
  onToggleDone: () => void;
  onUpdatePhotos: (photos: string[]) => void;
  // «Назначить следующую сессию» — см. TattoDiary's startChainNextSession.
  onChainNext: () => void;
  // Следующая сессия уже назначена (Session.nextSessionId) — открывает её
  // вместо повторного создания. undefined, если следующей нет.
  onOpenNext?: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const { swipeStyle, swipeHandlers, dragging } = useSwipeToReveal(() => setConfirming(true));
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        onClick={() => onView(session)}
        {...swipeHandlers}
        style={{
          background: 'rgba(var(--surface-rgb),0.018)',
          border: '1px solid rgba(var(--gold-rgb),0.1)',
          borderRadius: 2,
          padding: '12px 14px',
          cursor: 'pointer',
          transition: dragging ? 'none' : 'transform 0.2s ease',
          ...swipeStyle,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 7 }}>
          <div style={{ minWidth: 0 }}>
            <div dir="auto" style={{ fontSize: fs(13), color: COLORS.textGhost, fontStyle: 'italic', letterSpacing: '0.3px' }}>
              {session.name || formatDate(session.date) || 'Сессия'}
            </div>
            {session.name && formatDate(session.date) && (
              <div style={{ fontSize: fs(12), color: COLORS.textGhost, marginTop: 2, letterSpacing: '0.3px' }}>{formatDate(session.date)}</div>
            )}
          </div>
          <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 11, flexShrink: 0 }}>
            {session.cancelled && (
              <span
                style={{
                  fontSize: fs(10),
                  color: COLORS.textFaint,
                  border: '1px solid rgba(var(--gold-rgb),0.2)',
                  borderRadius: 2,
                  padding: '2px 6px',
                  letterSpacing: '0.8px',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                }}
              >
                Отменена
              </span>
            )}
            {!session.done && !session.cancelled && (
              <span
                onClick={onToggleDone}
                title="Отметить выполненной"
                style={{
                  fontSize: fs(10),
                  color: COLORS.gold,
                  border: '1px solid rgba(var(--gold-rgb),0.4)',
                  borderRadius: 2,
                  padding: '2px 6px',
                  letterSpacing: '0.8px',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Запланирована
              </span>
            )}
            {session.done && session.healed && (
              <span
                title="Зажила"
                style={{
                  fontSize: fs(10),
                  color: COLORS.textFaint,
                  border: '1px solid rgba(var(--gold-rgb),0.2)',
                  borderRadius: 2,
                  padding: '2px 6px',
                  letterSpacing: '0.8px',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                }}
              >
                Зажила
              </span>
            )}
            {session.duration && <span style={{ fontSize: fs(13), color: COLORS.textGhost, fontStyle: 'italic' }}>{session.duration}</span>}
            {/* «Назначить следующую сессию» — сессия никогда не заменяется
                другой (см. Session.previousSessionId). Once a next one
                exists, taps open it instead of creating a duplicate branch.
                Hidden only for a cancelled session — nothing to continue. */}
            {!session.cancelled && (
              <div
                className="inka-back"
                onClick={onOpenNext ?? onChainNext}
                style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', opacity: 0.75 }}
                title={onOpenNext ? 'Открыть следующую сессию' : 'Назначить следующую сессию'}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ color: COLORS.gold }}>
                  {onOpenNext ? (
                    <path d="M4 3L11 8L4 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  ) : (
                    <path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  )}
                </svg>
              </div>
            )}
            <div
              className="inka-back"
              onClick={() => onEdit(session)}
              style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', opacity: 0.75 }}
              title="Редактировать сессию"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ color: COLORS.gold }}>
                <path d="M11 2.5L13.5 5L5.5 13H3V10.5L11 2.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
              </svg>
            </div>
            {/* Extra gap + divider before delete — pencil and × used to sit
                right next to each other, easy to mis-tap. */}
            <div style={{ display: 'flex', alignItems: 'center', paddingLeft: 10, marginLeft: 2, borderLeft: '1px solid rgba(var(--gold-rgb),0.15)' }}>
              <SessionDeleteControl onDelete={onDelete} confirming={confirming} onConfirmingChange={setConfirming} />
            </div>
          </div>
        </div>
        {/* Photos right under the header — same order as ConsultationRow.
            Still the card's own quick-add (onChange, allowDelete={false}),
            not the read-only viewer — this is the one place a photo can be
            added without opening the full edit form. */}
        <div onClick={(e) => e.stopPropagation()}>
          <SessionPhotos photos={session.photos} onChange={onUpdatePhotos} allowDelete={false} />
        </div>
        {session.area && (
          <div dir="auto" style={{ fontSize: fs(12), color: COLORS.textFaint, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 7 }}>
            {session.area}
          </div>
        )}
        {session.note && <ExpandableText text={session.note} style={{ fontSize: fs(15), color: 'var(--text-soft2)', fontStyle: 'italic', lineHeight: 1.6 }} />}
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
      </div>
    </div>
  );
}


// A single note row. In the client tab it shows text + urgency; in «Сводка» a
// client label (colour dot + name in plain type) is prepended.
export function NoteItem({
  note,
  onToggleDone,
  onDelete,
  onUpdatePhotos,
  onEdit,
  client,
  projects,
}: {
  note: ClientNote;
  onToggleDone: () => void;
  onDelete?: () => void;
  onUpdatePhotos?: (photos: string[]) => void;
  onEdit?: (text: string, urgency: UrgencyKey, projectId: string | null, dueDate: string | null) => void;
  client?: Client;
  // Candidate projects this note could be tied to — a client note only
  // offers that client's own projects, a master (client-less) note only
  // offers client-less projects. Omitted entirely hides the project field.
  projects?: Project[];
}) {
  const meta = urgencyMeta(note.urgency);
  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState(note.text);
  const [draftUrgency, setDraftUrgency] = useState<UrgencyKey>(note.urgency);
  const [draftProjectId, setDraftProjectId] = useState<string | null>(note.projectId);
  const [draftDueDate, setDraftDueDate] = useState(note.dueDate ?? '');
  // Actions (Выполнено/Изменить/Удалить) live behind a «⋮» overflow menu —
  // only the urgency symbol stays visible at rest, mirroring the filter bar.
  const [showActions, setShowActions] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  // Swiping the row is a shortcut straight to the same «Удалить? Да/Нет» —
  // it only reveals the confirm (via the «⋮» menu), never deletes outright.
  const { swipeStyle, swipeHandlers, dragging } = useSwipeToReveal(() => {
    setShowActions(true);
    setDeleteConfirm(true);
  });

  const startEdit = () => {
    setDraftText(note.text);
    setDraftUrgency(note.urgency);
    setDraftProjectId(note.projectId);
    setDraftDueDate(note.dueDate ?? '');
    setEditing(true);
    setShowActions(false);
  };
  const saveEdit = () => {
    const trimmed = draftText.trim();
    if (trimmed && onEdit) onEdit(trimmed, draftUrgency, draftProjectId, draftDueDate || null);
    setEditing(false);
  };

  const menuRowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 6px',
    borderRadius: 2,
    cursor: 'pointer',
    fontSize: fs(12.5),
    letterSpacing: '0.3px',
  };

  return (
    <div
      {...swipeHandlers}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        border: '1px solid rgba(var(--gold-rgb),0.12)',
        borderRadius: 2,
        padding: '10px 12px',
        background: 'rgba(var(--surface-rgb),0.018)',
        opacity: note.done ? 0.45 : 1,
        transition: dragging ? 'opacity 0.3s' : 'opacity 0.3s, transform 0.2s ease',
        ...swipeStyle,
      }}
    >
      {/* Status marker — decorative only, always visible. */}
      <span style={{ fontSize: fs(16), lineHeight: 1.2, flexShrink: 0 }}>{note.done ? DONE_EMOJI : meta.emoji}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        {client && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: client.color, flexShrink: 0 }} />
            <span dir="auto" style={{ fontSize: fs(12), color: 'var(--text-strong)', letterSpacing: '0.3px' }}>
              {[client.name, client.surname].filter(Boolean).join(' ')}
            </span>
          </div>
        )}
        {editing ? (
          <div onClick={(e) => e.stopPropagation()}>
            <textarea
              dir="auto"
              autoFocus
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              style={{
                width: '100%',
                background: 'rgba(var(--surface-rgb),0.03)',
                border: '1px solid rgba(var(--gold-rgb),0.3)',
                borderRadius: 2,
                padding: '9px 11px',
                fontFamily: "'Inter', sans-serif",
                color: COLORS.textPrimary,
                outline: 'none',
                resize: 'none',
                height: 64,
                fontStyle: 'italic',
                lineHeight: 1.5,
              }}
            />
            <div style={{ marginTop: 8 }}>
              <UrgencyChips value={draftUrgency} onPick={setDraftUrgency} />
            </div>
            {projects && projects.length > 0 && (
              <select
                value={draftProjectId ?? ''}
                onChange={(e) => setDraftProjectId(e.target.value || null)}
                style={{ ...INPUT_STYLE, marginTop: 8 }}
              >
                <option value="">— без проекта —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.title || 'Проект'}</option>
                ))}
              </select>
            )}
            <input
              type="date"
              value={draftDueDate}
              onChange={(e) => setDraftDueDate(e.target.value)}
              style={{ ...INPUT_STYLE, marginTop: 8 }}
            />
          </div>
        ) : (
          <div
            dir="auto"
            style={{
              fontSize: fs(15),
              color: note.done ? COLORS.textGhost : 'var(--text-soft)',
              fontStyle: 'italic',
              lineHeight: 1.5,
              textDecoration: note.done ? 'line-through' : 'none',
              wordBreak: 'break-word',
            }}
          >
            {note.text}
          </div>
        )}
        {note.dueDate && !editing && (
          <div style={{ fontSize: fs(10), color: COLORS.textGhost, letterSpacing: '0.5px', marginTop: 4 }}>
            Срок: {formatDate(note.dueDate)}
          </div>
        )}
        {!client && !editing && (
          <div style={{ fontSize: fs(10), color: COLORS.textGhost, letterSpacing: '1px', textTransform: 'uppercase', marginTop: 4 }}>
            {meta.emoji} {meta.label}
          </div>
        )}
        {onUpdatePhotos && !editing && <SessionPhotos photos={note.photos} onChange={onUpdatePhotos} allowDelete />}

        {/* Edit mode keeps its Save/Cancel buttons inside the body. */}
        {editing && (
          <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            <div
              onClick={saveEdit}
              style={{
                flex: '1 1 72px',
                padding: '7px 12px',
                textAlign: 'center',
                border: '1px solid rgba(var(--gold-rgb),0.3)',
                borderRadius: 2,
                cursor: 'pointer',
                color: COLORS.gold,
                fontSize: fs(11),
                letterSpacing: '1px',
                textTransform: 'uppercase',
                fontStyle: 'italic',
              }}
            >
              Сохранить
            </div>
            <div
              onClick={() => setEditing(false)}
              style={{
                flex: '1 1 72px',
                padding: '7px 12px',
                textAlign: 'center',
                border: '1px solid rgba(var(--gold-rgb),0.15)',
                borderRadius: 2,
                cursor: 'pointer',
                color: COLORS.textFaint,
                fontSize: fs(11),
                letterSpacing: '1px',
                textTransform: 'uppercase',
                fontStyle: 'italic',
              }}
            >
              Отмена
            </div>
          </div>
        )}
      </div>

      {/* «⋮» — Выполнено / Изменить / Удалить, collapsed exactly like the
          filter bar's overflow menu: one dot-icon at rest, a small opaque
          dropdown with labelled rows when tapped. */}
      {!editing && (
        <div style={{ position: 'relative', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
          <div
            onClick={() => {
              setShowActions((v) => !v);
              setDeleteConfirm(false);
            }}
            role="button"
            aria-label="Действия"
            style={{
              width: 26,
              height: 26,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              borderRadius: '50%',
              border: showActions ? '1px solid rgba(var(--gold-rgb),0.4)' : '1px solid transparent',
              background: showActions ? 'rgba(var(--gold-rgb),0.08)' : 'transparent',
            }}
          >
            <svg width="4" height="16" viewBox="0 0 4 16" fill="none">
              <circle cx="2" cy="2" r="1.6" fill={COLORS.textFaint} />
              <circle cx="2" cy="8" r="1.6" fill={COLORS.textFaint} />
              <circle cx="2" cy="14" r="1.6" fill={COLORS.textFaint} />
            </svg>
          </div>
          {showActions && (
            <>
              <div onClick={() => setShowActions(false)} style={{ position: 'fixed', inset: 0, zIndex: 15 }} />
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  right: 0,
                  width: 168,
                  background: COLORS.sheet,
                  border: '1px solid rgba(var(--gold-rgb),0.2)',
                  borderRadius: 4,
                  padding: 6,
                  boxShadow: '0 10px 28px rgba(0,0,0,0.4)',
                  zIndex: 17,
                }}
              >
                {deleteConfirm ? (
                  <div style={{ padding: '6px 6px 4px' }}>
                    <div style={{ fontSize: fs(12), color: '#A85A66', fontStyle: 'italic', marginBottom: 8 }}>Удалить заметку?</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <div
                        onClick={() => {
                          onDelete?.();
                          setShowActions(false);
                          setDeleteConfirm(false);
                        }}
                        style={{ flex: 1, textAlign: 'center', padding: '6px 0', fontSize: fs(11.5), color: '#C56676', textTransform: 'uppercase', letterSpacing: '0.5px', cursor: 'pointer', border: '1px solid rgba(138,48,64,0.4)', borderRadius: 2 }}
                      >
                        Да
                      </div>
                      <div
                        onClick={() => setDeleteConfirm(false)}
                        style={{ flex: 1, textAlign: 'center', padding: '6px 0', fontSize: fs(11.5), color: COLORS.textFaint, textTransform: 'uppercase', letterSpacing: '0.5px', cursor: 'pointer', border: '1px solid rgba(var(--gold-rgb),0.15)', borderRadius: 2 }}
                      >
                        Нет
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div
                      onClick={() => {
                        onToggleDone();
                        setShowActions(false);
                      }}
                      style={{ ...menuRowStyle, color: '#4A7A5A' }}
                    >
                      {note.done ? (
                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                          <path d="M6 3.5L3 6.5L6 9.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M3 6.5H9.5C11.4 6.5 13 8.1 13 10C13 11.9 11.4 13.5 9.5 13.5H6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : (
                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                          <path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                      {note.done ? 'Вернуть в работу' : 'Выполнено'}
                    </div>
                    {onEdit && (
                      <div onClick={startEdit} style={{ ...menuRowStyle, color: COLORS.gold }}>
                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                          <path d="M11 2.5L13.5 5L5.5 13H3V10.5L11 2.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                        </svg>
                        Изменить
                      </div>
                    )}
                    {onDelete && (
                      <div onClick={() => setDeleteConfirm(true)} style={{ ...menuRowStyle, color: '#A85A66' }}>
                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                          <line x1="4" y1="4" x2="12" y2="12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                          <line x1="12" y1="4" x2="4" y2="12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                        </svg>
                        Удалить
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── «Заметки и задачи» tab — notes (with urgency + done, own photos),
//     sorted by urgency. Attachments live on the Инфо tab. ──
function AdditionalTab({
  client,
  projects,
  onUpsertNote,
  onAddNote,
  onDeleteNote,
}: {
  client: Client;
  // This client's own projects — candidates a note/task can be tied to.
  projects: Project[];
  onUpsertNote: (note: ClientNote) => void;
  onAddNote: (text: string, urgency: UrgencyKey, photos: string[], dueDate: string | null, projectId: string | null) => void;
  onDeleteNote: (noteId: string) => void;
}) {
  const toggleDone = (n: ClientNote) => onUpsertNote({ ...n, done: !n.done });

  // Sorted by urgency (most urgent first); done notes sink to the bottom.
  const sortedNotes = [...client.notes].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    const r = urgencyRank(a.urgency) - urgencyRank(b.urgency);
    return r !== 0 ? r : b.createdDate.localeCompare(a.createdDate);
  });

  return (
    <div style={{ animation: 'fadeSlideIn 0.3s ease', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Notes */}
      <SectionHeader>Заметки</SectionHeader>
      {sortedNotes.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sortedNotes.map((n) => (
            <NoteItem
              key={n.id}
              note={n}
              projects={projects}
              onToggleDone={() => toggleDone(n)}
              onDelete={() => onDeleteNote(n.id)}
              onUpdatePhotos={(photos) => onUpsertNote({ ...n, photos })}
              onEdit={(text, urgency, projectId, dueDate) => onUpsertNote({ ...n, text, urgency, projectId, dueDate })}
            />
          ))}
        </div>
      )}
      {/* Клиент уже задан контекстом вкладки — picker клиента не нужен, а
          выбор проекта нужен: заметку можно сразу привязать к проекту. */}
      <NoteComposer
        projects={projects}
        presetClientId={client.id}
        onAdd={(text, urgency, photos, dueDate, _clientId, projectId) => onAddNote(text, urgency, photos, dueDate, projectId)}
      />
    </div>
  );
}

// ── Attachments (documents / photos / any file) — lives on the Инфо tab. ──
function AttachmentsSection({
  client,
  onAddDocument,
  onRemoveDocument,
}: {
  client: Client;
  onAddDocument: (doc: ClientDocument) => void;
  onRemoveDocument: (docId: string) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    const isImage = file.type.startsWith('image/');
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      // Сжимаем только фото — документы (PDF и т.п.) canvas не умеет
      // прочитать, и им это не нужно. См. downsizeForStorage.
      const fileUrl = isImage ? await downsizeForStorage(dataUrl).catch(() => dataUrl) : dataUrl;
      onAddDocument({
        id: crypto.randomUUID(),
        name: file.name,
        fileUrl,
        kind: isImage ? 'photo' : 'document',
        uploadedDate: new Date().toLocaleDateString('ru-RU'),
      });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <SectionDivider />
      <SectionHeader>Вложения</SectionHeader>
      {client.documents.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
              <span style={{ fontSize: fs(13), color: COLORS.gold }}>{doc.kind === 'photo' ? '◈' : '▤'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: fs(15), color: COLORS.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {doc.name}
                </div>
                <div style={{ fontSize: fs(11), color: COLORS.textGhost, letterSpacing: '0.4px', marginTop: 2 }}>{doc.uploadedDate}</div>
              </div>
              <button
                onClick={() => onRemoveDocument(doc.id)}
                style={{ background: 'none', border: 'none', color: COLORS.textFaint, cursor: 'pointer', flexShrink: 0, fontSize: fs(15) }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Single attach button (document / photo / any file), like in a session. */}
      <div
        className="inka-doc-primary"
        onClick={() => fileInput.current?.click()}
        style={{
          border: '1px solid rgba(var(--gold-rgb),0.32)',
          borderRadius: 2,
          padding: '13px 18px',
          cursor: 'pointer',
          background: 'rgba(var(--gold-rgb),0.05)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
        }}
      >
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
          <path d="M8 10.5V2.5M8 2.5L5 5.5M8 2.5L11 5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M2.5 10V12.5C2.5 13 2.9 13.5 3.5 13.5H12.5C13 13.5 13.5 13 13.5 12.5V10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
        <span style={{ fontSize: fs(15), color: COLORS.gold, letterSpacing: '1px', textTransform: 'uppercase' }}>Прикрепить файл</span>
      </div>

      <input
        ref={fileInput}
        type="file"
        style={{ display: 'none' }}
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
}
