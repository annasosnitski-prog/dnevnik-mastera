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

import { crossScriptSameWord } from '../.test-dist/src/lib/nameSearch.js';
import { findClients } from '../.test-dist/src/voice/context.js';

test('голос: русское произношение находит латинские и ивритские имена', () => {
  assert.equal(crossScriptSameWord('химера', 'chimera'), true);
  assert.equal(crossScriptSameWord('нога', 'noga'), true);
  assert.equal(crossScriptSameWord('ноги', 'noga'), true);
  assert.equal(crossScriptSameWord('нога', 'נגה'), true);
  assert.equal(crossScriptSameWord('нога', 'maya'), false);
  assert.equal(crossScriptSameWord('ольга', 'альга'), false); // один алфавит — прежние правила
  const ctx = { today: '2026-11-21', projects: [], clients: [
    { id: 'a', name: 'Chimera', surname: '' },
    { id: 'b', name: 'Noga', surname: 'Levi' },
    { id: 'c', name: 'Ольга', surname: '' },
  ] };
  assert.deepEqual(findClients('сессия для Химеры', ctx).map((c) => c.id), ['a']);
  assert.deepEqual(findClients('консультация у Ноги', ctx).map((c) => c.id), ['b']);
});
