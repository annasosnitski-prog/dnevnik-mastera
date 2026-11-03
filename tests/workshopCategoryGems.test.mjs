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

test('WorkshopScreen renders the always-visible category gem row via ClientCardTabBar', () => {
  assert.match(workshopScreen, /import \{ ClientCardTabBar, type ClientCardTabDef \} from '\.\.\/client\/ClientCardTabBar';/);
  assert.match(workshopScreen, /<ClientCardTabBar/);
  assert.match(workshopScreen, /tabs=\{CATEGORY_TABS\}/);
});

test('the funnel panel no longer duplicates the category chips (moved to the gem row)', () => {
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
