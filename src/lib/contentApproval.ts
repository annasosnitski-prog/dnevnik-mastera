export type ContentEntryStatus = 'draft' | 'confirmed';

export function normalizeContentEntry<T extends object>(
  entry: T,
): T & { status: ContentEntryStatus; isExemplar: boolean } {
  const persisted = entry as T & { status?: unknown; isExemplar?: unknown };
  return {
    ...entry,
    status: persisted.status === 'confirmed' ? 'confirmed' : 'draft',
    isExemplar: persisted.isExemplar === true,
  };
}

export function confirmContentEntry<T extends { status?: unknown }>(entry: T): T & { status: 'confirmed' } {
  return { ...entry, status: 'confirmed' };
}

export function setContentEntryExemplar<T extends { status?: unknown; isExemplar?: unknown }>(
  entry: T,
  isExemplar: boolean,
): T {
  if (entry.status !== 'confirmed') return entry;
  return { ...entry, isExemplar };
}

export function createDraftContentEntry<T extends object>(
  values: T,
  existingEntries: readonly { id: string }[],
  now: () => number = Date.now,
): T & { id: string; status: 'draft'; isExemplar: false } {
  const existingIds = new Set(existingEntries.map((entry) => entry.id));
  const baseId = String(now());
  let id = baseId;
  let suffix = 1;

  while (existingIds.has(id)) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
  }

  return {
    ...values,
    id,
    status: 'draft',
    isExemplar: false,
  };
}
