import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './controls.css';

export interface BackdropProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  ariaLabel?: string;
}

// Один портал+оверлей+клик-вне-закрывает вместо независимых копий (scrim
// у NavFab, попап у заметки, попап поиска/фильтров/сортировки — у каждого
// свой рукописный z-index). Использует общую шкалу --z-overlay-*.
export function Backdrop({ open, onClose, children, ariaLabel }: BackdropProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <>
      <div className="ctl-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="ctl-backdrop__content" role="dialog" aria-modal="true" aria-label={ariaLabel}>
        {children}
      </div>
    </>,
    document.body,
  );
}
