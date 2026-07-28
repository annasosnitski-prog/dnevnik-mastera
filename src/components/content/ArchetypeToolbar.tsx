import { ArchetypeIcon, archetypeIconKey } from './ArchetypeIcon';

export interface ArchetypeChip {
  label: string;
  instruction: string;
}

export interface ArchetypeToolbarProps {
  chips: ArchetypeChip[];
  value: string | null;
  disabled?: boolean;
  ariaLabel: string;
  onSelect: (label: string) => void;
  // Повторный тап по выбранному архетипу снимает выбор — только когда true
  // (composer). В режиме перегенерации карточки выбор не снимается тапом.
  allowClear?: boolean;
}

// Переиспользуемый toolbar из семи архетипов — не знает про sendToContent
// или regenerate, только вызывает onSelect. Composer (выбор основного
// архетипа новой генерации) и карточка (перегенерация конкретной записи)
// используют один и тот же компонент с разными value/onSelect/allowClear.
export function ArchetypeToolbar({ chips, value, disabled, ariaLabel, onSelect, allowClear }: ArchetypeToolbarProps) {
  return (
    <div className="archetype-toolbar" role="group" aria-label={ariaLabel}>
      {chips.map((chip) => {
        const isSelected = value === chip.label;
        return (
          <button
            key={chip.label}
            type="button"
            className={`archetype-toolbar__button${isSelected ? ' is-selected' : ''}`}
            aria-pressed={isSelected}
            aria-label={chip.label}
            title={chip.label}
            disabled={disabled}
            onClick={() => onSelect(allowClear && isSelected ? '' : chip.label)}
          >
            <ArchetypeIcon archetype={archetypeIconKey(chip.label)} size={20} />
          </button>
        );
      })}
    </div>
  );
}
