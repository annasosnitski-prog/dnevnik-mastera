export interface RefreshableContentEntry {
  id: string;
  contentDraft: unknown;
  visualArchetype: string | null;
  textTriad: unknown;
  textDraft: string;
}

export interface ContentRefreshResult {
  text_draft: string;
}

export type ContentRefreshOutcome<T> =
  | { status: 'updated'; entry: T }
  | { status: 'ignored' };

export function createContentRefreshRunner() {
  const activeEntryIds = new Set<string>();

  return {
    isRunning(entryId: string): boolean {
      return activeEntryIds.has(entryId);
    },

    async run<T extends RefreshableContentEntry>(params: {
      entry: T;
      request: () => Promise<ContentRefreshResult>;
      save: (entry: T) => void;
    }): Promise<ContentRefreshOutcome<T>> {
      if (activeEntryIds.has(params.entry.id)) return { status: 'ignored' };
      activeEntryIds.add(params.entry.id);
      try {
        const result = await params.request();
        const updatedEntry = {
          ...params.entry,
          textDraft: result.text_draft,
        };
        params.save(updatedEntry);
        return { status: 'updated', entry: updatedEntry };
      } finally {
        activeEntryIds.delete(params.entry.id);
      }
    },
  };
}
