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

// Чем закончилась попытка отдать файл мастеру. Раньше функция возвращала
// void, и «ничего не произошло» выглядело так же, как успех: копия не
// сохранялась, а экран молчал — мастер была уверена, что бэкап есть.
// Для резервной копии это худший из возможных исходов, поэтому исход теперь
// возвращается и показывается.
export type ShareJSONResult = 'shared' | 'downloaded' | 'cancelled' | 'failed';

// Приложение, установленное «на экран Домой» (standalone), — не то же самое,
// что обычная вкладка Safari, хотя выглядит и открывается так же. WebKit там
// не умеет скачивать blob-ссылку синтетическим кликом по <a download>: окно
// «Поделиться» до этого пути вообще не доходит (сработал бы nav.share выше),
// а сам клик по ссылке иногда перезапускает страницу целиком — короткая
// белая вспышка, и приложение снова на первом экране, а копия не сохранена
// (подтверждено на телефоне: тот же код в обычной вкладке Safari работает).
//
// navigator.standalone — старый, но именно этот флаг Apple всегда держала
// достоверным для ровно этого режима; matchMedia дублирует его для
// остальных браузеров, где этого поля нет.
function isStandaloneDisplayMode(): boolean {
  const legacy = (navigator as Navigator & { standalone?: boolean }).standalone;
  if (legacy === true) return true;
  return typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches;
}

// Shares a JSON payload via the native share sheet if the device has one
// (files, not just text, so it can be AirDropped/sent as an attachment),
// falling back to a plain browser download otherwise — shared by the full
// backup export (Настройки) and the single-client export (Инфо tab).
//
// Принимает части, а не готовую строку: полный бэкап собирает их через
// buildBackupBlobParts (backupSerialize.ts), чтобы фото не склеивались в
// одну гигантскую JS-строку при stringify (см. комментарий там). File
// строится один раз и переиспользуется под скачивание — раньше вторым шагом
// собирался ещё один Blob из той же строки, что на большом бэкапе удваивало
// пиковую память без всякой пользы (File уже и есть Blob).
export async function shareOrDownloadJSON(
  parts: BlobPart[],
  filename: string,
  shareTitle: string,
): Promise<ShareJSONResult> {
  const file = new File(parts, filename, { type: 'application/json' });
  const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean };
  if (nav.canShare && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: shareTitle });
      return 'shared';
    } catch (err) {
      // Мастер сама закрыла окно «Поделиться» — это не ошибка, но и не
      // сохранённая копия: молча рапортовать успех нельзя.
      if (isShareAbortError(err)) return 'cancelled';
      // Любой другой сбой share — не тупик: пробуем обычное скачивание ниже.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    if (isStandaloneDisplayMode()) {
      // window.open уводит blob в отдельную вкладку системного браузера —
      // это НЕ навигация самой страницы приложения, поэтому она не
      // перезапускается (см. isStandaloneDisplayMode выше). Файл откроется
      // там как текст; сохранить в Файлы — через «Поделиться» уже этой
      // вкладки, на шаг длиннее, но не теряет копию молча, как было раньше.
      const opened = window.open(url, '_blank');
      return opened ? 'downloaded' : 'failed';
    }
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    // Ссылка обязана побывать в документе: часть браузеров игнорирует click()
    // по элементу, которого нет в дереве, — скачивание просто не начиналось.
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    return 'downloaded';
  } catch {
    return 'failed';
  } finally {
    // Раньше ссылку отзывали сразу после click(), в том же тике: браузер к
    // этому моменту мог ещё не начать читать blob, и скачивание срывалось —
    // опять же тихо. Отпускаем на следующем «тике», когда загрузка уже
    // подхвачена; утечки нет, страница живёт дальше.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
