import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Проводка вкладки «Проекты» карточки клиента — по исходнику, тем же
// приёмом, что clientTabGems.test.mjs и contentLinkPickerSheet.test.mjs
// (компонент не отрендерить в node --test, но видно, что данные и состояние
// действительно доходят туда, куда должны). Сама сортировка/фильтрация —
// чистые функции, они покрыты в projectSelectors.test.mjs.

function readSource(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n?/g, '\n');
}

const detailScreen = readSource('../src/components/screens/DetailScreen.tsx');
const app = readSource('../src/components/TattoDiary.tsx');

const projectsTab = detailScreen.slice(
  detailScreen.indexOf('function ProjectsTab('),
  detailScreen.indexOf('// ── Info tab ──'),
);

test('карточка клиента открывается на «Проектах», а не на убранной вкладке сессий', () => {
  assert.match(app, /useState<ClientCardTab>\('projects'\)/);
  // Ни один переход внутрь карточки не ведёт на удалённые вкладки.
  assert.doesNotMatch(app, /setActiveTab\('sessions'\)|setActiveTab\('consultations'\)/);
});

test('первым идёт последний активный проект — сортировка по умолчанию', () => {
  assert.match(projectsTab, /useState<ProjectSortMode>\('lastActive'\)/);
  assert.match(
    projectsTab,
    /sortProjects\(filterProjects\(clientProjects, filters\), sortMode, \{\s*sessions: client\.sessions,\s*consultations: client\.consultations,\s*today: todayISO\(\),\s*\}\)/,
  );
});

test('«Последний активный» есть в списке режимов сортировки', () => {
  const selectors = readSource('../src/domain/projectSelectors.ts');
  assert.match(selectors, /\{ key: 'lastActive', label: 'Последний активный' \}/);
});

test('фильтры — воронка с теми же группами «Тип» и «Статус», что заведены в модели проекта', () => {
  assert.match(projectsTab, /useState<ProjectFilters>\(EMPTY_PROJECT_FILTERS\)/);
  assert.match(projectsTab, /aria-label=\{filtersOpen \? 'Скрыть фильтры' : 'Фильтры'\}/);
  assert.match(projectsTab, /aria-label=\{sortOpen \? 'Скрыть сортировку' : 'Сортировка'\}/);
  assert.match(projectsTab, /PROJECT_CATEGORIES\.map\(\(c\) => c\.key\)/);
  assert.match(projectsTab, /PROJECT_STATES\.map\(\(s\) => s\.key\)/);
  // «Все» — это отсутствие фильтра (null), а не отдельное значение.
  assert.match(projectsTab, /setFilters\(\(f\) => \(\{ \.\.\.f, category: v \}\)\)/);
  assert.match(projectsTab, /setFilters\(\(f\) => \(\{ \.\.\.f, state: v \}\)\)/);
});

test('«ничего не нашлось» отличается от «проектов ещё нет»', () => {
  assert.match(projectsTab, /Пока нет проектов — нажмите «\+ Новый», чтобы добавить первый/);
  assert.match(projectsTab, /Под фильтр не подошёл ни один проект/);
});

// ── Страховка: убранные вкладки не должны прятать старые записи ──

test('записи без проекта считаются по реальным проектам клиента, а не по одному лишь projectId', () => {
  assert.match(detailScreen, /const isOrphan = \(projectId: string \| null\) => !projectId \|\| !clientProjectIds\.has\(projectId\);/);
  assert.match(detailScreen, /const orphanSessions = client\.sessions\.filter\(\(s\) => isOrphan\(s\.projectId\)\);/);
  assert.match(detailScreen, /const orphanConsultations = client\.consultations\.filter\(\(c\) => isOrphan\(c\.projectId\)\);/);
});

test('они видны отдельным блоком и открываются тем же списком, что был на убранных вкладках', () => {
  assert.match(projectsTab, /Записи без проекта/);
  assert.match(projectsTab, /onOpenOrphans\('sessions'\)/);
  assert.match(projectsTab, /onOpenOrphans\('consultations'\)/);
  assert.match(
    detailScreen,
    /<SessionsTab\s+kind=\{orphanView\}\s+client=\{\{ \.\.\.client, sessions: orphanSessions, consultations: orphanConsultations \}\}/,
  );
});

test('блок «Записи без проекта» не показывается, когда таких записей нет', () => {
  assert.match(projectsTab, /\{\(orphanSessionCount > 0 \|\| orphanConsultationCount > 0\) && \(/);
});
