import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Проводка журнала сбоев и единых текстов. Смысл всего пункта — чтобы «у
// меня что-то упало» перестало быть неразбираемым: следы должны оставаться
// сами, без действий мастера.

function readSource(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n?/g, '\n');
}

const app = readSource('../src/components/TattoDiary.tsx');
const settings = readSource('../src/components/screens/SettingsScreen.tsx');

test('о сбое хранилища сообщает ровно одно место', () => {
  // Раньше текст писали на месте в 29 точках — отсюда и двадцать разных
  // формулировок про одно и то же.
  // Всего два вызова, и оба — внутри двух выделенных функций: показать сбой
  // и снять сообщение. Больше нигде текст не появляется.
  const helpers = app.slice(app.indexOf('const reportStorageFailure ='), app.indexOf('// Падения, до которых не дотягивается'));
  assert.equal([...app.matchAll(/setDbError\(/g)].length, 2);
  assert.equal([...helpers.matchAll(/setDbError\(/g)].length, 2, 'setDbError вызывается вне выделенных функций');
  assert.match(app, /const reportStorageFailure = \(kind: StorageFailureKind, action: string, error\?: unknown\) => \{/);
  assert.match(app, /setDbError\(storageFailureMessage\(kind, action\)\);/);
});

test('каждый сбой хранилища попадает в журнал тем же вызовом', () => {
  const report = app.slice(app.indexOf('const reportStorageFailure ='), app.indexOf('const clearStorageFailure ='));
  assert.match(report, /logError\('storage', action, error \?\? kind\)/);
});

test('«Повторить» показывается только там, где есть что переподключать', () => {
  assert.match(app, /\{!db && dbErrorKind !== null && storageFailureNeedsReconnect\(dbErrorKind\) && \(/);
});

test('падения вне try/catch тоже оставляют след', () => {
  // Ошибка в рендере и сорвавшийся промис — самые непонятные для мастера
  // сбои: приложение просто «странно себя ведёт».
  assert.match(app, /window\.addEventListener\('error', onError\)/);
  assert.match(app, /window\.addEventListener\('unhandledrejection', onRejection\)/);
  // Название операции пустое: подпись источника уже всё говорит, иначе в
  // журнале получалось «фоновая задача · фоновая задача».
  assert.match(app, /logError\('crash', '', event\.error \?\? event\.message\)/);
  assert.match(app, /logError\('promise', '', event\.reason\)/);
  // Слушатели снимаются — иначе на каждом монтировании копился бы новый.
  assert.match(app, /window\.removeEventListener\('error', onError\)/);
  assert.match(app, /window\.removeEventListener\('unhandledrejection', onRejection\)/);
});

test('журнал живёт в localStorage — он нужен именно когда база недоступна', () => {
  assert.match(app, /parseErrorLog\(localStorage\.getItem\(ERROR_LOG_KEY\)\)/);
  assert.match(app, /localStorage\.setItem\(ERROR_LOG_KEY, JSON\.stringify\(next\)\)/);
});

test('сам журнал не может уронить приложение', () => {
  const logError = app.slice(app.indexOf('const logError ='), app.indexOf('const clearErrorLog ='));
  // Запись журнала обёрнута в try — переполненный localStorage не должен
  // мешать показать сам сбой.
  assert.match(logError, /try \{[\s\S]*?localStorage\.setItem[\s\S]*?\} catch \{/);
});

test('журнал виден в Настройках и уезжает в резервную копию', () => {
  assert.match(settings, /Последние сбои · \{errorLog\.length\}/);
  assert.match(settings, /copyTextToClipboard\(formatErrorLog\(errorLog\)\)/);
  // Чтобы прислать журнал, достаточно прислать файл копии.
  assert.match(settings, /masterFallback: masterInfo,\s*errorLog,/);
});

test('пустой журнал не показывается', () => {
  assert.match(settings, /\{errorLog\.length > 0 && \(/);
});

test('старых разнобойных формулировок в коде не осталось', () => {
  for (const gone of [
    'Хранилище недоступно — изменения не сохранены.',
    'Не удалось сохранить изменения.',
    'Хранилище недоступно — проект не удалён.',
    'Хранилище недоступно — клиент не удалён.',
    'Хранилище недоступно — импорт не выполнен.',
    'Не удалось загрузить клиентов.',
    'Не удалось загрузить проекты.',
    'Хранилище закрылось. Нажмите «Повторить», чтобы переподключиться.',
  ]) {
    assert.ok(!app.includes(gone), `осталась старая формулировка: ${gone}`);
  }
});

test('операции называются из общего списка, а не строками на месте', () => {
  // Новые формулировки больше не заводятся — заводятся только новые
  // названия операций, и все в одном месте.
  assert.match(app, /STORAGE_ACTIONS\.saveClient/);
  assert.match(app, /STORAGE_ACTIONS\.loadProjects/);
  assert.match(app, /STORAGE_ACTIONS\.importData/);
  assert.doesNotMatch(app, /reportStorageFailure\('[a-z]+', '/);
});
