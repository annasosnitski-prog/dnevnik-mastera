import { type Project } from '../../domain/project';
import { clientNameFor, getProjectPipelineSegments, getProjectSessionWindow } from '../../domain/projectSelectors';
import { type Client } from '../../domain/client';
import { COLORS, fs } from '../ui/designTokens';
import { ProjectTimelineRow } from './ProjectTimelineRow';
import { ProjectSessionWindowRow } from './ProjectSessionWindowRow';

type TimelineItem =
  | { project: Project; mode: 'window'; sessionWindow: ReturnType<typeof getProjectSessionWindow> & { lastSessionDate: string } }
  | { project: Project; mode: 'pipeline'; segments: NonNullable<ReturnType<typeof getProjectPipelineSegments>> };

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
export function ProjectTimelineList({
  projects,
  clients,
  onOpenProject,
}: {
  projects: Project[];
  clients: Client[];
  onOpenProject: (project: Project) => void;
}) {
  const items = projects
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
        return { project, mode: 'window', sessionWindow: { ...sessionWindow, lastSessionDate: sessionWindow.lastSessionDate } };
      }
      const segments = getProjectPipelineSegments(project, sessions, consultations);
      if (segments === null) return null;
      return { project, mode: 'pipeline', segments };
    })
    .filter((item): item is TimelineItem => item !== null)
    .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

  if (items.length === 0) {
    return (
      <div style={{ textAlign: 'center', fontSize: fs(14), fontStyle: 'italic', color: COLORS.textGhost, padding: '60px 40px 0' }}>
        Здесь пока пусто — ни один активный проект ещё не ждёт сессии
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 84px)' }}>
      {items.map((item) =>
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
  );
}

// Следующая сессия важнее для сортировки, чем последняя (это то, к чему
// проект движется дальше) — последняя только запасной вариант, когда
// следующая ещё не назначена.
function sortKey(item: TimelineItem): string {
  if (item.mode === 'window') return item.sessionWindow.nextSessionDate ?? item.sessionWindow.lastSessionDate;
  return item.segments[item.segments.length - 1].targetDate;
}
