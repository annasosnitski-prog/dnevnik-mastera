// ============================================================
// РЕЕСТР МОДУЛЕЙ — какие экраны можно включать/выключать
//
// Ядро (клиент → проект → сессии → консультации) сюда не входит: оно всегда
// активно. Модуль — это отдельный экран поверх ядра (Личный кабинет/Админка,
// Планнер, contentINKA, Мастерская), который можно отключить, если он мастеру
// не нужен или пока не куплен. Флаги живут в MasterInfo (см. masterInfoStore.ts)
// — отдельного стор-слоя под них нет, ядро и так пробрасывается по приложению.
// ============================================================

export type ModuleKey = 'adminka' | 'planner' | 'content' | 'workshop' | 'bot';

export interface ModuleMeta {
  key: ModuleKey;
  label: string; // отображаемое название
  icon: string; // эмодзи или ключ иконки
  defaultActive: boolean; // включён ли при первом запуске (до покупки)
}

export const MODULE_REGISTRY: ModuleMeta[] = [
  { key: 'adminka', label: 'admINKA', icon: '📊', defaultActive: true },
  { key: 'planner', label: 'Планнер', icon: '🗒️', defaultActive: true },
  { key: 'content', label: 'contentINKA', icon: '✏️', defaultActive: true },
  { key: 'workshop', label: 'Мастерская', icon: '🎨', defaultActive: true },
  { key: 'bot', label: 'БотИНКА', icon: '🤖', defaultActive: false },
];

export type ModuleFlags = Record<ModuleKey, boolean>;

export function defaultModuleFlags(): ModuleFlags {
  return Object.fromEntries(MODULE_REGISTRY.map((m) => [m.key, m.defaultActive])) as ModuleFlags;
}
