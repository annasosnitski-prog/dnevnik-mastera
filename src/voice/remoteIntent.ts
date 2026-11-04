// ============================================================
// РАЗБОР ФРАЗЫ НА СЕРВЕРЕ — Supabase Edge Function «voice-intent»
// (supabase/functions/voice-intent). Ключ модели живёт только там, в
// секретах Supabase; клиент шлёт лишь текст и свой токен сессии синка
// (functions.invoke подставляет его сам, функция без него не отвечает).
//
// Любая неудача — устройство не привязано, нет сети, функция не
// развёрнута, таймаут — возвращает null, и вызывающий берёт локальный
// разбор. Голос не должен ломаться из-за сервера.
// ============================================================

import { normalizeIntent, parseIntentLocal, type VoiceIntent } from './intent';

const REMOTE_TIMEOUT_MS = 6000;

async function parseIntentRemote(transcript: string): Promise<VoiceIntent | null> {
  try {
    const [{ getSupabaseClient }, { isPaired }] = await Promise.all([
      import('../lib/supabaseClient'),
      import('../lib/syncAuth'),
    ]);
    const client = getSupabaseClient();
    if (!(await isPaired(client))) return null;
    const call = client.functions.invoke('voice-intent', { body: { text: transcript } });
    const timeout = new Promise<null>((resolve) => window.setTimeout(() => resolve(null), REMOTE_TIMEOUT_MS));
    const response = await Promise.race([call, timeout]);
    if (!response || response.error || !response.data) return null;
    const intent = normalizeIntent(response.data, transcript, 'llm');
    return intent.action === 'unknown' ? null : intent;
  } catch {
    return null;
  }
}

// Сначала модель (понимает свободную речь), потом локальные правила.
export async function resolveIntent(transcript: string): Promise<VoiceIntent> {
  return (await parseIntentRemote(transcript)) ?? parseIntentLocal(transcript);
}
