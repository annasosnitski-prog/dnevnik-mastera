import { NEXT_ACTION_TYPES, type Project } from '../../domain/project';
import { clientNameFor, getProjectPipelineSegments } from '../../domain/projectSelectors';
import { type Client } from '../../domain/client';
import { isRTL, firstLetter } from '../../lib/textFormat';
import { COLORS, fs } from '../ui/designTokens';
import { ProjectTimelineRow } from './ProjectTimelineRow';

const NEXT_ACTION_LABELS: Record<string, string> = Object.fromEntries(
  NEXT_ACTION_TYPES.map((a) => [a.key, a.label]),
);

// Общий заголовок строки — та же шапка (кружок с буквой, заголовок, имя
// клиента), что и у ProjectTimelineRow, но вынесена сюда отдельно: строка
// без дат ниже не рисует шкалу вообще, так что дублировать разметку внутри
// ProjectTimelineRow под условие «нет сегментов» было бы менее явным, чем
// отдельный компонент с тем же визуалом шапки.
function ProjectRowHeader({ project, clientName }: { project: Project; clientName: string | null }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8, direction: isRTL(project.title) ? 'rtl' : 'ltr' }}>
      <span
        style={{
          width: 26,
          height: 26,
          borderRadius: '50%',
          border: '1px solid rgba(var(--gold-rgb),0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: fs(12),
          color: COLORS.gold,
          flexShrink: 0,
        }}
      >
        {firstLetter(project.title)}
      </span>
      <span dir="auto" style={{ fontSize: fs(14), color: COLORS.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {project.title}
      </span>
      {clientName && (
        <span style={{ fontSize: fs(11), color: COLORS.textGhost, fontStyle: 'italic', flexShrink: 0 }}>{clientName}</span>
      )}
    </div>
  );
}

// Проект без окна/точной даты первой сессии не даёт getProjectPipelineSegments
// ни одной точки (см. её собственный гвард) — «Таймлайн» поэтому такой проект
// прячет целиком (ProjectTimelineList). «Все проекты» — противоположный
// принцип: виден каждый активный проект, а для тех, у кого нет дат, вместо
// шкалы честно показывается только то, что мастер сама поставила как
// следующий шаг (тип действия ± свой текст) — ни одной придуманной даты.
function DatelessProjectRow({ project, clientName }: { project: Project; clientName: string | null }) {
  const actionType = project.nextActionType;
  const actionText = project.nextActionText.trim();
  const label = actionText || (actionType ? NEXT_ACTION_LABELS[actionType] ?? null : null);

  return (
    <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(var(--gold-rgb),0.08)' }}>
      <ProjectRowHeader project={project} clientName={clientName} />
      {label ? (
        <div style={{ fontSize: fs(12), color: COLORS.gold, marginLeft: 34 }}>{label}</div>
      ) : (
        <div style={{ fontSize: fs(12), color: COLORS.textGhost, fontStyle: 'italic', marginLeft: 34 }}>
          следующий шаг не задан
        </div>
      )}
    </div>
  );
}

// «Все проекты» (замена прежней «Сводки» — М.2026-09) — полный список
// активных проектов независимо от того, задано ли окно/точная дата первой
// сессии. Проекты с датами показывают полную шкалу (как в «Таймлайне»,
// первыми — ближе к развязке), проекты без дат идут ниже плоским списком:
// иначе отсутствие даты пришлось бы куда-то «сортировать» среди реальных
// дат, а сравнивать тут нечего.
export function AllProjectsList({ projects, clients }: { projects: Project[]; clients: Client[] }) {
  const items = projects
    .filter((p) => p.status === 'active')
    .map((project) => {
      // Записи проекта физически лежат в разных местах в зависимости от
      // того, привязан ли проект к клиенту — тот же приём резолва, что уже
      // использует ProjectTimelineList/SessionAndProjectSheets.
      const linkedClient = project.clientId ? clients.find((c) => c.id === project.clientId) ?? null : null;
      const sessions = linkedClient ? linkedClient.sessions : project.sessions;
      const consultations = linkedClient ? linkedClient.consultations : project.consultations;
      return { project, segments: getProjectPipelineSegments(project, sessions, consultations) };
    });

  if (items.length === 0) {
    return (
      <div style={{ textAlign: 'center', fontSize: fs(14), fontStyle: 'italic', color: COLORS.textGhost, padding: '60px 40px 0' }}>
        Пока нет активных проектов
      </div>
    );
  }

  const dated = items
    .filter((item): item is { project: Project; segments: NonNullable<ReturnType<typeof getProjectPipelineSegments>> } => item.segments !== null)
    .sort((a, b) => a.segments[a.segments.length - 1].targetDate.localeCompare(b.segments[b.segments.length - 1].targetDate));
  const dateless = items.filter((item) => item.segments === null).map((item) => item.project);

  return (
    <div style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 84px)' }}>
      {dated.map(({ project, segments }) => (
        <ProjectTimelineRow key={project.id} project={project} clientName={clientNameFor(clients, project.clientId)} segments={segments} />
      ))}
      {dateless.map((project) => (
        <DatelessProjectRow key={project.id} project={project} clientName={clientNameFor(clients, project.clientId)} />
      ))}
    </div>
  );
}
