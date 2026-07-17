import { ToolbarIcon, type ToolbarIconName } from "./ToolbarIcons";

type AppScreen = "list" | "settings" | "summary" | "master" | "admin";

interface BottomToolbarProps {
  active: AppScreen;
  onNavigate: (screen: AppScreen) => void;
  isLight: boolean;
  // «Админка» can carry an urgent reminder, a healing check-in, or both at
  // once — every outstanding kind shows, stacked, rather than one hiding
  // the other.
  adminBadges?: ("urgent" | "reminder")[];
}

const NAV_ITEMS: {
  id: ToolbarIconName;
  label: string;
  screen: AppScreen;
  isActive: (active: AppScreen) => boolean;
}[] = [
  // «Клиенты» stays lit for Настройки too — reached from the home area, not
  // a separate section.
  { id: "tasks", label: "Клиенты", screen: "list", isActive: (a) => a === "list" || a === "settings" },
  { id: "sketchbook", label: "Блокнот", screen: "summary", isActive: (a) => a === "summary" },
  { id: "dashboard", label: "Админка", screen: "admin", isActive: (a) => a === "admin" },
  { id: "profile", label: "Мастер", screen: "master", isActive: (a) => a === "master" },
];

export function BottomToolbar({ active, onNavigate, isLight, adminBadges }: BottomToolbarProps) {
  const variant = isLight ? "naturalist" : "jewelry";
  return (
    <nav className="bottom-toolbar" aria-label="Основная навигация">
      <div className="bottom-toolbar__content">
        {NAV_ITEMS.map((item) => {
          const isActive = item.isActive(active);
          const badges = item.id === "dashboard" ? adminBadges : undefined;
          return (
            <button
              key={item.id}
              type="button"
              className="bottom-toolbar__button"
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
              onClick={() => onNavigate(item.screen)}
            >
              <ToolbarIcon name={item.id} variant={variant} size={30} className="bottom-toolbar__icon" />
              {badges?.map((kind, i) => (
                <span
                  key={kind}
                  style={{
                    position: "absolute",
                    top: 4 - i * 7,
                    right: `calc(50% - 19px - ${i * 7}px)`,
                    minWidth: 13,
                    height: 13,
                    borderRadius: "50%",
                    background: kind === "urgent" ? "#e0665a" : "#e0b84a",
                    color: "#1a1410",
                    fontSize: 9,
                    fontWeight: 700,
                    lineHeight: "13px",
                    textAlign: "center",
                    boxShadow: "0 0 0 1.5px var(--bg)",
                    zIndex: badges.length - i,
                  }}
                >
                  !
                </span>
              ))}
            </button>
          );
        })}
      </div>
      <div className="bottom-toolbar__safe-area" aria-hidden="true" />
    </nav>
  );
}
