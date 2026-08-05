// Стабильные ключи карточек напоминаний — по ним запоминается, какие
// карточки мастер закрыла вручную (dismissedReminders, localStorage).
// Вынесено из TattoDiary.tsx (PR 4 рефакторинга).
//
// overdue/soon/project-session-ключи ИСПРАВЛЕНЫ — теперь несут дату (и для
// soon ещё и время) события, а не только id сущности (PR M3): перенос
// сессии/консультации на новую дату/время меняет ключ, поэтому старое
// закрытое/отложенное напоминание для прежней даты не прячет новое (см.
// комментарии у каждой функции ниже). Старые ключи без даты не мигрируются —
// они просто перестают на что-либо ссылаться. Ключ проекта ИСПРАВЛЕН —
// см. actionSignature ниже.

import type { Project } from '../domain/project';
import { HEALING_STAGES } from './buildReminders.js';
import type { HealingStage, OverdueItem, HealingItem, UpcomingSoonItem, ProjectSessionReminderItem, StaleProjectItem } from './types';

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

// Дата в ключе — перенос сессии/консультации на другую дату (Перенести)
// делает её новым, не скрытым напоминанием, даже если старая дата была
// отложена/скрыта.
export function overdueReminderKey(it: OverdueItem): string {
  return `overdue:${it.kind}:${it.id}:${it.date}`;
}

function healingKeyFor(sessionId: string, stage: HealingStage): string {
  return `healing:${sessionId}:${stage}`;
}

// Ключ включает stage — у каждой стадии заживления своя карточка, «скрыть»
// один этап не трогает следующий (см. HealingStage/HEALING_STAGES).
export function healingReminderKey(it: HealingItem): string {
  return healingKeyFor(it.sessionId, it.stage);
}

// Все возможные ключи заживления одной сессии (все 4 стадии), не только ту,
// что видна сейчас — нужно для «Не напоминать больше»: окна стадий не
// пересекаются, поэтому видна максимум одна карточка за раз, но скрыть надо
// заранее и будущие стадии тоже, а не только текущую.
export function healingReminderKeysForSession(sessionId: string): string[] {
  return HEALING_STAGES.map((s) => healingKeyFor(sessionId, s.stage));
}

// Дата+время в ключе — те же соображения, что у overdueReminderKey, только
// «скоро» ещё и зависит от времени (36–48ч окно), поэтому дата одна и та же
// не гарантирует то же самое напоминание.
export function soonReminderKey(it: UpcomingSoonItem): string {
  return `soon:${it.kind}:${it.id}:${it.date}:${it.time}`;
}

export function overdueProjectSessionReminderKey(it: ProjectSessionReminderItem): string {
  return `project-session:overdue:${it.project.id}:${it.sessionId}:${it.date}`;
}

export function soonProjectSessionReminderKey(it: ProjectSessionReminderItem): string {
  return `project-session:soon:${it.project.id}:${it.sessionId}:${it.date}:${it.time}`;
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

// Дата в ключе (M4) — та же причина, что у overdueReminderKey/soonReminderKey:
// как только у проекта появляется свежая активность, lastActivityDate
// сдвигается вперёд и ключ меняется, поэтому старое закрытое/отложенное
// напоминание о застое не прячет новое, если проект застынет снова позже.
export function staleProjectReminderKey(it: StaleProjectItem): string {
  return `project-stale:${it.project.id}:${it.lastActivityDate}`;
}
