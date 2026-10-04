import { useState } from 'react';
import { type Project, type ProjectCategory, PROJECT_CATEGORIES } from '../../domain/project';
import {
  clientNameFor,
  getProjectPipelineSegments,
  getProjectSessionWindow,
  getPipelineProgress,
  getSessionWindowProgress,
  filterProjects,
  projectFiltersActive,
  sortProjects,
  EMPTY_PROJECT_FILTERS,
  PROJECT_SORT_MODES,
  type ProjectFilters,
  type ProjectSortMode,
  type ProjectActivityContext,
} from '../../domain/projectSelectors';
import { type Client } from '../../domain/client';
import { todayISO } from '../../utils/dates';
import { COLORS, fs } from '../ui/designTokens';
import { ProjectTimelineRow } from './ProjectTimelineRow';
import { ProjectSessionWindowRow } from './ProjectSessionWindowRow';

type TimelineItem =
  | {
      project: Project;
      mode: 'window';
      sessionWindow: ReturnType<typeof getProjectSessionWindow> & { lastSessionDate: string };
      progress: number;
    }
  | { project: Project; mode: 'pipeline'; segments: NonNullable<ReturnType<typeof getProjectPipelineSegments>>; progress: number };

// 'progress' — новый режим, своя сортировка под эту конкретную шкалу (нет
// смысла заводить его в общем ProjectSortMode/PROJECT_SORT_MODES — та
// сортировка применяется и к карточке клиента, где пайплайна/окна нет).
// Остальные три — как есть, через sortProjects (та же сортировка, что у
// «Проектов» в карточке клиента).
type TimelineSortMode = 'progress' | ProjectSortMode;

// «Прогресс» первым и по умолчанию: мастер открывает «Таймлайн», чтобы
// увидеть, что сейчас ближе всего к следующей вехе (скоро нужна сессия/шаг),
// а не произвольный или алфавитный порядок — такого запроса раньше не было.
const TIMELINE_SORT_MODES: { key: TimelineSortMode; label: string }[] = [
  { key: 'progress', label: 'Прогресс' },
  ...PROJECT_SORT_MODES,
];

// Следующая сессия важнее для порядка, чем последняя (это то, к чему проект
// движется дальше) — последняя только запасной вариант, когда следующая ещё
// не назначена. Используется как тай-брейк внутри режима 'progress' (у
// нескольких проектов может совпасть сама доля — например, 0 у всех, кто
// ждёт назначения следующей сессии).
function sortKey(item: TimelineItem): string {
  if (item.mode === 'window') return item.sessionWindow.nextSessionDate ?? item.sessionWindow.lastSessionDate;
  return item.segments[item.segments.length - 1].targetDate;
}

function sortTimelineItems(items: TimelineItem[], mode: TimelineSortMode, activity: ProjectActivityContext): TimelineItem[] {
  if (mode === 'progress') {
    // Самая полная рельса — первой (то, что ближе всего к следующей вехе).
    return items.slice().sort((a, b) => b.progress - a.progress || sortKey(a).localeCompare(sortKey(b)));
  }
  const order = sortProjects(items.map((it) => it.project), mode, activity);
  const indexById = new Map(order.map((p, i) => [p.id, i] as const));
  return items.slice().sort((a, b) => (indexById.get(a.project.id) ?? 0) - (indexById.get(b.project.id) ?? 0));
}

// «Россыпь таймлайнов по всем активным проектам» (§22 pipeline-документа).
// Только проекты со статусом 'active'. Два режима строки:
//  - 'window' — проект уже пережил первую (фактическую) сессию: дальше её
//    дата в пайплайне навсегда пинится к самой первой сессии и никогда не
//    отражает более поздние (см. getProjectSessionWindow) — вместо этого
//    строка показывает интервал «последняя → следующая сессия».
//  - 'pipeline' — сессий-фактов ещё не было: старая шкала «Запрос → первая
//    сессия» (getProjectPipelineSegments), и только если у проекта задано
//    окно/точная дата первой сессии (иначе пайплайну нечего показывать, см.
//    его собственный комментарий).
//
// Фильтр — только «Тип» (PROJECT_CATEGORIES): «Статус» здесь не нужен, список
// и так всегда только 'active' по самой природе вкладки (см. выше) — чипы
// статуса рядом с фильтром типа были бы без действия для всех значений кроме
// «Активен».
export function ProjectTimelineList({
  projects,
  clients,
  onOpenProject,
}: {
  projects: Project[];
  clients: Client[];
  onOpenProject: (project: Project) => void;
}) {
  const [filters, setFilters] = useState<ProjectFilters>(EMPTY_PROJECT_FILTERS);
  const [sortMode, setSortMode] = useState<TimelineSortMode>('progress');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const today = todayISO();

  const items = filterProjects(projects, filters)
    .filter((p) => p.status === 'active')
    .map((project): TimelineItem | null => {
      // Записи проекта физически лежат в разных местах в зависимости от
      // того, привязан ли проект к клиенту (см. комментарий у getClientSessions
      // в projectSelectors.ts) — тот же приём резолва, что уже использует
      // SessionAndProjectSheets для linkedSessions/ownSessions.
      const linkedClient = project.clientId ? clients.find((c) => c.id === project.clientId) ?? null : null;
      const sessions = linkedClient ? linkedClient.sessions : project.sessions;
      const consultations = linkedClient ? linkedClient.consultations : project.consultations;
      const sessionWindow = getProjectSessionWindow(sessions, project.id);
      if (sessionWindow.lastSessionDate !== null) {
        const progress = getSessionWindowProgress(sessionWindow.lastSessionDate, sessionWindow.nextSessionDate, today);
        return { project, mode: 'window', sessionWindow: { ...sessionWindow, lastSessionDate: sessionWindow.lastSessionDate }, progress };
      }
      const segments = getProjectPipelineSegments(project, sessions, consultations);
      if (segments === null) return null;
      const progress = getPipelineProgress(segments, today);
      return { project, mode: 'pipeline', segments, progress };
    })
    .filter((item): item is TimelineItem => item !== null);

  // Активность для немгновенных режимов сортировки (sortProjects) — тот же
  // приём «собрать всё со всех клиентов плюс клиент-less проекты», что уже
  // использует staleProjects (reminders/buildReminders.ts).
  const allSessions = [...clients.flatMap((c) => c.sessions), ...projects.flatMap((p) => p.sessions)];
  const allConsultations = [...clients.flatMap((c) => c.consultations), ...projects.flatMap((p) => p.consultations)];
  const sortedItems = sortTimelineItems(items, sortMode, { sessions: allSessions, consultations: allConsultations, today });

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

  return (
    <div>
      {/* Закрывает открытую панель тапом мимо неё — тот же приём, что и у
          аналогичной панели «Проектов» в карточке клиента (DetailScreen). */}
      {(filtersOpen || sortOpen) && (
        <div
          onClick={() => {
            setFiltersOpen(false);
            setSortOpen(false);
          }}
          style={{ position: 'fixed', inset: 0, zIndex: 3 }}
        />
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 10, position: 'relative', zIndex: 4 }}>
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
            <div style={{ ...panelStyle, width: 200, maxWidth: 'calc(100vw - 60px)', padding: 12 }}>
              <div style={{ fontSize: fs(10), color: COLORS.textGhost, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 8 }}>Тип</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {([null, ...PROJECT_CATEGORIES.map((c) => c.key)] as (ProjectCategory | null)[]).map((v) => (
                  <div key={v ?? 'all'} onClick={() => setFilters((f) => ({ ...f, category: v }))} style={chipStyle(filters.category === v)}>
                    {v === null ? 'Все' : PROJECT_CATEGORIES.find((c) => c.key === v)?.label}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

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
              {TIMELINE_SORT_MODES.map((m) => {
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
      </div>

      {sortedItems.length === 0 ? (
        <div style={{ textAlign: 'center', fontSize: fs(14), fontStyle: 'italic', color: COLORS.textGhost, padding: '60px 40px 0' }}>
          {filtersActive ? 'Под фильтр не подошёл ни один проект' : 'Здесь пока пусто — ни один активный проект ещё не ждёт сессии'}
        </div>
      ) : (
        <div style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 84px)' }}>
          {sortedItems.map((item) =>
            item.mode === 'window' ? (
              <ProjectSessionWindowRow
                key={item.project.id}
                project={item.project}
                clientName={clientNameFor(clients, item.project.clientId)}
                sessionWindow={item.sessionWindow}
                onOpen={onOpenProject}
              />
            ) : (
              <ProjectTimelineRow
                key={item.project.id}
                project={item.project}
                clientName={clientNameFor(clients, item.project.clientId)}
                segments={item.segments}
                onOpen={onOpenProject}
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}
