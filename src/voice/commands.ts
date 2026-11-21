// ============================================================
// РЕЕСТР ГОЛОСОВЫХ КОМАНД.
//
// Каждая команда: узнаёт своё намерение (matches) и строит черновик
// (buildDraft) — список полей, которые мастер видит в шторке подтверждения
// и может поправить. Сохранение — только по зелёной галочке, и делает его
// уже экран (TattoDiary.tsx, VOICE_EXECUTORS по commandId), тем же путём,
// что и создание из круглого меню. Здесь — ни побочных эффектов, ни UI,
// поэтому реестр покрыт тестами (tests/voiceCommands.test.mjs).
//
// Чтобы добавить команду: новая запись в VOICE_COMMANDS + исполнитель в
// TattoDiary. Команда получает VoiceContext (клиенты, проекты, записи) и
// сама решает, кого имели в виду; если кандидатов несколько — поле-выбор
// без значения, и галочка не нажмётся, пока мастер не выберет (это и есть
// переспрос). Серверный разбор менять не нужно, пока хватает действий и
// сущностей из intent.ts.
// ============================================================

import type { VoiceIntent } from './intent.js';
import {
  clientLabel,
  EMPTY_VOICE_CONTEXT,
  entryLabel,
  findClients,
  findProjects,
  projectLabel,
  referencePrefixLength,
  normalizeWord,
  significantWords,
  type VoiceClientRef,
  type VoiceContext,
  type VoiceEntryRef,
  type VoiceProjectRef,
} from './context.js';
import { normalizeDate, normalizeTime } from './dates.js';
import { formatDate } from '../utils/dates.js';
import { PROJECT_BODY_AREAS, PROJECT_CATEGORIES, SESSIONS_PLANS } from '../domain/project.js';
import { URGENCY } from '../domain/urgency.js';
import { sameWord } from './context.js';

export interface VoiceChoice {
  value: string;
  label: string;
}

export interface VoiceDraftField {
  key: string;
  label: string;
  value: string;
  required?: boolean;
  multiline?: boolean;
  inputType?: 'text' | 'tel' | 'date' | 'time';
  // Поле-выбор (клиент, проект, сессия): плитки вместо ввода текста.
  options?: VoiceChoice[];
  // Модель не уверена в значении — шторка подсветит «проверьте».
  uncertain?: boolean;
}

export interface VoiceDraft {
  commandId: string;
  title: string;
  transcript: string;
  // Короткое пояснение над полями: «Нашла двух Ольг — какую?»
  hint?: string;
  fields: VoiceDraftField[];
}

// Что вернула команда: черновик под галочку; сразу выполнимое действие,
// которое ничего не меняет в данных (открыть клиента); или ответ текстом
// («кто у меня завтра»).
export type VoiceResult =
  | { type: 'draft'; draft: VoiceDraft }
  | { type: 'action'; commandId: string; values: Record<string, string>; message?: string }
  | { type: 'message'; text: string };

export interface VoiceCommand {
  id: string;
  // Пример фразы — для подсказки «что я умею».
  example: string;
  matches: (intent: VoiceIntent) => boolean;
  build: (intent: VoiceIntent, ctx: VoiceContext) => VoiceResult;
}

// Значение поля-выбора «новый проект» — проект заведёт исполнитель тем же
// ensureBucketProject, что и форма, когда мастер не выбрала проект.
export const NEW_PROJECT_PREFIX = 'new:';
export const NO_CLIENT = 'none';
const MAX_OPTIONS = 12;

const draft = (d: VoiceDraft): VoiceResult => ({ type: 'draft', draft: d });

// Единственный кандидат — выбран сразу; несколько — пусто, мастер выберет.
function choiceField(key: string, label: string, options: VoiceChoice[], preselect?: string): VoiceDraftField {
  const capped = options.slice(0, MAX_OPTIONS);
  const value = preselect ?? (capped.length === 1 ? capped[0].value : '');
  return { key, label, value, required: true, options: capped };
}

function spokenRef(intent: VoiceIntent): string {
  return [intent.fields.client, intent.fields.project, intent.fields.ref].filter(Boolean).join(' ');
}

function clientsOf(intent: VoiceIntent, ctx: VoiceContext): VoiceClientRef[] {
  const text = intent.fields.client ?? intent.fields.ref ?? '';
  return findClients(text, ctx);
}

function projectsOf(intent: VoiceIntent, ctx: VoiceContext): VoiceProjectRef[] {
  const text = intent.fields.project ?? intent.fields.ref ?? '';
  return findProjects(text, ctx);
}

const byTitle = (a: VoiceProjectRef, b: VoiceProjectRef) => a.title.localeCompare(b.title, 'ru');

// Проекты, о которых могла идти речь: названный проект (у названного
// клиента, если клиент тоже прозвучал) → проекты названного клиента → все
// незавершённые. Плюс «Новый проект для …» для каждого названного клиента.
function projectTargets(intent: VoiceIntent, ctx: VoiceContext): { options: VoiceChoice[]; hint?: string; preselect?: string } {
  const clients = clientsOf(intent, ctx);
  const clientIds = new Set(clients.map((c) => c.id));
  let named = projectsOf(intent, ctx).filter((p) => !p.completed);
  if (clients.length) {
    const ofClient = named.filter((p) => p.clientId && clientIds.has(p.clientId));
    named = ofClient.length || intent.fields.project ? ofClient : [];
  }
  const ofClients = ctx.projects.filter((p) => !p.completed && p.clientId && clientIds.has(p.clientId)).sort(byTitle);
  const pool = named.length ? named : ofClients.length ? ofClients : clients.length ? [] : ctx.projects.filter((p) => !p.completed);
  const options: VoiceChoice[] = pool.map((p) => ({ value: p.id, label: projectLabel(p, ctx) }));
  const newOptions: VoiceChoice[] = clients.length
    ? clients.map((c) => ({ value: NEW_PROJECT_PREFIX + c.id, label: `Новый проект · ${clientLabel(c)}` }))
    : [{ value: NEW_PROJECT_PREFIX, label: 'Новый проект без клиента' }];
  const said = spokenRef(intent).trim();
  let hint: string | undefined;
  if (said && !clients.length && !named.length) hint = `Не нашла «${said}» — выберите проект`;
  else if (clients.length > 1) hint = 'Нашла несколько клиентов — выберите проект';
  else if (pool.length > 1) hint = 'Какой проект?';
  // Один клиент без проектов → сразу «новый проект» для него.
  const preselect =
    pool.length === 1 ? pool[0].id : !pool.length && clients.length === 1 ? newOptions[0].value : undefined;
  return { options: [...options.slice(0, MAX_OPTIONS - newOptions.length), ...newOptions], hint, preselect };
}

// Сессии/консультации, о которых могла идти речь. upcoming — только
// предстоящие (перенос, отмена); иначе — все, ближайшие к сегодня первыми.
function entryTargets(
  kind: 'session' | 'consultation',
  intent: VoiceIntent,
  ctx: VoiceContext,
  opts: { upcoming: boolean; dateKey?: string },
): { entries: VoiceEntryRef[]; hint?: string } {
  const clients = clientsOf(intent, ctx);
  const clientIds = new Set(clients.map((c) => c.id));
  const named = projectsOf(intent, ctx);
  const namedIds = new Set(named.map((p) => p.id));
  const all = ctx.projects.flatMap((p) => p.entries).filter((e) => e.kind === kind && !e.cancelled);
  const live = opts.upcoming ? all.filter((e) => !e.done && (!e.date || e.date >= ctx.today)) : all;
  const ownerOf = (e: VoiceEntryRef) => ctx.projects.find((p) => p.id === e.projectId);
  let pool = live;
  if (clients.length || named.length) {
    const byClient = live.filter((e) => clientIds.has(ownerOf(e)?.clientId ?? ''));
    const byProject = live.filter((e) => namedIds.has(e.projectId));
    const both = byClient.filter((e) => namedIds.has(e.projectId));
    pool = both.length ? both : byClient.length ? byClient : byProject;
  }
  const onDate = opts.dateKey ? normalizeDate(intent.fields[opts.dateKey], ctx.today) : undefined;
  if (onDate) {
    const same = pool.filter((e) => e.date === onDate);
    if (same.length) pool = same;
  }
  const dist = (e: VoiceEntryRef) =>
    e.date ? Math.abs(new Date(e.date).getTime() - new Date(ctx.today).getTime()) : Number.MAX_SAFE_INTEGER;
  pool = [...pool].sort(opts.upcoming ? (a, b) => (a.date || '9999').localeCompare(b.date || '9999') : (a, b) => dist(a) - dist(b));
  const noun = kind === 'session' ? 'сессию' : 'консультацию';
  const said = spokenRef(intent).trim();
  let hint: string | undefined;
  if (!pool.length) hint = said ? `Не нашла ${noun} «${said}»` : `Нет ${opts.upcoming ? 'предстоящих ' : ''}записей`;
  else if (said && !clients.length && !named.length) hint = `Не нашла «${said}» — выберите ${noun}`;
  else if (pool.length > 1) hint = kind === 'session' ? 'Какую сессию?' : 'Какую консультацию?';
  return { entries: pool, hint };
}

const entryOptions = (entries: VoiceEntryRef[], ctx: VoiceContext): VoiceChoice[] =>
  entries.map((e) => ({ value: e.id, label: entryLabel(e, ctx) }));

// ── Клиент ────────────────────────────────────────────────────────────────

const newClient: VoiceCommand = {
  id: 'client.create',
  example: 'новый клиент Ольга Петрова, телефон …',
  matches: (intent) => intent.action === 'create' && intent.entity === 'client',
  build: (intent) =>
    draft({
      commandId: 'client.create',
      title: 'Новый клиент',
      transcript: intent.transcript,
      fields: [
        { key: 'name', label: 'Имя', value: intent.fields.name ?? '', required: true },
        { key: 'surname', label: 'Фамилия', value: intent.fields.surname ?? '' },
        { key: 'phone', label: 'Телефон', value: intent.fields.phone ?? '', inputType: 'tel' },
        { key: 'note', label: 'Заметки о клиенте', value: intent.fields.note ?? '', multiline: true },
      ],
    }),
};

const openClient: VoiceCommand = {
  id: 'client.open',
  example: 'открой клиента Ольгу',
  matches: (intent) => intent.action === 'open' && intent.entity === 'client',
  build: (intent, ctx) => {
    const found = clientsOf(intent, ctx);
    if (found.length === 1) return { type: 'action', commandId: 'client.open', values: { client: found[0].id } };
    if (!found.length) return { type: 'message', text: `Не нашла клиента «${spokenRef(intent) || '…'}»` };
    return draft({
      commandId: 'client.open',
      title: 'Открыть клиента',
      transcript: intent.transcript,
      hint: 'Нашла несколько — кого открыть?',
      fields: [choiceField('client', 'Клиент', found.map((c) => ({ value: c.id, label: clientLabel(c) })))],
    });
  },
};

const openProject: VoiceCommand = {
  id: 'project.open',
  example: 'открой проект Дракон',
  matches: (intent) => intent.action === 'open' && intent.entity === 'project',
  build: (intent, ctx) => {
    const found = projectsOf(intent, ctx);
    if (found.length === 1) return { type: 'action', commandId: 'project.open', values: { project: found[0].id } };
    if (!found.length) return { type: 'message', text: `Не нашла проект «${spokenRef(intent) || '…'}»` };
    return draft({
      commandId: 'project.open',
      title: 'Открыть проект',
      transcript: intent.transcript,
      hint: 'Нашла несколько — какой открыть?',
      fields: [choiceField('project', 'Проект', found.map((p) => ({ value: p.id, label: projectLabel(p, ctx) })))],
    });
  },
};

// ── Сессия и консультация ─────────────────────────────────────────────────

// Неуверенные поля из ответа модели → подсветка в шторке.
function markUncertain(fields: VoiceDraftField[], intent: VoiceIntent, extra: string[] = []): VoiceDraftField[] {
  const keys = new Set([...(intent.uncertain ?? []), ...extra]);
  // Ключи модели называются как поля карточки; title сессии лежит в name.
  if (keys.has('title')) keys.add('name');
  return fields.map((f) => (keys.has(f.key) && f.value ? { ...f, uncertain: true } : f));
}

const text = (key: string, label: string, value: string | undefined, multiline = false): VoiceDraftField => ({
  key,
  label,
  value: value ?? '',
  multiline,
});

// Полная карточка: те же поля, что в формах «Новая сессия» / «Новая
// консультация», в том же порядке. Чего не надиктовали — пусто.
function scheduleDraft(kind: 'session' | 'consultation', intent: VoiceIntent, ctx: VoiceContext): VoiceResult {
  const target = projectTargets(intent, ctx);
  const f = intent.fields;
  const fields: VoiceDraftField[] = [choiceField('project', 'Проект', target.options, target.preselect)];
  if (kind === 'session') fields.push(text('name', 'Название сессии', f.title ?? f.name));
  fields.push(
    { key: 'date', label: 'Дата', value: normalizeDate(f.date, ctx.today) ?? '', inputType: 'date' },
    { key: 'time', label: 'Время', value: normalizeTime(f.time) ?? '', inputType: 'time' },
  );
  if (kind === 'session') {
    fields.push(
      { ...choiceField('status', 'Статус', [{ value: 'planned', label: 'Запланирована' }, { value: 'done', label: 'Выполнена' }], f.status === 'done' ? 'done' : 'planned') },
      text('duration', 'Длительность', f.duration),
      text('style', 'Стиль', f.style),
      text('area', 'Зона', f.area),
      text('colors', 'Цвета', f.colors),
      text('needles', 'Иглы', f.needles),
      text('skinReaction', 'Реакция кожи', f.skinReaction),
      text('note', 'Заметки', f.note, true),
    );
  } else {
    const urgency = URGENCY.some((u) => u.key === f.urgency) ? f.urgency : 'important';
    fields.push(
      text('area', 'Место', f.area),
      text('style', 'Техника и стиль', f.style),
      text('note', 'Общие заметки', f.note ?? f.generalNotes, true),
      text('feeling', 'Чувство / ощущение', f.feeling, true),
      text('creative', 'Креатив', f.creative, true),
      text('inspirationSources', 'Источники вдохновения', f.inspirationSources, true),
      text('outcome', 'Итог', f.outcome, true),
      choiceField('urgency', 'Срочность', URGENCY.map((u) => ({ value: u.key, label: `${u.emoji} ${u.label}` })), urgency),
    );
  }
  return draft({
    commandId: `${kind}.create`,
    title: kind === 'session' ? 'Новая сессия' : 'Новая консультация',
    transcript: intent.transcript,
    hint: target.hint,
    fields: markUncertain(fields, intent),
  });
}

const newSession: VoiceCommand = {
  id: 'session.create',
  example: 'новая сессия для Ольги завтра в 14:00',
  matches: (intent) => intent.action === 'create' && intent.entity === 'session',
  build: (intent, ctx) => scheduleDraft('session', intent, ctx),
};

const newConsultation: VoiceCommand = {
  id: 'consultation.create',
  example: 'консультация с Мариной в пятницу в 12',
  matches: (intent) => intent.action === 'create' && intent.entity === 'consultation',
  build: (intent, ctx) => scheduleDraft('consultation', intent, ctx),
};

function moveDraft(kind: 'session' | 'consultation', intent: VoiceIntent, ctx: VoiceContext): VoiceResult {
  const { entries, hint } = entryTargets(kind, intent, ctx, { upcoming: true, dateKey: 'fromDate' });
  const chosen = entries.length === 1 ? entries[0] : null;
  const date = normalizeDate(intent.fields.date, ctx.today);
  const time = normalizeTime(intent.fields.time);
  return draft({
    commandId: `${kind}.move`,
    title: kind === 'session' ? 'Перенести сессию' : 'Перенести консультацию',
    transcript: intent.transcript,
    hint,
    fields: [
      choiceField('entry', kind === 'session' ? 'Сессия' : 'Консультация', entryOptions(entries, ctx)),
      { key: 'date', label: 'Новая дата', value: date ?? chosen?.date ?? '', inputType: 'date', required: true },
      // Время не названо — остаётся прежним.
      { key: 'time', label: 'Новое время', value: time ?? chosen?.time ?? '', inputType: 'time' },
    ],
  });
}

const moveSession: VoiceCommand = {
  id: 'session.move',
  example: 'перенеси сессию Ольги на пятницу в 15',
  matches: (intent) => (intent.action === 'move' || intent.action === 'update') && intent.entity === 'session' && !!(intent.fields.date || intent.fields.time),
  build: (intent, ctx) => moveDraft('session', intent, ctx),
};

const moveConsultation: VoiceCommand = {
  id: 'consultation.move',
  example: 'перенеси консультацию Марины на завтра',
  matches: (intent) =>
    (intent.action === 'move' || intent.action === 'update') && intent.entity === 'consultation' && !!(intent.fields.date || intent.fields.time),
  build: (intent, ctx) => moveDraft('consultation', intent, ctx),
};

function cancelDraft(kind: 'session' | 'consultation', intent: VoiceIntent, ctx: VoiceContext): VoiceResult {
  const { entries, hint } = entryTargets(kind, intent, ctx, { upcoming: true, dateKey: 'date' });
  return draft({
    commandId: `${kind}.cancel`,
    title: kind === 'session' ? 'Отменить сессию' : 'Отменить консультацию',
    transcript: intent.transcript,
    hint: hint ?? 'Запись останется в истории как «Отменена»',
    fields: [choiceField('entry', kind === 'session' ? 'Сессия' : 'Консультация', entryOptions(entries, ctx))],
  });
}

const cancelSession: VoiceCommand = {
  id: 'session.cancel',
  example: 'отмени сессию Ольги',
  matches: (intent) => intent.action === 'cancel' && intent.entity === 'session',
  build: (intent, ctx) => cancelDraft('session', intent, ctx),
};

const cancelConsultation: VoiceCommand = {
  id: 'consultation.cancel',
  example: 'отмени консультацию Марины',
  matches: (intent) => intent.action === 'cancel' && intent.entity === 'consultation',
  build: (intent, ctx) => cancelDraft('consultation', intent, ctx),
};

// ── Проект ────────────────────────────────────────────────────────────────

const newProject: VoiceCommand = {
  id: 'project.create',
  example: 'новый проект Дракон для Ольги',
  matches: (intent) => intent.action === 'create' && intent.entity === 'project',
  build: (intent, ctx) => {
    const said = intent.fields.client ?? '';
    const found = said ? findClients(said, ctx) : [];
    const options: VoiceChoice[] = [
      { value: NO_CLIENT, label: 'Без клиента' },
      ...(found.length ? found : ctx.clients).map((c) => ({ value: c.id, label: clientLabel(c) })),
    ];
    const preselect = !said ? NO_CLIENT : found.length === 1 ? found[0].id : '';
    const hint = said && !found.length ? `Не нашла клиента «${said}»` : found.length > 1 ? 'Для какого клиента?' : undefined;
    return draft({
      commandId: 'project.create',
      title: 'Новый проект',
      transcript: intent.transcript,
      hint,
      fields: markUncertain(projectCardFields(intent, ctx, options, preselect), intent, areaGuess(intent.fields.area).uncertain ? ['area'] : []),
    });
  },
};

// «левое предплечье» → «Предплечье» из списка мест проекта; не узнали —
// оставляем как сказано и подсвечиваем.
function areaGuess(spoken: string | undefined): { value: string; uncertain: boolean } {
  if (!spoken) return { value: '', uncertain: false };
  const hit = PROJECT_BODY_AREAS.find((a) => significantWords(spoken).some((w) => significantWords(a.key).some((k) => sameWord(w, k))));
  return hit ? { value: hit.key, uncertain: false } : { value: spoken, uncertain: true };
}

// Те же поля, что в форме «Новый проект».
function projectCardFields(intent: VoiceIntent, ctx: VoiceContext, clientOptions: VoiceChoice[], clientPreselect: string): VoiceDraftField[] {
  const f = intent.fields;
  const category = PROJECT_CATEGORIES.some((c) => c.key === f.category) ? f.category : 'tattoo';
  const plan = SESSIONS_PLANS.some((p) => p.key === f.sessionsPlan) ? f.sessionsPlan : '';
  return [
    { key: 'title', label: 'Название', value: f.title ?? f.name ?? '', required: true },
    choiceField('client', 'Клиент', clientOptions, clientPreselect),
    choiceField('category', 'Категория', PROJECT_CATEGORIES.map((c) => ({ value: c.key, label: c.label })), category),
    { ...choiceField('sessionsPlan', 'Сколько встреч', SESSIONS_PLANS.map((p) => ({ value: p.key, label: p.label })), plan), required: false },
    text('area', 'Место', areaGuess(f.area).value),
    text('style', 'Техника и стиль', f.style),
    { key: 'firstSessionDate', label: 'Первая сессия', value: normalizeDate(f.firstSessionDate, ctx.today) ?? '', inputType: 'date' },
    text('nextActionText', 'Следующий шаг', f.nextActionText),
    { key: 'nextActionDate', label: 'Дата шага', value: normalizeDate(f.nextActionDate, ctx.today) ?? '', inputType: 'date' },
    text('note', 'Общие заметки', f.note ?? f.generalNotes, true),
    text('creative', 'Идеи', f.creative, true),
  ];
}

const completeProject: VoiceCommand = {
  id: 'project.complete',
  example: 'закрой проект Дракон',
  matches: (intent) => intent.action === 'complete' && intent.entity === 'project',
  build: (intent, ctx) => {
    const open = ctx.projects.filter((p) => !p.completed);
    const named = projectsOf(intent, ctx).filter((p) => !p.completed);
    const clients = clientsOf(intent, ctx);
    const ofClients = open.filter((p) => p.clientId && clients.some((c) => c.id === p.clientId));
    const pool = named.length ? named : ofClients.length ? ofClients : open;
    const said = spokenRef(intent).trim();
    return draft({
      commandId: 'project.complete',
      title: 'Завершить проект',
      transcript: intent.transcript,
      hint: said && !named.length && !ofClients.length ? `Не нашла «${said}» — выберите проект` : pool.length > 1 ? 'Какой проект завершить?' : undefined,
      fields: [choiceField('project', 'Проект', pool.sort(byTitle).map((p) => ({ value: p.id, label: projectLabel(p, ctx) })))],
    });
  },
};

// ── Заметки ───────────────────────────────────────────────────────────────

// Локальный разбор без разделителя: «к сессии Ольги клиентка просила …» —
// первые слова, похожие на клиента/проект, — ссылка, остальное — заметка.
function splitRefAndNote(intent: VoiceIntent, ctx: VoiceContext): VoiceIntent {
  if (!intent.fields.refWithNote || !intent.fields.ref) return intent;
  // Слова без «голой» пунктуации — тот же счёт слов, что у referencePrefixLength.
  const raw = intent.fields.ref.split(/\s+/).filter((t) => normalizeWord(t));
  const n = referencePrefixLength(raw.join(' '), ctx);
  const ref = raw.slice(0, n).join(' ');
  const note = raw.slice(n).join(' ').replace(/^[,.:;—-]+\s*/, '');
  const fields: Record<string, string> = { ...intent.fields, ref };
  delete fields.refWithNote;
  if (note && !fields.note) fields.note = note;
  return { ...intent, fields };
}

const noteTarget = (intent: VoiceIntent): 'project' | 'session' | 'consultation' => {
  const t = (intent.fields.target ?? '').toLowerCase();
  return t === 'session' || t === 'consultation' ? t : 'project';
};

const addNote: VoiceCommand = {
  id: 'note.create',
  example: 'заметка к сессии Ольги: …',
  matches: (intent) => intent.action === 'create' && intent.entity === 'note',
  build: (rawIntent, ctx) => {
    const intent = splitRefAndNote(rawIntent, ctx);
    const target = noteTarget(intent);
    const noteField: VoiceDraftField = { key: 'note', label: 'Заметка', value: intent.fields.note ?? '', required: true, multiline: true };
    if (target === 'project') {
      const named = projectsOf(intent, ctx);
      const clients = clientsOf(intent, ctx);
      const ofClients = ctx.projects.filter((p) => p.clientId && clients.some((c) => c.id === p.clientId));
      const pool = named.length ? named : ofClients.length ? ofClients : ctx.projects.filter((p) => !p.completed);
      const said = spokenRef(intent).trim();
      return draft({
        commandId: 'note.project',
        title: 'Заметка к проекту',
        transcript: intent.transcript,
        hint: said && !named.length && !ofClients.length ? `Не нашла «${said}» — выберите проект` : pool.length > 1 ? 'К какому проекту?' : undefined,
        fields: [choiceField('project', 'Проект', [...pool].sort(byTitle).map((p) => ({ value: p.id, label: projectLabel(p, ctx) }))), noteField],
      });
    }
    const { entries, hint } = entryTargets(target, intent, ctx, { upcoming: false, dateKey: 'date' });
    return draft({
      commandId: `note.${target}`,
      title: target === 'session' ? 'Заметка к сессии' : 'Заметка к консультации',
      transcript: intent.transcript,
      hint,
      fields: [choiceField('entry', target === 'session' ? 'Сессия' : 'Консультация', entryOptions(entries, ctx)), noteField],
    });
  },
};

// Напоминание = задача мастера со сроком (ClientNote.dueDate): в срок она
// сама появится в напоминаниях (reminders/buildTaskReminders.ts).
const addReminder: VoiceCommand = {
  id: 'reminder.create',
  example: 'напомни завтра заказать иглы',
  matches: (intent) => intent.action === 'create' && intent.entity === 'reminder',
  build: (intent, ctx) =>
    draft({
      commandId: 'reminder.create',
      title: 'Напоминание',
      transcript: intent.transcript,
      fields: [
        { key: 'note', label: 'О чём напомнить', value: intent.fields.note ?? '', required: true, multiline: true },
        { key: 'date', label: 'Когда', value: normalizeDate(intent.fields.date, ctx.today) ?? '', inputType: 'date', required: true },
      ],
    }),
};

// ── Навигация по записям и «кто у меня завтра» ────────────────────────────
// Ответ — не текст, а сама запись: одна — открывается сразу, несколько —
// плитки «кого открыть», ни одной — экран Админки с расписанием.

function openEntryResult(entries: VoiceEntryRef[], ctx: VoiceContext, title: string, transcript: string, hint?: string): VoiceResult {
  if (entries.length === 1) return { type: 'action', commandId: 'entry.open', values: { entry: entries[0].id } };
  return draft({
    commandId: 'entry.open',
    title,
    transcript,
    hint: hint ?? 'Кого открыть?',
    fields: [choiceField('entry', 'Запись', entryOptions(entries, ctx))],
  });
}

const openEntry: VoiceCommand = {
  id: 'entry.open',
  example: 'открой сессию Ольги',
  matches: (intent) => intent.action === 'open' && (intent.entity === 'session' || intent.entity === 'consultation'),
  build: (intent, ctx) => {
    const kind = intent.entity === 'consultation' ? 'consultation' : 'session';
    const { entries, hint } = entryTargets(kind, intent, ctx, { upcoming: false, dateKey: 'date' });
    if (!entries.length) return { type: 'message', text: hint ?? 'Не нашла запись' };
    return openEntryResult(entries, ctx, kind === 'session' ? 'Открыть сессию' : 'Открыть консультацию', intent.transcript, hint);
  },
};

const WEEKDAY_NAMES = ['воскресенье', 'понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу'];

export function dayName(date: string, today: string): string {
  const [y, m, d] = today.split('-').map(Number);
  const plus = (n: number) => {
    const dt = new Date(y, m - 1, d + n);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  };
  if (date === today) return 'Сегодня';
  if (date === plus(1)) return 'Завтра';
  if (date === plus(2)) return 'Послезавтра';
  const [yy, mm, dd] = date.split('-').map(Number);
  return `В ${WEEKDAY_NAMES[new Date(yy, mm - 1, dd).getDay()]}, ${formatDate(date)}`;
}

const askSchedule: VoiceCommand = {
  id: 'schedule.ask',
  example: 'кто у меня завтра',
  matches: (intent) => intent.action === 'ask' && intent.entity === 'schedule',
  build: (intent, ctx) => {
    const date = normalizeDate(intent.fields.date, ctx.today) ?? ctx.today;
    const entries = ctx.projects
      .flatMap((p) => p.entries)
      .filter((e) => e.date === date && !e.cancelled)
      .sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
    const day = dayName(date, ctx.today);
    if (!entries.length) {
      return { type: 'action', commandId: 'schedule.empty', values: { date }, message: `${day} записей нет` };
    }
    return openEntryResult(entries, ctx, `${day}: ${entries.length} ${entries.length < 5 ? 'записи' : 'записей'}`, intent.transcript, 'Кого открыть?');
  },
};

export const VOICE_COMMANDS: VoiceCommand[] = [
  newClient,
  openClient,
  openProject,
  openEntry,
  newSession,
  newConsultation,
  moveSession,
  moveConsultation,
  cancelSession,
  cancelConsultation,
  newProject,
  completeProject,
  addNote,
  addReminder,
  askSchedule,
];

export function findVoiceCommand(intent: VoiceIntent, commands: VoiceCommand[] = VOICE_COMMANDS): VoiceCommand | null {
  return commands.find((command) => command.matches(intent)) ?? null;
}

// Для тестов и старых вызовов: черновик без контекста.
export function buildVoiceResult(intent: VoiceIntent, ctx: VoiceContext = EMPTY_VOICE_CONTEXT): VoiceResult | null {
  const command = findVoiceCommand(intent);
  return command ? command.build(intent, ctx) : null;
}

export function draftValues(draft: VoiceDraft): Record<string, string> {
  return Object.fromEntries(draft.fields.map((field) => [field.key, field.value]));
}

export function canConfirmDraft(draft: VoiceDraft): boolean {
  return draft.fields.every((field) => !field.required || field.value.trim().length > 0);
}

export { significantWords };
