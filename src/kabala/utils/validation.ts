import { formatDate, todayStr } from './formatting';

export function validateDate(
  newDate: string,
  lastSavedDate: string | null
): string | null {
  const today = todayStr();
  if (!newDate) return 'Укажите дату';
  if (newDate > today) return 'Дата не может быть в будущем';
  if (lastSavedDate && newDate < lastSavedDate) {
    return `Не раньше последней кабалы (${formatDate(lastSavedDate)})`;
  }
  return null;
}

export function validateReceiptForm(
  date: string,
  clientName: string,
  description: string,
  unitPrice: number,
  lastSavedDate: string | null
): Record<string, string> {
  const errors: Record<string, string> = {};

  const dateErr = validateDate(date, lastSavedDate);
  if (dateErr) errors.date = dateErr;
  if (!clientName.trim()) errors.clientName = 'Укажите имя клиента';
  if (!description.trim()) errors.description = 'Укажите описание';
  if (!unitPrice || unitPrice <= 0) errors.unitPrice = 'Цена должна быть больше 0';

  return errors;
}
