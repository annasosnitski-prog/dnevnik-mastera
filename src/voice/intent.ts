// ============================================================
// ГОЛОСОВЫЕ НАМЕРЕНИЯ — общая форма, в которую превращается фраза.
//
// Фраза («новый клиент Ольга Петрова, телефон 8 999 …») → VoiceIntent
// {действие, сущность, поля}. Разбирает её серверный эндпоинт с дешёвой
// моделью (api/voice-intent.ts на Vercel), а если он недоступен
// (нет сети, ключ не настроен) —
// локальный разборщик ниже. Оба пути проходят через normalizeIntent,
// так что дальше по цепочке форма всегда одна и та же.
//
// Форма намеренно шире, чем умеет реестр: действия и сущности уже
// перечислены для будущих команд (закрытие сессии, пост/сториз, навигация,
// вопросы о заживлении). Что реально исполняется — см. commands.ts.
// ============================================================

export const VOICE_ACTIONS = ['create', 'move', 'cancel', 'open', 'update', 'complete', 'generate', 'ask', 'unknown'] as const;
export type VoiceAction = (typeof VOICE_ACTIONS)[number];

export const VOICE_ENTITIES = ['client', 'project', 'session', 'consultation', 'note', 'reminder', 'schedule', 'content', 'screen'] as const;
export type VoiceEntity = (typeof VOICE_ENTITIES)[number];

export interface VoiceIntent {
  action: VoiceAction;
  entity: VoiceEntity | null;
  // Плоский словарь строк: name, surname, phone, note, client, project,
  // title, date, time, fromDate, target, ref … Каждая команда сама решает,
  // какие ключи ей нужны. ref — сырой остаток фразы из локального разбора
  // («Ольги дракон»): кто это, команда решает сама по списку клиентов.
  fields: Record<string, string>;
  transcript: string;
  source: 'llm' | 'local';
  // Ключи полей, в которых модель не уверена, — шторка их подсветит.
  uncertain: string[];
}

// Приводит что угодно (ответ модели, локальный разбор) к VoiceIntent:
// неизвестные действия/сущности → unknown/null, поля — только непустые
// строки. Сервер мог ответить мусором — UI не должен на этом падать.
export function normalizeIntent(raw: unknown, transcript: string, source: VoiceIntent['source']): VoiceIntent {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const action = VOICE_ACTIONS.includes(obj.action as VoiceAction) ? (obj.action as VoiceAction) : 'unknown';
  const entity = VOICE_ENTITIES.includes(obj.entity as VoiceEntity) ? (obj.entity as VoiceEntity) : null;
  const fields: Record<string, string> = {};
  if (obj.fields && typeof obj.fields === 'object') {
    for (const [key, value] of Object.entries(obj.fields as Record<string, unknown>)) {
      if (typeof value === 'string' && value.trim()) fields[key] = value.trim();
      else if (typeof value === 'number') fields[key] = String(value);
    }
  }
  const uncertain = Array.isArray(obj.uncertain)
    ? obj.uncertain.filter((k): k is string => typeof k === 'string' && k in fields)
    : [];
  return { action, entity, fields, transcript, source, uncertain };
}

import { findDates, findTimes, stripMatches } from './dates.js';
import { extractCardFields } from './cardFields.js';
import { todayISO } from '../utils/dates.js';

const capitalize = (word: string) => (word ? word[0].toUpperCase() + word.slice(1) : word);

// \b в JS-регэкспах понимает только латиницу, поэтому границы слов для
// кириллицы — через \p{L} и флаг u.
//
// Телефон: + и минимум 7 цифр, между ними пробелы/дефисы/скобки. Распознавание
// речи часто отдаёт номер кусками («8 999 123 45 67») — склеиваем.
const PHONE_RE = /\+?\d[\d\s\-()]{5,}\d/;

const CREATE_CLIENT_RE = /^(?:новый|новая|новую|создай|создать|добавь|добавить|заведи)\s+(?:(?:нового|новую|новый)\s+)?клиент(?:а|ку|ка)?(?!\p{L})[\s,.:—-]*(.*)$/iu;
const NOTE_RE = /\s*[,.]?\s*(?<!\p{L})(?:заметка|заметки|примечание|комментарий)(?!\p{L})\s*[:,—-]?\s*(.*)$/iu;

const CREATE_VERB = '(?:новый|новая|новую|новое|создай|создать|добавь|добавить|заведи|завести|запиши|записать|назначь|назначить|запланируй|запланировать)';
const NEW_ADJ = '(?:(?:нового|новую|новый|новая)\s+)?';
const TAIL = '(?!\\p{L})[\\s,.:—-]*(.*)$';

const CREATE_SESSION_RE = new RegExp(`^(?:${CREATE_VERB}\\s+)?${NEW_ADJ}(?:сесси[юяи]|сеанс)${TAIL}`, 'iu');
const CREATE_CONSULTATION_RE = new RegExp(`^(?:${CREATE_VERB}\\s+)?${NEW_ADJ}консультаци[юяи]${TAIL}`, 'iu');
const CREATE_PROJECT_RE = new RegExp(`^${CREATE_VERB}\\s+${NEW_ADJ}проект${TAIL}`, 'iu');
const MOVE_RE = /^(?:перенеси|перенести|передвинь|передвинуть|сдвинь|сдвинуть|подвинь|перемести|переставь)\s+(?:мою\s+|ближайшую\s+)?(сесси[юяи]|сеанс|консультаци[юяи])(?!\p{L})[\s,.:—-]*(.*)$/iu;
const NOTE_TO_RE = /^(?:(?:добавь|добавить|запиши|записать|напиши|новая|оставь)\s+)?(?:заметк[ауи]|примечание|комментарий)\s+(?:к|ко|в|для|по)\s+(проект\p{L}*|сесси\p{L}*|сеанс\p{L}*|консультаци\p{L}*)(?!\p{L})[\s,.:—-]*(.*)$/iu;
// В заметке текст часто отделён двоеточием, тире или словом «текст».
const NOTE_SPLIT_RE = /\s*(?::|—|(?<!\p{L})(?:текст|содержание)(?!\p{L}))\s*/iu;

function parseClient(text: string): VoiceIntent {
  let rest = text;
  const fields: Record<string, string> = {};

  const note = NOTE_RE.exec(rest);
  if (note) {
    if (note[1].trim()) fields.note = note[1].trim();
    rest = rest.slice(0, note.index);
  }

  const phone = PHONE_RE.exec(rest);
  if (phone) {
    fields.phone = phone[0].replace(/[\s\-()]/g, '');
    rest = rest.slice(0, phone.index) + ' ' + rest.slice(phone.index + phone[0].length);
  }
  rest = rest.replace(/(?<!\p{L})(?:телефон|тел|номер)(?!\p{L})\.?/giu, ' ');

  const words = rest
    .replace(/[,.:;!?—-]/g, ' ')
    .split(' ')
    .map((w) => w.trim())
    .filter((w) => w && !/^(?:по|имени|зовут|её|ее|его|фамилия|имя)$/i.test(w));
  if (words[0]) fields.name = capitalize(words[0]);
  if (words[1]) fields.surname = capitalize(words[1]);

  return { action: 'create', entity: 'client', fields, transcript: text, source: 'local', uncertain: [] };
}

// Дата, время и заметка из хвоста «сессия для Ольги завтра в 14, заметка …»;
// остаток — ref (кто/какой проект).
function scheduleFields(rest: string, today: string, fields: Record<string, string> = {}): Record<string, string> {
  const note = NOTE_RE.exec(rest);
  if (note) {
    if (note[1].trim()) fields.note = note[1].trim();
    rest = rest.slice(0, note.index);
  }
  const dates = findDates(rest, today);
  const timesInRest = findTimes(rest);
  if (dates.length) fields.date = dates[dates.length - 1].date!;
  if (dates.length > 1) fields.fromDate = dates[0].date!;
  if (timesInRest.length) fields.time = timesInRest[timesInRest.length - 1].time!;
  const ref = stripMatches(rest, [...dates, ...timesInRest]).replace(/[,.:;!?—]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (ref) fields.ref = ref;
  return fields;
}

const CANCEL_RE = /^(?:отмени|отменить|отмена)\s+(?:мою\s+|ближайшую\s+)?(сесси\p{L}*|сеанс\p{L}*|консультаци\p{L}*)(?!\p{L})[\s,.:—-]*(.*)$/iu;
const OPEN_RE = /^(?:открой|открыть|покажи|показать|найди|найти)\s+(?:(клиент\p{L}*|проект\p{L}*)\s+)?(.+)$/iu;
const SCHEDULE_RE = /^(?:кто|что|какие|какая)\s+(?:у\s+меня\s+|сегодня\s+|завтра\s+)*(?:(?:есть|будет|запланировано|записан\p{L}*|встречи|сессии|записи)\s+)*(.*)$|^(?:расписание|план|мои\s+записи|записи)(?!\p{L})\s*(.*)$/iu;
const COMPLETE_PROJECT_RE = /^(?:закрой|закрыть|заверши|завершить|закончи|закончить)\s+проект(?!\p{L})[\s,.:—-]*(.*)$/iu;
const REMIND_RE = /^(?:напомни|напомнить|напоминание)(?:\s+мне)?(?!\p{L})[\s,.:—-]*(.*)$/iu;

// Полная карточка из диктовки: поля по меткам, а из начала фразы — кто и
// когда (см. cardFields.ts).
function cardFields(kind: 'session' | 'consultation', rest: string, today: string): Record<string, string> {
  const card = extractCardFields(kind, rest);
  const head = scheduleFields(card.head, today);
  return { ...head, ...card.fields };
}

const entityOf = (word: string): 'session' | 'consultation' | 'project' =>
  /^консульт/i.test(word) ? 'consultation' : /^проект/i.test(word) ? 'project' : 'session';

// Резервный разбор без сети — только то, что нужно зарегистрированным
// командам. Всё, что не узнали, — action: 'unknown', и UI честно скажет,
// что команда не понята. today — для «завтра», «в пятницу».
export function parseIntentLocal(transcript: string, today: string = todayISO()): VoiceIntent {
  const text = transcript.trim().replace(/\s+/g, ' ');
  const local = (action: VoiceAction, entity: VoiceEntity, fields: Record<string, string>) =>
    normalizeIntent({ action, entity, fields }, transcript, 'local');

  const client = CREATE_CLIENT_RE.exec(text);
  if (client) {
    const parsed = parseClient(client[1] ?? '');
    return local('create', 'client', parsed.fields);
  }

  const noteTo = NOTE_TO_RE.exec(text);
  if (noteTo) {
    const fields: Record<string, string> = { target: entityOf(noteTo[1]) };
    const rest = noteTo[2] ?? '';
    const split = NOTE_SPLIT_RE.exec(rest);
    if (split && split.index > 0) {
      fields.ref = rest.slice(0, split.index).trim();
      const body = rest.slice(split.index + split[0].length).trim();
      if (body) fields.note = body;
    } else if (rest.trim()) {
      // Без разделителя: где кончается «Ольги» и начинается текст, решит
      // команда по списку клиентов и проектов (referencePrefixLength).
      fields.ref = rest.trim();
      fields.refWithNote = '1';
    }
    return local('create', 'note', fields);
  }

  const remind = REMIND_RE.exec(text);
  if (remind) {
    const rest = remind[1] ?? '';
    const dates = findDates(rest, today);
    const fields: Record<string, string> = {};
    if (dates.length) fields.date = dates[0].date!;
    const body = stripMatches(rest, dates).replace(/^(?:что|о том, что|о том что|про|об?)\s+/iu, '').trim();
    if (body) fields.note = body;
    return local('create', 'reminder', fields);
  }

  const cancel = CANCEL_RE.exec(text);
  if (cancel) {
    return local('cancel', entityOf(cancel[1]) === 'consultation' ? 'consultation' : 'session', scheduleFields(cancel[2] ?? '', today));
  }

  const complete = COMPLETE_PROJECT_RE.exec(text);
  if (complete) {
    const ref = (complete[1] ?? '').trim();
    return local('complete', 'project', ref ? { ref } : {});
  }

  const schedule = SCHEDULE_RE.exec(text);
  if (schedule && /(?<!\p{L})(?:у меня|сегодня|завтра|послезавтра|расписание|план|записи|запланировано|понедельник|вторник|сред|четверг|пятниц|суббот|воскресень|\d)/iu.test(text)) {
    const dates = findDates(text, today);
    return local('ask', 'schedule', { date: dates[0]?.date ?? today });
  }

  const open = OPEN_RE.exec(text);
  if (open) {
    const entity = open[1] && /^проект/i.test(open[1]) ? 'project' : 'client';
    return local('open', entity, { ref: open[2].trim() });
  }

  const move = MOVE_RE.exec(text);
  if (move) {
    return local('move', entityOf(move[1]) === 'consultation' ? 'consultation' : 'session', scheduleFields(move[2] ?? '', today));
  }

  const session = CREATE_SESSION_RE.exec(text);
  if (session) return local('create', 'session', cardFields('session', session[1] ?? '', today));

  const consultation = CREATE_CONSULTATION_RE.exec(text);
  if (consultation) return local('create', 'consultation', cardFields('consultation', consultation[1] ?? '', today));

  const project = CREATE_PROJECT_RE.exec(text);
  if (project) {
    const card = extractCardFields('project', project[1] ?? '');
    const fields: Record<string, string> = { ...card.fields };
    let rest = card.head;
    // «проект Дракон для Ольги Петровой» / «проект Дракон, клиент Ольга»
    const forClient = /(?<!\p{L})(?:для|клиент\p{L}*)(?!\p{L})\s+(.*)$/iu.exec(rest);
    if (forClient) {
      if (forClient[1].trim()) fields.client = forClient[1].replace(/[,.]+$/g, '').trim();
      rest = rest.slice(0, forClient.index);
    }
    const title = rest.replace(/^(?:под\s+)?названи\p{L}*\s+/iu, '').replace(/[,.:;—-]+$/g, '').trim();
    if (title) fields.title = capitalize(title);
    return local('create', 'project', fields);
  }

  return normalizeIntent({ action: 'unknown' }, transcript, 'local');
}
