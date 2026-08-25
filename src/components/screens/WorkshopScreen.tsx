import { useState } from 'react';
import { InkaLogo } from '../InkaLogo';
import { type Client } from '../../domain/client';
import { type ProjectCategory, PROJECT_CATEGORIES, PROJECT_BODY_AREAS, type Project } from '../../domain/project';
import { buildProjectFolders } from '../../domain/projectSelectors';
import { ProjectFolderCard } from '../project/ProjectFolderCard';
import { ProjectFolderView } from '../project/ProjectFolderView';
import { StarDivider } from '../icons/StarIcons';
import { TodayDateBadge } from '../ui/TodayDateBadge';
import { todayISO } from '../../utils/dates';
import { COLORS, fs, INPUT_STYLE } from '../TattoDiary';

// Вынесено из TattoDiary.tsx (PR 8 рефакторинга). Логика и разметка не
// менялись — только перенос в отдельный модуль. Экран полностью
// prop-driven, состояние (фильтр по типу, открытая папка) — локальное.
export function WorkshopScreen({
  projects,
  projectsLoaded,
  clients,
  onOpenProject,
  onOpenCalendar,
}: {
  projects: Project[];
  projectsLoaded: boolean;
  clients: Client[];
  onOpenProject: (project: Project) => void;
  onOpenCalendar: () => void;
}) {
  const [categoryFilter, setCategoryFilter] = useState<'all' | ProjectCategory>('all');
  const [areaFilter, setAreaFilter] = useState<string>('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const [openFolderId, setOpenFolderId] = useState<string | null>(null);
  const filtersActive = categoryFilter !== 'all' || areaFilter !== 'all';
  const filtered = projects.filter((project) => {
    if (categoryFilter !== 'all' && project.category !== categoryFilter) return false;
    if (areaFilter !== 'all' && project.area !== areaFilter) return false;
    return true;
  });
  // Пустая папка (клиент вообще без проектов) видна всегда — но фильтр по
  // типу не должен превращать «есть проекты, просто не этого типа» в такую
  // же пустую карточку: trueEmptyClientIds считается по НЕотфильтрованным
  // projects, чтобы отличить эти два случая друг от друга.
  const trueEmptyClientIds = new Set(clients.filter((c) => !projects.some((p) => p.clientId === c.id)).map((c) => c.id));
  const allFolders = buildProjectFolders(filtered, clients, todayISO());
  const folders = filtersActive
    ? allFolders.filter((f) => f.projectCount > 0 || (f.type === 'client' && f.clientId !== null && trueEmptyClientIds.has(f.clientId)))
    : allFolders;
  const openFolder = openFolderId ? folders.find((f) => f.id === openFolderId) ?? null : null;

  if (openFolder) {
    return (
      <ProjectFolderView
        folder={openFolder}
        clients={clients}
        onOpenProject={onOpenProject}
        onBack={() => setOpenFolderId(null)}
      />
    );
  }

  return (
    <div style={{ minHeight: '100%' }}>
      <div style={{ height: 'calc(env(safe-area-inset-top) + 18px)' }} />
      {/* zIndex 2 (not 1, like the grid below) — otherwise, at equal
          z-index, the later-in-DOM grid's own stacking context (each card
          establishes one via its hover/press transform) paints over the
          filter dropdown regardless of the dropdown's own z-index. */}
      <div style={{ padding: '6px 24px 12px', position: 'relative', zIndex: 2 }}>
        <InkaLogo height={fs(34)} />
        <div style={{ fontSize: fs(9.66), color: COLORS.textGhost, letterSpacing: `${fs(2.97)}px`, textTransform: 'uppercase', marginTop: 3, fontStyle: 'italic' }}>
          Мастерская
        </div>
        <StarDivider />
      </div>

      {/* Same funnel-toggle + floating chip panel pattern as the client
          list's «Фильтры» — «Все» plus the same category set used when
          creating a project. Own row below the divider, in normal flow next
          to the «сегодня» calendar badge, rather than each absolutely
          overlaid on the header — two absolute buttons in the same corner
          used to bury one under the other. */}
      <div style={{ padding: '0 20px 8px', position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
        <TodayDateBadge onOpen={onOpenCalendar} />
        <div style={{ position: 'relative' }}>
          <div
            onClick={() => setFilterOpen((v) => !v)}
            role="button"
            aria-label={filterOpen ? 'Скрыть фильтр' : 'Фильтр'}
            title="Фильтр"
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              border: filtersActive || filterOpen ? '1px solid rgba(var(--gold-rgb),0.6)' : '1px solid rgba(var(--gold-rgb),0.15)',
              background: filtersActive || filterOpen ? 'rgba(var(--gold-rgb),0.08)' : 'rgba(var(--surface-rgb),0.022)',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ color: filtersActive || filterOpen ? COLORS.gold : COLORS.textFaint }}>
              <path d="M2 3.5h12l-4.7 5.3V13l-2.6-1.5V8.8L2 3.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
            </svg>
          </div>
          {filterOpen && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 6px)',
                right: 0,
                width: 250,
                maxWidth: 'calc(100vw - 40px)',
                background: COLORS.sheet,
                border: '1px solid rgba(var(--gold-rgb),0.2)',
                borderRadius: 4,
                padding: 12,
                boxShadow: '0 10px 28px rgba(0,0,0,0.4)',
                zIndex: 17,
              }}
            >
              <div style={{ fontSize: fs(10), color: COLORS.textGhost, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 8 }}>Тип</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                {(['all', ...PROJECT_CATEGORIES.map((c) => c.key)] as ('all' | ProjectCategory)[]).map((v) => {
                  const label = v === 'all' ? 'Все' : PROJECT_CATEGORIES.find((c) => c.key === v)?.label;
                  const active = categoryFilter === v;
                  return (
                    <div
                      key={v}
                      onClick={() => setCategoryFilter(v)}
                      style={{
                        fontSize: fs(11),
                        padding: '4px 9px',
                        borderRadius: 2,
                        cursor: 'pointer',
                        border: active ? '1px solid rgba(var(--gold-rgb),0.6)' : '1px solid rgba(var(--gold-rgb),0.15)',
                        background: active ? 'rgba(var(--gold-rgb),0.08)' : 'transparent',
                        color: active ? COLORS.gold : COLORS.textFaint,
                        letterSpacing: '0.4px',
                      }}
                    >
                      {label}
                    </div>
                  );
                })}
              </div>

              <div style={{ fontSize: fs(10), color: COLORS.textGhost, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 8 }}>Место</div>
              <select value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)} style={{ ...INPUT_STYLE, fontSize: fs(12) }}>
                <option value="all">Все места</option>
                {PROJECT_BODY_AREAS.map((area) => <option key={area.key} value={area.key}>{area.label}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>

      <div className="inka-client-grid" style={{ padding: '2px 16px calc(env(safe-area-inset-bottom, 0px) + 84px)', display: 'grid', gap: 10, position: 'relative', zIndex: 1 }}>
        {folders.map((folder) => (
          <ProjectFolderCard
            key={folder.id}
            folder={folder}
            accentColor={folder.type === 'client' ? (clients.find((c) => c.id === folder.clientId)?.color ?? COLORS.gold) : COLORS.gold}
            onClick={() => setOpenFolderId(folder.id)}
          />
        ))}
      </div>

      {projectsLoaded && projects.length === 0 && (
        <div style={{ position: 'absolute', top: 280, left: 0, right: 0, textAlign: 'center', fontSize: fs(15), fontStyle: 'italic', color: COLORS.textGhost, pointerEvents: 'none', padding: '0 40px' }}>
          Пока нет проектов — нажмите «+» внизу, чтобы добавить первый
        </div>
      )}

      {projectsLoaded && projects.length > 0 && filtered.length === 0 && (
        <div style={{ position: 'absolute', top: 280, left: 0, right: 0, textAlign: 'center', fontSize: fs(15), fontStyle: 'italic', color: COLORS.textGhost, pointerEvents: 'none', padding: '0 40px' }}>
          Нет проектов с такими фильтрами
        </div>
      )}
    </div>
  );
}
