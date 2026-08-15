export const INSTALLATION_ID_STORAGE_KEY = 'inka-installation-id';

export interface BackupSourceIdentity {
  installationId: string | null;
  ownerName: string;
}

export type BackupSourceRelation =
  | 'same-installation'
  | 'same-owner'
  | 'different-owner'
  | 'other-installation'
  | 'unknown';

function createInstallationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// localStorage is intentionally used instead of an IndexedDB schema bump:
// the id labels the browser installation, not the diary data itself. Losing
// it only turns the next restore into «copy from another device»; it never
// makes data unreadable.
export function readOrCreateInstallationId(
  storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage,
  create: () => string = createInstallationId,
): string {
  try {
    const stored = storage.getItem(INSTALLATION_ID_STORAGE_KEY)?.trim();
    if (stored) return stored;
    const created = create();
    storage.setItem(INSTALLATION_ID_STORAGE_KEY, created);
    return created;
  } catch {
    // Storage can be unavailable in a locked-down/private context. Keep a
    // stable id for this mounted session; export itself will still work.
    return create();
  }
}

function normalizedOwnerName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru-RU');
}

export function compareBackupSource(
  source: BackupSourceIdentity,
  current: { installationId: string; ownerName: string },
): BackupSourceRelation {
  if (source.installationId && source.installationId === current.installationId) return 'same-installation';

  const sourceOwner = normalizedOwnerName(source.ownerName);
  const currentOwner = normalizedOwnerName(current.ownerName);
  if (sourceOwner && currentOwner) return sourceOwner === currentOwner ? 'same-owner' : 'different-owner';
  if (source.installationId && source.installationId !== current.installationId) return 'other-installation';
  return 'unknown';
}
