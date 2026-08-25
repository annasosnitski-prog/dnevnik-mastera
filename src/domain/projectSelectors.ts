// Чистые выборки по проектам (PR 3 рефакторинга). Раньше это были inline-
// фильтры прямо в JSX/обработчиках TattoDiary.tsx — вынесены как есть,
// условия и порядок результатов не менялись.
//
// Правила слоя: данные приходят аргументами, ничего не мутируется
// (filter/find возвращают новые массивы/ссылки), нет обращений к React,
// IndexedDB и localStorage.

import type { Project, ProjectCategory, ProjectState } from './project';
import type { Session } from './session';
import type { Consultation } from './consultation';
import type { Client } from './client';
import { ISO_DATE_RE, isValidISODate } from '../utils/dates.js';

// Проект по id. Возвращает null (а не undefined), чтобы вызывающий код
// одинаково работал и через `if (!p)`, и через `?? fallback` — оба
// использованных в компоненте паттерна ведут себя как прежде.
export function getProjectById(projects: Project[], id: string): Project | null {
  return projects.find((p) => p.id === id) ?? null;
}

// Проекты конкретного клиента.
export function getProjectsByClientId(projects: Project[], clientId: string): Project[] {
  return projects.filter((p) => p.clientId === clientId);
}

// Проекты «Мастерской» — идеи без клиента (clientId === null).
export function getWorkshopProjects(projects: Project[]): Project[] {
  return projects.filter((p) => p.clientId === null);
}

export function clientNameFor(clients: Client[], clientId: string | null): string | null {
  if (!clientId) return null;
  const c = clients.find((x) => x.id === clientId);
  return c ? `${c.name} ${c.surname}`.trim() : null;
}

// ===================== КЛИЕНТСКИЙ СРЕЗ (Этап 2) =====================
// Иерархия — Клиент → Проект → консультации/сессии: записи физически лежат
// ТОЛЬКО на проекте (Project.sessions/Project.consultations), а «сессии
// клиента» — вычисляемое объединение по всем проектам этого клиента, тем же
// приёмом, что buildProjectFolders ниже (папка — не сущность, а проекция).
// Раньше записи дублировались между Client.sessions/consultations и
// Project.* — отсюда и брались расхождения между карточкой клиента и
// проектом. Client.sessions/consultations больше не читаются (легаси-массивы
// остаются в базе нетронутыми как страховка, см. миграцию в lib/
// clientRecordsMigration.ts).
//
// Порядок результата — по дате (пустая дата в конец), чтобы вызывающий код
// не пересортировывал каждый раз; там, где нужен другой порядок, он и так
// сортирует сам (см. getConsultationSequence).
function byDateThenCreated<T extends { date: string; createdDate?: string }>(a: T, b: T): number {
  const aHas = !!a.date;
  const bHas = !!b.date;
  if (aHas !== bHas) return aHas ? -1 : 1;
  if (a.date !== b.date) return a.date.localeCompare(b.date);
  return (a.createdDate || '').localeCompare(b.createdDate || '');
}

// Все сессии клиента — по всем его проектам. Единственный способ получить
// «сессии клиента» после Этапа 2.
export function getClientSessions(projects: Project[], clientId: string): Session[] {
  return projects
    .filter((p) => p.clientId === clientId)
    .flatMap((p) => p.sessions)
    .sort(byDateThenCreated);
}

// Все консультации клиента — см. getClientSessions.
export function getClientConsultations(projects: Project[], clientId: string): Consultation[] {
  return projects
    .filter((p) => p.clientId === clientId)
    .flatMap((p) => p.consultations)
    .sort(byDateThenCreated);
}

// Проект, в котором физически лежит запись — нужен всем мутациям (правка,
// удаление, отмена, «перевести в сессию»): менять надо именно его.
export function findProjectOfSession(projects: Project[], sessionId: string): Project | null {
  return projects.find((p) => p.sessions.some((s) => s.id === sessionId)) ?? null;
}

export function findProjectOfConsultation(projects: Project[], consultationId: string): Project | null {
  return projects.find((p) => p.consultations.some((c) => c.id === consultationId)) ?? null;
}

// Сессии, привязанные к проекту (link-подход: сессия физически лежит у
// клиента, связь — через projectId).
export function getSessionsByProjectId(sessions: Session[], projectId: string): Session[] {
  return sessions.filter((s) => s.projectId === projectId);
}

// Консультации, привязанные к проекту — см. getSessionsByProjectId.
export function getConsultationsByProjectId(consultations: Consultation[], projectId: string): Consultation[] {
  return consultations.filter((c) => c.projectId === projectId);
}

// Консультации проекта в порядке последовательности («Консультация 1»,
// «Консультация 2», ...) — по дате/времени, а не по previousConsultationId:
// та ссылка связывает конкретную пару предыдущая/следующая для UI-навигации
// и для «Перевести в сессию»/«Назначить следующую», но сам номер по
// milestone нигде не хранится и должен переживать удаление консультации из
// середины цепочки без «дыр» и без необходимости чинить ссылки соседей.
// Сортировка по дате естественно совпадает с порядком цепочки (следующая
// консультация назначается на дату позже предыдущей), а для старых проектов
// без единой цепочки (несколько независимых консультаций, каждая с
// previousConsultationId===null) даёт всё равно осмысленный, стабильный
// порядок вместо произвольного.
export function getConsultationSequence(consultations: Consultation[], projectId: string): Consultation[] {
  return getConsultationsByProjectId(consultations, projectId).slice().sort((a, b) => {
    const aKey = `${a.date || ''}T${a.time || ''}`;
    const bKey = `${b.date || ''}T${b.time || ''}`;
    if (aKey !== bKey) return aKey.localeCompare(bKey);
    return (a.createdDate || '').localeCompare(b.createdDate || '');
  });
}

// Порядковый номер консультации внутри её проекта (1-based) — «Консультация
// N» вычисляется, а не хранится (см. getConsultationSequence). null для
// консультации без проекта — нумерация имеет смысл только «внутри одного
// проекта».
export function getConsultationNumber(consultations: Consultation[], consultation: Consultation): number | null {
  if (!consultation.projectId) return null;
  const sequence = getConsultationSequence(consultations, consultation.projectId);
  const index = sequence.findIndex((c) => c.id === consultation.id);
  return index === -1 ? null : index + 1;
}

// ===================== АКТИВНОСТЬ ПРОЕКТА (M4) =====================
// «Последняя реальная активность» проекта — производная величина, а не
// только сохранённое Project.lastMeaningfulActivityAt (который бампается
// лишь при смене этапа/статуса/того-кто-должен-действовать/следующего шага,
// см. isMeaningfulProjectChange в domain/project.ts). Сюда же примешиваются
// сигналы, у которых УЖЕ есть собственная настоящая дата события — выполненная
// сессия (session.date, когда done) и своя лента консультации
// (ConsultationHistoryEntry.date) — без них проект с активной перепиской
// консультаций, но без изменения next-step, ошибочно считался бы «застывшим».
// Хранить эти сигналы отдельным полем не нужно и рискованно (легко забыть
// пробросить бамп из ещё одного места saveClient) — они и так уже лежат в
// самих сессиях/консультациях.
//
// Даты сравниваются только в границах дня (yyyy-mm-dd) — «застывание»
// меряется целыми днями (как daysSince в buildReminders.ts), секунды внутри
// суток для этого решения не важны.
function toDateOnly(iso: string): string {
  return iso.length >= 10 ? iso.slice(0, 10) : iso;
}

// Достоверна ли известная активность — намеренно НЕ включает
// project.createdDate: для легаси-проекта (lastMeaningfulActivityAt===null,
// см. normalizeProject) один только факт создания записи ничего не говорит
// о том, двигался ли проект недавно — угадывание задним числом рискует
// массовым ложным «застоем» после обновления. Возвращает null, когда о
// проекте не известно ни одного достоверного сигнала — вызывающая сторона
// (staleProjects в reminders/buildReminders.ts) обязана пропустить такой
// проект, а не подставлять собственный fallback: лучше не показать
// карточку старого проекта, чем показать ложную.
//
// Каждый кандидат (lastMeaningfulActivityAt, дата done-сессии, запись
// истории консультации) принимается ТОЛЬКО если он валиден И <= today —
// done-сессия или запись истории с ошибочной будущей датой (повреждённые/
// ручные данные в IndexedDB, баг в другом месте) не должны маскировать
// реальный застой: такая запись просто отбрасывается как ненадёжная, а не
// засчитывается в «последнюю активность» задним числом из будущего.
// Валидность — через isValidISODate (utils/dates.ts), а не только через
// ISO_DATE_RE: одной формы yyyy-mm-dd недостаточно (см. её собственный
// комментарий) — «2026-02-30»/«2026-13-10» ей соответствуют по форме, но
// такой календарной даты не существует. Пустая строка, обрезанная/
// произвольная строка, календарно невозможная дата — всё отбрасывается
// здесь же, единым фильтром для всех трёх источников, а не отдельным
// парсером под один из них. `today` — yyyy-mm-dd (см. localISO в
// buildReminders.ts).
export function getProjectLastActivityDate(project: Project, sessions: Session[], consultations: Consultation[], today: string): string | null {
  let latest: string | null = null;
  const consider = (iso: string | null | undefined) => {
    if (!iso) return;
    const d = toDateOnly(iso);
    if (!isValidISODate(d)) return;
    if (d > today) return;
    if (latest === null || d > latest) latest = d;
  };
  consider(project.lastMeaningfulActivityAt);
  // project.sessions покрывает «сессии без клиента» (Мастерская) — сессии
  // клиентских проектов лежат в client.sessions, поэтому sessions сюда
  // приходит объединённым списком по всем клиентам (см. вызывающий код).
  for (const session of sessions) {
    if (session.projectId === project.id && session.done && ISO_DATE_RE.test(session.date)) consider(session.date);
  }
  for (const consultation of consultations) {
    if (consultation.projectId !== project.id) continue;
    for (const entry of consultation.history) consider(entry.date);
  }
  return latest;
}

// «Открыта» — не выполнена/не завершена и не отменена; ровно тот же
// предикат, что overdueEntries (reminders/buildReminders.ts) уже использует
// для сессий, чтобы «просрочено» и «застой» смотрели на одни и те же записи
// одинаково.
function isOpenSession(session: Session): boolean {
  return !session.done && !session.cancelled;
}

// status==='converted' уже подразумевает done:true (см. normalizeClient),
// но проверяем явно — тот же предикат, что overdueEntries использует для
// консультаций (см. buildReminders.ts).
function isOpenConsultation(consultation: Consultation): boolean {
  return !consultation.done && !consultation.cancelled && consultation.status !== 'converted';
}

// Уже есть подтверждённое запланированное действие (будущий next step,
// будущая незавершённая сессия/консультация проекта) — застой показывать
// не нужно, работа уже в движении, встреча или следующий шаг назначены
// (M4, п. 4). `today` — yyyy-mm-dd (см. localISO в buildReminders.ts).
export function hasScheduledWork(project: Project, sessions: Session[], consultations: Consultation[], today: string): boolean {
  if (project.nextActionText.trim() !== '' && project.nextActionDate !== null && project.nextActionDate >= today) return true;
  const hasFutureSession = sessions.some(
    (s) => s.projectId === project.id && isOpenSession(s) && ISO_DATE_RE.test(s.date) && s.date >= today,
  );
  if (hasFutureSession) return true;
  return consultations.some(
    (c) => c.projectId === project.id && isOpenConsultation(c) && ISO_DATE_RE.test(c.date) && c.date >= today,
  );
}

// Уже есть конкретная просрочка (просроченный next step / сессия /
// консультация) — эти случаи уже показываются собственными, более
// конкретными карточками (overdueProjects/overdueEntries), дублировать их
// мягким «застоем» нельзя: «конкретная просрочка > запланированное
// действие > мягкий застой» (M4, п. 5).
export function hasOverdueWork(project: Project, sessions: Session[], consultations: Consultation[], today: string): boolean {
  if (project.nextActionText.trim() !== '' && project.nextActionDate !== null && project.nextActionDate < today) return true;
  const hasOverdueSession = sessions.some(
    (s) => s.projectId === project.id && isOpenSession(s) && ISO_DATE_RE.test(s.date) && s.date < today,
  );
  if (hasOverdueSession) return true;
  return consultations.some(
    (c) => c.projectId === project.id && isOpenConsultation(c) && ISO_DATE_RE.test(c.date) && c.date < today,
  );
}

// ===================== ПРОИЗВОДНЫЙ ТАЙМЛАЙН «ЗАПРОС → ПЕРВАЯ СЕССИЯ» =====================
export type PipelineSegmentKey = 'moodboard' | 'sketch' | 'consultation' | 'session';

export interface ProjectPipelineSegment {
  key: PipelineSegmentKey;
  targetDate: string; // yyyy-mm-dd
}

function parseProjectCreatedDate(createdDate: string): Date | null {
  const dateOnly = toDateOnly(createdDate);
  if (!isValidISODate(dateOnly)) return null;
  return new Date(`${dateOnly}T00:00:00.000Z`);
}

function addCalendarMonthsClamped(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const targetFirst = new Date(Date.UTC(year, month + months, 1));
  const targetLastDay = new Date(Date.UTC(targetFirst.getUTCFullYear(), targetFirst.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(targetFirst.getUTCFullYear(), targetFirst.getUTCMonth(), Math.min(day, targetLastDay)));
}

export function getProjectPipelineSegments(project: Project): ProjectPipelineSegment[] | null {
  const amount = project.firstSessionWindowAmount;
  const unit = project.firstSessionWindowUnit;
  if (amount === null || amount === undefined || unit === null || unit === undefined) return null;
  if (!Number.isFinite(amount) || amount < 0) return null;

  const start = parseProjectCreatedDate(project.createdDate);
  if (!start) return null;

  const target = unit === 'week'
    ? new Date(start.getTime() + amount * 7 * 24 * 60 * 60 * 1000)
    : addCalendarMonthsClamped(start, amount);
  const meeting = project.preSessionMeeting ?? 'consultation';
  const keys: PipelineSegmentKey[] = meeting === 'none'
    ? ['moodboard', 'sketch', 'session']
    : ['moodboard', 'sketch', 'consultation', 'session'];
  const totalMs = target.getTime() - start.getTime();

  return keys.map((key, index) => {
    const isLast = index === keys.length - 1;
    const offset = isLast ? totalMs : Math.floor((totalMs * (index + 1)) / keys.length);
    const targetDate = new Date(start.getTime() + offset).toISOString().slice(0, 10);
    return { key, targetDate };
  });
}

// ===================== ФИЛЬТРЫ И СОРТИРОВКА ПРОЕКТОВ =====================
export type ProjectSortMode = 'lastActive' | 'added' | 'name';

export const PROJECT_SORT_MODES: { key: ProjectSortMode; label: string }[] = [
  { key: 'lastActive', label: 'Последний активный' },
  { key: 'added', label: 'Новые' },
  { key: 'name', label: 'А–Я' },
];

// Записи, по которым считается «последний активный» — те же аргументы, что
// уже принимает getProjectLastActivityDate: для клиентского проекта это
// client.sessions/client.consultations, для проекта Мастерской —
// project.sessions/project.consultations.
export interface ProjectActivityContext {
  sessions: Session[];
  consultations: Consultation[];
  today: string;
}

// «Последний активный» — по getProjectLastActivityDate выше, то есть по той
// самой производной «последней активности», которой уже пользуется застой
// (staleProjects): движение этапа/статуса/следующего шага
// (lastMeaningfulActivityAt), плюс проведённые сессии и записи истории
// консультаций. Отдельного второго определения «активности» специально не
// заводим — иначе сортировка и напоминания начали бы расходиться в том, что
// считать движением.
//
// activity === null (вызов без списка записей) — деградация до одного
// lastMeaningfulActivityAt: порядок останется осмысленным, просто без учёта
// проведённых встреч.
//
// Проекты, о которых не известно ни одного достоверного сигнала (легаси —
// lastMeaningfulActivityAt появился позже, см. normalizeProject), уходят в
// конец: ставить их наверх значило бы выдумать за них дату.
export function sortProjects(
  projects: Project[],
  mode: ProjectSortMode,
  activity: ProjectActivityContext | null = null,
): Project[] {
  const list = projects.slice();
  if (mode === 'name') {
    return list.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'ru'));
  }
  if (mode === 'added') {
    return list.sort((a, b) => (b.createdDate || '').localeCompare(a.createdDate || ''));
  }
  const lastActive = (p: Project): string | null =>
    activity
      ? getProjectLastActivityDate(p, activity.sessions, activity.consultations, activity.today)
      : p.lastMeaningfulActivityAt
        ? toDateOnly(p.lastMeaningfulActivityAt)
        : null;
  const keys = new Map(list.map((p) => [p.id, lastActive(p)] as const));
  return list.sort((a, b) => {
    const aKey = keys.get(a.id) ?? null;
    const bKey = keys.get(b.id) ?? null;
    if (aKey !== bKey) {
      if (aKey === null) return 1;
      if (bKey === null) return -1;
      return bKey.localeCompare(aKey);
    }
    // Внутри одного дня — по точному timestamp движения (у даты записи его
    // нет, только день), и лишь потом по дате создания.
    const byMoment = (b.lastMeaningfulActivityAt || '').localeCompare(a.lastMeaningfulActivityAt || '');
    return byMoment !== 0 ? byMoment : (b.createdDate || '').localeCompare(a.createdDate || '');
  });
}

export interface ProjectFilters {
  // null — «Все».
  category: ProjectCategory | null;
  state: ProjectState | null;
  area: string | null;
}

export const EMPTY_PROJECT_FILTERS: ProjectFilters = { category: null, state: null, area: null };

export function projectFiltersActive(filters: ProjectFilters): boolean {
  return filters.category !== null || filters.state !== null || filters.area !== null;
}

export function filterProjects(projects: Project[], filters: ProjectFilters): Project[] {
  return projects.filter((p) => {
    if (filters.category && p.category !== filters.category) return false;
    if (filters.state && p.state !== filters.state) return false;
    if (filters.area && p.area !== filters.area) return false;
    return true;
  });
}

// View-model grouping for project lists. Empty area gets a stable readable
// bucket; project objects are reused without mutation and group order follows
// first appearance in the input list.
export interface ProjectAreaGroup {
  area: string;
  projects: Project[];
}

export function groupProjectsByArea(projects: Project[]): ProjectAreaGroup[] {
  const groups = new Map<string, Project[]>();
  for (const project of projects) {
    const area = project.area || 'Не задано';
    const bucket = groups.get(area);
    if (bucket) bucket.push(project);
    else groups.set(area, [project]);
  }
  return Array.from(groups, ([area, groupedProjects]) => ({ area, projects: groupedProjects }));
}

// ===================== ПАПКИ ПРОЕКТОВ (view-model) =====================
export type ProjectFolderType = 'client' | 'master';

export interface ProjectFolder {
  id: string;
  title: string;
  type: ProjectFolderType;
  clientId: string | null;
  projects: Project[];
  projectCount: number;
}

const MASTER_FOLDER_TITLE = 'Проекты мастера';
// Ссылка на клиента есть (project.clientId !== null), но самого клиента нет
// в clients — данные не трогаем и не переносим проект в «Проекты мастера»,
// а даём ему собственную fallback-папку с тем же стабильным id, что была бы
// у настоящей папки этого клиента.
const MISSING_CLIENT_FOLDER_TITLE = 'Клиент не найден';

// today — yyyy-mm-dd (см. localISO в buildReminders.ts) — задаёт «сейчас»
// для сортировки папок по активности (M6, см. ниже).
export function buildProjectFolders(projects: Project[], clients: Client[], today: string): ProjectFolder[] {
  const projectsByClientId = new Map<string, Project[]>();
  const masterProjects: Project[] = [];
  const unknownClientIdsInFirstAppearanceOrder: string[] = [];
  const seenClientIds = new Set<string>();

  for (const project of projects) {
    if (project.clientId === null) {
      masterProjects.push(project);
      continue;
    }

    const clientId = project.clientId;
    const bucket = projectsByClientId.get(clientId);
    if (bucket) bucket.push(project);
    else projectsByClientId.set(clientId, [project]);

    if (!seenClientIds.has(clientId)) {
      seenClientIds.add(clientId);
      if (!clients.some((c) => c.id === clientId)) unknownClientIdsInFirstAppearanceOrder.push(clientId);
    }
  }

  const clientFolders: ProjectFolder[] = [];

  // Известные клиентские папки — у КАЖДОГО клиента есть папка (M6), даже
  // без единого проекта — «Мастерская» больше не прячет клиента, пока он не
  // завёл первый проект, это и есть его будущее место для проектов с
  // момента создания клиента.
  for (const client of clients) {
    const clientProjects = projectsByClientId.get(client.id) ?? [];
    clientFolders.push({
      id: `client:${client.id}`,
      title: `${client.name} ${client.surname}`.trim(),
      type: 'client',
      clientId: client.id,
      projects: clientProjects,
      projectCount: clientProjects.length,
    });
  }

  // Fallback-папки для ссылок на отсутствующих клиентов — по первому
  // появлению соответствующего clientId в projects. В отличие от известных
  // клиентов выше, эта ветка по построению никогда не пуста (unknownClientId
  // попадает сюда только вместе с хотя бы одним проектом), continue не нужен.
  for (const clientId of unknownClientIdsInFirstAppearanceOrder) {
    const clientProjects = projectsByClientId.get(clientId) ?? [];
    clientFolders.push({
      id: `client:${clientId}`,
      title: MISSING_CLIENT_FOLDER_TITLE,
      type: 'client',
      clientId,
      projects: clientProjects,
      projectCount: clientProjects.length,
    });
  }

  // Сортировка клиентских папок (M6): просрочка → запланированное → есть
  // проекты без активности → ни одного проекта — в самом конце. Та же логика
  // «просрочка/запланировано», что уже использует staleProjects
  // (reminders/buildReminders.ts) для отдельных проектов — здесь папка
  // получает ранг лучшего из своих проектов. Сортировка stable — порядок
  // внутри одного ранга не меняется (для клиентов — порядок clients, как и
  // раньше).
  const allSessions = [...clients.flatMap((c) => c.sessions), ...projects.flatMap((p) => p.sessions)];
  const allConsultations = [...clients.flatMap((c) => c.consultations), ...projects.flatMap((p) => p.consultations)];
  const folderRank = (folder: ProjectFolder): number => {
    if (folder.projects.length === 0) return 3;
    if (folder.projects.some((p) => hasOverdueWork(p, allSessions, allConsultations, today))) return 0;
    if (folder.projects.some((p) => hasScheduledWork(p, allSessions, allConsultations, today))) return 1;
    return 2;
  };
  const sortedClientFolders = clientFolders
    .map((folder, index) => ({ folder, index }))
    .sort((a, b) => folderRank(a.folder) - folderRank(b.folder) || a.index - b.index)
    .map(({ folder }) => folder);

  const folders: ProjectFolder[] = [...sortedClientFolders];
  // «Проекты мастера» — всегда последняя, визуально равноправная папка
  // (не участвует в сортировке по активности выше — это не «клиент без
  // проекта», а агрегат всех client-less проектов, его место в конце —
  // осознанный, не активностный выбор).
  if (masterProjects.length > 0) {
    folders.push({
      id: 'master',
      title: MASTER_FOLDER_TITLE,
      type: 'master',
      clientId: null,
      projects: masterProjects,
      projectCount: masterProjects.length,
    });
  }

  return folders;
}
