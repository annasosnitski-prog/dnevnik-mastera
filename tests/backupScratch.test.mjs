import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Реальный сбой у мастера: занято 71 ГБ при 473 МБ настоящих данных, и копию
// стало НЕЛЬЗЯ сделать вообще — дневник требовал 56 ГБ свободного места.
//
// Механизм: копия собирается файлом в OPFS. Имя архива содержит дату, и
// уборка удаляла ровно это имя — то есть только сегодняшний файл. А сборку
// копии обрывает не исключение, а снятая браузером вкладка (самый тяжёлый
// момент в жизни дневника), после которой не выполняется никакой JS: ни
// catch, ни finally. Каталог копился. И дальше замыкался круг: требование
// свободного места считается от общего usage, мусор раздувал usage, дневник
// отказывал в сборке — а убирал мусор только тот код, который не запускался.

const { sweepBackupScratch, BACKUP_SCRATCH_DIRECTORY } = await import('../.test-dist/src/lib/backupScratch.js');

// ── Поддельная OPFS ──────────────────────────────────────────────────────

function fakeDirectory(files) {
  const entries = new Map(
    Object.entries(files).map(([name, size]) => [
      name,
      { kind: 'file', name, getFile: async () => ({ size }) },
    ]),
  );
  return {
    entries,
    removed: [],
    async *values() {
      for (const handle of entries.values()) yield handle;
    },
    async removeEntry(name) {
      if (!entries.has(name)) throw new Error(`нет такого файла: ${name}`);
      entries.delete(name);
      this.removed.push(name);
    },
  };
}

// globalThis.navigator в Node объявлен только геттером — присвоением его не
// подменить.
function setNavigator(value) {
  Object.defineProperty(globalThis, 'navigator', { value, configurable: true, writable: true });
}

function clearNavigator() {
  Object.defineProperty(globalThis, 'navigator', { value: undefined, configurable: true, writable: true });
}

function installOpfs(directory, { directoryName = BACKUP_SCRATCH_DIRECTORY } = {}) {
  const storage = {
    getDirectory: async () => ({
      getDirectoryHandle: async (name, options) => {
        if (name !== directoryName) throw new Error('NotFoundError');
        if (!directory && !options?.create) throw new Error('NotFoundError');
        return directory;
      },
    }),
  };
  setNavigator({ storage });
  return clearNavigator;
}

// ── Поведение ────────────────────────────────────────────────────────────

test('sweeps every leftover, not just the one named after today', async () => {
  // Ровно тот случай, что накопился у мастера: архивы за разные дни плюс
  // файл подкачки, до которого removeEntry по имени архива не дотягивался.
  const directory = fakeDirectory({
    'inka-backup-anna-2026-08-18.zip': 400_000_000,
    'inka-backup-anna-2026-09-01.zip': 450_000_000,
    '.inka-backup-anna-2026-09-03.zip.crswap': 470_000_000,
  });
  const restore = installOpfs(directory);
  try {
    const result = await sweepBackupScratch();
    assert.equal(result.removed, 3);
    assert.equal(result.bytes, 1_320_000_000);
    assert.equal(directory.entries.size, 0);
  } finally {
    restore();
  }
});

test('an empty scratch directory is not an error and reports nothing freed', async () => {
  const directory = fakeDirectory({});
  const restore = installOpfs(directory);
  try {
    assert.deepEqual(await sweepBackupScratch(), { removed: 0, bytes: 0 });
  } finally {
    restore();
  }
});

test('a missing directory (fresh install) is not created just to sweep it', async () => {
  let askedToCreate = false;
  setNavigator({
    storage: {
      getDirectory: async () => ({
        getDirectoryHandle: async (_name, options) => {
          askedToCreate = options?.create === true;
          throw new Error('NotFoundError');
        },
      }),
    },
  });
  try {
    assert.deepEqual(await sweepBackupScratch(), { removed: 0, bytes: 0 });
    assert.equal(askedToCreate, false, 'каталог не должен создаваться ради уборки');
  } finally {
    clearNavigator();
  }
});

test('a browser without OPFS is handled, not crashed into', async () => {
  setNavigator({ storage: {} });
  try {
    assert.deepEqual(await sweepBackupScratch(), { removed: 0, bytes: 0 });
  } finally {
    clearNavigator();
  }
});

test('one file the system refuses to delete does not abandon the rest', async () => {
  const directory = fakeDirectory({ a: 10, locked: 20, c: 30 });
  directory.removeEntry = async function (name) {
    if (name === 'locked') throw new Error('NoModificationAllowedError');
    this.entries.delete(name);
    this.removed.push(name);
  };
  const restore = installOpfs(directory);
  try {
    const result = await sweepBackupScratch();
    // Занятый файл подметём при следующем запуске — но два других уже ушли.
    assert.equal(result.removed, 2);
    assert.deepEqual([...directory.entries.keys()], ['locked']);
  } finally {
    restore();
  }
});

test('names are collected before deleting — mutating a directory mid-iteration is not reliable', async () => {
  const directory = fakeDirectory({ a: 1, b: 2, c: 3 });
  let iterating = false;
  const originalValues = directory.values.bind(directory);
  directory.values = async function* () {
    iterating = true;
    for await (const handle of originalValues()) yield handle;
    iterating = false;
  };
  const originalRemove = directory.removeEntry.bind(directory);
  directory.removeEntry = async function (name) {
    assert.equal(iterating, false, 'удаление началось, пока обход каталога ещё идёт');
    return originalRemove(name);
  };
  const restore = installOpfs(directory);
  try {
    assert.equal((await sweepBackupScratch()).removed, 3);
  } finally {
    restore();
  }
});

// ── Проводка ─────────────────────────────────────────────────────────────

const archive = readFileSync(new URL('../src/lib/backupArchive.ts', import.meta.url), 'utf8');
const diary = readFileSync(new URL('../src/components/TattoDiary.tsx', import.meta.url), 'utf8');

test('the export sweeps the whole directory instead of one dated filename', () => {
  assert.match(archive, /await sweepBackupScratch\(\);/);
  // Именно эта строка и оставляла вчерашние архивы лежать.
  assert.doesNotMatch(archive, /removeEntry\(filename\)\.catch/);
});

test('the sweep runs BEFORE the free-space check, or the rubbish measures itself', () => {
  const prepare = archive.slice(archive.indexOf('export async function prepareBackupArchive'));
  const swept = prepare.indexOf('await sweepBackupScratch()');
  const checked = prepare.indexOf('await checkFreeSpace()');
  assert.ok(swept !== -1 && checked !== -1);
  assert.ok(swept < checked, 'проверка места считает мусор своим же источником');
});

test('the diary also sweeps at startup — the export alone could never unlock itself', () => {
  // Суть замкнутого круга: убрать мусор могла только сборка копии, а сборка
  // не запускалась именно из-за мусора.
  assert.match(diary, /await import\('\.\.\/lib\/backupScratch'\)/);
  assert.match(diary, /const swept = await sweepBackupScratch\(\)/);
});

test('the startup sweep is a lazy import — zip.js must not reach the main bundle', () => {
  // backupScratch намеренно не зависит от @zip.js/zip.js (139 кБ), а импорт
  // динамический: уборка на старте не должна стоить мастеру загрузки
  // архиватора.
  const scratch = readFileSync(new URL('../src/lib/backupScratch.ts', import.meta.url), 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');
  assert.doesNotMatch(scratch, /zip\.js/);
  assert.doesNotMatch(diary, /^import .*backupScratch/m);
});

test('freeing space refreshes the figure the master is looking at', () => {
  assert.match(diary, /refreshStorageEstimate\(\)/);
  assert.match(diary, /const refreshStorageEstimate = \(\) => \{/);
});

test('the sweep leaves a journal line — «where did the gigabytes go» must be answerable', () => {
  assert.match(diary, /logError\(\s*'storage',\s*'уборка черновиков копии'/);
});
