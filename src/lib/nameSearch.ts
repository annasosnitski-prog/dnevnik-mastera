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
