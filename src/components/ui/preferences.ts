// Master-adjustable display settings (Settings tab), persisted locally.
export interface Prefs {
  brightness: number; // app brightness 0.75–1.15 (CSS filter)
  textScale: number; // text size 1.0–1.75 (font multiplier; 1.0 shown as 80%)
  textBright: 'normal' | 'high' | 'max'; // text tone level (dark theme)
  upcomingWindowDays: number; // how many days ahead the dashboard's "upcoming sessions" widget looks
  statsWindowDays: number; // how many days ahead the dashboard's stat-grid counters (sessions/consultations) look
  gameMode: boolean; // rock-paper-scissors gate before creating a client/session/note
}

// Shared by both of Админка's period pickers («Предстоящие сессии» and the
// stats grid) so the two read as one control, not two different ones.
export const DASHBOARD_WINDOW_OPTIONS: { days: number; label: string }[] = [
  { days: 3, label: '3 дня' },
  { days: 7, label: '7 дней' },
  { days: 14, label: '14 дней' },
  { days: 30, label: 'Месяц' },
];

export const DEFAULT_PREFS: Prefs = { brightness: 1, textScale: 1, textBright: 'normal', upcomingWindowDays: 7, statsWindowDays: 30, gameMode: true };
