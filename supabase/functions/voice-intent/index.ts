// ============================================================
// Supabase Edge Function «voice-intent» (Deno): голосовая фраза мастера →
// {action, entity, fields}. Дешёвая модель Haiku, ответ строго через
// инструмент с JSON-схемой, так что формат всегда предсказуем.
//
// Ключ — только в секретах Supabase, на клиент не попадает:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   supabase functions deploy voice-intent
// По умолчанию Supabase пускает к функции только запросы с JWT, то есть
// только привязанные к синку устройства мастера.
//
// Списки действий/сущностей совпадают с src/voice/intent.ts — расширять
// оба места вместе.
// ============================================================

const MODEL = Deno.env.get('VOICE_INTENT_MODEL') ?? 'claude-haiku-5-5';
const MAX_TEXT = 1000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SYSTEM = `Ты разбираешь голосовые команды тату-мастера в приложении «Дневник мастера».
Верни намерение через инструмент intent. Не выдумывай данных, которых нет во фразе.
Действия: create (создать), open (открыть/показать), update (обновить), complete (закрыть/завершить),
generate (сделать пост/сториз), ask (вопрос), unknown (непонятно).
Сущности: client, project, session, consultation, note, content, screen.
Поля (только упомянутые): name, surname, phone (цифры и +), note, client (имя клиента), project,
date (YYYY-MM-DD), time (HH:MM), screen, question.
Имена и фамилии пиши с заглавной буквы в именительном падеже.`;

const TOOL = {
  name: 'intent',
  description: 'Структура голосовой команды',
  input_schema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['create', 'open', 'update', 'complete', 'generate', 'ask', 'unknown'] },
      entity: {
        type: ['string', 'null'],
        enum: ['client', 'project', 'session', 'consultation', 'note', 'content', 'screen', null],
      },
      fields: { type: 'object', additionalProperties: { type: 'string' } },
    },
    required: ['action', 'entity', 'fields'],
  },
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) return json({ error: 'not_configured' }, 503);

  let text = '';
  try {
    const body = await req.json();
    text = typeof body?.text === 'string' ? body.text.trim().slice(0, MAX_TEXT) : '';
  } catch {
    return json({ error: 'bad_json' }, 400);
  }
  if (!text) return json({ error: 'empty' }, 400);

  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 400,
      system: SYSTEM,
      tools: [TOOL],
      tool_choice: { type: 'tool', name: 'intent' },
      messages: [{ role: 'user', content: text }],
    }),
  });
  if (!upstream.ok) return json({ error: 'upstream', status: upstream.status }, 502);

  const data = await upstream.json();
  const block = (data?.content ?? []).find((c: { type: string }) => c.type === 'tool_use');
  if (!block) return json({ error: 'no_intent' }, 502);
  return json(block.input);
});
