// Мудборд одной картинкой — сетка квадратных cover-кропов (тот же принцип,
// что у миниатюр SessionPhotos: object-fit: cover), собранная на canvas.
// В мессенджере одна картинка выглядит собраннее, чем россыпь из N фото —
// см. lib/moodboardShare.ts: это предпочтительный путь отправки, россыпь
// остаётся резервным (одно фото, или сборка не удалась).
//
// Подпись (Moodboard.caption) не встраивается в пиксели — она едет рядом
// текстом при отправке (см. prepareMoodboardShareForSending), так что смена
// подписи не требует пересборки картинки.

// Ближайшая к квадрату сетка на заданное число ячеек — 1→1×1, 2→1×2 (не
// 2×1: шире, чем выше, ближе к тому, как реально выглядят фото), 3–4→2×2,
// 5–6→2×3, и так далее округлением вверх до квадрата. Чистая функция —
// раскладка проверяется тестами отдельно от самой отрисовки (canvas/Image
// недоступны за пределами браузера, как и у resizeImage в imagePreview.ts).
export function collageGridSize(count: number): { cols: number; rows: number } {
  if (count <= 1) return { cols: 1, rows: 1 };
  if (count === 2) return { cols: 2, rows: 1 };
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  return { cols, rows };
}

const COLLAGE_CELL = 640; // px на ячейку до финального сжатия JPEG
const COLLAGE_GAP = 6;
// Тёмный фон под зазорами — на тон с оформлением приложения (COLORS.bg
// приложения тёмный), а не белые полосы вокруг фото на тёмной теме.
const COLLAGE_BACKGROUND = '#141210';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('failed to load image for collage'));
    img.src = src;
  });
}

// null — нечего собирать (пустой список). Иначе — один JPEG data URL сетки.
// Каждое фото кадрируется в квадрат по центру (cover), как миниатюра
// SessionPhotos, чтобы сетка не «прыгала» из-за разных пропорций исходников.
export async function buildMoodboardCollageDataUrl(srcs: string[], quality = 0.85): Promise<string | null> {
  if (srcs.length === 0) return null;
  const { cols, rows } = collageGridSize(srcs.length);
  const images = await Promise.all(srcs.map(loadImage));

  const canvas = document.createElement('canvas');
  canvas.width = cols * COLLAGE_CELL + (cols - 1) * COLLAGE_GAP;
  canvas.height = rows * COLLAGE_CELL + (rows - 1) * COLLAGE_GAP;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    canvas.width = 0;
    canvas.height = 0;
    throw new Error('canvas 2d context unavailable');
  }

  ctx.fillStyle = COLLAGE_BACKGROUND;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  images.forEach((img, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = col * (COLLAGE_CELL + COLLAGE_GAP);
    const y = row * (COLLAGE_CELL + COLLAGE_GAP);
    const scale = Math.max(COLLAGE_CELL / img.width, COLLAGE_CELL / img.height);
    const sw = COLLAGE_CELL / scale;
    const sh = COLLAGE_CELL / scale;
    const sx = (img.width - sw) / 2;
    const sy = (img.height - sh) / 2;
    ctx.drawImage(img, sx, sy, sw, sh, x, y, COLLAGE_CELL, COLLAGE_CELL);
  });

  try {
    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}
