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

// Что написать над точкой текущего отрезка — своя формулировка мастера
// (actionText), если она есть, иначе стандартная подпись типа действия
// (actionType). Для 'actual' обе всегда null (см. getProjectPipelineSegments)
// — там и рендерить нечего, показывать «Назначить консультацию» под уже
// назначенной консультацией как раз и было нечестно в старой версии шкалы.
function actionLabel(segment: ProjectPipelineSegment): string | null {
  if (segment.actionText) return segment.actionText;
  if (segment.actionType) return NEXT_ACTION_LABELS[segment.actionType] ?? null;
  return null;
}

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
//
// С появлением 'actual'/'committed' точек даты сегментов больше НЕ обязаны
// идти по возрастанию — например, у уже прошедшей реальной консультации
// (индекс 2) дата может оказаться позже, чем у ещё не наступившей прогнозной
// «Сессии» (индекс 3, forecast всегда равен исходной целевой дате окна), и
// наоборот. Наивный проход по соседним парам в порядке индекса (как было
// раньше) в таком случае мог сравнить не ту пару и либо зациклиться на
// невalidном диапазоне, либо просто не найти пару и молча вернуть 100%.
// Вместо этого ищем САМЫЙ ПОЗДНИЙ по индексу сегмент, чья дата уже <=
// сегодня (проверяя все, а не полагаясь на порядок) — это и есть точка,
// докуда закрашивать. Следующий по индексу сегмент по построению всегда
// окажется в будущем (иначе он сам стал бы этим самым «самым поздним»), так
// что пара для интерполяции внутри отрезка всегда корректна.
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

// Оформление точки по источнику даты (см. PipelineSegmentSource) — это и
// есть весь смысл переделки: факт, обещание и прогноз должны читаться
// по-разному с первого взгляда, а не сливаться в одинаковые точки на линии.
function dotStyle(source: ProjectPipelineSegment['source']): React.CSSProperties {
  if (source === 'actual') {
    // Факт — сплошная золотая точка, как раньше выглядела «пройденная».
    return { border: `1.5px solid ${COLORS.gold}`, background: COLORS.gold };
  }
  if (source === 'committed') {
    // Обещание мастера — золотое кольцо с прозрачной серединой: уже не
    // догадка, но ещё не свершившийся факт.
    return { border: `1.5px solid ${COLORS.gold}`, background: 'transparent' };
  }
  // Прогноз — тускло, полая точка: это проекция, а не факт и не обещание.
  return { border: '1.5px solid rgba(var(--gold-rgb),0.4)', background: 'transparent' };
}

export function ProjectTimelineRow({
  project,
  clientName,
  segments,
}: {
  project: Project;
  clientName: string | null;
  segments: ProjectPipelineSegment[];
}) {
  if (segments.length === 0) return null;

  const today = todayISO();
  const todayPct = todayPosition(segments, today);
  // Текущий отрезок — самая ранняя точка, которая ещё не факт: именно там
  // нужна подсказка «что делать», остальные либо уже случились (нечего
  // подсказывать), либо и так станут актуальными позже. Если факт вообще
  // всё (весь путь до первой сессии уже пройден записями) — подсказку не
  // показываем нигде, currentStretchIndex останется -1.
  const currentStretchIndex = segments.findIndex((s) => s.source !== 'actual');

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
        {/* Та же подвесочная штанга (ClientCardTabBar's PendantRail), только
            заполняемая по прогрессу вместо провисания между камнями —
            закрашенная часть («сегодня уже здесь») светится тем же
            двухслойным drop-shadow, что и её собственный металл. */}
        <div style={{ position: 'absolute', top: -5, left: 0, right: 0 }}>
          <ProgressRail progress={todayPct / 100} />
        </div>

        {segments.map((segment, index) => {
          const pct = indexPosition(index, segments.length);
          // Подпись у крайних точек анкерится к своему краю, а не к центру
          // (иначе текст первой/последней точки вылезал бы за пределы
          // строки) — на саму точку на линии это не влияет, она всегда точно
          // по центру своего `pct`.
          const anchor = pct < 10 ? 'left' : pct > 90 ? 'right' : 'center';
          const isForecast = segment.source === 'forecast';
          const labelColor = isForecast ? COLORS.textGhost : COLORS.textSecondary;
          const action = index === currentStretchIndex ? actionLabel(segment) : null;
          return (
            <div key={segment.key} style={{ opacity: isForecast ? 0.55 : 1 }}>
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: `${pct}%`,
                  transform: 'translateX(-50%)',
                  width: 9,
                  height: 9,
                  borderRadius: '50%',
                  ...dotStyle(segment.source),
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
                <div style={{ fontSize: fs(9.5), color: labelColor }}>
                  {SEGMENT_LABELS[segment.key]}
                </div>
                <div style={{ fontSize: fs(9), color: COLORS.textGhost, marginTop: 1, fontStyle: isForecast ? 'italic' : 'normal' }}>
                  {/* Прогноз всегда помечен «~» — дата не факт, а проекция, и
                      её нельзя перепутать с настоящей (см. разбор бага). */}
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
