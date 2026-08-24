// Доменный тип проекта, его статусные union-типы и label-константы — тот же
// существующий тип, что и раньше (вынесен из TattoDiary.tsx в PR 2).

import type { Session } from './session';
import type { Consultation } from './consultation';

export type ProjectCategory = 'tattoo' | 'drawing' | 'collab' | 'other';

export const PROJECT_CATEGORIES: { key: ProjectCategory; label: string }[] = [
  { key: 'tattoo', label: 'Тату' },
  { key: 'drawing', label: 'Рисунок' },
  { key: 'collab', label: 'Коллаба' },
  { key: 'other', label: 'Другое' },
];

// Project.area remains a plain string for backwards compatibility. This list
// constrains only the project editor/filter UI; Session.area and
// Consultation.area remain free text.
export const PROJECT_BODY_AREAS: { key: string; label: string }[] = [
  { key: 'Спина', label: 'Спина' },
  { key: 'Нога', label: 'Нога' },
  { key: 'Рука', label: 'Рука' },
  { key: 'Грудь', label: 'Грудь' },
  { key: 'Живот', label: 'Живот' },
  { key: 'Рёбра', label: 'Рёбра' },
  { key: 'Лобок', label: 'Лобок' },
  { key: 'Солнечное сплетение', label: 'Солнечное сплетение' },
  { key: 'Лопатка', label: 'Лопатка' },
  { key: 'Трапеция', label: 'Трапеция' },
  { key: 'Кисть', label: 'Кисть' },
  { key: 'Стопа', label: 'Стопа' },
  { key: 'Голень', label: 'Голень' },
  { key: 'Икра', label: 'Икра' },
  { key: 'Плечо', label: 'Плечо' },
  { key: 'Предплечье', label: 'Предплечье' },
  { key: 'Бедро', label: 'Бедро' },
  { key: 'Поясница', label: 'Поясница' },
  { key: 'Колено', label: 'Колено' },
  { key: 'Лодыжка', label: 'Лодыжка' },
  { key: 'Локоть', label: 'Локоть' },
  { key: 'Пах', label: 'Пах' },
  { key: 'Пальцы', label: 'Пальцы' },
];

export type ProjectStage = 'idea' | 'inquiry' | 'planning' | 'booked' | 'in_progress' | 'healing' | 'completed';
export type ProjectState = 'active' | 'paused' | 'cancelled' | 'archived';
export type ProjectWaitingFor = 'master' | 'client' | 'external' | 'none';
export type ProjectPriority = 'urgent' | 'important' | 'normal';
export type FirstSessionWindowUnit = 'week' | 'month';
export type PreSessionMeeting = 'consultation' | 'none';

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

export type NextActionType =
  | 'contact_client'
  | 'collect_information'
  | 'prepare_design'
  | 'schedule_consultation'
  | 'schedule_session'
  | 'receive_deposit'
  | 'prepare_session'
  | 'check_healing'
  | 'schedule_next_session'
  | 'review_project'
  | 'other';

export const NEXT_ACTION_TYPES: { key: NextActionType; label: string }[] = [
  { key: 'contact_client', label: 'Связаться с клиентом' },
  { key: 'collect_information', label: 'Собрать информацию' },
  { key: 'prepare_design', label: 'Подготовить дизайн' },
  { key: 'schedule_consultation', label: 'Назначить консультацию' },
  { key: 'schedule_session', label: 'Назначить сессию' },
  { key: 'receive_deposit', label: 'Получить предоплату' },
  { key: 'prepare_session', label: 'Подготовиться к сессии' },
  { key: 'check_healing', label: 'Проверить заживление' },
  { key: 'schedule_next_session', label: 'Назначить следующую сессию' },
  { key: 'review_project', label: 'Проверить проект' },
  { key: 'other', label: 'Другое' },
];

export function resolveNextStep(
  text: string,
  date: string | null,
  type: NextActionType | null,
): { nextActionText: string; nextActionDate: string | null; nextActionType: NextActionType | null } {
  const trimmed = text.trim();
  if (!trimmed) return { nextActionText: '', nextActionDate: null, nextActionType: null };
  return { nextActionText: trimmed, nextActionDate: date, nextActionType: type };
}

export function withAdvancedStage(project: Project, target: ProjectStage): Project {
  const current = PROJECT_STAGES.findIndex((s) => s.key === project.stage);
  const next = PROJECT_STAGES.findIndex((s) => s.key === target);
  if (next < 0 || next <= current) return project;
  return { ...project, stage: target };
}

export interface Project {
  id: string;
  title: string;
  color: string; // legacy marker colour; no longer exposed by project UI
  category: ProjectCategory;
  clientId: string | null;
  stage: ProjectStage;
  state: ProjectState;
  waitingFor: ProjectWaitingFor;
  nextActionText: string;
  nextActionDate: string | null;
  nextActionType: NextActionType | null;
  priority: ProjectPriority;
  area: string;
  style: string;
  generalNotes: string;
  feeling: string;
  creative: string;
  inspirationSources: string;
  photos: string[];
  createdDate: string;
  // Optional at the raw/in-memory type boundary so old object literals stay
  // source-compatible. normalizeProject always materializes explicit defaults.
  firstSessionWindowAmount?: number | null;
  firstSessionWindowUnit?: FirstSessionWindowUnit | null;
  preSessionMeeting?: PreSessionMeeting;
  sessions: Session[];
  consultations: Consultation[];
  lastMeaningfulActivityAt: string | null;
}

export function isMeaningfulProjectChange(prev: Project, next: Project): boolean {
  return (
    prev.stage !== next.stage ||
    prev.state !== next.state ||
    prev.waitingFor !== next.waitingFor ||
    prev.nextActionText !== next.nextActionText ||
    prev.nextActionDate !== next.nextActionDate ||
    prev.nextActionType !== next.nextActionType
  );
}
