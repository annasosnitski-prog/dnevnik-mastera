// ============================================================
// ДНЕВНИК МАСТЕРА — синхронизация с ContentINKA
// ============================================================

export interface ContentSyncSettings {
  enabled: boolean;
  endpoint: string;
  secret: string;
}

const STORAGE_KEY = 'inka-content-sync';
export const DEFAULT_CONTENT_ENDPOINT = '';

export function readContentSyncSettings(): ContentSyncSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        enabled: parsed.enabled === true,
        endpoint: typeof parsed.endpoint === 'string' ? parsed.endpoint : DEFAULT_CONTENT_ENDPOINT,
        secret: typeof parsed.secret === 'string' ? parsed.secret : '',
      };
    }
  } catch {
    /* ignore invalid local settings */
  }
  return { enabled: false, endpoint: DEFAULT_CONTENT_ENDPOINT, secret: '' };
}

export function writeContentSyncSettings(settings: ContentSyncSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export type ContentSelectionRole =
  | 'cover'
  | 'placement'
  | 'detail'
  | 'before'
  | 'after'
  | 'process'
  | 'transition'
  | 'atmosphere'
  | 'background';

export interface ContentDraftMedia {
  id: string;
  technical_status: 'kept' | 'background' | 'rejected';
  role?: 'overview' | 'detail' | 'process' | 'final';
  quality_score?: number;
  cover_candidate?: boolean;
  format?: 'post' | 'story';
  order_index?: number;
  selected?: boolean;
  selection_role?: ContentSelectionRole;
  duplicate_group?: string;
}

export interface ContentSessionContext {
  client: string;
  work?: string;
  zone: string;
  style: string;
  description: string;
}

export interface IngestResult {
  media: ContentDraftMedia[];
  visual_archetype: string | null;
  text_triad: { opens: string; leads: string; closes: string } | null;
  text_draft: string;
}

export class ContentSyncError extends Error {
  constructor(message: string, public readonly retryable = false) {
    super(message);
    this.name = 'ContentSyncError';
  }
}

export type ContentTranslationLanguage = 'he' | 'en';

export interface ContentTranslationResult {
  targetLanguage: ContentTranslationLanguage;
  translatedText: string;
}

export interface ContentTranslationEnvironment {
  readSettings?: () => ContentSyncSettings;
  fetch?: typeof fetch;
}

export async function translateContentText(
  params: { sourceText: string; targetLanguage: ContentTranslationLanguage },
  environment: ContentTranslationEnvironment = {},
): Promise<ContentTranslationResult> {
  if (!params.sourceText.trim()) throw new ContentSyncError('Не удалось перевести текст.');

  const settings = (environment.readSettings ?? readContentSyncSettings)();
  if (!settings.endpoint || !settings.secret) {
    throw new ContentSyncError('ContentINKA не настроена.');
  }

  let response: Response;
  try {
    response = await (environment.fetch ?? fetch)(`${settings.endpoint.replace(/\/$/, '')}/api/translate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.secret}`,
      },
      body: JSON.stringify({
        source_text: params.sourceText,
        target_language: params.targetLanguage,
      }),
    });
  } catch {
    throw new ContentSyncError('Не удалось связаться с ContentINKA.');
  }

  if (!response.ok) throw new ContentSyncError('ContentINKA ответила ошибкой.');

  const data = await response.json().catch(() => null);
  if (
    !data ||
    data.target_language !== params.targetLanguage ||
    typeof data.translated_text !== 'string' ||
    !data.translated_text.trim()
  ) {
    throw new ContentSyncError('Не удалось перевести текст.');
  }

  return {
    targetLanguage: params.targetLanguage,
    translatedText: data.translated_text,
  };
}

export interface ContentIngestParams {
  sessionId: string;
  sourceType: 'session' | 'consultation' | 'freeform';
  session: ContentSessionContext;
  media: { id: string; preview_data_url: string }[];
  masterInstruction?: string;
  previousDraft?: string;
}

export interface ContentIngestEnvironment {
  readSettings?: () => ContentSyncSettings;
  fetch?: typeof fetch;
  wait?: (ms: number) => Promise<void>;
  now?: () => number;
  pollIntervalMs?: number;
  maxWaitMs?: number;
}

export type ContentIngestJobStatus =
  | { status: 'running' }
  | { status: 'completed'; result: IngestResult }
  | { status: 'failed'; error: string };

export interface CreatedContentIngestJob {
  jobId: string;
  status: 'queued';
}

const DEFAULT_POLL_INTERVAL_MS = 2000;
const DEFAULT_MAX_WAIT_MS = 120_000;
const MAX_CONSECUTIVE_POLL_NETWORK_ERRORS = 3;

function defaultWait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function settingsFor(environment: ContentIngestEnvironment): ContentSyncSettings {
  const settings = (environment.readSettings ?? readContentSyncSettings)();
  if (!settings.endpoint || !settings.secret) {
    throw new ContentSyncError('ContentINKA не настроена — впишите endpoint и секрет в настройках.');
  }
  return settings;
}

function isIngestResult(value: unknown): value is IngestResult {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<IngestResult>;
  const validMedia =
    Array.isArray(candidate.media) &&
    candidate.media.every((item) => {
      if (!item || typeof item !== 'object') return false;
      const media = item as Partial<ContentDraftMedia>;
      return (
        typeof media.id === 'string' &&
        media.id.trim().length > 0 &&
        (media.technical_status === 'kept' ||
          media.technical_status === 'background' ||
          media.technical_status === 'rejected')
      );
    });
  return (
    validMedia &&
    typeof candidate.text_draft === 'string' &&
    candidate.text_draft.trim().length > 0 &&
    (candidate.visual_archetype === null || typeof candidate.visual_archetype === 'string') &&
    (candidate.text_triad === null ||
      (!!candidate.text_triad &&
        typeof candidate.text_triad.opens === 'string' &&
        typeof candidate.text_triad.leads === 'string' &&
        typeof candidate.text_triad.closes === 'string'))
  );
}

export async function createContentIngestJob(
  params: ContentIngestParams,
  environment: ContentIngestEnvironment = {},
): Promise<CreatedContentIngestJob> {
  const settings = settingsFor(environment);
  const fetchImpl = environment.fetch ?? fetch;
  const baseUrl = settings.endpoint.replace(/\/$/, '');

  let response: Response;
  try {
    response = await fetchImpl(`${baseUrl}/api/ingest-jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.secret}`,
      },
      body: JSON.stringify({
        session_id: params.sessionId,
        source_type: params.sourceType,
        session: params.session,
        media: params.media,
        master_instruction: params.masterInstruction ?? null,
        previous_draft: params.previousDraft ?? null,
      }),
    });
  } catch {
    throw new ContentSyncError('Не удалось связаться с ContentINKA — проверьте сеть.', true);
  }

  if (response.status !== 202) {
    throw new ContentSyncError(`ContentINKA ответила ошибкой (${response.status}).`);
  }

  const data = await response.json().catch(() => null);
  if (!data || typeof data.job_id !== 'string' || !data.job_id || data.status !== 'queued') {
    throw new ContentSyncError('ContentINKA вернула неожиданный ответ.');
  }

  return { jobId: data.job_id, status: 'queued' };
}

export async function getContentIngestJob(
  jobId: string,
  environment: ContentIngestEnvironment = {},
): Promise<ContentIngestJobStatus> {
  if (!jobId.trim()) throw new ContentSyncError('Не указан идентификатор задачи ContentINKA.');
  const settings = settingsFor(environment);
  const fetchImpl = environment.fetch ?? fetch;
  const baseUrl = settings.endpoint.replace(/\/$/, '');

  let response: Response;
  try {
    response = await fetchImpl(`${baseUrl}/api/ingest-jobs/${encodeURIComponent(jobId)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${settings.secret}` },
    });
  } catch {
    throw new ContentSyncError('Не удалось связаться с ContentINKA — проверьте сеть.', true);
  }

  if (response.status === 401 || response.status === 403) {
    throw new ContentSyncError('Проверьте настройки ContentINKA.');
  }
  if (response.status === 404) {
    throw new ContentSyncError('Задача генерации больше не найдена (404).');
  }
  if (!response.ok) {
    throw new ContentSyncError(`ContentINKA не смогла проверить задачу (${response.status}).`);
  }

  const data = await response.json().catch(() => null);
  if (!data || data.job_id !== jobId || typeof data.status !== 'string') {
    throw new ContentSyncError('ContentINKA вернула неожиданный ответ.');
  }

  if (data.status === 'queued' || data.status === 'running') return { status: 'running' };
  if (data.status === 'completed') {
    if (!isIngestResult(data.result)) throw new ContentSyncError('ContentINKA вернула повреждённый результат.');
    return { status: 'completed', result: data.result };
  }
  if (data.status === 'failed') {
    return { status: 'failed', error: 'ContentINKA не смогла собрать материал.' };
  }

  throw new ContentSyncError('ContentINKA вернула неожиданный ответ.');
}

async function pollIngestJob(
  jobId: string,
  environment: ContentIngestEnvironment,
): Promise<IngestResult> {
  const wait = environment.wait ?? defaultWait;
  const now = environment.now ?? Date.now;
  const pollIntervalMs = environment.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const maxWaitMs = environment.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
  const startedAt = now();
  let consecutiveNetworkErrors = 0;

  for (;;) {
    if (now() - startedAt > maxWaitMs) {
      throw new ContentSyncError('ContentINKA слишком долго не отвечает — попробуйте ещё раз позже.');
    }

    await wait(pollIntervalMs);

    let status: ContentIngestJobStatus;
    try {
      status = await getContentIngestJob(jobId, environment);
      consecutiveNetworkErrors = 0;
    } catch (error) {
      if (error instanceof ContentSyncError && error.retryable) {
        consecutiveNetworkErrors += 1;
        if (consecutiveNetworkErrors <= MAX_CONSECUTIVE_POLL_NETWORK_ERRORS) continue;
      }
      throw error;
    }

    if (status.status === 'running') continue;
    if (status.status === 'completed') return status.result;
    throw new ContentSyncError(status.error);
  }
}

// Совместимый wrapper для старых вызывающих мест и тестов. Новый durable-flow
// использует createContentIngestJob/getContentIngestJob напрямую.
export async function sendToContent(
  params: ContentIngestParams,
  environment: ContentIngestEnvironment = {},
): Promise<IngestResult> {
  const created = await createContentIngestJob(params, environment);
  return pollIngestJob(created.jobId, environment);
}
