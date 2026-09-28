import { NEXT_ACTION_TYPES, type Project } from '../../domain/project';
import { clientNameFor, getProjectPipelineSegments } from '../../domain/projectSelectors';
import { type Client } from '../../domain/client';
import { isRTL, firstLetter } from '../../lib/textFormat';
import { COLORS, fs } from '../ui/designTokens';

const NEXT_ACTION_LABELS: Record<string, string> = Object.fromEntries(
  NEXT_ACTION_TYPES.map((a) => [a.key, a.label]),
);

// Общая шапка строки — тот же визуал (кружок с буквой, заголовок, имя
// клиента), что и у ProjectTimelineRow, но без самой шкалы: этому списку
// шкала не нужна по определению (см. компонент ниже).
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

// Строка проекта без окна/точной даты первой сессии — вместо шкалы честно
// показывается только то, что мастер сама поставила как следующий шаг (тип
// действия ± свой текст), ни одной придуманной даты.
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

// «Без окна» — вкладка-пара к «Таймлайну» (М.2026-09, после разбора: раньше
// один список «Все проекты» смешивал проекты с датами и без, дублируя
// «Таймлайн» для первых и пряча вторых внутри общей простыни). Теперь чёткое
// разделение: «Таймлайн» — только проекты с заданным окном/точной датой
// первой сессии (getProjectPipelineSegments вернул сегменты), здесь — только
// те, для кого она не задана и посчитать шкалу нечем.
export function DatelessProjectsList({ projects, clients }: { projects: Project[]; clients: Client[] }) {
  const items = projects
    .filter((p) => p.status === 'active')
    .filter((project) => {
      // Записи проекта физически лежат в разных местах в зависимости от
      // того, привязан ли проект к клиенту — тот же приём резолва, что уже
      // использует ProjectTimelineList/SessionAndProjectSheets.
      const linkedClient = project.clientId ? clients.find((c) => c.id === project.clientId) ?? null : null;
      const sessions = linkedClient ? linkedClient.sessions : project.sessions;
      const consultations = linkedClient ? linkedClient.consultations : project.consultations;
      return getProjectPipelineSegments(project, sessions, consultations) === null;
    });

  if (items.length === 0) {
    return (
      <div style={{ textAlign: 'center', fontSize: fs(14), fontStyle: 'italic', color: COLORS.textGhost, padding: '60px 40px 0' }}>
        Пока нет активных проектов без заданного окна/даты — им тут и место,
        когда появятся
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 84px)' }}>
      {items.map((project) => (
        <DatelessProjectRow key={project.id} project={project} clientName={clientNameFor(clients, project.clientId)} />
      ))}
    </div>
  );
}
