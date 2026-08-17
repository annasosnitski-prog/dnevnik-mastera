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
const archive = readSource('../src/lib/backupArchive.ts');

const shareFile = share.slice(share.indexOf('export async function shareOrDownloadFile('));
const handleExport = settings.slice(settings.indexOf('const handlePrepareExport = async () => {'), settings.indexOf('const handleImportFile ='));

test('исход отдачи файла возвращается, а не теряется', () => {
  assert.match(share, /export type ShareJSONResult = 'shared' \| 'downloaded' \| 'cancelled' \| 'failed';/);
  assert.match(shareFile, /Promise<ShareJSONResult>/);
  assert.match(shareFile, /return 'shared';/);
  assert.match(shareFile, /return 'cancelled';/);
  assert.match(shareFile, /return 'downloaded';/);
  assert.match(shareFile, /return 'failed';/);
});

test('ссылка на скачивание побывала в документе — иначе клик игнорируется', () => {
  assert.match(shareFile, /document\.body\.appendChild\(a\);\s*a\.click\(\);/);
});

test('blob не отзывается в том же тике, что и клик', () => {
  // Раньше URL.revokeObjectURL стоял сразу после click(): браузер мог ещё не
  // начать читать blob, и скачивание срывалось молча.
  assert.doesNotMatch(shareFile, /a\.click\(\);\s*URL\.revokeObjectURL/);
  assert.match(shareFile, /setTimeout\(\(\) => URL\.revokeObjectURL\(url\), 60_000\)/);
});

test('сбой share (кроме отмены) не тупик — пробуем обычное скачивание', () => {
  assert.match(shareFile, /if \(isShareAbortError\(err\)\) return 'cancelled';/);
  // После catch управление уходит вниз, к скачиванию, а не возвращается.
  const afterCatch = shareFile.slice(shareFile.indexOf("return 'cancelled';"));
  assert.match(afterCatch, /const url = URL\.createObjectURL\(shared\);/);
});

test('копия собирается из базы, а не из состояния экрана', () => {
  // Пустое состояние из-за сбоя загрузки давало валидный с виду ПУСТОЙ файл.
  assert.match(handleExport, /await onPrepareBackup\(\{/);
  assert.match(app, /return prepareBackupArchive\(db, options\);/);
  assert.match(archive, /tx\.objectStore\(store\)\.getAllKeys\(\)/);
  assert.match(archive, /tx\.objectStore\(store\)\.get\(key\)/);
  // Heavy values are never fetched as one store-sized array.
  assert.doesNotMatch(archive, /objectStore\(store\)\.getAll\(\)/);
  // Экран больше не получает данные для копии как props (типы внутри
  // onImport — это payload импорта, они остаются).
  assert.doesNotMatch(settings, /^  clients: Client\[\];$/m);
  assert.doesNotMatch(settings, /^  projects: Project\[\];$/m);
  assert.doesNotMatch(settings, /^  contentEntries: ContentEntry\[\];$/m);
});

test('недоступное хранилище и пустая база — отказ, а не файл', () => {
  assert.match(app, /if \(!db\) return Promise\.reject\(new Error\('Хранилище сейчас недоступно/);
  // «Пусто» — это когда пусто ВЕЗДЕ. Заполненный кабинет без единого клиента
  // тоже есть что терять, и отказывать в копии там незачем.
  assert.match(
    handleExport,
    /prepared\.summary\.counts\.clients === 0[\s\S]*?prepared\.summary\.counts\.projects === 0[\s\S]*?isMasterInfoEmpty\(normalizeMasterInfo\(masterInfo\)\)/,
  );
  assert.match(handleExport, /Копия не сделана: база вернулась пустой/);
});

// ===== ЛИЧНЫЙ КАБИНЕТ В КОПИИ =====
// Он переехал в базу отдельным PR, а в копию за ним не поехал: уезжали одни
// задачи. Имя, телефон, реквизиты, ссылка на бота, чат-ссылки и подписи
// цветов-маркеров не сохранялись НИКУДА — восстановление на новом телефоне
// возвращало историю работы и теряло всё личное.

test('кабинет читается из базы вместе с остальным', () => {
  assert.match(archive, /tx\.objectStore\(MASTER_INFO_STORE\)\.get\(MASTER_INFO_RECORD_ID\)/);
  assert.match(archive, /const storedMaster = await readMasterRecord\(db\);/);
});

test('кабинет попадает в файл целиком, а не одними задачами', () => {
  assert.match(archive, /writer\.add\('data\/masterInfo\.json'/);
  // Отдельного masterNotes в новом файле нет: задачи несут фото, и вторая их
  // копия удваивала бы самую тяжёлую часть файла.
  assert.doesNotMatch(archive, /masterNotes,/);
});

test('кабинет без записи в базе берётся с экрана, а не теряется', () => {
  // Переезд из localStorage мог ещё не случиться — тогда в базе пусто, но у
  // мастера карточка на экране есть.
  assert.match(archive, /const masterInfo = storedMaster \?\? options\.masterFallback;/);
  assert.match(handleExport, /masterFallback: masterInfo/);
});

test('у экспорта нет молчаливых исходов — каждый показывается мастеру', () => {
  for (const kind of ['cancelled', 'failed']) {
    assert.match(handleExport, new RegExp(`result === '${kind}'`));
  }
  assert.match(handleExport, /setExportState\(\{\s*kind: 'ok'/);
  assert.match(settings, /exportState\.kind === 'error' \? 'var\(--urgent\)' : COLORS\.gold/);
});

test('успех называет, сколько всего сохранено — пустую копию видно сразу', () => {
  assert.match(handleExport, /summary\.counts\.clients\} клиент\(ов\), \$\{summary\.counts\.projects\} проект\(ов\)/);
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
  const fallback = shareFile.slice(shareFile.indexOf('const url = URL.createObjectURL(shared);'));
  assert.match(fallback, /if \(isStandaloneDisplayMode\(\)\) \{[\s\S]*?window\.open\(url, '_blank'\)/);
});

test('обычная вкладка браузера по-прежнему скачивает через <a download> — рабочий путь не тронут', () => {
  const fallback = shareFile.slice(shareFile.indexOf('const url = URL.createObjectURL(shared);'));
  assert.match(fallback, /a\.download = downloadName;/);
  assert.match(fallback, /document\.body\.appendChild\(a\);\s*a\.click\(\);/);
});

test('заблокированный window.open — явный отказ, а не молчаливая «удача»', () => {
  const fallback = shareFile.slice(shareFile.indexOf('const url = URL.createObjectURL(shared);'));
  assert.match(fallback, /return opened \? 'downloaded' : 'failed';/);
});

// ===== 38 БАЙТ ВМЕСТО КОПИИ =====
// Мастер прислала «резервную копию» размером 38 байт: внутри лежал текст
// «INKA — резервная копия» — ровно тот заголовок, который экспорт передавал в
// окно «Поделиться» рядом с файлом. Когда система не может отдать сам файл
// выбранному приложению, она не сообщает об этом никак: уезжает вторая
// половина предложения, текст, и «Сохранить в Файлы» честно сохраняет его
// в .txt. Экспорт выглядит удачным, а копии нет вообще.

test('в окно «Поделиться» уходит только файл — ни title, ни text', () => {
  assert.match(shareFile, /await nav\.share\(\{ files: \[shared\] \}\);/);
  assert.doesNotMatch(shareFile, /nav\.share\(\{[^}]*title/);
  assert.doesNotMatch(shareFile, /nav\.share\(\{[^}]*text/);
  // Заголовка нет и на вызывающей стороне.
  assert.doesNotMatch(settings, /shareOrDownloadFile\([^)]*'INKA — резервная копия'/);
  assert.doesNotMatch(share, /shareTitle/);
});

test('файл без типа доопределяется, а не уезжает «неизвестным предметом»', () => {
  assert.match(share, /function fileWithShareableType\(file: File, fallbackType: string\): File \{\n  if \(file\.type\) return file;/);
  assert.match(shareFile, /const shared = fileWithShareableType\(file, fallbackType\);/);
  // Проверяется в canShare и отдаётся в share один и тот же предмет.
  assert.match(shareFile, /nav\.canShare\(\{ files: \[shared\] \}\)/);
  assert.match(settings, /shareOrDownloadFile\(preparedBackup\.file, preparedBackup\.filename, BACKUP_ARCHIVE_MIME\)/);
  assert.match(archive, /export const BACKUP_ARCHIVE_MIME = 'application\/zip';/);
});

test('у архива обычное расширение .zip — телефон обязан его опознать', () => {
  assert.match(archive, /\$\{now\.toISOString\(\)\.slice\(0, 10\)\}\.zip`/);
  assert.doesNotMatch(archive, /\.inka\.zip'/);
});

test('готовым архив называется только после чтения обратно', () => {
  // «Файл записался» ещё не значит «файл читается»: оборванная запись или
  // кончившееся место дают такой же на вид готовый файл, о котором узнаёшь
  // в тот единственный день, когда копия понадобилась.
  assert.match(archive, /await verifyPreparedArchive\(file, summary, options\.signal\);\n    return \{ file, filename, summary, cleanup \};/);
  const verify = archive.slice(archive.indexOf('async function verifyPreparedArchive('));
  assert.match(verify, /if \(file\.size === 0\) throw new Error/);
  assert.match(verify, /readBack = await inspectBackupArchive\(file, signal\);/);
  assert.match(verify, /readBack\.mediaCount !== expected\.mediaCount/);
  assert.match(verify, /readBack\.hasMasterInfo !== expected\.hasMasterInfo/);
});
