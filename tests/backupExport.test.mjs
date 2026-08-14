import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Резервная копия — единственное, что стоит между мастером и потерей всей
// истории работы. Все проверки здесь про один и тот же класс отказа: экспорт,
// который НЕ СРАБОТАЛ, но выглядел как сработавший.

function readSource(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n?/g, '\n');
}

const share = readSource('../src/lib/contentShare.ts');
const settings = readSource('../src/components/screens/SettingsScreen.tsx');
const app = readSource('../src/components/TattoDiary.tsx');

const shareJSON = share.slice(share.indexOf('export async function shareOrDownloadJSON('));
const handleExport = settings.slice(settings.indexOf('const handleExport = async () => {'), settings.indexOf('const handleImportFile ='));

test('исход отдачи файла возвращается, а не теряется', () => {
  assert.match(share, /export type ShareJSONResult = 'shared' \| 'downloaded' \| 'cancelled' \| 'failed';/);
  assert.match(shareJSON, /Promise<ShareJSONResult>/);
  assert.match(shareJSON, /return 'shared';/);
  assert.match(shareJSON, /return 'cancelled';/);
  assert.match(shareJSON, /return 'downloaded';/);
  assert.match(shareJSON, /return 'failed';/);
});

test('ссылка на скачивание побывала в документе — иначе клик игнорируется', () => {
  assert.match(shareJSON, /document\.body\.appendChild\(a\);\s*a\.click\(\);/);
});

test('blob не отзывается в том же тике, что и клик', () => {
  // Раньше URL.revokeObjectURL стоял сразу после click(): браузер мог ещё не
  // начать читать blob, и скачивание срывалось молча.
  assert.doesNotMatch(shareJSON, /a\.click\(\);\s*URL\.revokeObjectURL/);
  assert.match(shareJSON, /setTimeout\(\(\) => URL\.revokeObjectURL\(url\), 60_000\)/);
});

test('сбой share (кроме отмены) не тупик — пробуем обычное скачивание', () => {
  assert.match(shareJSON, /if \(isShareAbortError\(err\)\) return 'cancelled';/);
  // После catch управление уходит вниз, к скачиванию, а не возвращается.
  const afterCatch = shareJSON.slice(shareJSON.indexOf("return 'cancelled';"));
  assert.match(afterCatch, /const url = URL\.createObjectURL\(file\);/);
});

test('копия собирается из базы, а не из состояния экрана', () => {
  // Пустое состояние из-за сбоя загрузки давало валидный с виду ПУСТОЙ файл.
  assert.match(handleExport, /await onReadBackupData\(\)/);
  assert.match(app, /const readBackupPayload = \(\): Promise</);
  assert.match(app, /openTx\(\['clients', 'projects', 'contentEntries', MASTER_INFO_STORE\], db, 'readonly'/);
  // Экран больше не получает данные для копии как props (типы внутри
  // onImport — это payload импорта, они остаются).
  assert.doesNotMatch(settings, /^  clients: Client\[\];$/m);
  assert.doesNotMatch(settings, /^  projects: Project\[\];$/m);
  assert.doesNotMatch(settings, /^  contentEntries: ContentEntry\[\];$/m);
});

test('недоступное хранилище и пустая база — отказ, а не файл', () => {
  assert.match(handleExport, /catch \{[\s\S]*?Копия не сделана: хранилище сейчас недоступно/);
  // «Пусто» — это когда пусто ВЕЗДЕ. Заполненный кабинет без единого клиента
  // тоже есть что терять, и отказывать в копии там незачем.
  assert.match(
    handleExport,
    /if \(data\.clients\.length === 0 && data\.projects\.length === 0 && isMasterInfoEmpty\(normalizeMasterInfo\(masterCard\)\)\)/,
  );
  assert.match(handleExport, /Копия не сделана: база вернулась пустой/);
});

// ===== ЛИЧНЫЙ КАБИНЕТ В КОПИИ =====
// Он переехал в базу отдельным PR, а в копию за ним не поехал: уезжали одни
// задачи. Имя, телефон, реквизиты, ссылка на бота, чат-ссылки и подписи
// цветов-маркеров не сохранялись НИКУДА — восстановление на новом телефоне
// возвращало историю работы и теряло всё личное.

test('кабинет читается из базы вместе с остальным', () => {
  assert.match(app, /tx\.objectStore\(MASTER_INFO_STORE\)\.get\(MASTER_INFO_RECORD_ID\)\.onsuccess/);
  assert.match(app, /out\.masterInfo = \(e\.target as IDBRequest\)\.result \?\? null;/);
});

test('кабинет попадает в файл целиком, а не одними задачами', () => {
  assert.match(handleExport, /masterInfo: masterCard/);
  // Отдельного masterNotes в новом файле нет: задачи несут фото, и вторая их
  // копия удваивала бы самую тяжёлую часть файла.
  assert.doesNotMatch(handleExport, /masterNotes,/);
});

test('кабинет без записи в базе берётся с экрана, а не теряется', () => {
  // Переезд из localStorage мог ещё не случиться — тогда в базе пусто, но у
  // мастера карточка на экране есть.
  assert.match(handleExport, /const masterCard = data\.masterInfo \?\? masterInfo;/);
});

test('у экспорта нет молчаливых исходов — каждый показывается мастеру', () => {
  for (const kind of ['cancelled', 'failed']) {
    assert.match(handleExport, new RegExp(`result === '${kind}'`));
  }
  assert.match(handleExport, /setExportState\(\{\s*kind: 'ok'/);
  assert.match(settings, /exportState\.kind === 'ok' \? COLORS\.gold : 'var\(--urgent\)'/);
});

test('успех называет, сколько всего сохранено — пустую копию видно сразу', () => {
  assert.match(handleExport, /data\.clients\.length\} клиент\(ов\), \$\{data\.projects\.length\} проект\(ов\)/);
});

// ===== СКАЧИВАНИЕ В STANDALONE-РЕЖИМЕ (iOS, «с экрана Домой») =====
// Мастер это поймала на телефоне: жмёт «Экспортировать», окно «Поделиться»
// не появляется вовсе (значит nav.share выше даже не пробовался/не смог), и
// вместо файла — белая вспышка и приложение снова на первом экране. Тот же
// код в обычной вкладке Safari сработал штатно. Причина — WebKit не умеет
// скачивать blob через синтетический клик по <a download> именно в
// standalone-режиме и вместо этого перезапускает страницу.

test('standalone-режим определяется до попытки скачивания', () => {
  assert.match(share, /function isStandaloneDisplayMode\(\): boolean \{/);
  assert.match(share, /navigator\.standalone/);
  assert.match(share, /window\.matchMedia\('\(display-mode: standalone\)'\)\.matches/);
});

test('в standalone файл уходит через window.open, а не через клик по ссылке', () => {
  // window.open открывает blob в отдельной вкладке системного браузера — это
  // не навигация самой страницы приложения, поэтому её не перезапускает.
  const fallback = shareJSON.slice(shareJSON.indexOf('const url = URL.createObjectURL(file);'));
  assert.match(fallback, /if \(isStandaloneDisplayMode\(\)\) \{[\s\S]*?window\.open\(url, '_blank'\)/);
});

test('обычная вкладка браузера по-прежнему скачивает через <a download> — рабочий путь не тронут', () => {
  const fallback = shareJSON.slice(shareJSON.indexOf('const url = URL.createObjectURL(file);'));
  assert.match(fallback, /a\.download = filename;/);
  assert.match(fallback, /document\.body\.appendChild\(a\);\s*a\.click\(\);/);
});

test('заблокированный window.open — явный отказ, а не молчаливая «удача»', () => {
  const fallback = shareJSON.slice(shareJSON.indexOf('const url = URL.createObjectURL(file);'));
  assert.match(fallback, /return opened \? 'downloaded' : 'failed';/);
});
