// Стабильные ключи карточек напоминаний — по ним запоминается, какие
// карточки мастер закрыла вручную (dismissedReminders, localStorage).
// Вынесено из TattoDiary.tsx (PR 4 рефакторинга).
//
// overdue/healing/soon-ключи перенесены дословно. Ключ проекта ИСПРАВЛЕН —
// см. actionSignature ниже.

import type { Project } from '../domain/project';
import type { OverdueItem, HealingItem, UpcomingSoonItem, ProjectSessionReminderItem } from './types';

// Полный id Task-напоминания (reminder.id) — им же ключуется «скрыть» (hide):
// зависит от sourceId (client/master + конкретная задача), rule и dueDate.
// Rule в ключе — намеренно: скрыть задачу «на сегодня» (task_due) закрывает
// именно ЭТОТ экземпляр; когда завтра та же задача становится просроченной
// (task_overdue), id меняется, и overdue-напоминание появляется заново.
export function taskReminderKey(params: { sourceId: string; rule: string; dueDate: string }): string {
  return `task:${params.sourceId}:${params.rule}:${params.dueDate}`;
}

// Устойчивый action-key задачи — им ключуется «отложить» (snooze). В отличие
// от reminder.id, НЕ зависит от rule: задача, отложенная «на сегодня», не
// должна вынырнуть завтра только из-за перехода task_due → task_overdue.
// Зависит от sourceId (scope + конкретная задача) и dueDate — смена срока
// мастером = новое обязательство, откладывание при этом сбрасывается.
export function taskReminderActionKey(params: { sourceId: string; dueDate: string }): string {
  return `task-action:${params.sourceId}:${params.dueDate}`;
}

export function overdueReminderKey(it: OverdueItem): string {
  return `overdue:${it.kind}:${it.id}`;
}

// Ключ включает stage — у каждой стадии заживления своя карточка, «удалить»
// один этап не трогает следующий (см. HealingStage/HEALING_STAGES).
export function healingReminderKey(it: HealingItem): string {
  return `healing:${it.sessionId}:${it.stage}`;
}

export function soonReminderKey(it: UpcomingSoonItem): string {
  return `soon:${it.kind}:${it.id}`;
}

export function overdueProjectSessionReminderKey(it: ProjectSessionReminderItem): string {
  return `project-session:overdue:${it.project.id}:${it.sessionId}`;
}

export function soonProjectSessionReminderKey(it: ProjectSessionReminderItem): string {
  return `project-session:soon:${it.project.id}:${it.sessionId}`;
}

// Нормализация свободного текста действия перед построением подписи: убрать
// пробелы по краям и схлопнуть внутренние последовательности пробелов в один.
// Так косметически одинаковые тексты («напиши  клиенту» и « напиши клиенту »)
// дают одну подпись и не плодят разные ключи.
export function normalizeActionText(text: string): string {
  return (text ?? '').trim().replace(/\s+/g, ' ');
}

// Подпись КОНКРЕТНОГО следующего действия проекта. Зависит от projectId,
// правила, даты и (нормализованного) текста действия. Меняется, как только
// меняется само действие — поэтому закрытие одного напоминания больше не
// прячет другое, более позднее действие того же проекта.
//
// Текст — последнее поле: двоеточия внутри него не создают коллизий, так как
// все предыдущие поля (projectId, rule, ISO-дата) двоеточий не содержат.
export function actionSignature(params: {
  projectId: string;
  rule: string;
  nextActionDate: string | null;
  nextActionText: string;
}): string {
  return `${params.projectId}:${params.rule}:${params.nextActionDate ?? ''}:${normalizeActionText(params.nextActionText)}`;
}

// БЫЛО: `project:${p.id}` — не зависело от самого действия, поэтому закрытое
// напоминание навсегда прятало ЛЮБОЕ будущее действие того же проекта
// (см. docs/TECH_REFACTOR_AUDIT.md, вопрос 8). СТАЛО: ключ включает подпись
// действия, так что смена текста/даты «следующего шага» рождает новый ключ.
// Побочный безопасный эффект: одно ранее закрытое напоминание после смены
// действия может показаться повторно — это лучше вечного скрытия.
export function projectReminderKey(p: Project): string {
  return `project:${actionSignature({
    projectId: p.id,
    rule: 'project_action_due',
    nextActionDate: p.nextActionDate,
    nextActionText: p.nextActionText,
  })}`;
}
