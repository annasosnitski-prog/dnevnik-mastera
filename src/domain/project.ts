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
// ProjectStatus — общий путь проекта: работаем → закончили, плюс пауза как
// ручной, обратимый шаг в сторону. Заменил прежний семишаговый ProjectStage
// ('idea' | 'inquiry' | 'planning' | 'booked' | 'in_progress' | 'healing' |
// 'completed'): половина тех этапов («Идея», «Запрос», «Подготовка») на
// практике не отличались друг от друга, а «Записан»/«В работе» — это одно и
// то же «проект в работе». Предоплата как отдельный статус не прижилась: в
// модели нет факта «предоплата получена», только план действия
// (nextActionType), поэтому весь проект стартует сразу «Активен» — старые
// записи не мигрируются бережно, см. normalizeProject.
//
// 'healing' здесь больше нет: заживление — не статус проекта, а цикл,
// который считается от сессии (см. reminders/healingCycle.ts и
// Session.isLastSession) и не завязан на то, последняя эта сессия или нет —
// напоминание «как заживление?» уже год как всплывает после ЛЮБОЙ
// выполненной сессии, а project.status раньше флипался в 'healing' только
// на последней. Проект остаётся «Активен», пока цикл заживления не закрыт
// фото/переходит в 'completed' — см. withHealingGallery ниже.
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
export type ProjectStatus = 'active' | 'paused' | 'completed';
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
// 'paused' стоит сразу после 'active' намеренно: выполненная сессия (любая,
// не только последняя — см. withStatusAfterDoneSession) целится обратно в
// 'active' и поэтому не расколдовывает паузу сама по себе (индекс 'active'
// не больше индекса 'paused'), а вот добавление фото заживления (цель —
// 'completed') — более позднее по порядку событие, чем пауза, поэтому
// проходит сквозь неё.
export const PROJECT_STATUSES: { key: ProjectStatus; label: string }[] = [
  { key: 'active', label: 'Активен' },
  { key: 'paused', label: 'Пауза' },
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

// ===================== МУДБОРД =====================
// Подборка, которую составляет мастер для клиента — отличается от
// Consultation.photos (то, что клиент сам принёс/показал) и от
// Project.photos (общая корзина референсов проекта): мудборд — это уже
// отобранный и упорядоченный набор с собственным статусом жизненного
// цикла (отправлен клиенту? одобрен?). Живёт на самом Project (вариант А
// разбора «куда расти ИНКЕ» — см. docs/DATA_LAYER_PLAN.md), а не в
// отдельном сторе: так синк/бэкап/удаление достаются бесплатно, а
// собственный `id` ниже оставляет дверь для выноса в отдельный стор
// открытой, если фото станет действительно много (см. Шаг 7 синка,
// docs/SYNC_PLAN.md — тяжёлые прогоны, обрывающиеся на iOS).
export type MoodboardItemKind = 'photo' | 'link' | 'color';

export interface MoodboardItem {
  id: string;
  kind: MoodboardItemKind;
  // 'photo': data URL (как Project.photos). 'link': внешний URL (Pinterest,
  // Instagram). 'color': hex-код. Ровно одно из трёх полей осмысленно для
  // данного kind — остальные два у него пустые строки, не undefined,
  // чтобы форма могла редактировать любой item без ветвления по типу.
  src: string;
  url: string;
  hex: string;
  note: string;
}

// draft — мастер ещё собирает; sent — отправлен клиенту, ждём реакции;
// approved — клиент согласовал, можно двигаться дальше (сессия/сценарий);
// rework — клиент попросил переделать, не тупик: мастер правит items и
// снова переводит в sent тем же мудбордом, не начиная новый.
export type MoodboardStatus = 'draft' | 'sent' | 'approved' | 'rework';

export const MOODBOARD_STATUSES: { key: MoodboardStatus; label: string }[] = [
  { key: 'draft', label: 'Черновик' },
  { key: 'sent', label: 'Отправлен' },
  { key: 'approved', label: 'Одобрен' },
  { key: 'rework', label: 'На доработку' },
];

export interface Moodboard {
  id: string;
  items: MoodboardItem[]; // порядок массива = порядок на доске
  caption: string; // сопроводительный текст для клиента
  status: MoodboardStatus;
  sentAt: string | null;
  approvedAt: string | null;
  updatedAt: string; // ISO timestamp последнего изменения items/caption
}

// Смена статуса мудборда — sentAt/approvedAt проставляются вместе со своим
// статусом (факт пишется в момент перехода, тот же принцип, что у
// Consultation.history), остальные поля не трогаются. Тот же единый вход
// для ручной смены статуса (мастер сама отметила «Одобрен»/«На доработку»)
// и для «отметить отправленным» после успешной отдачи через системное
// «Поделиться» — см. lib/moodboardShare.ts.
export function withMoodboardStatus(moodboard: Moodboard, status: MoodboardStatus): Moodboard {
  const now = new Date().toISOString();
  return {
    ...moodboard,
    status,
    sentAt: status === 'sent' ? now : moodboard.sentAt,
    approvedAt: status === 'approved' ? now : moodboard.approvedAt,
    updatedAt: now,
  };
}

// null = мудборд ещё не заводили — обычное состояние проекта без него,
// отличное от Moodboard с пустым items (тот уже создан, но пуст).
export function hasMoodboardContent(moodboard: Moodboard | null): boolean {
  return moodboard !== null && moodboard.items.length > 0;
}

// ── Мост к SessionPhotos ────────────────────────────────────────────
// Форма проекта заводит мудборд прямо там, где уже есть «Добавить фото»
// (то же место, что у Project.photos/healingPhotos) — SessionPhotos знает
// только про string[], а мудборд хранит MoodboardItem[] со своим kind.
// Эти две функции — мост в обе стороны, тот же принцип, что у
// reconcileHealingPhotos выше: чужой (не-photo) items не трогаем.

// В форму — только src фотографий, в их порядке на доске.
export function moodboardPhotoSrcs(moodboard: Moodboard | null): string[] {
  return moodboard ? moodboard.items.filter((it) => it.kind === 'photo').map((it) => it.src) : [];
}

// Из формы — SessionPhotos отдаёт новый string[] целиком (add/remove/reorder
// неразличимы дальше первого расхождения). Сверяем со старыми photo-items по
// src, чтобы сохранить id/note там, где фото не поменялось, и заводим новый
// item только для реально нового src — остальные (link/color) items остаются
// на своих местах, этой правкой не задеты.
export function withMoodboardPhotoSrcs(moodboard: Moodboard | null, srcs: string[]): Moodboard | null {
  const otherItems = moodboard ? moodboard.items.filter((it) => it.kind !== 'photo') : [];
  const remaining = moodboard ? moodboard.items.filter((it) => it.kind === 'photo') : [];
  const photoItems: MoodboardItem[] = srcs.map((src) => {
    const i = remaining.findIndex((it) => it.src === src);
    if (i !== -1) return remaining.splice(i, 1)[0];
    return { id: crypto.randomUUID(), kind: 'photo', src, url: '', hex: '', note: '' };
  });
  const items = [...otherItems, ...photoItems];
  // Пустой мудборд без единого признака жизни (ни items, ни подписи, ни
  // сдвинутого статуса) — то же «не заведён», что и moodboard===null, а не
  // пустая заведённая карточка (см. hasMoodboardContent выше).
  if (items.length === 0 && !moodboard?.caption && (!moodboard || moodboard.status === 'draft')) {
    return null;
  }
  return {
    id: moodboard?.id ?? crypto.randomUUID(),
    items,
    caption: moodboard?.caption ?? '',
    status: moodboard?.status ?? 'draft',
    sentAt: moodboard?.sentAt ?? null,
    approvedAt: moodboard?.approvedAt ?? null,
    updatedAt: new Date().toISOString(),
  };
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
//  - выполненная сессия (любая, включая последнюю) → 'active' (см.
//    commitSession/toggleSessionDone в TattoDiary.tsx и
//    withStatusAfterDoneSession ниже);
//  - первое фото в галерее заживления проекта → 'completed'.
// 'paused' в этот список не входит — туда и обратно мастер переводит проект
// сама, через select в форме (без ограничения «только вперёд», см. форму).
// Благодаря его месту в PROJECT_STATUSES выполненная сессия (цель —
// 'active') такую паузу не снимает сама по себе, а вот фото заживления
// (цель — 'completed') — снимает, потому что стоит в порядке дальше её.
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

// Куда выполненная сессия двигает проект — всегда «Активен», последняя она
// или нет: работа над проектом идёт дальше (следующая сессия, коррекция или
// просто цикл заживления текущей), а «Активные» — это «есть что делать», не
// «первая встреча ещё не прошла». Заживление больше не статус проекта, а
// цикл, который считается от САМОЙ сессии и не блокирует остальную работу
// над проектом (см. reminders/healingCycle.ts и Session.isLastSession — та
// самая «последняя», которая раньше отправляла проект в статус
// «Заживление», теперь решает только развилку внутри цикла).
export function withStatusAfterDoneSession(project: Project): Project {
  return withAdvancedStatus(project, 'active');
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
  title: string; // project name, e.g. "Дракон в стиле джапан"
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
  area: string; // "Место" — constrained by PROJECT_BODY_AREAS in project UI
  style: string; // "Техника и стиль"
  generalNotes: string; // "Общие заметки"
  feeling: string; // "Чувство/ощущение"
  creative: string; // "Креатив"
  inspirationSources: string; // "Источники вдохновения"
  photos: string[];
  // Отобранная и упорядоченная подборка для клиента — см. Moodboard выше.
  // null, пока мастер её не завела (в т.ч. все проекты, созданные до этого
  // поля — миграции нет, см. normalizeProject).
  moodboard: Moodboard | null;
  // Галерея заживления — фото зажившей работы (см. HealingPhoto выше).
  // Первое добавленное фото закрывает цикл заживления и переводит проект в
  // 'completed' (см. reminders/healingCycle.ts).
  healingPhotos: HealingPhoto[];
  createdDate: string;
  // Optional at the raw/in-memory type boundary so old object literals stay
  // source-compatible. normalizeProject always materializes explicit defaults.
  firstSessionWindowAmount?: number | null;
  firstSessionWindowUnit?: FirstSessionWindowUnit | null;
  // Точная дата первой сессии — альтернатива amount/unit выше, для мастера,
  // которой удобнее сразу указать конкретный день, а не окно (например,
  // клиент уже согласовал дату голосом/в переписке). Взаимоисключающе с
  // firstSessionWindowAmount/Unit — форма пишет ровно одно из двух, никогда
  // оба сразу (см. NewProjectSheet). getProjectPipelineSegments в
  // projectSelectors.ts предпочитает эту дату, если она задана.
  firstSessionExactDate?: string | null;
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
