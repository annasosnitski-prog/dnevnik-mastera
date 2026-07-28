import type { ReactNode } from 'react';

export type ActionIconKey =
  | 'edit'
  | 'save'
  | 'cancel'
  | 'refresh'
  | 'copy'
  | 'translate'
  | 'share'
  | 'approve'
  | 'exemplar'
  | 'link'
  | 'delete';

// Простые inline SVG для стандартных действий карточки — без icon library,
// без emoji. Иконка всегда используется вместе с текстовым label/aria-label
// (ActionButton ниже), сама по себе она aria-hidden.
function ActionIcon({ icon, size = 16 }: { icon: ActionIconKey; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 20 20',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  switch (icon) {
    case 'edit':
      return (
        <svg {...common}>
          <path d="M12.8 3.6 16.4 7.2 6.6 17 3 17.4l.4-3.6 9.4-10.2Z" />
        </svg>
      );
    case 'save':
      return (
        <svg {...common}>
          <path d="M4 10.5 8 14.5 16 5.5" />
        </svg>
      );
    case 'cancel':
      return (
        <svg {...common}>
          <path d="M5 5l10 10M15 5 5 15" />
        </svg>
      );
    case 'refresh':
      return (
        <svg {...common}>
          <path d="M4 10a6 6 0 0 1 10.2-4.3M16 10a6 6 0 0 1-10.2 4.3" />
          <path d="M14.3 3.5v3h-3M5.7 16.5v-3h3" />
        </svg>
      );
    case 'copy':
      return (
        <svg {...common}>
          <rect x="7" y="7" width="9" height="10" rx="1" />
          <path d="M4 13V4a1 1 0 0 1 1-1h8" />
        </svg>
      );
    case 'translate':
      return (
        <svg {...common}>
          <path d="M3 5h7M6.5 5v-1.5M6.5 5c-.3 3-1.7 5.3-3.5 6.7M4.2 8.4c1 1.2 2.6 2.1 4.3 2.6" />
          <path d="m11.5 17 3.2-8 3.3 8M12.4 14.6h4.6" />
        </svg>
      );
    case 'share':
      return (
        <svg {...common}>
          <path d="M8 12 16 4M16 4h-4.5M16 4v4.5" />
          <path d="M14 10.5V16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h5.5" />
        </svg>
      );
    case 'approve':
      return (
        <svg {...common}>
          <circle cx="10" cy="10" r="7.2" />
          <path d="m6.7 10.2 2.3 2.3 4.3-4.8" />
        </svg>
      );
    case 'exemplar':
      return (
        <svg {...common}>
          <path d="m10 3 1.9 4.1 4.5.5-3.4 3 1 4.4-4-2.3-4 2.3 1-4.4-3.4-3 4.5-.5L10 3Z" />
        </svg>
      );
    case 'link':
      return (
        <svg {...common}>
          <path d="M8.5 11.5 11.5 8.5" />
          <path d="M9 5.5 10.4 4a2.8 2.8 0 0 1 4 4L13 9.4" />
          <path d="M11 14.5 9.6 16a2.8 2.8 0 0 1-4-4L7 10.6" />
        </svg>
      );
    case 'delete':
      return (
        <svg {...common}>
          <path d="M4.5 6h11M8 6V4.3a.8.8 0 0 1 .8-.8h2.4a.8.8 0 0 1 .8.8V6" />
          <path d="M5.5 6 6.2 16a1 1 0 0 0 1 .9h5.6a1 1 0 0 0 1-.9L14.5 6" />
        </svg>
      );
    default:
      return null;
  }
}

// Кнопка стандартного действия карточки: иконка + короткая подпись, всегда
// с aria-label — критичные действия не остаются голым символом.
export function ActionButton({
  icon,
  label,
  ariaLabel,
  onClick,
  disabled,
  variant = 'default',
  iconSize,
  type = 'button',
}: {
  icon: ActionIconKey;
  label: ReactNode;
  ariaLabel?: string;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'default' | 'primary' | 'danger';
  iconSize?: number;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      className={`content-action-button content-action-button--${variant}`}
      aria-label={typeof ariaLabel === 'string' ? ariaLabel : typeof label === 'string' ? label : icon}
      disabled={disabled}
      onClick={onClick}
    >
      <ActionIcon icon={icon} size={iconSize} />
      <span>{label}</span>
    </button>
  );
}

// Нижняя панель действий карточки материала: основные действия + отдельно
// отделённое «Удалить», чтобы снизить риск случайного нажатия.
export function ContentEntryActions({ primary, danger }: { primary: ReactNode; danger?: ReactNode }) {
  return (
    <div className="content-card-actions">
      <div className="content-card-actions__primary">{primary}</div>
      {danger && <div className="content-card-actions__danger">{danger}</div>}
    </div>
  );
}
