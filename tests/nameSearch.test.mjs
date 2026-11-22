import test from 'node:test';
import assert from 'node:assert/strict';
import { compareNames, nameMatches, nameKey } from '../.test-dist/src/lib/nameSearch.js';

test('кириллица и латиница сортируются вместе', () => {
  const sorted = ['Вера', 'Alex', 'Анна', 'Boris', 'Алина'].sort(compareNames);
  assert.deepEqual(sorted, ['Alex', 'Алина', 'Анна', 'Boris', 'Вера']);
});
test('поиск находит по обоим алфавитам', () => {
  assert.equal(nameMatches('Александра', 'alex'), true);
  assert.equal(nameMatches('Alexandra', 'алекс'), true);
  assert.equal(nameMatches('Мария', 'bob'), false);
  assert.equal(nameKey('Юля'), 'yulya');
});
