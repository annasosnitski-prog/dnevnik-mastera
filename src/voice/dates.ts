// ============================================================
// ДАТЫ И ВРЕМЯ ИЗ РЕЧИ — локальный запасной разбор.
//
// «завтра в 14:00», «в пятницу», «25 ноября в 3 часа дня», «через неделю»,
// «28.11» → { date: 'YYYY-MM-DD', time: 'HH:MM' } + остаток фразы без
// этих кусков. Модель на сервере делает то же самое лучше; здесь — то, что
// нужно, чтобы голос работал без сети. Ничего не знает о React и часах:
// «сегодня» всегда приходит параметром, поэтому разбор покрыт тестами.
// ============================================================

import { isValidISODate, todayISO } from '../utils/dates.js';

export interface DateTimeMatch {
  date?: string;
  time?: string;
  index: number;
  length: number;
}

const L = '(?<!\\p{L})';
const R = '(?!\\p{L})';

const MONTHS: Record<string, number> = {
  январ: 1, феврал: 2, март: 3, апрел: 4, ма: 5, июн: 6,
  июл: 7, август: 8, сентябр: 9, октябр: 10, ноябр: 11, декабр: 12,
};
const MONTH_RE = '(январ[яь]|феврал[яь]|марта?|апрел[яь]|ма[яй]|июн[яь]|июл[яь]|августа?|сентябр[яь]|октябр[яь]|ноябр[яь]|декабр[яь])';

const WEEKDAYS: [RegExp, number][] = [
  [/^понедельник/, 1],
  [/^вторник/, 2],
  [/^сред/, 3],
  [/^четверг/, 4],
  [/^пятниц/, 5],
  [/^суббот/, 6],
  [/^воскресень/, 0],
];

const pad = (n: number) => String(n).padStart(2, '0');

function addDays(today: string, days: number): string {
  const [y, m, d] = today.split('-').map(Number);
  return todayISO(new Date(y, m - 1, d + days));
}

function monthNumber(word: string): number {
  const w = word.toLowerCase();
  for (const [stem, n] of Object.entries(MONTHS)) {
    if (stem === 'ма' ? /^ма[яй]$/.test(w) : w.startsWith(stem)) return n;
  }
  return 0;
}

// Ближайший год, при котором дата не в прошлом: «5 января», сказанное
// в ноябре, — это следующий январь.
function withYear(today: string, month: number, day: number, year?: number): string | undefined {
  const y0 = Number(today.slice(0, 4));
  let iso = `${year ?? y0}-${pad(month)}-${pad(day)}`;
  if (!year && iso < today) iso = `${y0 + 1}-${pad(month)}-${pad(day)}`;
  return isValidISODate(iso) ? iso : undefined;
}

type Rule = { re: RegExp; date: (m: RegExpExecArray, today: string) => string | undefined };

const DATE_RULES: Rule[] = [
  { re: new RegExp(`${L}(\\d{4})-(\\d{2})-(\\d{2})${R}`, 'u'), date: (m) => (isValidISODate(m[0]) ? m[0] : undefined) },
  {
    re: new RegExp(`${L}(?:(?:на|в|во|к)\\s+)?(\\d{1,2})\\s+${MONTH_RE}(?:\\s+(\\d{4}))?${R}`, 'iu'),
    date: (m, t) => withYear(t, monthNumber(m[2]), Number(m[1]), m[3] ? Number(m[3]) : undefined),
  },
  {
    re: /(?<![\d:])(?:(?:на|в|во|к)\s+)?(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?(?![\d:])/iu,
    date: (m, t) => {
      const year = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : undefined;
      return withYear(t, Number(m[2]), Number(m[1]), year);
    },
  },
  { re: new RegExp(`${L}(?:на\\s+)?послезавтра${R}`, 'iu'), date: (_m, t) => addDays(t, 2) },
  { re: new RegExp(`${L}(?:на\\s+)?завтра${R}`, 'iu'), date: (_m, t) => addDays(t, 1) },
  { re: new RegExp(`${L}(?:на\\s+)?сегодня${R}`, 'iu'), date: (_m, t) => t },
  {
    re: new RegExp(`${L}через\\s+(\\d+|одну|один|две|два|три|четыре)?\\s*(день|дня|дней|недел[юиь]|месяц|месяца|месяцев)${R}`, 'iu'),
    date: (m, t) => {
      const words: Record<string, number> = { одну: 1, один: 1, две: 2, два: 2, три: 3, четыре: 4 };
      const n = m[1] ? (words[m[1].toLowerCase()] ?? Number(m[1])) : 1;
      const unit = m[2].toLowerCase();
      if (unit.startsWith('д')) return addDays(t, n);
      if (unit.startsWith('н')) return addDays(t, n * 7);
      const [y, mo, d] = t.split('-').map(Number);
      return todayISO(new Date(y, mo - 1 + n, d));
    },
  },
  {
    re: new RegExp(
      `${L}(?:(?:на|в|во)\\s+)?(?:(следующ\\p{L}*)\\s+)?(понедельник|вторник|среду|среда|четверг|пятницу|пятница|субботу|суббота|воскресенье)${R}`,
      'iu',
    ),
    date: (m, t) => {
      const word = m[2].toLowerCase();
      const target = WEEKDAYS.find(([re]) => re.test(word))?.[1] ?? 0;
      const [y, mo, d] = t.split('-').map(Number);
      const current = new Date(y, mo - 1, d).getDay();
      // «в пятницу», сказанное в пятницу, — это следующая пятница.
      let delta = (target - current + 7) % 7 || 7;
      if (m[1] && delta < 7) delta += 7;
      return addDays(t, delta);
    },
  },
];

const TIME_RULES: { re: RegExp; time: (m: RegExpExecArray) => string | undefined }[] = [
  {
    re: /(?<![\d.])(?:(?:в|к|на|с)\s+)?(\d{1,2})[:.](\d{2})(?![\d.])/iu,
    time: (m) => hhmm(Number(m[1]), Number(m[2])),
  },
  {
    re: new RegExp(`${L}(?:в|к|на)\\s+(\\d{1,2})(?:\\s+час(?:а|ов)?)?(?:\\s+(утра|дня|вечера|ночи))?${R}(?![.:/]?\\d)(?!\\s+${MONTH_RE})`, 'iu'),
    time: (m) => {
      let h = Number(m[1]);
      const part = m[2]?.toLowerCase();
      if ((part === 'дня' || part === 'вечера') && h < 12) h += 12;
      if (part === 'ночи' && h === 12) h = 0;
      return hhmm(h, 0);
    },
  },
];

function hhmm(h: number, min: number): string | undefined {
  if (h > 23 || min > 59) return undefined;
  return `${pad(h)}:${pad(min)}`;
}

// Все упоминания дат по порядку — для «перенеси с 25 ноября на 28 ноября»
// первая дата значит «какую», последняя — «куда».
export function findDates(text: string, today: string): DateTimeMatch[] {
  const found: DateTimeMatch[] = [];
  let masked = text;
  for (const rule of DATE_RULES) {
    const re = new RegExp(rule.re.source, rule.re.flags.includes('g') ? rule.re.flags : rule.re.flags + 'g');
    for (const m of masked.matchAll(re)) {
      const date = rule.date(m as RegExpExecArray, today);
      if (!date || m.index === undefined) continue;
      found.push({ date, index: m.index, length: m[0].length });
      masked = masked.slice(0, m.index) + ' '.repeat(m[0].length) + masked.slice(m.index + m[0].length);
    }
  }
  return found.sort((a, b) => a.index - b.index);
}

export function findTimes(text: string): DateTimeMatch[] {
  const found: DateTimeMatch[] = [];
  let masked = text;
  for (const rule of TIME_RULES) {
    const re = new RegExp(rule.re.source, rule.re.flags + 'g');
    for (const m of masked.matchAll(re)) {
      const time = rule.time(m as RegExpExecArray);
      if (!time || m.index === undefined) continue;
      found.push({ time, index: m.index, length: m[0].length });
      masked = masked.slice(0, m.index) + ' '.repeat(m[0].length) + masked.slice(m.index + m[0].length);
    }
  }
  return found.sort((a, b) => a.index - b.index);
}

// Вырезает найденные куски, оставляя пробелы, — остаток уходит в разбор
// имени клиента/проекта.
export function stripMatches(text: string, matches: DateTimeMatch[]): string {
  let out = text;
  for (const m of [...matches].sort((a, b) => b.index - a.index)) {
    out = out.slice(0, m.index) + ' ' + out.slice(m.index + m.length);
  }
  return out.replace(/\s+/g, ' ').trim();
}

// Значение от модели или из речи → ISO, если это дата; иначе — локальный
// разбор того же текста («в пятницу»). Неразборчивое — undefined.
export function normalizeDate(value: string | undefined, today: string): string | undefined {
  if (!value) return undefined;
  if (isValidISODate(value)) return value;
  return findDates(value, today)[0]?.date;
}

export function normalizeTime(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (m) return hhmm(Number(m[1]), Number(m[2]));
  const spoken = findTimes(/^\d/.test(value.trim()) ? `в ${value}` : value)[0];
  return spoken?.time;
}
