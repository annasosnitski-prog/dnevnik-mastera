// Чистая view-model вкладки «Клиенты» в Админке: клиентские дела со всех
// проектов — ручные (next step без точки на рельсе) и автоматические (цикл
// заживления). Что считается «клиентским» шагом, решает isTimelineNextAction
// (projectSelectors.ts); сам цикл заживления считает healingCycleReminders,
// здесь только раскладка в плитки. Бизнес-правил не добавляет.

import type { Client } from '../../domain/client';
import { hasNextStep, nextStepLabel, type Project } from '../../domain/project';
import { clientNameFor, isTimelineNextAction } from '../../domain/projectSelectors';
import { healingStageLabel, type HealingCycleItem } from '../../reminders/healingCycle';

export interface ClientActionTile {
  key: string;
  project: Project;
  // Главная строка плитки — что сделать.
  title: string;
  // Проект · клиент.
  subtitle: string;
  // Дата дела (yyyy-mm-dd) или null; для просроченных плитка красится.
  date: string | null;
  overdue: boolean;
}

function projectLine(project: Project, clientName: string | null): string {
  const title = project.title || 'Проект';
  return clientName ? `${title} · ${clientName}` : title;
}

// Ручные клиентские шаги: активные проекты, у которых next step есть, но
// точки на рельсе у него нет (связаться, проверить проект, «другое», шаг без
// типа). Просроченные и ближайшие — первыми, без даты — в конце.
export function buildManualClientActions(projects: Project[], clients: Client[], today: string): ClientActionTile[] {
  return projects
    .filter((p) => p.status === 'active' && hasNextStep(p) && !isTimelineNextAction(p.nextActionType))
    .map((project) => ({
      key: `manual:${project.id}`,
      project,
      title: nextStepLabel(project),
      subtitle: projectLine(project, clientNameFor(clients, project.clientId)),
      date: project.nextActionDate,
      overdue: project.nextActionDate !== null && project.nextActionDate < today,
    }))
    .sort((a, b) => {
      if (a.date === null && b.date === null) return 0;
      if (a.date === null) return 1;
      if (b.date === null) return -1;
      return a.date.localeCompare(b.date);
    });
}

// Автоматические: открытые шаги цикла заживления (см. healingCycleReminders).
// Дата плитки — дата сессии-якоря.
export function buildAutoHealingActions(healing: HealingCycleItem[]): ClientActionTile[] {
  return healing.map((it) => ({
    key: `auto:${it.project.id}:${it.stage}`,
    project: it.project,
    title: healingStageLabel(it.stage, it.isLastSession),
    subtitle: projectLine(it.project, it.client?.name || null),
    date: it.date,
    overdue: false,
  }));
}
