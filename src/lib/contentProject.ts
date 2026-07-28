// Одобренные материалы ContentINKA, относящиеся к конкретному проекту —
// раздел «Контент» на экране проекта (см. src/components/TattoDiary.tsx,
// ProjectViewSheet). Чистая фильтрация/агрегация, без React/IndexedDB.
//
// Никакой новой логики связи здесь нет и не должно быть: принадлежность
// записи проекту и её «тип связи» для отображения целиком определяются уже
// существующими resolveContentEntryProjectId/resolveContentEntryLink
// (src/lib/contentLink.ts), которые уже реализуют все случаи — project-link,
// session-link через session.projectId, legacy sourceType==='session' и
// sourceType==='consultation' без ручного link. Повторять их тут значило бы
// завести второй источник истины.
import type { Project } from '../domain/project';
import type { Client } from '../domain/client';
import type { LinkableContentEntry } from './contentWorkspace';
import { resolveContentEntryProjectId, resolveContentEntryLink, type ResolvedContentEntryLink } from './contentLink.js';

export interface ProjectContentItem<T> {
  entry: T;
  // Как именно запись связана с проектом — для отображения "Проект" /
  // название+дата сессии / "Консультация" в карточке. Раз
  // resolveContentEntryProjectId уже нашёл этот projectId, здесь всегда один
  // из «успешных» kind (никогда 'none'/'missing'/'missing-consultation') —
  // см. тест на согласованность обеих функций.
  link: ResolvedContentEntryLink;
}

// Только подтверждённый контент (approval flow не меняется — это фильтр
// чтения, не действие над записью) и без дублей по entry.id: один резолв
// project-id на запись (resolveContentEntryProjectId уже приоритезирует
// explicit link над sourceType/sourceId), так что одна запись физически не
// может совпасть с проектом дважды — Set здесь просто защита на случай
// дублирующихся id во входном массиве, а не признак реальной множественной
// связи. Порядок исходных entries сохраняется, новую сортировку не вводим.
export function getContentEntriesForProject<
  T extends LinkableContentEntry & { link?: unknown; status: 'draft' | 'confirmed'; id: string },
>(entries: readonly T[], projectId: string, projects: Project[], clients: Client[]): ProjectContentItem<T>[] {
  const seenIds = new Set<string>();
  const items: ProjectContentItem<T>[] = [];

  for (const entry of entries) {
    if (entry.status !== 'confirmed') continue;
    if (seenIds.has(entry.id)) continue;
    if (resolveContentEntryProjectId(entry, projects, clients) !== projectId) continue;

    seenIds.add(entry.id);
    items.push({ entry, link: resolveContentEntryLink(entry, projects, clients) });
  }

  return items;
}
