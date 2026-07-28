// ============================================================
// ДНЕВНИК МАСТЕРА — синхронизация с ContentINKA
// (мост Дневник → ContentINKA, по образцу calendarSync.ts)
//
// Генерация — асинхронная: POST /api/ingest-jobs создаёт job (202 +
// job_id + status: queued), дальше опрашиваем GET /api/ingest-jobs/{id}
// каждые ~2с, пока не придёт completed (результат) или failed (ошибка).
// Старый синхронный POST /api/ingest больше не вызывается — по этому же
// job_id и polling-механизму работает и первая генерация, и
// перегенерация с master_instruction/previous_draft. Готовый текст
// отдельно переводится через POST /api/translate — без ingest вообще.
//
// БЕЗОПАСНОСТЬ: свой секрет, отдельный от inka-calendar-sync — хранится в
// своём ключе localStorage, не в бэкапе (тот же принцип, что у секрета
// календаря — см. calendarSync.ts).
//
// В отличие от календаря, это НЕ fire-and-forget: мастер ждёт ответ
// (разметку), чтобы увидеть результат, поэтому вызывающий код сам
// показывает состояние загрузки/ошибки. Job id нигде не сохраняется
// (ни в IndexedDB, ни в localStorage) — переживание reload посреди
// генерации осознанно не входит в этот milestone.
// ============================================================

export interface ContentSyncSettings {
  enabled: boolean;
  endpoint: string;
  secret: string;
}

const STORAGE_KEY = 'inka-content-sync';
export const DEFAULT_CONTENT_ENDPOINT = ''; // мастер вписывает свой URL деплоя ContentINKA

export function readContentSyncSettings(): ContentSyncSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return {
        enabled: p.enabled === true,
        endpoint: typeof p.endpoint === 'string' ? p.endpoint : DEFAULT_CONTENT_ENDPOINT,
        secret: typeof p.secret === 'string' ? p.secret : '',
      };
    }
  } catch {
    /* ignore */
  }
  return { enabled: false, endpoint: DEFAULT_CONTENT_ENDPOINT, secret: '' };
}

export function writeContentSyncSettings(settings: ContentSyncSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

// Разметка одного фото — без text_draft/visual_archetype/text_triad,
// которые теперь приходят один раз на весь материал (см. IngestResult
// ниже), не дублируются на каждый кадр. См. contentinka-diary-handoff.md
// (inka-bot repo) для полного контракта.
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

export class ContentSyncError extends Error {}

export type ContentTranslationLanguage = 'he' | 'en';

export interface ContentTranslationResult {
  targetLanguage: ContentTranslationLanguage;
  translatedText: string;
}

export interface ContentTranslationEnvironment {
  readSettings?: () => ContentSyncSettings;
  fetch?: typeof fetch;
}

// Отдельная операция над уже готовым textDraft. Использует те же endpoint и
// secret, что ingest, но никогда не вызывает /api/ingest и не передаёт фото,
// архетипы или prompt генерации.
export async function translateContentText(
  params: { sourceText: string; targetLanguage: ContentTranslationLanguage },
  environment: ContentTranslationEnvironment = {},
): Promise<ContentTranslationResult> {
  if (!params.sourceText.trim()) throw new ContentSyncError('Не удалось перевести текст.');

  const settings = (environment.readSettings ?? readContentSyncSettings)();
  if (!settings.endpoint || !settings.secret) {
    throw new ContentSyncError('ContentINKA не настроен.');
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

  if (!response.ok) throw new ContentSyncError('ContentINKA ответил ошибкой.');

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

// Точки расширения для тестов — реальный fetch/таймер по умолчанию, в
// unit-тестах подменяются на детерминированные фейки (без сетевых вызовов
// и без реальных задержек). readSettings — тот же приём, что и у
// translateContentText ниже.
export interface ContentIngestEnvironment {
  readSettings?: () => ContentSyncSettings;
  fetch?: typeof fetch;
  // Ожидание между поллами — по умолчанию настоящий таймер (~2с); тесты
  // подставляют мгновенный резолв, чтобы не полагаться на реальные часы.
  wait?: (ms: number) => Promise<void>;
  // Часы для общего таймаута ожидания — по умолчанию Date.now.
  now?: () => number;
  pollIntervalMs?: number;
  maxWaitMs?: number;
}

const DEFAULT_POLL_INTERVAL_MS = 2000;
const DEFAULT_MAX_WAIT_MS = 120_000; // ограниченный общий срок ожидания
const MAX_CONSECUTIVE_POLL_NETWORK_ERRORS = 3;

function defaultWait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Один job опрашивается строго последовательно (await в цикле — новый GET
// уходит только после того, как предыдущий ответ обработан), с фиксированным
// интервалом и ограниченным сроком ожидания. Временная сетевая ошибка
// polling (fetch бросил, а не «job ответил ошибкой») даёт ограниченное
// число повторов подряд — но никогда не создаёт новый job.
async function pollIngestJob(
  jobId: string,
  settings: ContentSyncSettings,
  environment: ContentIngestEnvironment,
): Promise<IngestResult> {
  const fetchImpl = environment.fetch ?? fetch;
  const wait = environment.wait ?? defaultWait;
  const now = environment.now ?? Date.now;
  const pollIntervalMs = environment.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const maxWaitMs = environment.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
  const baseUrl = settings.endpoint.replace(/\/$/, '');
  const startedAt = now();
  let consecutiveNetworkErrors = 0;

  for (;;) {
    if (now() - startedAt > maxWaitMs) {
      throw new ContentSyncError('ContentINKA слишком долго не отвечает — попробуйте ещё раз позже.');
    }

    await wait(pollIntervalMs);

    let res: Response;
    try {
      res = await fetchImpl(`${baseUrl}/api/ingest-jobs/${jobId}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${settings.secret}` },
      });
    } catch {
      consecutiveNetworkErrors += 1;
      if (consecutiveNetworkErrors > MAX_CONSECUTIVE_POLL_NETWORK_ERRORS) {
        throw new ContentSyncError('Не удалось связаться с ContentINKA — проверь сеть.');
      }
      continue;
    }
    consecutiveNetworkErrors = 0;

    if (!res.ok) {
      throw new ContentSyncError(`ContentINKA не нашёл задачу генерации (${res.status}).`);
    }

    const data = await res.json().catch(() => null);
    if (!data || typeof data.job_id !== 'string' || typeof data.status !== 'string') {
      throw new ContentSyncError('ContentINKA вернул неожиданный ответ.');
    }

    if (data.status === 'running') continue;

    if (data.status === 'completed') {
      if (!data.result || !Array.isArray(data.result.media)) {
        throw new ContentSyncError('ContentINKA вернул неожиданный ответ.');
      }
      return data.result as IngestResult;
    }

    if (data.status === 'failed') {
      throw new ContentSyncError(typeof data.error === 'string' && data.error ? data.error : 'ContentINKA не смог собрать материал.');
    }

    throw new ContentSyncError('ContentINKA вернул неожиданный ответ.');
  }
}

// media — уже сжатые превью (data URL), не оригиналы; см. downsizeToPreview
// в src/lib/imagePreview.ts. Может быть пустым массивом только при
// sourceType "freeform" (нужен непустой session.description). Бросает
// ContentSyncError с человекочитаемым сообщением при сетевой ошибке/
// неправильной настройке/отказе сервера. Ровно один POST /api/ingest-jobs
// за вызов — дальше только GET-polling, второй POST не выполняется.
export async function sendToContent(
  params: {
    sessionId: string;
    sourceType: 'session' | 'consultation' | 'freeform';
    session: ContentSessionContext;
    media: { id: string; preview_data_url: string }[];
    masterInstruction?: string;
    // Уже написанный черновик (при перегенерации кнопкой архетипа) — backend
    // ищет в нём фразы/образы, которые стоит сохранить, вместо переписывания
    // с нуля. Не передаётся при первой генерации — там его ещё нет.
    previousDraft?: string;
  },
  environment: ContentIngestEnvironment = {},
): Promise<IngestResult> {
  const settings = (environment.readSettings ?? readContentSyncSettings)();
  if (!settings.endpoint || !settings.secret) {
    throw new ContentSyncError('ContentINKA не настроен — впиши endpoint и секрет в настройках.');
  }

  const fetchImpl = environment.fetch ?? fetch;
  const baseUrl = settings.endpoint.replace(/\/$/, '');

  let res: Response;
  try {
    res = await fetchImpl(`${baseUrl}/api/ingest-jobs`, {
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
    throw new ContentSyncError('Не удалось связаться с ContentINKA — проверь сеть.');
  }

  if (res.status !== 202) {
    const text = await res.text().catch(() => '');
    throw new ContentSyncError(`ContentINKA ответил ошибкой (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = await res.json().catch(() => null);
  if (!data || typeof data.job_id !== 'string' || !data.job_id || data.status !== 'queued') {
    throw new ContentSyncError('ContentINKA вернул неожиданный ответ.');
  }

  return pollIngestJob(data.job_id, settings, environment);
}
