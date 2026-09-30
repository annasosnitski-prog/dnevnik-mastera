// Риски-деления «по дню» на рельсе (ProgressRail) — чтобы в коротком
// интервале дни можно было буквально пересчитать глазами, а не гадать по
// подписям на концах. Не рисуется вовсе, если дней больше MAX_TICK_DAYS —
// риски слипались бы в кашу, а отсчёт при таком масштабе и так идёт по
// более крупной единице (стадии пайплайна у ProjectTimelineRow, просто
// дата у ProjectSessionWindowRow). Порог согласован с мастером напрямую:
// «больше 7 рисок уже перебор» — 7 внутренних рисок это ровно 8-дневный
// интервал (риска на каждую границу дня, кроме самих концов — у них уже
// есть собственные точки/подписи).
const MAX_TICK_DAYS = 8;

function daysBetween(fromISO: string, toISO: string): number {
  const a = new Date(`${fromISO}T00:00:00.000Z`).getTime();
  const b = new Date(`${toISO}T00:00:00.000Z`).getTime();
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

function addDaysISO(dateISO: string, days: number): string {
  const [y, mo, d] = dateISO.split('-').map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

// `startISO`/`endISO` — тот же интервал, что залит ProgressRail рядом (риски
// накладываются поверх неё, не заменяют). `today` решает, какие риски уже
// «пройдены» (ярче) — та же граница, что красит саму рельсу.
export function DayTickRuler({ startISO, endISO, today }: { startISO: string; endISO: string; today: string }) {
  const totalDays = daysBetween(startISO, endISO);
  if (totalDays < 2 || totalDays > MAX_TICK_DAYS) return null;

  const ticks = [];
  for (let i = 1; i < totalDays; i++) {
    const pct = (i / totalDays) * 100;
    const tickISO = addDaysISO(startISO, i);
    const passed = tickISO <= today;
    ticks.push(
      <span
        key={i}
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: `${pct}%`,
          top: 2,
          width: 1,
          height: 6,
          transform: 'translateX(-50%)',
          background: passed ? 'rgba(var(--gold-rgb),0.55)' : 'rgba(var(--gold-rgb),0.22)',
        }}
      />,
    );
  }
  return <>{ticks}</>;
}
