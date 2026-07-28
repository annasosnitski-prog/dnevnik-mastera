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
    sessionId = Date.now().toString();
    sessions = [...client.sessions, { id: sessionId, cancelled: false, ...fields }];
  }
  const styles = clientStyles(client);
  const mergedStyles = fields.style && !styles.includes(fields.style) ? [...styles, fields.style] : styles;
  return {
    client: { ...client, styles: mergedStyles, style: mergedStyles.join(' · '), sessions },
    sessionId,
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
    sessionId = Date.now().toString();
    sessions = [...project.sessions, { id: sessionId, cancelled: false, ...fields }];
  }
  return { project: { ...project, sessions }, sessionId };
}
