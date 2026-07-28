from pathlib import Path

sync_path = Path('src/lib/contentSync.ts')
sync = sync_path.read_text()

start = sync.index('function isIngestResult(value: unknown): value is IngestResult {')
end = sync.index('export async function createContentIngestJob', start)
validator = (
    "function isIngestResult(value: unknown): value is IngestResult {\n"
    "  if (!value || typeof value !== 'object') return false;\n"
    "  const candidate = value as Partial<IngestResult>;\n"
    "  const validMedia =\n"
    "    Array.isArray(candidate.media) &&\n"
    "    candidate.media.every((item) => {\n"
    "      if (!item || typeof item !== 'object') return false;\n"
    "      const media = item as Partial<ContentDraftMedia>;\n"
    "      return (\n"
    "        typeof media.id === 'string' &&\n"
    "        media.id.trim().length > 0 &&\n"
    "        (media.technical_status === 'kept' ||\n"
    "          media.technical_status === 'background' ||\n"
    "          media.technical_status === 'rejected')\n"
    "      );\n"
    "    });\n"
    "  return (\n"
    "    validMedia &&\n"
    "    typeof candidate.text_draft === 'string' &&\n"
    "    candidate.text_draft.trim().length > 0 &&\n"
    "    (candidate.visual_archetype === null || typeof candidate.visual_archetype === 'string') &&\n"
    "    (candidate.text_triad === null ||\n"
    "      (!!candidate.text_triad &&\n"
    "        typeof candidate.text_triad.opens === 'string' &&\n"
    "        typeof candidate.text_triad.leads === 'string' &&\n"
    "        typeof candidate.text_triad.closes === 'string'))\n"
    "  );\n"
    "}\n\n"
)
sync = sync[:start] + validator + sync[end:]

create_start = sync.index('  if (response.status !== 202) {', sync.index('export async function createContentIngestJob'))
create_end = sync.index('\n\n  const data', create_start)
sync = sync[:create_start] + (
    "  if (response.status !== 202) {\n"
    "    throw new ContentSyncError(`POSTiNKA ответила ошибкой (${response.status}).`);\n"
    "  }"
) + sync[create_end:]

old_check = "if (!data || typeof data.job_id !== 'string' || typeof data.status !== 'string')"
if sync.count(old_check) != 1:
    raise RuntimeError(f'job id validation shape changed: {sync.count(old_check)}')
sync = sync.replace(old_check, "if (!data || data.job_id !== jobId || typeof data.status !== 'string')", 1)

failed_start = sync.index("  if (data.status === 'failed') {")
failed_end = sync.index("\n\n  throw new ContentSyncError", failed_start)
sync = sync[:failed_start] + (
    "  if (data.status === 'failed') {\n"
    "    return { status: 'failed', error: 'POSTiNKA не смогла собрать материал.' };\n"
    "  }"
) + sync[failed_end:]
sync_path.write_text(sync)

queue_path = Path('src/lib/contentJobQueue.ts')
queue = queue_path.read_text()
if 'function getContentEntryState(' not in queue:
    anchor = 'export async function putContentIngestJob'
    if queue.count(anchor) != 1:
        raise RuntimeError('content entry helper anchor changed')
    helper = (
        "function getContentEntryState(\n"
        "  db: IDBDatabase,\n"
        "  id: string,\n"
        "): Promise<{ status?: unknown } | null> {\n"
        "  return new Promise((resolve, reject) => {\n"
        "    const tx = db.transaction(CONTENT_ENTRY_STORE, 'readonly');\n"
        "    const request = tx.objectStore(CONTENT_ENTRY_STORE).get(id);\n"
        "    request.onsuccess = () => resolve((request.result as { status?: unknown } | undefined) ?? null);\n"
        "    request.onerror = () => reject(request.error ?? new Error('Failed to load content entry'));\n"
        "  });\n"
        "}\n\n"
    )
    queue = queue.replace(anchor, helper + anchor, 1)

process_start = queue.index('  const processJob = async (record: ContentIngestJobRecord) => {')
status_line = '      const status = await getContentIngestJob(record.jobId);'
process_end = queue.index(status_line, process_start) + len(status_line)
process_prefix = (
    "  const processJob = async (record: ContentIngestJobRecord) => {\n"
    "    if (activeJobIds.has(record.id)) return;\n"
    "    activeJobIds.add(record.id);\n"
    "    try {\n"
    "      if (record.state === 'failed') {\n"
    "        if (record.operation === 'refresh') {\n"
    "          const entry = await getContentEntryState(options.db, record.entryId);\n"
    "          if (!entry || entry.status !== 'draft') {\n"
    "            await deleteContentIngestJob(options.db, record.id);\n"
    "            options.onChanged();\n"
    "          }\n"
    "        }\n"
    "        return;\n"
    "      }\n"
    + status_line
)
queue = queue[:process_start] + process_prefix + queue[process_end:]

old_retry = (
    "        error: error instanceof Error ? error.message : 'Не удалось проверить задачу POSTiNKA.',\n"
    "        retryable: false,"
)
if queue.count(old_retry) != 1:
    raise RuntimeError(f'terminal retryability shape changed: {queue.count(old_retry)}')
queue = queue.replace(
    old_retry,
    "        error: error instanceof Error ? error.message : 'Не удалось проверить задачу POSTiNKA.',\n"
    "        retryable: currentRecord.operation === 'create',",
    1,
)
queue_path.write_text(queue)

tests = Path('tests/durableContentJobs.test.mjs')
source = tests.read_text()
import_anchor = "} from '../.test-dist/src/lib/contentJobQueue.js';\n"
import_line = "import { ContentSyncError, createContentIngestJob, getContentIngestJob } from '../.test-dist/src/lib/contentSync.js';\n"
if import_line not in source:
    if source.count(import_anchor) != 1:
        raise RuntimeError('durable test import anchor changed')
    source = source.replace(import_anchor, import_anchor + import_line, 1)
if 'provider response bodies and backend failure details never reach' not in source:
    source += r'''

test('provider response bodies and backend failure details never reach the UI error', async () => {
  const settings = { enabled: true, endpoint: 'https://postinka.example', secret: 'secret' };
  await assert.rejects(
    createContentIngestJob(
      {
        sessionId: 'session-1',
        sourceType: 'freeform',
        session: { client: '', zone: '', style: '', description: 'note' },
        media: [],
      },
      { readSettings: () => settings, fetch: async () => ({ status: 500, text: async () => 'provider content-secret' }) },
    ),
    (error) => error instanceof ContentSyncError && error.message === 'POSTiNKA ответила ошибкой (500).' && !error.message.includes('content-secret'),
  );
  const failed = await getContentIngestJob('job-1', {
    readSettings: () => settings,
    fetch: async () => ({ status: 200, ok: true, json: async () => ({ job_id: 'job-1', status: 'failed', error: 'provider content-secret' }) }),
  });
  assert.deepEqual(failed, { status: 'failed', error: 'POSTiNKA не смогла собрать материал.' });
});

test('completed jobs reject malformed media and mismatched job ids', async () => {
  const settings = { enabled: true, endpoint: 'https://postinka.example', secret: 'secret' };
  await assert.rejects(
    getContentIngestJob('job-1', {
      readSettings: () => settings,
      fetch: async () => ({ status: 200, ok: true, json: async () => ({ job_id: 'job-1', status: 'completed', result: { media: [{ id: 'photo-1' }], visual_archetype: null, text_triad: null, text_draft: 'Текст' } }) }),
    }),
    (error) => error instanceof ContentSyncError && error.message === 'POSTiNKA вернула повреждённый результат.',
  );
  await assert.rejects(
    getContentIngestJob('job-1', {
      readSettings: () => settings,
      fetch: async () => ({ status: 200, ok: true, json: async () => ({ job_id: 'job-other', status: 'running' }) }),
    }),
    (error) => error instanceof ContentSyncError && error.message === 'POSTiNKA вернула неожиданный ответ.',
  );
});

test('terminal create jobs stay retryable and failed refresh jobs are cleaned after confirmation', () => {
  const queue = readFileSync(new URL('../src/lib/contentJobQueue.ts', import.meta.url), 'utf8');
  assert.match(queue, /retryable: currentRecord\.operation === 'create'/);
  assert.match(queue, /record\.state === 'failed'[\s\S]*record\.operation === 'refresh'[\s\S]*entry\.status !== 'draft'/);
});
'''
tests.write_text(source)
