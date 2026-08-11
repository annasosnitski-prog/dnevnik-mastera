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

// Три независимых параметра статуса вместо одной длинной строки-enum
// (вроде "planning_waiting_client_photo_overdue") — где проект находится,
// может ли он сейчас двигаться, и кто должен действовать, читаются по
// отдельности и комбинируются свободно.
export type ProjectStage = 'idea' | 'inquiry' | 'planning' | 'booked' | 'in_progress' | 'healing' | 'completed';
export type ProjectState = 'active' | 'paused' | 'cancelled' | 'archived';
export type ProjectWaitingFor = 'master' | 'client' | 'external' | 'none';
export type ProjectPriority = 'urgent' | 'important' | 'normal';

export const PROJECT_STAGES: { key: ProjectStage; label: string }[] = [
  { key: 'idea', label: 'Идея' },
  { key: 'inquiry', label: 'Запрос' },
  { key: 'planning', label: 'Подготовка' },
  { key: 'booked', label: 'Записан' },
  { key: 'in_progress', label: 'В работе' },
  { key: 'healing', label: 'Заживление' },
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
  | 'receive_deposit'
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
  { key: 'receive_deposit', label: 'Получить предоплату' },
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

export interface Project {
  id: string;
  title: string; // project name, e.g. "Дракон в стиле джапан"
  color: string; // marker colour, chosen at creation — see MarkerColorPalette
  category: ProjectCategory;
  // null = идея без клиента ("мастерская", независимо от одноимённого
  // clientId===null на ContentEntry — те две вещи не связаны).
  clientId: string | null;
  stage: ProjectStage;
  state: ProjectState;
  waitingFor: ProjectWaitingFor;
  nextActionText: string;
  nextActionDate: string | null; // ISO yyyy-mm-dd
  // Структурный тип действия — см. NextActionType выше. Не выведен из
  // nextActionText, задаётся мастером отдельно; null = не выбран.
  nextActionType: NextActionType | null;
  priority: ProjectPriority;
  area: string; // "Место" — intended placement, if already decided
  style: string; // "Техника и стиль"
  generalNotes: string; // "Общие заметки"
  feeling: string; // "Чувство/ощущение"
  creative: string; // "Креатив"
  inspirationSources: string; // "Источники вдохновения"
  photos: string[];
  createdDate: string;
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
// бы таймер «застывания». Включает: смену этапа/статуса/того-кто-должен-
// действовать (реальный прогресс или явное возобновление из паузы) и любое
// изменение «следующего шага» (текст/дата/тип — мастер осознанно
// спланировала действие).
export function isMeaningfulProjectChange(prev: Project, next: Project): boolean {
  return (
    prev.stage !== next.stage ||
    prev.state !== next.state ||
    prev.waitingFor !== next.waitingFor ||
    prev.nextActionText !== next.nextActionText ||
    prev.nextActionDate !== next.nextActionDate ||
    prev.nextActionType !== next.nextActionType
  );
}
