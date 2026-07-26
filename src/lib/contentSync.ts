// ============================================================
// ДНЕВНИК МАСТЕРА — синхронизация с ContentINKA
// (мост Дневник → ContentINKA, по образцу calendarSync.ts)
//
// Генерация использует POST /api/ingest. source_type: session/
// consultation/freeform; freeform допускает пустой media, если есть
// непустой session.description. Перегенерация с инструкцией мастера — тот
// же вызов, с полем master_instruction. Готовый текст отдельно переводится
// через POST /api/translate без повторного ingest и анализа фотографий.
//
// БЕЗОПАСНОСТЬ: свой секрет, отдельный от inka-calendar-sync — хранится в
// своём ключе localStorage, не в бэкапе (тот же принцип, что у секрета
// календаря — см. calendarSync.ts).
//
// В отличие от календаря, это НЕ fire-and-forget: мастер ждёт ответ
// (разметку), чтобы увидеть результат, поэтому вызывающий код сам
// показывает состояние загрузки/ошибки.
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
export interface ContentDraftMedia {
  id: string;
  technical_status: 'kept' | 'background' | 'rejected';
  role?: 'overview' | 'detail' | 'process' | 'final';
  quality_score?: number;
  cover_candidate?: boolean;
  format?: 'post' | 'story';
  order_index?: number;
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

// media — уже сжатые превью (data URL), не оригиналы; см. downsizeToPreview
// в src/lib/imagePreview.ts. Может быть пустым массивом только при
// sourceType "freeform" (нужен непустой session.description). Бросает
// ContentSyncError с человекочитаемым сообщением при сетевой ошибке/
// неправильной настройке/отказе сервера.
export async function sendToContent(params: {
  sessionId: string;
  sourceType: 'session' | 'consultation' | 'freeform';
  session: ContentSessionContext;
  media: { id: string; preview_data_url: string }[];
  masterInstruction?: string;
  // Уже написанный черновик (при перегенерации кнопкой архетипа) — backend
  // ищет в нём фразы/образы, которые стоит сохранить, вместо переписывания
  // с нуля. Не передаётся при первой генерации — там его ещё нет.
  previousDraft?: string;
}): Promise<IngestResult> {
  const settings = readContentSyncSettings();
  if (!settings.endpoint || !settings.secret) {
    throw new ContentSyncError('ContentINKA не настроен — впиши endpoint и секрет в настройках.');
  }

  let res: Response;
  try {
    res = await fetch(`${settings.endpoint.replace(/\/$/, '')}/api/ingest`, {
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

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ContentSyncError(`ContentINKA ответил ошибкой (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = await res.json().catch(() => null);
  if (!data || !Array.isArray(data.media)) {
    throw new ContentSyncError('ContentINKA вернул неожиданный ответ.');
  }
  return data as IngestResult;
}
