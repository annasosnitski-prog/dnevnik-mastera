// ============================================================
// ГОЛОСОВЫЕ НАМЕРЕНИЯ — общая форма, в которую превращается фраза.
//
// Фраза («новый клиент Ольга Петрова, телефон 8 999 …») → VoiceIntent
// {действие, сущность, поля}. Разбирает её серверный эндпоинт с дешёвой
// моделью (supabase/functions/voice-intent), а если он недоступен
// (устройство не привязано к синку, нет сети, ключ не настроен) —
// локальный разборщик ниже. Оба пути проходят через normalizeIntent,
// так что дальше по цепочке форма всегда одна и та же.
//
// Форма намеренно шире, чем умеет первая команда: действия и сущности
// уже перечислены для будущих команд (новый проект, сессия, закрытие
// сессии с заметками, пост/сториз, навигация, вопросы о заживлении), но
// реестр команд (commands.ts) пока знает только «новый клиент».
// ============================================================

export const VOICE_ACTIONS = ['create', 'open', 'update', 'complete', 'generate', 'ask', 'unknown'] as const;
export type VoiceAction = (typeof VOICE_ACTIONS)[number];

export const VOICE_ENTITIES = ['client', 'project', 'session', 'consultation', 'note', 'content', 'screen'] as const;
export type VoiceEntity = (typeof VOICE_ENTITIES)[number];

export interface VoiceIntent {
  action: VoiceAction;
  entity: VoiceEntity | null;
  // Плоский словарь строк: name, surname, phone, note, client, project,
  // date, … Каждая команда сама решает, какие ключи ей нужны.
  fields: Record<string, string>;
  transcript: string;
  source: 'llm' | 'local';
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
  return { action, entity, fields, transcript, source };
}

const capitalize = (word: string) => (word ? word[0].toUpperCase() + word.slice(1) : word);

// \b в JS-регэкспах понимает только латиницу, поэтому границы слов для
// кириллицы — через \p{L} и флаг u.
//
// Телефон: + и минимум 7 цифр, между ними пробелы/дефисы/скобки. Распознавание
// речи часто отдаёт номер кусками («8 999 123 45 67») — склеиваем.
const PHONE_RE = /\+?\d[\d\s\-()]{5,}\d/;

const CREATE_CLIENT_RE = /^(?:новый|новая|новую|создай|создать|добавь|добавить|заведи)\s+(?:(?:нового|новую|новый)\s+)?клиент(?:а|ку|ка)?(?!\p{L})[\s,.:—-]*(.*)$/iu;
const NOTE_RE = /\s*[,.]?\s*(?<!\p{L})(?:заметка|заметки|примечание|комментарий)(?!\p{L})\s*[:,—-]?\s*(.*)$/iu;

// Резервный разбор без сети — только то, что нужно зарегистрированным
// командам. Всё, что не узнали, — action: 'unknown', и UI честно скажет,
// что команда не понята.
export function parseIntentLocal(transcript: string): VoiceIntent {
  const text = transcript.trim().replace(/\s+/g, ' ');
  const create = CREATE_CLIENT_RE.exec(text);
  if (!create) return normalizeIntent({ action: 'unknown' }, transcript, 'local');

  let rest = create[1] ?? '';
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

  return normalizeIntent({ action: 'create', entity: 'client', fields }, transcript, 'local');
}
