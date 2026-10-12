import { hasNextStep, nextStepLabel, type Project } from '../../domain/project';
import { clientNameFor } from '../../domain/projectSelectors';
import { type Client } from '../../domain/client';
import { firstLetter } from '../../lib/textFormat';
import { COLORS, fs } from '../ui/designTokens';

// Плитка проекта без окна/точной даты первой сессии — квадрат, три в ряд.
// Вместо шкалы честно показывается только то, что мастер сама поставила как
// следующий шаг, ни одной придуманной даты.
function DatelessProjectTile({
  project,
  clientName,
  onOpen,
}: {
  project: Project;
  clientName: string | null;
  onOpen: (project: Project) => void;
}) {
  const label = hasNextStep(project) ? nextStepLabel(project) : null;
  return (
    <div
      onClick={() => onOpen(project)}
      role="button"
      style={{
        aspectRatio: '1 / 1',
        minWidth: 0,
        boxSizing: 'border-box',
        padding: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        cursor: 'pointer',
        border: '1px solid rgba(var(--gold-rgb),0.2)',
        borderRadius: 3,
        background: 'rgba(var(--surface-rgb),0.022)',
        overflow: 'hidden',
      }}
    >
      <span
        style={{
          width: 24,
          height: 24,
          borderRadius: '50%',
          border: '1px solid rgba(var(--gold-rgb),0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: fs(11),
          color: COLORS.gold,
          flexShrink: 0,
        }}
      >
        {firstLetter(clientName ?? project.title)}
      </span>
      <span
        dir="auto"
        style={{
          fontSize: fs(12),
          color: COLORS.textPrimary,
          lineHeight: 1.25,
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {project.title}
      </span>
      {clientName && (
        <span style={{ fontSize: fs(10), color: COLORS.textGhost, fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {clientName}
        </span>
      )}
      <span style={{ marginTop: 'auto', fontSize: fs(10), color: label ? COLORS.gold : COLORS.textGhost, fontStyle: label ? 'normal' : 'italic', lineHeight: 1.25 }}>
        {label ?? 'шаг не задан'}
      </span>
    </div>
  );
}

// Активные проекты «без окна» — те, для кого не задано окно/точная дата
// первой сессии и нет ни одной прошедшей (отбор делает ProjectTimelineList,
// здесь только раскладка плиткой в три колонки).
export function DatelessProjectsTiles({
  projects,
  clients,
  onOpenProject,
}: {
  projects: Project[];
  clients: Client[];
  onOpenProject: (project: Project) => void;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
      {projects.map((project) => (
        <DatelessProjectTile
          key={project.id}
          project={project}
          clientName={clientNameFor(clients, project.clientId)}
          onOpen={onOpenProject}
        />
      ))}
    </div>
  );
}
