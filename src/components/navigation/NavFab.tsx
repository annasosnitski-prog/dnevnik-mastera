import { useState } from "react";
import { ToolbarIcon, type ToolbarIconName } from "./ToolbarIcons";

type AppScreen = "list" | "settings" | "summary" | "master" | "admin" | "detail";

interface NavFabProps {
  active: AppScreen;
  onNavigate: (screen: AppScreen) => void;
  // «Админка» can carry an urgent reminder, a healing check-in, or both at
  // once — every outstanding kind shows, stacked, rather than one hiding
  // the other.
  adminBadges?: ("urgent" | "reminder")[];
  // Contextual «create» action (new client / new note / schedule…) — its
  // meaning depends on which screen is current, decided by the caller.
  // Omit to hide the create button entirely (Мастер has no create action).
  onCreate?: () => void;
}

// Ordered by how often a master actually reaches for each one: Блокнот
// (logged the most), Клиенты (the core roster), Админка (checked daily/
// weekly, not constantly), Мастер (settings — reached for least). «Создать»
// sits above all of these (see the render below) as the one action, not a
// destination.
const NAV_ITEMS: {
  id: ToolbarIconName;
  label: string;
  screen: AppScreen;
  isActive: (active: AppScreen) => boolean;
}[] = [
  { id: "sketchbook", label: "Блокнот", screen: "summary", isActive: (a) => a === "summary" },
  // «Клиенты» stays lit for Настройки and a client's Detail screen too —
  // both are reached from the roster, not a separate section.
  { id: "tasks", label: "Клиенты", screen: "list", isActive: (a) => a === "list" || a === "settings" || a === "detail" },
  { id: "profile", label: "Админка", screen: "admin", isActive: (a) => a === "admin" },
  { id: "gear", label: "Мастер", screen: "master", isActive: (a) => a === "master" },
];

// Angle: split evenly across however many items happen to be open right
// now, so every sector between two neighbouring buttons is the same size
// no matter which destination the current screen hides — a fixed per-item
// angle can't guarantee that (removing one item from a static grid leaves
// a gap twice as wide right next to it). «Создать» is placed in the middle
// of the sequence below, so on every screen it lands at or next to the
// true centre of whatever arc results.
const ARC_SPAN_DEG = 150;

// Radius: fixed per destination — this is where each one's own importance
// shows up. Per Fitts's law, a target reached for constantly should need
// less travel to hit than one opened rarely, so radius follows NAV_ITEMS'
// own frequency ranking (Блокнот > Клиенты > Админка > Мастер): closer for
// the ones used all the time, farther for the rare ones.
//
// DEST_MIN is the shortest ray — Блокнот, right at the edge of a comfortable
// reach from the main button. The other three destinations step outward in
// equal thirds of the way to DEST_MAX (a rule-of-thirds progression reads
// as more deliberately graduated than either bunching them up or spacing
// them by equal absolute amounts). «Создать» then breaks past DEST_MAX by a
// wide, deliberate margin — it's the one CTA, not a fourth destination, so
// it needs to read as a different tier at a glance, not just one more step
// in the same sequence.
const DEST_MIN = 82;
const DEST_MAX = 142;
const DEST_STEP = (DEST_MAX - DEST_MIN) / 3;
const CREATE_RADIUS = 190;

const RADIUS: Record<ToolbarIconName | "create", number> = {
  create: CREATE_RADIUS,
  sketchbook: DEST_MIN,
  tasks: DEST_MIN + DEST_STEP,
  profile: DEST_MIN + DEST_STEP * 2,
  gear: DEST_MAX,
};

function arcOffset(angleDeg: number, radius: number): { dx: number; dy: number } {
  const angleRad = (angleDeg * Math.PI) / 180;
  return { dx: radius * Math.cos(angleRad), dy: -radius * Math.sin(angleRad) };
}

// A tapered quad instead of a fixed-width stroke — narrow at (x1,y1),
// widest at (x2,y2) — so a ray can actually narrow toward the hub rather
// than just fading in opacity. wNear/wFar are each half the width at that
// end, measured perpendicular to the ray's own direction.
function rayShape(x1: number, y1: number, x2: number, y2: number, wNear: number, wFar: number): string {
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const px = -(y2 - y1) / len;
  const py = (x2 - x1) / len;
  const p1 = [x1 + px * wNear, y1 + py * wNear];
  const p2 = [x2 + px * wFar, y2 + py * wFar];
  const p3 = [x2 - px * wFar, y2 - py * wFar];
  const p4 = [x1 - px * wNear, y1 - py * wNear];
  return [p1, p2, p3, p4].map((p) => p.join(",")).join(" ");
}

// Half the main button's / a fan item's own width — a ray is drawn only
// between the two circles' edges, not centre-to-centre, so it reads as
// deliberately meeting each button's outline rather than just being hidden
// underneath it.
const HUB_HALF = 41;
const ITEM_HALF = 31;

// Single circular button, bottom-centre — replaces the full-width bottom bar.
// Closed, it shows the icon for whatever screen is currently open (so you
// always know where you are without expanding it); tapping it fans the
// other destinations out around it in an arc.
export function NavFab({ active, onNavigate, adminBadges, onCreate }: NavFabProps) {
  const [open, setOpen] = useState(false);
  const current = NAV_ITEMS.find((item) => item.isActive(active)) ?? NAV_ITEMS[0];
  const others = NAV_ITEMS.filter((item) => item !== current);
  type FanEntry = { kind: "create" } | { kind: "nav"; item: (typeof NAV_ITEMS)[number] };
  // «Создать» is spliced into the middle of the (frequency-ordered) others,
  // not just appended — see ARC_SPAN_DEG above for why that keeps it near
  // the centre of the arc regardless of which destination is missing.
  const fanEntries: FanEntry[] = onCreate
    ? [
        ...others.slice(0, Math.ceil(others.length / 2)).map((item) => ({ kind: "nav" as const, item })),
        { kind: "create" as const },
        ...others.slice(Math.ceil(others.length / 2)).map((item) => ({ kind: "nav" as const, item })),
      ]
    : others.map((item) => ({ kind: "nav" as const, item }));
  // «Админка» badges surface on its own circle when the menu is open; when
  // it's closed and Админка isn't the current page, the dot moves to the
  // main button instead, so an outstanding reminder is never invisible.
  const mainBadgeKind = current.screen !== "admin" ? adminBadges?.[0] : undefined;

  // Computed once so the connecting rays (drawn first, underneath) and the
  // buttons themselves (drawn on top) agree on exactly the same points.
  const positions = fanEntries.map((entry, i) => {
    const angleDeg = fanEntries.length <= 1 ? 90 : 90 + ARC_SPAN_DEG / 2 - i * (ARC_SPAN_DEG / (fanEntries.length - 1));
    return arcOffset(angleDeg, RADIUS[entry.kind === "create" ? "create" : entry.item.id]);
  });
  const rayExtent = CREATE_RADIUS + 40;

  return (
    <>
      {open && <div onClick={() => setOpen(false)} aria-hidden="true" style={{ position: "absolute", inset: 0, zIndex: 55 }} />}
      <div className="nav-fab">
        {open && (
          <svg
            className="nav-fab__rays"
            aria-hidden="true"
            style={{ left: -rayExtent, top: -rayExtent, width: rayExtent * 2, height: rayExtent * 2 }}
            viewBox={`${-rayExtent} ${-rayExtent} ${rayExtent * 2} ${rayExtent * 2}`}
          >
            {/* A blurred stroke's glow spreads past its own geometry no
                matter how precisely the line itself is trimmed, so trimming
                alone still let it bleed into a button's (transparent)
                interior. This mask hard-clips the whole ray — including its
                blur — to a disc cut out at the hub and at every button, so
                nothing is ever visible past those circles' actual edges. */}
            <mask id="navFabRayMask">
              <rect x={-rayExtent} y={-rayExtent} width={rayExtent * 2} height={rayExtent * 2} fill="white" />
              <circle cx={0} cy={0} r={HUB_HALF} fill="black" />
              {positions.map(({ dx, dy }, i) => (
                <circle key={i} cx={dx} cy={dy} r={ITEM_HALF} fill="black" />
              ))}
            </mask>
            <defs>
              {/* One gradient per ray, running along its own length (hub →
                  button) — dim near the hub, brightest at the button, like
                  a beam losing intensity over distance rather than a flat
                  line with uniform brightness. */}
              {positions.map(({ dx, dy }, i) => {
                const len = Math.hypot(dx, dy) || 1;
                const ux = dx / len;
                const uy = dy / len;
                const x1 = ux * HUB_HALF;
                const y1 = uy * HUB_HALF;
                return (
                  <linearGradient key={i} id={`navFabRayGrad-${i}`} gradientUnits="userSpaceOnUse" x1={x1} y1={y1} x2={dx} y2={dy}>
                    <stop offset="0%" stopColor="var(--gold)" stopOpacity={0.05} />
                    <stop offset="100%" stopColor="var(--gold)" stopOpacity={0.95} />
                  </linearGradient>
                );
              })}
            </defs>
            {/* Each ray is a tapered shape, not a fixed-width stroke — thin
                and faint at the hub, widening and brightening toward the
                button, like natural beam falloff run in reverse. Drawn
                under the mask above so neither the shape nor its blur ever
                crosses into a button's interior. */}
            <g mask="url(#navFabRayMask)">
              {positions.map(({ dx, dy }, i) => {
                const len = Math.hypot(dx, dy) || 1;
                const ux = dx / len;
                const uy = dy / len;
                const x1 = ux * HUB_HALF;
                const y1 = uy * HUB_HALF;
                const x2 = dx - ux * ITEM_HALF;
                const y2 = dy - uy * ITEM_HALF;
                return (
                  <g key={i}>
                    <polygon
                      className="nav-fab__ray-glow"
                      fill={`url(#navFabRayGrad-${i})`}
                      points={rayShape(x1, y1, x2, y2, 0.4, 2.8)}
                    />
                    <polygon
                      className="nav-fab__ray"
                      fill={`url(#navFabRayGrad-${i})`}
                      points={rayShape(x1, y1, x2, y2, 0.2, 0.8)}
                    />
                  </g>
                );
              })}
            </g>
            {/* Each dot's soft halo sits outside the mask, on purpose — a
                point of light spilling a little onto the button it marks
                reads as natural bloom, not the same visual glitch as a
                straight edge poking through (what the mask above still
                prevents for the rays themselves). Only the dot's own crisp
                core is clipped, so its solid disc still doesn't sit on top
                of the button — just the glow around it. */}
            {positions.map(({ dx, dy }, i) => {
              const len = Math.hypot(dx, dy) || 1;
              const ux = dx / len;
              const uy = dy / len;
              const hubX = ux * HUB_HALF;
              const hubY = uy * HUB_HALF;
              const itemX = dx - ux * ITEM_HALF;
              const itemY = dy - uy * ITEM_HALF;
              return (
                <g key={i}>
                  <circle className="nav-fab__ray-dot-glow" cx={hubX} cy={hubY} r={4.5} />
                  <circle className="nav-fab__ray-dot-glow" cx={itemX} cy={itemY} r={4.5} />
                </g>
              );
            })}
            <g mask="url(#navFabRayMask)">
              {positions.map(({ dx, dy }, i) => {
                const len = Math.hypot(dx, dy) || 1;
                const ux = dx / len;
                const uy = dy / len;
                return (
                  <g key={i}>
                    <circle className="nav-fab__ray-dot" cx={ux * HUB_HALF} cy={uy * HUB_HALF} r={2.4} />
                    <circle className="nav-fab__ray-dot" cx={dx - ux * ITEM_HALF} cy={dy - uy * ITEM_HALF} r={2.4} />
                  </g>
                );
              })}
            </g>
          </svg>
        )}
        {open &&
          fanEntries.map((entry, i) => {
            const isCreate = entry.kind === "create";
            const { dx, dy } = positions[i];
            const style = { ["--i" as string]: i, ["--dx" as string]: `${dx}px`, ["--dy" as string]: `${dy}px` };

            if (isCreate) {
              return (
                <button
                  key="create"
                  type="button"
                  className="nav-fab__item nav-fab__item--create"
                  style={style}
                  aria-label="Создать"
                  onClick={() => {
                    onCreate?.();
                    setOpen(false);
                  }}
                >
                  <svg width="26" height="26" viewBox="0 0 20 20" fill="none">
                    <line x1="10" y1="3" x2="10" y2="17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    <line x1="3" y1="10" x2="17" y2="10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </button>
              );
            }

            const { item } = entry;
            const badges = item.screen === "admin" ? adminBadges : undefined;
            return (
              <button
                key={item.id}
                type="button"
                className="nav-fab__item"
                style={style}
                aria-label={item.label}
                onClick={() => {
                  onNavigate(item.screen);
                  setOpen(false);
                }}
              >
                <ToolbarIcon name={item.id} size={28} />
                {badges?.map((kind, bi) => (
                  <span
                    key={kind}
                    className="nav-fab__badge"
                    style={{ top: -2 - bi * 7, right: -2 - bi * 7, background: kind === "urgent" ? "var(--urgent)" : "#e0b84a" }}
                  />
                ))}
              </button>
            );
          })}
        <button
          type="button"
          className="nav-fab__main"
          aria-label={open ? "Закрыть меню" : `Раздел: ${current.label}`}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {/* 37px on an 82px button matches the fan items' own icon-to-button
              ratio (28px on 62px) — proportionate, not just "big enough". */}
          <ToolbarIcon name={current.id} size={37} />
          {mainBadgeKind && (
            <span className="nav-fab__badge" style={{ top: -2, right: -2, background: mainBadgeKind === "urgent" ? "var(--urgent)" : "#e0b84a" }} />
          )}
        </button>
      </div>
    </>
  );
}
