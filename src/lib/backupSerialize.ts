// Полный бэкап несёт фото прямо внутри JSON — data URL в session.photos,
// contentEntry.photos и задачах личного кабинета, включая легаси-массивы
// client.sessions/consultations (см. TattoDiary.tsx: readBackupPayload).
// На телефоне с месяцами фотографий это реально десятки-сотни мегабайт.
//
// JSON.stringify(payload) держит одновременно и исходные объекты из
// IndexedDB, и получившуюся ОДНУ гигантскую строку целиком — а следующий
// File/Blob конструктор в shareOrDownloadJSON перекодирует эту же строку
// ещё раз. На iOS Safari именно это переполняло память при экспорте и
// приложение падало («на странице повторно возникла проблема»).
//
// buildBackupBlobParts выносит все photos-массивы из payload ДО stringify —
// сериализуется только «скелет» без тяжёлых строк, а сами фото остаются
// отдельными элементами BlobPart[]. Конструктор Blob/File принимает
// несколько частей и не обязан склеивать их в одну JS-строку, поэтому
// пиковая память не умножается на каждом шаге, как раньше.
export function buildBackupBlobParts(payload: unknown): BlobPart[] {
  // Свежий на каждый вызов — исключает случайное совпадение с текстом,
  // который мог ввести сам мастер (заметка, реквизиты и т.п.).
  const marker = crypto.randomUUID();
  const photos: string[] = [];

  const stripPhotos = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(stripPhotos);
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
        if (key === 'photos' && Array.isArray(v) && v.every((p) => typeof p === 'string')) {
          out[key] = (v as string[]).map((photo) => {
            const token = `@@${marker}_${photos.length}@@`;
            photos.push(photo);
            return token;
          });
        } else {
          out[key] = stripPhotos(v);
        }
      }
      return out;
    }
    return value;
  };

  const shellJson = JSON.stringify(stripPhotos(payload));
  const tokenRe = new RegExp(`"@@${marker}_(\\d+)@@"`, 'g');
  const parts: BlobPart[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(shellJson))) {
    parts.push(shellJson.slice(lastIndex, match.index));
    // JSON.stringify на одной строке — корректное экранирование кавычек и
    // спецсимволов, если в photo когда-нибудь окажется не чистый data URL.
    parts.push(JSON.stringify(photos[Number(match[1])]));
    lastIndex = tokenRe.lastIndex;
  }
  parts.push(shellJson.slice(lastIndex));
  return parts;
}
