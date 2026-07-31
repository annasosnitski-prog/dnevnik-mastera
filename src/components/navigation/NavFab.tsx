import { useState } from "react";
import { PendantIcon } from "./PendantIcon";

type AppScreen = "list" | "settings" | "summary" | "master" | "admin" | "detail" | "workshop" | "content";

interface NavFabProps {
  active: AppScreen;
  onNavigate: (screen: AppScreen) => void;
  // «Админка» can carry an urgent reminder, a healing check-in, or both at
  // once — every outstanding kind shows, stacked, rather than one hiding
  // the other.
  adminBadges?: ("urgent" | "reminder")[];
  // Contextual «create» action (new client / new note / schedule…) — its
  // meaning depends on which screen is current, decided by the caller.
  // Omit to hide the create button entirely (Личный кабинет has no create action).
  onCreate?: () => void;
}

// Clockwise order of destinations in the open semicircle. Internal ids and
// screens stay stable so the renamed entries keep their existing routes.
// Each destination is its own gem colour — the same jewel language as the
// client tab pendants, so the whole app reads as one collection.
const NAV_ITEMS: {
  id: "sketchbook" | "content" | "clients" | "brush" | "profile" | "gear";
  label: string;
  screen: AppScreen;
  isActive: (active: AppScreen) => boolean;
  color: string;
}[] = [
  { id: "gear", label: "Личный кабинет", screen: "master", isActive: (a) => a === "master", color: "#DD7A2B" },
  // «Клиенты» stays lit for Настройки and a client's Detail screen too —
  // both are reached from the roster, not a separate section.
  { id: "clients", label: "Клиенты", screen: "list", isActive: (a) => a === "list" || a === "settings" || a === "detail", color: "#72C83E" },
  { id: "brush", label: "Проекты", screen: "workshop", isActive: (a) => a === "workshop", color: "#319FD9" },
  { id: "profile", label: "Админка", screen: "admin", isActive: (a) => a === "admin", color: "#D8402C" },
  { id: "sketchbook", label: "Планнер", screen: "summary", isActive: (a) => a === "summary", color: "#D89A24" },
  { id: "content", label: "Контент", screen: "content", isActive: (a) => a === "content", color: "#A14ED8" },
];

// The hub's own fixed pendant colour — shares the "Админка" red rather than
// getting a colour of its own, per the requested mapping.
const HUB_COLOR = "#D8402C";

// The open toolbar is a half-ellipse, not a true semicircle: the horizontal
// radius keeps the sides fitting a 320px-wide viewport edge to edge (seven
// 62px buttons at 30° apart), but the vertical radius is taller, so the
// centre rays reach higher and the ones toward the ends taper evenly back
// down to that same horizontal radius rather than all sitting at one
// uniform distance from the hub.
const ARC_SPAN_DEG = 180;
const FAN_RADIUS_X = 128;
const FAN_RADIUS_Y = 172;

function arcOffset(angleDeg: number, radiusX: number, radiusY: number): { dx: number; dy: number } {
  const angleRad = (angleDeg * Math.PI) / 180;
  return { dx: radiusX * Math.cos(angleRad), dy: -radiusY * Math.sin(angleRad) };
}

// A lens, not a fixed-width stroke — tapered to an actual point at both
// (x1,y1) and (x2,y2) rather than just fading in opacity, widest at the
// midpoint. So a ray visually vanishes right at the dot marking each end,
// however closely you look, instead of meeting it as a flat-capped wedge.
function rayLens(x1: number, y1: number, x2: number, y2: number, maxWidth: number): string {
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const px = -(y2 - y1) / len;
  const py = (x2 - x1) / len;
  const w = maxWidth / 2;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  return `M${x1},${y1} Q${mx + px * w},${my + py * w} ${x2},${y2} Q${mx - px * w},${my - py * w} ${x1},${y1}Z`;
}

// Half the main button's / a fan item's own width — used to size the
// PendantIcon itself. The hub matches the fan items' own size.
const ITEM_HALF = 31;
const HUB_HALF = ITEM_HALF;
const HUB_SIZE = HUB_HALF * 2;
const ITEM_SIZE = ITEM_HALF * 2;
// PendantIcon's own gold disc doesn't quite fill its full pixel box (its
// outerR is 29 out of a 64-wide viewBox, i.e. ~90.6% of the half-width) —
// a ray/dot meeting HUB_HALF/ITEM_HALF itself would float in the small
// margin outside the actual rim instead of sitting flush against it.
const DISC_EDGE_RATIO = 29 / 32;
const HUB_RIM = HUB_HALF * DISC_EDGE_RATIO;
const ITEM_RIM = ITEM_HALF * DISC_EDGE_RATIO;

// Single circular button, bottom-centre — replaces the full-width bottom bar.
// Closed, it shows the icon for whatever screen is currently open (so you
// always know where you are without expanding it); tapping it fans the
// other destinations out around it in an arc.
export function NavFab({ active, onNavigate, adminBadges, onCreate }: NavFabProps) {
  const [open, setOpen] = useState(false);
  // The press-down feel (whole button scale + stone sinking into its
  // setting) is tracked explicitly rather than via CSS :active — :active
  // is known to stick past release on touch devices, which would leave
  // whichever button you just tapped to navigate looking permanently
  // smaller/sunken the next time the fan opens.
  const [pressedId, setPressedId] = useState<string | null>(null);
  const releasePress = (id: string) => setPressedId((p) => (p === id ? null : p));
  const current = NAV_ITEMS.find((item) => item.isActive(active)) ?? NAV_ITEMS[0];
  type FanEntry = { kind: "create" } | { kind: "nav"; item: (typeof NAV_ITEMS)[number] };
  // «Создать» is spliced into the middle of the (frequency-ordered) others,
  // not just appended — see ARC_SPAN_DEG above for why that keeps it near
  // the centre of the arc regardless of which destination is missing.
  const fanEntries: FanEntry[] = onCreate
    ? [
        ...NAV_ITEMS.slice(0, Math.ceil(NAV_ITEMS.length / 2)).map((item) => ({ kind: "nav" as const, item })),
        { kind: "create" as const },
        ...NAV_ITEMS.slice(Math.ceil(NAV_ITEMS.length / 2)).map((item) => ({ kind: "nav" as const, item })),
      ]
    : NAV_ITEMS.map((item) => ({ kind: "nav" as const, item }));
  // «Админка» badges surface on its own circle when the menu is open; when
  // it's closed and Админка isn't the current page, the dot moves to the
  // main button instead, so an outstanding reminder is never invisible.
  const mainBadgeKind = current.screen !== "admin" ? adminBadges?.[0] : undefined;
  const mainClasses = ["nav-fab__main"];
  if (pressedId === "hub") mainClasses.push("nav-fab__main--pressed");

  // Computed once so the connecting rays (drawn first, underneath) and the
  // buttons themselves (drawn on top) agree on exactly the same points. The
  // first and last entries sit at 180°/0°; the rest split the arc evenly.
  const positions = fanEntries.map((_, i) => {
    const angleDeg = fanEntries.length <= 1 ? 90 : ARC_SPAN_DEG - i * (ARC_SPAN_DEG / (fanEntries.length - 1));
    return arcOffset(angleDeg, FAN_RADIUS_X, FAN_RADIUS_Y);
  });
  const rayExtent = Math.max(FAN_RADIUS_X, FAN_RADIUS_Y) + 40;

  return (
    <>
      {open && (
        <div
          className="nav-fab__scrim"
          onClick={() => setOpen(false)}
          aria-hidden="true"
          style={{ position: "absolute", inset: 0, zIndex: 55 }}
        />
      )}
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
              <circle cx={0} cy={0} r={HUB_RIM} fill="black" />
              {positions.map(({ dx, dy }, i) => (
                <circle key={i} cx={dx} cy={dy} r={ITEM_RIM} fill="black" />
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
                const x1 = ux * HUB_RIM;
                const y1 = uy * HUB_RIM;
                return (
                  <linearGradient key={i} id={`navFabRayGrad-${i}`} gradientUnits="userSpaceOnUse" x1={x1} y1={y1} x2={dx} y2={dy}>
                    <stop offset="0%" stopColor="var(--gold)" stopOpacity={0.05} />
                    <stop offset="100%" stopColor="var(--gold)" stopOpacity={0.95} />
                  </linearGradient>
                );
              })}
            </defs>
            {/* Each ray is a lens, not a fixed-width stroke — tapered to a
                point at both the hub and the button, widest at the middle,
                like natural beam falloff run in both directions. Drawn
                under the mask above so neither the shape nor its blur ever
                crosses into a button's interior. */}
            <g mask="url(#navFabRayMask)">
              {positions.map(({ dx, dy }, i) => {
                const len = Math.hypot(dx, dy) || 1;
                const ux = dx / len;
                const uy = dy / len;
                const x1 = ux * HUB_RIM;
                const y1 = uy * HUB_RIM;
                const x2 = dx - ux * ITEM_RIM;
                const y2 = dy - uy * ITEM_RIM;
                return (
                  <g key={i}>
                    <path className="nav-fab__ray-glow" fill={`url(#navFabRayGrad-${i})`} d={rayLens(x1, y1, x2, y2, 2.8)} />
                    <path className="nav-fab__ray" fill={`url(#navFabRayGrad-${i})`} d={rayLens(x1, y1, x2, y2, 0.8)} />
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
              const hubX = ux * HUB_RIM;
              const hubY = uy * HUB_RIM;
              const itemX = dx - ux * ITEM_RIM;
              const itemY = dy - uy * ITEM_RIM;
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
                    <circle className="nav-fab__ray-dot" cx={ux * HUB_RIM} cy={uy * HUB_RIM} r={2.4} />
                    <circle className="nav-fab__ray-dot" cx={dx - ux * ITEM_RIM} cy={dy - uy * ITEM_RIM} r={2.4} />
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
                  className={
                    pressedId === "create" ? "nav-fab__item nav-fab__item--create nav-fab__item--pressed" : "nav-fab__item nav-fab__item--create"
                  }
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
                  {/* Same gold rim + pavé halo as every other pendant, but a
                      plain gold plate at the centre instead of a coloured
                      stone — this marks an action, not a destination. */}
                  <PendantIcon color="#C9922E" size={ITEM_SIZE} plate>
                    <line x1="0" y1="-6" x2="0" y2="6" strokeWidth="1.8" strokeLinecap="round" />
                    <line x1="-6" y1="0" x2="6" y2="0" strokeWidth="1.8" strokeLinecap="round" />
                  </PendantIcon>
                </button>
              );
            }

            const { item } = entry;
            const badges = item.screen === "admin" ? adminBadges : undefined;
            const isCurrent = item === current;
            const itemClasses = ["nav-fab__item"];
            if (!isCurrent) itemClasses.push("nav-fab__item--dim");
            if (pressedId === item.id) itemClasses.push("nav-fab__item--pressed");
            return (
              <button
                key={item.id}
                type="button"
                className={itemClasses.join(" ")}
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
                {/* Each destination is its own faceted gem colour — no
                    glyph, the cut itself is the detail (see PendantIcon).
                    The one matching the page you're on dims the rest and
                    gets the gold underline. */}
                <PendantIcon color={item.color} size={ITEM_SIZE} />
                {isCurrent && (
                  // A straight bar, not a CSS border-bottom — on a fully
                  // rounded button, border-radius folds a lone border-bottom
                  // into a thin arc that all but disappears, unlike the
                  // client-card tab's own plainly visible underline.
                  <span aria-hidden="true" className="nav-fab__item-underline" />
                )}
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
          className={mainClasses.join(" ")}
          aria-label={open ? "Закрыть меню" : `Раздел: ${current.label}`}
          aria-expanded={open}
          onPointerDown={() => setPressedId("hub")}
          onPointerUp={() => releasePress("hub")}
          onPointerCancel={() => releasePress("hub")}
          onPointerLeave={() => releasePress("hub")}
          onClick={() => setOpen((v) => !v)}
        >
          {/* The hub always shows its own red faceted stone — a fixed
              identity, not a current-screen indicator — regardless of which
              destination is active. */}
          <PendantIcon color={HUB_COLOR} size={HUB_SIZE} />
          {mainBadgeKind && (
            <span className="nav-fab__badge" style={{ top: -2, right: -2, background: mainBadgeKind === "urgent" ? "var(--urgent)" : "#e0b84a" }} />
          )}
        </button>
      </div>
    </>
  );
}
