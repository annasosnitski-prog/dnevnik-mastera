import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const swTemplate = readFileSync(new URL('../src/sw.template.js', import.meta.url), 'utf8');
const viteConfig = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');

// Регрессия на реальный баг: sw.js был побайтово одинаковым в каждой сборке,
// поэтому браузер никогда не устанавливал новый воркер, controllerchange не
// наступал и телефон месяцами крутил старый бандл. Если штамп когда-нибудь
// снова превратится в захардкоженную строку, эти тесты должны упасть.
test('service worker template is stamped per build, not a hardcoded constant', () => {
  assert.match(swTemplate, /__BUILD_ID__/);
  assert.match(swTemplate, /const CACHE_NAME = `inka-\$\{BUILD_ID\}`/);
  assert.doesNotMatch(swTemplate, /const CACHE_NAME = ['"]inka-v\d+['"]/);
});

test('stamping the template yields different bytes for different builds', () => {
  const first = swTemplate.replace(/__BUILD_ID__/g, 'build-one');
  const second = swTemplate.replace(/__BUILD_ID__/g, 'build-two');
  assert.notEqual(first, second);
  assert.doesNotMatch(first, /__BUILD_ID__/);
  assert.doesNotMatch(second, /__BUILD_ID__/);
});

test('no static public/sw.js — it would overwrite the generated, stamped one', () => {
  assert.equal(existsSync(new URL('../public/sw.js', import.meta.url)), false);
});

test('build emits the stamped worker plus version.json and injects the id into the app', () => {
  assert.match(viteConfig, /fileName: 'sw\.js'/);
  assert.match(viteConfig, /fileName: 'version\.json'/);
  assert.match(viteConfig, /replace\(\/__BUILD_ID__\/g, buildId\)/);
  assert.match(viteConfig, /__BUILD_ID__: JSON\.stringify\(buildId\)/);
});

test('version check bypasses the service worker so it always sees the server', () => {
  assert.match(swTemplate, /url\.pathname === '\/version\.json'/);
});

test('app falls back to a version check that does not depend on the service worker', () => {
  assert.match(main, /\/version\.json/);
  assert.match(main, /cache: 'no-store'/);
  // Сравнение версий и решение «перезагружаться ли сейчас» переехали в
  // lib/appUpdate.ts — там их можно проверить тестом, а не на живом
  // телефоне; см. tests/appUpdateTiming.test.mjs.
  assert.match(main, /currentBuildId: __BUILD_ID__/);
  assert.match(main, /deployedBuildId: deployed/);
  // Проверка должна висеть на возврате из фона, иначе фоновое приложение
  // никогда о новой версии не узнает.
  assert.match(main, /addEventListener\('visibilitychange', onResume\)/);
  assert.match(main, /addEventListener\('pageshow', onResume\)/);
});

test('reload is guarded against loops and against firing on first install', () => {
  assert.match(main, /parseReloadGuard/);
  assert.match(main, /reloadRequested/);
  // controllerchange срабатывает и при самой первой установке воркера —
  // перезагружаться там незачем, код и так свежий.
  assert.match(main, /hadController/);
});
