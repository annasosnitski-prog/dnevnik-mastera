import { useState } from 'react';
import { InkaLogo } from '../InkaLogo';
import { type Client } from '../../domain/client';
import { type ProjectCategory, PROJECT_CATEGORIES, PROJECT_CATEGORY_COLORS, PROJECT_BODY_AREAS, type Project } from '../../domain/project';
import { buildProjectZoneFolders } from '../../domain/projectSelectors';
import { ProjectFolderCard } from '../project/ProjectFolderCard';
import { ProjectFolderView } from '../project/ProjectFolderView';
import { ClientCardTabBar, type ClientCardTabDef } from '../client/ClientCardTabBar';
import { GoldDotDivider } from '../icons/StarIcons';
import { TodayDateBadge } from '../ui/TodayDateBadge';
import { COLORS, fs, INPUT_STYLE } from '../TattoDiary';

// One pendant per category, in PROJECT_CATEGORIES order — `kind: 'projects'`
// is irrelevant here (it only picks the minimalism-mode line icon), the
// gem's actual colour always comes from `color`.
const CATEGORY_TABS: ClientCardTabDef<ProjectCategory>[] = PROJECT_CATEGORIES.map((c) => ({
  id: c.key,
  kind: 'projects',
  label: c.label,
  color: PROJECT_CATEGORY_COLORS[c.key],
}));

// Папки верхнего уровня — по зоне тела (buildProjectZoneFolders), а не по
// клиенту: полный список проектов клиента остаётся в его собственной
// карточке. Экран полностью prop-driven, состояние (фильтр по типу, открытая
// папка) — локальное.
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
  const allFolders = buildProjectZoneFolders(filtered);
  // Основные папки зон видны всегда, даже пустые (M6-принцип «место уже
  // есть»); при активном фильтре это бы показывало пустые зоны как
  // «нет проектов с такими фильтрами», поэтому фильтр прячет только их.
  const folders = filtersActive ? allFolders.filter((f) => f.projectCount > 0) : allFolders;
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
        {/* Calendar badge is a flex sibling of the whole logo+subtitle
            column (not absolutely positioned) so it centers vertically
            against the full header block's height, pinned to the right
            edge — same treatment as every other screen header. */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <InkaLogo height={fs(34)} />
            <div style={{ fontSize: fs(9.66), color: COLORS.textGhost, letterSpacing: `${fs(2.97)}px`, textTransform: 'uppercase', marginTop: 3, fontStyle: 'italic' }}>
              Мастерская
            </div>
          </div>
          <TodayDateBadge onOpen={onOpenCalendar} size={35} />
        </div>
        <GoldDotDivider marginTop={11} />
      </div>

      {/* Always-visible pendant filter, one gem per project category — same
          jewel-tab rail the client card uses (ClientCardTabBar), reusing its
          PROJECT_CATEGORY_COLORS so each gem reads the category's own
          jewel-tone colour instead of the single territory green. Tapping
          the already-active gem clears back to «Все» (categoryFilter). */}
      <div style={{ padding: '0 16px 4px', position: 'relative', zIndex: 2 }}>
        <ClientCardTabBar
          ariaLabel="Фильтр по типу проекта"
          tabs={CATEGORY_TABS}
          activeTab={categoryFilter === 'all' ? ('' as ProjectCategory) : categoryFilter}
          onTab={(cat) => setCategoryFilter((current) => (current === cat ? 'all' : cat))}
        />
      </div>

      {/* Funnel-toggle + floating chip panel now covers only «Место» — type
          filtering moved to the always-visible gem row above. */}
      <div style={{ padding: '0 20px 8px', position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
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
            accentColor={COLORS.gold}
            onClick={() => setOpenFolderId(folder.id)}
          />
        ))}
      </div>

      {projectsLoaded && projects.length === 0 && (
        <div style={{ position: 'absolute', top: 280, left: 0, right: 0, textAlign: 'center', fontSize: fs(15), fontStyle: 'italic', color: COLORS.textGhost, pointerEvents: 'none', padding: '0 40px' }}>
          Здесь пока пусто — еще никто ничего не создал
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
