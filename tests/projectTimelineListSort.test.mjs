import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// ProjectTimelineList (как и ProjectsTab в DetailScreen, см.
// clientProjectsTab.test.mjs) не рендерится в node --test — нет DOM-харнеса
// в этом проекте. Проверяем проводку по исходнику. Сама сортировка/доля
// прогресса — чистые функции, покрыты в projectPipeline.test.mjs.

const source = readFileSync(new URL('../src/components/project/ProjectTimelineList.tsx', import.meta.url), 'utf8');

test('по умолчанию список сортируется по прогрессу — почти завершённые первыми', () => {
  assert.match(source, /useState<TimelineSortMode>\('progress'\)/);
});

test('«Прогресс» — первый пункт в меню сортировки, остальные — те же режимы, что у «Проектов» в карточке клиента', () => {
  assert.match(source, /\{ key: 'progress', label: 'Прогресс' \},\s*\.\.\.PROJECT_SORT_MODES/);
});

test('режим «прогресс» сортирует по убыванию доли (самая полная рельса — первой)', () => {
  assert.match(source, /b\.progress - a\.progress/);
});

test('фильтр — только «Тип», без «Статуса» (список и так всегда только активные проекты)', () => {
  assert.match(source, /useState<ProjectFilters>\(EMPTY_PROJECT_FILTERS\)/);
  assert.match(source, /PROJECT_CATEGORIES\.map\(\(c\) => c\.key\)/);
  assert.doesNotMatch(source, /PROJECT_STATUSES/);
  assert.match(source, /setFilters\(\(f\) => \(\{ \.\.\.f, category: v \}\)\)/);
});

test('фильтры/сортировка — те же aria-label, что у аналогичной панели в карточке клиента', () => {
  assert.match(source, /aria-label=\{filtersOpen \? 'Скрыть фильтры' : 'Фильтры'\}/);
  assert.match(source, /aria-label=\{sortOpen \? 'Скрыть сортировку' : 'Сортировка'\}/);
});

test('«под фильтр не подошло» отличается от «пусто вообще»', () => {
  assert.match(source, /Под фильтр не подошёл ни один проект/);
  assert.match(source, /Здесь пока пусто — ни один активный проект ещё не ждёт сессии/);
});

test('доля прогресса считается общими функциями домена, а не своей копией', () => {
  assert.match(source, /getPipelineProgress\(segments, today\)/);
  assert.match(source, /getSessionWindowProgress\(sessionWindow\.lastSessionDate, sessionWindow\.nextSessionDate, today\)/);
});
