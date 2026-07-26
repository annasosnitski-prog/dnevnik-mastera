export const COPY_FEEDBACK_RESET_MS = 1800;

export type CopyFeedback = 'success' | 'error';

export interface ClipboardEnvironment {
  clipboard?: {
    writeText(text: string): Promise<void>;
  };
  document?: Document;
}

function getBrowserClipboardEnvironment(): ClipboardEnvironment {
  let clipboard: ClipboardEnvironment['clipboard'];
  if (typeof navigator !== 'undefined') {
    try {
      clipboard = navigator.clipboard;
    } catch {
      clipboard = undefined;
    }
  }
  return {
    clipboard,
    document: typeof document === 'undefined' ? undefined : document,
  };
}

function copyWithTextarea(text: string, doc: Document): boolean {
  if (!doc.body || typeof doc.execCommand !== 'function') return false;

  const activeElement =
    doc.activeElement && 'focus' in doc.activeElement && typeof doc.activeElement.focus === 'function'
      ? (doc.activeElement as HTMLElement)
      : null;
  let selection: Selection | null = null;
  try {
    selection = doc.getSelection?.() ?? null;
  } catch {
    selection = null;
  }
  const savedRanges: Range[] = [];
  if (selection) {
    for (let index = 0; index < selection.rangeCount; index += 1) {
      savedRanges.push(selection.getRangeAt(index).cloneRange());
    }
  }

  const textarea = doc.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.setAttribute('aria-hidden', 'true');
  textarea.tabIndex = -1;
  textarea.style.position = 'fixed';
  textarea.style.top = '-9999px';
  textarea.style.left = '-9999px';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';

  doc.body.appendChild(textarea);
  try {
    try {
      textarea.focus({ preventScroll: true });
    } catch {
      try {
        textarea.focus();
      } catch {
        // Selection below may still work even when focus is restricted.
      }
    }
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    return doc.execCommand('copy');
  } finally {
    textarea.remove();
    if (activeElement) {
      try {
        activeElement.focus({ preventScroll: true });
      } catch {
        try {
          activeElement.focus();
        } catch {
          // Best-effort restoration for browsers that reject programmatic focus.
        }
      }
    }
    if (selection) {
      try {
        selection.removeAllRanges();
        for (const range of savedRanges) selection.addRange(range);
      } catch {
        // The original selection may point to content removed while copying.
      }
    }
  }
}

export async function copyTextToClipboard(
  rawText: string,
  environment: ClipboardEnvironment = getBrowserClipboardEnvironment(),
): Promise<boolean> {
  const text = rawText.trim();
  if (!text) return false;

  if (environment.clipboard?.writeText) {
    try {
      await environment.clipboard.writeText(text);
      return true;
    } catch {
      // PWA and non-secure contexts may expose Clipboard API but reject writes.
    }
  }

  if (environment.document && copyWithTextarea(text, environment.document)) return true;
  throw new Error('Clipboard copy failed');
}

export function createCopyFeedbackController(options: {
  onChange: (feedbackByEntry: Record<string, CopyFeedback>) => void;
  resetAfterMs?: number;
  setTimer?: typeof setTimeout;
  clearTimer?: typeof clearTimeout;
}) {
  const resetAfterMs = options.resetAfterMs ?? COPY_FEEDBACK_RESET_MS;
  const setTimer = options.setTimer ?? setTimeout;
  const clearTimer = options.clearTimer ?? clearTimeout;
  const feedbackByEntry = new Map<string, CopyFeedback>();
  const timersByEntry = new Map<string, ReturnType<typeof setTimeout>>();
  const attemptsByEntry = new Map<string, number>();

  const emit = () => options.onChange(Object.fromEntries(feedbackByEntry));
  const clearTimerForEntry = (entryId: string) => {
    const timer = timersByEntry.get(entryId);
    if (timer !== undefined) clearTimer(timer);
    timersByEntry.delete(entryId);
  };

  return {
    begin(entryId: string): number {
      clearTimerForEntry(entryId);
      const attempt = (attemptsByEntry.get(entryId) ?? 0) + 1;
      attemptsByEntry.set(entryId, attempt);
      if (feedbackByEntry.delete(entryId)) emit();
      return attempt;
    },

    finish(entryId: string, attempt: number, feedback: CopyFeedback): void {
      if (attemptsByEntry.get(entryId) !== attempt) return;
      clearTimerForEntry(entryId);
      feedbackByEntry.set(entryId, feedback);
      emit();
      const timer = setTimer(() => {
        if (attemptsByEntry.get(entryId) !== attempt) return;
        feedbackByEntry.delete(entryId);
        timersByEntry.delete(entryId);
        attemptsByEntry.delete(entryId);
        emit();
      }, resetAfterMs);
      timersByEntry.set(entryId, timer);
    },

    clear(entryId: string): void {
      clearTimerForEntry(entryId);
      attemptsByEntry.delete(entryId);
      if (feedbackByEntry.delete(entryId)) emit();
    },

    dispose(): void {
      for (const timer of timersByEntry.values()) clearTimer(timer);
      timersByEntry.clear();
      feedbackByEntry.clear();
      attemptsByEntry.clear();
    },
  };
}
