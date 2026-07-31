import { useState } from "react";
import { PendantIcon } from "./PendantIcon";
import "./NavFabReveal.css";

type AppScreen = "list" | "settings" | "summary" | "master" | "admin" | "detail" | "workshop" | "content";

interface NavFabProps {
  active: AppScreen;
  onNavigate: (screen: AppScreen) => void;
  adminBadges?: ("urgent" | "reminder")[];
  onCreate?: () => void;
}

const NAV_ITEMS: {
  id: "sketchbook" | "content" | "clients" | "brush" | "profile" | "gear";
  label: string;
  screen: AppScreen;
  isActive: (active: AppScreen) => boolean;
  color: string;
}[] = [
  { id: "clients", label: "Клиенты", screen: "list", isActive: (a) => a === "list" || a === "settings" || a === "detail", color: "#72C83E" },
  { id: "sketchbook", label: "Планнер", screen: "summary", isActive: (a) => a === "summary", color: "#D89A24" },
  { id: "profile", label: "Админка", screen: "admin", isActive: (a) => a === "admin", color: "#D8402C" },
  { id: "content", label: "Контент", screen: "content", isActive: (a) => a === "content", color: "#A14ED8" },
  { id: "gear", label: "Личный кабинет", screen: "master", isActive: (a) => a === "master", color: "#C4A169" },
  { id: "brush", label: "Проекты", screen: "workshop", isActive: (a) => a === "workshop", color: "#319FD9" },
];

const ARC_SPAN_DEG = 180;
const FAN_RADIUS_X = 128;
const FAN_RADIUS_Y = 172;
const ITEM_HALF = 31;
const HUB_HALF = ITEM_HALF;
const HUB_SIZE = HUB_HALF * 2;
const ITEM_SIZE = ITEM_HALF * 2;
const DISC_EDGE_RATIO = 29 / 32;
const HUB_RIM = HUB_HALF * DISC_EDGE_RATIO;
const ITEM_RIM = ITEM_HALF * DISC_EDGE_RATIO;

function arcOffset(angleDeg: number, radiusX: number, radiusY: number): { dx: number; dy: number } {
  const angleRad = (angleDeg * Math.PI) / 180;
  return { dx: radiusX * Math.cos(angleRad), dy: -radiusY * Math.sin(angleRad) };
}

function rayLens(x1: number, y1: number, x2: number, y2: number, maxWidth: number): string {
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const px = -(y2 - y1) / len;
  const py = (x2 - x1) / len;
  const w = maxWidth / 2;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  return `M${x1},${y1} Q${mx + px * w},${my + py * w} ${x2},${y2} Q${mx - px * w},${my - py * w} ${x1},${y1}Z`;
}

export function NavFab({ active, onNavigate, adminBadges, onCreate }: NavFabProps) {
  const [open, setOpen] = useState(false);
  const [pressedId, setPressedId] = useState<string | null>(null);
  const releasePress = (id: string) => setPressedId((current) => (current === id ? null : current));
  const current = NAV_ITEMS.find((item) => item.isActive(active)) ?? NAV_ITEMS[0];

  type FanEntry = { kind: "create" } | { kind: "nav"; item: (typeof NAV_ITEMS)[number] };
  const fanEntries: FanEntry[] = onCreate
    ? [
        ...NAV_ITEMS.slice(0, 3).map((item) => ({ kind: "nav" as const, item })),
        { kind: "create" as const },
        ...NAV_ITEMS.slice(3).map((item) => ({ kind: "nav" as const, item })),
      ]
    : NAV_ITEMS.map((item) => ({ kind: "nav" as const, item }));

  const positions = fanEntries.map((_, i) => {
    const angleDeg = fanEntries.length <= 1 ? 90 : ARC_SPAN_DEG - i * (ARC_SPAN_DEG / (fanEntries.length - 1));
    return arcOffset(angleDeg, FAN_RADIUS_X, FAN_RADIUS_Y);
  });
  const rayExtent = Math.max(FAN_RADIUS_X, FAN_RADIUS_Y) + 40;
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
                  <stop offset="0%" stopColor="var(--gold)" stopOpacity={0.08} />
                  <stop offset="55%" stopColor="var(--gold)" stopOpacity={0.46} />
                  <stop offset="100%" stopColor="var(--gold)" stopOpacity={0.9} />
                </linearGradient>
              ))}
            </defs>

            <g mask="url(#navFabRayMask)">
              {positions.map(({ dx, dy }, index) => {
                const len = Math.hypot(dx, dy) || 1;
                const ux = dx / len;
                const uy = dy / len;
                const x1 = ux * HUB_RIM;
                const y1 = uy * HUB_RIM;
                const x2 = dx - ux * ITEM_RIM;
                const y2 = dy - uy * ITEM_RIM;
                return (
                  <g key={index}>
                    <path className="nav-fab__ray-glow" fill={`url(#navFabRayGrad-${index})`} d={rayLens(x1, y1, x2, y2, 2.8)} />
                    <path className="nav-fab__ray" fill={`url(#navFabRayGrad-${index})`} d={rayLens(x1, y1, x2, y2, 0.8)} />
                  </g>
                );
              })}
            </g>

            {positions.map(({ dx, dy }, index) => {
              const len = Math.hypot(dx, dy) || 1;
              const ux = dx / len;
              const uy = dy / len;
              return (
                <g key={index}>
                  <circle className="nav-fab__ray-dot-glow" cx={ux * HUB_RIM} cy={uy * HUB_RIM} r={4.5} />
                  <circle className="nav-fab__ray-dot-glow" cx={dx - ux * ITEM_RIM} cy={dy - uy * ITEM_RIM} r={4.5} />
                </g>
              );
            })}
          </svg>
        )}

        {open &&
          fanEntries.map((entry, index) => {
            const { dx, dy } = positions[index];
            const style = { ["--i" as string]: index, ["--dx" as string]: `${dx}px`, ["--dy" as string]: `${dy}px` };

            if (entry.kind === "create") {
              return (
                <button
                  key="create"
                  type="button"
                  className={pressedId === "create" ? "nav-fab__item nav-fab__item--create nav-fab__item--pressed" : "nav-fab__item nav-fab__item--create"}
                  style={style}
                  aria-label="Создать"
                  onPointerDown={() => setPressedId("create")}
                  onPointerUp={() => releasePress("create")}
                  onPointerCancel={() => releasePress("create")}
                  onPointerLeave={() => releasePress("create")}
                  onClick={() => {
                    onCreate?.();
                    setOpen(false);
                  }}
                >
                  <PendantIcon color="#C9922E" size={ITEM_SIZE} plate>
                    <line x1="0" y1="-6" x2="0" y2="6" strokeWidth="1.8" strokeLinecap="round" />
                    <line x1="-6" y1="0" x2="6" y2="0" strokeWidth="1.8" strokeLinecap="round" />
                  </PendantIcon>
                </button>
              );
            }

            const { item } = entry;
            const isCurrent = item === current;
            const classes = ["nav-fab__item"];
            if (!isCurrent) classes.push("nav-fab__item--dim");
            if (pressedId === item.id) classes.push("nav-fab__item--pressed");

            return (
              <button
                key={item.id}
                type="button"
                className={classes.join(" ")}
                style={style}
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
                <PendantIcon color={item.color} size={ITEM_SIZE} />
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
