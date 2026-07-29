import type { SVGProps } from "react";

export type ToolbarIconName =
  | "tasks"
  | "sketchbook"
  | "profile"
  | "gear"
  | "settingsGear"
  | "clients"
  | "brush"
  | "content";

interface ToolbarIconProps extends SVGProps<SVGSVGElement> {
  name: ToolbarIconName;
  size?: number;
}

const sharedProps = {
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

// Filled (not outlined) like the profile icon below — the teeth and rim are
// one solid shape, with the centre hole punched out via the evenodd fill
// rule rather than drawn as a separate stroked ring. Used for the in-screen
// «Настройки» button on the Мастер dashboard (moved there once «gear» itself
// took on a distinct icon for the NavFab destination below).
function JewelrySettingsGearIcon(
  props: SVGProps<SVGSVGElement>,
) {
  return (
    <svg viewBox="0 0 32 32" fill="currentColor" stroke="none" {...props}>
      <path
        fillRule="evenodd"
        d="M14.010 5.996 L14.458 3.797 L14.220 1.912 L17.780 1.912 L17.542 3.797 L17.990 5.996 A10.200 10.200 0 0 1 21.667 7.519 L23.539 6.281 L24.703 4.780 L27.220 7.297 L25.719 8.461 L24.481 10.333 A10.200 10.200 0 0 1 26.004 14.010 L28.203 14.458 L30.088 14.220 L30.088 17.780 L28.203 17.542 L26.004 17.990 A10.200 10.200 0 0 1 24.481 21.667 L25.719 23.539 L27.220 24.703 L24.703 27.220 L23.539 25.719 L21.667 24.481 A10.200 10.200 0 0 1 17.990 26.004 L17.542 28.203 L17.780 30.088 L14.220 30.088 L14.458 28.203 L14.010 26.004 A10.200 10.200 0 0 1 10.333 24.481 L8.461 25.719 L7.297 27.220 L4.780 24.703 L6.281 23.539 L7.519 21.667 A10.200 10.200 0 0 1 5.996 17.990 L3.797 17.542 L1.912 17.780 L1.912 14.220 L3.797 14.458 L5.996 14.010 A10.200 10.200 0 0 1 7.519 10.333 L6.281 8.461 L4.780 7.297 L7.297 4.780 L8.461 6.281 L10.333 7.519 A10.200 10.200 0 0 1 14.010 5.996 Z M21.100 16 A5.1 5.1 0 1 1 10.900 16 A5.1 5.1 0 1 1 21.100 16 Z"
      />
    </svg>
  );
}

// A classic key for «Личный кабинет»: round bow, long diagonal shaft and
// two teeth. The open centre keeps the silhouette readable at toolbar size.
function JewelryKeyIcon(
  props: SVGProps<SVGSVGElement>,
) {
  return (
    <svg viewBox="0 0 32 32" {...sharedProps} {...props}>
      <circle cx="9.5" cy="9.5" r="5.25" strokeWidth="2" />
      <circle cx="9.5" cy="9.5" r="1.35" fill="currentColor" stroke="none" />
      <path d="M13.2 13.2 27 27" strokeWidth="2.6" />
      <path d="m20.2 20.2 3-3M23.4 23.4l3-3" strokeWidth="2.2" />
    </svg>
  );
}

function JewelryTasksIcon(
  props: SVGProps<SVGSVGElement>,
) {
  return (
    <svg viewBox="0 0 32 32" {...sharedProps} strokeLinecap="butt" {...props}>
      <path
        strokeWidth="2.6"
        d="M20.75 8.25c-1.2-1.15-3-1.75-4.8-1.75-3 0-5.45 1.65-5.45 4.35 0 2.45 2.05 3.55 5.55 4.35 3.55.8 5.45 1.95 5.45 4.7 0 2.85-2.45 4.65-5.65 4.65-2.15 0-4.3-.75-5.85-2.2"
      />
      <path strokeWidth="2.6" d="M16 3.75v24.5" />
    </svg>
  );
}

// Filled page, symmetric on both axes — plain rectangle (no folded corner),
// with the text lines cut out of the fill via the evenodd rule so they read
// as gaps showing whatever is behind the icon, rather than strokes on top.
function JewelrySketchbookIcon(
  props: SVGProps<SVGSVGElement>,
) {
  return (
    <svg viewBox="0 0 32 32" fill="currentColor" stroke="none" {...props}>
      <path
        fillRule="evenodd"
        d="M8 5H24V27H8Z
           M11 9.45H21V10.55H11Z
           M11 13.45H21V14.55H11Z
           M11 17.45H21V18.55H11Z
           M11 21.45H21V22.55H11Z"
      />
    </svg>
  );
}

// One person for «Клиенты» — a single clear client rather than a group.
function JewelryPersonIcon(
  props: SVGProps<SVGSVGElement>,
) {
  return (
    <svg viewBox="0 0 32 32" fill="currentColor" stroke="none" {...props}>
      <circle cx="16" cy="10.5" r="4.5" />
      <path d="M6.8 27c.55-6.05 3.75-9.1 9.2-9.1s8.65 3.05 9.2 9.1H6.8Z" />
    </svg>
  );
}

// Coil tattoo machine for «Админка», based on the supplied silhouette:
// twin coils inside a rigid frame, circular contact, grip and exposed needle.
function JewelryTattooMachineIcon(
  props: SVGProps<SVGSVGElement>,
) {
  return (
    <svg viewBox="0 0 32 32" fill="currentColor" stroke="none" {...props}>
      <g transform="translate(2 2) scale(.875) rotate(45 16 16)">
        <path fillRule="evenodd" d="M4 4h24v4h-2v12h-4V8H10v12H6V8H4V4Zm17-1a4 4 0 1 1 0 8 4 4 0 1 1 0-8Zm0 2.4a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 1 0 0-3.2Z" />
        <rect x="8" y="9" width="7" height="10" rx="2.2" />
        <rect x="17" y="9" width="7" height="10" rx="2.2" />
        <rect x="12" y="17" width="8" height="10" rx="2.5" />
        <path d="M15 25h2v5h-2zM14.5 29h3L16 32z" />
      </g>
    </svg>
  );
}

// Native SVG atom for «Проекты», with the same colour and visual weight as
// the rest of the toolbar instead of a platform-dependent emoji glyph.
function JewelryAtomIcon(
  props: SVGProps<SVGSVGElement>,
) {
  return (
    <svg viewBox="0 0 32 32" {...sharedProps} {...props}>
      <ellipse cx="16" cy="16" rx="12" ry="4.8" strokeWidth="1.5" />
      <ellipse cx="16" cy="16" rx="12" ry="4.8" strokeWidth="1.5" transform="rotate(60 16 16)" />
      <ellipse cx="16" cy="16" rx="12" ry="4.8" strokeWidth="1.5" transform="rotate(120 16 16)" />
      <circle cx="16" cy="16" r="2.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

// Four-point sparkle — the mark used for content/generation elsewhere,
// distinct from the other five icons' silhouettes. Points/controls
// computed by rotating one base segment by 90° three times, so the shape
// is exactly symmetric around its own centre (32×32 viewBox, centre 16,16)
// rather than eyeballed.
function JewelryContentIcon(
  props: SVGProps<SVGSVGElement>,
) {
  return (
    <svg viewBox="0 0 32 32" fill="currentColor" stroke="none" {...props}>
      <path d="M16 4 C17 12 20 15 28 16 C20 17 17 20 16 28 C15 20 12 17 4 16 C12 15 15 12 16 4 Z" />
    </svg>
  );
}

export function ToolbarIcon({
  name,
  size = 30,
  className,
  ...props
}: ToolbarIconProps) {
  const iconProps: SVGProps<SVGSVGElement> = {
    width: size,
    height: size,
    className,
    "aria-hidden": true,
    focusable: false,
    ...props,
  };

  switch (name) {
    case "tasks":
      return <JewelryTasksIcon {...iconProps} />;
    case "sketchbook":
      return <JewelrySketchbookIcon {...iconProps} />;
    case "profile":
      return <JewelryTattooMachineIcon {...iconProps} />;
    case "gear":
      return <JewelryKeyIcon {...iconProps} />;
    case "settingsGear":
      return <JewelrySettingsGearIcon {...iconProps} />;
    case "clients":
      return <JewelryPersonIcon {...iconProps} />;
    case "brush":
      return <JewelryAtomIcon {...iconProps} />;
    case "content":
      return <JewelryContentIcon {...iconProps} />;
  }
}
