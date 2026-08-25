// Нормализация «сырых» записей IndexedDB (которые могут отставать от
// текущей схемы) в полноценные доменные сущности — UI никогда не должен
// защищаться от отсутствующих полей. Вынесено из TattoDiary.tsx
// (PR 3 рефакторинга). Логика не менялась — только перенос.
import { type Session } from '../domain/session';
import { type Consultation, type ConsultationStatus, type ConsultationHistoryEntry } from '../domain/consultation';
import { type ClientNote } from '../domain/task';
import { URGENCY, LEGACY_URGENCY_MAP } from '../domain/urgency.js';
import { isValidISODate } from '../utils/dates.js';
import { ACCENT_COLORS, CLIENT_TYPES, CLIENT_LANGUAGES, MARKER_COLORS, type Client } from '../domain/client.js';
import {
  PROJECT_CATEGORIES,
  PROJECT_STAGES,
  PROJECT_STATES,
  PROJECT_WAITING_FOR,
  PROJECT_PRIORITIES,
  NEXT_ACTION_TYPES,
  type Project,
} from '../domain/project.js';

// Normalises a raw IndexedDB record (which may predate this schema) into a
// complete Client so the UI never has to guard against missing fields.
// Общая нормализация сессии — переиспользуется и для client.sessions, и для
// «сессий без клиента» на самом проекте (Project.sessions, Этап 3b-доп.).
export function normalizeSession(s: any, i: number): Session {
  return {
    id: String(s?.id ?? `${Date.now()}-${i}`),
    name: s?.name ?? '',
    date: s?.date ?? '',
    time: s?.time ?? '',
    duration: s?.duration ?? '',
    style: s?.style ?? '',
    area: s?.area ?? s?.proportions ?? '',
    colors: Array.isArray(s?.colors) ? s.colors.join(', ') : s?.colors ?? '',
    needles: s?.needles ?? '',
    skinReaction: s?.skinReaction ?? '',
    note: s?.note ?? s?.notes ?? '',
    photos: Array.isArray(s?.photos) ? s.photos : s?.photoUrl ? [s.photoUrl] : [],
    done: s?.done ?? true,
    healed: s?.healed ?? false,
    cancelled: s?.cancelled ?? false,
    projectId: s?.projectId ?? null,
    sourceConsultationId: s?.sourceConsultationId ?? null,
    previousSessionId: s?.previousSessionId ?? null,
    nextSessionId: s?.nextSessionId ?? null,
  };
}

const CONSULTATION_STATUSES: ConsultationStatus[] = ['active', 'completed', 'converted', 'cancelled'];

// Своя история изменений консультации (см. Consultation.history) — старые
// записи (до этой фичи) её не содержат, тогда просто []. Повреждённые записи
// внутри истории отбрасываются, а не роняют нормализацию всей консультации.
function normalizeConsultationHistory(raw: any): ConsultationHistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((h) => h && typeof h.note === 'string')
    .map((h: any, i: number) => ({
      id: String(h?.id ?? `${Date.now()}-h${i}`),
      date: h?.date ?? new Date().toISOString(),
      note: h.note,
    }));
}

// Единая нормализация ClientNote для клиентских и мастерских задач, включая
// импорт старых/повреждённых данных. idPrefix сохраняет прежние fallback-id:
// `n` для client.notes и `m` для masterInfo.notes.
export function normalizeClientNote(raw: any, index: number, idPrefix: 'n' | 'm' = 'n'): ClientNote {
  return {
    id: String(raw?.id ?? `${Date.now()}-${idPrefix}${index}`),
    text: raw?.text ?? '',
    urgency: URGENCY.some((u) => u.key === raw?.urgency) ? raw.urgency : LEGACY_URGENCY_MAP[raw?.urgency] ?? 'normal',
    done: Boolean(raw?.done),
    createdDate: raw?.createdDate ?? new Date().toISOString(),
    photos: Array.isArray(raw?.photos) ? raw.photos : [],
    projectId: raw?.projectId ?? null,
    dueDate: isValidISODate(raw?.dueDate) ? raw.dueDate : null,
  };
}

// Единая нормализация Consultation для клиентских и client-less (Project)
// консультаций — вынесено из normalizeClient, чтобы normalizeProject могла
// переиспользовать ту же логику для Project.consultations. `sessions` — уже
// нормализованный список-владелец (client.sessions или project.sessions),
// нужен только для hasLiveConvertedSession-проверки ниже. idPrefix сохраняет
// прежний fallback-id `c` для клиентских записей; `pc` — для проектных.
export function normalizeConsultation(cn: any, i: number, sessions: Session[], idPrefix: 'c' | 'pc' = 'c'): Consultation {
  const rawStatus: ConsultationStatus = CONSULTATION_STATUSES.includes(cn?.status) ? cn.status : 'active';
  const id = String(cn?.id ?? `${Date.now()}-${idPrefix}${i}`);
  const rawConvertedToSessionId = rawStatus === 'converted' ? cn?.convertedToSessionId ?? null : null;
  // A 'converted' status only stays 'converted' if it's backed by a
  // real, mutually-linked session (see hasLiveConvertedSession in
  // domain/consultation.ts — status/convertedToSessionId alone
  // aren't enough). Otherwise it's broken data — the session it
  // pointed at was deleted outside the normal flow, a corrupted
  // backup, or a session whose own sourceConsultationId disagrees —
  // and it demotes to 'completed' so it doesn't become permanently
  // undeletable (isConsultationDeletable) while pointing at nothing.
  // No history entry is added here: that would re-append on every
  // load. An entry is only ever added for a real user deletion, by
  // applyConsultationRestoration in lib/sessionSave.ts.
  const hasLiveSession =
    rawConvertedToSessionId !== null &&
    sessions.some((s) => s.id === rawConvertedToSessionId && s.sourceConsultationId === id);
  const status: ConsultationStatus = rawStatus === 'converted' && !hasLiveSession ? 'completed' : rawStatus;
  const convertedToSessionId = hasLiveSession ? rawConvertedToSessionId : null;
  return {
    id,
    date: cn?.date ?? '',
    time: cn?.time ?? '',
    area: cn?.area ?? '',
    style: cn?.style ?? '',
    generalNotes: cn?.generalNotes ?? '',
    feeling: cn?.feeling ?? '',
    creative: cn?.creative ?? '',
    inspirationSources: cn?.inspirationSources ?? '',
    outcome: cn?.outcome ?? '',
    // Намеренно не читаем cn?.nextStep — поле убрано из модели
    // (единственный next step теперь только на Project, см.
    // domain/consultation.ts). Старые backup/IndexedDB-записи могут
    // ещё содержать этот ключ в сыром JSON — он просто игнорируется,
    // отдельной миграции с удалением ключа не требуется.
    urgency: URGENCY.some((u) => u.key === cn?.urgency) ? cn.urgency : 'normal',
    photos: Array.isArray(cn?.photos) ? cn.photos : [],
    // Конвертированная консультация всегда done (в т.ч. только что
    // разжалованная в 'completed' выше — см. done: true в спеке
    // «Повреждённые старые данные») — так существующие фильтры по
    // done/cancelled (plannerSelectors.ts, buildReminders.ts
    // overdueEntries) не показывают её как незавершённую, даже если
    // это поле в сыром объекте не выставлено.
    done: rawStatus === 'converted' ? true : Boolean(cn?.done),
    cancelled: Boolean(cn?.cancelled),
    status,
    convertedToSessionId,
    // Цепочка повторных консультаций — отсутствует в записях до этой
    // фичи, тогда обе ссылки null (запись считается началом своей
    // цепочки, см. Consultation.previousConsultationId). Дальше
    // ссылки не валидируются на существование цели — тот же принцип,
    // что уже применён к convertedToSessionId/sourceConsultationId.
    previousConsultationId: cn?.previousConsultationId ?? null,
    nextConsultationId: cn?.nextConsultationId ?? null,
    history: normalizeConsultationHistory(cn?.history),
    createdDate: cn?.createdDate ?? new Date().toISOString(),
    projectId: cn?.projectId ?? null,
  };
}

export function normalizeClient(raw: any, index: number): Client {
  const sessions: Session[] = Array.isArray(raw?.sessions) ? raw.sessions.map(normalizeSession) : [];
  const latestStyle = sessions.length ? sessions[sessions.length - 1].style : '';
  const styles: string[] = Array.isArray(raw?.styles)
    ? raw.styles.filter(Boolean)
    : raw?.style
    ? [raw.style]
    : latestStyle
    ? [latestStyle]
    : [];

  return {
    id: String(raw?.id ?? Date.now() + index),
    name: raw?.name ?? '',
    surname: raw?.surname ?? '',
    styles,
    style: styles.join(' · '),
    color: raw?.color ?? ACCENT_COLORS[index % ACCENT_COLORS.length],
    clientType: CLIENT_TYPES.some((t) => t.value === raw?.clientType) ? raw.clientType : 'client',
    language: CLIENT_LANGUAGES.some((l) => l.value === raw?.language) ? raw.language : 'ru',
    note: raw?.note ?? raw?.chatHistory ?? '',
    masterNote: raw?.masterNote ?? '',
    phone: raw?.phone ?? '',
    skinType: raw?.skinType ?? '',
    skinTone: raw?.skinTone ?? '',
    skinNotes: raw?.skinNotes ?? '',
    allergies: raw?.allergies ?? '',
    skinReactions: raw?.skinReactions ?? '',
    chatLinks: Array.isArray(raw?.chatLinks) ? raw.chatLinks : [],
    sessions,
    consultations: Array.isArray(raw?.consultations)
      ? raw.consultations.map((cn: any, i: number) => normalizeConsultation(cn, i, sessions, 'c'))
      : [],
    documents: Array.isArray(raw?.documents) ? raw.documents : [],
    notes: Array.isArray(raw?.notes) ? raw.notes.map((n: any, i: number) => normalizeClientNote(n, i, 'n')) : [],
    createdDate: raw?.createdDate ?? new Date().toISOString(),
  };
}

export function normalizeProject(raw: any, index: number): Project {
  const sessions: Session[] = Array.isArray(raw?.sessions) ? raw.sessions.map(normalizeSession) : [];
  const firstSessionWindowAmount =
    typeof raw?.firstSessionWindowAmount === 'number' && Number.isFinite(raw.firstSessionWindowAmount) && raw.firstSessionWindowAmount >= 0
      ? raw.firstSessionWindowAmount
      : null;
  const firstSessionWindowUnit = raw?.firstSessionWindowUnit === 'week' || raw?.firstSessionWindowUnit === 'month'
    ? raw.firstSessionWindowUnit
    : null;
  const preSessionMeeting = raw?.preSessionMeeting === 'none' ? 'none' : 'consultation';

  return {
    id: String(raw?.id ?? Date.now() + index),
    title: raw?.title ?? '',
    color: raw?.color ?? MARKER_COLORS[index % MARKER_COLORS.length],
    category: PROJECT_CATEGORIES.some((c) => c.key === raw?.category) ? raw.category : 'tattoo',
    clientId: raw?.clientId ?? null,
    stage: PROJECT_STAGES.some((s) => s.key === raw?.stage) ? raw.stage : 'idea',
    state: PROJECT_STATES.some((s) => s.key === raw?.state) ? raw.state : 'active',
    waitingFor: PROJECT_WAITING_FOR.some((w) => w.key === raw?.waitingFor) ? raw.waitingFor : 'none',
    nextActionText: raw?.nextActionText ?? '',
    nextActionDate: raw?.nextActionDate ?? null,
    // Отсутствует или неизвестное значение → null (не угадываем тип по
    // nextActionText). Повторная нормализация валидного значения не меняет
    // его — та же .some()-проверка, что и у остальных union-полей проекта.
    nextActionType: NEXT_ACTION_TYPES.some((t) => t.key === raw?.nextActionType) ? raw.nextActionType : null,
    priority: PROJECT_PRIORITIES.some((p) => p.key === raw?.priority) ? raw.priority : 'normal',
    area: raw?.area ?? '',
    style: raw?.style ?? '',
    generalNotes: raw?.generalNotes ?? '',
    feeling: raw?.feeling ?? '',
    creative: raw?.creative ?? '',
    inspirationSources: raw?.inspirationSources ?? '',
    photos: Array.isArray(raw?.photos) ? raw.photos : [],
    createdDate: raw?.createdDate ?? new Date().toISOString(),
    firstSessionWindowAmount,
    firstSessionWindowUnit,
    preSessionMeeting,
    sessions,
    consultations: Array.isArray(raw?.consultations)
      ? raw.consultations.map((cn: any, i: number) => normalizeConsultation(cn, i, sessions, 'pc'))
      : [],
    // Легаси-проекты (до M4) не знают об этом поле — null, а НЕ createdDate
    // и не текущая дата: старый проект вполне мог реально двигаться недавно,
    // просто до того, как это поле начали писать. Задним числом подставлять
    // сюда что-либо значит рисковать ложным «застоем» после обновления (см.
    // Project.lastMeaningfulActivityAt в domain/project.ts). Первое же
    // значимое изменение простановит настоящую дату через saveProject.
    lastMeaningfulActivityAt: raw?.lastMeaningfulActivityAt ?? null,
  };
}
