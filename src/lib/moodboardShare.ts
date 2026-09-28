// Отправка мудборда клиенту через системное меню «Поделиться» — тот же
// принцип, что у ContentINKA (см. shareContentEntry в ContentINKAScreen.tsx
// и prepareStandardContentShare в contentShare.ts): фото уже лежат сжатыми
// (downsizeForStorage — см. onPick в SessionPhotos), здесь только собрать
// их в File[] и отдать nav.share. Коллаж одной картинкой — отдельный
// следующий шаг, этот использует уже проверенный «россыпью» путь.
import type { Moodboard } from '../domain/project';
import { isShareAbortError } from './contentShare.js';
import { copyTextToClipboard } from './clipboard.js';

const MOODBOARD_IMAGE_EXTENSIONS: Record<string, string> = { jpeg: 'jpg', png: 'png', webp: 'webp' };

function parseMoodboardPhotoDataUrl(dataUrl: string): { bytes: Uint8Array; mime: string; extension: string } | null {
  const match = /^data:image\/(jpeg|png|webp);base64,([a-z0-9+/=\s]+)$/i.exec(dataUrl);
  if (!match) return null;
  try {
    const encoded = match[2].replace(/\s/g, '');
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const type = match[1].toLowerCase();
    return { bytes, mime: `image/${type}`, extension: MOODBOARD_IMAGE_EXTENSIONS[type] };
  } catch {
    return null;
  }
}

export function createMoodboardPhotoFile(src: string, projectId: string, index: number): File | null {
  const parsed = parseMoodboardPhotoDataUrl(src);
  if (!parsed) return null;
  return new File([parsed.bytes.buffer as ArrayBuffer], `moodboard-${projectId}-${index}.${parsed.extension}`, { type: parsed.mime });
}

export interface MoodboardSharePreparation {
  files: File[];
  payload: ShareData;
}

// caption — Moodboard.caption; пустая строка не уходит отдельным полем
// text, как и в prepareStandardContentShare.
export function prepareMoodboardShare(moodboard: Moodboard, projectId: string): MoodboardSharePreparation {
  const files = moodboard.items
    .filter((it) => it.kind === 'photo')
    .map((item, i) => createMoodboardPhotoFile(item.src, projectId, i))
    .filter((f): f is File => f !== null);
  const caption = moodboard.caption.trim();
  return {
    files,
    payload: files.length > 0 ? (caption ? { files, text: caption } : { files }) : { text: caption },
  };
}

// 'shared' — реально ушло через системное меню (в т.ч. AirDrop/мессенджер).
// 'copied' — платформа не поддерживает шеринг файлов вовсе — подпись (если
// есть) хотя бы скопирована в буфер, фото мастер отправляет из галереи сама.
// 'cancelled' — мастер закрыла окно «Поделиться», ничего никуда не ушло:
// статус мудборда менять нельзя (см. вызывающий код в SessionAndProjectSheets).
export type MoodboardShareResult = 'shared' | 'copied' | 'cancelled';

export async function shareMoodboard(moodboard: Moodboard, projectId: string): Promise<MoodboardShareResult> {
  const { files, payload } = prepareMoodboardShare(moodboard, projectId);
  const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean };
  if (files.length > 0 && nav.canShare && nav.canShare({ files })) {
    try {
      await nav.share(payload);
      return 'shared';
    } catch (err) {
      if (isShareAbortError(err)) return 'cancelled';
    }
  }
  const caption = moodboard.caption.trim();
  if (nav.share) {
    try {
      await nav.share(caption ? { text: caption } : {});
      return 'shared';
    } catch (err) {
      if (isShareAbortError(err)) return 'cancelled';
    }
  }
  if (caption) {
    await copyTextToClipboard(caption).catch(() => false);
    return 'copied';
  }
  return 'cancelled';
}
