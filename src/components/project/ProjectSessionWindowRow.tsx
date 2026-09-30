import { type Project } from '../../domain/project';
import { type ProjectSessionWindow } from '../../domain/projectSelectors';
import { formatDate, todayISO } from '../../utils/dates';
import { COLORS, fs } from '../ui/designTokens';
import { ProgressRail } from '../ui/ProgressRail';
import { ProjectRowHeader } from './ProjectTimelineRow';

// Строка AdminINKA для проекта, уже прошедшего первую (фактическую) сессию
// — см. комментарий у getProjectSessionWindow (projectSelectors.ts) о том,
// почему ей больше не подходит шкала «Запрос → первая сессия»
// (ProjectTimelineRow). Вместо четырёх точек — один отрезок «последняя →
// следующая сессия» плюс next step проекта отдельной строкой (он у next
// step один на проект независимо от режима строки, см. NextStepRow в
// SessionAndProjectSheets.tsx).
function daysDiff(fromISO: string, toISO: string): number {
  const a = new Date(`${fromISO}T00:00:00.000Z`).getTime();
  const b = new Date(`${toISO}T00:00:00.000Z`).getTime();
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

// Русское склонение «день/дня/дней» — обычное правило (11–14 всегда «дней»
// независимо от последней цифры).
function dayWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'день';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'дня';
  return 'дней';
}

function relativeLabel(dateISO: string, today: string): string {
  const diff = daysDiff(today, dateISO);
  if (diff === 0) return 'сегодня';
  if (diff === 1) return 'завтра';
  if (diff === -1) return 'вчера';
  if (diff > 0) return `через ${diff} ${dayWord(diff)}`;
  const n = Math.abs(diff);
  return `${n} ${dayWord(n)} назад`;
}

// Доля заливки отрезка «последняя → следующая». Следующей нет — течь
// некуда, трек просто дотлевает целиком (нет обещанной даты, до которой
// можно было бы вести отсчёт). next <= last — испорченные/ручные данные
// (просроченная незакрытая запись раньше последней выполненной) — тот же
// эффект: считаем срок уже наступившим, а не делим на отрицательное число.
function windowProgress(lastISO: string, nextISO: string | null, today: string): number {
  if (nextISO === null) return 1;
  const lastMs = new Date(`${lastISO}T00:00:00.000Z`).getTime();
  const nextMs = new Date(`${nextISO}T00:00:00.000Z`).getTime();
  if (nextMs <= lastMs) return 1;
  const todayMs = new Date(`${today}T00:00:00.000Z`).getTime();
  return Math.max(0, Math.min(1, (todayMs - lastMs) / (nextMs - lastMs)));
}

export function ProjectSessionWindowRow({
  project,
  clientName,
  sessionWindow,
  onOpen,
}: {
  project: Project;
  clientName: string | null;
  sessionWindow: ProjectSessionWindow & { lastSessionDate: string };
  onOpen?: (project: Project) => void;
}) {
  const today = todayISO();
  const progress = windowProgress(sessionWindow.lastSessionDate, sessionWindow.nextSessionDate, today);
  const hasNextStep = project.nextActionText.trim() !== '' && project.nextActionDate !== null;
  const nextStepOverdue = hasNextStep && project.nextActionDate! < today;

  return (
    <div
      onClick={onOpen ? () => onOpen(project) : undefined}
      style={{ padding: '14px 16px', borderBottom: '1px solid rgba(var(--gold-rgb),0.08)', cursor: onOpen ? 'pointer' : undefined }}
    >
      <ProjectRowHeader project={project} clientName={clientName} />

      <div style={{ position: 'relative', height: 40, margin: '0 4px' }}>
        <div style={{ position: 'absolute', top: -5, left: 0, right: 0 }}>
          <ProgressRail progress={progress} />
        </div>

        <div style={{ position: 'absolute', top: 17, left: 0, textAlign: 'left' }}>
          <div style={{ fontSize: fs(9.5), color: COLORS.textSecondary }}>Последняя сессия</div>
          <div style={{ fontSize: fs(9), color: COLORS.textGhost, marginTop: 1 }}>
            {formatDate(sessionWindow.lastSessionDate)} · {relativeLabel(sessionWindow.lastSessionDate, today)}
          </div>
        </div>

        <div style={{ position: 'absolute', top: 17, right: 0, textAlign: 'right' }}>
          <div style={{ fontSize: fs(9.5), color: sessionWindow.nextSessionDate ? COLORS.textSecondary : COLORS.textGhost }}>
            Следующая сессия
          </div>
          <div style={{ fontSize: fs(9), color: COLORS.textGhost, marginTop: 1, fontStyle: sessionWindow.nextSessionDate ? 'normal' : 'italic' }}>
            {sessionWindow.nextSessionDate ? `${formatDate(sessionWindow.nextSessionDate)} · ${relativeLabel(sessionWindow.nextSessionDate, today)}` : 'не назначена'}
          </div>
        </div>
      </div>

      {hasNextStep && (
        <div style={{ marginTop: 14, fontSize: fs(11) }}>
          <span style={{ color: nextStepOverdue ? 'var(--urgent)' : COLORS.gold }}>{project.nextActionText}</span>
          <span style={{ color: COLORS.textGhost }}> · {formatDate(project.nextActionDate!)} · {relativeLabel(project.nextActionDate!, today)}</span>
        </div>
      )}
    </div>
  );
}
