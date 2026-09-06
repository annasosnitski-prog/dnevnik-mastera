import { useId, type CSSProperties } from 'react';
import { useMinimalism } from '../ui/minimalism';
import { COLORS, TERRITORY_COLORS } from '../ui/designTokens';
import { ClientTabIcon, type ClientTabIconName } from './ClientTabIcons';
import { NaturalStoneIcon } from '../navigation/NaturalStoneIcon';
import './ClientCardTabBar.css';

// Разделяемый каркас вкладок «карточки клиента» (подвеска-самоцвет + строка
// вкладок) — вынесен из DetailScreen.tsx, т.к. теперь его использует ещё и
// Личный кабинет мастера (MasterDashboardScreen в TattoDiary.tsx), который
// оформлен «по форме как карточка клиента» — тот же каркас, свой набор
// вкладок. Ничего не импортирует ни из TattoDiary.tsx, ни из DetailScreen.tsx
// — самостоятельный листовой модуль, как ClientTabIcons/ClientControls (см.
// их собственный комментарий про ленивый чанк DetailScreen), чтобы импорт
// отсюда в TattoDiary.tsx не утянул этот чанк обратно в основной бандл.
const GEM_SIZE = 54;

const GEM_INDEX: Record<ClientTabIconName, number> = {
  sessions: 0,
  consultations: 1,
  content: 2,
  notes: 3,
  info: 4,
  projects: 5,
};

// Every tab's stone carries the same territory colour as the radial toolbar
// (NavFab) — «карточка клиента» reads Проекты as the toolbar's blue,
// Контент as its purple, and so on, everywhere this tab bar is used. Keyed
// by `kind` (not by screen) so the same tab always reads the same colour
// regardless of which screen hosts it — a tab def can still override this
// per-instance (see ClientCardTabDef.color below) for a tab whose kind
// doesn't match its actual meaning here, e.g. Админка's «Сводка» uses the
// info icon but is coloured as the admin territory, not «личное».
const KIND_COLORS: Record<ClientTabIconName, string> = {
  sessions: TERRITORY_COLORS.projects,
  consultations: TERRITORY_COLORS.projects,
  content: TERRITORY_COLORS.content,
  notes: TERRITORY_COLORS.notes,
  info: TERRITORY_COLORS.personal,
  projects: TERRITORY_COLORS.projects,
};

const TABLIST_STYLE: CSSProperties = {
  display: 'flex',
  position: 'relative',
  isolation: 'isolate',
  borderBottom: '1px solid rgba(var(--gold-rgb),0.1)',
  padding: '0 8px',
  background: COLORS.bg,
  flexShrink: 0,
};

const TAB_BUTTON_STYLE: CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  appearance: 'none',
  padding: '4px 1px 3px',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  position: 'relative',
  zIndex: 1,
};

// The jump-ring is threaded onto the tube. It swivels around that horizontal
// axis as the weight below moves, passing through a three-quarter projection
// and a true edge-on profile instead of behaving like a flat oval glued onto
// the front of the tube.
function GemJumpRing({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden="true"
      style={{
        position: 'absolute',
        top: -10,
        left: '50%',
        width: 18,
        height: 14,
        transform: 'translateX(-50%)',
        pointerEvents: 'none',
        zIndex: 3,
      }}
    >
      <svg
        viewBox="0 0 18 14"
        className={active ? 'client-card-tabbar__jump-ring jump-ring-swivel' : 'client-card-tabbar__jump-ring'}
        style={{ width: 18, height: 14, display: 'block', overflow: 'visible' }}
      >
        {/* Ring geometry scaled down around its hinge (9,1) — a snugger loop
            that hugs the tube's real (thin) diameter instead of dwarfing it. */}
        <g transform="translate(9 1) scale(0.6) translate(-9 -1)">
          {/* Rear wire: the tube occupies y=1…6 in this view. Removing that
              strip lets the real tube remain visible in front of the rear arc. */}
          <path className="jewel-wire-shadow" d="M9 .8 C9.8 .8 10.6 1 11.2 1.3 M14.3 6.3 C14.4 9.9 12.2 12.8 9 12.8" fill="none" stroke="#5C4014" strokeWidth="4" strokeLinecap="round" />
          <path className="jewel-wire-rear" d="M9 .8 C9.8 .8 10.6 1 11.2 1.3 M14.3 6.3 C14.4 9.9 12.2 12.8 9 12.8" fill="none" stroke="#9A4B08" strokeWidth="2.8" strokeLinecap="round" />

          {/* Front wire: this half crosses in front of the tube, making the rod
              visibly pass through the ring rather than sit behind the drawing. */}
          <path className="jewel-wire-shadow" d="M9 12.8 C5.8 12.8 3.7 10.1 3.7 6.8 C3.7 3.5 5.8 .8 9 .8" fill="none" stroke="#5C4014" strokeWidth="4.2" strokeLinecap="round" />
          <path className="jewel-wire-front" d="M9 12.8 C5.8 12.8 3.7 10.1 3.7 6.8 C3.7 3.5 5.8 .8 9 .8" fill="none" stroke="#D8B46A" strokeWidth="2.9" strokeLinecap="round" />
          <path className="jewel-wire-highlight" d="M7.1 11.8 C4.7 9.7 4.5 5.8 6.1 2.7" fill="none" stroke="#EAD1A0" strokeWidth=".75" strokeLinecap="round" opacity=".92" />
          <path className="jewel-wire-patina" d="M11.2 11.7 C12.5 10.3 13.1 8.6 13.1 7" fill="none" stroke="#8A6428" strokeWidth=".9" strokeLinecap="round" opacity=".9" />
        </g>
      </svg>
    </span>
  );
}

function GemBail() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 18 14"
      className="client-card-tabbar__bail"
      style={{
        position: 'absolute',
        top: 1,
        left: '50%',
        width: 18,
        height: 14,
        transform: 'translateX(-50%)',
        overflow: 'visible',
        pointerEvents: 'none',
        zIndex: 1,
      }}
    >
      {/* A folded bail hangs from one hinge and slips behind the medallion. */}
      <path className="jewel-wire-shadow" d="M9 1 C8.8 4.2 6.5 7.2 6.2 11.8 M9 1 C9.2 4.2 11.5 7.2 11.8 11.8" fill="none" stroke="#5C4014" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" />
      <path className="jewel-wire-front" d="M9 1 C8.8 4.2 6.5 7.2 6.2 11.8 M9 1 C9.2 4.2 11.5 7.2 11.8 11.8" fill="none" stroke="#D8B46A" strokeWidth="2.9" strokeLinecap="round" strokeLinejoin="round" />
      <path className="jewel-wire-highlight" d="M8.6 1.8 C8.1 4.8 7.2 7.4 7 10.3" fill="none" stroke="#EAD1A0" strokeWidth=".75" strokeLinecap="round" opacity=".88" />
    </svg>
  );
}

// Минимализм swaps the gem sprite + chain for a plain circle carrying a
// linear icon from ClientTabIcons — same tab logic/order, just a different
// functional-layer skin (see NavFab's own minimal branch for the same idea
// applied to the nav hub). The semantic kind selects both the sprite slot and
// the minimal icon, so those two skins cannot disagree.
function GemTabMarker({
  kind,
  active,
  color,
}: {
  kind: ClientTabIconName;
  active: boolean;
  // Resolved by the caller: the tab's own override (ClientCardTabDef.color)
  // or, failing that, its territory colour by kind (see KIND_COLORS above).
  color: string;
}) {
  const minimalism = useMinimalism();

  if (minimalism) {
    return (
      <span
        aria-hidden="true"
        className="client-card-tabbar__marker"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: GEM_SIZE,
          height: GEM_SIZE,
          flexShrink: 0,
          borderRadius: '50%',
          background: 'rgba(var(--surface-rgb),0.07)',
          border: `1px solid ${active ? color : 'rgba(var(--gold-rgb),0.2)'}`,
          boxShadow: active ? `0 0 0 1.5px ${color}, 0 0 14px -4px ${color}` : undefined,
          color: active ? color : 'var(--toolbar-icon)',
          transition: 'color 0.25s, border-color 0.25s, box-shadow 0.25s',
        }}
      >
        <ClientTabIcon name={kind} size={26} />
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className="client-card-tabbar__marker client-card-tabbar__marker--ornate"
      style={{
        position: 'relative',
        display: 'block',
        width: GEM_SIZE,
        height: GEM_SIZE,
        flexShrink: 0,
        opacity: active ? 1 : 0.62,
        filter: active ? 'none' : 'saturate(0.72) brightness(0.82)',
        transition: 'opacity 0.25s, filter 0.25s',
      }}
    >
      {active && (
        <span
          aria-hidden="true"
          className="client-card-tabbar__active-halo"
          style={{ '--active-gem-color': color } as CSSProperties}
        />
      )}
      <GemJumpRing active={active} />
      <span
        aria-hidden="true"
        className={active ? 'client-card-tabbar__pendulum pendant-swing' : 'client-card-tabbar__pendulum'}
        style={{
          position: 'absolute',
          inset: 0,
          display: 'block',
          width: GEM_SIZE,
          height: GEM_SIZE,
        }}
      >
        <span
          aria-hidden="true"
          className={active
            ? 'client-card-tabbar__gem-glow client-card-tabbar__gem-glow--active'
            : 'client-card-tabbar__gem-glow'}
          style={{ '--gem-glow-color': color } as CSSProperties}
        />
        <GemBail />
        <span
          aria-hidden="true"
          className="client-card-tabbar__medallion theme-dark-jewel"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'block',
            width: GEM_SIZE,
            height: GEM_SIZE,
            backgroundImage: 'url(/gem-icons.svg)',
            backgroundRepeat: 'no-repeat',
            backgroundSize: `${GEM_SIZE * 6}px ${GEM_SIZE}px`,
            backgroundPosition: `${-GEM_INDEX[kind] * GEM_SIZE}px 0`,
            zIndex: 2,
          }}
        />
        <span
          aria-hidden="true"
          className="client-card-tabbar__medallion theme-light-jewel"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'block',
            width: GEM_SIZE,
            height: GEM_SIZE,
            zIndex: 2,
          }}
        >
          <NaturalStoneIcon size={GEM_SIZE} medallion goldDiamond />
        </span>
        {/* The tab's territory colour lands on the stone itself, not just
            the surrounding glow — a rhombus-clipped colour wash blended
            over the shared gold cut, so e.g. Проекты reads as the toolbar's
            blue without needing its own sprite tile. */}
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 3,
            clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
            background: color,
            mixBlendMode: 'color',
            opacity: 0.65,
            pointerEvents: 'none',
          }}
        />
      </span>
    </span>
  );
}

export interface ClientCardTabDef<T extends string> {
  id: T;
  kind: ClientTabIconName;
  label: string;
  // Overrides KIND_COLORS for a tab whose icon `kind` doesn't match its
  // actual meaning here — e.g. Админка's «Сводка» borrows the info icon but
  // isn't «личное», it's the admin overview.
  color?: string;
}

// The master dashboard is the only two-pendant composition. Match its semantic
// pair explicitly instead of decorating every future tab bar that happens to
// contain two tabs.
function isMasterDashboardPair<T extends string>(tabs: ClientCardTabDef<T>[]) {
  return tabs.length === 2 && tabs[0]?.kind === 'info' && tabs[1]?.kind === 'projects';
}

// The same raised gold beads the client card's tube carries at each tab
// boundary (see DetailScreen's data-tube-dividers) — plain HTML circles, not
// SVG, so they stay round instead of being squashed by the rays' non-uniform
// viewBox scaling.
function TubeDividerBeads({ count }: { count: number }) {
  return (
    <span
      aria-hidden="true"
      data-tube-dividers
      className="client-card-tabbar__tube-dividers"
      style={{
        position: 'absolute',
        left: 8,
        right: 8,
        top: 4,
        height: 0,
        pointerEvents: 'none',
        zIndex: 1,
      }}
    >
      {Array.from({ length: count - 1 }, (_, index) => (
        <span
          key={index}
          data-tube-divider={index + 1}
          style={{
            position: 'absolute',
            left: `${((index + 1) / count) * 100}%`,
            top: 0,
            width: 5.5,
            height: 5.5,
            transform: 'translate(-50%, -50%)',
            borderRadius: '50%',
            border: '0.5px solid rgba(255,240,179,.82)',
            background: `radial-gradient(circle at 34% 28%,
              #F5E3B8 0%,
              #EAD1A0 16%,
              #E0B569 34%,
              #C8943A 63%,
              #5C4014 82%,
              #4A3313 100%)`,
            boxShadow: `
              0 0 1.5px rgba(255,240,179,.78),
              0 0 4px rgba(224, 181, 105,.36),
              0 0 7px rgba(226,182,85,.14),
              0 1px 1px rgba(0,0,0,.45)`,
          }}
        />
      ))}
    </span>
  );
}

// Keeping the approved rays as SVG, rather than bordered divs, lets the inner
// ends taper to a genuinely narrow neck at every pendant while both outer
// ends leave the viewport square. Generalised from the original two-pendant
// build: N pendants sit at N evenly-spaced joins: the tube tapers thin at
// each join and bulges back out at the midpoint between neighbours (where
// TubeDividerBeads sits its bead). IDs are per-instance so two tab bars
// cannot cross-reference each other's gradients in the DOM.
function PendantRail({ count }: { count: number }) {
  const rawId = useId().replace(/:/g, '');
  const metalId = `two-pendant-ray-metal-${rawId}`;
  const sheenId = `two-pendant-ray-sheen-${rawId}`;

  const joins = Array.from({ length: count }, (_, i) => ((i + 0.5) / count) * 1000);
  const metalPaths = [`M0 5 L0 7 L${joins[0]} 6.3 L${joins[0]} 5.7 Z`];
  const sheenPaths = [`M0 5.35 L0 5.8 L${joins[0]} 5.92 L${joins[0]} 5.78 Z`];
  for (let i = 0; i < joins.length - 1; i++) {
    const a = joins[i];
    const b = joins[i + 1];
    const mid = (a + b) / 2;
    metalPaths.push(`M${a} 5.7 Q${mid} 4.6 ${b} 5.7 L${b} 6.3 Q${mid} 7.4 ${a} 6.3 Z`);
    sheenPaths.push(`M${a} 5.78 Q${mid} 5.2 ${b} 5.78 L${b} 5.92 Q${mid} 5.5 ${a} 5.92 Z`);
  }
  const last = joins[joins.length - 1];
  metalPaths.push(`M${last} 5.7 L${last} 6.3 L1000 7 L1000 5 Z`);
  sheenPaths.push(`M${last} 5.78 L${last} 5.92 L1000 5.8 L1000 5.35 Z`);

  return (
    <svg
      aria-hidden="true"
      className="client-card-tabbar__two-pendant-rays"
      viewBox="0 0 1000 12"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={metalId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--two-pendant-ray-highlight)" />
          <stop offset="0.28" stopColor="var(--two-pendant-ray-light)" />
          <stop offset="0.6" stopColor="var(--two-pendant-ray-mid)" />
          <stop offset="0.82" stopColor="var(--two-pendant-ray-recess)" />
          <stop offset="1" stopColor="var(--two-pendant-ray-shadow)" />
        </linearGradient>
        <linearGradient id={sheenId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="var(--two-pendant-ray-highlight)" stopOpacity="0.3" />
          <stop offset="0.5" stopColor="var(--two-pendant-ray-sheen)" stopOpacity="0.78" />
          <stop offset="1" stopColor="var(--two-pendant-ray-highlight)" stopOpacity="0.3" />
        </linearGradient>
      </defs>

      <g className="client-card-tabbar__ray-metal" style={{ fill: `url(#${metalId})` }}>
        {metalPaths.map((d, i) => <path key={i} d={d} />)}
      </g>
      <g className="client-card-tabbar__ray-sheen" style={{ fill: `url(#${sheenId})` }}>
        {sheenPaths.map((d, i) => <path key={i} d={d} />)}
      </g>
    </svg>
  );
}

// The master dashboard's original two-pendant build, now a thin wrapper over
// the generalised rail (count=2 reproduces the exact original geometry).
function TwoPendantRays() {
  return <PendantRail count={2} />;
}

// One large gemstone per tab; labels stay available to assistive technology
// and hover tooltips without competing for horizontal room.
export function ClientCardTabBar<T extends string>({
  tabs,
  activeTab,
  onTab,
  ariaLabel,
  showTube = true,
}: {
  tabs: ClientCardTabDef<T>[];
  activeTab: T;
  onTab: (tab: T) => void;
  ariaLabel: string;
  // DetailScreen draws its own gold tube (with the client-colour reflection)
  // above this tab bar, so it opts out of the built-in one to avoid a second,
  // redundant tube.
  showTube?: boolean;
}) {
  const minimalism = useMinimalism();
  const hasTwoPendantRays = isMasterDashboardPair(tabs);
  const showPendantRail = !hasTwoPendantRays && showTube && tabs.length >= 2;
  const showBuiltInTube = hasTwoPendantRays || showPendantRail;

  return (
    <div
      className="client-card-tabbar"
      data-two-pendant-rays={hasTwoPendantRays ? 'true' : undefined}
      data-pendant-rail={showPendantRail ? 'true' : undefined}
      role="tablist"
      aria-label={ariaLabel}
      style={{ ...TABLIST_STYLE, paddingBottom: showBuiltInTube && !minimalism ? 11 : undefined }}
    >
      {hasTwoPendantRays && <TwoPendantRays />}
      {showPendantRail && <PendantRail count={tabs.length} />}
      {showBuiltInTube && <TubeDividerBeads count={tabs.length} />}
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className="client-card-tabbar__tab"
          type="button"
          role="tab"
          aria-selected={activeTab === tab.id}
          aria-label={tab.label}
          onClick={() => onTab(tab.id)}
          style={TAB_BUTTON_STYLE}
        >
          <GemTabMarker
            kind={tab.kind}
            active={activeTab === tab.id}
            color={tab.color ?? KIND_COLORS[tab.kind]}
          />
        </button>
      ))}
    </div>
  );
}
