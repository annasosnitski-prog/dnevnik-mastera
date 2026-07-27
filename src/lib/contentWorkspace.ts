export type ContentSourceType = 'session' | 'consultation';

export type ContentWorkspaceMode = 'compose' | 'open-linked';

// Одноразовая команда перехода в ContentINKA. Она живёт только в React state
// родителя и очищается экраном после применения — не попадает ни в IndexedDB,
// ни в localStorage.
export interface ContentWorkspaceNavigation {
  sourceType: ContentSourceType;
  sourceId: string;
  clientId: string;
  mode: ContentWorkspaceMode;
}

export interface LinkableContentEntry {
  sourceType: ContentSourceType | 'freeform';
  sourceId: string | null;
  clientId: string | null;
  createdDate: string;
}

export interface ContentSourceRef {
  sourceType: ContentSourceType;
  sourceId: string;
}

// sourceId сам по себе не уникален между типами исходных объектов. Связь
// всегда определяется точной парой sourceType + sourceId.
export function findLinkedContentEntries<T extends LinkableContentEntry>(
  entries: readonly T[],
  source: ContentSourceRef,
): T[] {
  return entries.filter((entry) => entry.sourceType === source.sourceType && entry.sourceId === source.sourceId);
}

export function selectContentWorkspaceEntries<T extends LinkableContentEntry>(params: {
  entries: readonly T[];
  clientFilter: 'all' | 'studio' | string;
  focusedSource: ContentSourceRef | null;
}): T[] {
  const selected = params.focusedSource
    ? findLinkedContentEntries(params.entries, params.focusedSource)
    : params.entries.filter((entry) =>
        params.clientFilter === 'all'
          ? true
          : params.clientFilter === 'studio'
            ? entry.clientId === null
            : entry.clientId === params.clientFilter,
      );

  return [...selected].sort((a, b) => b.createdDate.localeCompare(a.createdDate));
}

export function contentComposerItemKey(source: ContentSourceRef): string {
  return `${source.sourceType === 'session' ? 's' : 'c'}:${source.sourceId}`;
}

// Узкий navigation target «открыть вот эту конкретную запись» — по id, а не
// по паре sourceType+sourceId, как ContentWorkspaceNavigation (та требует
// клиента и session|consultation-источник, что не подходит для freeform-
// записей и записей без клиента). Само значение живёт в React state так же
// одноразово, как и ContentWorkspaceNavigation — не persisted нигде.
// Отсутствующая (удалённая) запись безопасно даёт null, а не падает.
export function resolveContentFocusEntry<T extends { id: string }>(
  entries: readonly T[],
  focusEntryId: string | null,
): T | null {
  if (!focusEntryId) return null;
  return entries.find((entry) => entry.id === focusEntryId) ?? null;
}
