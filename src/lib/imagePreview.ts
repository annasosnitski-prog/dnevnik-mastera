// Сжимает фото (уже загруженное в Дневник как base64 data URL) до
// небольшого превью перед отправкой в ContentINKA — см.
// contentinka-design.md, «Размер запроса — решено через превью».
// Оригинал в Session.photos/Consultation.photos не трогаем, это только
// для передачи модели.
export function downsizeToPreview(dataUrl: string, maxSide = 768, quality = 0.7): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('canvas 2d context unavailable'));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => reject(new Error('failed to load image for downsizing'));
    img.src = dataUrl;
  });
}
