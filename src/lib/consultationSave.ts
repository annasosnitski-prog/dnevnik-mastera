// Форма консультации: её поля, приведение к записи и запись в историю.
//
// Сами мутации — в lib/projectRecordSave.ts (см. там же про удалённые
// client-формы): после Этапа 2 консультация хранится только в своём проекте.
// Цепочка повторных консультаций никуда не делась — консультация никогда не
// заменяется другой, каждая следующая встреча получает свою запись, связанную
// с предыдущей через previousConsultationId/nextConsultationId.
import type { ConsultationHistoryEntry } from '../domain/consultation';
import type { UrgencyKey } from '../domain/urgency';

export interface ConsultationFormData {
  date: string;
  time: string;
  area: string;
  style: string;
  generalNotes: string;
  feeling: string;
  creative: string;
  inspirationSources: string;
  outcome: string;
  urgency: UrgencyKey;
  photos: string[];
  projectId: string | null;
}

export function consultationFields(data: ConsultationFormData) {
  return {
    date: data.date,
    time: data.time,
    area: data.area.trim(),
    style: data.style.trim(),
    generalNotes: data.generalNotes.trim(),
    feeling: data.feeling.trim(),
    creative: data.creative.trim(),
    inspirationSources: data.inspirationSources.trim(),
    outcome: data.outcome.trim(),
    urgency: data.urgency,
    photos: data.photos,
    projectId: data.projectId,
  };
}

export function historyEntry(note: string): ConsultationHistoryEntry {
  return { id: crypto.randomUUID(), date: new Date().toISOString(), note };
}
