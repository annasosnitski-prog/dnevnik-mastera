// Доменные типы срочности заметок/задач (Task = ClientNote). Вынесено из
// TattoDiary.tsx без изменений (PR 2 рефакторинга) — форма данных и значения
// прежние. Функции-аксессоры (urgencyRank/urgencyMeta) пока остаются в
// компоненте (PR 3 — вынос чистых функций).

export type UrgencyKey = 'urgent' | 'important' | 'normal' | 'interesting';

export const URGENCY: { key: UrgencyKey; emoji: string; label: string; short: string }[] = [
  { key: 'urgent', emoji: '‼️', label: 'Срочно', short: 'Срочно' },
  { key: 'important', emoji: '🔆', label: 'Важно', short: 'Важно' },
  { key: 'normal', emoji: '🌙', label: 'Обычно', short: 'Обычно' },
  { key: 'interesting', emoji: '⚡️', label: 'Интересно', short: 'Интересно' },
];
// Old 5-key urgent×important matrix → new single scale, so existing stored
// notes keep a sensible priority instead of collapsing to one default.
export const LEGACY_URGENCY_MAP: Record<string, UrgencyKey> = {
  urgent_important: 'urgent',
  urgent_not: 'urgent',
  important_not_urgent: 'important',
  not_not: 'normal',
};
