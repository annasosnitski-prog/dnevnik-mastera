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
import type { Client } from './client';

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

// ===================== ПАПКИ ПРОЕКТОВ (view-model) =====================
// Чистая группировка Project[] по клиенту для верхнего уровня экрана
// «Мастерская» — не доменная и не persisted-сущность, пересчитывается на
// каждый рендер из текущих projects/clients. Один клиент = одна папка (даже
// с одним проектом), все clientId===null — в «Проекты мастера». Ничего не
// мутирует: собирает новые Map/массивы, объекты Project переиспользуются как
// есть (не копируются).
export type ProjectFolderType = 'client' | 'master';

export interface ProjectFolder {
  id: string; // 'client:<clientId>' | 'master'
  title: string;
  type: ProjectFolderType;
  clientId: string | null;
  projects: Project[];
  projectCount: number;
}

const MASTER_FOLDER_TITLE = 'Проекты мастера';
// Ссылка на клиента есть (project.clientId !== null), но самого клиента нет
// в clients — данные не трогаем и не переносим проект в «Проекты мастера»,
// а даём ему собственную fallback-папку с тем же стабильным id, что была бы
// у настоящей папки этого клиента.
const MISSING_CLIENT_FOLDER_TITLE = 'Клиент не найден';

export function buildProjectFolders(projects: Project[], clients: Client[]): ProjectFolder[] {
  const projectsByClientId = new Map<string, Project[]>();
  const masterProjects: Project[] = [];
  const unknownClientIdsInFirstAppearanceOrder: string[] = [];
  const seenClientIds = new Set<string>();

  for (const project of projects) {
    if (project.clientId === null) {
      masterProjects.push(project);
      continue;
    }

    const clientId = project.clientId;
    const bucket = projectsByClientId.get(clientId);
    if (bucket) {
      bucket.push(project);
    } else {
      projectsByClientId.set(clientId, [project]);
    }

    if (!seenClientIds.has(clientId)) {
      seenClientIds.add(clientId);
      if (!clients.some((c) => c.id === clientId)) {
        unknownClientIdsInFirstAppearanceOrder.push(clientId);
      }
    }
  }

  const folders: ProjectFolder[] = [];

  // Известные клиентские папки — в порядке clients.
  for (const client of clients) {
    const clientProjects = projectsByClientId.get(client.id);
    if (!clientProjects || clientProjects.length === 0) continue;
    folders.push({
      id: `client:${client.id}`,
      title: `${client.name} ${client.surname}`.trim(),
      type: 'client',
      clientId: client.id,
      projects: clientProjects,
      projectCount: clientProjects.length,
    });
  }

  // Fallback-папки для ссылок на отсутствующих клиентов — по первому
  // появлению соответствующего clientId в projects.
  for (const clientId of unknownClientIdsInFirstAppearanceOrder) {
    const clientProjects = projectsByClientId.get(clientId);
    if (!clientProjects || clientProjects.length === 0) continue;
    folders.push({
      id: `client:${clientId}`,
      title: MISSING_CLIENT_FOLDER_TITLE,
      type: 'client',
      clientId,
      projects: clientProjects,
      projectCount: clientProjects.length,
    });
  }

  // «Проекты мастера» — всегда последняя, визуально равноправная папка.
  if (masterProjects.length > 0) {
    folders.push({
      id: 'master',
      title: MASTER_FOLDER_TITLE,
      type: 'master',
      clientId: null,
      projects: masterProjects,
      projectCount: masterProjects.length,
    });
  }

  return folders;
}
