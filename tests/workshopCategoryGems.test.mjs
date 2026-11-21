import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// «Мастерская»: категория проекта теперь фильтруется через всегда видимую
// подвеску-гемму (ClientCardTabBar), а не только через скрытую панель за
// иконкой воронки — см. скриншот Анны (4 камня над «ПРОЕКТЫ», цвет = тема
// категории).
const workshopScreen = readFileSync(
  new URL('../src/components/screens/WorkshopScreen.tsx', import.meta.url),
  'utf8',
);
const project = readFileSync(new URL('../src/domain/project.ts', import.meta.url), 'utf8');

// Анна, 2026-11-21: геммы категорий над папками убраны, экран открывается
// ровно двумя папками — «Личные проекты» и «Клиенты».
test('WorkshopScreen shows two owner folders and no category gem row', () => {
  assert.doesNotMatch(workshopScreen, /ClientCardTabBar/);
  assert.doesNotMatch(workshopScreen, /CATEGORY_TABS/);
  assert.match(workshopScreen, /buildProjectOwnerFolders\(/);
});

test('the funnel panel does not bring the category chips back', () => {
  assert.doesNotMatch(workshopScreen, /ProjectCategoryChips/);
  assert.doesNotMatch(workshopScreen, /\{\(\['all', \.\.\.PROJECT_CATEGORIES/);
});

test('each project category has its own jewel-tone colour, reused from the stone palette', () => {
  assert.match(project, /export const PROJECT_CATEGORY_COLORS: Record<ProjectCategory, string> = \{/);
  assert.match(project, /tattoo: '#006B3C'/);
  assert.match(project, /drawing: '#B94E7E'/);
  assert.match(project, /collab: '#D56800'/);
  assert.match(project, /other: '#9F5A0A'/);
});
