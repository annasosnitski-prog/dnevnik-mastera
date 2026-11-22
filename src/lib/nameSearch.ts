// Имена клиентов в данных бывают и кириллицей, и латиницей. Чтобы сортировка
// и поиск не делили список на два «алфавита», сравниваем по транслитерации:
// «Алекс» и «Alex» встают рядом, а запрос «alex» находит «Алекс» и наоборот.
// Сами имена в данных не меняются.
const MAP: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

export function nameKey(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/[а-яё]/g, (ch) => MAP[ch] ?? ch)
    .replace(/ks/g, 'x')
    .replace(/[^a-z0-9֐-׿ ]/g, '');
}

export function compareNames(a: string, b: string): number {
  return nameKey(a).localeCompare(nameKey(b), 'en');
}

// Совпадение по исходному тексту или по транслитерации.
export function nameMatches(text: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if ((text || '').toLowerCase().includes(q)) return true;
  return nameKey(text).includes(nameKey(q));
}

// ── Голос: русское произношение ↔ латинское/ивритское написание ──────────
// «Химера» ↔ «Chimera», «Нога» ↔ «Noga». Свёртываем оба написания к грубому
// «звуковому» ключу: близкие звуки (ch/kh/h/x, c/k, i/y/j, ph/f, w/v) дают
// одну букву, двойные буквы схлопываются.
const HEBREW: Record<string, string> = {
  א: 'a', ב: 'b', ג: 'g', ד: 'd', ה: 'h', ו: 'v', ז: 'z', ח: 'h', ט: 't', י: 'i', כ: 'k', ך: 'k',
  ל: 'l', מ: 'm', ם: 'm', נ: 'n', ן: 'n', ס: 's', ע: 'a', פ: 'p', ף: 'p', צ: 'ts', ץ: 'ts', ק: 'k',
  ר: 'r', ש: 'sh', ת: 't',
};

export function hasLatinOrHebrew(s: string): boolean {
  return /[a-z֐-׿]/i.test(s || '');
}
export function hasCyrillic(s: string): boolean {
  return /[а-яё]/i.test(s || '');
}

export function phoneticKey(s: string): string {
  const base = (s || '')
    .toLowerCase()
    .replace(/[֐-׿]/g, (ch) => HEBREW[ch] ?? '')
    .replace(/[а-яё]/g, (ch) => (ch === 'х' ? 'kh' : MAP[ch] ?? ch));
  return base
    .replace(/[^a-z]/g, '')
    .replace(/sch|sh|zh/g, 'S')
    .replace(/ts|tz/g, 'C')
    .replace(/ch|kh|h|x/g, 'H')
    .replace(/ph/g, 'f')
    .replace(/th/g, 't')
    .replace(/c(?=[eiy])/g, 's')
    .replace(/[cq]/g, 'k')
    .replace(/w/g, 'v')
    .replace(/ee|ie|ei/g, 'i')
    .replace(/oo|ou/g, 'u')
    .replace(/[yj]/g, 'i')
    .replace(/(.)\1+/g, '$1');
}

function editDistanceAtMost1(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : b.slice(i + 1) === a.slice(i);
}

// Слова разных алфавитов, звучащие похоже (с учётом окончаний и неточностей
// распознавания речи). Для слов одного алфавита всегда false.
export function crossScriptSameWord(a: string, b: string): boolean {
  const crossed = (hasCyrillic(a) && hasLatinOrHebrew(b)) || (hasCyrillic(b) && hasLatinOrHebrew(a));
  if (!crossed) return false;
  const ka = phoneticKey(a);
  const kb = phoneticKey(b);
  // Иврит пишут без гласных: сравниваем «скелет» согласных.
  if (/[\u0590-\u05ff]/.test(a + b)) {
    const sk = (k: string, raw: string) => {
      const t = k.replace(/[aeiou]/g, '');
      return /[\u0590-\u05ff]/.test(raw) ? t.replace(/H$/, '') : t;
    };
    const x = sk(ka, a);
    const y = sk(kb, b);
    return x.length >= 2 && (x === y || x === y.replace(/H$/, ''));
  }
  if (ka.length < 2 || kb.length < 2) return false;
  if (ka === kb) return true;
  const min = Math.min(ka.length, kb.length);
  if (min >= 4 && editDistanceAtMost1(ka, kb)) return true;
  // склонение: «Noga» ~ «Ноги», «Chimera» ~ «Химеры»
  const stem = (k: string) => (k.length > 3 ? k.slice(0, -1) : k);
  const sa = stem(ka);
  const sb = stem(kb);
  return min >= 4 && (sa === sb || sa === kb || ka === sb);
}
