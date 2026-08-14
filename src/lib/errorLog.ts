// ============================================================
// ЖУРНАЛ СБОЕВ
//
// Дневник работает на телефоне мастера, а консоль браузера там не открыть.
// Поэтому до сих пор любой сбой не оставлял следа вообще: приложение
// показывало плашку, мастер её закрывала, и выяснить потом, что именно
// произошло, было нечем — «проверь, что у меня падает» была невыполнимой
// просьбой.
//
// Журнал это чинит: последние сбои хранятся прямо в дневнике, видны в
// Настройках и уезжают в резервную копию. Мастеру достаточно прислать файл.
//
// Хранилище — localStorage, и это осознанно, хотя всё остальное переехало в
// IndexedDB: журнал обязан работать именно тогда, когда база НЕДОСТУПНА,
// то есть в самый нужный момент. Поэтому он маленький и жёстко ограничен по
// размеру: только текст, без фото и без данных клиентов.
// ============================================================

export const ERROR_LOG_KEY = 'inka-error-log';
// Больше и не нужно: журнал отвечает на вопрос «что случилось только что»,
// а не хранит историю за месяцы. Ограничение защищает и квоту localStorage.
export const ERROR_LOG_LIMIT = 40;
// Обрезка длинных сообщений: стек падения бывает в килобайты, а для разбора
// хватает начала.
export const ERROR_MESSAGE_MAX = 400;

// Откуда пришёл сбой. Нужен, чтобы одинаковые по тексту ошибки из разных
// мест не сливались в одну неразличимую кучу.
export type DiaryErrorSource = 'storage' | 'crash' | 'promise' | 'sync';

export interface DiaryErrorEntry {
  at: string; // ISO
  source: DiaryErrorSource;
  // Что делал дневник — человеческими словами («сохранение клиента»).
  action: string;
  message: string;
}

function trim(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

// Приводит что угодно (Error, строку, объект, undefined) к строке. Ошибки
// прилетают из разных мест, и журнал не имеет права упасть сам.
export function describeError(error: unknown): string {
  if (error === null || error === undefined) return 'неизвестная ошибка';
  if (typeof error === 'string') return trim(error, ERROR_MESSAGE_MAX) || 'неизвестная ошибка';
  if (error instanceof Error) {
    const name = error.name && error.name !== 'Error' ? `${error.name}: ` : '';
    return trim(`${name}${error.message || 'без описания'}`, ERROR_MESSAGE_MAX);
  }
  if (typeof error === 'object') {
    const maybe = error as { message?: unknown; name?: unknown };
    if (typeof maybe.message === 'string' && maybe.message) {
      const name = typeof maybe.name === 'string' && maybe.name ? `${maybe.name}: ` : '';
      return trim(`${name}${maybe.message}`, ERROR_MESSAGE_MAX);
    }
    try {
      return trim(JSON.stringify(error), ERROR_MESSAGE_MAX);
    } catch {
      return 'необъяснимая ошибка';
    }
  }
  return trim(String(error), ERROR_MESSAGE_MAX);
}

// Добавляет запись: новые сверху, длина ограничена.
//
// Подряд идущие одинаковые сбои (одна и та же операция падает в цикле) не
// размножаются: обновляется время верхней записи. Иначе один зациклившийся
// сбой вытеснил бы из журнала всё остальное — ровно ту историю, ради
// которой журнал и заведён.
export function appendErrorEntry(
  log: DiaryErrorEntry[],
  entry: DiaryErrorEntry,
  limit: number = ERROR_LOG_LIMIT,
): DiaryErrorEntry[] {
  const head = log[0];
  if (head && head.source === entry.source && head.action === entry.action && head.message === entry.message) {
    return [{ ...head, at: entry.at }, ...log.slice(1)];
  }
  return [entry, ...log].slice(0, limit);
}

// Терпимое чтение: журнал не должен мешать запуску, что бы в нём ни лежало.
export function parseErrorLog(raw: string | null): DiaryErrorEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e): e is DiaryErrorEntry => !!e && typeof e === 'object' && typeof e.at === 'string' && typeof e.message === 'string')
      .map((e) => ({
        at: e.at,
        source: (['storage', 'crash', 'promise', 'sync'] as const).includes(e.source) ? e.source : 'storage',
        action: typeof e.action === 'string' ? e.action : '',
        message: e.message,
      }))
      .slice(0, ERROR_LOG_LIMIT);
  } catch {
    return [];
  }
}

const SOURCE_LABELS: Record<DiaryErrorSource, string> = {
  storage: 'хранилище',
  crash: 'сбой приложения',
  promise: 'фоновая задача',
  sync: 'синхронизация',
};

export function errorSourceLabel(source: DiaryErrorSource): string {
  return SOURCE_LABELS[source] ?? source;
}

// Человекочитаемый журнал одной строкой на запись — для показа в Настройках
// и для пересылки. Дата в местном времени: разбирать сбой будут по тому
// времени, которое мастер видела на своих часах.
export function formatErrorLog(log: DiaryErrorEntry[]): string {
  if (log.length === 0) return 'Сбоев не записано.';
  return log
    .map((e) => {
      const when = new Date(e.at);
      const stamp = Number.isNaN(when.getTime()) ? e.at : when.toLocaleString('ru-RU');
      const where = e.action ? ` · ${e.action}` : '';
      return `${stamp} · ${errorSourceLabel(e.source)}${where} — ${e.message}`;
    })
    .join('\n');
}
