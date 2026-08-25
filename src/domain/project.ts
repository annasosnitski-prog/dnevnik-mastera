// Доменный тип проекта, его статусные union-типы и label-константы — тот же
// существующий тип, что и раньше (вынесен из TattoDiary.tsx в PR 2).

import type { Session } from './session';
import type { Consultation } from './consultation';

// A standalone sketch/portfolio idea for «Творческая мастерская» — not tied
// to any client (unlike Consultation, which lives inside a Client). Shares
// the consultation's own field set (same brief-writing form) since it's the
// same kind of thinking — mood, references, technique — just without a
// person attached to it yet; the one field it adds is its own colour tag,
// since without a client there's no `client.color` to inherit.
export type ProjectCategory = 'tattoo' | 'drawing' | 'collab' | 'other';

export const PROJECT_CATEGORIES: { key: ProjectCategory; label: string }[] = [
  { key: 'tattoo', label: 'Тату' },
  { key: 'drawing', label: 'Рисунок' },
  { key: 'collab', label: 'Коллаба' },
  { key: 'other', label: 'Другое' },
];

// Project.area remains a plain string for backwards compatibility. This list
// constrains only the project editor/filter UI; Session.area and
// Consultation.area remain free text.
export const PROJECT_BODY_AREAS: { key: string; label: string }[] = [
  { key: 'Спина', label: 'Спина' },
  { key: 'Нога', label: 'Нога' },
  { key: 'Рука', label: 'Рука' },
  { key: 'Грудь', label: 'Грудь' },
  { key: 'Живот', label: 'Живот' },
  { key: 'Рёбра', label: 'Рёбра' },
  { key: 'Лобок', label: 'Лобок' },
  { key: 'Солнечное сплетение', label: 'Солнечное сплетение' },
  { key: 'Лопатка', label: 'Лопатка' },
  { key: 'Трапеция', label: 'Трапеция' },
  { key: 'Кисть', label: 'Кисть' },
  { key: 'Стопа', label: 'Стопа' },
  { key: 'Голень', label: 'Голень' },
  { key: 'Икра', label: 'Икра' },
  { key: 'Плечо', label: 'Плечо' },
  { key: 'Предплечье', label: 'Предплечье' },
  { key: 'Бедро', label: 'Бедро' },
  { key: 'Поясница', label: 'Поясница' },
  { key: 'Колено', label: 'Колено' },
  { key: 'Лодыжка', label: 'Лодыжка' },
  { key: 'Локоть', label: 'Локоть' },
  { key: 'Пах', label: 'Пах' },
  { key: 'Пальцы', label: 'Пальцы' },
];

// Три независимых параметра статуса вместо одной длинной строки-enum
// (вроде "planning_waiting_client_photo_overdue") — где проект находится,
// может ли он сейчас двигаться, и кто должен действовать, читаются по
// отдельности и комбинируются свободно.
//
// ProjectStatus — общий путь проекта: работаем → заживаем → закончили, плюс
// пауза как ручной, обратимый шаг в сторону. Заменил прежний семишаговый
// ProjectStage ('idea' | 'inquiry' | 'planning' | 'booked' | 'in_progress' |
// 'healing' | 'completed'): половина тех этапов («Идея», «Запрос»,
// «Подготовка») на практике не отличались друг от друга, а «Записан»/
// «В работе» — это одно и то же «проект в работе». Предоплата как отдельный
// статус не прижилась: в модели нет факта «предоплата получена», только
// план действия (nextActionType), поэтому весь проект стартует сразу
// «Активен» — старые записи не мигрируются бережно, см. normalizeProject.
//
// 'paused' — ручной, обратимый статус (мастер сама ставит и снимает через
// форму), а не шаг пайплайна: см. его положение в PROJECT_STATUSES и
// комментарий у withAdvancedStatus про то, как это сочетается с «только
// вперёд».
//
// ProjectState (ниже) — отдельная, ещё не убранная из модели ось с тем же
// смыслом паузы/отмены/архива (см. её собственный комментарий) — до чистки
// системы напоминаний, которая на неё опирается, обе оси временно
// сосуществуют.
export type ProjectStatus = 'active' | 'paused' | 'healing' | 'completed';
// Отдельная ось, которую ещё предстоит убрать из модели вместе с переделкой
// системы напоминаний (buildReminders.ts фильтрует активные проекты по
// этому полю) — видимый статус паузы у проекта теперь ProjectStatus.paused
// выше, это поле больше не должно управлять UI.
export type ProjectState = 'active' | 'paused' | 'cancelled' | 'archived';
export type ProjectWaitingFor = 'master' | 'client' | 'external' | 'none';
export type ProjectPriority = 'urgent' | 'important' | 'normal';
export type FirstSessionWindowUnit = 'week' | 'month';
export type PreSessionMeeting = 'consultation' | 'none';

// Фиксированный список шагов «окна на первую сессию» (§11 pipeline-документа)
// — не дедлайн всего проекта, а срок, за который должна состояться ПЕРВАЯ
// встреча с клиентом, отсчитанный от createdDate (см. getProjectPipelineSegments
// в projectSelectors.ts). Список закрытый, с фиксированным шагом — не
// свободное число. `key` — устойчивая строка для value одного <select>,
// чтобы форме не нужно было самой кодировать пару amount+unit в строку.
export interface FirstSessionWindowOption {
  key: string;
  amount: number;
  unit: FirstSessionWindowUnit;
  label: string;
}

function monthOption(amount: number): FirstSessionWindowOption {
  const label = amount === 1 ? '1 месяц' : amount < 5 ? `${amount} месяца` : `${amount} месяцев`;
  return { key: `${amount}-month`, amount, unit: 'month', label };
}

export const FIRST_SESSION_WINDOW_OPTIONS: FirstSessionWindowOption[] = [
  { key: '1-week', amount: 1, unit: 'week', label: 'Неделя' },
  { key: '2-week', amount: 2, unit: 'week', label: '2 недели' },
  { key: '3-week', amount: 3, unit: 'week', label: '3 недели' },
  ...Array.from({ length: 12 }, (_, i) => monthOption(i + 1)),
];

export function findFirstSessionWindowOption(
  amount: number | null | undefined,
  unit: FirstSessionWindowUnit | null | undefined,
): FirstSessionWindowOption | null {
  if (amount == null || unit == null) return null;
  return FIRST_SESSION_WINDOW_OPTIONS.find((o) => o.amount === amount && o.unit === unit) ?? null;
}

// Порядок массива — это и порядок движения проекта вперёд, на него опирается
// withAdvancedStatus ниже. Менять порядок = менять смысл «только вперёд».
// 'paused' стоит сразу после 'active' намеренно: обычная сессия целится
// обратно в 'active' и поэтому не расколдовывает паузу сама по себе (индекс
// 'active' не больше индекса 'paused'), а вот выполнение ПОСЛЕДНЕЙ сессии
// (цель — 'healing') и добавление фото заживления (цель — 'completed') —
// более поздние по порядку события, чем пауза, поэтому проходят сквозь неё.
export const PROJECT_STATUSES: { key: ProjectStatus; label: string }[] = [
  { key: 'active', label: 'Активен' },
  { key: 'paused', label: 'Пауза' },
  { key: 'healing', label: 'Ожидает заживления' },
  { key: 'completed', label: 'Завершён' },
];

export const PROJECT_STATES: { key: ProjectState; label: string }[] = [
  { key: 'active', label: 'Активен' },
  { key: 'paused', label: 'Пауза' },
  { key: 'cancelled', label: 'Отменён' },
  { key: 'archived', label: 'Архив' },
];

export const PROJECT_WAITING_FOR: { key: ProjectWaitingFor; label: string }[] = [
  { key: 'master', label: 'Мастера' },
  { key: 'client', label: 'Клиента' },
  { key: 'external', label: 'Внешнего' },
  { key: 'none', label: 'Никого' },
];

export const PROJECT_PRIORITIES: { key: ProjectPriority; label: string }[] = [
  { key: 'urgent', label: 'Срочно' },
  { key: 'important', label: 'Важно' },
  { key: 'normal', label: 'Обычный' },
];

// Сколько встреч предполагает проект — задаётся мастером при создании.
// Это НЕ точное количество сессий: на старте мастер часто сама не знает,
// сколько их понадобится, но всегда знает «одна встреча» или «больше одной».
// От этого зависит только одно — спрашивать ли при завершении сессии «это
// последняя?»: у 'single' ответ известен заранее (единственная сессия проекта
// по определению последняя), у 'multiple' и null его каждый раз подтверждает
// мастер вручную (см. Session.isLastSession и reminders/healingCycle.ts).
// null — «не задано»: так выглядят проекты, созданные до появления поля.
export type SessionsPlan = 'single' | 'multiple' | null;

export const SESSIONS_PLANS: { key: Exclude<SessionsPlan, null>; label: string }[] = [
  { key: 'single', label: 'Одна встреча' },
  { key: 'multiple', label: 'Больше одной' },
];

// Фото зажившей работы — живут на ПРОЕКТЕ, а не на сессии: заживает работа
// целиком, а не каждая сессия по отдельности, и снимок нужен один на проект
// (портфолио), даже если сессий было пять. Заменяет прежний флаг
// Session.healed, см. его @deprecated-пометку в domain/session.ts.
export interface HealingPhoto {
  id: string;
  url: string; // data URL, как в остальных *.photos полях
  addedDate: string; // ISO yyyy-mm-dd
  // Обложка проекта среди фото заживления. Не более одной — за инвариант
  // отвечает withHealingPhoto/withHealingCover ниже, а не вызывающий код.
  isCover: boolean;
}

// Галерея редактируется тем же SessionPhotos, что и остальные фото в
// приложении, а он знает только про массив data-URL. Эта функция — мост
// обратно: сопоставляет присланный список url с уже существующими
// HealingPhoto, чтобы у переживших правку снимков сохранились их id и дата
// добавления, а новым завелись свои.
//
// Совпадение ищется по url и КОНСЬЮМИТСЯ (каждый существующий снимок
// сопоставляется не больше одного раза): если мастер добавит второй раз
// ровно тот же файл, второй экземпляр получит собственный id, а не станет
// дублем чужого — иначе в галерее оказались бы две записи с одним id.
//
// Обложка нормализуется тут же, одним инвариантом на всю модель: ровно одна,
// и если после правки не осталось ни одной помеченной — ею становится первый
// снимок. Так галерея из одного фото не остаётся без обложки, а удаление
// обложки не оставляет галерею без неё.
export function reconcileHealingPhotos(existing: HealingPhoto[], urls: string[], today: string): HealingPhoto[] {
  const remaining = [...existing];
  const next = urls.map((url) => {
    const i = remaining.findIndex((p) => p.url === url);
    if (i !== -1) return remaining.splice(i, 1)[0];
    return { id: crypto.randomUUID(), url, addedDate: today, isCover: false };
  });
  if (!next.length) return next;
  const coverIndex = next.findIndex((p) => p.isCover);
  const cover = coverIndex === -1 ? 0 : coverIndex;
  return next.map((p, i) => ({ ...p, isCover: i === cover }));
}

// Структурный тип «следующего шага» — чтобы будущая система (напоминания,
// автоматизация) понимала СМЫСЛ действия без распознавания свободного текста
// nextActionText. Дополняет его, не заменяет: nextActionText/nextActionDate
// остаются как были. null = тип не выбран — это валидное, а не временное
// состояние (не подставляется автоматически, см. normalizeProject).
export type NextActionType =
  | 'contact_client'
  | 'collect_information'
  | 'prepare_design'
  | 'schedule_consultation'
  | 'schedule_session'
  | 'prepare_session'
  | 'check_healing'
  | 'schedule_next_session'
  | 'review_project'
  | 'other';

export const NEXT_ACTION_TYPES: { key: NextActionType; label: string }[] = [
  { key: 'contact_client', label: 'Связаться с клиентом' },
  { key: 'collect_information', label: 'Собрать информацию' },
  { key: 'prepare_design', label: 'Подготовить дизайн' },
  { key: 'schedule_consultation', label: 'Назначить консультацию' },
  { key: 'schedule_session', label: 'Назначить сессию' },
  { key: 'prepare_session', label: 'Подготовиться к сессии' },
  { key: 'check_healing', label: 'Проверить заживление' },
  { key: 'schedule_next_session', label: 'Назначить следующую сессию' },
  { key: 'review_project', label: 'Проверить проект' },
  { key: 'other', label: 'Другое' },
];

// Приводит next-step поля к валидному сочетанию перед записью в проект:
// пустой текст обнуляет и дату, и тип. Без этого overdueProjects
// (reminders/buildReminders.ts) — который смотрит на nextActionDate — мог бы
// завести пустую просроченную карточку («Следующий шаг: —») для проекта, у
// которого текст уже стёрт, а дата/тип остались от прежнего шага
// (overdueProjects проверяет nextActionText и сам, второй независимой
// защитой — на случай старых/повреждённых записей, до которых эта функция
// на сохранении не дотянулась).
export function resolveNextStep(
  text: string,
  date: string | null,
  type: NextActionType | null,
): { nextActionText: string; nextActionDate: string | null; nextActionType: NextActionType | null } {
  const trimmed = text.trim();
  if (!trimmed) return { nextActionText: '', nextActionDate: null, nextActionType: null };
  return { nextActionText: trimmed, nextActionDate: date, nextActionType: type };
}

// Авто-переход статуса проекта — ТОЛЬКО ВПЕРЁД по порядку PROJECT_STATUSES.
// Никогда не откатывает назад (не трогает, если статус уже на целевом или
// дальше). Кто и куда двигает проект автоматически:
//  - выполненная сессия → 'active' (см. commitSession/toggleSessionDone в
//    TattoDiary.tsx);
//  - вход в цикл заживления после последней сессии → 'healing';
//  - первое фото в галерее заживления проекта → 'completed'.
// 'paused' в этот список не входит — туда и обратно мастер переводит проект
// сама, через select в форме (без ограничения «только вперёд», см. форму).
// Благодаря его месту в PROJECT_STATUSES обычная выполненная сессия (цель —
// 'active') такую паузу не снимает сама по себе, а вот последняя сессия
// (цель — 'healing') и фото заживления (цель — 'completed') — снимают,
// потому что стоят в порядке дальше её.
//
// Возвращает НОВЫЙ объект проекта, а не пишет в стор: продвижение статуса
// должно уехать в базу тем же самым сохранением, что и сама запись. Раньше
// это были два отдельных saveProject подряд, и второй читал projects из
// ещё не обновившегося React-состояния — то есть перезаписывал проект
// снимком БЕЗ только что добавленной сессии и стирал её. Для клиентских
// сессий это не проявлялось (они лежали в другом сторе), а сессия в проекте
// без клиента молча пропадала после сохранения.
export function withAdvancedStatus(project: Project, target: ProjectStatus): Project {
  const current = PROJECT_STATUSES.findIndex((s) => s.key === project.status);
  const next = PROJECT_STATUSES.findIndex((s) => s.key === target);
  if (next < 0 || next <= current) return project;
  return { ...project, status: target };
}

// Куда выполненная сессия двигает проект. Последняя — в «Заживление»: работа
// закончена, дальше только цикл заживления (см. reminders/healingCycle.ts).
// Любая другая — в «Активен»: проект в работе, впереди ещё сессии.
//
// «Последняя» определяется тем же правилом, что и в самом цикле: у проекта
// «одна встреча» единственная сессия последняя по определению, у остальных
// это подтверждение мастера на сессии (см. Session.isLastSession).
export function withStatusAfterDoneSession(project: Project, isLastSession: boolean): Project {
  return withAdvancedStatus(project, project.sessionsPlan === 'single' || isLastSession ? 'healing' : 'active');
}

// Правка галереи заживления вместе с автопереходом статуса — единственная
// точка, где эти две вещи связаны, чтобы «добавила фото» и «проект завершён»
// не разъезжались по разным местам сохранения.
//
// Первое фото закрывает цикл заживления: работа зажила, снимок для портфолио
// есть, двигаться проекту больше некуда → 'completed'. Опустевшая галерея
// статус НЕ откатывает — withAdvancedStatus ходит только вперёд, и удаление
// неудачного кадра не должно «расзавершать» проект (мастер вправе вернуть
// его вручную, как и любой другой откат статуса).
export function withHealingGallery(project: Project, urls: string[], today: string): Project {
  const healingPhotos = reconcileHealingPhotos(project.healingPhotos, urls, today);
  const next = { ...project, healingPhotos };
  return healingPhotos.length > 0 ? withAdvancedStatus(next, 'completed') : next;
}

export interface Project {
  id: string;
  title: string;
  color: string; // legacy marker colour; no longer exposed by project UI
  category: ProjectCategory;
  // null = идея без клиента ("мастерская", независимо от одноимённого
  // clientId===null на ContentEntry — те две вещи не связаны).
  clientId: string | null;
  status: ProjectStatus;
  // «Одна встреча» / «больше одной» — не точное число сессий, см. SessionsPlan.
  sessionsPlan: SessionsPlan;
  state: ProjectState;
  waitingFor: ProjectWaitingFor;
  nextActionText: string;
  nextActionDate: string | null;
  // Структурный тип действия — см. NextActionType выше. Не выведен из
  // nextActionText, задаётся мастером отдельно; null = не выбран.
  nextActionType: NextActionType | null;
  priority: ProjectPriority;
  area: string;
  style: string;
  generalNotes: string;
  feeling: string;
  creative: string;
  inspirationSources: string;
  photos: string[];
  // Галерея заживления — фото зажившей работы (см. HealingPhoto выше).
  // Первое добавленное фото закрывает цикл заживления и переводит проект в
  // 'completed' (см. reminders/healingCycle.ts).
  healingPhotos: HealingPhoto[];
  createdDate: string;
  // Optional at the raw/in-memory type boundary so old object literals stay
  // source-compatible. normalizeProject always materializes explicit defaults.
  firstSessionWindowAmount?: number | null;
  firstSessionWindowUnit?: FirstSessionWindowUnit | null;
  preSessionMeeting?: PreSessionMeeting;
  // «Сессии без клиента» (Этап 3b-доп.) — для проектов без clientId, живут
  // прямо на проекте (свой стор, клиента/календарь не трогают), пока не
  // появится клиент. При привязке клиента к проекту (см. attachClientToProject
  // в App) переезжают в client.sessions с тем же projectId и отсюда чистятся.
  sessions: Session[];
  // «Консультации без клиента» — тот же принцип, что у sessions выше, только
  // для Consultation (иначе client-less проект не мог бы вообще держать
  // консультацию). Переезжают в client.consultations тем же переносом, что
  // и sessions, при привязке клиента к проекту.
  consultations: Consultation[];
  // Когда мастер в последний раз реально продвинула проект (M4) — ISO
  // timestamp. Бампается ТОЛЬКО isMeaningfulProjectChange-полями (см. ниже),
  // не любым сохранением формы (правка текста/фото/заметок — не движение).
  // null — «неизвестно»: новые проекты получают текущий timestamp сразу при
  // создании (TattoDiary.tsx), но старые записи, сохранённые до появления
  // этого поля, НЕ подставляют себе createdDate или текущую дату задним
  // числом — реальная дата последнего движения старого проекта могла быть
  // недавней, просто ещё до того, как это поле начали писать; выдумывать
  // значение значит рисковать ложным «застоем» для проекта, который на
  // самом деле недавно двигался. Первое же значимое изменение (см.
  // isMeaningfulProjectChange) простановит настоящую дату через saveProject.
  // Это лишь одна из нескольких дат-кандидатов: реальная «последняя
  // активность» проекта — производная величина, см.
  // getProjectLastActivityDate в projectSelectors.ts, которая также
  // учитывает выполненные сессии и историю консультаций проекта — так
  // застывание не зависит от того, что кто-то забыл прописать сюда бамп в
  // ещё одном месте сохранения клиента.
  lastMeaningfulActivityAt: string | null;
}

// Какие именно изменения проекта считаются «движением» (M4) — единственное
// место, отвечающее на этот вопрос, вызывается из saveProject
// (TattoDiary.tsx), единственной точки записи в стор проектов. Осознанно
// НЕ включает правки текстовых полей (title/notes/area/style/feeling/
// creative/inspirationSources/photos/color/category/priority) — это
// редактирование содержимого, а не прогресс; иначе любая опечатка сбрасывала
// бы таймер «застывания». Включает: смену статуса/состояния/того-кто-должен-
// действовать (реальный прогресс или явное возобновление из паузы) и любое
// изменение «следующего шага» (текст/дата/тип — мастер осознанно
// спланировала действие).
export function isMeaningfulProjectChange(prev: Project, next: Project): boolean {
  return (
    prev.status !== next.status ||
    prev.state !== next.state ||
    prev.waitingFor !== next.waitingFor ||
    prev.nextActionText !== next.nextActionText ||
    prev.nextActionDate !== next.nextActionDate ||
    prev.nextActionType !== next.nextActionType
  );
}
