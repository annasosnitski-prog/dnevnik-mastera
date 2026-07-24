// Чистые выборки по проектам (PR 3 рефакторинга). Раньше это были inline-
// фильтры прямо в JSX/обработчиках TattoDiary.tsx — вынесены как есть,
// условия и порядок результатов не менялись.
//
// Правила слоя: данные приходят аргументами, ничего не мутируется
// (filter/find возвращают новые массивы/ссылки), нет обращений к React,
// IndexedDB и localStorage.

import type { Project } from './project';
import type { Session } from './session';
import type { Consultation } from './consultation';

// Проект по id. Возвращает null (а не undefined), чтобы вызывающий код
// одинаково работал и через `if (!p)`, и через `?? fallback` — оба
// использованных в компоненте паттерна ведут себя как прежде.
export function getProjectById(projects: Project[], id: string): Project | null {
  return projects.find((p) => p.id === id) ?? null;
}

// Проекты конкретного клиента.
export function getProjectsByClientId(projects: Project[], clientId: string): Project[] {
  return projects.filter((p) => p.clientId === clientId);
}

// Проекты «Мастерской» — идеи без клиента (clientId === null).
export function getWorkshopProjects(projects: Project[]): Project[] {
  return projects.filter((p) => p.clientId === null);
}

// Сессии, привязанные к проекту (link-подход: сессия физически лежит у
// клиента, связь — через projectId).
export function getSessionsByProjectId(sessions: Session[], projectId: string): Session[] {
  return sessions.filter((s) => s.projectId === projectId);
}

// Консультации, привязанные к проекту — см. getSessionsByProjectId.
export function getConsultationsByProjectId(consultations: Consultation[], projectId: string): Consultation[] {
  return consultations.filter((c) => c.projectId === projectId);
}
