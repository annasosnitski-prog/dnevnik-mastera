import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Проводка «сохранности» по исходнику. Как и у Этапа 2, всё здесь ломается
// тихо: не запросили постоянное хранилище — узнаем в день, когда браузер
// вычистит данные; отметили копию не в том месте — напоминание замолчит,
// ничего не защитив.

function readSource(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n?/g, '\n');
}

const app = readSource('../src/components/TattoDiary.tsx');
const settings = readSource('../src/components/screens/SettingsScreen.tsx');

test('постоянное хранилище запрашивается при запуске, один раз', () => {
  assert.match(app, /const already = await storage\.persisted\(\);/);
  assert.match(app, /const granted = already \|\| \(await storage\.persist\(\)\);/);
  // Пустой массив зависимостей — запрос на монтировании, а не на каждый рендер.
  const effect = app.slice(app.indexOf('const [persistence, setPersistence]'), app.indexOf('const connectDb ='));
  assert.match(effect, /\}, \[\]\);/);
});

test('браузер без поддержки не выдаётся за отказ', () => {
  const effect = app.slice(app.indexOf('const [persistence, setPersistence]'), app.indexOf('const connectDb ='));
  // Нет persist/persisted — выходим, оставляя состояние 'unsupported'.
  assert.match(effect, /if \(!storage\?\.persist \|\| !storage\.persisted\) return;/);
  assert.match(app, /useState<PersistenceState>\('unsupported'\)/);
});

test('отметка о копии ставится только на реально сделанную копию', () => {
  const handleExport = settings.slice(settings.indexOf('const handleExport = async () => {'), settings.indexOf('const handleImportFile ='));
  // Отмена и сбой копией не считаются — иначе напоминание замолчит зря.
  const okBranch = handleExport.slice(handleExport.indexOf("result === 'failed'"));
  assert.match(okBranch, /onBackupDone\(\);/);
  const cancelBranch = handleExport.slice(handleExport.indexOf("result === 'cancelled'"), handleExport.indexOf("result === 'failed'"));
  assert.doesNotMatch(cancelBranch, /onBackupDone/);
  // И не раньше, чем файл действительно отдан.
  assert.ok(handleExport.indexOf('onBackupDone()') > handleExport.indexOf('await shareOrDownloadJSON'));
});

test('напоминание о копии видно на всех экранах, но не спорит с другими', () => {
  const banner = app.slice(app.indexOf('{!dbError && !sheetOpen && !backupNoticeHidden'), app.indexOf('{/* ═══════════ LIST SCREEN ═══════════ */}'));
  // Не карточка в «Напоминаниях»: те про работу с клиентами, это про дневник.
  assert.match(banner, /position: 'absolute'/);
  assert.match(banner, /данные есть только в этом телефоне/);
  // Уступает ошибке хранилища и не лезет поверх открытой формы.
  assert.match(app, /\{!dbError && !sheetOpen && !backupNoticeHidden && backupState\.kind !== 'fresh' && \(/);
});

test('закрыть напоминание можно только до перезапуска', () => {
  // Копия от закрытия плашки не появляется, поэтому «больше не показывать»
  // здесь было бы обманом.
  assert.match(app, /const \[backupNoticeHidden, setBackupNoticeHidden\] = useState\(false\);/);
  assert.doesNotMatch(app, /localStorage\.setItem\([^)]*backupNotice/);
});

test('«Сделать» ведёт в Настройки, а не просто прячет плашку', () => {
  const banner = app.slice(app.indexOf('{!dbError && !sheetOpen && !backupNoticeHidden'), app.indexOf('{/* ═══════════ LIST SCREEN ═══════════ */}'));
  assert.match(banner, /setScreen\('settings'\)/);
});

test('в Настройках видно и состояние хранилища, и возраст копии', () => {
  assert.match(settings, /persistenceText\(persistence\)/);
  assert.match(settings, /backupStatusText\(backup\)/);
  assert.match(settings, /formatMegabytes\(storageEstimate\?\.usage\)/);
  // Когда браузер вправе удалить данные — прямо сказано, что делать.
  assert.match(settings, /persistence === 'not-persisted' && \(/);
  assert.match(settings, /Держите копию вне телефона/);
});
