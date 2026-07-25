// Строитель ленты Task-напоминаний — поверх существующего reminder engine,
// без нового Task/Reminder-типа. Task = ClientNote (см.
// TECH_REFACTOR_AUDIT.md), источники — client.notes (IndexedDB) и
// masterInfo.notes (localStorage), они НЕ объединяются в один стор.
//
// Чистые функции: (data, now: Date) → результат, ничего не знают о
// React/IndexedDB/localStorage, входные массивы не мутируют.

import type { Client } from '../domain/client';
import type { ClientNote } from '../domain/task';
import { urgencyRank } from '../domain/taskSelectors';
import { isValidISODate } from '../utils/dates';
import { taskReminderKey, taskReminderActionKey } from './reminderKeys';
import { isReminderDismissed, isReminderSnoozed, type ReminderState } from './reminderState';
import type { TaskReminderItem, TaskReminderSource } from './types';

// Local (not UTC) yyyy-mm-dd for the given moment — тот же приём, что и в
// buildReminders.ts (localISO), продублирован здесь намеренно: файлы
// остаются независимыми друг от друга, как остальные builder-модули.
function localISO(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// Нормализация обоих источников задач в единый вид для reminder engine.
// Порядок: сперва клиентские (в порядке clients/notes), затем мастерские —
// стабилен и достаточен, финальную сортировку по правилам/срочности делает
// taskReminders().
export function taskReminderSources(clients: Client[], masterNotes: ClientNote[]): TaskReminderSource[] {
  const result: TaskReminderSource[] = [];
  for (const client of clients) {
    for (const task of client.notes) {
      result.push({ task, scope: 'client', clientId: client.id });
    }
  }
  for (const task of masterNotes) {
    result.push({ task, scope: 'master', clientId: null });
  }
  return result;
}

// Правила (чисто по календарной дате, без времени суток):
// done → нет напоминания; dueDate === null → нет напоминания; dueDate
// сегодня → task_due; dueDate в прошлом → task_overdue; dueDate в будущем →
// нет напоминания (ещё). Срок НЕ выводится из createdDate/urgency.
//
// Порядок результата: overdue раньше due-сегодня; внутри группы — выше
// urgency раньше (по индексу в URGENCY, см. urgencyRank), затем раньше
// createdDate раньше.
export function taskReminders(sources: TaskReminderSource[], now: Date): TaskReminderItem[] {
  const today = localISO(now);
  const result: TaskReminderItem[] = [];
  for (const { task, scope, clientId } of sources) {
    if (task.done) continue;
    if (!isValidISODate(task.dueDate)) continue;
    const dueDate = task.dueDate as string;
    if (dueDate > today) continue;
    const rule = dueDate === today ? 'task_due' : 'task_overdue';
    const sourceId = scope === 'client' ? `client:${clientId}:${task.id}` : `master:${task.id}`;
    result.push({
      id: taskReminderKey({ sourceId, rule, dueDate }),
      actionKey: taskReminderActionKey({ sourceId, dueDate }),
      rule,
      sourceType: 'task',
      sourceId,
      scope,
      clientId,
      projectId: task.projectId,
      text: task.text,
      dueDate,
      urgency: task.urgency,
      createdDate: task.createdDate,
      taskId: task.id,
    });
  }
  const ruleRank = (r: TaskReminderItem['rule']) => (r === 'task_overdue' ? 0 : 1);
  return result.sort((a, b) => {
    const byRule = ruleRank(a.rule) - ruleRank(b.rule);
    if (byRule !== 0) return byRule;
    const byUrgency = urgencyRank(a.urgency) - urgencyRank(b.urgency);
    if (byUrgency !== 0) return byUrgency;
    return a.createdDate.localeCompare(b.createdDate);
  });
}

// Видимость Task-напоминаний. В отличие от общего filterVisibleReminders
// (один ключ на скрытие и откладывание), у задач это РАЗНЫЕ ключи:
//  - скрыто — по reminder.id (с rule): скрытие task_due не мешает завтрашнему
//    task_overdue появиться заново;
//  - отложено — по actionKey (без rule): откладывание переживает переход
//    due→overdue, задача остаётся скрытой до showAfter.
// Порядок сохраняется (только .filter), сам стейт не мутируется.
export function filterVisibleTaskReminders(
  items: TaskReminderItem[],
  state: ReminderState,
  now: Date,
): TaskReminderItem[] {
  return items.filter(
    (it) => !isReminderDismissed(state, it.id) && !isReminderSnoozed(state, it.actionKey, now),
  );
}
