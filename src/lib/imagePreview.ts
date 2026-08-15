// Общий пайплайн сжатия: рисуем data URL на canvas с ограничением по
// большей стороне и JPEG-качеством. Два разных use-case (см. ниже) отличаются
// только параметрами.
function resizeImage(dataUrl: string, maxSide: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const releaseImage = () => {
      img.onload = null;
      img.onerror = null;
      img.src = '';
    };
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        canvas.width = 0;
        canvas.height = 0;
        releaseImage();
        reject(new Error('canvas 2d context unavailable'));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      try {
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch (error) {
        reject(error);
      } finally {
        canvas.width = 0;
        canvas.height = 0;
        releaseImage();
      }
    };
    img.onerror = () => {
      releaseImage();
      reject(new Error('failed to load image for downsizing'));
    };
    img.src = dataUrl;
  });
}

// Сжимает фото (уже загруженное в Дневник как base64 data URL) до
// небольшого превью перед отправкой в ContentINKA — см.
// contentinka-design.md, «Размер запроса — решено через превью».
export function downsizeToPreview(dataUrl: string, maxSide = 768, quality = 0.7): Promise<string> {
  return resizeImage(dataUrl, maxSide, quality);
}

// Сжимает фото перед тем как положить его в Session/Consultation/Project.photos
// или в документы клиента (см. onPick в SessionPhotos и handleFile в
// AttachmentsSection). Несжатое фото с телефона — это 3–8 МБ; так как весь
// client записывается в IndexedDB целиком при каждом изменении (saveClient),
// несколько таких фото делают запись огромной — сохранение подвисает, а на
// части устройств не хватает памяти и вкладка перезапускается («хранилище
// недоступно» при следующем холодном старте). 1600px/0.85 — фото остаётся
// пригодным для показа крупно, но весит на порядок меньше оригинала.
export function downsizeForStorage(dataUrl: string, maxSide = 1600, quality = 0.85): Promise<string> {
  return resizeImage(dataUrl, maxSide, quality);
}

// Сжимает фото перед тем как положить его копию в ContentEntry.photos
// (ContentINKAScreen.tsx) — это ВСЕГДА второй экземпляр байтов, уже
// лежащих через downsizeForStorage в Session/Consultation/Project.photos:
// ContentEntry — самостоятельная запись в отдельном IndexedDB store, и её
// копия переживает удаление или правку исходной сессии (это осознанно —
// уже сгенерированный контент не должен «уехать» вслед за источником).
// Раз это заведомый дубль, а не единственная копия, ему незачем совпадать
// с ней по весу: 1280px/0.8 хватает и на публикацию в Instagram, и на
// просмотр на экране, но весит заметно меньше, чем повторный 1600px/0.85.
export function downsizeForContentDuplicate(dataUrl: string, maxSide = 1280, quality = 0.8): Promise<string> {
  return resizeImage(dataUrl, maxSide, quality);
}

export async function downsizePhotosSequentially(
  photos: string[],
  photoIds: string[],
  downsize: (photo: string) => Promise<string> = downsizeToPreview,
): Promise<Array<{ id: string; preview_data_url: string }>> {
  const previews: Array<{ id: string; preview_data_url: string }> = [];
  for (let index = 0; index < photos.length; index += 1) {
    previews.push({ id: photoIds[index], preview_data_url: await downsize(photos[index]) });
  }
  return previews;
}
