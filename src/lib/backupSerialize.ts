// Полный бэкап несёт фото прямо внутри JSON — data URL в session.photos,
// contentEntry.photos и задачах личного кабинета, включая легаси-массивы
// client.sessions/consultations. Полный backup v6 теперь использует
// backupArchive.ts; этот helper оставлен для совместимости малых JSON-
// экспортов, которым не нужен OPFS-архив.
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
//
// Строка безопасна для JSON без экранирования, если в ней нет кавычки,
// обратного слэша и управляющих символов — а data URL (data:image/...;
// base64,<...>) устроен ровно так: алфавит base64 в принципе не содержит
// таких символов. Для этого — подавляющего большинства — случая photo
// кладётся в parts как есть, без JSON.stringify: тот создаёт ПОЛНУЮ вторую
// копию строки (экранирование не бывает «на месте», строки в JS неизменны),
// то есть удваивает именно самую тяжёлую часть бэкапа — на библиотеке в
// сотни мегабайт фото это удвоение и обваливало вкладку в памяти. Если
// когда-нибудь встретится не чистый data URL (повреждённая запись, старый
// формат) — safeJsonStringParts тратит память на JSON.stringify только для
// ЭТОЙ ОДНОЙ записи, а не для всех фото разом.
const UNSAFE_JSON_STRING_CHARS = /["\\\x00-\x1f]/;

function safeJsonStringParts(value: string): BlobPart[] {
  if (UNSAFE_JSON_STRING_CHARS.test(value)) return [JSON.stringify(value)];
  return ['"', value, '"'];
}

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
    parts.push(...safeJsonStringParts(photos[Number(match[1])]));
    lastIndex = tokenRe.lastIndex;
  }
  parts.push(shellJson.slice(lastIndex));
  return parts;
}
