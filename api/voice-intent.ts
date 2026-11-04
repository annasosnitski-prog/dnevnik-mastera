// ============================================================
// Vercel Function «/api/voice-intent»: голосовая фраза мастера →
// {action, entity, fields}. Дешёвая модель Haiku, ответ строго через
// инструмент с JSON-схемой, так что формат всегда предсказуем.
//
// Ключ — только в переменных окружения Vercel (Project → Settings →
// Environment Variables → ANTHROPIC_API_KEY), на клиент не попадает.
// Эндпоинт открыт, поэтому защита — короткий текст, маленький max_tokens,
// проверка Origin и месячный лимит трат в консоли Anthropic.
//
// Списки действий/сущностей совпадают с src/voice/intent.ts — расширять
// оба места вместе.
// ============================================================

declare const process: { env: Record<string, string | undefined> };

const MODEL = process.env.VOICE_INTENT_MODEL ?? 'claude-haiku-5-5';
const MAX_TEXT = 400;


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
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// Браузер всегда шлёт Origin на POST. Чужой сайт со своего домена ключ не
// потратит; от запросов не из браузера это не защищает — для этого лимит.
function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}

export async function POST(req: Request): Promise<Response> {
  if (!sameOrigin(req)) return json({ error: 'origin' }, 403);

  const key = process.env.ANTHROPIC_API_KEY;
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
      max_tokens: 300,
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
}
