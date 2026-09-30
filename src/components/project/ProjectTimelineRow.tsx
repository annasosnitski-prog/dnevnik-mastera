import { NEXT_ACTION_TYPES, type Project } from '../../domain/project';
import { type PipelineSegmentKey, type ProjectPipelineSegment } from '../../domain/projectSelectors';
import { isRTL, firstLetter } from '../../lib/textFormat';
import { formatDate, todayISO } from '../../utils/dates';
import { COLORS, fs } from '../ui/designTokens';
import { ProgressRail } from '../ui/ProgressRail';

const SEGMENT_LABELS: Record<PipelineSegmentKey, string> = {
  moodboard: 'Мудборд',
  sketch: 'Эскиз',
  consultation: 'Консультация',
  session: 'Сессия',
};

const NEXT_ACTION_LABELS: Record<string, string> = Object.fromEntries(
  NEXT_ACTION_TYPES.map((a) => [a.key, a.label]),
);

function actionLabel(segment: ProjectPipelineSegment): string | null {
  if (segment.actionText) return segment.actionText;
  if (segment.actionType) return NEXT_ACTION_LABELS[segment.actionType] ?? null;
  return null;
}

function indexPosition(index: number, count: number): number {
  return count <= 1 ? 0 : (index / (count - 1)) * 100;
}

function todayPosition(segments: { targetDate: string }[], today: string): number {
  const count = segments.length;
  if (count === 0) return 0;
  let lastPassedIndex = -1;
  for (let i = 0; i < count; i++) {
    if (segments[i].targetDate <= today) lastPassedIndex = i;
  }
  if (lastPassedIndex === -1) return 0;
  if (lastPassedIndex === count - 1) return 100;
  const nextIndex = lastPassedIndex + 1;
  const aMs = new Date(`${segments[lastPassedIndex].targetDate}T00:00:00.000Z`).getTime();
  const bMs = new Date(`${segments[nextIndex].targetDate}T00:00:00.000Z`).getTime();
  const todayMs = new Date(`${today}T00:00:00.000Z`).getTime();
  const frac = bMs > aMs ? (todayMs - aMs) / (bMs - aMs) : 0;
  return indexPosition(lastPassedIndex, count) + frac * (indexPosition(nextIndex, count) - indexPosition(lastPassedIndex, count));
}

// Та же металлическая бусина-разделитель, что стоит на подвесочной штанге
// ClientCardTabBar, но уменьшенная под толщину project pipeline. До того,
// как заполнение шкалы дошло до отметки, бусина остаётся тёмным металлом;
// ровно в момент достижения отметки включаются золотая поверхность и glow.
function PipelineDividerBead({ pct, lit }: { pct: number; lit: boolean }) {
  return (
    <span
      aria-hidden="true"
      data-pipeline-divider=""
      style={{
        position: 'absolute',
        left: `${pct}%`,
        top: 7,
        width: 7,
        height: 7,
        transform: 'translate(-50%, -50%)',
        borderRadius: '50%',
        border: lit
          ? '0.5px solid rgba(255,240,179,.85)'
          : '0.5px solid rgba(var(--gold-rgb),.22)',
        background: lit
          ? `radial-gradient(circle at 32% 26%,
              #FFFFFF 0%,
              #F5E3B8 12%,
              #EAD1A0 24%,
              #E0B569 40%,
              #C8943A 60%,
              #7A5620 82%,
              #3A2712 100%)`
          : `radial-gradient(circle at 32% 26%,
              rgba(234,209,160,.26) 0%,
              rgba(122,86,32,.28) 48%,
              rgba(58,39,18,.72) 100%)`,
        boxShadow: lit
          ? `inset -1px -1px 1.4px rgba(0,0,0,.55),
             inset 0.6px 0.6px 0.8px rgba(255,255,255,.5),
             0 0 1.5px rgba(255,240,179,.82),
             0 0 4px rgba(224,181,105,.4),
             0 0 7px rgba(226,182,85,.16),
             0 1.5px 2px rgba(0,0,0,.5)`
          : `inset -1px -1px 1.4px rgba(0,0,0,.6),
             inset 0.4px 0.4px 0.6px rgba(255,255,255,.12),
             0 1px 1.5px rgba(0,0,0,.5)`,
        transition: 'background .25s, border-color .25s, box-shadow .25s',
        zIndex: 2,
      }}
    />
  );
}

// Общая «шапка» строки (аватар-буква/название/клиент) — одинаковая что у
// пайплайна «Запрос → первая сессия» (ниже), что у интервала «последняя →
// следующая сессия» (ProjectSessionWindowRow), различается только тело под
// ней.
export function ProjectRowHeader({ project, clientName }: { project: Project; clientName: string | null }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12, direction: isRTL(project.title) ? 'rtl' : 'ltr' }}>
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
        {/* Монограмма клиента, а не проекта — у одного клиента может быть
            несколько проектов, и буква должна опознавать человека, а не
            каждый раз меняться вместе с названием работы. Для проекта без
            клиента (Мастерская) падать назад на первую букву названия. */}
        {firstLetter(clientName ?? project.title)}
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

export function ProjectTimelineRow({
  project,
  clientName,
  segments,
  onOpen,
}: {
  project: Project;
  clientName: string | null;
  segments: ProjectPipelineSegment[];
  onOpen?: (project: Project) => void;
}) {
  if (segments.length === 0) return null;

  const today = todayISO();
  const todayPct = todayPosition(segments, today);
  const currentStretchIndex = segments.findIndex((s) => s.source !== 'actual');
  const hasActionHint = currentStretchIndex !== -1 && actionLabel(segments[currentStretchIndex]) !== null;
  const scaleHeight = hasActionHint ? 74 : 48;

  return (
    <div
      onClick={onOpen ? () => onOpen(project) : undefined}
      style={{ padding: '14px 16px', borderBottom: '1px solid rgba(var(--gold-rgb),0.08)', cursor: onOpen ? 'pointer' : undefined }}
    >
      <ProjectRowHeader project={project} clientName={clientName} />

      <div style={{ position: 'relative', height: scaleHeight, margin: '0 10px' }}>
        <div style={{ position: 'absolute', top: -5, left: 0, right: 0 }}>
          <ProgressRail progress={todayPct / 100} />
        </div>

        {segments.map((segment, index) => {
          const pct = indexPosition(index, segments.length);
          const anchor = pct < 10 ? 'left' : pct > 90 ? 'right' : 'center';
          const isForecast = segment.source === 'forecast';
          const labelColor = isForecast ? COLORS.textGhost : COLORS.textSecondary;
          const action = index === currentStretchIndex ? actionLabel(segment) : null;
          const beadLit = todayPct >= pct;

          return (
            <div key={segment.key}>
              <PipelineDividerBead pct={pct} lit={beadLit} />
              <div
                style={{
                  position: 'absolute',
                  top: 17,
                  left: `${pct}%`,
                  transform: anchor === 'left' ? 'translateX(0%)' : anchor === 'right' ? 'translateX(-100%)' : 'translateX(-50%)',
                  textAlign: anchor,
                  whiteSpace: 'nowrap',
                  opacity: isForecast ? 0.55 : 1,
                }}
              >
                <div style={{ fontSize: fs(9.5), color: labelColor }}>
                  {SEGMENT_LABELS[segment.key]}
                </div>
                <div style={{ fontSize: fs(9), color: COLORS.textGhost, marginTop: 1, fontStyle: isForecast ? 'italic' : 'normal' }}>
                  {isForecast ? '~' : ''}{formatDate(segment.targetDate)}
                </div>
                {action && (
                  <div style={{ fontSize: fs(9), color: COLORS.gold, marginTop: 2, maxWidth: 110, whiteSpace: 'normal' }}>
                    {action}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
