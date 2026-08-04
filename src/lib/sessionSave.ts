// Чистая логика сохранения Session, вынесенная из handleAddSession /
// handleAddProjectSession (TattoDiary.tsx) — по явным client/project, а не
// через глобальный selectedClient. Используется и обычной формой «Новая
// сессия» (owner уже известен из экрана клиента/проекта), и цепочкой
// создания сессии из ContentLinkPickerSheet, где владелец определяется
// entry.clientId, а не тем, какой клиент сейчас открыт в приложении.
//
// Ничего не пишет в IndexedDB само — возвращает обновлённый Client/Project и
// id получившейся сессии, вызывающий код сам решает, чем сохранить
// (saveClient/saveProject), и сам вызывает advanceProjectStage.
import type { Client } from '../domain/client';
import type { Project } from '../domain/project';
import type { Session } from '../domain/session';
import { clientStyles } from '../domain/client.js';

export interface SessionFormData {
  name: string;
  date: string;
  time: string;
  duration: string;
  style: string;
  area: string;
  colors: string;
  needles: string;
  skinReaction: string;
  note: string;
  photos: string[];
  done: boolean;
  healed: boolean;
  projectId: string | null;
}

function sessionFields(data: SessionFormData) {
  return {
    name: data.name.trim(),
    date: data.date,
    time: data.time,
    duration: data.duration,
    style: data.style,
    area: data.area.trim(),
    colors: data.colors.trim(),
    needles: data.needles.trim(),
    skinReaction: data.skinReaction.trim(),
    note: data.note.trim(),
    photos: data.photos,
    done: data.done,
    healed: data.healed,
    projectId: data.projectId,
  };
}

// Сессия клиента (client.sessions) — тот же набор полей и то же слияние
// client.styles, что и в handleAddSession, только владелец передан явно.
export function upsertClientSession(
  client: Client,
  data: SessionFormData,
  editingSessionId: string | null,
): { client: Client; sessionId: string } {
  const fields = sessionFields(data);
  let sessions: Session[];
  let sessionId: string;
  if (editingSessionId) {
    sessions = client.sessions.map((s) => (s.id === editingSessionId ? { ...s, ...fields } : s));
    sessionId = editingSessionId;
  } else {
    sessionId = crypto.randomUUID();
    sessions = [...client.sessions, { id: sessionId, cancelled: false, sourceConsultationId: null, ...fields }];
  }
  const styles = clientStyles(client);
  const mergedStyles = fields.style && !styles.includes(fields.style) ? [...styles, fields.style] : styles;
  return {
    client: { ...client, styles: mergedStyles, style: mergedStyles.join(' · '), sessions },
    sessionId,
  };
}

// «Перевести в сессию» (startConvertConsultationToSession в TattoDiary.tsx) —
// консультация раньше просто удалялась тем же saveClient, что добавлял
// сессию (см. PR #198). Теперь она остаётся в истории: status→'converted',
// done→true (см. normalizeClient в lib/normalize.ts — тот же принцип для
// данных, прошедших через IndexedDB/бэкап без этого шага), связь на обе
// стороны — convertedToSessionId на консультации, sourceConsultationId на
// сессии. Не мутирует client — caller сам решает, чем сохранять (saveClient).
export function applyConsultationConversion(client: Client, sessionId: string, consultationId: string): Client {
  return {
    ...client,
    sessions: client.sessions.map((s) => (s.id === sessionId ? { ...s, sourceConsultationId: consultationId } : s)),
    consultations: client.consultations.map((c) =>
      c.id === consultationId
        ? {
            ...c,
            status: 'converted',
            convertedToSessionId: sessionId,
            done: true,
            history: [...c.history, { id: crypto.randomUUID(), date: new Date().toISOString(), note: 'Переведена в сессию' }],
          }
        : c,
    ),
  };
}

// deleteSession's counterpart to applyConsultationConversion above. Plain
// array-filter deletion (client.sessions.filter(...)) used to just cut the
// session out, leaving the consultation it came from still pointing at a
// convertedToSessionId that no longer exists — a dangling reference with no
// way back into the UI (ConsultationRow would show it dimmed as «Переведена
// в сессию» forever, with no session to open, and isConsultationDeletable
// in domain/consultation.ts would keep it permanently undeletable too).
// Call this BEFORE filtering the session out: the consultation reverts to
// status 'completed' (it did happen — only the resulting session record is
// gone, so it must NOT go back to 'active') with convertedToSessionId
// cleared and done left true (session existing was never what made it
// done), plus a history entry recording why. previousConsultationId/
// nextConsultationId are untouched — the repeat-consultation chain doesn't
// care how this one ended up completed. No-op if the session doesn't exist
// or was never a conversion (sourceConsultationId null). Does not touch
// client.sessions itself — the caller still does its own filter.
export function applyConsultationRestoration(client: Client, sessionId: string): Client {
  const session = client.sessions.find((s) => s.id === sessionId);
  if (!session?.sourceConsultationId) return client;
  const consultationId = session.sourceConsultationId;
  return {
    ...client,
    consultations: client.consultations.map((c) =>
      c.id === consultationId
        ? {
            ...c,
            status: 'completed',
            convertedToSessionId: null,
            history: [...c.history, { id: crypto.randomUUID(), date: new Date().toISOString(), note: 'Связанная сессия удалена' }],
          }
        : c,
    ),
  };
}

// Сессия без клиента (project.sessions) — «Мастерская: сессия без клиента».
export function upsertProjectSession(
  project: Project,
  data: SessionFormData,
  editingSessionId: string | null,
): { project: Project; sessionId: string } {
  const fields = sessionFields(data);
  let sessions: Session[];
  let sessionId: string;
  if (editingSessionId) {
    sessions = project.sessions.map((s) => (s.id === editingSessionId ? { ...s, ...fields } : s));
    sessionId = editingSessionId;
  } else {
    sessionId = crypto.randomUUID();
    sessions = [...project.sessions, { id: sessionId, cancelled: false, sourceConsultationId: null, ...fields }];
  }
  return { project: { ...project, sessions }, sessionId };
}
