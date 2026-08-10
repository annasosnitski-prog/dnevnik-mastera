import type { CSSProperties } from 'react';
import { useMinimalism } from '../ui/minimalism';
import { COLORS, TERRITORY_COLORS } from '../ui/designTokens';
import { ClientTabIcon, type ClientTabIconName } from './ClientTabIcons';

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

const TABLIST_STYLE: CSSProperties = {
  display: 'flex',
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
};

// One substantial jump-ring wraps the gold tube; a folded bail links that
// ring to the medallion and disappears behind its top edge. Both pieces move
// with the medallion, so the selected tab swings from the tube instead of
// leaving a static connector floating above it.
function GemLink() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 18 24"
      style={{
        position: 'absolute',
        top: -10,
        left: '50%',
        width: 18,
        height: 24,
        transform: 'translateX(-50%)',
        overflow: 'visible',
        pointerEvents: 'none',
        zIndex: 1,
      }}
    >
      {/* Folded bail first: its lower edge is hidden by the medallion face. */}
      <path
        d="M6.2 10.2 C6.2 15.2 6.8 19.6 9 21.6 C11.2 19.6 11.8 15.2 11.8 10.2"
        fill="none"
        stroke="#4B1A00"
        strokeWidth="4.2"
        strokeLinecap="round"
      />
      <path
        d="M6.2 10.2 C6.2 15.2 6.8 19.6 9 21.6 C11.2 19.6 11.8 15.2 11.8 10.2"
        fill="none"
        stroke="#C77A14"
        strokeWidth="2.9"
        strokeLinecap="round"
      />
      <path
        d="M7 10.7 C7 14.7 7.3 17.6 8.2 19.1"
        fill="none"
        stroke="#FFF0B3"
        strokeWidth=".75"
        strokeLinecap="round"
        opacity=".88"
      />

      {/* Thick oval jump-ring: large enough to read as hardware at 54px. */}
      <ellipse cx="9" cy="6.8" rx="5.3" ry="6" fill="none" stroke="#4B1A00" strokeWidth="4" />
      <ellipse cx="9" cy="6.8" rx="5.3" ry="6" fill="none" stroke="#C77A14" strokeWidth="2.8" />
      <path
        d="M5.8 3.2 C7.2 .9 10.8 .6 12.5 2.8"
        fill="none"
        stroke="#FFF0B3"
        strokeWidth=".9"
        strokeLinecap="round"
        opacity=".94"
      />
      <path
        d="M12.9 9.5 C12 11.5 10.4 12.7 8.8 12.8"
        fill="none"
        stroke="#793804"
        strokeWidth="1"
        strokeLinecap="round"
        opacity=".9"
      />
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
      className={active ? 'client-card-tabbar__marker pendant-swing' : 'client-card-tabbar__marker'}
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
      <GemLink />
      <span
        aria-hidden="true"
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
    </span>
  );
}

export interface ClientCardTabDef<T extends string> {
  id: T;
  kind: ClientTabIconName;
  label: string;
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
  return (
    <div className="client-card-tabbar" role="tablist" aria-label={ariaLabel} style={TABLIST_STYLE}>
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
