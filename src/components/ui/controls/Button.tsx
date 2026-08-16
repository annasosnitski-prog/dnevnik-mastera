import type { ReactNode } from 'react';
import './controls.css';

export interface ButtonProps {
  children: ReactNode;
  variant?: 'default' | 'primary' | 'danger';
  size?: 'sm' | 'md';
  icon?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
  ariaLabel?: string;
}

// Настоящий <button> для одного и того же действия — вместо разного
// набора <button>/<div onClick>/<span onClick> на каждом экране (см. Этап 1
// аудит: 195 div-onClick + 35 span-onClick при 48 реальных <button>).
export function Button({ children, variant = 'default', size = 'md', icon, onClick, disabled, type = 'button', ariaLabel }: ButtonProps) {
  return (
    <button
      type={type}
      className={`ctl-button ctl-button--${variant} ctl-button--${size}`}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
      {children}
    </button>
  );
}
