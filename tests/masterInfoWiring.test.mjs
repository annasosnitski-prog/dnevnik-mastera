import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Переезд Личного кабинета в базу. Опасность здесь ровно одна, и она
// молчаливая: запись асинхронная, а состояние уже есть, поэтому стартовое
// значение может успеть лечь в базу ПОВЕРХ настоящей карточки — без ошибки,
// просто данные мастера исчезнут при следующем запуске.

function readSource(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n?/g, '\n');
}

const app = readSource('../src/components/TattoDiary.tsx');
const persistEffect = app.slice(
  app.indexOf('  useEffect(() => {\n    if (!db || !masterInfoLoaded) return;'),
  app.indexOf('// Старая копия в localStorage НЕ обновляется'),
);
const loadEffect = app.slice(
  app.indexOf('    if (!db || masterInfoLoaded) return;'),
  app.indexOf('  useEffect(() => {\n    if (!db || !masterInfoLoaded) return;'),
);

test('до ответа базы в неё не пишется ничего', () => {
  // Без этого условия стартовое значение затирало бы настоящую карточку на
  // каждом запуске.
  assert.match(persistEffect, /if \(!db \|\| !masterInfoLoaded\) return;/);
  assert.match(app, /const \[masterInfoLoaded, setMasterInfoLoaded\] = useState\(false\);/);
});

test('карточка рисуется сразу, из старой копии — без пустого мига', () => {
  assert.match(app, /useState<MasterInfo>\(readLocalMasterInfo\)/);
  assert.match(app, /function readLocalMasterInfo\(\): MasterInfo \{/);
});

test('запись базы заменяет стартовое значение, когда база ответит', () => {
  assert.match(loadEffect, /const stored = request\.result \? normalizeMasterInfo\(request\.result\) : null;/);
  assert.match(loadEffect, /resolveMasterInfoSource\(stored, readLocalMasterInfo\(\)\)/);
  assert.match(loadEffect, /setMasterInfo\(value\);/);
  assert.match(loadEffect, /setMasterInfoLoaded\(true\);/);
});

test('переезд не создаёт пустую запись на ровном месте', () => {
  assert.match(loadEffect, /if \(needsMigration && isMasterInfoEmpty\(value\)\)/);
});

test('старая копия в localStorage остаётся страховкой — её не пишут и не стирают', () => {
  // Обновлять её значило бы вернуть ту самую нехватку квоты, ради которой
  // весь переезд; стирать — остаться без запасного варианта.
  assert.doesNotMatch(app, /localStorage\.setItem\(MASTER_INFO_LOCAL_KEY/);
  assert.doesNotMatch(app, /localStorage\.removeItem\(MASTER_INFO_LOCAL_KEY/);
  // Читается — только на старте и при выборе источника.
  assert.match(app, /localStorage\.getItem\(MASTER_INFO_LOCAL_KEY\)/);
});

test('карточка лежит одной записью с постоянным id', () => {
  assert.match(persistEffect, /put\(\{ \.\.\.masterInfo, id: MASTER_INFO_RECORD_ID \}\)/);
  assert.match(loadEffect, /\.get\(MASTER_INFO_RECORD_ID\)/);
});

test('стор заводится при обновлении схемы, не трогая существующие', () => {
  assert.match(app, /if \(!db\.objectStoreNames\.contains\(MASTER_INFO_STORE\)\) \{\s*db\.createObjectStore\(MASTER_INFO_STORE, \{ keyPath: 'id' \}\);/);
});

test('прежнего сообщения про переполнение localStorage больше нет', () => {
  // Оно описывало ограничение, которого больше не существует: квоты
  // IndexedDB хватает под фото в задачах.
  assert.doesNotMatch(app, /слишком много данных \(обычно из-за фото\)/);
});

test('сбой записи виден мастеру и попадает в журнал', () => {
  // Тексты больше не пишутся на месте: они собираются из состояния и
  // названия операции (см. lib/storageMessages.ts), а та же пара уходит в
  // журнал сбоев.
  assert.match(persistEffect, /reportStorageFailure\('write', STORAGE_ACTIONS\.saveMasterInfo\)/);
  assert.match(loadEffect, /reportStorageFailure\('read', STORAGE_ACTIONS\.loadMasterInfo\)/);
});
