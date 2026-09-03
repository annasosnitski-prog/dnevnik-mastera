import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Кнопка «Освободить» под разбором «Куда ушло место» (lib/storageBreakdown.ts,
// раздел legacy). Раньше эта секция только СООБЩАЛА, сколько можно
// освободить, и не давала ни одной кнопки, чтобы это сделать — мастер видела
// цифру и упиралась в стену. Эти тесты держат саму запись (одна транзакция
// на всех клиентов, не через withStorage) и трёхшаговое подтверждение в
// Настройках (кнопка → «Удалить»/«Отмена» → результат).

function readSource(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n?/g, '\n');
}

const app = readSource('../src/components/TattoDiary.tsx');
const settings = readSource('../src/components/screens/SettingsScreen.tsx');
const messages = readSource('../src/lib/storageMessages.ts');

// ── Запись: TattoDiary.tsx ────────────────────────────────────────────────

function clearFn() {
  return app.slice(app.indexOf('const clearLegacyClientRecords = ('), app.indexOf('const prepareFullBackup = async ('));
}

test('операция названа в общем списке — сообщение и журнал получают её имя, а не техническое', () => {
  assert.match(messages, /clearLegacyRecords: 'очистка старых копий'/);
});

test('только карточки с непустыми легаси-массивами попадают в запись', () => {
  assert.match(clearFn(), /storedClients\.filter\(\(c\) => c\.sessions\.length > 0 \|\| c\.consultations\.length > 0\)/);
});

test('запись одной транзакцией на всех клиентов, а не поштучно через withStorage', () => {
  const fn = clearFn();
  // Это разовая массовая операция по явному нажатию, а не автосохранение
  // одной карточки — очередь отложенных записей здесь неуместна.
  assert.doesNotMatch(fn, /withStorage\(/);
  assert.match(fn, /openWriteTx\('clients', database, STORAGE_ACTIONS\.clearLegacyRecords\)/);
  // Один store.put на цикл, не отдельная транзакция на клиента.
  assert.equal((fn.match(/openWriteTx\(/g) ?? []).length, 1);
  assert.match(fn, /for \(const client of changed\) store\.put\(\{ \.\.\.client, sessions: \[\], consultations: \[\] \}\)/);
});

test('очищаются оба легаси-массива, а не только сессии', () => {
  assert.match(clearFn(), /sessions: \[\], consultations: \[\]/);
});

test('нет соединения — null, как у соседнего measureStorageUse (тот же контракт для Настроек)', () => {
  const fn = clearFn();
  assert.match(fn, /if \(!database\) return Promise\.resolve\(null\)/);
});

test('нечего очищать — 0, отличимо от null (сбоя)', () => {
  assert.match(clearFn(), /if \(changed\.length === 0\) return Promise\.resolve\(0\)/);
});

test('успех перечитывает клиентов и возвращает число изменённых карточек', () => {
  const fn = clearFn();
  assert.match(fn, /tx\.oncomplete = \(\) => \{\s*loadClients\(database\);\s*resolve\(changed\.length\);/);
});

test('ошибка транзакции сообщает через reportStorageFailure и резолвится null, не бросает', () => {
  const fn = clearFn();
  assert.match(fn, /tx\.onerror = \(\) => \{\s*reportStorageFailure\('write', STORAGE_ACTIONS\.clearLegacyRecords\);\s*resolve\(null\);/);
});

test('проп подключён к вызову экрана', () => {
  assert.match(app, /onClearLegacyRecords=\{clearLegacyClientRecords\}/);
});

// ── Экран: SettingsScreen.tsx ────────────────────────────────────────────

function settingsBlock() {
  return settings.slice(settings.indexOf("{legacyClearState.kind === 'done'"), settings.indexOf('{breakdown.records === 0'));
}

test('интерфейс принимает onClearLegacyRecords с тем же контрактом, что onMeasureStorage', () => {
  assert.match(settings, /onClearLegacyRecords: \(\) => Promise<number \| null>/);
});

test('удаление требует явного подтверждения, а не срабатывает с первого тапа', () => {
  const block = settingsBlock();
  assert.match(block, /kind: 'confirm'/);
  assert.match(block, /Удалить без возврата\?/);
  assert.match(block, /onClick=\{\(\) => setLegacyClearState\(\{ kind: 'idle' \}\)\}/);
});

test('кнопка «Освободить» недоступна повторно, пока идёт удаление', () => {
  const block = settingsBlock();
  assert.match(block, /legacyClearState\.kind === 'clearing' \? undefined : \(\) => setLegacyClearState\(\{ kind: 'confirm' \}\)/);
  assert.match(block, /'Удаляем…'/);
});

test('после успеха breakdown переизмеряется — раздел «старые копии» не должен висеть с прежней цифрой', () => {
  const handler = settings.slice(settings.indexOf('const handleClearLegacy = async () => {'), settings.indexOf('const archiveSourceRelation ='));
  assert.match(handler, /const changed = await onClearLegacyRecords\(\)/);
  assert.match(handler, /const result = await onMeasureStorage\(\)/);
  assert.match(handler, /if \(result\) setBreakdown\(result\)/);
});

test('freedBytes снимается ДО очистки — после переизмерения legacy.bytes будет уже 0', () => {
  const handler = settings.slice(settings.indexOf('const handleClearLegacy = async () => {'), settings.indexOf('const archiveSourceRelation ='));
  assert.match(handler, /const freedBytes = breakdown\.legacy\.bytes;/);
  // freedBytes идёт в setLegacyClearState ДО повторного onMeasureStorage.
  assert.ok(handler.indexOf('freedBytes') < handler.indexOf('onMeasureStorage()'));
});

test('сбой очистки показывает то же по духу сообщение, что и сбой подсчёта', () => {
  assert.match(settings, /Не удалось очистить — хранилище сейчас недоступно\. Попробуйте ещё раз\./);
});

test('успех показывается ВНЕ условия reclaimableBytes > 0 — иначе исчезнет в тот же кадр, что появился', () => {
  // Сразу после успеха onMeasureStorage обнуляет legacy, и
  // reclaimableBytes(breakdown) > 0 становится false. Если бы баннер успеха
  // был внутри этого условия, мастер не успела бы его увидеть.
  const doneBanner = settings.slice(
    settings.indexOf("{legacyClearState.kind === 'done' && ("),
    settings.indexOf('{reclaimableBytes(breakdown) > 0 && legacyClearState'),
  );
  assert.match(doneBanner, /Освобождено \{formatMegabytes\(legacyClearState\.freedBytes\)\}/);
  // И это не то же самое место, что предложение «можно освободить» —
  // проверяем, что оба блока СОСЕДНИЕ, а не один внутри другого.
  assert.ok(settings.indexOf("{legacyClearState.kind === 'done' && (") < settings.indexOf('{reclaimableBytes(breakdown) > 0 && legacyClearState'));
});

test('предложение «можно освободить» гаснет, пока показан результат — не спорит с ним на одном экране', () => {
  assert.match(settings, /\{reclaimableBytes\(breakdown\) > 0 && legacyClearState\.kind !== 'done' && \(/);
});
