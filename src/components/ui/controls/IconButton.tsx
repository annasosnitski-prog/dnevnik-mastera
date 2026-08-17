import type { ReactNode } from 'react';
import './controls.css';

export interface IconButtonProps {
  icon: ReactNode;
  ariaLabel: string;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
}

// Иконка без подписи — ariaLabel обязателен, у неё нет другого доступного
// имени. Заменяет div/span role="button" вроде меню «⋮» и крестика/
// карандаша в шапке листа (см. SheetCloseButton/SheetEditButton).
export function IconButton({ icon, ariaLabel, onClick, disabled, type = 'button' }: IconButtonProps) {
  return (
    <button type={type} className="ctl-icon-button" aria-label={ariaLabel} disabled={disabled} onClick={onClick}>
      {icon}
    </button>
  );
}
