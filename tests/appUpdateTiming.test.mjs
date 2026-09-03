import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  decideUpdate,
  isBusy,
  parseReloadGuard,
  BUSY_ATTRIBUTE,
  UPDATE_RELOAD_GUARD_MS,
  UPDATE_RELOAD_MAX_ATTEMPTS,
} from '../.test-dist/src/lib/appUpdate.js';

const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
const diary = readFileSync(new URL('../src/components/TattoDiary.tsx', import.meta.url), 'utf8');

const decide = (over = {}) =>
  decideUpdate({
    currentBuildId: 'old',
    deployedBuildId: 'new',
    busy: false,
    now: 1_000_000,
    guard: null,
    ...over,
  });

test('same build — nothing to do', () => {
  assert.equal(decide({ deployedBuildId: 'old' }).kind, 'up-to-date');
  assert.equal(decide({ deployedBuildId: '' }).kind, 'up-to-date');
});

test('a new build on a free screen reloads right away', () => {
  const decision = decide();
  assert.equal(decision.kind, 'reload');
  assert.deepEqual(decision.guard, { buildId: 'new', attempts: 1, at: 1_000_000 });
});

// Главный сюжет: перезагрузка посреди заполненной формы стирает введённое.
// Для мастера это не «обновление», а «дневник выбросил мой текст».
test('a new build never interrupts the master mid-form', () => {
  assert.equal(decide({ busy: true }).kind, 'defer');
});

test('the deferred update goes through the moment she is free', () => {
  assert.equal(decide({ busy: true }).kind, 'defer');
  assert.equal(decide({ busy: false }).kind, 'reload');
});

// Второй сюжет: если перезагрузка новую версию НЕ подхватывает (сервер или
// кэш продолжают отдавать старый index.html), прежняя защита лишь растягивала
// цикл на минуту — приложение перезапускало себя раз в минуту, вечно. Ровно
// это и есть «он постоянно падает и обновляется».
test('reloading stops after a couple of attempts that did not help', () => {
  const guard = { buildId: 'new', attempts: UPDATE_RELOAD_MAX_ATTEMPTS, at: 0 };
  assert.equal(decide({ guard, now: 10_000_000 }).kind, 'give-up');
  // И не оживает от того, что прошло время.
  assert.equal(decide({ guard, now: 999_999_999 }).kind, 'give-up');
});

test('attempts are counted per deployed version, so a real new deploy is not blocked', () => {
  const spent = { buildId: 'stuck', attempts: UPDATE_RELOAD_MAX_ATTEMPTS, at: 0 };
  const decision = decide({ deployedBuildId: 'genuinely-newer', guard: spent });
  assert.equal(decision.kind, 'reload');
  assert.equal(decision.guard.attempts, 1);
});

test('two reloads in a row for one version are spaced out', () => {
  const guard = { buildId: 'new', attempts: 1, at: 1_000_000 };
  assert.equal(decide({ guard, now: 1_000_000 + UPDATE_RELOAD_GUARD_MS - 1 }).kind, 'defer');
  const later = decide({ guard, now: 1_000_000 + UPDATE_RELOAD_GUARD_MS });
  assert.equal(later.kind, 'reload');
  assert.equal(later.guard.attempts, 2);
});

test('the guard survives a reload as JSON, and junk in it is ignored', () => {
  assert.deepEqual(parseReloadGuard('{"buildId":"a","attempts":1,"at":5}'), { buildId: 'a', attempts: 1, at: 5 });
  for (const junk of [null, '', 'not json', '[]', '{"buildId":"a"}', '{"buildId":1,"attempts":1,"at":1}']) {
    assert.equal(parseReloadGuard(junk), null, `не отброшено: ${junk}`);
  }
});

test('busy is read off the document root, so it works with React torn down', () => {
  const root = (value) => ({ getAttribute: (name) => (name === BUSY_ATTRIBUTE ? value : null) });
  assert.equal(isBusy(root('1')), true);
  assert.equal(isBusy(root(null)), false);
  assert.equal(isBusy(null), false);
});

// ── Проводка ─────────────────────────────────────────────────────────────

test('the diary marks itself busy whenever a sheet or form is open', () => {
  assert.match(diary, /root\.setAttribute\(BUSY_ATTRIBUTE, '1'\)/);
  assert.match(diary, /\}, \[sheetOpen\]\);/);
});

test('main.tsx decides through the shared rule, not by reloading on sight', () => {
  assert.match(main, /decideUpdate\(\{/);
  assert.match(main, /busy: isBusy\(document\.documentElement\)/);
  assert.doesNotMatch(main, /deployed !== __BUILD_ID__\) reloadForNewBuild/);
});

test('a deferred update is picked up later without another version fetch', () => {
  assert.match(main, /watchForFreeMoment/);
  assert.match(main, /setInterval/);
});

test('the service worker takeover obeys the same rules as the version check', () => {
  // Раньше controllerchange перезагружал страницу немедленно — в том числе
  // посреди заполненной формы.
  assert.match(main, /reloadForNewWorker/);
  assert.match(main, /function reloadForNewWorker\(\) \{\s*void checkForNewBuild\(\);/);
});

test('the two resume events do not cost two version requests', () => {
  // visibilitychange и pageshow при возврате из фона приходят оба.
  assert.match(main, /checkInFlight/);
});
