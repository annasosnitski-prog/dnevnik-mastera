import { type Project } from '../../domain/project';
import { clientNameFor, getProjectPipelineSegments } from '../../domain/projectSelectors';
import { type Client } from '../../domain/client';
import { COLORS, fs } from '../ui/designTokens';
import { ProjectTimelineRow } from './ProjectTimelineRow';

// «Россыпь таймлайнов по всем активным проектам» (§22 pipeline-документа).
// Только проекты со статусом 'active' — здесь важен путь к ПЕРВОЙ сессии,
// а не то, что происходит после (заживление/пауза/завершение уже вне
// смысла этой шкалы) — и только те, у кого задано окно или точная дата
// (иначе getProjectPipelineSegments не может вычислить ни одной точки, см.
// его собственный комментарий).
export function ProjectTimelineList({ projects, clients }: { projects: Project[]; clients: Client[] }) {
  const items = projects
    .filter((p) => p.status === 'active')
    .map((project) => ({ project, segments: getProjectPipelineSegments(project) }))
    .filter((item): item is { project: Project; segments: NonNullable<ReturnType<typeof getProjectPipelineSegments>> } => item.segments !== null)
    .sort((a, b) => a.segments[a.segments.length - 1].targetDate.localeCompare(b.segments[b.segments.length - 1].targetDate));

  if (items.length === 0) {
    return (
      <div style={{ textAlign: 'center', fontSize: fs(14), fontStyle: 'italic', color: COLORS.textGhost, padding: '60px 40px 0' }}>
        Пока нет активных проектов с заданным окном на первую сессию —
        задайте его в форме проекта, чтобы он появился здесь
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 84px)' }}>
      {items.map(({ project }) => (
        <ProjectTimelineRow key={project.id} project={project} clientName={clientNameFor(clients, project.clientId)} />
      ))}
    </div>
  );
}
