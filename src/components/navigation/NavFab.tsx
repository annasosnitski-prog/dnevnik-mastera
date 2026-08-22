import { useState, type ReactNode } from "react";
import { PendantIcon } from "./PendantIcon";
import { NaturalStoneIcon, type NaturalStoneKind } from "./NaturalStoneIcon";
import { TERRITORY_COLORS } from "../ui/designTokens";
import { useMinimalism } from "../ui/minimalism";
import type { ModuleFlags, ModuleKey } from "../../modules/registry";
import "./NavFabReveal.css";
import "./NavFabMinimal.css";

type AppScreen = "list" | "settings" | "summary" | "master" | "admin" | "detail" | "workshop" | "content";
type NavItemId = "clients" | "gear" | "content" | "brush" | "sketchbook" | "profile";

interface NavFabProps {
  active: AppScreen;
  onNavigate: (screen: AppScreen) => void;
  // Клиенты (ядро) не привязаны ни к одному модулю — showsFor undefined
  // держит их в вееере всегда. Остальные пункты прячутся, когда их модуль
  // выключен (см. modules/registry.ts), — веер просто заново распределяется
  // по оставшимся пунктам (radialOffset делит круг на fanEntries.length).
  moduleFlags: ModuleFlags;
  adminBadges?: ("urgent" | "reminder")[];
  onCreate?: () => void;
}

const NAV_ITEMS = [
  {
    id: "clients",
    label: "Клиенты",
    screen: "list",
    isActive: (active: AppScreen) => active === "list" || active === "settings" || active === "detail",
    color: TERRITORY_COLORS.clients,
    durationMs: 2000,
    moduleKey: null as ModuleKey | null,
  },
  {
    id: "gear",
    label: "Личный кабинет",
    screen: "master",
    isActive: (active: AppScreen) => active === "master",
    color: TERRITORY_COLORS.personal,
    durationMs: 3600,
    // Не гасится ни одним модулем: это единственный путь к «Настройкам»,
    // где живут сами тогглы модулей — спрятав вкладку, было бы некуда
    // вернуться, чтобы включить модуль обратно.
    moduleKey: null as ModuleKey | null,
  },
  {
    id: "content",
    label: "ContentINKA",
    screen: "content",
    isActive: (active: AppScreen) => active === "content",
    color: TERRITORY_COLORS.content,
    durationMs: 3200,
    moduleKey: "content" as ModuleKey | null,
  },
  {
    id: "brush",
    label: "Проекты",
    screen: "workshop",
    isActive: (active: AppScreen) => active === "workshop",
    color: TERRITORY_COLORS.projects,
    durationMs: 2100,
    moduleKey: "workshop" as ModuleKey | null,
  },
  {
    id: "sketchbook",
    label: "Заметки",
    screen: "summary",
    isActive: (active: AppScreen) => active === "summary",
    color: TERRITORY_COLORS.notes,
    durationMs: 1800,
    moduleKey: "planner" as ModuleKey | null,
  },
  {
    id: "profile",
    label: "Админка",
    screen: "admin",
    isActive: (active: AppScreen) => active === "admin",
    color: TERRITORY_COLORS.admin,
    durationMs: 3800,
    moduleKey: "adminka" as ModuleKey | null,
  },
] as const;

const CREATE_DURATION_MS = 2400;
const ITEM_HALF = 35;
const HUB_HALF = 31;
const HUB_SIZE = HUB_HALF * 2;
const ITEM_SIZE = ITEM_HALF * 2;
const DISC_EDGE_RATIO = 29 / 32;
const HUB_RIM = HUB_HALF * DISC_EDGE_RATIO;
const ITEM_RIM = ITEM_HALF * DISC_EDGE_RATIO;
const FAN_RADIUS = 158;
const INNER_POLYGON_RADIUS = 92;

// Минимализм — visuals only (see functional layer above, unchanged: same
// NAV_ITEMS, fanEntries, positions, routes, handlers, hit-areas). Sourced
// from PR #115 (commit 5b45cae7506551b1c606cfa46d8d5762771cfaef): a round
// ~54px hub carrying the $ glyph, growing while the fan is open. Item icon
// size keeps roughly the same icon-fills-most-of-the-button ratio as the
// gem/pendant rendering, just without the gold plate around it.
const MINIMAL_HUB_SIZE = 54;
const MINIMAL_ITEM_ICON_SIZE = 26;

const NATURAL_STONE_BY_ITEM: Record<NavItemId, NaturalStoneKind> = {
  clients: 'malachite',
  gear: 'honey-jadeite',
  content: 'star-sapphire',
  brush: 'turquoise',
  sketchbook: 'fire-opal',
  profile: 'rhodonite',
};

type FanEntry =
  | { kind: "nav"; item: (typeof NAV_ITEMS)[number] }
  | { kind: "create"; id: "create"; label: "Создать"; durationMs: number };

type PolygonVertex = {
  x: number;
  y: number;
  sourceIndex: number;
};

function radialOffset(index: number, total: number): { dx: number; dy: number } {
  const angle = -Math.PI / 2 + (index * Math.PI * 2) / total;
  return {
    dx: Math.round(Math.cos(angle) * FAN_RADIUS),
    dy: Math.round(Math.sin(angle) * FAN_RADIUS),
  };
}

function rayLens(x1: number, y1: number, x2: number, y2: number, maxWidth: number): string {
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const px = -(y2 - y1) / len;
  const py = (x2 - x1) / len;
  const width = maxWidth / 2;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  return `M${x1},${y1} Q${mx + px * width},${my + py * width} ${x2},${y2} Q${mx - px * width},${my - py * width} ${x1},${y1}Z`;
}

function GemGlyph({ id }: { id: NavItemId }): ReactNode {
  const common = {
    fill: "none",
    strokeWidth: 1.45,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (id) {
    case "clients":
      return (
        <g {...common}>
          <circle cx="-3.2" cy="-3" r="2.4" />
          <circle cx="3.2" cy="-3" r="2.4" />
          <path d="M-8 6c.7-3.4 2.6-5.1 5.5-5.1S2.2 2.6 2.8 6" />
          <path d="M-2.8 6C-2.2 2.6-.4.9 2.5.9S7.3 2.6 8 6" />
        </g>
      );
    case "gear":
      return (
        <g {...common}>
          <circle cx="0" cy="-3.5" r="3" />
          <path d="M-6.5 7c.6-4.4 2.8-6.6 6.5-6.6S5.9 2.6 6.5 7" />
        </g>
      );
    case "content":
      return (
        <g {...common}>
          <path d="M-6 6C-2.8-1.7 1.6-6.3 7-7c-.7 5.5-4.6 10.4-10.9 12" />
          <path d="M-4 7 4-2" />
        </g>
      );
    case "brush":
      return (
        <g {...common}>
          <path d="M-8-4h6l2 2h8v9H-8z" />
          <path d="M-8-2h16" />
        </g>
      );
    case "sketchbook":
      return (
        <g {...common}>
          <rect x="-6" y="-7" width="12" height="14" rx="1.4" />
          <path d="M-3-3h6M-3 0h6M-3 3h4" />
        </g>
      );
    case "profile":
      return (
        <g {...common}>
          <path d="M-7-2 0-7l7 5-1.3 6.2L0 8l-5.7-3.8z" />
          <path d="M-3.2-1.3 0-3.6l3.2 2.3-.6 3.3L0 4.1-2.6 2z" />
        </g>
      );
  }
}

// Minimalism's plain line icon for a fan destination — same GemGlyph paths
// as the gem/pendant rendering (no separate icon set to keep in sync), just
// drawn on their own small canvas instead of centred inside PendantIcon's
// 64×64 stone, with stroke colour left to the caller via currentColor.
function MinimalGlyph({ id, size }: { id: NavItemId; size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="-16 -16 32 32"
      stroke="currentColor"
      aria-hidden="true"
      // The global `svg { color: var(--gold) }` default (index.css) would
      // otherwise win over the button's own colour (muted vs the item's
      // brand colour) — `inherit` opts this one back into the cascade.
      style={{ display: "block", color: "inherit" }}
    >
      <GemGlyph id={id} />
    </svg>
  );
}

export function NavFab({ active, onNavigate, moduleFlags, adminBadges, onCreate }: NavFabProps) {
  const minimalism = useMinimalism();
  const [open, setOpen] = useState(false);
  const [pressedId, setPressedId] = useState<string | null>(null);
  const releasePress = (id: string) => setPressedId((current) => (current === id ? null : current));
  const current = NAV_ITEMS.find((item) => item.isActive(active)) ?? NAV_ITEMS[0];
  const isNavItemVisible = (item: (typeof NAV_ITEMS)[number]) => item.moduleKey === null || moduleFlags[item.moduleKey];

  const allFanEntries: FanEntry[] = onCreate
    ? [
        { kind: "nav", item: NAV_ITEMS[1] },
        { kind: "nav", item: NAV_ITEMS[5] },
        { kind: "nav", item: NAV_ITEMS[0] },
        { kind: "create", id: "create", label: "Создать", durationMs: CREATE_DURATION_MS },
        { kind: "nav", item: NAV_ITEMS[2] },
        { kind: "nav", item: NAV_ITEMS[4] },
        { kind: "nav", item: NAV_ITEMS[3] },
      ]
    : [
        { kind: "nav", item: NAV_ITEMS[1] },
        { kind: "nav", item: NAV_ITEMS[5] },
        { kind: "nav", item: NAV_ITEMS[0] },
        { kind: "nav", item: NAV_ITEMS[2] },
        { kind: "nav", item: NAV_ITEMS[4] },
        { kind: "nav", item: NAV_ITEMS[3] },
      ];
  // Отключённый модуль просто выпадает из веера — radialOffset делит круг на
  // fanEntries.length, так что оставшиеся пункты сами перераспределяются
  // равномерно, без дыр.
  const fanEntries: FanEntry[] = allFanEntries.filter((entry) => entry.kind !== "nav" || isNavItemVisible(entry.item));

  const positions = fanEntries.map((_, index) => radialOffset(index, fanEntries.length));
  const innerPolygonVertices: PolygonVertex[] = positions.map(({ dx, dy }, index) => {
    const length = Math.hypot(dx, dy) || 1;
    return {
      x: (dx / length) * INNER_POLYGON_RADIUS,
      y: (dy / length) * INNER_POLYGON_RADIUS,
      sourceIndex: index,
    };
  });
  const innerPolygonEdges = innerPolygonVertices.map((start, index) => ({
    start,
    end: innerPolygonVertices[(index + 1) % innerPolygonVertices.length],
    sourceIndex: start.sourceIndex,
  }));
  const rayExtent = 214;
  const mainBadgeKind = current.screen !== "admin" ? adminBadges?.[0] : undefined;
  const mainClasses = ["nav-fab__main", minimalism ? "nav-fab__main--minimal" : "nav-fab__main--gold"];

  if (pressedId === "hub") mainClasses.push("nav-fab__main--pressed");

  const containerClasses = ["nav-fab"];
  if (open) containerClasses.push("nav-fab--open");
  if (minimalism) containerClasses.push("nav-fab--minimal");

  return (
    <>
      {open && <div className="nav-fab__scrim" onClick={() => setOpen(false)} aria-hidden="true" />}

      <div className={containerClasses.join(" ")}>
        {open && !minimalism && (
          <svg
            className="nav-fab__rays"
            aria-hidden="true"
            style={{ left: -rayExtent, top: -rayExtent, width: rayExtent * 2, height: rayExtent * 2 }}
            viewBox={`${-rayExtent} ${-rayExtent} ${rayExtent * 2} ${rayExtent * 2}`}
          >
            <style>{`
              @media (prefers-reduced-motion: reduce) {
                .nav-fab__polygon-edge {
                  opacity: 1 !important;
                  transform: none !important;
                }
              }
            `}</style>

            <mask id="navFabRayMask">
              <rect x={-rayExtent} y={-rayExtent} width={rayExtent * 2} height={rayExtent * 2} fill="white" />
              <circle cx={0} cy={0} r={HUB_RIM} fill="black" />
              {positions.map(({ dx, dy }, index) => (
                <circle key={index} cx={dx} cy={dy} r={ITEM_RIM} fill="black" />
              ))}
            </mask>

            <defs>
              {positions.map(({ dx, dy }, index) => (
                <linearGradient key={index} id={`navFabRayGrad-${index}`} gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={dx} y2={dy}>
                  <stop offset="0%" stopColor="var(--nav-metal)" stopOpacity={0.05} />
                  <stop offset="52%" stopColor="var(--nav-metal)" stopOpacity={0.34} />
                  <stop offset="100%" stopColor="var(--nav-metal-highlight)" stopOpacity={0.86} />
                </linearGradient>
              ))}
              {innerPolygonEdges.map(({ start, end }, index) => (
                <linearGradient
                  key={index}
                  id={`navFabPolygonGrad-${index}`}
                  gradientUnits="userSpaceOnUse"
                  x1={start.x}
                  y1={start.y}
                  x2={end.x}
                  y2={end.y}
                >
                  <stop offset="0%" stopColor="var(--nav-metal)" stopOpacity={0.05} />
                  <stop offset="52%" stopColor="var(--nav-metal)" stopOpacity={0.34} />
                  <stop offset="100%" stopColor="var(--nav-metal-highlight)" stopOpacity={0.86} />
                </linearGradient>
              ))}
            </defs>

            <g mask="url(#navFabRayMask)">
              {innerPolygonEdges.map(({ start, end, sourceIndex }, index) => {
                const entry = fanEntries[sourceIndex];
                const durationMs = Math.max(900, (entry.kind === "create" ? entry.durationMs : entry.item.durationMs) - 520);
                const delayMs = 90 + sourceIndex * 70;

                return (
                  <g key={`polygon-${sourceIndex}`} className="nav-fab__polygon-edge" opacity={0}>
                    <animate
                      attributeName="opacity"
                      from="0"
                      to="1"
                      dur={`${durationMs / 1000}s`}
                      begin={`${delayMs / 1000}s`}
                      calcMode="spline"
                      keyTimes="0;1"
                      keySplines="0.18 0.82 0.2 1"
                      fill="freeze"
                    />
                    <animateTransform
                      attributeName="transform"
                      type="scale"
                      from="0.06 0.06"
                      to="1 1"
                      dur={`${durationMs / 1000}s`}
                      begin={`${delayMs / 1000}s`}
                      calcMode="spline"
                      keyTimes="0;1"
                      keySplines="0.18 0.82 0.2 1"
                      fill="freeze"
                    />
                    <path
                      className="nav-fab__ray-glow"
                      fill={`url(#navFabPolygonGrad-${index})`}
                      d={rayLens(start.x, start.y, end.x, end.y, 2.8)}
                    />
                    <path
                      className="nav-fab__ray"
                      fill={`url(#navFabPolygonGrad-${index})`}
                      d={rayLens(start.x, start.y, end.x, end.y, 0.8)}
                    />
                    <circle cx={start.x} cy={start.y} r="1.35" fill="var(--nav-metal-point)" opacity="0.78" />
                  </g>
                );
              })}

              {positions.map(({ dx, dy }, index) => {
                const len = Math.hypot(dx, dy) || 1;
                const ux = dx / len;
                const uy = dy / len;
                const x1 = ux * HUB_RIM;
                const y1 = uy * HUB_RIM;
                const x2 = dx - ux * ITEM_RIM;
                const y2 = dy - uy * ITEM_RIM;
                const entry = fanEntries[index];
                const durationMs = entry.kind === "create" ? entry.durationMs : entry.item.durationMs;

                return (
                  <g
                    key={index}
                    className="nav-fab__ray-group"
                    style={{
                      ["--ray-duration" as string]: `${Math.max(900, durationMs - 520)}ms`,
                      ["--ray-delay" as string]: `${90 + index * 70}ms`,
                    }}
                  >
                    <path className="nav-fab__ray-glow" fill={`url(#navFabRayGrad-${index})`} d={rayLens(x1, y1, x2, y2, 2.8)} />
                    <path className="nav-fab__ray" fill={`url(#navFabRayGrad-${index})`} d={rayLens(x1, y1, x2, y2, 0.8)} />
                  </g>
                );
              })}
            </g>
          </svg>
        )}

        {open &&
          fanEntries.map((entry, index) => {
            const { dx, dy } = positions[index];
            const id = entry.kind === "create" ? entry.id : entry.item.id;
            const durationMs = entry.kind === "create" ? entry.durationMs : entry.item.durationMs;
            const travelDelayMs = 120 + index * 65;
            const classes = ["nav-fab__item", minimalism ? "nav-fab__item--minimal" : "nav-fab__item--ice"];

            if (entry.kind === "create") classes.push(minimalism ? "nav-fab__item--minimal-create" : "nav-fab__item--create");
            if (pressedId === id) classes.push("nav-fab__item--pressed");

            if (entry.kind === "create") {
              return (
                <button
                  key={entry.id}
                  type="button"
                  className={classes.join(" ")}
                  style={{
                    ["--dx" as string]: `${dx}px`,
                    ["--dy" as string]: `${dy}px`,
                    ["--travel-duration" as string]: `${durationMs}ms`,
                    ["--travel-delay" as string]: `${travelDelayMs}ms`,
                  }}
                  aria-label={entry.label}
                  onPointerDown={() => setPressedId(entry.id)}
                  onPointerUp={() => releasePress(entry.id)}
                  onPointerCancel={() => releasePress(entry.id)}
                  onPointerLeave={() => releasePress(entry.id)}
                  onClick={() => {
                    onCreate?.();
                    setOpen(false);
                  }}
                >
                  {minimalism ? (
                    <svg width="22" height="22" viewBox="0 0 20 20" fill="none" aria-hidden="true" style={{ color: "inherit" }}>
                      <line x1="10" y1="3" x2="10" y2="17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                      <line x1="3" y1="10" x2="17" y2="10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  ) : (
                    <>
                      <span className="theme-dark-jewel" aria-hidden="true">
                        <PendantIcon color="#C9922E" size={ITEM_SIZE} plate>
                          <line x1="0" y1="-7" x2="0" y2="7" strokeWidth="2.2" strokeLinecap="round" />
                          <line x1="-7" y1="0" x2="7" y2="0" strokeWidth="2.2" strokeLinecap="round" />
                        </PendantIcon>
                      </span>
                      <span className="theme-light-jewel" aria-hidden="true">
                        <NaturalStoneIcon size={ITEM_SIZE} plate shineDelay={`${(travelDelayMs + durationMs + 180) / 1000}s`}>
                          <g aria-hidden="true">
                            <line x1="0" y1="-7" x2="0" y2="7" stroke="var(--bronze-engrave-groove)" strokeWidth="3.4" strokeLinecap="round" />
                            <line x1="-7" y1="0" x2="7" y2="0" stroke="var(--bronze-engrave-groove)" strokeWidth="3.4" strokeLinecap="round" />
                            <line x1="-.62" y1="-7" x2="-.62" y2="7" stroke="var(--bronze-engrave-highlight)" strokeWidth=".72" strokeLinecap="round" opacity=".64" />
                            <line x1="-7" y1="-.62" x2="7" y2="-.62" stroke="var(--bronze-engrave-highlight)" strokeWidth=".72" strokeLinecap="round" opacity=".64" />
                            <line x1=".62" y1="-7" x2=".62" y2="7" stroke="var(--bronze-engrave-shadow)" strokeWidth=".76" strokeLinecap="round" opacity=".72" />
                            <line x1="-7" y1=".62" x2="7" y2=".62" stroke="var(--bronze-engrave-shadow)" strokeWidth=".76" strokeLinecap="round" opacity=".72" />
                          </g>
                        </NaturalStoneIcon>
                      </span>
                    </>
                  )}
                </button>
              );
            }

            const { item } = entry;
            const isCurrentItem = item === current;
            if (minimalism && !isCurrentItem) classes.push("nav-fab__item--dim");
            if (!minimalism && isCurrentItem) classes.push("nav-fab__item--current");
            return (
              <button
                key={item.id}
                type="button"
                className={classes.join(" ")}
                style={{
                  ["--dx" as string]: `${dx}px`,
                  ["--dy" as string]: `${dy}px`,
                  ["--travel-duration" as string]: `${durationMs}ms`,
                  ["--travel-delay" as string]: `${travelDelayMs}ms`,
                  ["--natural-jewel-color" as string]: item.color,
                  ...(minimalism && isCurrentItem ? { ["--item-color" as string]: item.color, color: item.color } : {}),
                }}
                aria-label={item.label}
                onPointerDown={() => setPressedId(item.id)}
                onPointerUp={() => releasePress(item.id)}
                onPointerCancel={() => releasePress(item.id)}
                onPointerLeave={() => releasePress(item.id)}
                onClick={() => {
                  onNavigate(item.screen);
                  setOpen(false);
                }}
              >
                {minimalism ? (
                  <MinimalGlyph id={item.id as NavItemId} size={MINIMAL_ITEM_ICON_SIZE} />
                ) : (
                  <>
                    <span
                      className="theme-dark-jewel"
                      aria-hidden="true"
                      style={{
                        filter: isCurrentItem
                          ? `saturate(1.55) brightness(1.18) contrast(1.1) drop-shadow(0 0 7px ${item.color}D9) drop-shadow(0 0 16px ${item.color}99) drop-shadow(0 0 28px ${item.color}5C)`
                          : `saturate(1.42) brightness(1.1) contrast(1.06) drop-shadow(0 0 5px ${item.color}99) drop-shadow(0 0 12px ${item.color}4D)`,
                      }}
                    >
                      <PendantIcon color={item.color} size={ITEM_SIZE}>
                        <GemGlyph id={item.id as NavItemId} />
                      </PendantIcon>
                    </span>
                    <span
                      className="theme-light-jewel"
                      aria-hidden="true"
                      style={{ ['--natural-jewel-color' as string]: item.color }}
                    >
                      <NaturalStoneIcon
                        kind={NATURAL_STONE_BY_ITEM[item.id]}
                        size={ITEM_SIZE}
                      />
                    </span>
                  </>
                )}
                {item.screen === "admin" &&
                  adminBadges?.map((kind, badgeIndex) => (
                    <span
                      key={kind}
                      className="nav-fab__badge"
                      style={{
                        top: -2 - badgeIndex * 7,
                        right: -2 - badgeIndex * 7,
                        background: kind === "urgent" ? "var(--urgent)" : "#e0b84a",
                      }}
                    />
                  ))}
              </button>
            );
          })}

        <button
          type="button"
          className={mainClasses.join(" ")}
          style={minimalism ? { width: MINIMAL_HUB_SIZE, height: MINIMAL_HUB_SIZE } : undefined}
          aria-label={open ? "Закрыть меню" : "Открыть меню"}
          aria-expanded={open}
          onPointerDown={() => setPressedId("hub")}
          onPointerUp={() => releasePress("hub")}
          onPointerCancel={() => releasePress("hub")}
          onPointerLeave={() => releasePress("hub")}
          onClick={() => setOpen((value) => !value)}
        >
          {minimalism ? (
            <span className="nav-fab__minimal-home-mark" aria-hidden="true">$</span>
          ) : (
            <>
              <span className="theme-dark-jewel" aria-hidden="true">
                <PendantIcon color="#C9922E" size={HUB_SIZE} plate />
              </span>
              <span className="theme-light-jewel" aria-hidden="true">
                <NaturalStoneIcon size={HUB_SIZE} plate />
              </span>
            </>
          )}
          {mainBadgeKind && (
            <span
              className="nav-fab__badge"
              style={{ top: -2, right: -2, background: mainBadgeKind === "urgent" ? "var(--urgent)" : "#e0b84a" }}
            />
          )}
        </button>
      </div>
    </>
  );
}
