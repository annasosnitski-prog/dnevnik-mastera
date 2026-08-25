import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// ProjectCard (project/ProjectCard.tsx) has no DOM-render test harness in
// this project (see clientGridCard.test.mjs / contentProject.test.mjs for
// the same pattern) — so, like those, this asserts against the compiled
// source rather than rendering the component.
const source = readFileSync(new URL('../src/components/project/ProjectCard.tsx', import.meta.url), 'utf8');

test('cover shows next step instead of status only when the project is «Активен»', () => {
  assert.match(source, /project\.status\s*===\s*'active'\s*&&\s*project\.nextActionText/, 'должно проверять и статус, и наличие next step');
});

test('the status badge is still rendered as a fallback (active-without-next-step, or any other status)', () => {
  assert.match(source, /PROJECT_STATUSES\.find\(\(s\)\s*=>\s*s\.key\s*===\s*project\.status\)/);
});
