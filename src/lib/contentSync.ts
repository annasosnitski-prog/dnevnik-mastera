// ============================================================
// ДНЕВНИК МАСТЕРА — синхронизация с ContentINKA
// (мост Дневник → ContentINKA, по образцу calendarSync.ts)
//
// Когда мастер жмёт «Отправить в контент» в карточке сессии/консультации,
// шлём фото (сжатыми превью, не оригиналы) и контекст в ContentINKA
// (POST /api/ingest на отдельном сервисе, не в этом репозитории) и
// получаем обратно разметку — роль, качество, архетипы, черновик текста.
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

// Одно фото в разметке, вернувшейся от ContentINKA — см.
// contentinka-diary-handoff.md (inka-bot repo) для полного контракта.
export interface ContentDraftMedia {
  id: string;
  technical_status: 'kept' | 'background' | 'rejected';
  role?: 'overview' | 'detail' | 'process' | 'final';
  quality_score?: number;
  cover_candidate?: boolean;
  format?: 'post' | 'story';
  order_index?: number;
  visual_archetype?: string;
  text_triad?: { opens: string; leads: string; closes: string };
  text_draft?: string;
  master_decision: 'pending' | 'confirmed' | 'removed';
}

export interface ContentSessionContext {
  client: string;
  work?: string;
  zone: string;
  style: string;
  description: string;
}

export class ContentSyncError extends Error {}

// media — уже сжатые превью (data URL), не оригиналы; см. downsizeToPreview
// в src/lib/imagePreview.ts. Бросает ContentSyncError с человекочитаемым
// сообщением при сетевой ошибке/неправильной настройке/отказе сервера.
export async function sendToContent(params: {
  sessionId: string;
  sourceType: 'session' | 'consultation';
  session: ContentSessionContext;
  media: { id: string; preview_data_url: string }[];
}): Promise<ContentDraftMedia[]> {
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
  return data.media as ContentDraftMedia[];
}
