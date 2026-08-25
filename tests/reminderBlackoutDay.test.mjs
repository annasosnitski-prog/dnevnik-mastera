import assert from 'node:assert/strict';
import test from 'node:test';

import { isReminderBlackoutDay } from '../.test-dist/src/utils/dates.js';

// Общее правило для всех напоминаний приложения: мастер не хочет писать
// клиентам по субботам. Сейчас применяется только в healingCycleReminders
// (см. tests/healingCycle.test.mjs) — reminders/buildReminders.ts сломан и
// ждёт отдельной переделки, где это правило тоже должно заработать (см.
// TODO у isReminderBlackoutDay в utils/dates.ts). Этот тест покрывает саму
// функцию, независимо от того, кто её вызывает.

test('isReminderBlackoutDay is true only on Saturday', () => {
  // 2026-06-01 — понедельник; вся неделя по порядку.
  const week = ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05', '2026-06-06', '2026-06-07'];
  const results = week.map((d) => isReminderBlackoutDay(new Date(`${d}T12:00:00`)));
  assert.deepEqual(results, [false, false, false, false, false, true, false]);
});
