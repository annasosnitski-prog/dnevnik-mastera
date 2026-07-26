export interface RefreshableContentEntry {
  id: string;
  status?: 'draft' | 'confirmed';
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
  | { status: 'ignored' }
  | { status: 'locked' };

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
      getCurrentEntry?: () => T;
    }): Promise<ContentRefreshOutcome<T>> {
      const currentEntry = params.getCurrentEntry?.() ?? params.entry;
      if (currentEntry.status === 'confirmed') return { status: 'locked' };
      if (activeEntryIds.has(params.entry.id)) return { status: 'ignored' };
      activeEntryIds.add(params.entry.id);
      try {
        const result = await params.request();
        const latestEntry = params.getCurrentEntry?.() ?? params.entry;
        if (latestEntry.status === 'confirmed') return { status: 'locked' };
        const updatedEntry = {
          ...latestEntry,
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
