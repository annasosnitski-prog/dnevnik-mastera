// ============================================================
// КОНТЕКСТ ГОЛОСОВОЙ КОМАНДЫ — кто есть в дневнике.
//
// Чтобы понять «сессия для Ольги» или «заметка к проекту Дракон», команде
// нужен список клиентов, проектов и их записей. Экран (TattoDiary) собирает
// его из своего состояния в этот плоский вид; здесь — только поиск по нему.
// Русские имена склоняются («Ольги», «Ольгу», «Ольгой»), поэтому сравнение
// по общему началу слова, а не по точному совпадению.
// ============================================================

import { formatDate } from '../utils/dates.js';

export interface VoiceClientRef {
  id: string;
  name: string;
  surname: string;
}

export interface VoiceEntryRef {
  id: string;
  kind: 'session' | 'consultation';
  projectId: string;
  date: string;
  time: string;
  title: string; // имя сессии; у консультации пусто
  done: boolean;
  cancelled: boolean;
}

export interface VoiceProjectRef {
  id: string;
  title: string;
  clientId: string | null;
  completed: boolean;
  entries: VoiceEntryRef[];
}

export interface VoiceContext {
  today: string; // YYYY-MM-DD
  clients: VoiceClientRef[];
  projects: VoiceProjectRef[];
}

export const EMPTY_VOICE_CONTEXT: VoiceContext = { today: '1970-01-01', clients: [], projects: [] };

const STOP_WORDS = new Set([
  'для', 'клиент', 'клиента', 'клиентки', 'клиентка', 'клиенту', 'клиентке', 'проект', 'проекта', 'проекту',
  'проектом', 'сессия', 'сессию', 'сессии', 'консультация', 'консультацию', 'консультации', 'у', 'с', 'со',
  'к', 'ко', 'по', 'в', 'во', 'на', 'и', 'мне', 'мою', 'моей', 'её', 'ее', 'его', 'с', 'про', 'от',
]);

export function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\d-]/gu, '');
}

export function words(text: string): string[] {
  return text
    .split(/[\s,.:;!?«»"—]+/)
    .map(normalizeWord)
    .filter((w) => w.length > 0);
}

export function significantWords(text: string): string[] {
  return words(text).filter((w) => w.length >= 2 && !STOP_WORDS.has(w));
}

// «Ольги» ~ «Ольга», «Марине» ~ «Марина», «Дракона» ~ «Дракон»: общее начало
// не короче слова без двух последних букв (окончание), но минимум 2 буквы.
export function sameWord(spoken: string, known: string): boolean {
  const a = normalizeWord(spoken);
  const b = normalizeWord(known);
  if (!a || !b) return false;
  if (a === b) return true;
  const minLen = Math.min(a.length, b.length);
  if (minLen < 3) return false;
  let common = 0;
  while (common < minLen && a[common] === b[common]) common++;
  return common >= Math.max(2, Math.max(a.length, b.length) - 3) && common >= minLen - 2;
}

export function clientLabel(client: VoiceClientRef): string {
  return [client.name, client.surname].filter(Boolean).join(' ');
}

// Клиенты, которых упомянули в тексте. Совпали и имя, и фамилия — эти
// первыми; если таких нет — все, у кого совпало хоть что-то.
export function findClients(text: string, ctx: VoiceContext): VoiceClientRef[] {
  const spoken = significantWords(text);
  if (!spoken.length) return [];
  const scored = ctx.clients
    .map((client) => {
      const parts = [client.name, client.surname].map(normalizeWord).filter(Boolean);
      const hits = parts.filter((part) => spoken.some((w) => sameWord(w, part))).length;
      return { client, hits, full: hits === parts.length && parts.length > 1 };
    })
    .filter((s) => s.hits > 0);
  const full = scored.filter((s) => s.full);
  return (full.length ? full : scored).map((s) => s.client);
}

// Проекты по словам названия: доля совпавших слов названия, лучшие первыми.
export function findProjects(text: string, ctx: VoiceContext): VoiceProjectRef[] {
  const spoken = significantWords(text);
  if (!spoken.length) return [];
  const scored = ctx.projects
    .map((project) => {
      const titleWords = significantWords(project.title).filter((w) => w.length >= 3);
      if (!titleWords.length) return { project, score: 0 };
      const hits = titleWords.filter((t) => spoken.some((w) => sameWord(w, t))).length;
      return { project, score: hits / titleWords.length };
    })
    .filter((s) => s.score > 0);
  const best = Math.max(0, ...scored.map((s) => s.score));
  return scored.filter((s) => s.score === best).map((s) => s.project);
}

// Какие слова текста — это упоминание клиента/проекта (а не текст заметки).
// Возвращает число слов с начала, которые «съела» ссылка.
export function referencePrefixLength(text: string, ctx: VoiceContext): number {
  const all = words(text);
  const known = [
    ...ctx.clients.flatMap((c) => [c.name, c.surname]),
    ...ctx.projects.flatMap((p) => significantWords(p.title)),
  ]
    .map(normalizeWord)
    .filter((w) => w.length >= 2);
  let n = 0;
  while (n < all.length && (STOP_WORDS.has(all[n]) || known.some((k) => sameWord(all[n], k)))) n++;
  // Хвостовые служебные слова («Ольги про …» — «про» уже часть заметки).
  while (n > 0 && STOP_WORDS.has(all[n - 1])) n--;
  return n;
}

export function projectLabel(project: VoiceProjectRef, ctx: VoiceContext): string {
  const client = project.clientId ? ctx.clients.find((c) => c.id === project.clientId) : null;
  return client ? `${project.title || 'Без названия'} · ${clientLabel(client)}` : project.title || 'Без названия';
}

export function entryLabel(entry: VoiceEntryRef, ctx: VoiceContext): string {
  const project = ctx.projects.find((p) => p.id === entry.projectId);
  const when = [entry.date ? formatDate(entry.date) : 'без даты', entry.time].filter(Boolean).join(' ');
  const parts = [when, entry.title, project ? projectLabel(project, ctx) : ''].filter(Boolean);
  return parts.join(' · ');
}
