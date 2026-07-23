import { useState } from "react";
import { ToolbarIcon } from "./ToolbarIcons";

type AppScreen = "list" | "settings" | "summary" | "master" | "admin" | "detail" | "workshop";

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
// (logged the most), Клиенты (the core roster), Мастерская (creative work,
// reached for often but not constantly), Админка (checked daily/weekly),
// Мастер (settings — reached for least). «Создать» sits above all of these
// (see the render below) as the one action, not a destination.
const NAV_ITEMS: {
  id: "sketchbook" | "clients" | "brush" | "profile" | "gear";
  label: string;
  screen: AppScreen;
  isActive: (active: AppScreen) => boolean;
}[] = [
  { id: "sketchbook", label: "Планнер", screen: "summary", isActive: (a) => a === "summary" },
  // «Клиенты» stays lit for Настройки and a client's Detail screen too —
  // both are reached from the roster, not a separate section.
  { id: "clients", label: "Клиенты", screen: "list", isActive: (a) => a === "list" || a === "settings" || a === "detail" },
  { id: "brush", label: "Мастерская", screen: "workshop", isActive: (a) => a === "workshop" },
  { id: "profile", label: "Админка", screen: "admin", isActive: (a) => a === "admin" },
  { id: "gear", label: "Мастер", screen: "master", isActive: (a) => a === "master" },
];

// Angle: split across however many items happen to be open right now — see
// GAP_WEIGHT below for how that split isn't perfectly even. «Создать» is
// placed in the middle of the sequence below, so on every screen it lands
// at or next to the true centre of whatever arc results.
const ARC_SPAN_DEG = 150;

// Each gap between neighbouring fan slots gets a weight, not a fixed size —
// slots either side of «Создать» sit closer together (it's a big circle at
// a big radius, so it already has plenty of clearance from its neighbours),
// freeing up angle for the two destination-to-destination gaps instead.
// Those are the tight ones: their radii sit closest to the hub, where the
// same angular gap covers far less physical distance — widening exactly
// those two gaps is what lets DEST_MIN/TIER_2 below sit close together
// without the two circles' edges overlapping.
const GAP_WEIGHT_OUTER = 1.5;
const GAP_WEIGHT_INNER = 1;
// The Планнер↔Клиенты gap specifically gets an even bigger share, taken from
// the Клиенты↔Мастерская gap next to it (their sum still keeps every later
// slot — Мастерская, «Создать», Админка, Мастер — at the same angle as
// before). That tilts Клиенты's own position toward vertical, so its height
// reads as its own distinct step between «Создать» and the Мастерская/
// Админка pair, rather than blending into their row (see DEST_TIER_2 below).
const GAP_WEIGHT_SKETCHBOOK_CLIENTS = 2.6;
const GAP_WEIGHT_CLIENTS_BRUSH = 1;

// Radius: fixed per destination — this is where each one's own importance
// shows up. Per Fitts's law, a target reached for constantly should need
// less travel to hit than one opened rarely, so radius follows NAV_ITEMS'
// own frequency ranking (Блокнот > Клиенты > Админка > Мастер): closer for
// the ones used all the time, farther for the rare ones.
//
// DEST_MIN sits right outside the hub — as tight as it can get without the
// two circles' own edges touching (HUB_HALF + ITEM_HALF + a small gap for
// the ray itself to read as a distinct line). DEST_MAX is the safe ceiling
// for the two outermost fan slots (±15° off horizontal — see ARC_SPAN_DEG)
// without a button's own edge crossing off-screen on a narrow (~360px)
// phone; pushing it further risks clipping a destination clean off the
// visible area, which is worse for accessibility than a long reach ever is.
// Buttons must never overlap each other — only their rays are allowed to
// cross — so every tier here is checked against its actual neighbour's
// angle (via GAP_WEIGHT above) to keep a real gap between the two circles'
// edges, not just their centres. «Создать» then breaks past DEST_MAX by a
// wide, deliberate margin — it's the one CTA, not a fourth destination, so
// it needs to read as a different tier at a glance, not just one more step
// in the same sequence.
// With 5 destinations (was 4), Планнер/Клиенты/Мастерская all sit before
// «Создать» in the fan sequence — three items sharing one outer-gap chain
// instead of two — so the same-angle overlap constraint now binds on that
// whole chain, not just the closest pair. Клиенты and Мастерская aren't
// visually adjacent to Админка/Мастер (Create's own big circle sits between
// the two halves), so only same-side neighbours need checking against each
// other.
// Клиенты sits further out than strict frequency order would suggest — a
// deliberate exception so its own ray reads as clearly longer/shorter than
// its two neighbours (Планнер, Мастерская) rather than blending into a
// nearly-even row; the wide outer-gap weight above still keeps it clear of
// both.
const DEST_MIN = 68;
const DEST_TIER_2 = 170;
const DEST_TIER_3 = 128;
const DEST_TIER_4 = 136;
const DEST_MAX = 146;
const CREATE_RADIUS = 205;

// Explicit key set (not derived from ToolbarIconName) — the main button
// below always shows the $ icon regardless of the active screen, so
// "tasks" no longer names a fan destination and doesn't need a radius here.
const RADIUS: Record<"sketchbook" | "clients" | "brush" | "profile" | "gear" | "create", number> = {
  create: CREATE_RADIUS,
  sketchbook: DEST_MIN,
  clients: DEST_TIER_2,
  brush: DEST_TIER_3,
  profile: DEST_TIER_4,
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
const HUB_HALF = 27;
const ITEM_HALF = 31;
const HUB_SIZE = HUB_HALF * 2;
const ITEM_SIZE = ITEM_HALF * 2;

// Every other icon has real margin baked into its own viewBox, so rendering
// it at 2/3 of the button's height already reads as comfortably inset. The
// «Мастерская» brush glyph fills its own viewBox corner-to-corner (tip to
// tip, on the diagonal), so the same 2/3-of-height size instead makes its
// diagonal span nearly the whole button. Sized down separately so that
// diagonal — not its height — comes out to 2/3 of the button's diameter.
const BRUSH_ICON_SIZE = Math.round((ITEM_SIZE * 2) / 3 / Math.SQRT2);

// Single circular button, bottom-centre — replaces the full-width bottom bar.
// Closed, it shows the icon for whatever screen is currently open (so you
// always know where you are without expanding it); tapping it fans the
// other destinations out around it in an arc.
export function NavFab({ active, onNavigate, adminBadges, onCreate }: NavFabProps) {
  const [open, setOpen] = useState(false);
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

  // Each gap's weight — smaller (GAP_WEIGHT_INNER) on either side of
  // «Создать», larger (GAP_WEIGHT_OUTER) between two destinations — then
  // normalised so the weights sum to the full ARC_SPAN_DEG. See GAP_WEIGHT
  // above for why: it's what gives the destination pairs room to spread
  // their radii apart without the circles themselves overlapping. The
  // Планнер↔Клиенты / Клиенты↔Мастерская pair gets its own special-cased
  // split (by id, not just create-adjacency) so Клиенты's own angle can
  // tilt toward vertical without shifting anything past Мастерская — see
  // GAP_WEIGHT_SKETCHBOOK_CLIENTS above.
  const idOf = (e: FanEntry) => (e.kind === "nav" ? e.item.id : null);
  const gapWeights = fanEntries.slice(1).map((_, i) => {
    const a = fanEntries[i];
    const b = fanEntries[i + 1];
    if (a.kind === "create" || b.kind === "create") return GAP_WEIGHT_INNER;
    const aId = idOf(a);
    const bId = idOf(b);
    if ((aId === "sketchbook" && bId === "clients") || (aId === "clients" && bId === "sketchbook")) {
      return GAP_WEIGHT_SKETCHBOOK_CLIENTS;
    }
    if ((aId === "clients" && bId === "brush") || (aId === "brush" && bId === "clients")) {
      return GAP_WEIGHT_CLIENTS_BRUSH;
    }
    return GAP_WEIGHT_OUTER;
  });
  const totalWeight = gapWeights.reduce((sum, w) => sum + w, 0) || 1;
  // cumulativeWeight[i] = the summed weight of every gap before entry i, so
  // cumulativeWeight[0] is always 0 (nothing precedes the first entry).
  const cumulativeWeight: number[] = [0];
  gapWeights.forEach((w) => cumulativeWeight.push(cumulativeWeight[cumulativeWeight.length - 1] + w));

  // Computed once so the connecting rays (drawn first, underneath) and the
  // buttons themselves (drawn on top) agree on exactly the same points.
  const positions = fanEntries.map((entry, i) => {
    const angleDeg = fanEntries.length <= 1 ? 90 : 90 + ARC_SPAN_DEG / 2 - cumulativeWeight[i] * (ARC_SPAN_DEG / totalWeight);
    return arcOffset(angleDeg, RADIUS[entry.kind === "create" ? "create" : entry.item.id]);
  });
  const rayExtent = CREATE_RADIUS + 40;

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
            const isCurrent = item === current;
            return (
              <button
                key={item.id}
                type="button"
                className={isCurrent ? "nav-fab__item nav-fab__item--current" : "nav-fab__item"}
                style={style}
                aria-label={item.label}
                onClick={() => {
                  onNavigate(item.screen);
                  setOpen(false);
                }}
              >
                {/* Icons fill 2/3 of their own button's height, matching the
                    hub's own icon-to-button ratio — except the brush, sized
                    by its own diagonal instead (see BRUSH_ICON_SIZE above). */}
                <ToolbarIcon name={item.id} size={item.id === "brush" ? BRUSH_ICON_SIZE : Math.round((ITEM_SIZE * 2) / 3)} />
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
          {/* The hub always shows the $ sign — a fixed identity, not a
              current-screen indicator — regardless of which of the four
              destinations is active. 2/3 of the button's own height
              (HUB_HALF * 2), matching the fan items' own icon-to-button
              ratio. */}
          <ToolbarIcon name="tasks" size={Math.round((HUB_SIZE * 2) / 3)} />
          {mainBadgeKind && (
            <span className="nav-fab__badge" style={{ top: -2, right: -2, background: mainBadgeKind === "urgent" ? "var(--urgent)" : "#e0b84a" }} />
          )}
        </button>
      </div>
    </>
  );
}
