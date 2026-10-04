import { hasNextStep as projectHasNextStep, nextStepLabel, type Project } from '../../domain/project';
import { getSessionWindowProgress, type ProjectSessionWindow } from '../../domain/projectSelectors';
import { formatDate, todayISO } from '../../utils/dates';
import { COLORS, fs } from '../ui/designTokens';
import { ProgressRail } from '../ui/ProgressRail';
import { DayTickRuler } from '../ui/DayTickRuler';
import { ProjectRowHeader } from './ProjectTimelineRow';
import './ProjectSessionWindowRow.css';

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

// Доля заливки отрезка «последняя → следующая». Следующей нет — пусто, а не
// «дотлело»: эта строка рендерится только для проекта в статусе 'active' (см.
// ProjectTimelineList), а withStatusAfterDoneSession (project.ts) уводит
// проект в 'healing' сразу, как только выполненная сессия оказывается
// последней (sessionsPlan==='single' или отметка мастера isLastSession). Раз
// проект всё ещё 'active' и следующая дата не назначена — по самому статусу
// ясно, что сессия будет, просто пока не поставлена в расписание. Пустая
// рельса плюс приглашающая точка (см. .session-window-invite-dot) — честнее
// старого «дотлевания», которое выглядело как завершённость там, где её нет.
// next <= last — испорченные/ручные данные (просроченная незакрытая запись
// раньше последней выполненной) — тот же эффект: срок уже наступил.
//
// Расчёт теперь в domain/projectSelectors.ts (getSessionWindowProgress) —
// см. комментарий у getPipelineProgress там же: сортировка ProjectTimelineList
// должна читать то же число, которым красится рельса.
const windowProgress = getSessionWindowProgress;

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
  const awaitingNext = sessionWindow.nextSessionDate === null;
  const progress = windowProgress(sessionWindow.lastSessionDate, sessionWindow.nextSessionDate, today);
  const showNextStep = projectHasNextStep(project) && project.nextActionDate !== null;
  const nextStepOverdue = showNextStep && project.nextActionDate! < today;

  return (
    <div
      onClick={onOpen ? () => onOpen(project) : undefined}
      style={{ padding: '14px 16px', borderBottom: '1px solid rgba(var(--gold-rgb),0.08)', cursor: onOpen ? 'pointer' : undefined }}
    >
      <ProjectRowHeader project={project} clientName={clientName} />

      {/* Тот же отступ, что и у ProjectTimelineRow — иначе рельса этого
          виджета визуально длиннее/короче пайплайновой в соседних строках
          одного списка (см. разбор скриншота AdminINKA: у «Веном» рельса
          тянулась к самому краю строки, а у пайплайновых строк — с заметным
          отступом). */}
      <div style={{ position: 'relative', height: 40, margin: '0 10px' }}>
        <div style={{ position: 'absolute', top: -5, left: 0, right: 0, height: 20 }}>
          <ProgressRail progress={progress} />
          {/* Риска на каждый календарный день между сессиями — чтобы
              короткий интервал можно было буквально пересчитать глазами.
              Не рисуется вовсе, если дней много (см. DayTickRuler) или
              следующая дата ещё не назначена — считать тут пока нечего. */}
          {!awaitingNext && (
            <DayTickRuler startISO={sessionWindow.lastSessionDate} endISO={sessionWindow.nextSessionDate!} today={today} />
          )}
        </div>

        {/* Пустая рельса сама по себе смотрится заброшенно — точка-маркер у
            правого края дышит золотом, приглашая назначить дату вместо того,
            чтобы молча пустовать (см. комментарий у windowProgress выше). */}
        {awaitingNext && (
          <span
            aria-hidden="true"
            className="session-window-invite-dot"
            style={{
              position: 'absolute',
              top: 4,
              right: -2,
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: COLORS.gold,
              boxShadow: `0 0 4px ${COLORS.gold}, 0 0 8px rgba(224,181,105,0.5)`,
            }}
          />
        )}

        <div style={{ position: 'absolute', top: 17, left: 0, textAlign: 'left' }}>
          <div style={{ fontSize: fs(9.5), color: COLORS.textSecondary }}>Последняя сессия</div>
          <div style={{ fontSize: fs(9), color: COLORS.textGhost, marginTop: 1 }}>
            {formatDate(sessionWindow.lastSessionDate)} · {relativeLabel(sessionWindow.lastSessionDate, today)}
          </div>
        </div>

        <div style={{ position: 'absolute', top: 17, right: 0, textAlign: 'right' }}>
          <div style={{ fontSize: fs(9.5), color: COLORS.textSecondary }}>
            Следующая сессия
          </div>
          {/* Не «не назначена» призрачным курсивом — раз статус проекта
              говорит, что сессия будет, пустота здесь честнее показывать
              тёплым золотом рядом с дышащей точкой, а не серым безразличием
              (см. windowProgress выше). */}
          <div style={{ fontSize: fs(9), color: awaitingNext ? COLORS.gold : COLORS.textGhost, marginTop: 1 }}>
            {sessionWindow.nextSessionDate ? `${formatDate(sessionWindow.nextSessionDate)} · ${relativeLabel(sessionWindow.nextSessionDate, today)}` : 'не назначена'}
          </div>
        </div>
      </div>

      {showNextStep && (
        <div style={{ marginTop: 14, fontSize: fs(11) }}>
          <span style={{ color: nextStepOverdue ? 'var(--urgent)' : COLORS.gold }}>{nextStepLabel(project)}</span>
          <span style={{ color: COLORS.textGhost }}> · {formatDate(project.nextActionDate!)} · {relativeLabel(project.nextActionDate!, today)}</span>
        </div>
      )}
    </div>
  );
}
