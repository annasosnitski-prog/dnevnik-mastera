import type { ContentSlidesResult } from './contentSync';

export interface StoredContentSlides {
  sourceText: string;
  slideCount: number;
  slides: string[];
  splitAt: string;
}

export interface SlidableContentEntry {
  id: string;
  textDraft: string;
  slides?: StoredContentSlides;
}

// Разбивка привязана не только к тексту, но и к числу слайдов: если текст
// не менялся, но карусель потеряла/получила фото, старая разбивка больше не
// подходит и должна считаться устаревшей (см. isContentSlidesStale ниже).
export function currentContentSlides(
  entry: SlidableContentEntry,
  slideCount: number,
): StoredContentSlides | undefined {
  const stored = entry.slides;
  return stored && stored.sourceText === entry.textDraft && stored.slideCount === slideCount
    ? stored
    : undefined;
}

export function isContentSlidesStale(entry: SlidableContentEntry, slideCount: number): boolean {
  const stored = entry.slides;
  return !!stored && (stored.sourceText !== entry.textDraft || stored.slideCount !== slideCount);
}

export function saveContentSlides<T extends SlidableContentEntry>(params: {
  entry: T;
  sourceText: string;
  slideCount: number;
  slides: string[];
  splitAt: string;
}): T {
  return {
    ...params.entry,
    slides: {
      sourceText: params.sourceText,
      slideCount: params.slideCount,
      slides: params.slides,
      splitAt: params.splitAt,
    },
  };
}

export type ContentSlidesOutcome<T> = { status: 'updated'; entry: T } | { status: 'ignored' };

// Дедупликация/отмена в полёте — по образцу createContentTranslationRunner
// в contentTranslation.ts, но по одному действию на запись, а не на язык.
export function createContentSlidesRunner() {
  const activeIds = new Map<string, symbol>();
  let generation = 0;

  return {
    isRunning(entryId: string): boolean {
      return activeIds.has(entryId);
    },

    async run<T extends SlidableContentEntry>(params: {
      entry: T;
      slideCount: number;
      request: () => Promise<ContentSlidesResult>;
      getCurrentEntry?: () => T;
      save: (entry: T) => void;
      now?: () => string;
    }): Promise<ContentSlidesOutcome<T>> {
      if (
        !params.entry.textDraft.trim() ||
        currentContentSlides(params.entry, params.slideCount) ||
        activeIds.has(params.entry.id)
      ) {
        return { status: 'ignored' };
      }

      const sourceText = params.entry.textDraft;
      const requestGeneration = generation;
      const requestToken = Symbol(params.entry.id);
      activeIds.set(params.entry.id, requestToken);
      try {
        const result = await params.request();
        if (requestGeneration !== generation) return { status: 'ignored' };

        const currentEntry = params.getCurrentEntry?.() ?? params.entry;
        const updatedEntry = saveContentSlides({
          entry: currentEntry,
          sourceText,
          slideCount: params.slideCount,
          slides: result.slides,
          splitAt: (params.now ?? (() => new Date().toISOString()))(),
        });
        params.save(updatedEntry);
        return { status: 'updated', entry: updatedEntry };
      } finally {
        if (activeIds.get(params.entry.id) === requestToken) activeIds.delete(params.entry.id);
      }
    },

    dispose(): void {
      generation += 1;
      activeIds.clear();
    },
  };
}
