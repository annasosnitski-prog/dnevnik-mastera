// Единственное место, где мутируются сессии и консультации после Этапа 2.
//
// Иерархия — Клиент → Проект → консультации/сессии. Запись физически лежит
// ТОЛЬКО в своём проекте (Project.sessions/Project.consultations), клиент
// видит их вычисляемым срезом (getClientSessions/getClientConsultations в
// domain/projectSelectors.ts). Раньше те же операции работали над Client и
// сохранялись через saveClient; здесь тот же смысл, но владелец записи —
// проект.
//
// Все функции принимают ПОЛНЫЙ список проектов и возвращают ПОЛНЫЙ новый
// список, в котором новую ссылку получили только реально изменённые проекты.
// Отсюда два важных свойства:
//
//  1. Операции свободно склеиваются в цепочку (результат одной — вход
//     следующей), и если две из них задели один проект, изменения ложатся
//     в ОДИН объект, а не в два конкурирующих.
//  2. Вызывающий код сохраняет всё одной записью (saveProjects в
//     TattoDiary.tsx), отличая изменённые проекты по identity. Два
//     saveProject подряд в одном тике так делать нельзя: второй прочитал бы
//     ещё не обновившийся React-стейт и затёр бы первый — ровно этот баг
//     терял сессию в проекте без клиента (#248).
//
// Связи (цепочка сессий, цепочка консультаций, «перевести в сессию») могут
// пересекать границу проекта: мастер вправе выбрать в форме другой проект,
// чем у предыдущей записи. Поэтому каждая связь ищет свою сторону по всем
// проектам, а не внутри одного.
import type { Project } from '../domain/project';
import type { Session } from '../domain/session';
import type { Consultation } from '../domain/consultation';
import { findProjectOfSession, findProjectOfConsultation } from '../domain/projectSelectors.js';
import { sessionFields, type SessionFormData } from './sessionSave.js';
import { consultationFields, historyEntry, type ConsultationFormData } from './consultationSave.js';

// Точечная замена одного проекта. Проект, которого нет в списке, не создаётся
// молча — см. комментарий про отсутствующий target в upsert-функциях ниже.
function mapProject(projects: Project[], projectId: string, update: (project: Project) => Project): Project[] {
  return projects.map((p) => (p.id === projectId ? update(p) : p));
}

function hasProject(projects: Project[], projectId: string): boolean {
  return projects.some((p) => p.id === projectId);
}

// ── Точечные правки записи там, где она физически лежит ───────────────────
// Заменяют прежний паттерн saveClient({ ...client, sessions: client.sessions
// .map(...) }): найти проект-владелец и поменять запись в нём.

export function updateSessionInProjects(
  projects: Project[],
  sessionId: string,
  update: (session: Session) => Session,
): Project[] {
  const owner = findProjectOfSession(projects, sessionId);
  if (!owner) return projects;
  return mapProject(projects, owner.id, (p) => ({
    ...p,
    sessions: p.sessions.map((s) => (s.id === sessionId ? update(s) : s)),
  }));
}

export function updateConsultationInProjects(
  projects: Project[],
  consultationId: string,
  update: (consultation: Consultation) => Consultation,
): Project[] {
  const owner = findProjectOfConsultation(projects, consultationId);
  if (!owner) return projects;
  return mapProject(projects, owner.id, (p) => ({
    ...p,
    consultations: p.consultations.map((c) => (c.id === consultationId ? update(c) : c)),
  }));
}

// ── Переезд записи в другой проект ────────────────────────────────────────
// Раньше «сменить проект записи» было правкой одного поля projectId. Теперь
// проект — это место хранения, поэтому смена означает физический перенос.
// projectId записи держим равным её настоящему проекту: это инвариант, на
// который опирается остальной код (getSessionsByProjectId и др.).

export function moveSessionToProject(projects: Project[], sessionId: string, targetProjectId: string): Project[] {
  const owner = findProjectOfSession(projects, sessionId);
  if (!owner || owner.id === targetProjectId || !hasProject(projects, targetProjectId)) return projects;
  const session = owner.sessions.find((s) => s.id === sessionId);
  if (!session) return projects;
  const without = mapProject(projects, owner.id, (p) => ({ ...p, sessions: p.sessions.filter((s) => s.id !== sessionId) }));
  return mapProject(without, targetProjectId, (p) => ({ ...p, sessions: [...p.sessions, { ...session, projectId: targetProjectId }] }));
}

export function moveConsultationToProject(projects: Project[], consultationId: string, targetProjectId: string): Project[] {
  const owner = findProjectOfConsultation(projects, consultationId);
  if (!owner || owner.id === targetProjectId || !hasProject(projects, targetProjectId)) return projects;
  const consultation = owner.consultations.find((c) => c.id === consultationId);
  if (!consultation) return projects;
  const without = mapProject(projects, owner.id, (p) => ({
    ...p,
    consultations: p.consultations.filter((c) => c.id !== consultationId),
  }));
  return mapProject(without, targetProjectId, (p) => ({
    ...p,
    consultations: [...p.consultations, { ...consultation, projectId: targetProjectId }],
  }));
}

// ── Создание и правка из формы ────────────────────────────────────────────

// Сессия из формы «Новая сессия» — создание или правка. Заменяет пару
// upsertClientSession/upsertProjectSession: разделение «сессия клиента» и
// «сессия без клиента» после Этапа 2 исчезло, владелец у обеих один и тот же
// — проект (а есть ли у проекта клиент, знает сам проект).
//
// previousSessionId — только для НОВОЙ записи, назначенной продолжением
// другой («Назначить следующую сессию»); обратная ссылка проставляется тем
// же изменением, даже если предыдущая сессия лежит в другом проекте.
//
// Правка с ДРУГИМ targetProjectId — это перенос записи: она уходит из
// прежнего проекта и появляется в выбранном (см. moveSessionToProject).
//
// Несуществующий targetProjectId — список возвращается без изменений, а не
// «запись сохранена в никуда»: единственный источник target'а —
// ensureBucketProject/выбор в форме, оба гарантируют существующий проект,
// поэтому промах здесь означал бы ошибку вызывающего кода.
export function upsertSessionInProjects(
  projects: Project[],
  targetProjectId: string,
  data: SessionFormData,
  editingSessionId: string | null,
  previousSessionId: string | null = null,
): { projects: Project[]; sessionId: string } {
  if (!hasProject(projects, targetProjectId)) {
    return { projects, sessionId: editingSessionId ?? '' };
  }
  const fields = { ...sessionFields(data), projectId: targetProjectId };

  if (editingSessionId) {
    const owner = findProjectOfSession(projects, editingSessionId);
    const existing = owner?.sessions.find((s) => s.id === editingSessionId);
    if (!owner || !existing) return { projects, sessionId: editingSessionId };
    if (owner.id === targetProjectId) {
      return {
        projects: mapProject(projects, owner.id, (p) => ({
          ...p,
          sessions: p.sessions.map((s) => (s.id === editingSessionId ? { ...s, ...fields } : s)),
        })),
        sessionId: editingSessionId,
      };
    }
    const without = mapProject(projects, owner.id, (p) => ({
      ...p,
      sessions: p.sessions.filter((s) => s.id !== editingSessionId),
    }));
    return {
      projects: mapProject(without, targetProjectId, (p) => ({ ...p, sessions: [...p.sessions, { ...existing, ...fields }] })),
      sessionId: editingSessionId,
    };
  }

  const sessionId = crypto.randomUUID();
  const newSession: Session = {
    id: sessionId,
    cancelled: false,
    // @deprecated (см. Session.healed) — форма его больше не задаёт, новая
    // запись просто рождается с false и никогда его не меняет.
    healed: false,
    sourceConsultationId: null,
    previousSessionId,
    nextSessionId: null,
    ...fields,
  };
  const linked = previousSessionId
    ? updateSessionInProjects(projects, previousSessionId, (s) => ({ ...s, nextSessionId: sessionId }))
    : projects;
  return {
    projects: mapProject(linked, targetProjectId, (p) => ({ ...p, sessions: [...p.sessions, newSession] })),
    sessionId,
  };
}

// Консультация из формы — полностью зеркалит upsertSessionInProjects выше,
// включая цепочку «Назначить следующую консультацию» (у которой, в отличие
// от прежнего upsertProjectConsultation, теперь есть и client-less вариант:
// разделения больше нет) и запись в историю.
export function upsertConsultationInProjects(
  projects: Project[],
  targetProjectId: string,
  data: ConsultationFormData,
  editingConsultationId: string | null,
  previousConsultationId: string | null = null,
): { projects: Project[]; consultationId: string } {
  if (!hasProject(projects, targetProjectId)) {
    return { projects, consultationId: editingConsultationId ?? '' };
  }
  const fields = { ...consultationFields(data), projectId: targetProjectId };

  if (editingConsultationId) {
    const owner = findProjectOfConsultation(projects, editingConsultationId);
    const existing = owner?.consultations.find((c) => c.id === editingConsultationId);
    if (!owner || !existing) return { projects, consultationId: editingConsultationId };
    const edited: Consultation = { ...existing, ...fields, history: [...existing.history, historyEntry('Изменена')] };
    if (owner.id === targetProjectId) {
      return {
        projects: mapProject(projects, owner.id, (p) => ({
          ...p,
          consultations: p.consultations.map((c) => (c.id === editingConsultationId ? edited : c)),
        })),
        consultationId: editingConsultationId,
      };
    }
    const without = mapProject(projects, owner.id, (p) => ({
      ...p,
      consultations: p.consultations.filter((c) => c.id !== editingConsultationId),
    }));
    return {
      projects: mapProject(without, targetProjectId, (p) => ({ ...p, consultations: [...p.consultations, edited] })),
      consultationId: editingConsultationId,
    };
  }

  const consultationId = crypto.randomUUID();
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
  const linked = previousConsultationId
    ? updateConsultationInProjects(projects, previousConsultationId, (c) => ({
        ...c,
        nextConsultationId: consultationId,
        history: [...c.history, historyEntry('Назначена следующая консультация')],
      }))
    : projects;
  return {
    projects: mapProject(linked, targetProjectId, (p) => ({ ...p, consultations: [...p.consultations, newConsultation] })),
    consultationId,
  };
}

// ── «Перевести в сессию» и обратное восстановление ────────────────────────

// Консультация остаётся в истории (status 'converted'), связь проставляется
// на обе стороны — тот же смысл, что у прежнего applyConsultationConversion,
// только стороны могут лежать в разных проектах.
export function applyConsultationConversionInProjects(
  projects: Project[],
  sessionId: string,
  consultationId: string,
): Project[] {
  const withSession = updateSessionInProjects(projects, sessionId, (s) => ({ ...s, sourceConsultationId: consultationId }));
  return updateConsultationInProjects(withSession, consultationId, (c) => ({
    ...c,
    status: 'converted',
    convertedToSessionId: sessionId,
    done: true,
    history: [...c.history, historyEntry('Переведена в сессию')],
  }));
}

// Удаление сессии, полученной переводом из консультации: сначала вернуть
// консультацию в 'completed' и снять повисшую ссылку (иначе она навсегда
// осталась бы «Переведена в сессию» без самой сессии и неудаляемой — см.
// isConsultationDeletable), и только потом убрать саму сессию. Обычная
// сессия (без sourceConsultationId) удаляется без этого шага.
export function deleteSessionFromProjects(projects: Project[], sessionId: string): Project[] {
  const owner = findProjectOfSession(projects, sessionId);
  if (!owner) return projects;
  const session = owner.sessions.find((s) => s.id === sessionId);
  const restored = session?.sourceConsultationId
    ? updateConsultationInProjects(projects, session.sourceConsultationId, (c) =>
        c.convertedToSessionId === sessionId
          ? {
              ...c,
              status: 'completed',
              convertedToSessionId: null,
              history: [...c.history, historyEntry('Связанная сессия удалена')],
            }
          : c,
      )
    : projects;
  return mapProject(restored, owner.id, (p) => ({ ...p, sessions: p.sessions.filter((s) => s.id !== sessionId) }));
}

export function deleteConsultationFromProjects(projects: Project[], consultationId: string): Project[] {
  const owner = findProjectOfConsultation(projects, consultationId);
  if (!owner) return projects;
  return mapProject(projects, owner.id, (p) => ({
    ...p,
    consultations: p.consultations.filter((c) => c.id !== consultationId),
  }));
}
