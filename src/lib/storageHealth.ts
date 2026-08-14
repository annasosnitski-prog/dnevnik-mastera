// ============================================================
// СОХРАННОСТЬ ХРАНИЛИЩА
//
// Все данные мастера живут только в браузере: сервера нет, аккаунта нет,
// синхронизации нет. Значит есть ровно два способа их потерять, и оба
// молчаливые:
//
//  1. Браузер сам удаляет данные сайта. Он вправе это сделать — под нехватку
//     места, при чистке «данных сайтов», а на iOS ещё и просто потому, что
//     приложение неделю не открывали. Никакого предупреждения не будет.
//     Против этого есть navigator.storage.persist(): он переводит хранилище
//     в разряд «удалять нельзя без явного согласия человека».
//
//  2. Телефон потерян, разбит или сброшен. Тут не поможет никакое хранилище
//     на самом телефоне — спасает только копия ВНЕ его. Копия делается
//     руками (Настройки → Экспорт), а значит про неё можно забыть, и обычно
//     забывают ровно до того дня, когда она понадобилась.
//
// Этот модуль — чистая часть обоих сюжетов: посчитать возраст копии, решить,
// пора ли напоминать, и превратить байты в человеческий текст. Обращения к
// navigator/localStorage — в TattoDiary.tsx, здесь только решения.
// ============================================================

export const LAST_BACKUP_STORAGE_KEY = 'inka-last-backup';

// Через сколько дней без копии начинаем напоминать. Две недели — компромисс:
// чаще превращается в фон, который перестают замечать, реже уже страшно
// (это записи о людях, которых не восстановить по памяти).
export const BACKUP_REMINDER_AFTER_DAYS = 14;

// Сколько дней прошло с последней копии. null — копию не делали никогда
// (или отметка потерялась), это отдельное состояние, а не «0 дней назад».
export function backupAgeDays(lastBackupISO: string | null, now: Date): number | null {
  if (!lastBackupISO) return null;
  const then = new Date(lastBackupISO);
  if (Number.isNaN(then.getTime())) return null;
  // По границам суток, а не по «ровно 24 часа»: мастер думает в днях, и
  // копия, сделанная вчера вечером, вчерашняя, а не «сегодняшняя, 0 дней».
  const startOfDay = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.floor((startOfDay(now) - startOfDay(then)) / 86_400_000);
  // Отметка из будущего (переставили часы, копия с другого устройства) —
  // не повод считать, что копии нет: возраст просто не отрицательный.
  return Math.max(0, days);
}

export type BackupStatus =
  | { kind: 'never' }
  | { kind: 'fresh'; days: number }
  | { kind: 'stale'; days: number };

export function backupStatus(
  lastBackupISO: string | null,
  now: Date,
  afterDays: number = BACKUP_REMINDER_AFTER_DAYS,
): BackupStatus {
  const days = backupAgeDays(lastBackupISO, now);
  if (days === null) return { kind: 'never' };
  return days >= afterDays ? { kind: 'stale', days } : { kind: 'fresh', days };
}

// Человеческая подпись под кнопкой экспорта. Отдельно от статуса, чтобы
// текст можно было проверить тестом, а не читать глазами в разметке.
export function backupStatusText(status: BackupStatus): string {
  if (status.kind === 'never') return 'Копию ещё ни разу не делали';
  if (status.days === 0) return 'Последняя копия — сегодня';
  if (status.days === 1) return 'Последняя копия — вчера';
  return `Последняя копия — ${status.days} дн. назад`;
}

// «Постоянное» хранилище: браузер обещает не удалять данные сам.
// unsupported — браузер вообще не умеет отвечать на этот вопрос (старый
// Safari); это не то же самое, что «отказал», и пугать мастера тут нечем.
export type PersistenceState = 'persisted' | 'not-persisted' | 'unsupported';

export function persistenceText(state: PersistenceState): string {
  if (state === 'persisted') return 'Браузеру запрещено удалять эти данные';
  if (state === 'not-persisted') return 'Браузер может удалить данные, если на телефоне кончится место';
  return 'Этот браузер не сообщает, защищены ли данные от удаления';
}

// Занято/доступно — в мегабайтах, потому что «14 680 064 байт» ничего не
// говорит. Округляем вниз до одного знака: показать больше, чем есть,
// хуже, чем показать меньше.
export function formatMegabytes(bytes: number | undefined): string | null {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return null;
  const mb = bytes / (1024 * 1024);
  if (mb < 0.1) return 'меньше 0,1 МБ';
  return `${(Math.floor(mb * 10) / 10).toString().replace('.', ',')} МБ`;
}
