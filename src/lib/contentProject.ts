// Материалы ContentINKA, относящиеся к конкретному проекту — раздел
// «Контент» на экране проекта (см. src/components/TattoDiary.tsx,
// ProjectViewSheet). Чистая фильтрация, без React/IndexedDB.
//
// Никакой новой логики связи здесь нет и не должно быть: принадлежность
// записи проекту целиком определяется уже существующей
// resolveContentEntryProjectId (src/lib/contentLink.ts), которая уже
// реализует все три случая (project-link, session-link через
// session.projectId, legacy sourceType==='session' без ручного link) —
// повторять их тут значило бы завести второй источник истины.
import type { Project } from '../domain/project';
import type { Client } from '../domain/client';
import type { LinkableContentEntry } from './contentWorkspace';
import { resolveContentEntryProjectId } from './contentLink.js';

// Материалы проекта в исходном порядке entries — новую сортировку не вводим.
export function getProjectContentEntries<T extends LinkableContentEntry & { link?: unknown }>(
  entries: readonly T[],
  projectId: string,
  projects: Project[],
  clients: Client[],
): T[] {
  return entries.filter((entry) => resolveContentEntryProjectId(entry, projects, clients) === projectId);
}
