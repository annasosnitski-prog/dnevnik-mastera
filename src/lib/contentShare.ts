export interface ContentSharePhoto {
  src: string;
  originalIndex: number;
}

export interface InstagramSharePayload {
  files: [File];
}

export type InstagramSharePreparation =
  | {
      status: 'ready';
      clipboardText: string;
      file: File;
      photo: ContentSharePhoto;
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
  selectedPhoto?: ContentSharePhoto;
}): InstagramSharePreparation {
  const photo = params.selectedPhoto ?? params.photos[0];
  if (!photo) return { status: 'no_photo' };
  const file = createOriginalContentPhotoFile(photo, params.entryId);
  if (!file) return { status: 'invalid_photo' };

  return {
    status: 'ready',
    clipboardText: params.savedText,
    file,
    photo,
    payload: { files: [file] },
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
