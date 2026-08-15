// Модальная обёртка вокруг NoteComposer (client/ClientControls.tsx) — сам
// композер раньше был доступен только заинлайненным внутри вкладки «Заметки»
// клиента и внутри экрана «Сводка»; эта шторка даёт то же самое как обычный
// bottom sheet, чтобы «Заметка» могла быть опцией единой CreateChoiceSheet
// отовсюду (карточка клиента/мастера, «Мастерская», открытый проект), не
// только с экрана «Сводка».
import { type Client } from '../../domain/client';
import { type Project } from '../../domain/project';
import { type UrgencyKey } from '../../domain/urgency';
import { NoteComposer } from '../client/ClientControls';
import { BottomSheet, SheetCloseButton } from '../ui/Sheet';
import { SheetStarDivider } from '../ui/TextAtoms';
import { COLORS, fs } from '../TattoDiary';

export function NoteComposerSheet({
  open,
  onClose,
  clients,
  projects,
  presetClientId = null,
  presetProjectId = null,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  clients?: Client[];
  projects?: Project[];
  presetClientId?: string | null;
  presetProjectId?: string | null;
  onAdd: (text: string, urgency: UrgencyKey, photos: string[], dueDate: string | null, clientId: string | null, projectId: string | null) => void;
}) {
  return (
    <BottomSheet open={open} heightPct={58}>
      <div style={{ padding: '16px 24px 14px', position: 'relative' }}>
        <SheetCloseButton onClose={onClose} />
        <div style={{ fontSize: fs(22), color: COLORS.textPrimary, fontWeight: 300, letterSpacing: '1px' }}>Новая заметка</div>
        <SheetStarDivider />
      </div>
      <div style={{ padding: '4px 24px 40px' }}>
        <NoteComposer
          clients={clients}
          projects={projects}
          presetClientId={presetClientId}
          presetProjectId={presetProjectId}
          onAdd={(text, urgency, photos, dueDate, clientId, projectId) => {
            onAdd(text, urgency, photos, dueDate, clientId, projectId);
            onClose();
          }}
        />
      </div>
    </BottomSheet>
  );
}
