import { useState, useEffect } from 'react';
import { type Session } from '../../domain/session';
import { type Consultation } from '../../domain/consultation';
import { type ClientNote } from '../../domain/task';
import { type UrgencyKey } from '../../domain/urgency';
import { type Client } from '../../domain/client';
import {
  type ProjectCategory,
  PROJECT_BODY_AREAS,
  PROJECT_STAGES,
  type ProjectStage,
  type ProjectState,
  PROJECT_STATES,
  type ProjectWaitingFor,
  type ProjectPriority,
  type NextActionType,
  NEXT_ACTION_TYPES,
  type Project,
} from '../../domain/project';
import { getSessionsByProjectId, getConsultationSequence } from '../../domain/projectSelectors';
import { getTasksByProjectId, urgencyMeta } from '../../domain/taskSelectors';
import { getContentEntriesForProject, type ProjectContentItem } from '../../lib/contentProject';
import { resolveContentPhotoSelection } from '../../lib/contentPhotoSelection';
import { projectContentLinkLabel, type ResolvedContentEntryLink } from '../../lib/contentLink';
import { ISO_DATE_RE, formatDate } from '../../utils/dates';
import {
  COLORS,
  fs,
  MARKER_COLORS,
  SKIN_TYPES,
  INPUT_STYLE,
  SUBMIT_STYLE,
  DURATIONS,
  STYLES,
  STYLES_PINNED_COUNT,
  DONE_EMOJI,
  ViewField,
  clientNameFor,
  type ContentEntry,
} from '../TattoDiary';
import {
  SessionPhotos,
  UrgencyChips,
  ProjectCategoryChips,
  NextStepRow,
} from '../client/ClientControls';
import { BottomSheet, SheetCloseButton, SheetEditButton, SheetSavedCheck } from '../ui/Sheet';
import { FieldLabel, SheetStarDivider } from '../ui/TextAtoms';

// Вынесено из TattoDiary.tsx (PR 6 рефакторинга). Логика и разметка не
// менялись — только перенос в отдельный модуль.

// Собирает заметку новой сессии из полей консультации-источника (см.
// prefillConsultation ниже) — переезжает вместе с сессией то, что не имеет
// собственного поля в Session (чувство/ощущение, креатив, источники
// вдохновения), а не теряется при конвертации.
function consultationNoteSummary(consultation: Consultation | null | undefined): string {
  if (!consultation) return '';
  const parts: string[] = [];
  if (consultation.generalNotes) parts.push(consultation.generalNotes);
  if (consultation.feeling) parts.push(`Чувство/ощущение: ${consultation.feeling}`);
  if (consultation.creative) parts.push(`Креатив: ${consultation.creative}`);
  if (consultation.inspirationSources) parts.push(`Источники вдохновения: ${consultation.inspirationSources}`);
  return parts.join('\n\n');
}

export function NewSessionSheet({
  open,
  clientName,
  clientProjects,
  presetProjectId,
  initial,
  initialDate,
  prefillConsultation,
  chainFrom,
  onClose,
  onAdd,
}: {
  open: boolean;
  clientName: string;
  // Проекты этого клиента — для опциональной привязки сессии (Этап 2).
  clientProjects: Project[];
  // Предзаполняет «Проект» для новой сессии, созданной из просмотра проекта
  // (Этап 3b) — игнорируется при редактировании существующей.
  presetProjectId?: string | null;
  initial?: Session | null;
  // Prefills the date field for a brand-new session (e.g. started from a
  // day picked in the calendar) — ignored once `initial` is set (editing wins).
  initialDate?: string;
  // Консультация, которую переводят в сессию («Перевести в сессию» —
  // DetailScreen/TimelineViewSheet) — предзаполняет зону/стиль/фото/проект и
  // собирает заметку из creative-полей консультации. Игнорируется при
  // редактировании существующей сессии (initial имеет приоритет). Дата
  // намеренно НЕ переносится — консультация уже прошла, а сессия это новая,
  // ещё не назначенная встреча для работы.
  prefillConsultation?: Consultation | null;
  // Сессия, от которой назначается следующая («Назначить следующую сессию» —
  // DetailScreen/TimelineViewSheet, см. TattoDiary's startChainNextSession) —
  // предзаполняет только зону/стиль/проект (продолжение той же работы);
  // заметки/фото/статус остаются пустыми/по умолчанию — это отдельная запись,
  // а не копия предыдущей. Игнорируется при редактировании (initial имеет
  // приоритет) и не пересекается с prefillConsultation — это два разных
  // источника, каждый устанавливается своим действием. Дата намеренно НЕ
  // переносится, тем же принципом, что prefillConsultation выше.
  chainFrom?: Session | null;
  onClose: () => void;
  onAdd: (data: {
    name: string;
    date: string;
    time: string;
    duration: string;
    style: string;
    area: string;
    colors: string;
    needles: string;
    skinReaction: string;
    note: string;
    photos: string[];
    done: boolean;
    healed: boolean;
    projectId: string | null;
  }) => void;
}) {
  const isEdit = !!initial;
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [duration, setDuration] = useState('');
  const [style, setStyle] = useState('');
  const [stylesExpanded, setStylesExpanded] = useState(false);
  const [area, setArea] = useState('');
  const [colors, setColors] = useState('');
  const [needles, setNeedles] = useState('');
  const [skinReaction, setSkinReaction] = useState('');
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  // New sessions default to «Выполнена»; editing reflects the session's
  // status; started from a calendar date (clearly a future booking), default
  // to «Запланирована» instead.
  const [done, setDone] = useState(true);
  const [healed, setHealed] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  // Briefly swaps the close «×» for a green check after saving an edit — see
  // SheetSavedCheck — so the save reads as confirmed rather than the sheet
  // just vanishing. Shown unconditionally on every edit-save, even when
  // nothing in the form actually changed.
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    if (open) {
      // Prefill from the session being edited, from the consultation being
      // converted (prefillConsultation, ignored while editing), or start
      // blank for a new one.
      setName(initial?.name ?? '');
      setDate(initial?.date ?? initialDate ?? '');
      setTime(initial?.time ?? '');
      setDuration(initial?.duration ?? '');
      setStyle(initial?.style ?? prefillConsultation?.style ?? chainFrom?.style ?? '');
      setArea(initial?.area ?? prefillConsultation?.area ?? chainFrom?.area ?? '');
      setColors(initial?.colors ?? '');
      setNeedles(initial?.needles ?? '');
      setSkinReaction(initial?.skinReaction ?? '');
      setNote(initial?.note ?? consultationNoteSummary(prefillConsultation));
      setPhotos(initial?.photos ?? prefillConsultation?.photos ?? []);
      // A converted consultation is always a future booking, not yet done —
      // same reasoning as the initialDate case just below. A chained next
      // session is the same: it hasn't happened yet.
      setDone(initial ? initial.done : !initialDate && !prefillConsultation && !chainFrom);
      setHealed(initial?.healed ?? false);
      setProjectId(initial?.projectId ?? prefillConsultation?.projectId ?? chainFrom?.projectId ?? presetProjectId ?? null);
      setJustSaved(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSave = () => {
    const data = { name, date, time, duration, style, area, colors, needles, skinReaction, note, photos, done, healed, projectId };
    if (isEdit) {
      setJustSaved(true);
      setTimeout(() => onAdd(data), 700);
    } else {
      onAdd(data);
    }
  };

  const chipStyle = (selected: boolean, big: boolean): React.CSSProperties => ({
    fontFamily: "'Inter', sans-serif",
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
        {justSaved ? <SheetSavedCheck /> : <SheetCloseButton onClose={onClose} />}
        <div style={{ fontSize: fs(15), color: COLORS.textMuted, fontStyle: 'italic', marginBottom: 3, letterSpacing: '0.3px' }}>{clientName}</div>
        <div style={{ fontSize: fs(22), color: COLORS.textPrimary, fontWeight: 300, letterSpacing: '1px' }}>
          {isEdit ? 'Редактировать сессию' : chainFrom ? 'Следующая сессия' : 'Новая сессия'}
        </div>
        {!isEdit && prefillConsultation && (
          <div style={{ fontSize: fs(12), color: COLORS.gold, fontStyle: 'italic', marginTop: 4, letterSpacing: '0.3px' }}>
            Из консультации {formatDate(prefillConsultation.date) || ''}
          </div>
        )}
        <SheetStarDivider />
      </div>

      <div style={{ padding: '4px 24px 50px' }}>
        {/* Photos first — same order as the consultation form (see
            NewConsultationSheet), rather than tacked on near the end. */}
        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Фото</FieldLabel>
          <SessionPhotos photos={photos} onChange={setPhotos} buttonFirst />
        </div>

        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Название сессии</FieldLabel>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Первая, контур..." style={INPUT_STYLE} />
        </div>

        {/* Поле всегда видно (даже когда у владельца ещё нет ни одного
            проекта) — сессия больше не может остаться совсем без проекта:
            если мастер не выбрала существующий, ensureProjectId в
            TattoDiary.tsx молча заведёт новый под тем же владельцем при
            сохранении (см. handleAddSession/saveSessionFromNewSessionSheet). */}
        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Проект</FieldLabel>
          <select value={projectId ?? ''} onChange={(e) => setProjectId(e.target.value || null)} style={INPUT_STYLE}>
            <option value="">— создать новый проект —</option>
            {clientProjects.map((p) => (
              <option key={p.id} value={p.id}>{p.title || 'Без названия'}</option>
            ))}
          </select>
        </div>

        {/* Date & time stacked full-width. Side-by-side used to overlap on
            iOS, where the native pickers keep a large intrinsic width and
            won't shrink into a flex half-column. */}
        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Дата</FieldLabel>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...INPUT_STYLE, fontSize: fs(15) }} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Время</FieldLabel>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={{ ...INPUT_STYLE, fontSize: fs(15) }} />
        </div>

        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Статус</FieldLabel>
          <div style={{ display: 'flex', gap: 6 }}>
            <div onClick={() => setDone(true)} style={{ ...chipStyle(done, true), flex: 1, textAlign: 'center' }}>Выполнена</div>
            <div onClick={() => setDone(false)} style={{ ...chipStyle(!done, true), flex: 1, textAlign: 'center' }}>Запланирована</div>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Продолжительность</FieldLabel>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {DURATIONS.map((d) => (
              <div key={d} onClick={() => setDuration(d)} style={chipStyle(duration === d, true)}>{d}</div>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Стиль работы</FieldLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            {(stylesExpanded ? STYLES : STYLES.slice(0, STYLES_PINNED_COUNT).concat(style && STYLES.indexOf(style) >= STYLES_PINNED_COUNT ? [style] : [])).map((s) => (
              <div key={s} onClick={() => setStyle(s)} style={chipStyle(style === s, false)}>{s}</div>
            ))}
            {!stylesExpanded && (
              <div onClick={() => setStylesExpanded(true)} style={{ fontSize: fs(12), padding: '6px 11px', color: COLORS.textGhost, fontStyle: 'italic', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                Ещё стили ▾
              </div>
            )}
          </div>
        </div>

        {/* Session.area remains free text by design. */}
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
          <input value={skinReaction} onChange={(e) => setSkinReaction(e.target.value)} placeholder="Покраснение, отёк, спокойно..." style={INPUT_STYLE} />
        </div>

        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Заметки</FieldLabel>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Что делали, наблюдения..." style={{ ...INPUT_STYLE, resize: 'none', height: 80 }} />
        </div>

        <div onClick={() => setHealed((v) => !v)} role="button" aria-label="Зажив" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22, cursor: 'pointer' }}>
          <div style={{ width: 20, height: 20, borderRadius: 2, flexShrink: 0, border: healed ? '1px solid rgba(var(--gold-rgb),0.7)' : '1px solid rgba(var(--gold-rgb),0.3)', background: healed ? 'rgba(var(--gold-rgb),0.15)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {healed && (
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M2.5 7.3L5.5 10.3L11.5 3.7" stroke="var(--gold)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            )}
          </div>
          <span style={{ fontSize: fs(14), color: healed ? COLORS.gold : COLORS.textFaint }}>Зажив</span>
        </div>

        <div className="inka-submit" onClick={handleSave} style={SUBMIT_STYLE}>
          <span style={{ fontFamily: "'Kelly Slab', 'Playfair Display', serif", fontSize: fs(13), color: COLORS.gold, letterSpacing: '2px' }}>
            {isEdit ? 'Сохранить' : 'Добавить сессию'}
          </span>
        </div>
      </div>
    </BottomSheet>
  );
}

export function ProjectSessionPickerSheet({
  open,
  projects,
  clients = [],
  clientId = null,
  scope,
  onClose,
  onPick,
  onCreateProject,
}: {
  open: boolean;
  projects: Project[];
  // Только для scope==='all' — имена клиентов для группировки списка.
  clients?: Client[];
  // null (по умолчанию) — «сессия без клиента» (Мастерская), список
  // проектов БЕЗ клиента, как раньше. Задан — список проектов ЭТОГО
  // клиента (content-link цепочка для клиентской ContentEntry), а не
  // клиентских по умолчанию. Игнорируется, если scope==='all'.
  clientId?: string | null;
  // 'all' — все проекты сразу, сгруппированные по клиенту (+ «Мастерская»)
  // — для контекста без единого явного владельца (Админка). Без этого —
  // прежнее поведение: только clientId/client-less.
  scope?: 'all';
  onClose: () => void;
  onPick: (project: Project) => void;
  onCreateProject: () => void;
}) {
  const eligible = clientId ? projects.filter((p) => p.clientId === clientId) : projects.filter((p) => !p.clientId);
  const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '11px 13px', borderRadius: 2, cursor: 'pointer', border: '1px solid rgba(var(--gold-rgb),0.2)', background: 'rgba(var(--surface-rgb),0.018)' };
  const projectRow = (p: Project) => (
    <div key={p.id} onClick={() => onPick(p)} style={rowStyle}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
      <span style={{ fontSize: fs(15), color: COLORS.textPrimary, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title || 'Без названия'}</span>
    </div>
  );
  const groupLabelStyle: React.CSSProperties = { fontSize: fs(10), color: COLORS.textGhost, letterSpacing: '1.5px', textTransform: 'uppercase', margin: '6px 0 2px' };

  return (
    <BottomSheet open={open} heightPct={scope === 'all' ? 62 : 50}>
      <div style={{ padding: '16px 24px 14px', position: 'relative' }}>
        <SheetCloseButton onClose={onClose} />
        <div style={{ fontSize: fs(22), color: COLORS.textPrimary, fontWeight: 300, letterSpacing: '1px' }}>В какой проект?</div>
        <SheetStarDivider />
      </div>
      <div style={{ padding: '4px 24px 40px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {scope === 'all' ? (
          <>
            {projects.length === 0 && <div style={{ fontSize: fs(13), color: COLORS.textGhost, fontStyle: 'italic' }}>Пока нет ни одного проекта — создайте первый.</div>}
            {clients.map((c) => {
              const clientProjects = projects.filter((p) => p.clientId === c.id);
              if (clientProjects.length === 0) return null;
              return <div key={c.id}><div style={groupLabelStyle}>{`${c.name} ${c.surname}`.trim() || 'Клиент'}</div><div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{clientProjects.map(projectRow)}</div></div>;
            })}
            {(() => {
              const clientless = projects.filter((p) => !p.clientId);
              if (clientless.length === 0) return null;
              return <div><div style={groupLabelStyle}>Мастерская</div><div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{clientless.map(projectRow)}</div></div>;
            })()}
          </>
        ) : eligible.length === 0 ? (
          <div style={{ fontSize: fs(13), color: COLORS.textGhost, fontStyle: 'italic' }}>{clientId ? 'Пока нет проектов у этого клиента — создайте первый.' : 'Пока нет проектов без клиента — создайте первый.'}</div>
        ) : eligible.map(projectRow)}
        <div onClick={onCreateProject} style={{ textAlign: 'center', padding: '10px 0', color: COLORS.gold, fontSize: fs(13), letterSpacing: '0.5px', cursor: 'pointer', marginTop: 4 }}>+ Новый проект</div>
      </div>
    </BottomSheet>
  );
}

export function NewConsultationSheet({
  open,
  clientName,
  client,
  clientProjects,
  presetProjectId,
  initial,
  initialDate,
  chainFrom,
  onClose,
  onAdd,
}: {
  open: boolean;
  clientName: string;
  client: Client | null;
  // Проекты этого клиента — для опциональной привязки консультации (Этап 2).
  clientProjects: Project[];
  // Предзаполняет «Проект» для новой консультации из просмотра проекта (3b).
  presetProjectId?: string | null;
  initial?: Consultation | null;
  // Prefills the date field for a brand-new consultation (e.g. started from a
  // day picked in the calendar) — ignored once `initial` is set.
  initialDate?: string;
  // Консультация, от которой назначается следующая («Назначить следующую
  // консультацию» — DetailScreen/TimelineViewSheet, см. TattoDiary's
  // startChainNextConsultation) — предзаполняет только проект/зону/стиль
  // (продолжение той же работы); заметки/итог остаются пустыми —
  // это отдельная запись со своим содержанием, а не копия предыдущей.
  // Игнорируется при редактировании существующей записи (initial имеет
  // приоритет). Дата намеренно НЕ переносится, тем же принципом, что
  // prefillConsultation у NewSessionSheet.
  chainFrom?: Consultation | null;
  onClose: () => void;
  onAdd: (data: {
    date: string;
    time: string;
    area: string;
    style: string;
    generalNotes: string;
    feeling: string;
    creative: string;
    inspirationSources: string;
    outcome: string;
    urgency: UrgencyKey;
    photos: string[];
    projectId: string | null;
  }) => void;
}) {
  const isEdit = !!initial;
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [area, setArea] = useState('');
  const [style, setStyle] = useState('');
  const [generalNotes, setGeneralNotes] = useState('');
  const [feeling, setFeeling] = useState('');
  const [creative, setCreative] = useState('');
  const [inspirationSources, setInspirationSources] = useState('');
  const [outcome, setOutcome] = useState('');
  const [urgency, setUrgency] = useState<UrgencyKey>('important');
  const [photos, setPhotos] = useState<string[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  // See NewSessionSheet's justSaved for why this shows unconditionally on
  // every edit-save, not just when something actually changed.
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    if (open) {
      setDate(initial?.date ?? initialDate ?? '');
      setTime(initial?.time ?? '');
      setArea(initial?.area ?? chainFrom?.area ?? '');
      setStyle(initial?.style ?? chainFrom?.style ?? '');
      setGeneralNotes(initial?.generalNotes ?? '');
      setFeeling(initial?.feeling ?? '');
      setCreative(initial?.creative ?? '');
      setInspirationSources(initial?.inspirationSources ?? '');
      setOutcome(initial?.outcome ?? '');
      setUrgency(initial?.urgency ?? 'important');
      setPhotos(initial?.photos ?? []);
      setProjectId(initial?.projectId ?? chainFrom?.projectId ?? presetProjectId ?? null);
      setJustSaved(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSave = () => {
    const data = { date, time, area, style, generalNotes, feeling, creative, inspirationSources, outcome, urgency, photos, projectId };
    if (isEdit) {
      setJustSaved(true);
      setTimeout(() => onAdd(data), 700);
    } else onAdd(data);
  };

  return (
    <BottomSheet open={open} heightPct={85}>
      <div style={{ padding: '16px 24px 14px', position: 'relative' }}>
        {justSaved ? <SheetSavedCheck /> : <SheetCloseButton onClose={onClose} />}
        <div style={{ fontSize: fs(15), color: COLORS.textMuted, fontStyle: 'italic', marginBottom: 3, letterSpacing: '0.3px' }}>{clientName}</div>
        <div style={{ fontSize: fs(22), color: COLORS.textPrimary, fontWeight: 300, letterSpacing: '1px' }}>{isEdit ? 'Редактировать консультацию' : chainFrom ? 'Следующая консультация' : 'Новая консультация'}</div>
        <SheetStarDivider />
      </div>

      <div className="inka-consult-grid" style={{ padding: '4px 24px 20px' }}>
        <div className="inka-consult-left">
          <div style={{ marginBottom: 16 }}><FieldLabel>Фотографии</FieldLabel><SessionPhotos photos={photos} onChange={setPhotos} buttonFirst /></div>
          {/* Compact, read-only — a quick reminder while browsing references,
              not a form to fill in (that happens on the client's own Инфо
              tab). Kept small and at the bottom so it doesn't compete with
              the photos for attention. */}
          {client && (client.allergies || client.skinReactions || client.skinType || client.skinTone) && (
            <div style={{ border: '1px solid rgba(var(--gold-rgb),0.12)', borderRadius: 2, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div style={{ fontSize: fs(9), color: COLORS.textGhost, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 2 }}>Кожа клиента</div>
              {client.allergies && <div dir="auto" style={{ fontSize: fs(11), color: 'var(--text-soft)' }}><span style={{ color: COLORS.textGhost }}>Аллергии: </span>{client.allergies}</div>}
              {client.skinReactions && <div dir="auto" style={{ fontSize: fs(11), color: 'var(--text-soft)' }}><span style={{ color: COLORS.textGhost }}>Реакции: </span>{client.skinReactions}</div>}
              {client.skinType && <div style={{ fontSize: fs(11), color: 'var(--text-soft)' }}><span style={{ color: COLORS.textGhost }}>Тип: </span>{SKIN_TYPES.find((s) => s.value === client.skinType)?.label}</div>}
              {client.skinTone && <div style={{ fontSize: fs(11), color: 'var(--text-soft)', display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ color: COLORS.textGhost }}>Тон:</span><span style={{ width: 10, height: 10, borderRadius: '50%', background: client.skinTone, flexShrink: 0, border: '1px solid rgba(var(--gold-rgb),0.3)' }} /></div>}
            </div>
          )}
        </div>

        <div className="inka-consult-right">
          <div style={{ marginBottom: 16 }}><FieldLabel>Дата</FieldLabel><input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...INPUT_STYLE, fontSize: fs(15) }} /></div>
          <div style={{ marginBottom: 16 }}><FieldLabel>Время</FieldLabel><input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={{ ...INPUT_STYLE, fontSize: fs(15) }} /></div>
          {/* Consultation.area remains free text by design. */}
          <div style={{ marginBottom: 16 }}><FieldLabel>Место</FieldLabel><input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Левое плечо, рёбра..." style={INPUT_STYLE} /></div>
          <div style={{ marginBottom: 16 }}><FieldLabel>Проект</FieldLabel><select value={projectId ?? ''} onChange={(e) => setProjectId(e.target.value || null)} style={INPUT_STYLE}><option value="">— создать новый проект —</option>{clientProjects.map((p) => <option key={p.id} value={p.id}>{p.title || 'Без названия'}</option>)}</select></div>
          <div style={{ marginBottom: 16 }}><FieldLabel>Общие заметки</FieldLabel><textarea value={generalNotes} onChange={(e) => setGeneralNotes(e.target.value)} placeholder="Пожелания клиента, договорённости, мысли мастера..." style={{ ...INPUT_STYLE, resize: 'none', height: 90 }} /></div>
          <div style={{ marginBottom: 16 }}><FieldLabel>Чувство / ощущение</FieldLabel><textarea value={feeling} onChange={(e) => setFeeling(e.target.value)} placeholder="Какое чувство или ощущение должна передавать татуировка..." style={{ ...INPUT_STYLE, resize: 'none', height: 60 }} /></div>
          <div style={{ marginBottom: 16 }}><FieldLabel>Источники вдохновения</FieldLabel><textarea value={inspirationSources} onChange={(e) => setInspirationSources(e.target.value)} placeholder="Укажите источники, авторов, образы..." style={{ ...INPUT_STYLE, resize: 'none', height: 60 }} /></div>
          <div style={{ marginBottom: 16 }}><FieldLabel>Креатив</FieldLabel><textarea value={creative} onChange={(e) => setCreative(e.target.value)} placeholder="Смелая идея, изюминка, что-то особенное..." style={{ ...INPUT_STYLE, resize: 'none', height: 70 }} /></div>
          <div style={{ marginBottom: 16 }}><FieldLabel>Техника и стиль</FieldLabel><input value={style} onChange={(e) => setStyle(e.target.value)} placeholder="Выберите технику и стилистику работы..." style={INPUT_STYLE} /></div>
          <div style={{ marginBottom: 16 }}><FieldLabel>Итог</FieldLabel><textarea value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="Как прошла встреча, о чём договорились..." style={{ ...INPUT_STYLE, resize: 'none', height: 60 }} /></div>
          <div style={{ marginBottom: 16 }}><FieldLabel>Срочность</FieldLabel><UrgencyChips value={urgency} onPick={setUrgency} /></div>
        </div>
      </div>

      <div style={{ padding: '0 24px 40px' }}><div className="inka-submit" onClick={handleSave} style={SUBMIT_STYLE}><span style={{ fontFamily: "'Kelly Slab', 'Playfair Display', serif", fontSize: fs(13), color: COLORS.gold, letterSpacing: '2px' }}>{isEdit ? 'Сохранить' : 'Добавить консультацию'}</span></div></div>
    </BottomSheet>
  );
}

function ChainEntryRow({ showArrow, label, title, date, style, onClick }: { showArrow: boolean; label: string; title: string; date: string; style: React.CSSProperties; onClick: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {showArrow && <span style={{ fontSize: fs(12), color: 'rgba(var(--gold-rgb),0.4)', lineHeight: 1, padding: '2px 0' }}>↓</span>}
      <div onClick={onClick} style={{ ...style, width: '100%' }}>
        <span style={{ fontSize: fs(9), color: COLORS.gold, letterSpacing: '1px', textTransform: 'uppercase', flexShrink: 0 }}>{label}</span>
        <span style={{ fontSize: fs(14), color: COLORS.textPrimary, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
        <span style={{ fontSize: fs(12), color: COLORS.textGhost, flexShrink: 0 }}>{date ? formatDate(date).replace(/ \d{4}$/, '') : ''}</span>
      </div>
    </div>
  );
}

// ── Read-only просмотр проекта (Этап 2) ──
// Открывается по тапу на проект (в Мастерской или в «Активных проектах»
// Планнера). Сверху статус, следующий шаг и записи проекта; редактирование
// — отдельной кнопкой, а не сразу форма. Записи тапабельны — открывают
// существующий просмотр сессии/консультации.
export function ProjectViewSheet({
  open,
  project,
  projects,
  clients,
  contentEntries,
  masterNotes,
  onClose,
  onEdit,
  onOpenEntry,
  onEditProjectSession,
  onEditProjectConsultation,
  onToggleTaskDone,
  onOpenContentEntry,
  onSaveNextStep,
}: {
  open: boolean;
  project: Project | null;
  // Полный список — resolveContentEntryProjectId (через getProjectContentEntries)
  // должен уметь резолвить session-link на любой проект, не только текущий.
  projects: Project[];
  clients: Client[];
  contentEntries: ContentEntry[];
  // Master's own (client-less) tasks — a project without a client draws its
  // «Задачи» from here instead of a client's notes.
  masterNotes: ClientNote[];
  onClose: () => void;
  onEdit: (project: Project) => void;
  onOpenEntry: (clientId: string, kind: 'session' | 'consultation', id: string) => void;
  // Тап по «сессии без клиента» в списке записей — открыть её на
  // редактирование. Создание новых записей теперь только через главную
  // кнопку «Создать» (остаётся видна поверх этого просмотра — см. onCreate
  // у NavFab), отдельных кнопок создания здесь больше нет.
  onEditProjectSession: (projectId: string, session: Session) => void;
  // Зеркало onEditProjectSession выше, для Project.consultations.
  onEditProjectConsultation: (projectId: string, consultation: Consultation) => void;
  onToggleTaskDone: (clientId: string | null, note: ClientNote) => void;
  // Тап по карточке контента — открыть её в уже существующем ContentINKA,
  // без нового экрана и без изменения самого редактора.
  onOpenContentEntry: (entry: ContentEntry) => void;
  // Единственный next step проекта (см. NextStepRow) — пишет напрямую в
  // проект тем же saveProject, что и остальные правки, без глубокой формы.
  onSaveNextStep: (text: string, date: string | null, type: NextActionType | null) => void;
}) {
  const clientName = project ? clientNameFor(clients, project.clientId) : null;
  const linkedClient = project?.clientId ? clients.find((c) => c.id === project.clientId) ?? null : null;
  const linkedSessions = linkedClient && project ? getSessionsByProjectId(linkedClient.sessions, project.id).slice().sort((a, b) => (a.date || '').localeCompare(b.date || '')) : [];
  const linkedConsults = linkedClient && project ? getConsultationSequence(linkedClient.consultations, project.id) : [];
  const ownSessions = project && !linkedClient ? project.sessions.slice().sort((a, b) => (a.date || '').localeCompare(b.date || '')) : [];
  const ownConsults = project && !linkedClient ? getConsultationSequence(project.consultations, project.id) : [];
  const linkedTasks = project ? linkedClient ? getTasksByProjectId(linkedClient.notes, project.id) : getTasksByProjectId(masterNotes, project.id) : [];
  // Вся принадлежность записи проекту (и то, как именно она связана — для
  // подписи в карточке) — уже в getContentEntriesForProject, ничего не
  // резолвится здесь. Только confirmed — approval flow не меняется, это
  // фильтр чтения.
  const projectContentItems = project ? getContentEntriesForProject(contentEntries, project.id, projects, clients) : [];
  const chipStyle: React.CSSProperties = { fontSize: fs(11), color: COLORS.textFaint, border: '1px solid rgba(var(--gold-rgb),0.3)', borderRadius: 2, padding: '3px 9px', letterSpacing: '0.5px' };
  const entryRowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', borderRadius: 2, cursor: 'pointer', border: '1px solid rgba(var(--gold-rgb),0.15)', background: 'rgba(var(--surface-rgb),0.018)' };

  return (
    <BottomSheet open={open} heightPct={90}>
      <div style={{ padding: '16px 24px 14px', position: 'relative' }}>
        {project && <SheetEditButton onClick={() => onEdit(project)} />}
        <SheetCloseButton onClose={onClose} />
        <div style={{ fontSize: fs(15), color: COLORS.textMuted, fontStyle: 'italic', marginBottom: 3, letterSpacing: '0.3px' }}>{clientName ?? 'Мастерская'}</div>
        <div style={{ fontSize: fs(22), color: COLORS.textPrimary, fontWeight: 300, letterSpacing: '1px' }}>{project?.title || 'Проект'}</div>
        <SheetStarDivider />
      </div>

      <div style={{ padding: '4px 24px 40px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {project && (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <span style={chipStyle}>{PROJECT_STAGES.find((s) => s.key === project.stage)?.label ?? project.stage}</span>
              <span style={chipStyle}>{PROJECT_STATES.find((s) => s.key === project.state)?.label ?? project.state}</span>
            </div>

            <NextStepRow nextActionText={project.nextActionText} nextActionDate={project.nextActionDate} nextActionType={project.nextActionType} onSave={onSaveNextStep} />
            {project.photos.length > 0 && <SessionPhotos photos={project.photos} onChange={() => {}} allowDelete={false} readOnly />}
            <ViewField label="Место" value={project.area} />
            <ViewField label="Техника и стиль" value={project.style} />
            <ViewField label="Общие заметки" value={project.generalNotes} />
            <ViewField label="Чувство / ощущение" value={project.feeling} />
            <ViewField label="Креатив" value={project.creative} />
            <ViewField label="Источники вдохновения" value={project.inspirationSources} />

            {(linkedSessions.length > 0 || linkedConsults.length > 0 || ownSessions.length > 0 || ownConsults.length > 0) && (
              <div>
                <div style={{ fontSize: fs(10), color: COLORS.textGhost, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 5 }}>Записи проекта</div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {linkedConsults.map((c, i) => <ChainEntryRow key={`c-${c.id}`} showArrow={i > 0} label={`Консультация ${i + 1}`} title={c.area || '—'} date={c.date} style={entryRowStyle} onClick={() => linkedClient && onOpenEntry(linkedClient.id, 'consultation', c.id)} />)}
                  {linkedSessions.map((s, i) => <ChainEntryRow key={`s-${s.id}`} showArrow={i > 0 || linkedConsults.length > 0} label={`Сессия ${i + 1}`} title={s.name || s.area || '—'} date={s.date} style={entryRowStyle} onClick={() => linkedClient && onOpenEntry(linkedClient.id, 'session', s.id)} />)}
                  {ownConsults.map((c, i) => <ChainEntryRow key={`oc-${c.id}`} showArrow={i > 0} label={`Консультация ${i + 1} · без клиента`} title={c.area || '—'} date={c.date} style={entryRowStyle} onClick={() => project && onEditProjectConsultation(project.id, c)} />)}
                  {ownSessions.map((s, i) => <ChainEntryRow key={`os-${s.id}`} showArrow={i > 0 || ownConsults.length > 0} label={`Сессия ${i + 1} · без клиента`} title={s.name || s.area || '—'} date={s.date} style={entryRowStyle} onClick={() => project && onEditProjectSession(project.id, s)} />)}
                </div>
              </div>
            )}

            {linkedTasks.length > 0 && (
              <div>
                <div style={{ fontSize: fs(10), color: COLORS.textGhost, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 5 }}>Задачи</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {linkedTasks.map((n) => (
                    <div key={`t-${n.id}`} onClick={() => onToggleTaskDone(linkedClient?.id ?? null, n)} style={{ ...entryRowStyle, opacity: n.done ? 0.45 : 1 }}>
                      <span style={{ fontSize: fs(16), lineHeight: 1.2, flexShrink: 0 }}>{n.done ? DONE_EMOJI : urgencyMeta(n.urgency).emoji}</span>
                      <span dir="auto" style={{ fontSize: fs(14), color: COLORS.textPrimary, flex: 1, minWidth: 0, textDecoration: n.done ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <div style={{ fontSize: fs(10), color: COLORS.textGhost, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 5 }}>Контент</div>
              {projectContentItems.length === 0 ? <div style={{ fontSize: fs(13), color: COLORS.textGhost, fontStyle: 'italic' }}>К проекту пока не привязан готовый контент</div> : <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{projectContentItems.map((item) => <ProjectContentCard key={item.entry.id} item={item} onClick={() => onOpenContentEntry(item.entry)} />)}</div>}
            </div>
          </>
        )}
      </div>
    </BottomSheet>
  );
}

// Компактная карточка одного материала ContentINKA внутри «Контент» на
// экране проекта — только для просмотра, без редактирования, перевода,
// архетипов и управления фотоподборкой (см. onClick — открывает уже
// существующий ContentINKA, а не что-то новое). Экспортирована — тот же
// компонент переиспользует вкладка «Контент» карточки клиента
// (ClientContentTab в DetailScreen.tsx), чтобы контент, привязанный к
// проекту клиента напрямую (а не через сессию/консультацию), тоже было
// видно, не только внутри самого проекта.
export function ProjectContentCard({ item, onClick }: { item: ProjectContentItem<ContentEntry>; onClick: () => void }) {
  const { entry, link } = item;
  const firstLine = (entry.textDraft || entry.text || '').split('\n')[0].trim();
  const datePart = entry.createdDate.slice(0, 10);
  const dateLabel = ISO_DATE_RE.test(datePart) ? formatDate(datePart) : entry.createdDate;
  const selectedPhotoCount = resolveContentPhotoSelection({ photos: entry.photos, photoIds: entry.photoIds, contentDraft: entry.contentDraft }).length;
  return (
    <div onClick={onClick} role="button" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 2, cursor: 'pointer', border: '1px solid rgba(var(--gold-rgb),0.15)', background: 'rgba(var(--surface-rgb),0.018)' }}>
      {entry.photos[0] ? <img src={entry.photos[0]} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 2, flexShrink: 0 }} /> : <div style={{ width: 40, height: 40, borderRadius: 2, flexShrink: 0, background: 'rgba(var(--gold-rgb),0.08)' }} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div dir="auto" style={{ fontSize: fs(13), color: COLORS.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{firstLine || 'Без текста'}</div>
        <div style={{ fontSize: fs(11), color: COLORS.textGhost, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dateLabel} · {projectContentLinkLabel(link as ResolvedContentEntryLink)}{selectedPhotoCount > 0 ? ` · Фото: ${selectedPhotoCount}` : ''}</div>
      </div>
      <span style={{ fontSize: fs(10.5), color: COLORS.gold, flexShrink: 0, letterSpacing: '0.4px' }}>Открыть в ContentINKA</span>
    </div>
  );
}

// ── Новый / редактирование проекта («Творческая мастерская») — same field
// set as NewConsultationSheet (same kind of creative brief), minus the
// client-skin block (there's no client) and urgency chips, plus a title and
// a colour tag (MarkerColorPalette) since a project has no client.color to
// borrow for its cover. ──
export function NewProjectSheet({
  open,
  initial,
  presetClientId,
  clients,
  onClose,
  onAdd,
  onDelete,
}: {
  open: boolean;
  initial?: Project | null;
  // Предзаполняет клиента для НОВОГО проекта (Этап 3a, кнопка «+ Новый» во
  // вкладке клиента) — игнорируется при редактировании существующего.
  presetClientId?: string | null;
  clients: Client[];
  onClose: () => void;
  onAdd: (data: {
    title: string;
    color: string;
    category: ProjectCategory;
    clientId: string | null;
    stage: ProjectStage;
    state: ProjectState;
    waitingFor: ProjectWaitingFor;
    nextActionText: string;
    nextActionDate: string | null;
    nextActionType: NextActionType | null;
    priority: ProjectPriority;
    area: string;
    style: string;
    generalNotes: string;
    feeling: string;
    creative: string;
    inspirationSources: string;
    photos: string[];
  }) => void;
  // Present only when editing an existing project — omitted for a new one.
  onDelete?: () => void;
}) {
  const isEdit = !!initial;
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<ProjectCategory>('tattoo');
  const [clientId, setClientId] = useState<string | null>(null);
  const [stage, setStage] = useState<ProjectStage>('idea');
  const [state, setState] = useState<ProjectState>('active');
  const [nextActionText, setNextActionText] = useState('');
  const [nextActionDate, setNextActionDate] = useState('');
  const [nextActionType, setNextActionType] = useState<NextActionType | null>(null);
  const [area, setArea] = useState('');
  const [style, setStyle] = useState('');
  const [generalNotes, setGeneralNotes] = useState('');
  const [feeling, setFeeling] = useState('');
  const [creative, setCreative] = useState('');
  const [inspirationSources, setInspirationSources] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // See NewSessionSheet's justSaved — same «крестик превращается в зелёную
  // галочку» подтверждение, единообразно для всех форм редактирования.
  const [justSaved, setJustSaved] = useState(false);

  // Deprecated UI-only project attributes stay in the domain for backwards
  // compatibility. Editing preserves existing values; a new project gets the
  // historical defaults without exposing controls for them.
  const preservedColor = initial?.color ?? MARKER_COLORS[0];
  const preservedWaitingFor: ProjectWaitingFor = initial?.waitingFor ?? 'none';
  const preservedPriority: ProjectPriority = initial?.priority ?? 'normal';
  const legacyArea = area && !PROJECT_BODY_AREAS.some((option) => option.key === area) ? area : null;

  useEffect(() => {
    if (open) {
      setTitle(initial?.title ?? '');
      setCategory(initial?.category ?? 'tattoo');
      setClientId(initial?.clientId ?? presetClientId ?? null);
      setStage(initial?.stage ?? 'idea');
      setState(initial?.state ?? 'active');
      setNextActionText(initial?.nextActionText ?? '');
      setNextActionDate(initial?.nextActionDate ?? '');
      setNextActionType(initial?.nextActionType ?? null);
      setArea(initial?.area ?? '');
      setStyle(initial?.style ?? '');
      setGeneralNotes(initial?.generalNotes ?? '');
      setFeeling(initial?.feeling ?? '');
      setCreative(initial?.creative ?? '');
      setInspirationSources(initial?.inspirationSources ?? '');
      setPhotos(initial?.photos ?? []);
      setConfirmingDelete(false);
      setJustSaved(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <BottomSheet open={open} heightPct={85}>
      <div style={{ padding: '16px 24px 14px', position: 'relative' }}>
        {justSaved ? <SheetSavedCheck /> : <SheetCloseButton onClose={onClose} />}
        <div style={{ fontSize: fs(15), color: COLORS.textMuted, fontStyle: 'italic', marginBottom: 3, letterSpacing: '0.3px' }}>Мастерская</div>
        <div style={{ fontSize: fs(22), color: COLORS.textPrimary, fontWeight: 300, letterSpacing: '1px' }}>{isEdit ? 'Редактировать проект' : 'Новый проект'}</div>
        <SheetStarDivider />
      </div>

      <div className="inka-consult-grid" style={{ padding: '4px 24px 20px' }}>
        <div className="inka-consult-left">
          <div style={{ marginBottom: 16 }}><FieldLabel>Фотографии</FieldLabel><SessionPhotos photos={photos} onChange={setPhotos} buttonFirst /></div>
        </div>

        <div className="inka-consult-right">
          <div style={{ marginBottom: 16 }}><FieldLabel>Название</FieldLabel><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Дракон в стиле джапан..." style={INPUT_STYLE} /></div>
          <div style={{ marginBottom: 16 }}><FieldLabel>Тип</FieldLabel><ProjectCategoryChips value={category} onPick={setCategory} /></div>
          <div style={{ marginBottom: 16 }}><FieldLabel>Клиент</FieldLabel><select value={clientId ?? ''} onChange={(e) => setClientId(e.target.value || null)} style={INPUT_STYLE}><option value="">Мастерская (без клиента)</option>{clients.map((c) => <option key={c.id} value={c.id}>{`${c.name} ${c.surname}`.trim()}</option>)}</select></div>

          <div style={{ marginBottom: 16, display: 'flex', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}><FieldLabel>Этап</FieldLabel><select value={stage} onChange={(e) => setStage(e.target.value as ProjectStage)} style={INPUT_STYLE}>{PROJECT_STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></div>
            <div style={{ flex: 1, minWidth: 0 }}><FieldLabel>Состояние</FieldLabel><select value={state} onChange={(e) => setState(e.target.value as ProjectState)} style={INPUT_STYLE}>{PROJECT_STATES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <FieldLabel>Следующий шаг</FieldLabel>
            <input value={nextActionText} onChange={(e) => setNextActionText(e.target.value)} placeholder="Уточнить размер, получить фото спины..." style={{ ...INPUT_STYLE, marginBottom: 8 }} />
            <div style={{ fontSize: fs(10), color: COLORS.textGhost, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 5 }}>Тип действия</div>
            <select value={nextActionType ?? ''} onChange={(e) => setNextActionType((e.target.value || null) as NextActionType | null)} style={{ ...INPUT_STYLE, marginBottom: 8 }}><option value="">Не выбран</option>{NEXT_ACTION_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select>
            <div style={{ fontSize: fs(10), color: COLORS.textGhost, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 5 }}>Дата (когда сделать)</div>
            <input type="date" value={nextActionDate} onChange={(e) => setNextActionDate(e.target.value)} style={INPUT_STYLE} />
          </div>

          <div style={{ marginBottom: 16 }}>
            <FieldLabel>Место</FieldLabel>
            <select value={area} onChange={(e) => setArea(e.target.value)} style={INPUT_STYLE}>
              <option value="">Не задано</option>
              {legacyArea && <option value={legacyArea}>{legacyArea}</option>}
              {PROJECT_BODY_AREAS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 16 }}><FieldLabel>Общие заметки</FieldLabel><textarea value={generalNotes} onChange={(e) => setGeneralNotes(e.target.value)} placeholder="Идея, договорённости, мысли мастера..." style={{ ...INPUT_STYLE, resize: 'none', height: 90 }} /></div>
          <div style={{ marginBottom: 16 }}><FieldLabel>Чувство / ощущение</FieldLabel><textarea value={feeling} onChange={(e) => setFeeling(e.target.value)} placeholder="Какое чувство или ощущение должна передавать татуировка..." style={{ ...INPUT_STYLE, resize: 'none', height: 60 }} /></div>
          <div style={{ marginBottom: 16 }}><FieldLabel>Источники вдохновения</FieldLabel><textarea value={inspirationSources} onChange={(e) => setInspirationSources(e.target.value)} placeholder="Укажите источники, авторов, образы..." style={{ ...INPUT_STYLE, resize: 'none', height: 60 }} /></div>
          <div style={{ marginBottom: 16 }}><FieldLabel>Креатив</FieldLabel><textarea value={creative} onChange={(e) => setCreative(e.target.value)} placeholder="Смелая идея, изюминка, что-то особенное..." style={{ ...INPUT_STYLE, resize: 'none', height: 70 }} /></div>
          <div style={{ marginBottom: 16 }}><FieldLabel>Техника и стиль</FieldLabel><input value={style} onChange={(e) => setStyle(e.target.value)} placeholder="Выберите технику и стилистику работы..." style={INPUT_STYLE} /></div>
        </div>
      </div>

      <div style={{ padding: '0 24px 40px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="inka-submit" onClick={() => {
          const data = { title, color: preservedColor, category, clientId, stage, state, waitingFor: preservedWaitingFor, nextActionText, nextActionDate: nextActionDate || null, nextActionType, priority: preservedPriority, area, style, generalNotes, feeling, creative, inspirationSources, photos };
          if (isEdit) { setJustSaved(true); setTimeout(() => onAdd(data), 700); } else onAdd(data);
        }} style={SUBMIT_STYLE}>
          <span style={{ fontFamily: "'Kelly Slab', 'Playfair Display', serif", fontSize: fs(13), color: COLORS.gold, letterSpacing: '2px' }}>{isEdit ? 'Сохранить' : 'Добавить проект'}</span>
        </div>

        {onDelete && (confirmingDelete ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <div onClick={() => setConfirmingDelete(false)} style={{ flex: 1, minWidth: 0, textAlign: 'center', padding: '10px 4px', borderRadius: 2, border: '1px solid rgba(var(--gold-rgb),0.15)', color: COLORS.textFaint, fontSize: fs(13), letterSpacing: '1px', textTransform: 'uppercase', cursor: 'pointer', wordBreak: 'break-word' }}>Отмена</div>
            <div onClick={onDelete} style={{ flex: 1, minWidth: 0, textAlign: 'center', padding: '10px 4px', borderRadius: 2, border: '1px solid rgba(200,90,90,0.4)', color: '#C56676', fontSize: fs(13), letterSpacing: '1px', textTransform: 'uppercase', cursor: 'pointer', wordBreak: 'break-word' }}>Удалить проект</div>
          </div>
        ) : (
          <div onClick={() => setConfirmingDelete(true)} style={{ textAlign: 'center', padding: '10px 0', color: COLORS.textFaint, fontSize: fs(12), letterSpacing: '1px', textTransform: 'uppercase', cursor: 'pointer' }}>Удалить проект</div>
        ))}
      </div>
    </BottomSheet>
  );
}
