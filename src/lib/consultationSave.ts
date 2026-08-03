// Чистая логика сохранения Consultation, вынесенная из handleAddConsultation
// (TattoDiary.tsx) — по образцу upsertClientSession/applyConsultationConversion
// в sessionSave.ts. Добавляет поддержку цепочки повторных консультаций
// («Назначить следующую консультацию»): консультация никогда не заменяется
// другой — каждая следующая встреча получает свою собственную запись,
// связанную с предыдущей только через previousConsultationId/
// nextConsultationId (тот же двусторонний link-паттерн, что
// convertedToSessionId/sourceConsultationId у сессии). Ничего не пишет в
// IndexedDB само — возвращает обновлённый Client, вызывающий код сам решает,
// чем сохранить (saveClient).
import type { Client } from '../domain/client';
import type { Consultation, ConsultationHistoryEntry } from '../domain/consultation';
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
  nextStep: string;
  urgency: UrgencyKey;
  photos: string[];
  projectId: string | null;
}

function consultationFields(data: ConsultationFormData) {
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
    nextStep: data.nextStep.trim(),
    urgency: data.urgency,
    photos: data.photos,
    projectId: data.projectId,
  };
}

function historyEntry(note: string): ConsultationHistoryEntry {
  return { id: crypto.randomUUID(), date: new Date().toISOString(), note };
}

// editingConsultationId — редактирование существующей записи (previousConsultationId
// не трогается, чужая цепочка не переписывается). previousConsultationId —
// только для НОВОЙ записи, назначенной как продолжение другой («Назначить
// следующую консультацию», см. TattoDiary's startChainNextConsultation);
// null/не передан — обычная «Новая консультация», не часть цепочки.
export function upsertConsultation(
  client: Client,
  data: ConsultationFormData,
  editingConsultationId: string | null,
  previousConsultationId: string | null = null,
): { client: Client; consultationId: string } {
  const fields = consultationFields(data);
  let consultations: Consultation[];
  let consultationId: string;

  if (editingConsultationId) {
    consultationId = editingConsultationId;
    consultations = client.consultations.map((c) =>
      c.id === editingConsultationId ? { ...c, ...fields, history: [...c.history, historyEntry('Изменена')] } : c,
    );
  } else {
    consultationId = crypto.randomUUID();
    const newConsultation: Consultation = {
      id: consultationId,
      createdDate: new Date().toISOString(),
      done: false,
      cancelled: false,
      status: 'active',
      convertedToSessionId: null,
      previousConsultationId,
      nextConsultationId: null,
      history: [historyEntry(previousConsultationId ? 'Назначена как следующая консультация' : 'Консультация создана')],
      ...fields,
    };
    // Обратная ссылка на источник цепочки проставляется той же мутацией —
    // previous и new меняются одним атомарным изменением client.consultations,
    // как applyConsultationConversion делает для consultation+session.
    const base = previousConsultationId
      ? client.consultations.map((c) =>
          c.id === previousConsultationId
            ? { ...c, nextConsultationId: consultationId, history: [...c.history, historyEntry('Назначена следующая консультация')] }
            : c,
        )
      : client.consultations;
    consultations = [...base, newConsultation];
  }

  return { client: { ...client, consultations }, consultationId };
}
