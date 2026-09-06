import { useState } from 'react';
import { InkaLogo } from '../InkaLogo';
import { StarDivider } from '../icons/StarIcons';
import { type Client } from '../../domain/client';
import { type Project } from '../../domain/project';
import { type ClientNote } from '../../domain/task';
import { type UrgencyKey, URGENCY } from '../../domain/urgency';
import { clientNameFor, getProjectsByClientId, getWorkshopProjects } from '../../domain/projectSelectors';
import { urgencyRank } from '../../domain/taskSelectors';
import { ISO_DATE_RE, formatDate, todayISO } from '../../utils/dates';
import { COLORS, DONE_EMOJI, fs } from '../ui/designTokens';
import { TodayDateBadge } from '../ui/TodayDateBadge';
import { NoteItem } from './DetailScreen';
import { NoteComposer } from '../client/ClientControls';

// Вынесено из TattoDiary.tsx без изменения поведения, разметки и
// prop-driven контракта. Локальное состояние фильтров и composer сохранено.

function ReminderCloseButton({ onClick }: { onClick: () => void }) {
  return (
    <span
      onClick={onClick}
      role="button"
      aria-label="Закрыть"
      style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', flexShrink: 0, opacity: 0.55, padding: 2 }}
    >
      <svg width="11" height="11" viewBox="0 0 16 16" fill="none" style={{ color: COLORS.textFaint }}>
        <line x1="3" y1="3" x2="13" y2="13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <line x1="13" y1="3" x2="3" y2="13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    </span>
  );
}
// ===================== SUMMARY SCREEN («Сводка») =====================
// Aggregates notes from every client, tagged with the client's colour + name
// (plain type, no drop-cap). Filter by urgency and optionally include closed
// (🍀) notes; toggling done fades a note out.
export function SummaryScreen({
  clients,
  projects,
  onOpenProject,
  masterNotes,
  onToggleDone,
  onEditNote,
  onDeleteNote,
  onOpenClient,
  onOpenConsultation,
  onOpenSession,
  onAddMasterNote,
  onAddNote,
  onToggleMasterDone,
  onEditMasterNote,
  onDeleteMasterNote,
  showComposer,
  onShowComposerChange,
  filter,
  onFilterChange,
  onOpenCalendar,
}: {
  clients: Client[];
  // Active projects (Мастерская/клиентские) whose next action is due today
  // or overdue — surfaced here independently of the sessions/consultations
  // feed above, see «Активные проекты» below.
  projects: Project[];
  onOpenProject: (project: Project) => void;
  masterNotes: ClientNote[];
  onToggleDone: (clientId: string, note: ClientNote) => void;
  onEditNote: (clientId: string, note: ClientNote) => void;
  onDeleteNote: (clientId: string, noteId: string) => void;
  onOpenClient: (id: string) => void;
  onOpenConsultation: (clientId: string, consultationId: string) => void;
  onOpenSession: (clientId: string, sessionId: string) => void;
  onAddMasterNote: (text: string, urgency: UrgencyKey, photos: string[], dueDate: string | null, projectId: string | null) => void;
  // Lets the composer attach the new note straight to a client (picked from
  // the dropdown it shows) instead of always creating a client-less one —
  // same shape as AdditionalTab's onAddNote, just clientId-parameterized
  // since «Сводка» isn't scoped to a single client.
  onAddNote: (clientId: string, text: string, urgency: UrgencyKey, photos: string[], dueDate: string | null, projectId: string | null) => void;
  onToggleMasterDone: (note: ClientNote) => void;
  onEditMasterNote: (note: ClientNote) => void;
  onDeleteMasterNote: (noteId: string) => void;
  // Lifted so the nav FAB's contextual create action can open it too — see
  // onCreate in the App shell.
  showComposer: boolean;
  onShowComposerChange: (open: boolean) => void;
  // Also lifted — so Админка's stat blocks can land here pre-filtered to a
  // specific urgency (e.g. tapping «Срочно» opens this screen already
  // narrowed to urgent notes) instead of always opening on «Все».
  filter: UrgencyKey | 'all';
  onFilterChange: (filter: UrgencyKey | 'all') => void;
  onOpenCalendar: () => void;
}) {
  const [showClosed, setShowClosed] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Planned (not-done) sessions + consultations, across every client, soonest
  // first — a compact card (client · type · date) that opens straight into the
  // read-only viewer when tapped. Sessions need a real date to count as
  // planned; consultations show whether dated or not (undated sort last).
  type PlannedItem = { kind: 'session' | 'consultation'; client: Client; id: string; date: string; time: string; label: string };
  const plannedItems: PlannedItem[] = clients
    .flatMap((c): PlannedItem[] => [
      ...c.sessions
        .filter((s) => !s.done && !s.cancelled && ISO_DATE_RE.test(s.date))
        .map((s): PlannedItem => ({ kind: 'session', client: c, id: s.id, date: s.date, time: s.time, label: s.name || s.area })),
      ...c.consultations
        .filter((cs) => !cs.done && !cs.cancelled)
        .map((cs): PlannedItem => ({ kind: 'consultation', client: c, id: cs.id, date: cs.date, time: cs.time, label: cs.area })),
    ])
    .sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));

  // Active projects (with or without a client) whose next action is due
  // today or already overdue — independent of the sessions/consultations
  // feed above, doesn't touch that aggregation at all.
  const today = todayISO();
  const dueProjects = projects
    .filter((p) => p.state === 'active' && p.nextActionDate && p.nextActionDate <= today)
    .sort((a, b) => (a.nextActionDate ?? '').localeCompare(b.nextActionDate ?? ''));

  // Client-less projects — candidates a master (client-less) note/task can
  // be tied to.
  const clientlessProjects = getWorkshopProjects(projects);

  // Client notes + the master's own (client-less) notes, one flat list.
  type NoteEntry = { note: ClientNote; client: Client | null };
  const items: NoteEntry[] = [
    ...masterNotes.map((note): NoteEntry => ({ note, client: null })),
    ...clients.flatMap((c) => c.notes.map((note): NoteEntry => ({ note, client: c }))),
  ]
    .filter(({ note }) => {
      if (!showClosed && note.done) return false;
      if (filter !== 'all' && note.urgency !== filter) return false;
      return true;
    })
    .sort((a, b) => {
      if (a.note.done !== b.note.done) return a.note.done ? 1 : -1;
      const r = urgencyRank(a.note.urgency) - urgencyRank(b.note.urgency);
      return r !== 0 ? r : b.note.createdDate.localeCompare(a.note.createdDate);
    });
  // Split into two dedicated columns — general (the master's own, client-less)
  // and work notes (tied to a client) — instead of one mixed list.
  const generalItems = items.filter(({ client }) => client === null);
  const workItems = items.filter(({ client }) => client !== null);
  const hasAnyClientNote = clients.some((c) => c.notes.length);

  return (
    <div style={{ minHeight: '100%' }}>
      <div style={{ height: 'calc(env(safe-area-inset-top) + 18px)' }} />
      {/* Header — same formatting as the home screen: INKA logo + subtitle. */}
      <div style={{ padding: '6px 24px 12px', position: 'relative', zIndex: 1 }}>
        {/* Absolute top-right corner, same spot on every screen (see
            AdminDashboardScreen). */}
        <div style={{ position: 'absolute', top: 6, right: 24, zIndex: 2 }}>
          <TodayDateBadge onOpen={onOpenCalendar} />
        </div>
        <InkaLogo height={fs(34)} />
        <div style={{ fontSize: fs(9.66), color: COLORS.textGhost, letterSpacing: `${fs(2.97)}px`, textTransform: 'uppercase', marginTop: 3, fontStyle: 'italic' }}>
          Планнер
        </div>
        <StarDivider />
      </div>

      {/* Filter bar: urgency symbols stay visible on the left; everything
          else (text labels, «Показывать закрытые») is tucked behind a «⋮» on
          the right. z-index 5 (not 1) so this row's own stacking context
          — and the dropdown inside it — sits above the two-column section
          below, which is a later sibling and would otherwise win z-index
          ties by DOM order. */}
      <div style={{ padding: '4px 20px 14px', position: 'relative', zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Funnel toggle — chips stay hidden until tapped. */}
          <div
            onClick={() => setShowFilters((v) => !v)}
            role="button"
            aria-label={showFilters ? 'Скрыть фильтры' : 'Показать фильтры'}
            title="Фильтры"
            style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
              border: showFilters ? '1px solid rgba(var(--gold-rgb),0.6)' : '1px solid rgba(var(--gold-rgb),0.15)',
              background: showFilters ? 'rgba(var(--gold-rgb),0.08)' : 'transparent',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ color: showFilters ? COLORS.gold : COLORS.textFaint }}>
              <path d="M2 3.5h12l-4.7 5.3V13l-2.6-1.5V8.8L2 3.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
            </svg>
          </div>
          {showFilters && (
            <>
              <div
                onClick={() => onFilterChange('all')}
                role="button"
                aria-label="Все"
                title="Все"
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontSize: fs(10.5),
                  textTransform: 'uppercase',
                  color: filter === 'all' ? COLORS.gold : COLORS.textFaint,
                  border: filter === 'all' ? '1px solid rgba(var(--gold-rgb),0.6)' : '1px solid rgba(var(--gold-rgb),0.15)',
                  background: filter === 'all' ? 'rgba(var(--gold-rgb),0.08)' : 'transparent',
                }}
              >
                Все
              </div>
              {URGENCY.map((u) => (
                <div
                  key={u.key}
                  onClick={() => onFilterChange(u.key)}
                  role="button"
                  aria-label={u.label}
                  title={u.label}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    fontSize: fs(14),
                    border: filter === u.key ? '1px solid rgba(var(--gold-rgb),0.6)' : '1px solid rgba(var(--gold-rgb),0.15)',
                    background: filter === u.key ? 'rgba(var(--gold-rgb),0.08)' : 'transparent',
                  }}
                >
                  {u.emoji}
                </div>
              ))}
              <div
                onClick={() => setShowClosed((v) => !v)}
                role="button"
                aria-label="Показывать закрытые"
                title="Показывать закрытые"
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontSize: fs(14),
                  border: showClosed ? '1px solid rgba(var(--gold-rgb),0.6)' : '1px solid rgba(var(--gold-rgb),0.15)',
                  background: showClosed ? 'rgba(var(--gold-rgb),0.08)' : 'transparent',
                }}
              >
                {DONE_EMOJI}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Planned sessions & consultations, full width, up top — a quick look
          at what's coming before the notes columns below. */}
      <div style={{ padding: '2px 20px 16px', position: 'relative', zIndex: 1 }}>
        <div style={{ fontSize: fs(11), color: COLORS.textGhost, letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: 8 }}>
          Записи
        </div>
        {plannedItems.length === 0 ? (
          <div style={{ fontSize: fs(13), color: COLORS.textGhost, fontStyle: 'italic' }}>Нет запланированного</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {plannedItems.map((it) => (
              <div
                key={`${it.kind}-${it.client.id}-${it.id}`}
                onClick={() => (it.kind === 'session' ? onOpenSession(it.client.id, it.id) : onOpenConsultation(it.client.id, it.id))}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9px 11px',
                  borderRadius: 2,
                  cursor: 'pointer',
                  border: '1px solid rgba(var(--gold-rgb),0.15)',
                  background: 'rgba(var(--surface-rgb),0.018)',
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: it.client.color, flexShrink: 0 }} />
                <span style={{ fontSize: fs(14), color: COLORS.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, flex: 1 }}>
                  {it.client.name || '—'}
                </span>
                <span style={{ fontSize: fs(9.5), color: COLORS.gold, letterSpacing: '1px', textTransform: 'uppercase', flexShrink: 0 }}>
                  {it.kind === 'session' ? 'Сессия' : 'Консультация'}
                </span>
                <span style={{ fontSize: fs(12), color: COLORS.textGhost, flexShrink: 0 }}>
                  {it.date ? formatDate(it.date).replace(/ \d{4}$/, '') : 'Без даты'}
                  {it.time && <span style={{ color: COLORS.gold }}> · {it.time}</span>}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {dueProjects.length > 0 && (
        <div style={{ padding: '2px 20px 16px', position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: fs(11), color: COLORS.textGhost, letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: 8 }}>
            Активные проекты
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {dueProjects.map((p) => (
              <div
                key={p.id}
                onClick={() => onOpenProject(p)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9px 11px',
                  borderRadius: 2,
                  cursor: 'pointer',
                  border: '1px solid rgba(var(--gold-rgb),0.15)',
                  background: 'rgba(var(--surface-rgb),0.018)',
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
                <span style={{ fontSize: fs(14), color: COLORS.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, flex: 1 }}>
                  {p.nextActionText || p.title || '—'}
                </span>
                <span style={{ fontSize: fs(9.5), color: COLORS.gold, letterSpacing: '1px', textTransform: 'uppercase', flexShrink: 0 }}>
                  {clientNameFor(clients, p.clientId) ?? 'Мастерская'}
                </span>
                <span style={{ fontSize: fs(12), color: COLORS.textGhost, flexShrink: 0 }}>
                  {p.nextActionDate ? formatDate(p.nextActionDate).replace(/ \d{4}$/, '') : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ padding: '0 20px 8px', position: 'relative', zIndex: 1 }}>
        <StarDivider />
      </div>

      {/* Two columns of notes below: general (the master's own, client-less)
          on the left, work notes (tied to a client) on the right. */}
      <div style={{ padding: '2px 16px calc(env(safe-area-inset-bottom, 0px) + 84px)', position: 'relative', zIndex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'start' }}>
        {/* Column 1 — general notes (client-less, the master's own) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <div style={{ fontSize: fs(11), color: COLORS.textGhost, letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: 2 }}>
            Общие
          </div>
          {/* New note — client-less by default (stored on the master), or
              tied to a client via the composer's own picker. Opened via the
              nav FAB's contextual «Создать» action. */}
          {showComposer && (
            <div style={{ marginBottom: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontSize: fs(10), color: COLORS.textGhost, letterSpacing: '1px', textTransform: 'uppercase' }}>
                  Новая заметка
                </div>
                <ReminderCloseButton onClick={() => onShowComposerChange(false)} />
              </div>
              <NoteComposer
                clients={clients}
                projects={projects}
                onAdd={(text, urgency, photos, dueDate, clientId, projectId) => {
                  if (clientId) onAddNote(clientId, text, urgency, photos, dueDate, projectId);
                  else onAddMasterNote(text, urgency, photos, dueDate, projectId);
                  onShowComposerChange(false);
                }}
              />
            </div>
          )}
          {generalItems.length === 0 ? (
            <div style={{ fontSize: fs(13), color: COLORS.textGhost, fontStyle: 'italic' }}>
              {masterNotes.length ? 'Нет по этому фильтру' : 'Заметок пока нет'}
            </div>
          ) : (
            generalItems.map(({ note }) => (
              <NoteItem
                key={`master-${note.id}`}
                note={note}
                projects={clientlessProjects}
                onToggleDone={() => onToggleMasterDone({ ...note, done: !note.done })}
                onEdit={(text, urgency, projectId, dueDate) => onEditMasterNote({ ...note, text, urgency, projectId, dueDate })}
                onDelete={() => onDeleteMasterNote(note.id)}
              />
            ))
          )}
        </div>

        {/* Column 2 — work notes (tied to a client) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <div style={{ fontSize: fs(11), color: COLORS.textGhost, letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: 2 }}>
            Рабочие
          </div>
          {workItems.length === 0 ? (
            <div style={{ fontSize: fs(13), color: COLORS.textGhost, fontStyle: 'italic' }}>
              {hasAnyClientNote ? 'Нет по этому фильтру' : 'Заметок пока нет'}
            </div>
          ) : (
            workItems.map(({ note, client }) => (
              <div key={`${client!.id}-${note.id}`} onClick={() => onOpenClient(client!.id)} style={{ cursor: 'pointer' }}>
                <NoteItem
                  note={note}
                  client={client!}
                  projects={getProjectsByClientId(projects, client!.id)}
                  onToggleDone={() => onToggleDone(client!.id, { ...note, done: !note.done })}
                  onEdit={(text, urgency, projectId, dueDate) => onEditNote(client!.id, { ...note, text, urgency, projectId, dueDate })}
                  onDelete={() => onDeleteNote(client!.id, note.id)}
                />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
