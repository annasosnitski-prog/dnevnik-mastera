// Сжимает фото (уже загруженное в Дневник как base64 data URL) до
// небольшого превью перед отправкой в ContentINKA — см.
// contentinka-design.md, «Размер запроса — решено через превью».
// Оригинал в Session.photos/Consultation.photos не трогаем, это только
// для передачи модели.
export function downsizeToPreview(dataUrl: string, maxSide = 768, quality = 0.7): Promise<string> {
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
