import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  IMPORT_RESULT_KEY,
  LEGACY_BACKUP_SHARE_TITLE,
  describeUnreadableBackupFile,
  rememberImportResult,
  takeImportResult,
} from '../.test-dist/src/lib/backupImport.js';

// Восстановление копии — вторая половина той же истории, что и экспорт: пока
// оно кончается белым экраном или отказом «проверьте, что это копия INKA»,
// у мастера нет способа вернуть дневник на новый телефон.

function readSource(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n?/g, '\n');
}

const settings = readSource('../src/components/screens/SettingsScreen.tsx');
const app = readSource('../src/components/TattoDiary.tsx');
const confirmImport = settings.slice(settings.indexOf('const confirmImport = async () => {'), settings.indexOf('const progressText ='));
const handleImportFile = settings.slice(settings.indexOf('const handleImportFile = async (file: File) => {'), settings.indexOf('const confirmImport ='));

// ===== ЧТО ИМЕННО ПРИНЕСЛИ НА ИМПОРТ =====

test('текст из окна «Поделиться» опознаётся и объясняется, а не отвергается вслепую', () => {
  const message = describeUnreadableBackupFile(
    { name: 'INKA_save.txt', size: 38 },
    LEGACY_BACKUP_SHARE_TITLE,
  );
  assert.match(message, /только название копии \(38 б\)/);
  assert.match(message, /Сохранить в Файлы/);
  // Ведёт к следующему действию, а не к «попробуйте другой файл».
  assert.match(message, /inka-backup-….zip/);
});

test('пустой файл называется пустым', () => {
  const message = describeUnreadableBackupFile({ name: 'copy.zip', size: 0 }, '');
  assert.match(message, /Файл пустой/);
});

test('короткий посторонний текст отличается от испорченного архива', () => {
  const small = describeUnreadableBackupFile({ name: 'note.txt', size: 12 }, 'привет');
  assert.match(small, /обычный текст \(12 б\)/);

  // Большой файл — это уже не «сохранился текст вместо файла», и гадать не о
  // чем: остаётся прежний общий ответ.
  const big = describeUnreadableBackupFile({ name: 'copy.zip', size: 5 * 1024 * 1024 }, 'PK');
  assert.equal(big, 'Не удалось прочитать файл — проверьте, что это резервная копия INKA.');

  // Похожий на JSON огрызок тоже не выдаётся за «просто текст».
  const json = describeUnreadableBackupFile({ name: 'copy.json', size: 40 }, '{"clients":[');
  assert.equal(json, 'Не удалось прочитать файл — проверьте, что это резервная копия INKA.');
});

test('экран отказа берёт объяснение из начала файла, а не из его имени', () => {
  assert.match(handleImportFile, /await file\.slice\(0, 512\)\.arrayBuffer\(\)/);
  assert.match(handleImportFile, /describeUnreadableBackupFile\(file, head\)/);
  // Тип файла по-прежнему определяется сигнатурой PK, а не расширением.
  assert.match(handleImportFile, /signature\[0\] === 0x50 && signature\[1\] === 0x4b/);
});

test('список файлов ничего не гасит: у поля выбора нет accept', () => {
  // Копия приезжает в «Файлы» через окно «Поделиться» и может оказаться там
  // с каким угодно типом; отфильтрованный список делал её невыбираемой.
  const input = settings.slice(settings.indexOf('ref={fileInputRef}'));
  assert.doesNotMatch(input.slice(0, 300), /accept=/);
});

// ===== БЕЛЫЙ ЭКРАН ПОСЛЕ ВОССТАНОВЛЕНИЯ =====
// Восстановление заканчивалось тем, что только что разобранная библиотека
// читалась обратно (пять getAll) в ТУ ЖЕ страницу, которая минуту назад
// разбирала многосотмегабайтный архив. На телефоне это давало белый экран
// вместо восстановленного дневника.

test('успешное восстановление перезапускает дневник, а не дочитывает базу в ту же страницу', () => {
  assert.match(confirmImport, /rememberImportResult\(done\);/);
  assert.match(confirmImport, /setTimeout\(\(\) => window\.location\.reload\(\), 600\);/);
  // Ни одного чтения хранилища в состояние на успешном пути.
  const success = app.slice(app.indexOf('const restoreFullBackup = async ('), app.indexOf('} catch (error) {', app.indexOf('const restoreFullBackup = async (')));
  assert.doesNotMatch(success, /loadClients\(db\)/);
  assert.doesNotMatch(success, /setMasterInfo\(/);
});

test('прерванное восстановление, наоборот, приводит экран к базе — перезагрузки там не будет', () => {
  const failure = app.slice(app.indexOf('const restoreFullBackup = async ('), app.indexOf('// Единственная точка, где появляется сообщение о сбое хранилища', app.indexOf('const restoreFullBackup = async (')));
  const rescue = failure.slice(failure.indexOf('} catch (error) {'));
  for (const call of ['loadClients(db);', 'loadProjects(db);', 'loadContentEntries(db);', 'reloadContentIngestJobs(db);', 'reloadMasterInfo(db);']) {
    assert.ok(rescue.includes(call), `после сбоя не восстанавливается ${call}`);
  }
  assert.match(rescue, /throw error;/);
});

test('итог восстановления переживает перезагрузку и показывается один раз', () => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };
  try {
    assert.equal(takeImportResult(), null);
    rememberImportResult('Восстановлено: 12 клиент(ов).');
    assert.equal(store.get(IMPORT_RESULT_KEY), 'Восстановлено: 12 клиент(ов).');
    assert.equal(takeImportResult(), 'Восстановлено: 12 клиент(ов).');
    // Второй раз — уже нечего показывать: сообщение не залипает навсегда.
    assert.equal(takeImportResult(), null);
  } finally {
    delete globalThis.localStorage;
  }
});

test('недоступный localStorage не роняет ни импорт, ни экран', () => {
  const broken = () => {
    throw new Error('quota');
  };
  globalThis.localStorage = { getItem: broken, setItem: broken, removeItem: broken };
  try {
    assert.doesNotThrow(() => rememberImportResult('Восстановлено.'));
    assert.equal(takeImportResult(), null);
  } finally {
    delete globalThis.localStorage;
  }
});

test('экран настроек показывает сохранённый итог сразу при открытии', () => {
  assert.match(settings, /useState<string \| null>\(takeImportResult\)/);
});
