import type { CSSProperties } from 'react';
import { useMinimalism } from '../ui/minimalism';
import { COLORS, TERRITORY_COLORS } from '../ui/designTokens';
import { ClientTabIcon, type ClientTabIconName } from './ClientTabIcons';
import { NaturalStoneIcon, type NaturalStoneKind } from '../navigation/NaturalStoneIcon';

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

// The client tabs map their meanings onto the same territory palette as the
// radial toolbar. Ornate and minimal skins therefore keep one colour contract.
const GEM_COLOR: Record<ClientTabIconName, string> = {
  sessions: TERRITORY_COLORS.admin,
  consultations: TERRITORY_COLORS.clients,
  content: TERRITORY_COLORS.content,
  notes: TERRITORY_COLORS.notes,
  info: TERRITORY_COLORS.personal,
  projects: TERRITORY_COLORS.projects,
};

const GEM_NATURAL_STONE: Record<ClientTabIconName, NaturalStoneKind> = {
  sessions: 'rhodonite',
  consultations: 'malachite',
  content: 'star-sapphire',
  notes: 'fire-opal',
  info: 'honey-jadeite',
  projects: 'turquoise',
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
        {/* Rear wire: the tube occupies y=1…6 in this view. Removing that
            strip lets the real tube remain visible in front of the rear arc. */}
        <path className="jewel-wire-shadow" d="M9 .8 C9.8 .8 10.6 1 11.2 1.3 M14.3 6.3 C14.4 9.9 12.2 12.8 9 12.8" fill="none" stroke="#4B1A00" strokeWidth="4" strokeLinecap="round" />
        <path className="jewel-wire-rear" d="M9 .8 C9.8 .8 10.6 1 11.2 1.3 M14.3 6.3 C14.4 9.9 12.2 12.8 9 12.8" fill="none" stroke="#9A4B08" strokeWidth="2.8" strokeLinecap="round" />

        {/* Front wire: this half crosses in front of the tube, making the rod
            visibly pass through the ring rather than sit behind the drawing. */}
        <path className="jewel-wire-shadow" d="M9 12.8 C5.8 12.8 3.7 10.1 3.7 6.8 C3.7 3.5 5.8 .8 9 .8" fill="none" stroke="#4B1A00" strokeWidth="4.2" strokeLinecap="round" />
        <path className="jewel-wire-front" d="M9 12.8 C5.8 12.8 3.7 10.1 3.7 6.8 C3.7 3.5 5.8 .8 9 .8" fill="none" stroke="#D8B46A" strokeWidth="2.9" strokeLinecap="round" />
        <path className="jewel-wire-highlight" d="M7.1 11.8 C4.7 9.7 4.5 5.8 6.1 2.7" fill="none" stroke="#FFF0B3" strokeWidth=".75" strokeLinecap="round" opacity=".92" />
        <path className="jewel-wire-patina" d="M11.2 11.7 C12.5 10.3 13.1 8.6 13.1 7" fill="none" stroke="#793804" strokeWidth=".9" strokeLinecap="round" opacity=".9" />
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
      <path className="jewel-wire-shadow" d="M9 1 C8.8 4.2 6.5 7.2 6.2 11.8 M9 1 C9.2 4.2 11.5 7.2 11.8 11.8" fill="none" stroke="#4B1A00" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" />
      <path className="jewel-wire-front" d="M9 1 C8.8 4.2 6.5 7.2 6.2 11.8 M9 1 C9.2 4.2 11.5 7.2 11.8 11.8" fill="none" stroke="#D8B46A" strokeWidth="2.9" strokeLinecap="round" strokeLinejoin="round" />
      <path className="jewel-wire-highlight" d="M8.6 1.8 C8.1 4.8 7.2 7.4 7 10.3" fill="none" stroke="#FFF0B3" strokeWidth=".75" strokeLinecap="round" opacity=".88" />
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
}: {
  kind: ClientTabIconName;
  active: boolean;
}) {
  const minimalism = useMinimalism();
  const color = GEM_COLOR[kind];

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
      className="client-card-tabbar__marker"
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
          <NaturalStoneIcon kind={GEM_NATURAL_STONE[kind]} size={GEM_SIZE} medallion />
        </span>
      </span>
    </span>
  );
}

export interface ClientCardTabDef<T extends string> {
  id: T;
  kind: ClientTabIconName;
  label: string;
}

// The two-tab master dashboard uses the three-piece ray construction approved
// for the light skin: the joins sit on the two jump-ring centres (25% / 75%).
// Keeping it as SVG, rather than three bordered divs, lets the inner ends taper
// to a genuinely narrow neck while both outer ends leave the viewport square.
function TwoPendantRays() {
  return (
    <svg
      aria-hidden="true"
      className="client-card-tabbar__two-pendant-rays"
      viewBox="0 0 1000 12"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="twoPendantRayMetal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#CC9D75" />
          <stop offset="0.28" stopColor="#A2775A" />
          <stop offset="0.6" stopColor="#875B43" />
          <stop offset="0.82" stopColor="#506A61" />
          <stop offset="1" stopColor="#2F1D13" />
        </linearGradient>
        <linearGradient id="twoPendantRaySheen" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#CC9D75" stopOpacity="0.3" />
          <stop offset="0.5" stopColor="#F0C49D" stopOpacity="0.78" />
          <stop offset="1" stopColor="#CC9D75" stopOpacity="0.3" />
        </linearGradient>
      </defs>

      <g className="client-card-tabbar__ray-metal">
        <path d="M0 5 L0 7 L250 6.3 L250 5.7 Z" />
        <path d="M250 5.7 Q500 4.6 750 5.7 L750 6.3 Q500 7.4 250 6.3 Z" />
        <path d="M750 5.7 L750 6.3 L1000 7 L1000 5 Z" />
      </g>
      <g className="client-card-tabbar__ray-sheen">
        <path d="M0 5.35 L0 5.8 L250 5.92 L250 5.78 Z" />
        <path d="M250 5.78 Q500 5.2 750 5.78 L750 5.92 Q500 5.5 250 5.92 Z" />
        <path d="M750 5.78 L750 5.92 L1000 5.8 L1000 5.35 Z" />
      </g>
    </svg>
  );
}

// One large gemstone per tab; labels stay available to assistive technology
// and hover tooltips without competing for horizontal room.
export function ClientCardTabBar<T extends string>({
  tabs,
  activeTab,
  onTab,
  ariaLabel,
}: {
  tabs: ClientCardTabDef<T>[];
  activeTab: T;
  onTab: (tab: T) => void;
  ariaLabel: string;
}) {
  const hasTwoPendantRays = tabs.length === 2;

  return (
    <div
      className="client-card-tabbar"
      data-two-pendant-rays={hasTwoPendantRays ? 'true' : undefined}
      role="tablist"
      aria-label={ariaLabel}
      style={TABLIST_STYLE}
    >
      {hasTwoPendantRays && <TwoPendantRays />}
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
          />
        </button>
      ))}
    </div>
  );
}
