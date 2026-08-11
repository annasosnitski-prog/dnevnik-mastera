// Открытая папка «Мастерской» — список проектов внутри одной клиентской
// папки или «Проектов мастера». Переиспользует существующую карточку
// проекта (ProjectCard) и её обработчик открытия как есть — здесь только
// заголовок папки и «назад» на верхний уровень папок.
import type { ProjectFolder } from '../../domain/projectSelectors';
import type { Client } from '../../domain/client';
import type { Project } from '../../domain/project';
import { COLORS, fs, ProjectCard, clientNameFor } from '../TattoDiary';

export function ProjectFolderView({
  folder,
  clients,
  onOpenProject,
  onBack,
}: {
  folder: ProjectFolder;
  clients: Client[];
  onOpenProject: (project: Project) => void;
  onBack: () => void;
}) {
  return (
    <div style={{ minHeight: '100%' }}>
      <div style={{ height: 'calc(env(safe-area-inset-top) + 18px)' }} />
      <div style={{ padding: '6px 24px 12px', position: 'relative', zIndex: 1 }}>
        <div className="inka-back" onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', marginBottom: 10 }}>
          <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
            <path d="M11 4L6 9L11 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ color: COLORS.gold }} />
          </svg>
          <span style={{ fontSize: fs(14), color: COLORS.gold, fontStyle: 'italic', letterSpacing: '0.3px' }}>вернуться</span>
        </div>

        <div style={{ fontSize: fs(9.66), color: COLORS.textGhost, letterSpacing: `${fs(2.97)}px`, textTransform: 'uppercase', fontStyle: 'italic' }}>
          {folder.title}
        </div>
        <div style={{ fontSize: fs(12), color: COLORS.textSecondary, fontStyle: 'italic', marginTop: 3 }}>
          Проектов: {folder.projectCount}
        </div>
      </div>

      <div
        className="inka-client-grid"
        style={{
          padding: '2px 16px calc(env(safe-area-inset-bottom, 0px) + 84px)',
          display: 'grid',
          gap: 10,
          position: 'relative',
          zIndex: 1,
        }}
      >
        {folder.projects.map((project) => (
          <ProjectCard key={project.id} project={project} clientName={clientNameFor(clients, project.clientId)} onClick={() => onOpenProject(project)} />
        ))}
      </div>

      {folder.projects.length === 0 && (
        <div
          style={{
            textAlign: 'center',
            fontSize: fs(14),
            fontStyle: 'italic',
            color: COLORS.textGhost,
            padding: '40px 40px 0',
          }}
        >
          Пока нет проектов — нажмите «+» внизу, чтобы добавить первый
        </div>
      )}
    </div>
  );
}
