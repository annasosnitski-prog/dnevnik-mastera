// Master-adjustable display settings (Settings tab), persisted locally.
export interface Prefs {
  brightness: number; // app brightness 0.75–1.15 (CSS filter)
  textScale: number; // text size 1.0–1.75 (font multiplier; 1.0 shown as 80%)
  textBright: 'normal' | 'high' | 'max'; // text tone level (dark theme)
  // Единственный период Админки — живёт в её общей шапке (вкладки Записи и
  // Рабочая сводка читают одно и то же значение). Раньше это были два
  // независимых поля (upcomingWindowDays у «Предстоящие сессии» и
  // statsWindowDays у статистики) — по явной просьбе мастера объединены в
  // одно. Вкладка «Задачи» от него не зависит вовсе.
  upcomingWindowDays: number;
  gameMode: boolean; // rock-paper-scissors gate before creating a client/session/note
}

// Готовые варианты общего периода Админки; помимо них можно ввести
// произвольное число дней вручную (см. MANUAL_WINDOW_DAYS_MAX ниже) —
// допустимость значения больше не ограничена этим списком.
export const DASHBOARD_WINDOW_OPTIONS: { days: number; label: string }[] = [
  { days: 3, label: '3 дня' },
  { days: 7, label: '7 дней' },
  { days: 14, label: '14 дней' },
  { days: 30, label: 'Месяц' },
];

// Разумный верхний предел для ручного ввода периода.
export const MANUAL_WINDOW_DAYS_MAX = 365;

export const DEFAULT_PREFS: Prefs = { brightness: 1, textScale: 1, textBright: 'normal', upcomingWindowDays: 7, gameMode: true };
