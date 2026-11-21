// ============================================================
// ПОЛНАЯ КАРТОЧКА ИЗ ДИКТОВКИ — локальный запасной разбор.
//
// Мастер диктует по теме: «сессия для Ольги завтра в 12 на 4 часа, стиль
// дотворк, зона левое предплечье, цвета чёрный и серый, иглы 3RL и 7RM».
// Модель на сервере понимает и свободный рассказ; здесь — разбор по
// словам-меткам («стиль …», «зона …», «иглы …»): значение метки — текст до
// следующей метки. Чего не назвали — остаётся пустым, не выдумываем.
// ============================================================

export type CardKind = 'session' | 'consultation' | 'project';

interface Label {
  key: string;
  re: string; // слово-метка, без границ
}

const COMMON: Label[] = [
  { key: 'style', re: 'стиль|стилистика|техника' },
  { key: 'area', re: 'зона|место|часть тела|расположение' },
  { key: 'note', re: 'заметка|заметки|примечание|комментарий' },
];

const LABELS: Record<CardKind, Label[]> = {
  session: [
    ...COMMON,
    { key: 'title', re: 'название|назови' },
    { key: 'colors', re: 'цвета|цвет|краски|пигменты' },
    { key: 'needles', re: 'иглы|игла|иглами|конфигурация игл' },
    { key: 'skinReaction', re: 'реакция кожи|реакция|кожа' },
  ],
  consultation: [
    ...COMMON,
    { key: 'feeling', re: 'ощущение|чувство|настроение' },
    { key: 'creative', re: 'креатив|изюминка|фишка' },
    { key: 'inspirationSources', re: 'источники вдохновения|вдохновение|референсы|референс' },
    { key: 'outcome', re: 'итог|результат|договорились' },
  ],
  project: [
    ...COMMON,
    { key: 'creative', re: 'идеи|идея' },
    { key: 'nextActionText', re: 'следующий шаг|дальше' },
    { key: 'firstSessionDate', re: 'первая сессия|первый сеанс' },
  ],
};

// Метки, которые сами по себе — значение (а не «метка: значение»).
const FLAGS: Record<CardKind, { key: string; value: string; re: RegExp }[]> = {
  session: [
    { key: 'status', value: 'done', re: /(?<!\p{L})(?:выполнена|сделали|сделала|прошла|уже была|закончили)(?!\p{L})/iu },
  ],
  consultation: [
    { key: 'urgency', value: 'urgent', re: /(?<!\p{L})срочн\p{L}*/iu },
    { key: 'urgency', value: 'interesting', re: /(?<!\p{L})интересн\p{L}*/iu },
  ],
  project: [
    { key: 'category', value: 'drawing', re: /(?<!\p{L})рисун\p{L}*/iu },
    { key: 'category', value: 'collab', re: /(?<!\p{L})коллаб\p{L}*/iu },
    { key: 'sessionsPlan', value: 'single', re: /(?<!\p{L})(?:одна встреча|в один сеанс|за один сеанс|за одну сессию|в одну сессию)(?!\p{L})/iu },
    { key: 'sessionsPlan', value: 'multiple', re: /(?<!\p{L})(?:несколько (?:сессий|сеансов|встреч)|больше одной)(?!\p{L})/iu },
  ],
};

// «на 4 часа», «длительность 3 часа» → «4 ч» (как в форме сессии).
// «в 3 часа» — это время, а не длительность, поэтому только «на»/«длительность».
const DURATION_RE = /(?<!\p{L})(?:длительность|продолжительность|на)\s+(\d{1,2})(?:[.,](5))?\s*(?:час(?:а|ов)?|ч)(?!\p{L})(?!\s+(?:утра|дня|вечера|ночи))/iu;

export interface CardExtract {
  fields: Record<string, string>;
  // Текст до первой метки: кто, когда («для Ольги завтра в 12»).
  head: string;
}

export function extractCardFields(kind: CardKind, text: string): CardExtract {
  const fields: Record<string, string> = {};
  let rest = text;

  if (kind === 'session') {
    const duration = DURATION_RE.exec(rest);
    if (duration) {
      fields.duration = duration[2] ? `${duration[1]},5 ч` : `${duration[1]} ч`;
      rest = rest.slice(0, duration.index) + ' ' + rest.slice(duration.index + duration[0].length);
    }
  }

  for (const flag of FLAGS[kind]) {
    const m = flag.re.exec(rest);
    if (m && !fields[flag.key]) {
      fields[flag.key] = flag.value;
      rest = rest.slice(0, m.index) + ' ' + rest.slice(m.index + m[0].length);
    }
  }

  const labels = LABELS[kind];
  const all = new RegExp(
    `(?:^|[\\s,.;])(${labels.map((l) => l.re).join('|')})(?!\\p{L})\\s*[:—-]?\\s*`,
    'giu',
  );
  const hits: { key: string; start: number; valueStart: number }[] = [];
  for (const m of rest.matchAll(all)) {
    const word = m[1].toLowerCase();
    const label = labels.find((l) => new RegExp(`^(?:${l.re})$`, 'iu').test(word));
    if (!label || m.index === undefined) continue;
    if (hits.some((h) => h.key === label.key)) continue; // первое упоминание
    hits.push({ key: label.key, start: m.index, valueStart: m.index + m[0].length });
  }
  hits.sort((a, b) => a.start - b.start);
  hits.forEach((hit, i) => {
    const end = i + 1 < hits.length ? hits[i + 1].start : rest.length;
    const value = rest
      .slice(hit.valueStart, end)
      .replace(/^[\s,.;:—-]+|[\s,.;:—-]+$/g, '')
      .trim();
    if (value) fields[hit.key] = value;
  });

  const head = (hits.length ? rest.slice(0, hits[0].start) : rest).replace(/\s+/g, ' ').trim();
  return { fields, head };
}
