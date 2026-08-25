// Pure list operations for RemindersSection's temporary undo banners
// («Напоминание скрыто · Вернуть» — see RemindersSection.tsx). Deliberately
// NOT a persisted entity (see reminderState.ts for what actually survives
// reload) — this is just the list-management logic pulled out of the
// component so it's testable without a DOM/React renderer, matching every
// other reminders/* module in this repo.
//
// Each banner is fully independent: hiding two different reminders in quick
// succession must produce two separate banners, each restorable (or
// timing out) on its own without touching the other — id is the only
// handle either operation needs.
export interface HiddenReminderBanner {
  id: string;
  // The reminder key(s) this banner's «Вернуть» restores — one for a plain
  // «Скрыть это напоминание», обе стадии текущей итерации цикла заживления
  // для «Не напоминать больше» (see healingCycleReminderKeysForIteration in
  // reminderKeys.ts).
  keys: string[];
  createdAt: number;
}

export function addHiddenBanner(
  banners: HiddenReminderBanner[],
  id: string,
  keys: string[],
  createdAt: number,
): HiddenReminderBanner[] {
  return [...banners, { id, keys, createdAt }];
}

export function removeHiddenBanner(banners: HiddenReminderBanner[], id: string): HiddenReminderBanner[] {
  return banners.filter((banner) => banner.id !== id);
}
