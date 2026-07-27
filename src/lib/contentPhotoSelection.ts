import type { ContentDraftMedia, ContentSelectionRole } from './contentSync';

export type ContentPublicationFormat = 'post' | 'story';

export interface ResolvedContentPhoto {
  id: string;
  src: string;
  originalIndex: number;
  selected: boolean;
  selectionRole?: ContentSelectionRole;
  publicationFormat?: ContentPublicationFormat;
  orderIndex?: number;
  technicalStatus?: 'kept' | 'background' | 'rejected';
}

export interface ContentPhotoSelectionInput {
  photos: readonly string[];
  photoIds?: readonly string[];
  contentDraft?: readonly ContentDraftMedia[] | null;
}

export interface ContentPhotoPublicationSets {
  carousel: ResolvedContentPhoto[];
  stories: ResolvedContentPhoto[];
}

const ROLE_LABELS: Record<ContentSelectionRole, string> = {
  cover: 'Обложка',
  placement: 'На теле',
  detail: 'Деталь',
  before: 'До',
  after: 'После',
  process: 'Процесс',
  transition: 'Переход',
  atmosphere: 'Атмосфера',
  background: 'Фон',
};

let fallbackIdCounter = 0;

function fallbackPhotoId(): string {
  fallbackIdCounter += 1;
  return `photo-${Date.now().toString(36)}-${fallbackIdCounter.toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function createContentPhotoIds(count: number): string[] {
  return Array.from({ length: count }, () => {
    try {
      return globalThis.crypto?.randomUUID?.() ?? fallbackPhotoId();
    } catch {
      return fallbackPhotoId();
    }
  });
}

export function hasContentPhotoSelectionContract(contentDraft?: readonly ContentDraftMedia[] | null): boolean {
  return contentDraft?.some((media) => typeof media.selected === 'boolean') ?? false;
}

function mediaOriginalIndex(
  media: ContentDraftMedia,
  mediaIndex: number,
  photos: readonly string[],
  photoIds?: readonly string[],
): number | undefined {
  if (!photoIds) return mediaIndex < photos.length ? mediaIndex : undefined;
  const index = photoIds.indexOf(media.id);
  return index >= 0 && index < photos.length ? index : undefined;
}

function resolvedPhoto(
  input: ContentPhotoSelectionInput,
  originalIndex: number,
  media: ContentDraftMedia | undefined,
  selected: boolean,
): ResolvedContentPhoto {
  return {
    id: input.photoIds?.[originalIndex] ?? media?.id ?? `photo-${originalIndex}`,
    src: input.photos[originalIndex],
    originalIndex,
    selected,
    selectionRole: media?.selection_role,
    publicationFormat: media?.format,
    orderIndex: media?.order_index,
    technicalStatus: media?.technical_status,
  };
}

function indexContentDraft(input: ContentPhotoSelectionInput): Map<number, ContentDraftMedia> {
  const mediaByOriginalIndex = new Map<number, ContentDraftMedia>();
  (input.contentDraft ?? []).forEach((item, mediaIndex) => {
    const originalIndex = mediaOriginalIndex(item, mediaIndex, input.photos, input.photoIds);
    if (originalIndex !== undefined && !mediaByOriginalIndex.has(originalIndex)) {
      mediaByOriginalIndex.set(originalIndex, item);
    }
  });
  return mediaByOriginalIndex;
}

export function resolveContentPhotoSelection(input: ContentPhotoSelectionInput): ResolvedContentPhoto[] {
  const media = input.contentDraft ?? [];
  if (!hasContentPhotoSelectionContract(media)) {
    const mediaByOriginalIndex = indexContentDraft(input);
    return input.photos.map((_, originalIndex) =>
      resolvedPhoto(input, originalIndex, mediaByOriginalIndex.get(originalIndex), true),
    );
  }

  const selected: ResolvedContentPhoto[] = [];
  const seenOriginalIndexes = new Set<number>();

  media.forEach((item, mediaIndex) => {
    if (item.selected !== true || item.technical_status === 'rejected') return;
    const originalIndex = mediaOriginalIndex(item, mediaIndex, input.photos, input.photoIds);
    if (originalIndex === undefined || seenOriginalIndexes.has(originalIndex)) return;
    seenOriginalIndexes.add(originalIndex);
    selected.push(resolvedPhoto(input, originalIndex, item, true));
  });

  return selected.sort((a, b) => {
    const aOrder = a.orderIndex ?? Number.POSITIVE_INFINITY;
    const bOrder = b.orderIndex ?? Number.POSITIVE_INFINITY;
    return aOrder - bOrder || a.originalIndex - b.originalIndex;
  });
}

export function resolveContentPhotoPublicationSets(
  input: ContentPhotoSelectionInput,
): ContentPhotoPublicationSets {
  const carousel: ResolvedContentPhoto[] = [];
  const stories: ResolvedContentPhoto[] = [];

  for (const photo of resolveContentPhotoSelection(input)) {
    if (photo.publicationFormat === 'story') stories.push(photo);
    else carousel.push(photo);
  }

  return { carousel, stories };
}

export function resolveAllContentPhotos(input: ContentPhotoSelectionInput): ResolvedContentPhoto[] {
  const media = input.contentDraft ?? [];
  const hasSelectionContract = hasContentPhotoSelectionContract(media);
  const mediaByOriginalIndex = indexContentDraft(input);

  return input.photos.map((_, originalIndex) => {
    const item = mediaByOriginalIndex.get(originalIndex);
    const selected = hasSelectionContract
      ? item?.selected === true && item.technical_status !== 'rejected'
      : true;
    return resolvedPhoto(input, originalIndex, item, selected);
  });
}

export function contentSelectionRoleLabel(role: ContentSelectionRole): string {
  return ROLE_LABELS[role];
}
