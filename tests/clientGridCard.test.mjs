import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/components/TattoDiary.tsx', import.meta.url), 'utf8').replace(/\r\n?/g, '\n');
const cardSource = source.slice(source.indexOf('function ClientGridCard'), source.indexOf('function MasterDashboardScreen'));

test('client covers show only an upcoming session date', () => {
  assert.match(cardSource, /const plannedSession = nextPlannedSession\(client\)/);
  assert.match(cardSource, /Следующая сессия/);
  assert.doesNotMatch(cardSource, /Последняя сессия/);
  assert.doesNotMatch(cardSource, /lastSession\(client\)/);
});
