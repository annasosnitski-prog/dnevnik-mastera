import { useState } from 'react';
import type { Client } from '../../domain/client';
import type { Project } from '../../domain/project';
import type { HealingCycleItem } from '../../reminders/healingCycle';
import { formatDate, todayISO } from '../../utils/dates';
import { TERRITORY_COLORS } from '../ui/designTokens';
import { TileStack, type StackTileData } from '../ui/TileStack';
import { buildAutoHealingActions, buildManualClientActions, type ClientActionTile } from './clientActions';

type StackId = 'manual' | 'auto';

function toStackTiles(items: ClientActionTile[]): StackTileData[] {
  return items.map((it) => ({
    key: it.key,
    title: it.title,
    subtitle: it.subtitle,
    note: it.date ? formatDate(it.date) : undefined,
    urgent: it.overdue,
  }));
}

// Вкладка «Клиенты» (фиолетовая): клиентские дела со всех проектов двумя
// стопками рядом — ручные шаги мастера и автоматические проверки заживления.
// Тап по стопке раскрывает её плитками по одному на дело/проект. Позже
// автоматическую стопку будет закрывать бот (сам напишет клиенту) — здесь
// только показ, действия по-прежнему в «Напоминаниях» и в карточке проекта.
export function ClientActionsTab({
  projects,
  clients,
  healing,
  onOpenProject,
}: {
  projects: Project[];
  clients: Client[];
  healing: HealingCycleItem[];
  onOpenProject: (project: Project) => void;
}) {
  const [open, setOpen] = useState<StackId | null>(null);
  const manual = buildManualClientActions(projects, clients, todayISO());
  const auto = buildAutoHealingActions(healing);
  const byKey = new Map<string, ClientActionTile>([...manual, ...auto].map((it) => [it.key, it] as const));
  const accent = TERRITORY_COLORS.admin;

  const toggle = (id: StackId) => setOpen((cur) => (cur === id ? null : id));
  const openTile = (key: string) => {
    const it = byKey.get(key);
    if (it) onOpenProject(it.project);
  };
  // Раскрытая стопка занимает всю ширину и идёт первой, вторая остаётся
  // свёрнутой под ней.
  const cell = (id: StackId): React.CSSProperties => (open === id ? { gridColumn: '1 / -1', order: -1 } : {});

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 84px)' }}>
      <div style={cell('manual')}>
        <TileStack
          title="Мои шаги"
          hint="связаться, проверить, свои напоминания"
          accent={accent}
          tiles={toStackTiles(manual)}
          open={open === 'manual'}
          onToggle={() => toggle('manual')}
          onOpenTile={openTile}
        />
      </div>
      <div style={cell('auto')}>
        <TileStack
          title="Авто · заживление"
          hint="проверки заживления по проектам"
          accent={accent}
          tiles={toStackTiles(auto)}
          open={open === 'auto'}
          onToggle={() => toggle('auto')}
          onOpenTile={openTile}
        />
      </div>
    </div>
  );
}
