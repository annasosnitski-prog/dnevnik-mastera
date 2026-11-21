export function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}.${m}.${y}`;
}

export function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

export function firstOfMonth(date?: Date): string {
  const d = date ?? new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

export function lastOfMonth(date?: Date): string {
  const d = date ?? new Date();
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const y = last.getFullYear();
  const m = String(last.getMonth() + 1).padStart(2, '0');
  const dd = String(last.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export function prevMonthRange(): { from: string; to: string } {
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return { from: firstOfMonth(prev), to: lastOfMonth(prev) };
}

export function formatCurrency(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  const n = Math.abs(amount).toLocaleString('ru-RU', { maximumFractionDigits: 2 });
  return `${sign}₪${n}`;
}

export const PAYMENT_RU: Record<string, string> = {
  cash: 'Наличные',
  bit: 'Bit',
  paybox: 'PayBox',
  transfer: 'Банковский перевод',
  card: 'Карта',
  check: 'Чек',
  other: 'Другое',
};

export const PAYMENT_HE: Record<string, string> = {
  cash: 'מזומן',
  bit: 'ביט',
  paybox: 'פייבוקס',
  transfer: 'העברה בנקאית',
  card: 'אשראי',
  check: "צ'ק",
  other: 'אחר',
};

export const PAYMENT_OPTIONS = [
  { value: 'cash', label: 'Наличные' },
  { value: 'bit', label: 'Bit' },
  { value: 'paybox', label: 'PayBox' },
  { value: 'transfer', label: 'Банковский перевод' },
  { value: 'card', label: 'Карта' },
  { value: 'check', label: 'Чек' },
  { value: 'other', label: 'Другое' },
] as const;
