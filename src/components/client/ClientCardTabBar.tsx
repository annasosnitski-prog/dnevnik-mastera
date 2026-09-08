import { useId, type CSSProperties } from 'react';
import { useMinimalism } from '../ui/minimalism';
import { COLORS, TERRITORY_COLORS } from '../ui/designTokens';
import { ClientTabIcon, type ClientTabIconName } from './ClientTabIcons';
import { NaturalStoneIcon } from '../navigation/NaturalStoneIcon';
import { PendantIcon } from '../navigation/PendantIcon';
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
        opacity: active ? 1 : 0.7,
        filter: active ? 'none' : 'saturate(0.82) brightness(0.88)',
        transition: 'opacity 0.25s, filter 0.25s',
      }}
    >
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
        <GemBail />
        {/* Same faceted-jewel component the radial toolbar (NavFab) uses for
            its own dark-theme destinations — shape="diamond" keeps every
            gradient, facet and the glow filter identical to the round
            pendant, tracing a rhombus instead of a circle. The tab's own
            territory colour lands straight on the stone via PendantIcon's
            `color` prop, same as the toolbar. */}
        {/* Same layered drop-shadow glow NavFab puts on its own current-item
            jewel (see NavFab.tsx's isCurrentItem filter) — three softening
            rings for the active stone, two tighter ones at rest. */}
        <span
          aria-hidden="true"
          className="client-card-tabbar__medallion theme-dark-jewel"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'block',
            width: GEM_SIZE,
            height: GEM_SIZE,
            zIndex: 2,
            filter: active
              ? `saturate(1.55) brightness(1.18) contrast(1.1) drop-shadow(0 0 7px ${color}D9) drop-shadow(0 0 16px ${color}99) drop-shadow(0 0 28px ${color}5C)`
              : `saturate(1.42) brightness(1.1) contrast(1.06) drop-shadow(0 0 5px ${color}99) drop-shadow(0 0 12px ${color}4D)`,
          }}
        >
          <PendantIcon color={color} size={GEM_SIZE} shape="diamond" />
        </span>
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
          {/* The tab's territory colour lands on the stone itself, not just
              the surrounding glow — a rhombus-clipped colour wash blended
              over the shared gold cut, so e.g. Проекты reads as the toolbar's
              blue without needing its own sprite tile. */}
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
              background: color,
              mixBlendMode: 'color',
              opacity: 0.65,
              pointerEvents: 'none',
            }}
          />
        </span>
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

// The rail is inset by a fixed 8% margin at each end — beads sit at
// `count + 1` positions spread evenly across that inset span (not across
// the full 0-100%), so segment k (between bead k and bead k+1, one segment
// per gem) is always exactly `(100 - 2*RAIL_MARGIN_PCT) / count` wide,
// whatever `count` is. PendantRail below places its joins and its glow at
// the very same positions, so the gems, the beads and the glow all agree
// on where each segment starts and ends.
const RAIL_MARGIN_PCT = 8;
function beadPositionPct(index: number, count: number): number {
  return RAIL_MARGIN_PCT + (index / count) * (100 - 2 * RAIL_MARGIN_PCT);
}

// A small threaded bead — sphere-shaded (off-centre specular highlight,
// dark core, a bright rim) so it reads as a bead strung on the wire rather
// than a flat painted dot, with its own drop shadow for the wire passing
// behind it.
function ThreadedBead({ pct }: { pct: number }) {
  return (
    <span
      data-tube-divider=""
      style={{
        position: 'absolute',
        left: `${pct}%`,
        top: 0,
        width: 7,
        height: 7,
        transform: 'translate(-50%, -50%)',
        borderRadius: '50%',
        border: '0.5px solid rgba(255,240,179,.85)',
        background: `radial-gradient(circle at 32% 26%,
          #FFFFFF 0%,
          #F5E3B8 12%,
          #EAD1A0 24%,
          #E0B569 40%,
          #C8943A 60%,
          #7A5620 82%,
          #3A2712 100%)`,
        boxShadow: `
          inset -1px -1px 1.4px rgba(0,0,0,.55),
          inset 0.6px 0.6px 0.8px rgba(255,255,255,.5),
          0 0 1.5px rgba(255,240,179,.82),
          0 0 4px rgba(224,181,105,.4),
          0 0 7px rgba(226,182,85,.16),
          0 1.5px 2px rgba(0,0,0,.5)`,
      }}
    />
  );
}

function TubeDividerBeads({ count }: { count: number }) {
  return (
    <span
      aria-hidden="true"
      data-tube-dividers
      className="client-card-tabbar__tube-dividers"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: 4,
        height: 0,
        pointerEvents: 'none',
        zIndex: 1,
      }}
    >
      {Array.from({ length: count + 1 }, (_, index) => (
        <ThreadedBead key={index} pct={beadPositionPct(index, count)} />
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
function PendantRail({
  count,
  activeIndex,
}: {
  count: number;
  // The rail no longer glows along its whole length — only the stretch
  // between the two beads flanking the active gem lights up, in the
  // chain's own gold, echoing the per-item glow NavFab puts on its current
  // pendant without letting that gem's own colour bleed onto the metal.
  activeIndex?: number;
}) {
  const rawId = useId().replace(/:/g, '');
  const metalId = `two-pendant-ray-metal-${rawId}`;
  const sheenId = `two-pendant-ray-sheen-${rawId}`;
  const glowId = `two-pendant-ray-glow-${rawId}`;

  // Same evenly-spaced beads as TubeDividerBeads, in the rail's own 1000-unit
  // space — `count + 1` of them, so segment `i` (bead i .. bead i+1) is
  // always the same width for every i, and each gem's join sits at the exact
  // midpoint of its own segment instead of an independently-computed
  // position that could drift from where its flanking beads actually are.
  const beads = Array.from({ length: count + 1 }, (_, i) => beadPositionPct(i, count) * 10);
  const joins = Array.from({ length: count }, (_, i) => (beads[i] + beads[i + 1]) / 2);
  const metalPaths = [`M0 5.25 L0 6.75 L${joins[0]} 6.75 L${joins[0]} 5.25 Z`];
  const sheenPaths = [`M0 5.51 L0 5.94 L${joins[0]} 5.94 L${joins[0]} 5.51 Z`];
  for (let i = 0; i < joins.length - 1; i++) {
    const a = joins[i];
    const b = joins[i + 1];
    const mid = (a + b) / 2;
    metalPaths.push(`M${a} 5.25 Q${mid} 4.8 ${b} 5.25 L${b} 6.75 Q${mid} 7.2 ${a} 6.75 Z`);
    sheenPaths.push(`M${a} 5.51 Q${mid} 5.39 ${b} 5.51 L${b} 5.94 Q${mid} 6.07 ${a} 5.94 Z`);
  }
  const last = joins[joins.length - 1];
  metalPaths.push(`M${last} 5.25 L${last} 6.75 L1000 6.75 L1000 5.25 Z`);
  sheenPaths.push(`M${last} 5.51 L${last} 5.94 L1000 5.94 L1000 5.51 Z`);

  // The active gem's own segment, bounded by the two beads flanking it.
  const glowSegment = activeIndex != null ? { left: beads[activeIndex], right: beads[activeIndex + 1] } : null;
  // A lens shape — thin at both tips, widest at the centre, the same
  // pointed-taper construction PendantIcon's own `glint` sparkle uses —
  // rather than a flat bar: it already reaches zero width right at each
  // bead, so the light narrows into the bead instead of being cut off by a
  // hard clip.
  const glowLens =
    glowSegment != null
      ? `M${glowSegment.left},6 Q${(glowSegment.left + glowSegment.right) / 2},1.2 ${glowSegment.right},6 Q${(glowSegment.left + glowSegment.right) / 2},10.8 ${glowSegment.left},6Z`
      : null;

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
        {/* Same bloom recipe as PendantIcon's own stoneGlow filter on the
            gems (blur -> flood-tint -> composite -> merge over the source),
            just re-tinted to the rail's own gold instead of a gem colour. */}
        {glowLens != null && (
          <filter id={glowId} x="-30%" y="-200%" width="160%" height="500%">
            <feGaussianBlur stdDeviation="2.4" result="blur" />
            <feFlood floodColor="var(--two-pendant-ray-highlight)" floodOpacity=".95" />
            <feComposite in2="blur" operator="in" />
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        )}
      </defs>

      <g className="client-card-tabbar__ray-metal" style={{ fill: `url(#${metalId})` }}>
        {metalPaths.map((d, i) => <path key={i} d={d} />)}
      </g>
      <g className="client-card-tabbar__ray-sheen" style={{ fill: `url(#${sheenId})` }}>
        {sheenPaths.map((d, i) => <path key={i} d={d} />)}
      </g>
      {/* Localised glow — only the stretch of rail between the two beads
          flanking the active gem lights up, narrowing to a point at each
          bead rather than stopping at a hard edge, in the chain's own gold
          (not the gem's colour bleeding over from the stone above it). */}
      {glowLens != null && (
        <path
          d={glowLens}
          fill="var(--two-pendant-ray-highlight)"
          opacity=".85"
          filter={`url(#${glowId})`}
          style={{ mixBlendMode: 'screen' }}
        />
      )}
    </svg>
  );
}

// The master dashboard's original two-pendant build, now a thin wrapper over
// the generalised rail (count=2 reproduces the exact original geometry).
function TwoPendantRays({ activeIndex }: { activeIndex?: number }) {
  return <PendantRail count={2} activeIndex={activeIndex} />;
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
  // Set false for a caller that wants the gem markers without the chain
  // (e.g. a tab bar embedded somewhere the tube would be redundant).
  showTube?: boolean;
}) {
  const minimalism = useMinimalism();
  const hasTwoPendantRays = isMasterDashboardPair(tabs);
  const showPendantRail = !hasTwoPendantRays && showTube && tabs.length >= 2;
  const showBuiltInTube = hasTwoPendantRays || showPendantRail;
  const activeIndex = tabs.findIndex((tab) => tab.id === activeTab);

  return (
    <div
      className="client-card-tabbar"
      data-two-pendant-rays={hasTwoPendantRays ? 'true' : undefined}
      data-pendant-rail={showPendantRail ? 'true' : undefined}
      role="tablist"
      aria-label={ariaLabel}
      style={{ ...TABLIST_STYLE, paddingBottom: showBuiltInTube && !minimalism ? 11 : undefined }}
    >
      {hasTwoPendantRays && <TwoPendantRays activeIndex={activeIndex >= 0 ? activeIndex : undefined} />}
      {showPendantRail && (
        <PendantRail count={tabs.length} activeIndex={activeIndex >= 0 ? activeIndex : undefined} />
      )}
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
