// Типы элементов лент напоминаний. Вынесено из TattoDiary.tsx без изменений
// (PR 4 рефакторинга) — те же поля, что и раньше.

import type { Client } from '../domain/client';

// Sessions AND consultations whose date has passed while still marked
// not-done — the master either ticks them done (it happened, wasn't logged)
// or reschedules.
export type OverdueItem = { client: Client; kind: 'session' | 'consultation'; id: string; date: string; time: string };

// Done sessions, not yet marked healed, whose date is at least
// HEALING_REMINDER_DAYS in the past — a nudge to check in with the client.
export type HealingItem = { client: Client; sessionId: string; date: string };

// Sessions/consultations starting 36–48 hours from now — a heads-up to prep
// materials before the client arrives.
export type UpcomingSoonItem = { client: Client; kind: 'session' | 'consultation'; id: string; date: string; time: string };
