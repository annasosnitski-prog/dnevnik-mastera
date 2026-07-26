import type { ContentTranslationLanguage, ContentTranslationResult } from './contentSync';

export interface StoredContentTranslation {
  sourceText: string;
  translatedText: string;
  translatedAt: string;
}

export type ContentTranslations = Partial<Record<ContentTranslationLanguage, StoredContentTranslation>>;

export interface TranslatableContentEntry {
  id: string;
  textDraft: string;
  translations?: ContentTranslations;
}

export function contentTranslationKey(entryId: string, language: ContentTranslationLanguage): string {
  return JSON.stringify([entryId, language]);
}

export function currentContentTranslation(
  entry: TranslatableContentEntry,
  language: ContentTranslationLanguage,
): StoredContentTranslation | undefined {
  const translation = entry.translations?.[language];
  return translation?.sourceText === entry.textDraft ? translation : undefined;
}

export function isContentTranslationStale(
  entry: TranslatableContentEntry,
  language: ContentTranslationLanguage,
): boolean {
  const translation = entry.translations?.[language];
  return !!translation && translation.sourceText !== entry.textDraft;
}

export function saveContentTranslation<T extends TranslatableContentEntry>(params: {
  entry: T;
  language: ContentTranslationLanguage;
  sourceText: string;
  translatedText: string;
  translatedAt: string;
}): T {
  return {
    ...params.entry,
    translations: {
      ...params.entry.translations,
      [params.language]: {
        sourceText: params.sourceText,
        translatedText: params.translatedText,
        translatedAt: params.translatedAt,
      },
    },
  };
}

export type ContentTranslationOutcome<T> =
  | { status: 'updated'; entry: T }
  | { status: 'ignored' };

export function createContentTranslationRunner() {
  const activeKeys = new Map<string, symbol>();
  let generation = 0;

  return {
    isRunning(entryId: string, language: ContentTranslationLanguage): boolean {
      return activeKeys.has(contentTranslationKey(entryId, language));
    },

    async run<T extends TranslatableContentEntry>(params: {
      entry: T;
      language: ContentTranslationLanguage;
      request: () => Promise<ContentTranslationResult>;
      getCurrentEntry?: () => T;
      save: (entry: T) => void;
      now?: () => string;
    }): Promise<ContentTranslationOutcome<T>> {
      const key = contentTranslationKey(params.entry.id, params.language);
      if (
        !params.entry.textDraft.trim() ||
        currentContentTranslation(params.entry, params.language) ||
        activeKeys.has(key)
      ) {
        return { status: 'ignored' };
      }

      const sourceText = params.entry.textDraft;
      const requestGeneration = generation;
      const requestToken = Symbol(key);
      activeKeys.set(key, requestToken);
      try {
        const result = await params.request();
        if (requestGeneration !== generation) return { status: 'ignored' };

        const currentEntry = params.getCurrentEntry?.() ?? params.entry;
        const updatedEntry = saveContentTranslation({
          entry: currentEntry,
          language: params.language,
          sourceText,
          translatedText: result.translatedText,
          translatedAt: (params.now ?? (() => new Date().toISOString()))(),
        });
        params.save(updatedEntry);
        return { status: 'updated', entry: updatedEntry };
      } finally {
        if (activeKeys.get(key) === requestToken) activeKeys.delete(key);
      }
    },

    dispose(): void {
      generation += 1;
      activeKeys.clear();
    },
  };
}
