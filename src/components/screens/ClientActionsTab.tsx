import { useState } from 'react';
import type { Client } from '../../domain/client';
import type { Project } from '../../domain/project';
import type { HealingCycleItem } from '../../reminders/healingCycle';
import type { TaskReminderItem } from '../../reminders/types';
import { formatDate, todayISO } from '../../utils/dates';
import { TERRITORY_COLORS } from '../ui/designTokens';
import { TileStack, type StackTileData } from '../ui/TileStack';
import { buildAutoHealingActions, buildManualClientActions, type ClientActionTile } from './clientActions';

type StackId = 'manual' | 'auto' | 'tasks';

function toStackTiles(items: ClientActionTile[]): StackTileData[] {
  return items.map((it) => ({
    key: it.key,
    title: it.title,
    subtitle: it.subtitle,
    note: it.date ? formatDate(it.date) : undefined,
    urgent: it.overdue,
  }));
}

// Задачи (ClientNote.dueDate) — третьей стопкой: переехали сюда с убранной
// красной вкладки «Напоминания». Подпись — клиент или «Личная задача», как
// было в напоминаниях.
function toTaskTiles(tasks: TaskReminderItem[], clients: Client[]): StackTileData[] {
  const nameById = new Map(clients.map((c) => [c.id, c.name] as const));
  return tasks.map((it) => ({
    key: it.id,
    title: it.text,
    subtitle: it.scope === 'master' ? 'Личная задача' : nameById.get(it.clientId ?? '') || '—',
    note: formatDate(it.dueDate),
    urgent: it.rule === 'task_overdue',
  }));
}

// Вкладка «Клиенты» (фиолетовая): клиентские дела со всех проектов стопками
// — ручные шаги мастера, автоматические проверки заживления и задачи.
// Тап по стопке раскрывает её плитками по одному на дело/проект. Позже
// автоматическую стопку будет закрывать бот (сам напишет клиенту) — здесь
// только показ, действия по-прежнему в «Напоминаниях» и в карточке проекта.
export function ClientActionsTab({
  projects,
  clients,
  healing,
  tasks,
  onOpenProject,
  onOpenTask,
}: {
  projects: Project[];
  clients: Client[];
  healing: HealingCycleItem[];
  tasks: TaskReminderItem[];
  onOpenProject: (project: Project) => void;
  onOpenTask: (item: TaskReminderItem) => void;
}) {
  const [open, setOpen] = useState<StackId | null>(null);
  const manual = buildManualClientActions(projects, clients, todayISO());
  const auto = buildAutoHealingActions(healing);
  const byKey = new Map<string, ClientActionTile>([...manual, ...auto].map((it) => [it.key, it] as const));
  const accent = TERRITORY_COLORS.admin;

  const taskById = new Map(tasks.map((it) => [it.id, it] as const));

  const toggle = (id: StackId) => setOpen((cur) => (cur === id ? null : id));
  const openTile = (key: string) => {
    const it = byKey.get(key);
    if (it) onOpenProject(it.project);
  };
  const openTask = (key: string) => {
    const it = taskById.get(key);
    if (it) onOpenTask(it);
  };
  // Раскрытая стопка занимает всю ширину и идёт первой, остальные остаются
  // свёрнутыми под ней.
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
      <div style={cell('tasks')}>
        <TileStack
          title="Задачи"
          hint="задачи с датой — клиентские и личные"
          accent={accent}
          tiles={toTaskTiles(tasks, clients)}
          open={open === 'tasks'}
          onToggle={() => toggle('tasks')}
          onOpenTile={openTask}
        />
      </div>
    </div>
  );
}
