import { useState } from "react";
import { PendantIcon } from "./PendantIcon";
import "./NavFabReveal.css";

type AppScreen = "list" | "settings" | "summary" | "master" | "admin" | "detail" | "workshop" | "content";

interface NavFabProps {
  active: AppScreen;
  onNavigate: (screen: AppScreen) => void;
  adminBadges?: ("urgent" | "reminder")[];
  // Kept in the public contract for existing callers. The radial menu itself
  // now contains destinations only; contextual creation stays on its screen.
  onCreate?: () => void;
}

// INKA palette: deliberately high-chroma jewel colours. PendantIcon adds its
// own dark facets, gold reflections and internal shading, so the source hues
// need to stay brighter and more saturated than flat UI tokens.
const NAV_ITEMS = [
  {
    id: "clients",
    label: "Клиенты",
    screen: "list",
    isActive: (active: AppScreen) => active === "list" || active === "settings" || active === "detail",
    color: "#58E52E",
    durationMs: 2000,
  },
  {
    id: "gear",
    label: "Личный кабинет",
    screen: "master",
    isActive: (active: AppScreen) => active === "master",
    color: "#FFD21A",
    durationMs: 3600,
  },
  {
    id: "content",
    label: "POSTiNKA",
    screen: "content",
    isActive: (active: AppScreen) => active === "content",
    color: "#B83CFF",
    durationMs: 3200,
  },
  {
    id: "brush",
    label: "Проекты",
    screen: "workshop",
    isActive: (active: AppScreen) => active === "workshop",
    color: "#1ABEF2",
    durationMs: 2100,
  },
  {
    id: "sketchbook",
    label: "Заметки",
    screen: "summary",
    isActive: (active: AppScreen) => active === "summary",
    color: "#FF8A00",
    durationMs: 1800,
  },
  {
    id: "profile",
    label: "Админка",
    screen: "admin",
    isActive: (active: AppScreen) => active === "admin",
    color: "#F2383A",
    durationMs: 3800,
  },
] as const;

const FAN_RADIUS_X = 126;
const FAN_RADIUS_Y = 150;
const ITEM_HALF = 31;
const HUB_HALF = ITEM_HALF;
const HUB_SIZE = HUB_HALF * 2;
const ITEM_SIZE = ITEM_HALF * 2;
const DISC_EDGE_RATIO = 29 / 32;
const HUB_RIM = HUB_HALF * DISC_EDGE_RATIO;
const ITEM_RIM = ITEM_HALF * DISC_EDGE_RATIO;

function radialOffset(index: number, count: number): { dx: number; dy: number } {
  // Start at the left. With six destinations, index 3 lands exactly on the
  // right, keeping Клиенты and Проекты on opposite sides.
  const angleDeg = 180 - index * (360 / count);
  const angleRad = (angleDeg * Math.PI) / 180;
  return {
    dx: FAN_RADIUS_X * Math.cos(angleRad),
    dy: -FAN_RADIUS_Y * Math.sin(angleRad),
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

export function NavFab({ active, onNavigate, adminBadges }: NavFabProps) {
  const [open, setOpen] = useState(false);
  const [pressedId, setPressedId] = useState<string | null>(null);
  const releasePress = (id: string) => setPressedId((current) => (current === id ? null : current));
  const current = NAV_ITEMS.find((item) => item.isActive(active)) ?? NAV_ITEMS[0];
  const positions = NAV_ITEMS.map((_, index) => radialOffset(index, NAV_ITEMS.length));
  const rayExtent = Math.max(FAN_RADIUS_X, FAN_RADIUS_Y) + 44;
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
                  <stop offset="0%" stopColor="var(--gold)" stopOpacity={0.05} />
                  <stop offset="52%" stopColor="var(--gold)" stopOpacity={0.34} />
                  <stop offset="100%" stopColor="var(--gold)" stopOpacity={0.86} />
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
                const durationMs = NAV_ITEMS[index].durationMs;

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
          NAV_ITEMS.map((item, index) => {
            const { dx, dy } = positions[index];
            const isCurrent = item === current;
            const classes = ["nav-fab__item", "nav-fab__item--ice"];

            if (!isCurrent) classes.push("nav-fab__item--dim");
            if (pressedId === item.id) classes.push("nav-fab__item--pressed");

            return (
              <button
                key={item.id}
                type="button"
                className={classes.join(" ")}
                style={{
                  ["--dx" as string]: `${dx}px`,
                  ["--dy" as string]: `${dy}px`,
                  ["--travel-duration" as string]: `${item.durationMs}ms`,
                  ["--travel-delay" as string]: `${120 + index * 65}ms`,
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
