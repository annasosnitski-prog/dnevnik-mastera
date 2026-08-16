import { useState } from 'react';
import { Button } from './Button';
import './controls.css';

export interface DangerButtonProps {
  label: string;
  confirmLabel: string;
  onConfirm: () => void;
  size?: 'sm' | 'md';
}

// Сводит воедино независимо реализованные кнопки удаления (клиент, сессия,
// проект, заметка — у каждой был свой оттенок красного и свой markup).
// Один компонент, один токен --color-danger, один паттерн подтверждения.
export function DangerButton({ label, confirmLabel, onConfirm, size = 'md' }: DangerButtonProps) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div className="ctl-danger-confirm">
        <span>{confirmLabel}</span>
        <button type="button" data-action="yes" onClick={onConfirm}>
          Да
        </button>
        <button type="button" data-action="no" onClick={() => setConfirming(false)}>
          Нет
        </button>
      </div>
    );
  }

  return (
    <Button variant="danger" size={size} onClick={() => setConfirming(true)}>
      {label}
    </Button>
  );
}
