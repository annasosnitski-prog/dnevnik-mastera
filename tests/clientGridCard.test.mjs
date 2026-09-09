import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/components/TattoDiary.tsx', import.meta.url), 'utf8').replace(/\r\n?/g, '\n');
const cardSource = source.slice(source.indexOf('function ClientGridCard'), source.indexOf('export function useSwipeToReveal'));

test('client covers show only the name, note and style — no session date or type badge', () => {
  assert.doesNotMatch(cardSource, /nextPlannedSession\(client\)/);
  assert.doesNotMatch(cardSource, /Следующая сессия/);
  assert.doesNotMatch(cardSource, /Последняя сессия/);
  assert.doesNotMatch(cardSource, /lastSession\(client\)/);
  assert.doesNotMatch(cardSource, /client\.clientType/);
  assert.match(cardSource, /client\.note/);
  assert.match(cardSource, /client\.style/);
});
