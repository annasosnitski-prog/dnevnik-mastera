// Чистая логика связи ContentEntry с проектом/сессией (после одобрения
// контента мастер может привязать его к Project или Session, либо оставить
// без привязки). Живёт рядом с остальными content*.ts — ничего не знает про
// React/IndexedDB, только вычисления над переданными данными.
//
// Связь не persisted нигде, кроме одного нового optional-поля на самом
// ContentEntry (entry.link) — ни новый store, ни версия IndexedDB, ни новая
// доменная сущность здесь не появляются.
import type { Project } from '../domain/project';
import type { Client } from '../domain/client';
import type { Session } from '../domain/session';
import { getProjectById } from '../domain/projectSelectors.js';
import type { LinkableContentEntry } from './contentWorkspace';

export type ContentEntryLink =
  | { type: 'project'; projectId: string }
  | { type: 'session'; sessionId: string };

// Старые записи без link, и записи с повреждённым/чужеродным значением —
// всегда нормализуются в null, а не отбрасываются молча.
export function normalizeContentEntryLink<T extends { link?: unknown }>(
  entry: T,
): T & { link: ContentEntryLink | null } {
  const raw = (entry as { link?: unknown }).link;
  if (raw && typeof raw === 'object') {
    const candidate = raw as { type?: unknown; projectId?: unknown; sessionId?: unknown };
    if (candidate.type === 'project' && typeof candidate.projectId === 'string') {
      return { ...entry, link: { type: 'project', projectId: candidate.projectId } };
    }
    if (candidate.type === 'session' && typeof candidate.sessionId === 'string') {
      return { ...entry, link: { type: 'session', sessionId: candidate.sessionId } };
    }
  }
  return { ...entry, link: null };
}

// Запись уже связана, если у неё есть явный link, ИЛИ она создана из
// существующей сессии (sourceType==='session' + sourceId) — тот случай не
// требует дублирования в link, см. модуль-докстринг задачи.
export function isContentEntryLinked<T extends LinkableContentEntry & { link?: unknown }>(entry: T): boolean {
  const { link } = normalizeContentEntryLink(entry);
  if (link) return true;
  return entry.sourceType === 'session' && entry.sourceId !== null;
}

// Сессии лежат в двух местах (link-подход тех же доменных сущностей):
// client.sessions и, для проектов без клиента, project.sessions.
function findSessionById(
  clients: Client[],
  projects: Project[],
  sessionId: string,
): { session: Session; project: Project | null } | null {
  for (const client of clients) {
    const session = client.sessions.find((s) => s.id === sessionId);
    if (session) {
      return { session, project: session.projectId ? getProjectById(projects, session.projectId) : null };
    }
  }
  for (const project of projects) {
    if (project.clientId !== null) continue;
    const session = project.sessions.find((s) => s.id === sessionId);
    if (session) {
      return { session, project: session.projectId ? (getProjectById(projects, session.projectId) ?? project) : project };
    }
  }
  return null;
}

// Проект для session-link всегда вычисляется через существующий
// session.projectId — не хранится отдельно, чтобы не дублировать источник
// истины и не рассинхронизироваться при переносе сессии между проектами.
export function resolveContentEntryProjectId<T extends { link?: unknown }>(
  entry: T,
  projects: Project[],
  clients: Client[],
): string | null {
  const { link } = normalizeContentEntryLink(entry);
  if (!link) return null;
  if (link.type === 'project') return link.projectId;
  const found = findSessionById(clients, projects, link.sessionId);
  return found?.session.projectId ?? null;
}

export type ResolvedContentEntryLink =
  | { kind: 'none' }
  | { kind: 'project'; project: Project }
  | { kind: 'session'; session: Session; project: Project | null }
  // Сохранённый projectId/sessionId (явный link, либо исходная сессия
  // sourceType==='session') больше не находится — запись не теряется и не
  // исправляется автоматически, просто показывается как безопасный fallback.
  | { kind: 'missing'; link: ContentEntryLink };

export function resolveContentEntryLink<T extends LinkableContentEntry & { link?: unknown }>(
  entry: T,
  projects: Project[],
  clients: Client[],
): ResolvedContentEntryLink {
  const { link } = normalizeContentEntryLink(entry);

  if (link) {
    if (link.type === 'project') {
      const project = getProjectById(projects, link.projectId);
      return project ? { kind: 'project', project } : { kind: 'missing', link };
    }
    const found = findSessionById(clients, projects, link.sessionId);
    return found ? { kind: 'session', session: found.session, project: found.project } : { kind: 'missing', link };
  }

  if (entry.sourceType === 'session' && entry.sourceId) {
    const found = findSessionById(clients, projects, entry.sourceId);
    if (found) return { kind: 'session', session: found.session, project: found.project };
    return { kind: 'missing', link: { type: 'session', sessionId: entry.sourceId } };
  }

  return { kind: 'none' };
}

// Единственное место, где entry.link меняется — компонент не должен сам
// собирать `{ ...entry, link }`, чтобы случайно не задеть остальные поля
// (status/isExemplar/textDraft/... остаются как есть).
export function setContentEntryLink<T extends { link?: unknown }>(entry: T, link: ContentEntryLink | null): T {
  return { ...entry, link };
}

export interface ContentProjectOption {
  project: Project;
  isPreferredClient: boolean;
}

// Проекты предпочитаемого клиента (entry.clientId, null = «мастерская»)
// идут первыми, но полный список остаётся видимым целиком — ничего не
// скрывается, только переупорядочивается (стабильная сортировка).
export function buildContentProjectOptions(projects: Project[], preferredClientId: string | null): ContentProjectOption[] {
  return projects
    .map((project) => ({ project, isPreferredClient: project.clientId === preferredClientId }))
    .sort((a, b) => Number(b.isPreferredClient) - Number(a.isPreferredClient));
}

export interface ContentSessionOption {
  session: Session;
  project: Project;
  isPreferredClient: boolean;
}

// Только сессии с projectId — сессия без проекта не может быть вариантом
// связи проектного контента.
export function buildContentSessionOptions(
  clients: Client[],
  projects: Project[],
  preferredClientId: string | null,
): ContentSessionOption[] {
  const options: ContentSessionOption[] = [];

  for (const client of clients) {
    for (const session of client.sessions) {
      if (!session.projectId) continue;
      const project = getProjectById(projects, session.projectId);
      if (!project) continue;
      options.push({ session, project, isPreferredClient: client.id === preferredClientId });
    }
  }

  for (const project of projects) {
    if (project.clientId !== null) continue;
    for (const session of project.sessions) {
      if (!session.projectId) continue;
      const resolvedProject = getProjectById(projects, session.projectId) ?? project;
      options.push({ session, project: resolvedProject, isPreferredClient: project.clientId === preferredClientId });
    }
  }

  return options.sort((a, b) => Number(b.isPreferredClient) - Number(a.isPreferredClient));
}
