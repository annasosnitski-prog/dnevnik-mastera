import assert from 'node:assert/strict';
import { File } from 'node:buffer';
import test from 'node:test';
import { indexedDB } from 'fake-indexeddb';
import {
  BlobWriter,
  Data64URIReader,
  TextReader,
  ZipWriter,
} from '@zip.js/zip.js';
import {
  BACKUP_ARCHIVE_VERSION,
  detachBackupMedia,
  hydrateBackupMedia,
  importBackupArchive,
  inspectBackupArchive,
  parseBackupArchiveManifest,
  prepareBackupArchive,
} from '../.test-dist/src/lib/backupArchive.js';

const PHOTO = 'data:image/png;base64,iVBORw0KGgo=';

function manifest(overrides = {}) {
  return {
    format: 'inka-backup',
    version: BACKUP_ARCHIVE_VERSION,
    scope: 'full',
    exportedAt: '2026-08-15T12:00:00.000Z',
    sourceDbVersion: 4,
    counts: { clients: 1, projects: 0, contentEntries: 0 },
    hasMasterInfo: true,
    mediaCount: 1,
    ...overrides,
  };
}

async function makeArchive({ media = true } = {}) {
  const output = new BlobWriter('application/zip');
  const writer = new ZipWriter(output, { useWebWorkers: false, bufferedWrite: false });
  const mediaPath = 'media/000000001.png';
  if (media) await writer.add(mediaPath, new Data64URIReader(PHOTO), { level: 0 });
  await writer.add(
    'data/clients/00000001.json',
    new TextReader(JSON.stringify({
      id: 'client-new',
      name: 'Анна',
      sessions: [{ id: 'session-1', photos: [{ __inkaBackupMedia: mediaPath, mime: 'image/png' }] }],
    })),
  );
  await writer.add('data/masterInfo.json', new TextReader(JSON.stringify({ name: 'Мастер', notes: [] })));
  await writer.add('manifest.json', new TextReader(JSON.stringify(manifest())));
  await writer.close();
  return output.getData();
}

function openDatabase(name) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => {
      for (const store of ['clients', 'projects', 'contentEntries', 'masterInfo', 'contentIngestJobs']) {
        request.result.createObjectStore(store, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function writeRecords(db, storeName, records) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    for (const record of records) tx.objectStore(storeName).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function readAll(db, storeName) {
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

class MemoryFileHandle {
  constructor(name) {
    this.name = name;
    this.blob = new Blob();
  }

  async createWritable() {
    const chunks = [];
    return new WritableStream({
      write: (chunk) => chunks.push(chunk),
      close: () => {
        this.blob = new Blob(chunks, { type: 'application/zip' });
      },
      abort: () => {
        this.blob = new Blob();
      },
    });
  }

  async getFile() {
    return new File([this.blob], this.name, { type: 'application/zip' });
  }
}

class MemoryDirectoryHandle {
  constructor() {
    this.files = new Map();
  }

  async getDirectoryHandle() {
    return this;
  }

  async getFileHandle(name) {
    const handle = new MemoryFileHandle(name);
    this.files.set(name, handle);
    return handle;
  }

  async removeEntry(name) {
    if (!this.files.delete(name)) throw new DOMException('Not found', 'NotFoundError');
  }
}

test('base64 media is detached recursively and restored byte-for-byte', async () => {
  const added = [];
  const shell = await detachBackupMedia(
    { document: { fileUrl: PHOTO }, sessions: [{ photos: [PHOTO] }], text: 'data:image/png,not-base64' },
    async (dataUrl, mime) => {
      added.push({ dataUrl, mime });
      return `media/${added.length}.png`;
    },
  );

  assert.equal(added.length, 2);
  assert.equal(JSON.stringify(shell).includes(PHOTO), false, 'photo payload leaked into the JSON shell');
  const restored = await hydrateBackupMedia(shell, async (path) => added[Number(path.match(/\d+/)[0]) - 1].dataUrl);
  assert.deepEqual(restored, {
    document: { fileUrl: PHOTO },
    sessions: [{ photos: [PHOTO] }],
    text: 'data:image/png,not-base64',
  });
});

test('manifest validation rejects a wrong format before any restore', () => {
  assert.throws(
    () => parseBackupArchiveManifest(manifest({ version: 5 })),
    /версия резервной копии пока не поддерживается/i,
  );
});

test('archive inspection reads only the directory and manifest summary', async () => {
  const archive = await makeArchive();
  const summary = await inspectBackupArchive(archive);
  assert.equal(summary.counts.clients, 1);
  assert.equal(summary.mediaCount, 1);
  assert.equal(summary.hasMasterInfo, true);
  assert.equal(summary.archiveBytes, archive.size);
});

test('full export streams an importable ZIP into OPFS and cleanup removes only the temp file', async () => {
  const db = await openDatabase(`inka-backup-export-${Date.now()}-${Math.random()}`);
  await writeRecords(db, 'clients', [{ id: 'client-1', name: 'Анна', sessions: [{ id: 's-1', photos: [PHOTO] }] }]);
  await writeRecords(db, 'masterInfo', [{ id: 'master', name: 'Мастер', notes: [] }]);
  const opfs = new MemoryDirectoryHandle();
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      storage: {
        getDirectory: async () => opfs,
        estimate: async () => ({ usage: 1024, quota: 1024 * 1024 * 1024 }),
      },
    },
  });

  try {
    const progress = [];
    const prepared = await prepareBackupArchive(db, {
      masterFallback: { name: 'fallback' },
      errorLog: [],
      now: new Date('2026-08-15T12:00:00.000Z'),
      onProgress: (value) => progress.push(value),
    });
    assert.equal(prepared.filename, 'inka-backup-2026-08-15.inka.zip');
    assert.equal(prepared.summary.counts.clients, 1);
    assert.equal(prepared.summary.mediaCount, 1);
    assert.equal((await inspectBackupArchive(prepared.file)).mediaCount, 1);
    assert.ok(progress.some((value) => value.phase === 'finishing'));
    assert.equal(opfs.files.has(prepared.filename), true);
    await prepared.cleanup();
    assert.equal(opfs.files.has(prepared.filename), false);
  } finally {
    db.close();
    if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor);
    else delete globalThis.navigator;
  }
});

test('v6 restore hydrates media, removes stale records only after success, and clears jobs', async () => {
  const db = await openDatabase(`inka-backup-test-${Date.now()}-${Math.random()}`);
  await writeRecords(db, 'clients', [{ id: 'client-stale', name: 'Старый' }]);
  await writeRecords(db, 'contentIngestJobs', [{ id: 'job-stale' }]);

  const result = await importBackupArchive(db, await makeArchive());
  const clients = await readAll(db, 'clients');
  const jobs = await readAll(db, 'contentIngestJobs');
  const masters = await readAll(db, 'masterInfo');

  assert.equal(result.summary.counts.clients, 1);
  assert.equal(clients.length, 1);
  assert.equal(clients[0].id, 'client-new');
  assert.equal(clients[0].sessions[0].photos[0], PHOTO);
  assert.equal(jobs.length, 0);
  assert.equal(masters[0].name, 'Мастер');
  db.close();
});

test('an archive missing declared media is rejected without touching the database', async () => {
  const archive = await makeArchive({ media: false });
  const db = await openDatabase(`inka-backup-invalid-${Date.now()}-${Math.random()}`);
  await writeRecords(db, 'clients', [{ id: 'client-stale', name: 'Остаётся' }]);
  await assert.rejects(() => importBackupArchive(db, archive), /отсутствует часть фотографий/i);
  assert.deepEqual(await readAll(db, 'clients'), [{ id: 'client-stale', name: 'Остаётся' }]);
  db.close();
});
