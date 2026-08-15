import assert from 'node:assert/strict';
import test from 'node:test';

import { MODULE_REGISTRY, defaultModuleFlags } from '../.test-dist/src/modules/registry.js';

test('реестр содержит все пять модулей ровно по одному разу', () => {
  const keys = MODULE_REGISTRY.map((m) => m.key);
  assert.deepEqual(new Set(keys).size, keys.length);
  assert.deepEqual(keys.sort(), ['adminka', 'bot', 'content', 'planner', 'workshop']);
});

test('все модули активны по умолчанию, кроме заглушки БотИНКА', () => {
  const flags = defaultModuleFlags();
  assert.equal(flags.adminka, true);
  assert.equal(flags.planner, true);
  assert.equal(flags.content, true);
  assert.equal(flags.workshop, true);
  assert.equal(flags.bot, false);
});

test('defaultModuleFlags отражает defaultActive каждой записи реестра', () => {
  const flags = defaultModuleFlags();
  for (const m of MODULE_REGISTRY) {
    assert.equal(flags[m.key], m.defaultActive);
  }
});
