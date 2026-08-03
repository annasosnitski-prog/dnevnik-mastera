import { useState, type ReactNode } from "react";
import { ButterflyIcon } from "./ButterflyIcon";
import { PendantIcon } from "./PendantIcon";
import "./NavFabReveal.css";
import "./ButterflyNav.css";

type AppScreen = "list" | "settings" | "summary" | "master" | "admin" | "detail" | "workshop" | "content";
type NavItemId = "clients" | "gear" | "content" | "brush" | "sketchbook" | "profile";

interface NavFabProps {
  active: AppScreen;
  onNavigate: (screen: AppScreen) => void;
  adminBadges?: ("urgent" | "reminder")[];
  onCreate?: () => void;
}

const NAV_ITEMS = [
  {
    id: "clients",
    label: "Клиенты",
    screen: "list",
    isActive: (active: AppScreen) => active === "list" || active === "settings" || active === "detail",
    color: "#5CFF24",
    lightColor: "#7FA67B",
    durationMs: 2000,
  },
  {
    id: "gear",
    label: "Личный кабинет",
    screen: "master",
    isActive: (active: AppScreen) => active === "master",
    color: "#FFE000",
    lightColor: "#C6A85B",
    durationMs: 3600,
  },
  {
    id: "content",
    label: "POSTiNKA",
    screen: "content",
    isActive: (active: AppScreen) => active === "content",
    color: "#C12FFF",
    lightColor: "#9A78B0",
    durationMs: 3200,
  },
  {
    id: "brush",
    label: "Проекты",
    screen: "workshop",
    isActive: (active: AppScreen) => active === "workshop",
    color: "#00CFFF",
    lightColor: "#6FA7AE",
    durationMs: 2100,
  },
  {
    id: "sketchbook",
    label: "Заметки",
    screen: "summary",
    isActive: (active: AppScreen) => active === "summary",
    color: "#FF8900",
    lightColor: "#C58652",
    durationMs: 1800,
  },
  {
    id: "profile",
    label: "Админка",
    screen: "admin",
    isActive: (active: AppScreen) => active === "admin",
    color: "#FF3342",
    lightColor: "#B85F63",
    durationMs: 3800,
  },
] as const;

const CREATE_DURATION_MS = 2400;
const ITEM_HALF = 35;
const HUB_HALF = 31;
const HUB_SIZE = HUB_HALF * 2;
const ITEM_SIZE = ITEM_HALF * 2;
const BUTTERFLY_SIZE = 82;
const DISC_EDGE_RATIO = 29 / 32;
const HUB_RIM = HUB_HALF * DISC_EDGE_RATIO;
const ITEM_RIM = ITEM_HALF * DISC_EDGE_RATIO;
const FAN_RADIUS = 158;
const INNER_POLYGON_RADIUS = 92;
const POSITION_WING_OPEN = [0.42, 0.58, 0.72, 0.48, 0.64, 0.36, 0.54] as const;

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

function flightCurve(dx: number, dy: number, index: number) {
  const length = Math.hypot(dx, dy) || 1;
  const normalX = -dy / length;
  const normalY = dx / length;
  const side = index % 2 === 0 ? 1 : -1;
  const curve = 18 + (index % 3) * 5;

  return {
    midX: Math.round(dx * 0.48 + normalX * curve * side),
    midY: Math.round(dy * 0.48 + normalY * curve * side),
    nearX: Math.round(dx * 0.84 - normalX * curve * 0.35 * side),
    nearY: Math.round(dy * 0.84 - normalY * curve * 0.35 * side),
    rotation: side * (11 + (index % 4) * 3),
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

export function NavFab({ active, onNavigate, adminBadges, onCreate }: NavFabProps) {
  const [open, setOpen] = useState(false);
  const [pressedId, setPressedId] = useState<string | null>(null);
  const releasePress = (id: string) => setPressedId((current) => (current === id ? null : current));
  const current = NAV_ITEMS.find((item) => item.isActive(active)) ?? NAV_ITEMS[0];

  const fanEntries: FanEntry[] = onCreate
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
  const mainClasses = ["nav-fab__main", "nav-fab__main--gold"];

  if (pressedId === "hub") mainClasses.push("nav-fab__main--pressed");

  return (
    <>
      {open && <div className="nav-fab__scrim" onClick={() => setOpen(false)} aria-hidden="true" />}

      <div className={open ? "nav-fab nav-fab--open" : "nav-fab"}>
        {open && (
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
                  <stop offset="0%" stopColor="var(--nav-web-color, var(--gold))" stopOpacity={0.05} />
                  <stop offset="52%" stopColor="var(--nav-web-color, var(--gold))" stopOpacity={0.34} />
                  <stop offset="100%" stopColor="var(--nav-web-color, var(--gold))" stopOpacity={0.86} />
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
                  <stop offset="0%" stopColor="var(--nav-web-color, var(--gold))" stopOpacity={0.05} />
                  <stop offset="52%" stopColor="var(--nav-web-color, var(--gold))" stopOpacity={0.34} />
                  <stop offset="100%" stopColor="var(--nav-web-color, var(--gold))" stopOpacity={0.86} />
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
                    <circle cx={start.x} cy={start.y} r="1.35" fill="var(--nav-web-node, #f7cf69)" opacity="0.78" />
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
            const flight = flightCurve(dx, dy, index);
            const id = entry.kind === "create" ? entry.id : entry.item.id;
            const durationMs = entry.kind === "create" ? entry.durationMs : entry.item.durationMs;
            const classes = ["nav-fab__item", "nav-fab__item--ice", "nav-fab__item--butterfly"];

            if (entry.kind === "create") classes.push("nav-fab__item--create");
            if (pressedId === id) classes.push("nav-fab__item--pressed");

            const commonStyle = {
              ["--dx" as string]: `${dx}px`,
              ["--dy" as string]: `${dy}px`,
              ["--mid-x" as string]: `${flight.midX}px`,
              ["--mid-y" as string]: `${flight.midY}px`,
              ["--near-x" as string]: `${flight.nearX}px`,
              ["--near-y" as string]: `${flight.nearY}px`,
              ["--flight-rotate" as string]: `${flight.rotation}deg`,
              ["--travel-duration" as string]: `${durationMs}ms`,
              ["--travel-delay" as string]: `${120 + index * 65}ms`,
            };

            if (entry.kind === "create") {
              const openness = POSITION_WING_OPEN[index % POSITION_WING_OPEN.length];
              return (
                <button
                  key={entry.id}
                  type="button"
                  className={classes.join(" ")}
                  style={{ ...commonStyle, ["--butterfly-color" as string]: "#C6A85B" }}
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
                  <span className="nav-fab__dark-jewel">
                    <PendantIcon color="#C9922E" size={ITEM_SIZE} plate>
                      <line x1="0" y1="-7" x2="0" y2="7" strokeWidth="2.2" strokeLinecap="round" />
                      <line x1="-7" y1="0" x2="7" y2="0" strokeWidth="2.2" strokeLinecap="round" />
                    </PendantIcon>
                  </span>
                  <span className="nav-fab__light-butterfly">
                    <ButterflyIcon
                      color="#C6A85B"
                      size={BUTTERFLY_SIZE}
                      openness={openness}
                      variant={(index % 3) as 0 | 1 | 2}
                      flutterDurationMs={2380 + index * 170}
                      flutterDelayMs={-index * 130}
                    >
                      <line x1="0" y1="-6" x2="0" y2="6" strokeWidth="2" strokeLinecap="round" />
                      <line x1="-6" y1="0" x2="6" y2="0" strokeWidth="2" strokeLinecap="round" />
                    </ButterflyIcon>
                  </span>
                </button>
              );
            }

            const { item } = entry;
            const isSelected = item.isActive(active);
            const openness = isSelected ? 1 : POSITION_WING_OPEN[index % POSITION_WING_OPEN.length];
            if (isSelected) classes.push("nav-fab__item--selected");

            return (
              <button
                key={item.id}
                type="button"
                className={classes.join(" ")}
                style={{ ...commonStyle, ["--butterfly-color" as string]: item.lightColor }}
                aria-label={item.label}
                aria-current={isSelected ? "page" : undefined}
                onPointerDown={() => setPressedId(item.id)}
                onPointerUp={() => releasePress(item.id)}
                onPointerCancel={() => releasePress(item.id)}
                onPointerLeave={() => releasePress(item.id)}
                onClick={() => {
                  onNavigate(item.screen);
                  setOpen(false);
                }}
              >
                <span
                  aria-hidden="true"
                  className="nav-fab__dark-jewel"
                  style={{
                    filter: `saturate(1.42) brightness(1.1) contrast(1.06) drop-shadow(0 0 5px ${item.color}99) drop-shadow(0 0 12px ${item.color}4D)`,
                  }}
                >
                  <PendantIcon color={item.color} size={ITEM_SIZE}>
                    <GemGlyph id={item.id as NavItemId} />
                  </PendantIcon>
                </span>
                <span className="nav-fab__light-butterfly">
                  <ButterflyIcon
                    color={item.lightColor}
                    size={BUTTERFLY_SIZE}
                    openness={openness}
                    active={isSelected}
                    variant={(index % 3) as 0 | 1 | 2}
                    flutterDurationMs={2480 + index * 190}
                    flutterDelayMs={-index * 160}
                  >
                    <GemGlyph id={item.id as NavItemId} />
                  </ButterflyIcon>
                </span>
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
          aria-label={open ? "Закрыть меню" : "Открыть меню"}
          aria-expanded={open}
          onPointerDown={() => setPressedId("hub")}
          onPointerUp={() => releasePress("hub")}
          onPointerCancel={() => releasePress("hub")}
          onPointerLeave={() => releasePress("hub")}
          onClick={() => setOpen((value) => !value)}
        >
          <PendantIcon color="#C9922E" size={HUB_SIZE} plate />
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
