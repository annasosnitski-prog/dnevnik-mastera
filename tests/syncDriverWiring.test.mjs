import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function readSource(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n?/g, '\n');
}

const source = readSource('../src/sync/useSyncDriver.ts');
const timerEffect = source.slice(
  source.indexOf('  // Часовой таймер + один синк сразу после привязки/запуска.'),
  source.indexOf('  // Возвращение в приложение'),
);

test('часовой таймер не перезапускается на переходе paired → syncing → paired', () => {
  // runSync намеренно меняет phase для UI. Если эффект таймера зависит от
  // `phase === "paired"`, syncing временно делает зависимость false, cleanup
  // снимает таймер, а возврат в paired снова монтирует эффект и немедленно
  // запускает runSync — получается бесконечный цикл.
  assert.match(source, /const syncEnabled = phase === 'paired' \|\| phase === 'syncing';/);
  assert.match(timerEffect, /if \(!syncEnabled\)/);
  assert.match(timerEffect, /\}, \[syncEnabled\]\);/);
  assert.doesNotMatch(timerEffect, /\[phase === 'paired'\]/);
});

test('runSync по-прежнему показывает syncing в UI и возвращает paired после завершения', () => {
  assert.match(source, /setPhase\('syncing'\);/);
  assert.match(source, /finally \{\s*syncingRef\.current = false;\s*setPhase\('paired'\);/);
});
