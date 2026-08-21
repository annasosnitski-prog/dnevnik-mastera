import {
  ContentSyncError,
  getContentIngestJob,
  type ContentIngestParams,
  type ContentSessionContext,
  type IngestResult,
} from './contentSync.js';

// 4: добавился стор masterInfo — Личный кабинет переехал из localStorage,
// где ему не хватало квоты под фото в задачах (см. lib/masterInfoStore.ts).
// onupgradeneeded трогает только отсутствующие сторы, данные не пересоздаются.
export const TATTO_DIARY_DB_VERSION = 4;
export const CONTENT_INGEST_JOB_STORE = 'contentIngestJobs';
export const CONTENT_ENTRY_STORE = 'contentEntries';

const coordinatorWakeups = new WeakMap<IDBDatabase, Set<() => void>>();

export function wakeContentIngestJobCoordinator(db: IDBDatabase): void {
  for (const wake of coordinatorWakeups.get(db) ?? []) wake();
}

function registerContentIngestJobCoordinatorWakeup(db: IDBDatabase, wake: () => void): () => void {
  const wakeups = coordinatorWakeups.get(db) ?? new Set<() => void>();
  wakeups.add(wake);
  coordinatorWakeups.set(db, wakeups);
  return () => {
    wakeups.delete(wake);
    if (wakeups.size === 0) coordinatorWakeups.delete(db);
  };
}

export type ContentIngestJobState = 'queued' | 'running' | 'failed';

export interface ContentIngestRequestSnapshot {
  sessionId: string;
  sourceType: ContentIngestParams['sourceType'];
  session: ContentSessionContext;
  mediaIds: string[];
  masterInstruction?: string;
  previousDraft?: string;
}

export interface PendingContentEntrySnapshot {
  id: string;
  createdDate: string;
  clientId: string | null;
  sourceType: ContentIngestParams['sourceType'];
  sourceId: string | null;
  format: 'post' | 'story' | null;
  text: string;
  context: ContentSessionContext;
  textArchetype?: string | null;
  photos: string[];
  photoIds: string[];
}

interface BaseContentIngestJobRecord {
  id: string;
  jobId: string;
  operation: 'create' | 'refresh';
  state: ContentIngestJobState;
  createdAt: string;
  updatedAt: string;
  request: ContentIngestRequestSnapshot;
  error?: string;
  retryable?: boolean;
}

export interface ContentCreateJobRecord extends BaseContentIngestJobRecord {
  operation: 'create';
  entry: PendingContentEntrySnapshot;
}

export interface ContentRefreshJobRecord extends BaseContentIngestJobRecord {
  operation: 'refresh';
  entryId: string;
  baseTextDraft: string;
  requestedArchetype: string | null;
}

export type ContentIngestJobRecord = ContentCreateJobRecord | ContentRefreshJobRecord;

export function ensureContentIngestJobStore(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains(CONTENT_INGEST_JOB_STORE)) {
    db.createObjectStore(CONTENT_INGEST_JOB_STORE, { keyPath: 'id' });
  }
}

// db.transaction() throws synchronously if the connection has already been
// closed (the browser can close it under memory pressure — most likely
// while this exact module is juggling large photo payloads through
// contentIngestJobs). TattoDiary.tsx's own openTx catches this for every
// other store and turns it into a recoverable «Хранилище недоступно» +
// «Повторить»; these job-queue reads/writes used to skip that protection
// entirely, so a connection drop here surfaced as an unrelated, dead-end
// message instead of the same recoverable one.
export class ContentJobDbUnavailableError extends Error {
  constructor() {
    super('Хранилище недоступно.');
    this.name = 'ContentJobDbUnavailableError';
  }
}

function openJobTx(db: IDBDatabase, storeNames: string | string[], mode: IDBTransactionMode): IDBTransaction {
  try {
    return db.transaction(storeNames, mode);
  } catch (err) {
    console.error('IndexedDB transaction failed to start:', err);
    throw new ContentJobDbUnavailableError();
  }
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

export function loadContentIngestJobs(db: IDBDatabase): Promise<ContentIngestJobRecord[]> {
  return new Promise((resolve, reject) => {
    const tx = openJobTx(db, CONTENT_INGEST_JOB_STORE, 'readonly');
    const request = tx.objectStore(CONTENT_INGEST_JOB_STORE).getAll();
    request.onsuccess = () => {
      const records = (request.result || []) as ContentIngestJobRecord[];
      resolve([...records].sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
    };
    request.onerror = () => reject(request.error ?? new Error('Failed to load content jobs'));
  });
}

export function getContentIngestJobRecord(db: IDBDatabase, id: string): Promise<ContentIngestJobRecord | null> {
  return new Promise((resolve, reject) => {
    const tx = openJobTx(db, CONTENT_INGEST_JOB_STORE, 'readonly');
    const request = tx.objectStore(CONTENT_INGEST_JOB_STORE).get(id);
    request.onsuccess = () => resolve((request.result as ContentIngestJobRecord | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error('Failed to load content job'));
  });
}

function getContentEntryState(
  db: IDBDatabase,
  id: string,
): Promise<{ status?: unknown } | null> {
  return new Promise((resolve, reject) => {
    const tx = openJobTx(db, CONTENT_ENTRY_STORE, 'readonly');
    const request = tx.objectStore(CONTENT_ENTRY_STORE).get(id);
    request.onsuccess = () => resolve((request.result as { status?: unknown } | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error('Failed to load content entry'));
  });
}

export async function putContentIngestJob(db: IDBDatabase, record: ContentIngestJobRecord): Promise<void> {
  const tx = openJobTx(db, CONTENT_INGEST_JOB_STORE, 'readwrite');
  tx.objectStore(CONTENT_INGEST_JOB_STORE).put(record);
  await transactionDone(tx);
  if (record.state === 'queued') wakeContentIngestJobCoordinator(db);
}

export async function deleteContentIngestJob(db: IDBDatabase, id: string): Promise<void> {
  const tx = openJobTx(db, CONTENT_INGEST_JOB_STORE, 'readwrite');
  tx.objectStore(CONTENT_INGEST_JOB_STORE).delete(id);
  await transactionDone(tx);
}

export async function deleteContentEntryAndRefreshJobs(db: IDBDatabase, entryId: string): Promise<void> {
  const tx = openJobTx(db, [CONTENT_ENTRY_STORE, CONTENT_INGEST_JOB_STORE], 'readwrite');
  tx.objectStore(CONTENT_ENTRY_STORE).delete(entryId);
  const jobsStore = tx.objectStore(CONTENT_INGEST_JOB_STORE);
  const request = jobsStore.getAll();
  request.onsuccess = () => {
    for (const job of (request.result || []) as ContentIngestJobRecord[]) {
      if (job.operation === 'refresh' && job.entryId === entryId) jobsStore.delete(job.id);
    }
  };
  await transactionDone(tx);
}

export function createCompletedContentEntry(record: ContentCreateJobRecord, result: IngestResult): object {
  return {
    ...record.entry,
    contentDraft: result.media,
    visualArchetype: result.visual_archetype,
    textTriad: result.text_triad,
    textDraft: result.text_draft,
    status: 'draft',
    isExemplar: false,
  };
}

export function canApplyRefreshResult(
  record: ContentRefreshJobRecord,
  entry: { status?: unknown; textDraft?: unknown } | null | undefined,
): boolean {
  return !!entry && entry.status === 'draft' && entry.textDraft === record.baseTextDraft;
}

export type ContentJobApplyOutcome = 'applied' | 'conflict' | 'missing';

export function applyCompletedContentIngestJob(
  db: IDBDatabase,
  record: ContentIngestJobRecord,
  result: IngestResult,
): Promise<ContentJobApplyOutcome> {
  return new Promise((resolve, reject) => {
    const tx = openJobTx(db, [CONTENT_ENTRY_STORE, CONTENT_INGEST_JOB_STORE], 'readwrite');
    const entries = tx.objectStore(CONTENT_ENTRY_STORE);
    const jobs = tx.objectStore(CONTENT_INGEST_JOB_STORE);
    let outcome: ContentJobApplyOutcome = 'applied';

    if (record.operation === 'create') {
      entries.put(createCompletedContentEntry(record, result));
      jobs.delete(record.id);
    } else {
      const getEntry = entries.get(record.entryId);
      getEntry.onsuccess = () => {
        const entry = getEntry.result as { status?: unknown; textDraft?: unknown } | undefined;
        if (!entry) {
          outcome = 'missing';
          jobs.delete(record.id);
          return;
        }
        if (!canApplyRefreshResult(record, entry)) {
          outcome = 'conflict';
          jobs.put({
            ...record,
            state: 'failed',
            updatedAt: new Date().toISOString(),
            error: 'Черновик изменился — готовый результат не применён.',
            retryable: false,
          });
          return;
        }
        entries.put({ ...entry, textDraft: result.text_draft });
        jobs.delete(record.id);
      };
    }

    tx.oncomplete = () => resolve(outcome);
    tx.onerror = () => reject(tx.error ?? new Error('Failed to apply content job'));
    tx.onabort = () => reject(tx.error ?? new Error('Failed to apply content job'));
  });
}

async function updateJobState(
  db: IDBDatabase,
  record: ContentIngestJobRecord,
  patch: Partial<Pick<ContentIngestJobRecord, 'state' | 'updatedAt' | 'error' | 'retryable'>>,
): Promise<void> {
  await putContentIngestJob(db, { ...record, ...patch } as ContentIngestJobRecord);
}

export interface ContentJobCoordinatorOptions {
  db: IDBDatabase;
  onChanged: () => void;
  pollIntervalMs?: number;
  documentRef?: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'> | null;
  windowRef?: Pick<Window, 'addEventListener' | 'removeEventListener'> | null;
  loadJobs?: (db: IDBDatabase) => Promise<ContentIngestJobRecord[]>;
  setTimer?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
}

export function startContentIngestJobCoordinator(options: ContentJobCoordinatorOptions): () => void {
  const documentRef = options.documentRef ?? (typeof document === 'undefined' ? null : document);
  const windowRef = options.windowRef ?? (typeof window === 'undefined' ? null : window);
  const pollIntervalMs = options.pollIntervalMs ?? 2500;
  const loadJobs = options.loadJobs ?? loadContentIngestJobs;
  const setTimer = options.setTimer ?? ((callback, delay) => setTimeout(callback, delay));
  const clearTimer = options.clearTimer ?? ((pendingTimer) => clearTimeout(pendingTimer));
  const activeJobIds = new Set<string>();
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let checking: Promise<void> | null = null;
  let wakeRequested = false;

  const schedule = () => {
    if (stopped || documentRef?.visibilityState === 'hidden') return;
    if (timer) clearTimer(timer);
    timer = setTimer(() => {
      timer = null;
      void checkAll();
    }, pollIntervalMs);
  };

  const processJob = async (record: ContentIngestJobRecord): Promise<boolean> => {
    if (activeJobIds.has(record.id)) return true;
    activeJobIds.add(record.id);
    try {
      if (record.state === 'failed') {
        if (record.operation === 'refresh') {
          const entry = await getContentEntryState(options.db, record.entryId);
          if (!entry || entry.status !== 'draft') {
            await deleteContentIngestJob(options.db, record.id);
            options.onChanged();
          }
        }
        return false;
      }
      const status = await getContentIngestJob(record.jobId);
      // Cancellation or retry can happen while the GET is in flight. Re-read the
      // durable record before mutating anything so an old result cannot resurrect
      // a locally cancelled job or overwrite a newer retry jobId.
      const currentRecord = await getContentIngestJobRecord(options.db, record.id);
      if (!currentRecord || currentRecord.jobId !== record.jobId) return false;
      if (status.status === 'running') {
        if (currentRecord.state !== 'running') {
          await updateJobState(options.db, currentRecord, {
            state: 'running',
            updatedAt: new Date().toISOString(),
            error: undefined,
            retryable: undefined,
          });
          options.onChanged();
        }
        return true;
      }
      if (status.status === 'failed') {
        await updateJobState(options.db, currentRecord, {
          state: 'failed',
          updatedAt: new Date().toISOString(),
          error: status.error,
          retryable: true,
        });
        options.onChanged();
        return false;
      }
      await applyCompletedContentIngestJob(options.db, currentRecord, status.result);
      options.onChanged();
      return false;
    } catch (error) {
      if (error instanceof ContentSyncError && error.retryable) return true;
      const currentRecord = await getContentIngestJobRecord(options.db, record.id).catch(() => null);
      if (!currentRecord || currentRecord.jobId !== record.jobId) return false;
      await updateJobState(options.db, currentRecord, {
        state: 'failed',
        updatedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Не удалось проверить задачу contentINKA.',
        retryable: currentRecord.operation === 'create',
      });
      options.onChanged();
      return false;
    } finally {
      activeJobIds.delete(record.id);
    }
  };

  const checkAll = (): Promise<void> => {
    if (stopped || documentRef?.visibilityState === 'hidden') return Promise.resolve();
    if (checking) {
      wakeRequested = true;
      return checking;
    }
    if (timer) {
      clearTimer(timer);
      timer = null;
    }
    checking = (async () => {
      const jobs = await loadJobs(options.db);
      const keepPolling = await Promise.all(jobs.map(processJob));
      if (keepPolling.some(Boolean)) schedule();
    })().finally(() => {
      checking = null;
      if (wakeRequested && !stopped) {
        wakeRequested = false;
        void checkAll();
      }
    });
    return checking;
  };

  const wake = () => {
    if (documentRef?.visibilityState === 'hidden') return;
    void checkAll();
  };
  const onVisibility = () => {
    if (documentRef?.visibilityState === 'visible') wake();
    else if (timer) {
      clearTimer(timer);
      timer = null;
    }
  };

  documentRef?.addEventListener('visibilitychange', onVisibility);
  windowRef?.addEventListener('focus', wake);
  windowRef?.addEventListener('online', wake);
  const unregisterWakeup = registerContentIngestJobCoordinatorWakeup(options.db, wake);
  void checkAll();

  return () => {
    stopped = true;
    if (timer) clearTimer(timer);
    unregisterWakeup();
    documentRef?.removeEventListener('visibilitychange', onVisibility);
    windowRef?.removeEventListener('focus', wake);
    windowRef?.removeEventListener('online', wake);
  };
}
