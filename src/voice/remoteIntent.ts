// ============================================================
// РАЗБОР ФРАЗЫ НА СЕРВЕРЕ — Vercel Function /api/voice-intent
// (api/voice-intent.ts). Ключ модели живёт только там, в переменных
// окружения Vercel; клиент шлёт лишь текст.
//
// Любая неудача — нет сети, ключ не задан, локальный dev без функций,
// таймаут — возвращает null, и вызывающий берёт локальный разбор.
// Голос не должен ломаться из-за сервера.
// ============================================================

import { normalizeIntent, parseIntentLocal, type VoiceIntent } from './intent';

const REMOTE_TIMEOUT_MS = 6000;

async function parseIntentRemote(transcript: string): Promise<VoiceIntent | null> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REMOTE_TIMEOUT_MS);
  try {
    const response = await fetch('/api/voice-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: transcript }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const data: unknown = await response.json();
    const intent = normalizeIntent(data, transcript, 'llm');
    return intent.action === 'unknown' ? null : intent;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

// Сначала модель (понимает свободную речь), потом локальные правила.
export async function resolveIntent(transcript: string): Promise<VoiceIntent> {
  return (await parseIntentRemote(transcript)) ?? parseIntentLocal(transcript);
}
