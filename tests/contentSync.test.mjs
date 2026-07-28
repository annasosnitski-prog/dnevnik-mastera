import assert from 'node:assert/strict';
import test from 'node:test';

import { sendToContent, translateContentText, ContentSyncError } from '../.test-dist/src/lib/contentSync.js';
import { createContentRefreshRunner } from '../.test-dist/src/lib/contentRefresh.js';

const settings = { enabled: true, endpoint: 'https://contentinka.example', secret: 'sekret' };

const baseParams = {
  sessionId: 'session-1',
  sourceType: 'session',
  session: { client: 'Анна', zone: 'рука', style: 'графика', description: 'описание' },
  media: [{ id: 'photo-1', preview_data_url: 'data:image/png;base64,AAA' }],
};

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

// handlers[i] handles the i-th fetch call (0-indexed). A function instead of
// an array handles every call the same way.
function createFetchMock(handlers) {
  const calls = [];
  const fn = async (url, init) => {
    const index = calls.length;
    calls.push({ url, init });
    const handler = typeof handlers === 'function' ? handlers : handlers[index];
    if (!handler) throw new Error(`no handler configured for fetch call #${index + 1} (${url})`);
    return handler(url, init, index);
  };
  fn.calls = calls;
  return fn;
}

function instantWait() {
  return Promise.resolve();
}

function baseEnvironment(overrides = {}) {
  return {
    readSettings: () => settings,
    wait: instantWait,
    ...overrides,
  };
}

const completedResult = {
  media: [{ id: 'photo-1', technical_status: 'kept' }],
  visual_archetype: 'creator',
  text_triad: { opens: 'creator', leads: 'sage', closes: 'lover' },
  text_draft: 'Готовый текст',
};

test('uses /api/ingest-jobs to create the job, never the old /api/ingest', async () => {
  const fetchMock = createFetchMock([
    () => jsonResponse(202, { job_id: 'wrun_1', status: 'queued' }),
    () => jsonResponse(200, { job_id: 'wrun_1', status: 'completed', result: completedResult }),
  ]);

  await sendToContent(baseParams, baseEnvironment({ fetch: fetchMock }));

  assert.equal(fetchMock.calls.length, 2);
  assert.ok(fetchMock.calls[0].url.endsWith('/api/ingest-jobs'));
  assert.ok(fetchMock.calls[1].url.endsWith('/api/ingest-jobs/wrun_1'));
  assert.ok(fetchMock.calls.every(({ url }) => !/\/api\/ingest$/.test(url)));
});

test('preserves Authorization and the request body shape on the create call', async () => {
  const fetchMock = createFetchMock([
    () => jsonResponse(202, { job_id: 'wrun_1', status: 'queued' }),
    () => jsonResponse(200, { job_id: 'wrun_1', status: 'completed', result: completedResult }),
  ]);

  await sendToContent(
    { ...baseParams, masterInstruction: 'trickster', previousDraft: 'старый текст' },
    baseEnvironment({ fetch: fetchMock }),
  );

  const createCall = fetchMock.calls[0];
  assert.equal(createCall.init.method, 'POST');
  assert.equal(createCall.init.headers.Authorization, 'Bearer sekret');
  assert.equal(createCall.init.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(createCall.init.body), {
    session_id: 'session-1',
    source_type: 'session',
    session: baseParams.session,
    media: baseParams.media,
    master_instruction: 'trickster',
    previous_draft: 'старый текст',
  });

  const pollCall = fetchMock.calls[1];
  assert.equal(pollCall.init.method, 'GET');
  assert.equal(pollCall.init.headers.Authorization, 'Bearer sekret');
});

test('executes exactly one POST per sendToContent call', async () => {
  const fetchMock = createFetchMock([
    () => jsonResponse(202, { job_id: 'wrun_1', status: 'queued' }),
    () => jsonResponse(200, { job_id: 'wrun_1', status: 'running' }),
    () => jsonResponse(200, { job_id: 'wrun_1', status: 'running' }),
    () => jsonResponse(200, { job_id: 'wrun_1', status: 'completed', result: completedResult }),
  ]);

  await sendToContent(baseParams, baseEnvironment({ fetch: fetchMock }));

  const postCalls = fetchMock.calls.filter((c) => c.init.method === 'POST');
  assert.equal(postCalls.length, 1);
});

test('queued → running → completed resolves with the existing IngestResult shape', async () => {
  const fetchMock = createFetchMock([
    () => jsonResponse(202, { job_id: 'wrun_1', status: 'queued' }),
    () => jsonResponse(200, { job_id: 'wrun_1', status: 'running' }),
    () => jsonResponse(200, { job_id: 'wrun_1', status: 'completed', result: completedResult }),
  ]);

  const result = await sendToContent(baseParams, baseEnvironment({ fetch: fetchMock }));

  assert.deepEqual(result, completedResult);
});

test('several consecutive "running" polls do not create additional POST requests', async () => {
  const fetchMock = createFetchMock([
    () => jsonResponse(202, { job_id: 'wrun_1', status: 'queued' }),
    () => jsonResponse(200, { job_id: 'wrun_1', status: 'running' }),
    () => jsonResponse(200, { job_id: 'wrun_1', status: 'running' }),
    () => jsonResponse(200, { job_id: 'wrun_1', status: 'running' }),
    () => jsonResponse(200, { job_id: 'wrun_1', status: 'running' }),
    () => jsonResponse(200, { job_id: 'wrun_1', status: 'completed', result: completedResult }),
  ]);

  await sendToContent(baseParams, baseEnvironment({ fetch: fetchMock }));

  assert.equal(fetchMock.calls.filter((c) => c.init.method === 'POST').length, 1);
  assert.equal(fetchMock.calls.filter((c) => c.init.method === 'GET').length, 5);
});

test('a "failed" job status gives a clear, human-readable error', async () => {
  const fetchMock = createFetchMock([
    () => jsonResponse(202, { job_id: 'wrun_1', status: 'queued' }),
    () => jsonResponse(200, { job_id: 'wrun_1', status: 'failed', error: 'Content generation failed' }),
  ]);

  await assert.rejects(
    sendToContent(baseParams, baseEnvironment({ fetch: fetchMock })),
    (err) => err instanceof ContentSyncError && err.message === 'Content generation failed',
  );
});

test('a 404 on the job status endpoint gives a clear error without retrying forever', async () => {
  const fetchMock = createFetchMock([
    () => jsonResponse(202, { job_id: 'wrun_1', status: 'queued' }),
    () => jsonResponse(404, { detail: 'not found' }),
  ]);

  await assert.rejects(
    sendToContent(baseParams, baseEnvironment({ fetch: fetchMock })),
    (err) => err instanceof ContentSyncError && /404/.test(err.message),
  );
  assert.equal(fetchMock.calls.length, 2);
});

test('a malformed create-job response is rejected and never starts polling', async () => {
  const fetchMock = createFetchMock([() => jsonResponse(202, { status: 'queued' })]); // missing job_id

  await assert.rejects(sendToContent(baseParams, baseEnvironment({ fetch: fetchMock })), ContentSyncError);
  assert.equal(fetchMock.calls.length, 1); // no GET was ever attempted
});

test('a malformed "completed" result (no media array) is rejected', async () => {
  const fetchMock = createFetchMock([
    () => jsonResponse(202, { job_id: 'wrun_1', status: 'queued' }),
    () => jsonResponse(200, { job_id: 'wrun_1', status: 'completed', result: { text_draft: 'x' } }), // no media
  ]);

  await assert.rejects(sendToContent(baseParams, baseEnvironment({ fetch: fetchMock })), ContentSyncError);
});

test('a transient polling network error is retried a limited number of times without creating a new job', async () => {
  let getAttempts = 0;
  const fetchMock = createFetchMock([
    () => jsonResponse(202, { job_id: 'wrun_1', status: 'queued' }),
    () => {
      getAttempts += 1;
      throw new Error('network blip');
    },
    () => {
      getAttempts += 1;
      throw new Error('network blip');
    },
    () => {
      getAttempts += 1;
      return jsonResponse(200, { job_id: 'wrun_1', status: 'completed', result: completedResult });
    },
  ]);

  const result = await sendToContent(baseParams, baseEnvironment({ fetch: fetchMock }));

  assert.deepEqual(result, completedResult);
  assert.equal(getAttempts, 3);
  assert.equal(fetchMock.calls.filter((c) => c.init.method === 'POST').length, 1);
});

test('exhausting the transient-error retry budget fails without ever posting a second job', async () => {
  const fetchMock = createFetchMock([
    () => jsonResponse(202, { job_id: 'wrun_1', status: 'queued' }),
    () => { throw new Error('network blip'); },
    () => { throw new Error('network blip'); },
    () => { throw new Error('network blip'); },
    () => { throw new Error('network blip'); },
    () => { throw new Error('network blip'); },
  ]);

  await assert.rejects(sendToContent(baseParams, baseEnvironment({ fetch: fetchMock })), ContentSyncError);
  assert.equal(fetchMock.calls.filter((c) => c.init.method === 'POST').length, 1);
});

test('exceeding the overall wait budget fails with a timeout error, not an infinite loop', async () => {
  const fetchMock = createFetchMock([
    () => jsonResponse(202, { job_id: 'wrun_1', status: 'queued' }),
    () => jsonResponse(200, { job_id: 'wrun_1', status: 'running' }),
  ]);
  // startedAt=0, the pre-poll check right after it also reads 0 (still
  // within budget), then the check after the first "running" poll jumps
  // past maxWaitMs.
  const nowSequence = [0, 0, 5000];
  let nowCallIndex = 0;
  const now = () => nowSequence[Math.min(nowCallIndex++, nowSequence.length - 1)];

  await assert.rejects(
    sendToContent(baseParams, baseEnvironment({ fetch: fetchMock, now, maxWaitMs: 1000 })),
    ContentSyncError,
  );
  // Only the one "running" poll happened before the next timeout check fired.
  assert.equal(fetchMock.calls.filter((c) => c.init.method === 'GET').length, 1);
});

test('translation keeps using only /api/translate, unaffected by the ingest-jobs migration', async () => {
  const fetchMock = createFetchMock([
    () => jsonResponse(200, { target_language: 'en', translated_text: 'Ready text' }),
  ]);

  const result = await translateContentText(
    { sourceText: 'Готовый текст', targetLanguage: 'en' },
    { readSettings: () => settings, fetch: fetchMock },
  );

  assert.equal(result.translatedText, 'Ready text');
  assert.equal(fetchMock.calls.length, 1);
  assert.ok(fetchMock.calls[0].url.endsWith('/api/translate'));
});

test('refresh single-flight and confirmed-lock still work with a multi-tick polling sendToContent', async () => {
  const runner = createContentRefreshRunner();
  const fetchMock = createFetchMock([
    () => jsonResponse(202, { job_id: 'wrun_1', status: 'queued' }),
    () => jsonResponse(200, { job_id: 'wrun_1', status: 'running' }),
    () => jsonResponse(200, { job_id: 'wrun_1', status: 'completed', result: completedResult }),
  ]);
  const entry = {
    id: 'entry-1',
    status: 'draft',
    contentDraft: [],
    visualArchetype: null,
    textTriad: null,
    textDraft: 'Исходный текст',
  };
  const request = () =>
    sendToContent(baseParams, baseEnvironment({ fetch: fetchMock })).then((result) => ({ text_draft: result.text_draft }));

  const first = runner.run({ entry, request, save: () => undefined });
  const second = runner.run({ entry, request, save: () => undefined });
  const [firstOutcome, secondOutcome] = await Promise.all([first, second]);

  assert.equal(firstOutcome.status, 'updated');
  assert.equal(firstOutcome.entry.textDraft, completedResult.text_draft);
  assert.deepEqual(secondOutcome, { status: 'ignored' });
  // The single-flight guard let only one sendToContent run to completion —
  // still exactly one job created.
  assert.equal(fetchMock.calls.filter((c) => c.init.method === 'POST').length, 1);

  // A confirmed entry never even calls sendToContent.
  const confirmedFetchMock = createFetchMock(() => {
    throw new Error('must not be called for a confirmed entry');
  });
  const confirmedOutcome = await runner.run({
    entry: { ...entry, status: 'confirmed' },
    request: () => sendToContent(baseParams, baseEnvironment({ fetch: confirmedFetchMock })),
    save: () => undefined,
  });
  assert.deepEqual(confirmedOutcome, { status: 'locked' });
  assert.equal(confirmedFetchMock.calls.length, 0);
});
