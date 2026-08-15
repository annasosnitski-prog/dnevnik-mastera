import {
  BlobReader,
  Data64URIReader,
  Data64URIWriter,
  TextReader,
  TextWriter,
  ZipReader,
  ZipWriter,
  type Entry,
  type FileEntry,
} from '@zip.js/zip.js';
import { CONTENT_INGEST_JOB_STORE, TATTO_DIARY_DB_VERSION } from './contentJobQueue.js';
import { normalizeContentEntry } from './contentApproval.js';
import { MASTER_INFO_RECORD_ID, MASTER_INFO_STORE, normalizeMasterInfo, type MasterInfo } from './masterInfoStore.js';
import { normalizeClient, normalizeProject } from './normalize.js';

const BACKUP_FORMAT = 'inka-backup';
export const BACKUP_ARCHIVE_VERSION = 6;
const BACKUP_DIRECTORY = 'inka-prepared-backups';
const MANIFEST_PATH = 'manifest.json';
const ERROR_LOG_PATH = 'diagnostics/errorLog.json';
const MAX_JSON_ENTRY_BYTES = 64 * 1024 * 1024;
const MIN_FREE_SPACE_BYTES = 64 * 1024 * 1024;

const STORE_PATHS = {
  clients: 'data/clients/',
  projects: 'data/projects/',
  contentEntries: 'data/contentEntries/',
} as const;

type BackupStore = keyof typeof STORE_PATHS;

export interface BackupArchiveManifest {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_ARCHIVE_VERSION;
  scope: 'full';
  exportedAt: string;
  sourceDbVersion: number;
  counts: Record<BackupStore, number>;
  hasMasterInfo: boolean;
  mediaCount: number;
}

export interface BackupArchiveSummary {
  version: typeof BACKUP_ARCHIVE_VERSION;
  exportedAt: string;
  counts: Record<BackupStore, number>;
  hasMasterInfo: boolean;
  mediaCount: number;
  archiveBytes: number;
}

export type BackupArchivePhase = BackupStore | 'masterInfo' | 'diagnostics' | 'finishing' | 'importing';

export interface BackupArchiveProgress {
  phase: BackupArchivePhase;
  completed: number;
  total: number;
  mediaCount: number;
}

export interface PreparedBackupArchive {
  file: File;
  filename: string;
  summary: BackupArchiveSummary;
  cleanup: () => Promise<void>;
}

export interface PrepareBackupArchiveOptions {
  masterFallback: unknown;
  errorLog: unknown;
  signal?: AbortSignal;
  onProgress?: (progress: BackupArchiveProgress) => void;
  now?: Date;
}

export interface ImportBackupArchiveOptions {
  signal?: AbortSignal;
  onProgress?: (progress: BackupArchiveProgress) => void;
}

export interface ImportBackupArchiveResult {
  summary: BackupArchiveSummary;
  masterInfo: MasterInfo | null;
}

interface MediaReference {
  __inkaBackupMedia: string;
  mime: string;
}

interface ArchiveIndex {
  manifest: BackupArchiveManifest;
  entries: Map<string, FileEntry>;
  storeEntries: Record<BackupStore, FileEntry[]>;
  mediaEntries: Map<string, FileEntry>;
  masterEntry: FileEntry | null;
}

export class BackupArchiveUnsupportedError extends Error {
  constructor() {
    super('Это устройство не умеет готовить большой архив без загрузки его целиком в память. Обновите браузер и попробуйте снова.');
    this.name = 'BackupArchiveUnsupportedError';
  }
}

export class BackupArchiveSpaceError extends Error {
  constructor(requiredBytes = MIN_FREE_SPACE_BYTES, availableBytes = 0) {
    const requiredMb = Math.ceil(requiredBytes / (1024 * 1024));
    const availableMb = Math.max(0, Math.floor(availableBytes / (1024 * 1024)));
    super(`Для подготовки копии нужно примерно ${requiredMb} МБ свободного места, сейчас доступно ${availableMb} МБ.`);
    this.name = 'BackupArchiveSpaceError';
  }
}

export class InvalidBackupArchiveError extends Error {
  constructor(message = 'Файл не похож на резервную копию INKA.') {
    super(message);
    this.name = 'InvalidBackupArchiveError';
  }
}

function abortError(): DOMException {
  return new DOMException('Операция отменена.', 'AbortError');
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

async function readStoreKeys(db: IDBDatabase, store: BackupStore): Promise<IDBValidKey[]> {
  const tx = db.transaction(store, 'readonly');
  return requestValue(tx.objectStore(store).getAllKeys());
}

async function readStoreRecord(db: IDBDatabase, store: BackupStore, key: IDBValidKey): Promise<unknown> {
  const tx = db.transaction(store, 'readonly');
  return requestValue(tx.objectStore(store).get(key));
}

async function readMasterRecord(db: IDBDatabase): Promise<unknown> {
  const tx = db.transaction(MASTER_INFO_STORE, 'readonly');
  return (await requestValue(tx.objectStore(MASTER_INFO_STORE).get(MASTER_INFO_RECORD_ID))) ?? null;
}

function dataUrlMime(value: string): string | null {
  const match = /^data:([^;,\s]+)(?:;[^,]*)?;base64,/i.exec(value);
  return match ? match[1].toLowerCase() : null;
}

function mediaExtension(mime: string): string {
  const known: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/heic': 'heic',
    'image/heif': 'heif',
    'application/pdf': 'pdf',
  };
  return known[mime] ?? 'bin';
}

function isMediaReference(value: unknown): value is MediaReference {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    Object.keys(candidate).length === 2 &&
    typeof candidate.__inkaBackupMedia === 'string' &&
    typeof candidate.mime === 'string'
  );
}

/**
 * Replaces every base64 data URL recursively, not just current `photos`
 * fields. This also covers document.fileUrl and future media fields without
 * retaining a second copy of their contents in a giant JSON string.
 */
export async function detachBackupMedia(
  value: unknown,
  addMedia: (dataUrl: string, mime: string) => Promise<string>,
): Promise<unknown> {
  if (typeof value === 'string') {
    const mime = dataUrlMime(value);
    if (!mime) return value;
    return { __inkaBackupMedia: await addMedia(value, mime), mime } satisfies MediaReference;
  }
  if (Array.isArray(value)) {
    const output: unknown[] = [];
    for (const item of value) output.push(await detachBackupMedia(item, addMedia));
    return output;
  }
  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      output[key] = await detachBackupMedia(child, addMedia);
    }
    return output;
  }
  return value;
}

export async function hydrateBackupMedia(
  value: unknown,
  readMedia: (path: string, mime: string) => Promise<string>,
): Promise<unknown> {
  if (isMediaReference(value)) return readMedia(value.__inkaBackupMedia, value.mime);
  if (Array.isArray(value)) {
    const output: unknown[] = [];
    for (const item of value) output.push(await hydrateBackupMedia(item, readMedia));
    return output;
  }
  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      output[key] = await hydrateBackupMedia(child, readMedia);
    }
    return output;
  }
  return value;
}

function integerCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

export function parseBackupArchiveManifest(value: unknown): BackupArchiveManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InvalidBackupArchiveError();
  const raw = value as Record<string, any>;
  if (raw.format !== BACKUP_FORMAT || raw.version !== BACKUP_ARCHIVE_VERSION || raw.scope !== 'full') {
    throw new InvalidBackupArchiveError('Эта версия резервной копии пока не поддерживается.');
  }
  if (
    typeof raw.exportedAt !== 'string' ||
    !raw.counts ||
    !integerCount(raw.counts.clients) ||
    !integerCount(raw.counts.projects) ||
    !integerCount(raw.counts.contentEntries) ||
    typeof raw.hasMasterInfo !== 'boolean' ||
    !integerCount(raw.mediaCount)
  ) {
    throw new InvalidBackupArchiveError('В резервной копии повреждено описание данных.');
  }
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_ARCHIVE_VERSION,
    scope: 'full',
    exportedAt: raw.exportedAt,
    sourceDbVersion: integerCount(raw.sourceDbVersion) ? raw.sourceDbVersion : 0,
    counts: {
      clients: raw.counts.clients,
      projects: raw.counts.projects,
      contentEntries: raw.counts.contentEntries,
    },
    hasMasterInfo: raw.hasMasterInfo,
    mediaCount: raw.mediaCount,
  };
}

function asFileEntry(entry: Entry | undefined, path: string): FileEntry {
  if (!entry || entry.directory) throw new InvalidBackupArchiveError(`В копии отсутствует ${path}.`);
  return entry;
}

async function readJsonEntry(entry: FileEntry): Promise<unknown> {
  if (entry.uncompressedSize > MAX_JSON_ENTRY_BYTES) {
    throw new InvalidBackupArchiveError('Одна из служебных записей копии имеет недопустимый размер.');
  }
  try {
    return JSON.parse(await entry.getData(new TextWriter()));
  } catch (error) {
    if (error instanceof InvalidBackupArchiveError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new InvalidBackupArchiveError('Не удалось прочитать данные внутри резервной копии.');
  }
}

async function indexArchive(file: Blob, signal?: AbortSignal): Promise<{ reader: ZipReader<Blob>; index: ArchiveIndex }> {
  throwIfAborted(signal);
  const reader = new ZipReader(new BlobReader(file), { useWebWorkers: false });
  try {
    const rawEntries = await reader.getEntries();
    throwIfAborted(signal);
    const entries = new Map<string, FileEntry>();
    for (const entry of rawEntries) {
      if (entry.directory) continue;
      if (entries.has(entry.filename)) throw new InvalidBackupArchiveError('В копии повторяются служебные записи.');
      entries.set(entry.filename, entry);
    }

    const manifest = parseBackupArchiveManifest(await readJsonEntry(asFileEntry(entries.get(MANIFEST_PATH), MANIFEST_PATH)));
    const storeEntries = {} as Record<BackupStore, FileEntry[]>;
    for (const store of Object.keys(STORE_PATHS) as BackupStore[]) {
      storeEntries[store] = [...entries.values()]
        .filter((entry) => entry.filename.startsWith(STORE_PATHS[store]) && entry.filename.endsWith('.json'))
        .sort((a, b) => a.filename.localeCompare(b.filename));
      if (storeEntries[store].length !== manifest.counts[store]) {
        throw new InvalidBackupArchiveError(`В копии повреждён раздел ${store}.`);
      }
    }
    const mediaEntries = new Map(
      [...entries.values()].filter((entry) => entry.filename.startsWith('media/')).map((entry) => [entry.filename, entry]),
    );
    if (mediaEntries.size !== manifest.mediaCount) {
      throw new InvalidBackupArchiveError('В копии отсутствует часть фотографий.');
    }
    const masterEntry = entries.get('data/masterInfo.json') ?? null;
    if (Boolean(masterEntry) !== manifest.hasMasterInfo) {
      throw new InvalidBackupArchiveError('В копии повреждён личный кабинет.');
    }
    return { reader, index: { manifest, entries, storeEntries, mediaEntries, masterEntry } };
  } catch (error) {
    await reader.close().catch(() => undefined);
    if (error instanceof InvalidBackupArchiveError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new InvalidBackupArchiveError('Не удалось открыть резервную копию INKA.');
  }
}

function summaryFromManifest(manifest: BackupArchiveManifest, archiveBytes: number): BackupArchiveSummary {
  return {
    version: manifest.version,
    exportedAt: manifest.exportedAt,
    counts: manifest.counts,
    hasMasterInfo: manifest.hasMasterInfo,
    mediaCount: manifest.mediaCount,
    archiveBytes,
  };
}

export async function inspectBackupArchive(file: Blob, signal?: AbortSignal): Promise<BackupArchiveSummary> {
  const { reader, index } = await indexArchive(file, signal);
  try {
    return summaryFromManifest(index.manifest, file.size);
  } finally {
    await reader.close();
  }
}

async function checkFreeSpace(): Promise<void> {
  try {
    const estimate = await navigator.storage?.estimate?.();
    if (typeof estimate?.quota !== 'number' || typeof estimate.usage !== 'number') return;
    // Base64 media becomes binary in the ZIP (roughly 3/4 of its stored text
    // size). 0.8 leaves a little room for JSON and ZIP headers. The origin is
    // dedicated to the diary, so current usage is a useful conservative
    // estimate of the archive's upper bound.
    const required = Math.max(MIN_FREE_SPACE_BYTES, estimate.usage * 0.8);
    const available = estimate.quota - estimate.usage;
    if (available < required) throw new BackupArchiveSpaceError(required, available);
  } catch (error) {
    if (error instanceof BackupArchiveSpaceError) throw error;
    // Browsers are allowed to withhold the estimate; the real write still
    // reports quota exhaustion and is handled by the caller.
  }
}

function archiveFilename(now: Date): string {
  return `inka-backup-${now.toISOString().slice(0, 10)}.inka.zip`;
}

function serialPath(prefix: string, index: number): string {
  return `${prefix}${String(index + 1).padStart(8, '0')}.json`;
}

export async function prepareBackupArchive(
  db: IDBDatabase,
  options: PrepareBackupArchiveOptions,
): Promise<PreparedBackupArchive> {
  const getDirectory = (navigator.storage as StorageManager & {
    getDirectory?: () => Promise<FileSystemDirectoryHandle>;
  } | undefined)?.getDirectory;
  if (!getDirectory) throw new BackupArchiveUnsupportedError();
  throwIfAborted(options.signal);
  const root = await getDirectory.call(navigator.storage);
  const directory = await root.getDirectoryHandle(BACKUP_DIRECTORY, { create: true });
  const now = options.now ?? new Date();
  const filename = archiveFilename(now);
  // A prepared-but-not-shared copy from an interrupted attempt must not make
  // the quota preflight count that same output twice.
  await directory.removeEntry(filename).catch(() => undefined);
  await checkFreeSpace();
  const fileHandle = await directory.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  const writer = new ZipWriter(writable, {
    bufferedWrite: false,
    level: 0,
    useWebWorkers: false,
  });

  const cleanup = async () => {
    try {
      await directory.removeEntry(filename);
    } catch {
      // Temp cleanup is best-effort; failure never invalidates a copy already
      // handed to the user.
    }
  };

  try {
    const keys = {
      clients: await readStoreKeys(db, 'clients'),
      projects: await readStoreKeys(db, 'projects'),
      contentEntries: await readStoreKeys(db, 'contentEntries'),
    };
    const storedMaster = await readMasterRecord(db);
    const masterInfo = storedMaster ?? options.masterFallback;
    const total = keys.clients.length + keys.projects.length + keys.contentEntries.length + 2;
    let completed = 0;
    let mediaCount = 0;
    let activePhase: BackupArchivePhase = 'clients';

    const report = (phase: BackupArchivePhase) =>
      options.onProgress?.({ phase, completed, total, mediaCount });
    const addMedia = async (dataUrl: string, mime: string): Promise<string> => {
      throwIfAborted(options.signal);
      const path = `media/${String(++mediaCount).padStart(9, '0')}.${mediaExtension(mime)}`;
      await writer.add(path, new Data64URIReader(dataUrl), { level: 0, signal: options.signal });
      report(activePhase);
      return path;
    };

    for (const store of Object.keys(STORE_PATHS) as BackupStore[]) {
      activePhase = store;
      for (let index = 0; index < keys[store].length; index += 1) {
        throwIfAborted(options.signal);
        const record = await readStoreRecord(db, store, keys[store][index]);
        if (record === undefined) throw new Error(`Record disappeared while exporting ${store}`);
        const shell = await detachBackupMedia(record, addMedia);
        await writer.add(serialPath(STORE_PATHS[store], index), new TextReader(JSON.stringify(shell)), {
          level: 6,
          signal: options.signal,
        });
        completed += 1;
        report(store);
      }
    }

    throwIfAborted(options.signal);
    activePhase = 'masterInfo';
    const masterShell = await detachBackupMedia(masterInfo, addMedia);
    await writer.add('data/masterInfo.json', new TextReader(JSON.stringify(masterShell)), {
      level: 6,
      signal: options.signal,
    });
    completed += 1;
    report('masterInfo');

    await writer.add(ERROR_LOG_PATH, new TextReader(JSON.stringify(options.errorLog)), {
      level: 6,
      signal: options.signal,
    });
    completed += 1;
    report('diagnostics');

    const manifest: BackupArchiveManifest = {
      format: BACKUP_FORMAT,
      version: BACKUP_ARCHIVE_VERSION,
      scope: 'full',
      exportedAt: now.toISOString(),
      sourceDbVersion: TATTO_DIARY_DB_VERSION,
      counts: {
        clients: keys.clients.length,
        projects: keys.projects.length,
        contentEntries: keys.contentEntries.length,
      },
      hasMasterInfo: true,
      mediaCount,
    };
    await writer.add(MANIFEST_PATH, new TextReader(JSON.stringify(manifest)), {
      level: 6,
      signal: options.signal,
    });
    report('finishing');
    await writer.close();
    const file = await fileHandle.getFile();
    return { file, filename, summary: summaryFromManifest(manifest, file.size), cleanup };
  } catch (error) {
    try {
      await writable.abort(error);
    } catch {
      // zip.js may already have released/closed the stream.
    }
    await cleanup();
    if (error && typeof error === 'object' && 'name' in error && error.name === 'QuotaExceededError') {
      throw new BackupArchiveSpaceError();
    }
    throw error;
  }
}

function requireRecordId(value: unknown, section: string): Record<string, unknown> & { id: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof (value as Record<string, unknown>).id !== 'string') {
    throw new InvalidBackupArchiveError(`В разделе ${section} есть запись без идентификатора.`);
  }
  return value as Record<string, unknown> & { id: string };
}

async function putRecord(db: IDBDatabase, store: string, record: unknown): Promise<void> {
  const tx = db.transaction(store, 'readwrite');
  const done = transactionDone(tx);
  tx.objectStore(store).put(record);
  await done;
}

async function finishFullRestore(
  db: IDBDatabase,
  stale: Record<BackupStore, Set<IDBValidKey>>,
): Promise<void> {
  const tx = db.transaction([...Object.keys(STORE_PATHS), CONTENT_INGEST_JOB_STORE], 'readwrite');
  const done = transactionDone(tx);
  for (const store of Object.keys(STORE_PATHS) as BackupStore[]) {
    const target = tx.objectStore(store);
    for (const key of stale[store]) target.delete(key);
  }
  tx.objectStore(CONTENT_INGEST_JOB_STORE).clear();
  await done;
}

export async function importBackupArchive(
  db: IDBDatabase,
  file: Blob,
  options: ImportBackupArchiveOptions = {},
): Promise<ImportBackupArchiveResult> {
  const { reader, index } = await indexArchive(file, options.signal);
  const total =
    index.manifest.counts.clients +
    index.manifest.counts.projects +
    index.manifest.counts.contentEntries +
    (index.manifest.hasMasterInfo ? 1 : 0);
  let completed = 0;
  let masterInfo: MasterInfo | null = null;
  const stale = {
    clients: new Set(await readStoreKeys(db, 'clients')),
    projects: new Set(await readStoreKeys(db, 'projects')),
    contentEntries: new Set(await readStoreKeys(db, 'contentEntries')),
  };
  const seen = {
    clients: new Set<string>(),
    projects: new Set<string>(),
    contentEntries: new Set<string>(),
  };

  const readMedia = async (path: string, mime: string): Promise<string> => {
    throwIfAborted(options.signal);
    if (!path.startsWith('media/')) throw new InvalidBackupArchiveError('В копии повреждена ссылка на фотографию.');
    const entry = index.mediaEntries.get(path);
    if (!entry) throw new InvalidBackupArchiveError('В копии отсутствует одна из фотографий.');
    return entry.getData(new Data64URIWriter(mime), { signal: options.signal });
  };

  try {
    for (const store of Object.keys(STORE_PATHS) as BackupStore[]) {
      for (let position = 0; position < index.storeEntries[store].length; position += 1) {
        throwIfAborted(options.signal);
        const shell = await readJsonEntry(index.storeEntries[store][position]);
        const hydrated = requireRecordId(await hydrateBackupMedia(shell, readMedia), store);
        if (seen[store].has(hydrated.id)) throw new InvalidBackupArchiveError(`В разделе ${store} повторяется запись.`);
        seen[store].add(hydrated.id);
        stale[store].delete(hydrated.id);

        const normalized =
          store === 'clients'
            ? normalizeClient(hydrated, position)
            : store === 'projects'
              ? normalizeProject(hydrated, position)
              : normalizeContentEntry(hydrated);
        throwIfAborted(options.signal);
        await putRecord(db, store, normalized);
        completed += 1;
        options.onProgress?.({ phase: 'importing', completed, total, mediaCount: index.manifest.mediaCount });
      }
    }

    if (index.masterEntry) {
      const shell = await readJsonEntry(index.masterEntry);
      masterInfo = normalizeMasterInfo(await hydrateBackupMedia(shell, readMedia));
      await putRecord(db, MASTER_INFO_STORE, { ...masterInfo, id: MASTER_INFO_RECORD_ID });
      completed += 1;
      options.onProgress?.({ phase: 'importing', completed, total, mediaCount: index.manifest.mediaCount });
    }

    throwIfAborted(options.signal);
    // Incoming records are upserted first. Only after every archive entry was
    // read successfully do we delete records absent from the backup, so a bad
    // or interrupted archive never starts by wiping the current diary.
    await finishFullRestore(db, stale);
    return { summary: summaryFromManifest(index.manifest, file.size), masterInfo };
  } finally {
    await reader.close();
  }
}
