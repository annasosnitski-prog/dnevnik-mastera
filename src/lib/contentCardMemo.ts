export function createContentEntryCardRevision(
  entryId: string,
  parts: readonly unknown[],
  refreshFeedbackByEntry: Readonly<Record<string, unknown>>,
): string {
  return JSON.stringify([...parts, refreshFeedbackByEntry[entryId]]);
}
