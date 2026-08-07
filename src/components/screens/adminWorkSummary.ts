// Чистая view-model «Рабочей сводки» в Админке (M5B). Никакой новой бизнес-
// логики и никаких новых метрик — только пересборка уже существующих чисел
// (upcomingItems/urgencyCounts/notesUrgencyCounts) в форму, удобную для
// компактного рендера. Что именно считается «предстоящим»/«срочным» и т.д.
// по-прежнему решают эти три селектора — здесь их правила не дублируются.

import type { Client } from '../../domain/client';
import type { ClientNote } from '../../domain/task';
import { upcomingItems } from '../../domain/plannerSelectors.js';
import { notesUrgencyCounts, urgencyCounts } from '../../domain/taskSelectors.js';

export interface AdminWorkSummaryModel {
  clientsCount: number;
  plannedSessionsCount: number;
  plannedConsultationsCount: number;
  clientUrgentCount: number;
  clientImportantCount: number;
  personalUrgentCount: number;
  personalImportantCount: number;
}

// statsWindowDays only feeds upcomingItems here — it never touches
// upcomingWindowDays, which stays the «Предстоящие сессии» list's own,
// independent period (see Prefs).
export function buildAdminWorkSummary(
  clients: Client[],
  masterNotes: ClientNote[],
  statsWindowDays: number,
): AdminWorkSummaryModel {
  const load = upcomingItems(clients, statsWindowDays);
  const client = urgencyCounts(clients);
  const personal = notesUrgencyCounts(masterNotes);
  return {
    clientsCount: clients.length,
    plannedSessionsCount: load.filter((i) => i.kind === 'session').length,
    plannedConsultationsCount: load.filter((i) => i.kind === 'consultation').length,
    clientUrgentCount: client.urgent,
    clientImportantCount: client.important,
    personalUrgentCount: personal.urgent,
    personalImportantCount: personal.important,
  };
}
