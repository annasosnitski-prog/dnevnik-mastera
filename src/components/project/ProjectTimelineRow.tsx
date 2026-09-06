import { type Project } from '../../domain/project';
import { getProjectPipelineSegments, type PipelineSegmentKey } from '../../domain/projectSelectors';
import { isRTL, firstLetter } from '../../lib/textFormat';
import { formatDate, todayISO } from '../../utils/dates';
import { COLORS, fs } from '../ui/designTokens';

const SEGMENT_LABELS: Record<PipelineSegmentKey, string> = {
  moodboard: 'Мудборд',
  sketch: 'Эскиз',
  consultation: 'Консультация',
  session: 'Сессия',
};

// Прототип шкалы «Запрос → первая сессия» (§17/§22 pipeline-документа) —
// один проект = одна горизонтальная строка. Точки стоят через равные
// промежутки по ПОРЯДКУ (индексу), не по доле реального времени: раньше
// позиция считалась как доля пройденного пути по датам, и при неровных
// интервалах между вехами (например, долгая пауза перед сессией) соседние
// точки и их подписи наезжали друг на друга — тем сильнее, чем ближе даты
// друг к другу оказывались по случайности. Индексная раскладка всегда даёт
// одинаковые, предсказуемые промежутки (0/33/66/100% для четырёх точек)
// независимо от дат, так что подписи никогда не сталкиваются.
//
// Прожитая часть (от старта до сегодня) закрашена — что уже должно было
// произойти; будущая часть — просто линия. Точка считается «пройденной»,
// если её собственная дата <= сегодня, независимо от закраски линии под ней.
function indexPosition(index: number, count: number): number {
  return count <= 1 ? 0 : (index / (count - 1)) * 100;
}

// «Сегодня» ложится на ту же индексную шкалу — интерполяция идёт по датам
// внутри пары точек, между которыми сегодня оказалось, а не по всему
// диапазону сразу, так что заливка линии остаётся согласованной с
// индексными позициями точек выше.
function todayPosition(segments: { targetDate: string }[], today: string): number {
  const count = segments.length;
  if (count === 0) return 0;
  if (today <= segments[0].targetDate) return 0;
  if (today >= segments[count - 1].targetDate) return 100;
  for (let i = 0; i < count - 1; i++) {
    const a = segments[i].targetDate;
    const b = segments[i + 1].targetDate;
    if (today >= a && today <= b) {
      const aMs = new Date(`${a}T00:00:00.000Z`).getTime();
      const bMs = new Date(`${b}T00:00:00.000Z`).getTime();
      const todayMs = new Date(`${today}T00:00:00.000Z`).getTime();
      const frac = bMs > aMs ? (todayMs - aMs) / (bMs - aMs) : 0;
      return indexPosition(i, count) + frac * (indexPosition(i + 1, count) - indexPosition(i, count));
    }
  }
  return 100;
}

export function ProjectTimelineRow({ project, clientName }: { project: Project; clientName: string | null }) {
  const segments = getProjectPipelineSegments(project);
  if (!segments || segments.length === 0) return null;

  const today = todayISO();
  const todayPct = todayPosition(segments, today);

  return (
    <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(var(--gold-rgb),0.08)' }}>
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
          {firstLetter(project.title)}
        </span>
        <span dir="auto" style={{ fontSize: fs(14), color: COLORS.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {project.title}
        </span>
        {clientName && (
          <span style={{ fontSize: fs(11), color: COLORS.textGhost, fontStyle: 'italic', flexShrink: 0 }}>{clientName}</span>
        )}
      </div>

      <div style={{ position: 'relative', height: 48, margin: '0 40px' }}>
        {/* Линия целиком; закрашенная часть — «сегодня уже здесь». */}
        <div style={{ position: 'absolute', top: 4, left: 0, right: 0, height: 2, background: 'rgba(var(--gold-rgb),0.15)', borderRadius: 1 }} />
        <div style={{ position: 'absolute', top: 4, left: 0, width: `${todayPct}%`, height: 2, background: 'rgba(var(--gold-rgb),0.65)', borderRadius: 1 }} />

        {segments.map((segment, index) => {
          const pct = indexPosition(index, segments.length);
          const passed = segment.targetDate <= today;
          // Подпись у крайних точек анкерится к своему краю, а не к центру
          // (иначе текст первой/последней точки вылезал бы за пределы
          // строки) — на саму точку на линии это не влияет, она всегда точно
          // по центру своего `pct`.
          const anchor = pct < 10 ? 'left' : pct > 90 ? 'right' : 'center';
          return (
            <div key={segment.key}>
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: `${pct}%`,
                  transform: 'translateX(-50%)',
                  width: 9,
                  height: 9,
                  borderRadius: '50%',
                  border: `1.5px solid ${passed ? COLORS.gold : 'rgba(var(--gold-rgb),0.4)'}`,
                  background: passed ? COLORS.gold : 'transparent',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  top: 17,
                  left: `${pct}%`,
                  transform: anchor === 'left' ? 'translateX(0%)' : anchor === 'right' ? 'translateX(-100%)' : 'translateX(-50%)',
                  textAlign: anchor,
                  whiteSpace: 'nowrap',
                }}
              >
                <div style={{ fontSize: fs(9.5), color: passed ? COLORS.textSecondary : COLORS.textGhost }}>
                  {SEGMENT_LABELS[segment.key]}
                </div>
                <div style={{ fontSize: fs(9), color: COLORS.textGhost, marginTop: 1 }}>
                  {formatDate(segment.targetDate)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
