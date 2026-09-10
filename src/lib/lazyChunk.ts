// ============================================================
// ЛЕНИВЫЙ ЭКРАН, КОТОРЫЙ ПЕРЕЖИВАЕТ ДЕПЛОЙ
//
// Экраны грузятся по требованию (React.lazy), каждый — отдельным файлом с
// хэшем содержимого в имени. Пока дневник открыт на телефоне, может выйти
// новый деплой: имена файлов меняются, старые с сервера исчезают. Страница
// в этот момент уже загружена и по-прежнему ссылается на СТАРЫЕ имена —
// и первое же переключение экрана падает с «Importing a module script
// failed». Для мастера это выглядит так: дневник открылся, а любое
// нажатие в меню выбрасывает экран сбоя.
//
// Лечение ровно одно: перезагрузиться. Свежий index.html (навигацию
// сервис-воркер берёт из сети, см. sw.template.js) сошлётся уже на новые
// имена, и всё заработает. Поэтому первый такой сбой тихо перезагружает
// страницу вместо показа экрана сбоя.
//
// Отметка в sessionStorage не даёт этому уйти в круг: если перезагрузка не
// помогла (файл пропал не из-за деплоя, а, например, оборвалась сеть),
// второй раз подряд не перезагружаемся — пусть лучше будет честный экран
// сбоя и запись в журнале, чем бесконечный перезапуск.
// ============================================================

import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
// Само решение «перезагружаться ли» живёт рядом с решением об обновлении
// версии и без обращений к window — чтобы его проверял тест, а не живой
// телефон.
import { shouldReloadForStaleChunk } from './appUpdate';

const CHUNK_RELOAD_KEY = 'inka-chunk-reload';

function readLastReload(): number | null {
  try {
    const raw = sessionStorage.getItem(CHUNK_RELOAD_KEY);
    if (!raw) return null;
    const at = Number(raw);
    return Number.isFinite(at) ? at : null;
  } catch {
    return null;
  }
}

function reloadForStaleChunk(): boolean {
  if (!shouldReloadForStaleChunk({ lastReloadAt: readLastReload(), now: Date.now() })) return false;
  try {
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
  } catch {
    /* без отметки останется защита самого React: второй сбой покажет экран */
  }
  window.location.reload();
  return true;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- как и сам React.lazy: пропсы экрана выводятся из фабрики
type AnyComponent = ComponentType<any>;

export function lazyScreen<T extends AnyComponent>(factory: () => Promise<{ default: T }>): LazyExoticComponent<T> {
  return lazy(() =>
    factory().catch((error: unknown) => {
      // Перезагрузка уже началась — отдаём промис, который никогда не
      // разрешится: показывать экран сбоя за миг до ухода страницы незачем.
      if (reloadForStaleChunk()) return new Promise<{ default: T }>(() => {});
      throw error;
    }),
  );
}
