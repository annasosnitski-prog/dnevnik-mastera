import type { SVGProps } from "react";

export type ToolbarIconName =
  | "tasks"
  | "sketchbook"
  | "profile"
  | "gear"
  | "settingsGear"
  | "clients"
  | "brush";

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

// An open-end wrench on the diagonal — reads as "tools/setup" at a glance,
// distinct from the settings-gear now living inside the Мастер screen itself.
// The source path traces the wrench as a thin outline (a stroke turned into
// a fill), so filling it alone reads as a hairline glyph next to the bold
// solid icons above; a matching stroke bulks up the same outline to a
// comparable visual weight without redrawing the shape.
function JewelryMasterIcon(
  props: SVGProps<SVGSVGElement>,
) {
  return (
    <svg viewBox="0 0 329.497 329.497" fill="currentColor" stroke="currentColor" strokeWidth={16} {...props}>
      <path d="M77.713,328.151c-9.955,0-19.718-1.896-29.024-5.649l-9.01-3.638l42.301-42.301c3.946-3.94,6.118-9.19,6.118-14.762 c0-5.585-2.172-10.823-6.118-14.775c-7.899-7.899-21.646-7.899-29.544,0L9.897,289.577l-3.728-8.76 C2.076,271.19,0,260.984,0,250.45c0-42.854,34.866-77.713,77.713-77.713c9.158,0,18.092,1.581,26.626,4.704l73.774-73.78 c-2.68-7.982-4.036-16.241-4.036-24.608c0-42.848,34.866-77.707,77.713-77.707c10.257,0,20.245,1.986,29.692,5.9l8.888,3.683 l-42.854,42.848c-3.946,3.946-6.118,9.197-6.118,14.775s2.172,10.829,6.118,14.775c7.899,7.886,21.658,7.886,29.544,0 l42.848-42.848l3.683,8.882c3.914,9.46,5.906,19.448,5.906,29.692c0,42.848-34.859,77.707-77.707,77.707 c-9.158,0-18.092-1.581-26.633-4.704l-73.78,73.78c2.686,7.982,4.042,16.241,4.042,24.615 C155.42,293.292,120.561,328.151,77.713,328.151z M63.099,313.613c4.782,1.118,9.672,1.684,14.608,1.684 c35.759,0,64.853-29.081,64.853-64.847c0-8.162-1.549-16.196-4.608-23.889l-1.555-3.927l85.74-85.734l4.004,1.729 c8.143,3.509,16.768,5.283,25.643,5.283c35.759,0,64.853-29.094,64.853-64.853c0-5.199-0.617-10.315-1.825-15.302l-28.67,28.664 c-6.369,6.369-14.846,9.878-23.856,9.878c-9.004,0-17.487-3.503-23.863-9.878c-6.375-6.375-9.884-14.852-9.884-23.863 s3.509-17.487,9.884-23.863l28.664-28.664c-4.981-1.208-10.097-1.825-15.302-1.825c-35.759,0-64.86,29.094-64.86,64.853 c0,8.156,1.549,16.189,4.602,23.882l1.555,3.927l-85.734,85.728l-4.004-1.722c-8.143-3.515-16.761-5.283-25.637-5.283 c-35.759,0-64.86,29.094-64.86,64.86c0,5.45,0.668,10.81,1.992,15.99l28.509-28.509c6.369-6.375,14.846-9.878,23.856-9.878 s17.487,3.503,23.863,9.878c6.375,6.375,9.884,14.852,9.884,23.863c0,9.01-3.509,17.487-9.884,23.85L63.099,313.613z" />
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

// The person silhouette reads as filled (head + shoulders solid in the
// stroke's own colour) rather than an outline, unlike the other icons here.
function JewelryProfileIcon(
  props: SVGProps<SVGSVGElement>,
) {
  return (
    <svg viewBox="0 0 32 32" {...sharedProps} {...props}>
      <circle
        cx="16"
        cy="12"
        r="4.25"
        strokeWidth="1.55"
        fill="currentColor"
      />
      <path
        strokeWidth="1.55"
        fill="currentColor"
        d="M7.5 27c.6-5 3.6-7.5 8.5-7.5s7.9 2.5 8.5 7.5"
      />
    </svg>
  );
}

// Two of the same silhouette used for «Профиль» above, scaled down and
// overlapping — reusing that shape (rather than drawing a new one) keeps the
// pair visually consistent with the single-person icon it's distinct from.
function JewelryClientsIcon(
  props: SVGProps<SVGSVGElement>,
) {
  return (
    <svg viewBox="0 0 32 32" fill="currentColor" stroke="none" {...props}>
      <g transform="translate(-0.85,4.4) scale(0.68)">
        <circle cx="16" cy="12" r="4.25" />
        <path d="M7.5 27c.6-5 3.6-7.5 8.5-7.5s7.9 2.5 8.5 7.5" />
      </g>
      <g transform="translate(8.65,2.4) scale(0.78)">
        <circle cx="16" cy="12" r="4.25" />
        <path d="M7.5 27c.6-5 3.6-7.5 8.5-7.5s7.9 2.5 8.5 7.5" />
      </g>
    </svg>
  );
}

// A paintbrush leaning on the diagonal, tip resting in its own paint pool —
// filled solid like the gear/sketchbook icons above, for «Мастерская» (the
// standalone sketch/idea board, separate from any client).
function JewelryBrushIcon(
  props: SVGProps<SVGSVGElement>,
) {
  return (
    <svg viewBox="0 0 30 30" fill="currentColor" stroke="none" {...props}>
      <path d="M4.5 22c-1.614 0-2.597.884-3.04 1.867C1.013 24.85 1 25.915 1 26.5c0 .497-.114 1.14-.285 1.664-.113.418-.305.796-.463.902-.445.256-.263.935.25.934H4c1.415 0 2.457-.728 3.09-1.568.632-.84.91-1.76.91-2.432 0-.525-.01-1.48-.467-2.36C7.076 22.756 6.093 22 4.5 22z" />
      <path d="M29.424.002c-.102-.006-.182.006-.263.02-.162.033-.33.09-.533.167-.404.155-.93.4-1.566.732-1.272.66-2.983 1.658-4.91 2.902-3.857 2.49-8.574 5.962-12.305 9.694-1.31 1.31-1.857 2.706-1.845 3.972.012 1.267.57 2.378 1.35 3.16.783.783 1.883 1.338 3.15 1.35 1.267.012 2.673-.533 3.983-1.844 3.732-3.73 7.204-8.448 9.693-12.304 1.245-1.928 2.24-3.64 2.903-4.913.33-.637.576-1.163.73-1.567.08-.202.135-.37.167-.533.016-.082.027-.162.02-.264-.004-.102-.022-.254-.17-.402-.15-.15-.3-.166-.403-.172z" />
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
      return <JewelryProfileIcon {...iconProps} />;
    case "gear":
      return <JewelryMasterIcon {...iconProps} />;
    case "settingsGear":
      return <JewelrySettingsGearIcon {...iconProps} />;
    case "clients":
      return <JewelryClientsIcon {...iconProps} />;
    case "brush":
      return <JewelryBrushIcon {...iconProps} />;
  }
}
