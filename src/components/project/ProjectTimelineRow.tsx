import { NEXT_ACTION_TYPES, type Project } from '../../domain/project';
import { getPipelineProgress, type PipelineSegmentKey, type ProjectPipelineSegment } from '../../domain/projectSelectors';
import { isRTL, firstLetter } from '../../lib/textFormat';
import { formatDate, todayISO } from '../../utils/dates';
import { COLORS, fs } from '../ui/designTokens';
import { ProgressRail } from '../ui/ProgressRail';
import { DayTickRuler } from '../ui/DayTickRuler';

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

// «Сегодня» ложится на ту же индексную шкалу — расчёт самой доли теперь в
// domain/projectSelectors.ts (getPipelineProgress, 0..1 вместо прежних 0..100
// здесь): сортировка ProjectTimelineList («почти завершённые — первыми»)
// должна читать то же число, которым красится рельса, не отдельную копию.
function todayPosition(segments: { targetDate: string }[], today: string): number {
  return getPipelineProgress(segments, today) * 100;
}

// Весь реальный диапазон дат пайплайна (не по индексу точек, как сама
// раскладка выше, а по факту) — риски DayTickRuler кладутся поверх рельсы
// по календарным дням внутри него. Даты сегментов не обязаны идти по
// возрастанию (см. комментарий у todayPosition), поэтому не берём просто
// первый/последний — ищем настоящие край и край.
function overallDateRange(segments: { targetDate: string }[]): { startISO: string; endISO: string } {
  let startISO = segments[0].targetDate;
  let endISO = segments[0].targetDate;
  for (const s of segments) {
    if (s.targetDate < startISO) startISO = s.targetDate;
    if (s.targetDate > endISO) endISO = s.targetDate;
  }
  return { startISO, endISO };
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
  // Тап по строке открывает карточку проекта — тот же переход, что и с
  // обложки проекта или из напоминаний (см. onOpenProject в
  // AdminDashboardScreen). Опционален только чтобы не ломать превью/тесты,
  // которые рендерят строку саму по себе без экрана-обёртки.
  onOpen?: (project: Project) => void;
}) {
  if (segments.length === 0) return null;

  const today = todayISO();
  const todayPct = todayPosition(segments, today);
  const { startISO: pipelineStartISO, endISO: pipelineEndISO } = overallDateRange(segments);
  // Текущий отрезок — самая ранняя точка, которая ещё не факт: именно там
  // нужна подсказка «что делать», остальные либо уже случились (нечего
  // подсказывать), либо и так станут актуальными позже. Если факт вообще
  // всё (весь путь до первой сессии уже пройден записями) — подсказку не
  // показываем нигде, currentStretchIndex останется -1.
  const currentStretchIndex = segments.findIndex((s) => s.source !== 'actual');
  // Подсказка действия — это третья строка под точкой (label + дата + это),
  // и при переносе в maxWidth:110 она может занять две собственные строки.
  // Фиксированная высота 48 (без подсказки) не учитывала такое разрастание:
  // подсказка была position:absolute и просто вылезала ЗА пределы этого
  // блока, наезжая на заголовок следующего проекта в списке (см. скриншот
  // с «Собрать» поверх «Спина Паучьих Лилий»). Резервируем высоту заранее,
  // а не подгоняем постфактум — единственный способ узнать её точно
  // потребовал бы измерения DOM, а здесь фиксированная оценка достаточна.
  const hasActionHint = currentStretchIndex !== -1 && actionLabel(segments[currentStretchIndex]) !== null;
  const scaleHeight = hasActionHint ? 74 : 48;

  // Next step без точки на рельсе (клиентские типы, тип не выбран) здесь не
  // показывается совсем: на рельсе только движение проекта от точки к точке,
  // клиентские действия живут в напоминаниях.

  return (
    <div
      onClick={onOpen ? () => onOpen(project) : undefined}
      style={{ padding: '14px 16px', borderBottom: '1px solid rgba(var(--gold-rgb),0.08)', cursor: onOpen ? 'pointer' : undefined }}
    >
      <ProjectRowHeader project={project} clientName={clientName} />

      <div style={{ position: 'relative', height: scaleHeight, margin: '0 10px' }}>
        {/* Та же подвесочная штанга (ClientCardTabBar's PendantRail), только
            заполняемая по прогрессу вместо провисания между камнями —
            закрашенная часть («сегодня уже здесь») светится тем же
            двухслойным drop-shadow, что и её собственный металл. */}
        <div style={{ position: 'absolute', top: -5, left: 0, right: 0, height: 20 }}>
          {/* Каждая точка пайплайна — кольцо-бусина, надетое на рельсу (факт /
              обещание / прогноз различаются блеском, см. ProgressRail). */}
          <ProgressRail
            progress={todayPct / 100}
            beads={segments.map((segment, index) => ({ at: indexPosition(index, segments.length), kind: segment.source }))}
          />
          {/* Риска на каждый календарный день всего пайплайна — только
              когда весь путь укладывается в считанные дни (см.
              DayTickRuler); на растянутый прогноз в месяцы риски не
              рисуются вовсе, там и так есть более крупная единица счёта —
              сами стадии ниже. */}
          <DayTickRuler startISO={pipelineStartISO} endISO={pipelineEndISO} today={today} />
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
          const action =
            index === currentStretchIndex ? actionLabel(segment) : null;
          return (
            <div key={segment.key} style={{ opacity: isForecast ? 0.55 : 1 }}>
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
