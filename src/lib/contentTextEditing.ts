export const MAX_CONTENT_TEXT_CHARACTERS = 650;

export function contentTextLength(text: string): number {
  return Array.from(text).length;
}

export function isContentTextDirty(savedText: string, editorText: string): boolean {
  return savedText !== editorText;
}

export type ContentTextEditOutcome<T> =
  | { status: 'saved'; entry: T }
  | { status: 'unchanged'; entry: T }
  | { status: 'empty' }
  | { status: 'too_long' }
  | { status: 'locked' }
  | { status: 'conflict' };

export function saveContentTextEdit<T extends {
  status: 'draft' | 'confirmed';
  textDraft: string;
}>(
  entry: T,
  params: {
    baseText: string;
    editedText: string;
  },
): ContentTextEditOutcome<T> {
  if (entry.status !== 'draft') return { status: 'locked' };
  if (entry.textDraft !== params.baseText) return { status: 'conflict' };

  const textDraft = params.editedText.trim();
  if (!textDraft) return { status: 'empty' };
  if (contentTextLength(textDraft) > MAX_CONTENT_TEXT_CHARACTERS) return { status: 'too_long' };
  if (textDraft === entry.textDraft) return { status: 'unchanged', entry };

  return {
    status: 'saved',
    entry: { ...entry, textDraft },
  };
}
