// ============================================================
// ССЫЛКА НА СНИМОК ВМЕСТО САМОГО СНИМКА — Шаг 6 синка (docs/SYNC_PLAN.md).
//
// В облаке фото лежат файлами в Supabase Storage, а в строке записи —
// только ссылка вида photo:<sha256>. Адрес файла и есть хэш его
// содержимого: два одинаковых снимка (фото сессии, уехавшее в черновик
// контента и в задачу) дают один и тот же адрес и занимают в облаке
// место ОДИН раз — то самое тройное дублирование, которое показывает
// duplicateBytes в lib/storageBreakdown.ts.
//
// Локальная база при этом не меняется НИЧЕМ: на устройстве снимок
// по-прежнему base64-строка внутри записи, и ни один экран не узнаёт,
// что синк вообще существует. Подмена живёт ровно на границе облака.
// ============================================================

export const PHOTO_REF_PREFIX = 'photo:';

export function isPhotoRef(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(PHOTO_REF_PREFIX);
}

// Снимок, а не ссылка и не пустое поле: то, что нужно выносить в Storage.
export function isInlinePhoto(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('data:');
}

export function refToHash(ref: string): string {
  return ref.slice(PHOTO_REF_PREFIX.length);
}

export function hashToRef(hash: string): string {
  return `${PHOTO_REF_PREFIX}${hash}`;
}

// Честный SHA-256 по содержимому — здесь, в отличие от замера объёма,
// дешёвый отпечаток не годится: по нему строится АДРЕС файла, и совпадение
// у двух разных снимков означало бы, что один затёр другой. crypto.subtle
// считает нативно, поэтому мегабайтная строка не вешает поток так, как
// вешал бы тот же обход на JavaScript.
export async function photoContentHash(dataUrl: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(dataUrl));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
