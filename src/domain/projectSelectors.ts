// Чистые выборки по проектам (PR 3 рефакторинга). Раньше это были inline-
// фильтры прямо в JSX/обработчиках TattoDiary.tsx — вынесены как есть,
// условия и порядок результатов не менялись.
//
// Правила слоя: данные приходят аргументами, ничего не мутируется
// (filter/find возвращают новые массивы/ссылки), нет обращений к React,
// IndexedDB и localStorage.

import type { Project, ProjectCategory, ProjectState } from './project';
import type { Session } from './session';
import type { Consultation } from './consultation';
import type { Client } from './client';
import { ISO_DATE_RE, isValidISODate } from '../utils/dates.js';

export function getProjectById(projects: Project[], id: string): Project | null {
  return projects.find((p) => p.id === id) ?? null;
}

export function getProjectsByClientId(projects: Project[], clientId: string): Project[] {
  return projects.filter((p) => p.clientId === clientId);
}

export function getWorkshopProjects(projects: Project[]): Project[] {
  return projects.filter((p) => p.clientId === null);
}

export function clientNameFor(clients: Client[], clientId: string | null): string | null {
  if (!clientId) return null;
  const c = clients.find((x) => x.id === clientId);
  return c ? `${c.name} ${c.surname}`.trim() : null;
}

function byDateThenCreated<T extends { date: string; createdDate?: string }>(a: T, b: T): number {
  const aHas = !!a.date;
  const bHas = !!b.date;
  if (aHas !== bHas) return aHas ? -1 : 1;
  if (a.date !== b.date) return a.date.localeCompare(b.date);
  return (a.createdDate || '').localeCompare(b.createdDate || '');
}

export function getClientSessions(projects: Project[], clientId: string): Session[] {
  return projects
    .filter((p) => p.clientId === clientId)
    .flatMap((p) => p.sessions)
    .sort(byDateThenCreated);
}

export function getClientConsultations(projects: Project[], clientId: string): Consultation[] {
  return projects
    .filter((p) => p.clientId === clientId)
    .flatMap((p) => p.consultations)
    .sort(byDateThenCreated);
}

export function findProjectOfSession(projects: Project[], sessionId: string): Project | null {
  return projects.find((p) => p.sessions.some((s) => s.id === sessionId)) ?? null;
}

export function findProjectOfConsultation(projects: Project[], consultationId: string): Project | null {
  return projects.find((p) => p.consultations.some((c) => c.id === consultationId)) ?? null;
}

export function getSessionsByProjectId(sessions: Session[], projectId: string): Session[] {
  return sessions.filter((s) => s.projectId === projectId);
}

export function getConsultationsByProjectId(consultations: Consultation[], projectId: string): Consultation[] {
  return consultations.filter((c) => c.projectId === projectId);
}

export function getConsultationSequence(consultations: Consultation[], projectId: string): Consultation[] {
  return getConsultationsByProjectId(consultations, projectId).slice().sort((a, b) => {
    const aKey = `${a.date || ''}T${a.time || ''}`;
    const bKey = `${b.date || ''}T${b.time || ''}`;
    if (aKey !== bKey) return aKey.localeCompare(bKey);
    return (a.createdDate || '').localeCompare(b.createdDate || '');
  });
}

export function getConsultationNumber(consultations: Consultation[], consultation: Consultation): number | null {
  if (!consultation.projectId) return null;
  const sequence = getConsultationSequence(consultations, consultation.projectId);
  const index = sequence.findIndex((c) => c.id === consultation.id);
  return index === -1 ? null : index + 1;
}

function toDateOnly(iso: string): string {
  return iso.length >= 10 ? iso.slice(0, 10) : iso;
}

export function getProjectLastActivityDate(project: Project, sessions: Session[], consultations: Consultation[], today: string): string | null {
  let latest: string | null = null;
  const consider = (iso: string | null | undefined) => {
    if (!iso) return;
    const d = toDateOnly(iso);
    if (!isValidISODate(d)) return;
    if (d > today) return;
    if (latest === null || d > latest) latest = d;
  };
  consider(project.lastMeaningfulActivityAt);
  for (const session of sessions) {
    if (session.projectId === project.id && session.done && ISO_DATE_RE.test(session.date)) consider(session.date);
  }
  for (const consultation of consultations) {
    if (consultation.projectId !== project.id) continue;
    for (const entry of consultation.history) consider(entry.date);
  }
  return latest;
}

function isOpenSession(session: Session): boolean {
  return !session.done && !session.cancelled;
}

function isOpenConsultation(consultation: Consultation): boolean {
  return !consultation.done && !consultation.cancelled && consultation.status !== 'converted';
}

export function hasScheduledWork(project: Project, sessions: Session[], consultations: Consultation[], today: string): boolean {
  if (project.nextActionText.trim() !== '' && project.nextActionDate !== null && project.nextActionDate >= today) return true;
  const hasFutureSession = sessions.some(
    (s) => s.projectId === project.id && isOpenSession(s) && ISO_DATE_RE.test(s.date) && s.date >= today,
  );
  if (hasFutureSession) return true;
  return consultations.some(
    (c) => c.projectId === project.id && isOpenConsultation(c) && ISO_DATE_RE.test(c.date) && c.date >= today,
  );
}

export function hasOverdueWork(project: Project, sessions: Session[], consultations: Consultation[], today: string): boolean {
  if (project.nextActionText.trim() !== '' && project.nextActionDate !== null && project.nextActionDate < today) return true;
  const hasOverdueSession = sessions.some(
    (s) => s.projectId === project.id && isOpenSession(s) && ISO_DATE_RE.test(s.date) && s.date < today,
  );
  if (hasOverdueSession) return true;
  return consultations.some(
    (c) => c.projectId === project.id && isOpenConsultation(c) && ISO_DATE_RE.test(c.date) && c.date < today,
  );
}

// ===================== ПРОИЗВОДНЫЙ ТАЙМЛАЙН «ЗАПРОС → ПЕРВАЯ СЕССИЯ» =====================
export type PipelineSegmentKey = 'moodboard' | 'sketch' | 'consultation' | 'session';

export interface ProjectPipelineSegment {
  key: PipelineSegmentKey;
  targetDate: string; // yyyy-mm-dd
}

function parseProjectCreatedDate(createdDate: string): Date | null {
  const dateOnly = toDateOnly(createdDate);
  if (!isValidISODate(dateOnly)) return null;
  return new Date(`${dateOnly}T00:00:00.000Z`);
}

function addCalendarMonthsClamped(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const targetFirst = new Date(Date.UTC(year, month + months, 1));
  const targetLastDay = new Date(Date.UTC(targetFirst.getUTCFullYear(), targetFirst.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(targetFirst.getUTCFullYear(), targetFirst.getUTCMonth(), Math.min(day, targetLastDay)));
}

export function getProjectPipelineSegments(project: Project): ProjectPipelineSegment[] | null {
  const amount = project.firstSessionWindowAmount;
  const unit = project.firstSessionWindowUnit;
  if (amount === null || amount === undefined || unit === null || unit === undefined) return null;
  if (!Number.isFinite(amount) || amount < 0) return null;

  const start = parseProjectCreatedDate(project.createdDate);
  if (!start) return null;

  const target = unit === 'week'
    ? new Date(start.getTime() + amount * 7 * 24 * 60 * 60 * 1000)
    : addCalendarMonthsClamped(start, amount);
  const meeting = project.preSessionMeeting ?? 'consultation';
  const keys: PipelineSegmentKey[] = meeting === 'none'
    ? ['moodboard', 'sketch', 'session']
    : ['moodboard', 'sketch', 'consultation', 'session'];
  const totalMs = target.getTime() - start.getTime();

  return keys.map((key, index) => {
    const isLast = index === keys.length - 1;
    const offset = isLast ? totalMs : Math.floor((totalMs * (index + 1)) / keys.length);
    const targetDate = new Date(start.getTime() + offset).toISOString().slice(0, 10);
    return { key, targetDate };
  });
}

// ===================== ФИЛЬТРЫ И СОРТИРОВКА ПРОЕКТОВ =====================
export type ProjectSortMode = 'lastActive' | 'added' | 'name';

export const PROJECT_SORT_MODES: { key: ProjectSortMode; label: string }[] = [
  { key: 'lastActive', label: 'Последний активный' },
  { key: 'added', label: 'Новые' },
  { key: 'name', label: 'А–Я' },
];

export interface ProjectActivityContext {
  sessions: Session[];
  consultations: Consultation[];
  today: string;
}

export function sortProjects(
  projects: Project[],
  mode: ProjectSortMode,
  activity: ProjectActivityContext | null = null,
): Project[] {
  const list = projects.slice();
  if (mode === 'name') {
    return list.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'ru'));
  }
  if (mode === 'added') {
    return list.sort((a, b) => (b.createdDate || '').localeCompare(a.createdDate || ''));
  }
  const lastActive = (p: Project): string | null =>
    activity
      ? getProjectLastActivityDate(p, activity.sessions, activity.consultations, activity.today)
      : p.lastMeaningfulActivityAt
        ? toDateOnly(p.lastMeaningfulActivityAt)
        : null;
  const keys = new Map(list.map((p) => [p.id, lastActive(p)] as const));
  return list.sort((a, b) => {
    const aKey = keys.get(a.id) ?? null;
    const bKey = keys.get(b.id) ?? null;
    if (aKey !== bKey) {
      if (aKey === null) return 1;
      if (bKey === null) return -1;
      return bKey.localeCompare(aKey);
    }
    const byMoment = (b.lastMeaningfulActivityAt || '').localeCompare(a.lastMeaningfulActivityAt || '');
    return byMoment !== 0 ? byMoment : (b.createdDate || '').localeCompare(a.createdDate || '');
  });
}

export interface ProjectFilters {
  category: ProjectCategory | null;
  state: ProjectState | null;
  area: string | null;
}

export const EMPTY_PROJECT_FILTERS: ProjectFilters = { category: null, state: null, area: null };

export function projectFiltersActive(filters: ProjectFilters): boolean {
  return filters.category !== null || filters.state !== null || filters.area !== null;
}

export function filterProjects(projects: Project[], filters: ProjectFilters): Project[] {
  return projects.filter((p) => {
    if (filters.category && p.category !== filters.category) return false;
    if (filters.state && p.state !== filters.state) return false;
    if (filters.area && p.area !== filters.area) return false;
    return true;
  });
}

export interface ProjectAreaGroup {
  area: string;
  projects: Project[];
}

export function groupProjectsByArea(projects: Project[]): ProjectAreaGroup[] {
  const groups = new Map<string, Project[]>();
  for (const project of projects) {
    const area = project.area || 'Не задано';
    const bucket = groups.get(area);
    if (bucket) bucket.push(project);
    else groups.set(area, [project]);
  }
  return Array.from(groups, ([area, groupedProjects]) => ({ area, projects: groupedProjects }));
}

// ===================== ПАПКИ ПРОЕКТОВ (view-model) =====================
export type ProjectFolderType = 'client' | 'master';

export interface ProjectFolder {
  id: string;
  title: string;
  type: ProjectFolderType;
  clientId: string | null;
  projects: Project[];
  projectCount: number;
}

const MASTER_FOLDER_TITLE = 'Проекты мастера';
const MISSING_CLIENT_FOLDER_TITLE = 'Клиент не найден';

export function buildProjectFolders(projects: Project[], clients: Client[], today: string): ProjectFolder[] {
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
    if (bucket) bucket.push(project);
    else projectsByClientId.set(clientId, [project]);

    if (!seenClientIds.has(clientId)) {
      seenClientIds.add(clientId);
      if (!clients.some((c) => c.id === clientId)) unknownClientIdsInFirstAppearanceOrder.push(clientId);
    }
  }

  const clientFolders: ProjectFolder[] = [];

  for (const client of clients) {
    const clientProjects = projectsByClientId.get(client.id) ?? [];
    clientFolders.push({
      id: `client:${client.id}`,
      title: `${client.name} ${client.surname}`.trim(),
      type: 'client',
      clientId: client.id,
      projects: clientProjects,
      projectCount: clientProjects.length,
    });
  }

  for (const clientId of unknownClientIdsInFirstAppearanceOrder) {
    const clientProjects = projectsByClientId.get(clientId) ?? [];
    clientFolders.push({
      id: `client:${clientId}`,
      title: MISSING_CLIENT_FOLDER_TITLE,
      type: 'client',
      clientId,
      projects: clientProjects,
      projectCount: clientProjects.length,
    });
  }

  const allSessions = [...clients.flatMap((c) => c.sessions), ...projects.flatMap((p) => p.sessions)];
  const allConsultations = [...clients.flatMap((c) => c.consultations), ...projects.flatMap((p) => p.consultations)];
  const folderRank = (folder: ProjectFolder): number => {
    if (folder.projects.length === 0) return 3;
    if (folder.projects.some((p) => hasOverdueWork(p, allSessions, allConsultations, today))) return 0;
    if (folder.projects.some((p) => hasScheduledWork(p, allSessions, allConsultations, today))) return 1;
    return 2;
  };
  const sortedClientFolders = clientFolders
    .map((folder, index) => ({ folder, index }))
    .sort((a, b) => folderRank(a.folder) - folderRank(b.folder) || a.index - b.index)
    .map(({ folder }) => folder);

  const folders: ProjectFolder[] = [...sortedClientFolders];
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
