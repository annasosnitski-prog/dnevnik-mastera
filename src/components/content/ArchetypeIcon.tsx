export type ArchetypeIconKey =
  | 'trickster'
  | 'warmth'
  | 'explorer'
  | 'sage'
  | 'fool'
  | 'lover'
  | 'creator';

// Соответствие label из ARCHETYPE_CHIPS (TattoDiary.tsx) → ключ иконки.
// Один mapper на оба toolbar (composer и regeneration), backend-архетипы
// (сами label) не переименовываются — меняется только выбор картинки.
export function archetypeIconKey(label: string): ArchetypeIconKey {
  if (label === 'Трикстер') return 'trickster';
  if (label === 'Женщина/Тепло') return 'warmth';
  if (label === 'Исследователь') return 'explorer';
  if (label === 'Мудрец') return 'sage';
  if (label === 'Дурак') return 'fool';
  if (label === 'Lover') return 'lover';
  return 'creator';
}

export function ArchetypeIcon({
  archetype,
  size = 22,
}: {
  archetype: ArchetypeIconKey;
  size?: number;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  if (archetype === 'trickster') {
    return (
      <svg {...common}>
        <path d="M5 5.5c2.2-1.4 4.5-2.1 7-2.1s4.8.7 7 2.1v5.7c0 4.5-2.7 7.5-7 9.3-4.3-1.8-7-4.8-7-9.3V5.5Z" />
        <path d="M12 3.6v16.5" />
        <path d="M7.7 9.2c.9-.8 1.8-1.1 2.8-.8" />
        <path d="M13.5 8.4c1-.3 1.9 0 2.8.8" />
        <path d="M8.2 14.8c1.1.9 2.3 1.3 3.8 1.3" />
        <path d="M12 16.1c1.5 0 2.7-.4 3.8-1.3" />
      </svg>
    );
  }
  if (archetype === 'warmth') {
    return (
      <svg {...common}>
        <path d="M12 21s-7-4.3-7-10.2A4.3 4.3 0 0 1 12 7.5a4.3 4.3 0 0 1 7 3.3C19 16.7 12 21 12 21Z" />
        <path d="M12 7.5c-1.1-1.3-1.4-2.8-.7-4.5 2.4 1.2 3.3 3 2.7 5.2" />
      </svg>
    );
  }
  if (archetype === 'explorer') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8.5" />
        <path d="m15.7 8.3-2.1 5.3-5.3 2.1 2.1-5.3 5.3-2.1Z" />
        <path d="M12 2.5v2" />
        <path d="M12 19.5v2" />
        <path d="M2.5 12h2" />
        <path d="M19.5 12h2" />
      </svg>
    );
  }
  if (archetype === 'sage') {
    return (
      <svg {...common}>
        <path d="M3.5 12s3.2-5 8.5-5 8.5 5 8.5 5-3.2 5-8.5 5-8.5-5-8.5-5Z" />
        <circle cx="12" cy="12" r="2.4" />
        <path d="M12 3.2v1.6" />
        <path d="M5.6 5.5 6.8 6.7" />
        <path d="m18.4 5.5-1.2 1.2" />
      </svg>
    );
  }
  if (archetype === 'fool') {
    return (
      <svg {...common}>
        <path d="M5.2 10.2 7.5 4l4.5 4 4.5-4 2.3 6.2" />
        <path d="M5.2 10.2c.5 5.9 2.8 9 6.8 9s6.3-3.1 6.8-9H5.2Z" />
        <circle cx="7.5" cy="4" r="1.2" />
        <circle cx="16.5" cy="4" r="1.2" />
        <path d="M9 13.6c.8.8 1.8 1.2 3 1.2s2.2-.4 3-1.2" />
      </svg>
    );
  }
  if (archetype === 'lover') {
    return (
      <svg {...common}>
        <path d="M12 20.5 5.4 14A4.7 4.7 0 0 1 12 7.3 4.7 4.7 0 0 1 18.6 14L12 20.5Z" />
        <path d="M9.4 9.4c1.2.2 2.1.9 2.6 2 .5-1.1 1.4-1.8 2.6-2" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="m12 3 2.1 4.9L19 10l-4.9 2.1L12 17l-2.1-4.9L5 10l4.9-2.1L12 3Z" />
      <path d="M6.5 16.5 4 20l3.5-2.5" />
      <path d="M17.5 16.5 20 20l-3.5-2.5" />
      <circle cx="12" cy="10" r="1.5" />
    </svg>
  );
}
