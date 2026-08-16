import { useEffect, type ReactNode } from 'react';
import './controls.css';

export interface BackdropProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

// Один клик-вне-закрывает-оверлей вместо независимых копий (scrim у
// NavFab, попап у заметки, попап поиска/фильтров/сортировки — у каждого
// свой рукописный z-index). Использует общую шкалу --z-overlay-*.
//
// Намеренно НЕ порталируется: как и все семь существующих scrim/попап
// реализаций в проекте (NavFab, список фильтров, это меню), контент
// обычно позиционируется `absolute` относительно своего триггера —
// портал в document.body сломал бы это якорение. Портал нужен только
// «настоящим» модалкам (см. BottomSheet в ui/Sheet.tsx), это другой,
// уже хорошо решённый случай.
export function Backdrop({ open, onClose, children }: BackdropProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="ctl-backdrop" onClick={onClose} aria-hidden="true" />
      {children}
    </>
  );
}
