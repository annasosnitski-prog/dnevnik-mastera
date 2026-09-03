import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { indexedDB } from 'fake-indexeddb';

import {
  breakdownLines,
  emptyBreakdown,
  measureClient,
  measureContentEntry,
  measureJob,
  measureProject,
  measureStorageBreakdown,
  photoBytes,
  reclaimableBytes,
  totalPhotoBytes,
} from '../.test-dist/src/lib/storageBreakdown.js';

// Картинка нужного веса. Содержимое неважно — важна длина строки.
const photo = (bytes) => `data:image/jpeg;base64,${'A'.repeat(Math.max(0, bytes - 23))}`;

// ── Вес одной картинки ───────────────────────────────────────────────────

test('a photo weighs its string length; anything else weighs nothing', () => {
  assert.equal(photoBytes(photo(1000)), 1000);
  // Замер не имеет права упасть на неожиданной записи.
  for (const junk of [null, undefined, 42, {}, [], true]) {
    assert.equal(photoBytes(junk), 0);
  }
});

// ── Раскладка по смыслу ──────────────────────────────────────────────────

test('project photos count as live work — sessions, consultations, refs, healing', () => {
  const into = emptyBreakdown();
  measureProject(
    {
      photos: [photo(100)],
      healingPhotos: [{ url: photo(200) }, { url: photo(300) }],
      sessions: [{ photos: [photo(400)] }],
      consultations: [{ photos: [photo(500)] }],
    },
    into,
  );
  assert.equal(into.works.bytes, 1500);
  assert.equal(into.works.count, 5);
  // Живые фото не должны попадать ни в один «можно удалить» раздел.
  assert.equal(reclaimableBytes(into), 0);
});

// Самая ценная находка замера: после переезда записей на проекты (Этап 2) в
// карточках клиентов остались копии тех же фото. Приложение их не читает —
// они лежали страховкой. Для мастера, работавшей до переезда, это мёртвый
// вес, и он обязан быть виден отдельно от живых фото.
test('the client legacy arrays are reported as dead weight, not as live work', () => {
  const into = emptyBreakdown();
  measureClient(
    {
      documents: [{ fileUrl: photo(700) }],
      sessions: [{ photos: [photo(1000), photo(1000)] }],
      consultations: [{ photos: [photo(500)] }],
    },
    into,
  );
  assert.equal(into.legacy.bytes, 2500);
  assert.equal(into.legacy.count, 3);
  // Документы клиента — это НЕ мёртвый вес, их дневник читает.
  assert.equal(into.documents.bytes, 700);
  assert.equal(into.works.bytes, 0);
  assert.equal(reclaimableBytes(into), 2500);
});

test('content drafts and pending jobs are counted as the second and third copies', () => {
  const into = emptyBreakdown();
  measureContentEntry({ photos: [photo(800)] }, into);
  measureJob({ entry: { photos: [photo(900)] } }, into);
  assert.equal(into.content.bytes, 800);
  assert.equal(into.jobs.bytes, 900);
  // Копии контента НЕ считаются свободно удаляемыми: пока черновик не
  // опубликован, копия его и держит. Решение за мастером.
  assert.equal(reclaimableBytes(into), 0);
});

test('a refresh job carries no entry snapshot and adds nothing', () => {
  const into = emptyBreakdown();
  measureJob({ operation: 'refresh', entryId: 'e1' }, into);
  assert.equal(into.jobs.bytes, 0);
  assert.equal(into.records, 1);
});

test('records with no photos at all still count as seen', () => {
  const into = emptyBreakdown();
  measureClient({}, into);
  measureProject({ photos: [] }, into);
  measureContentEntry(null, into);
  assert.equal(into.records, 3);
  assert.equal(totalPhotoBytes(into), 0);
});

test('the total is the sum of every bucket', () => {
  const into = emptyBreakdown();
  measureProject({ photos: [photo(100)] }, into);
  measureClient({ documents: [{ fileUrl: photo(200) }], sessions: [{ photos: [photo(400)] }] }, into);
  measureContentEntry({ photos: [photo(800)] }, into);
  measureJob({ entry: { photos: [photo(1600)] } }, into);
  assert.equal(totalPhotoBytes(into), 3100);
});

test('the lines lead with what must not be deleted and end with what can', () => {
  const lines = breakdownLines(emptyBreakdown());
  assert.equal(lines[0].label, 'Фото работ');
  assert.equal(lines[lines.length - 1].label, 'Старые копии после переноса');
  // Там, где неочевидно, можно ли удалять, обязано быть пояснение.
  const legacy = lines[lines.length - 1];
  assert.match(legacy.hint, /можно удалить/);
  assert.match(lines[0].hint, /сам дневник/);
});

// ── Обход настоящей базы ─────────────────────────────────────────────────

function openDatabase(name, stores = ['clients', 'projects', 'contentEntries', 'contentIngestJobs']) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => {
      for (const store of stores) request.result.createObjectStore(store, { keyPath: 'id' });
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

test('walking the real database sorts every store into its bucket', async () => {
  const db = await openDatabase('breakdown-walk');
  await writeRecords(db, 'clients', [
    { id: 'c1', documents: [{ fileUrl: photo(700) }], sessions: [{ photos: [photo(1000)] }] },
    { id: 'c2', documents: [], sessions: [], consultations: [{ photos: [photo(500)] }] },
  ]);
  await writeRecords(db, 'projects', [
    { id: 'p1', photos: [photo(100)], sessions: [{ photos: [photo(400)] }] },
    { id: 'p2', healingPhotos: [{ url: photo(300) }] },
  ]);
  await writeRecords(db, 'contentEntries', [{ id: 'e1', photos: [photo(800), photo(800)] }]);
  await writeRecords(db, 'contentIngestJobs', [{ id: 'j1', entry: { photos: [photo(900)] } }]);

  const breakdown = await measureStorageBreakdown(db);

  assert.equal(breakdown.works.bytes, 800);
  assert.equal(breakdown.documents.bytes, 700);
  assert.equal(breakdown.legacy.bytes, 1500);
  assert.equal(breakdown.content.bytes, 1600);
  assert.equal(breakdown.jobs.bytes, 900);
  // 2 клиента + 2 проекта + 1 запись контента + 1 задача.
  assert.equal(breakdown.records, 6);
  assert.equal(totalPhotoBytes(breakdown), 5500);
  db.close();
});

test('an empty diary measures to zero without erroring', async () => {
  const db = await openDatabase('breakdown-empty');
  const breakdown = await measureStorageBreakdown(db);
  assert.equal(breakdown.records, 0);
  assert.equal(totalPhotoBytes(breakdown), 0);
  db.close();
});

// Задачи появились в базе позже клиентов и проектов, поэтому у части
// установок этого стора просто нет. Замер обязан посчитать остальное, а не
// упасть целиком.
test('a database missing the newer stores still measures the ones it has', async () => {
  const db = await openDatabase('breakdown-old-schema', ['clients', 'projects']);
  await writeRecords(db, 'projects', [{ id: 'p1', photos: [photo(250)] }]);
  const breakdown = await measureStorageBreakdown(db);
  assert.equal(breakdown.works.bytes, 250);
  assert.equal(breakdown.jobs.bytes, 0);
  db.close();
});

test('measuring a closed connection rejects instead of hanging', async () => {
  const db = await openDatabase('breakdown-closed');
  db.close();
  await assert.rejects(() => measureStorageBreakdown(db));
});

// ── Проводка в дневнике и Настройках ─────────────────────────────────────

const diary = readFileSync(new URL('../src/components/TattoDiary.tsx', import.meta.url), 'utf8');
const settings = readFileSync(new URL('../src/components/screens/SettingsScreen.tsx', import.meta.url), 'utf8');
const lib = readFileSync(new URL('../src/lib/storageBreakdown.ts', import.meta.url), 'utf8');

// Замер объёма фотобиблиотеки, поднимающий её в память целиком, ронял бы
// дневник ровно в тот момент, когда мастер пытается понять, почему он падает.
test('the walk uses a cursor, never getAll — the measurement must not cause what it measures', () => {
  assert.match(lib, /openCursor\(\)/);
  assert.doesNotMatch(lib, /getAll\(/);
  assert.match(lib, /cursor\.continue\(\)/);
});

test('measuring is on demand and lazily loaded, not part of every start', () => {
  const measure = diary.slice(diary.indexOf('const measureStorageUse'), diary.indexOf('const prepareFullBackup'));
  assert.match(measure, /await import\('\.\.\/lib\/storageBreakdown'\)/);
  // Нет связи — возвращаем null, а не красную плашку: любопытство мастера
  // не должно выглядеть как авария.
  assert.match(measure, /if \(!database\) return null;/);
  assert.match(measure, /logError\('storage', STORAGE_ACTIONS\.measureStorage, err\)/);
  assert.match(settings, /onMeasureStorage: \(\) => Promise<StorageBreakdown \| null>/);
});

test('settings counts only when tapped, and says so while counting', () => {
  assert.match(settings, /\{measuring \? 'Считаем…' : 'Куда ушло место'\}/);
  assert.match(settings, /if \(measuring\) return;/);
  assert.match(settings, /Не удалось посчитать/);
});

test('empty sections are hidden — a master who never had legacy copies sees no talk of them', () => {
  assert.match(settings, /\.filter\(\(line\) => line\.bucket\.count > 0\)/);
});

test('the reclaimable line appears only when there is something to reclaim', () => {
  assert.match(settings, /reclaimableBytes\(breakdown\) > 0 &&/);
  assert.match(settings, /Можно освободить/);
});

test('the journal knows this operation by its own name', () => {
  const messages = readFileSync(new URL('../src/lib/storageMessages.ts', import.meta.url), 'utf8');
  assert.match(messages, /measureStorage: 'подсчёт занятого места'/);
});
