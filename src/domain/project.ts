// Доменный тип проекта, его статусные union-типы и label-константы. Вынесено
// из TattoDiary.tsx без изменений (PR 2). Второй модели Project не создаётся —
// это тот же существующий тип. Поля nextActionType у проекта сейчас НЕТ — его
// добавление — отдельный будущий PR (см. docs/TECH_REFACTOR_AUDIT.md).

import type { Session } from './session';

// A standalone sketch/portfolio idea for «Творческая мастерская» — not tied
// to any client (unlike Consultation, which lives inside a Client). Shares
// the consultation's own field set (same brief-writing form) since it's the
// same kind of thinking — mood, references, technique — just without a
// person attached to it yet; the one field it adds is its own colour tag,
// since without a client there's no `client.color` to inherit.
export type ProjectCategory = 'tattoo' | 'drawing' | 'collab' | 'other';

export const PROJECT_CATEGORIES: { key: ProjectCategory; label: string }[] = [
  { key: 'tattoo', label: 'Тату' },
  { key: 'drawing', label: 'Рисунок' },
  { key: 'collab', label: 'Коллаба' },
  { key: 'other', label: 'Другое' },
];

// Три независимых параметра статуса вместо одной длинной строки-enum
// (вроде "planning_waiting_client_photo_overdue") — где проект находится,
// может ли он сейчас двигаться, и кто должен действовать, читаются по
// отдельности и комбинируются свободно.
export type ProjectStage = 'idea' | 'inquiry' | 'planning' | 'booked' | 'in_progress' | 'healing' | 'completed';
export type ProjectState = 'active' | 'paused' | 'cancelled' | 'archived';
export type ProjectWaitingFor = 'master' | 'client' | 'external' | 'none';
export type ProjectPriority = 'urgent' | 'important' | 'normal';

export const PROJECT_STAGES: { key: ProjectStage; label: string }[] = [
  { key: 'idea', label: 'Идея' },
  { key: 'inquiry', label: 'Запрос' },
  { key: 'planning', label: 'Подготовка' },
  { key: 'booked', label: 'Записан' },
  { key: 'in_progress', label: 'В работе' },
  { key: 'healing', label: 'Заживление' },
  { key: 'completed', label: 'Завершён' },
];

export const PROJECT_STATES: { key: ProjectState; label: string }[] = [
  { key: 'active', label: 'Активен' },
  { key: 'paused', label: 'Пауза' },
  { key: 'cancelled', label: 'Отменён' },
  { key: 'archived', label: 'Архив' },
];

export const PROJECT_WAITING_FOR: { key: ProjectWaitingFor; label: string }[] = [
  { key: 'master', label: 'Мастера' },
  { key: 'client', label: 'Клиента' },
  { key: 'external', label: 'Внешнего' },
  { key: 'none', label: 'Никого' },
];

export const PROJECT_PRIORITIES: { key: ProjectPriority; label: string }[] = [
  { key: 'urgent', label: 'Срочно' },
  { key: 'important', label: 'Важно' },
  { key: 'normal', label: 'Обычный' },
];

export interface Project {
  id: string;
  title: string; // project name, e.g. "Дракон в стиле джапан"
  color: string; // marker colour, chosen at creation — see MarkerColorPalette
  category: ProjectCategory;
  // null = идея без клиента ("мастерская", независимо от одноимённого
  // clientId===null на ContentEntry — те две вещи не связаны).
  clientId: string | null;
  stage: ProjectStage;
  state: ProjectState;
  waitingFor: ProjectWaitingFor;
  nextActionText: string;
  nextActionDate: string | null; // ISO yyyy-mm-dd
  priority: ProjectPriority;
  area: string; // "Место" — intended placement, if already decided
  style: string; // "Техника и стиль"
  generalNotes: string; // "Общие заметки"
  feeling: string; // "Чувство/ощущение"
  creative: string; // "Креатив"
  inspirationSources: string; // "Источники вдохновения"
  photos: string[];
  createdDate: string;
  // «Сессии без клиента» (Этап 3b-доп.) — для проектов без clientId, живут
  // прямо на проекте (свой стор, клиента/календарь не трогают), пока не
  // появится клиент. При привязке клиента к проекту (см. attachClientToProject
  // в App) переезжают в client.sessions с тем же projectId и отсюда чистятся.
  sessions: Session[];
}
