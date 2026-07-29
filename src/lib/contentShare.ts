export interface ContentSharePhoto {
  src: string;
  originalIndex: number;
}

export interface InstagramSharePayload {
  files: File[];
}

export type InstagramSharePreparation =
  | {
      status: 'ready';
      clipboardText: string;
      files: File[];
      photos: ContentSharePhoto[];
      payload: InstagramSharePayload;
    }
  | { status: 'no_photo' }
  | { status: 'invalid_photo' };

export interface StandardContentSharePreparation {
  files: File[];
  payload: ShareData;
}

const CONTENT_IMAGE_TYPES = {
  jpeg: { mime: 'image/jpeg', extension: 'jpg' },
  png: { mime: 'image/png', extension: 'png' },
  webp: { mime: 'image/webp', extension: 'webp' },
} as const;

type ContentImageType = keyof typeof CONTENT_IMAGE_TYPES;

function parseContentImageDataUrl(dataUrl: string): {
  bytes: Uint8Array;
  type: ContentImageType;
} | null {
  const match = /^data:image\/(jpeg|png|webp);base64,([a-z0-9+/=\s]+)$/i.exec(dataUrl);
  if (!match) return null;

  try {
    const encoded = match[2].replace(/\s/g, '');
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return { bytes, type: match[1].toLowerCase() as ContentImageType };
  } catch {
    return null;
  }
}

export function contentPhotoExtension(dataUrl: string): 'jpeg' | 'png' | 'webp' {
  const parsed = parseContentImageDataUrl(dataUrl);
  return parsed?.type ?? 'jpeg';
}

export function createOriginalContentPhotoFile(
  photo: ContentSharePhoto,
  entryId: string,
): File | null {
  const parsed = parseContentImageDataUrl(photo.src);
  if (!parsed) return null;
  const imageType = CONTENT_IMAGE_TYPES[parsed.type];
  return new File(
    [parsed.bytes.buffer as ArrayBuffer],
    `contentinka-${entryId}-${photo.originalIndex}.${imageType.extension}`,
    { type: imageType.mime },
  );
}

export function prepareInstagramContentShare(params: {
  entryId: string;
  savedText: string;
  photos: readonly ContentSharePhoto[];
}): InstagramSharePreparation {
  if (params.photos.length === 0) return { status: 'no_photo' };

  const photos = [...params.photos];
  const files: File[] = [];
  for (const photo of photos) {
    const file = createOriginalContentPhotoFile(photo, params.entryId);
    // All-or-nothing: never silently lose one photo from the final selection.
    if (!file) return { status: 'invalid_photo' };
    files.push(file);
  }

  return {
    status: 'ready',
    clipboardText: params.savedText,
    files,
    photos,
    payload: { files },
  };
}

export function canShareInstagramContent(
  preparation: InstagramSharePreparation,
  canShare: ((data: ShareData) => boolean) | undefined,
): boolean {
  if (preparation.status !== 'ready' || !canShare) return false;
  try {
    return canShare(preparation.payload);
  } catch {
    return false;
  }
}

export function prepareStandardContentShare(params: {
  entryId: string;
  savedText: string;
  photos: readonly ContentSharePhoto[];
}): StandardContentSharePreparation {
  const files = params.photos
    .map((photo) => createOriginalContentPhotoFile(photo, params.entryId))
    .filter((file): file is File => file !== null);
  return {
    files,
    payload: files.length > 0 ? { files, text: params.savedText } : { text: params.savedText },
  };
}

export function isShareAbortError(error: unknown): boolean {
  return !!error && typeof error === 'object' && 'name' in error && error.name === 'AbortError';
}

// Shares a JSON payload via the native share sheet if the device has one
// (files, not just text, so it can be AirDropped/sent as an attachment),
// falling back to a plain browser download otherwise — shared by the full
// backup export (Админка) and the single-client export (Инфо tab).
export async function shareOrDownloadJSON(json: string, filename: string, shareTitle: string): Promise<void> {
  const file = new File([json], filename, { type: 'application/json' });
  const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean };
  if (nav.canShare && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: shareTitle });
      return;
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return;
    }
  }
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
