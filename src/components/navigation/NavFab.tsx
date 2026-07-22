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

// Single circular button, bottom-right — replaces the full-width bottom bar.
// Closed, it shows the icon for whatever screen is currently open (so you
// always know where you are without expanding it); tapping it fans the
// other three destinations out above it.
export function NavFab({ active, onNavigate, adminBadges, onCreate }: NavFabProps) {
  const [open, setOpen] = useState(false);
  const current = NAV_ITEMS.find((item) => item.isActive(active)) ?? NAV_ITEMS[0];
  const others = NAV_ITEMS.filter((item) => item !== current);
  // «Админка» badges surface on its own circle when the menu is open; when
  // it's closed and Админка isn't the current page, the dot moves to the
  // main button instead, so an outstanding reminder is never invisible.
  const mainBadgeKind = current.screen !== "admin" ? adminBadges?.[0] : undefined;

  return (
    <>
      {open && <div onClick={() => setOpen(false)} aria-hidden="true" style={{ position: "absolute", inset: 0, zIndex: 55 }} />}
      <div className="nav-fab">
        {open && onCreate && (
          <button
            type="button"
            className="nav-fab__item nav-fab__item--create"
            style={{ ["--i" as string]: others.length }}
            aria-label="Создать"
            onClick={() => {
              onCreate();
              setOpen(false);
            }}
          >
            <svg width="26" height="26" viewBox="0 0 20 20" fill="none">
              <line x1="10" y1="3" x2="10" y2="17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <line x1="3" y1="10" x2="17" y2="10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        )}
        {open &&
          others.map((item, i) => {
            const badges = item.screen === "admin" ? adminBadges : undefined;
            return (
              <button
                key={item.id}
                type="button"
                className="nav-fab__item"
                style={{ ["--i" as string]: i }}
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
          <ToolbarIcon name={current.id} size={28} />
          {mainBadgeKind && (
            <span className="nav-fab__badge" style={{ top: -2, right: -2, background: mainBadgeKind === "urgent" ? "var(--urgent)" : "#e0b84a" }} />
          )}
        </button>
      </div>
    </>
  );
}
