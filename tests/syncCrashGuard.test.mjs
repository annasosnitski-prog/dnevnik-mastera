import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SYNC_STARTED_AT_KEY,
  decideSyncStartup,
  syncCrashExplanation,
  syncCrashLogMessage,
} from '../.test-dist/src/lib/syncCrashGuard.js';

// Регрессия на реальный сюжет с планшета: полный прогон синка падал по
// памяти, а журнал сбоев об этом молчал — процесс страницы не бросает
// исключение, он просто исчезает. decideSyncStartup — единственное место,
// где решается, считать ли это падением, поэтому и проверяется отдельно от
// localStorage/эффектов React.

test('ключ отметки стабилен — исполняющий код читает и пишет именно его', () => {
  assert.equal(SYNC_STARTED_AT_KEY, 'inka-sync-started-at');
});

test('нет отметки — прошлый прогон (если был) завершился штатно', () => {
  assert.deepEqual(decideSyncStartup(null), { kind: 'clean' });
});

test('мусор в localStorage не считается падением', () => {
  assert.deepEqual(decideSyncStartup('не дата'), { kind: 'clean' });
  assert.deepEqual(decideSyncStartup(''), { kind: 'clean' });
});

test('оставшаяся отметка — прошлый прогон не долетел до своего finally', () => {
  const startedAt = '2026-01-01T10:00:00.000Z';
  assert.deepEqual(decideSyncStartup(startedAt), { kind: 'crashed', startedAt });
});

test('объяснение для lastError называет время и не пугает тем, что нечем починить самой', () => {
  const text = syncCrashExplanation('2026-01-01T10:00:00.000Z');
  assert.match(text, /не завершилась/);
  assert.match(text, /Синхронизировать сейчас/);
});

test('объяснение терпимо к нераспознанной дате — печатает исходную строку как есть', () => {
  const text = syncCrashExplanation('garbage');
  assert.match(text, /garbage/);
});

test('сообщение для журнала несёт точное время начала — для разбора инцидента', () => {
  const startedAt = '2026-01-01T10:00:00.000Z';
  const text = syncCrashLogMessage(startedAt);
  assert.match(text, new RegExp(startedAt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(text, /не снял отметку/);
});
