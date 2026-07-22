import type { SVGProps } from "react";

export type ToolbarIconName =
  | "tasks"
  | "sketchbook"
  | "profile"
  | "gear";

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

function JewelryGearIcon(
  props: SVGProps<SVGSVGElement>,
) {
  return (
    <svg viewBox="0 0 32 32" {...sharedProps} {...props}>
      <circle cx="16" cy="16" r="5.1" strokeWidth="1.55" />
      <path
        strokeWidth="1.55"
        d="M16 4.3v3M16 24.7v3M27.7 16h-3M7.3 16h-3M24.3 7.7l-2.15 2.15M9.85 22.15l-2.15 2.15M24.3 24.3l-2.15-2.15M9.85 9.85 7.7 7.7"
      />
    </svg>
  );
}

function JewelryTasksIcon(
  props: SVGProps<SVGSVGElement>,
) {
  return (
    <svg viewBox="0 0 32 32" {...sharedProps} {...props}>
      <path
        strokeWidth="1.75"
        d="M20.75 8.25c-1.2-1.15-3-1.75-4.8-1.75-3 0-5.45 1.65-5.45 4.35 0 2.45 2.05 3.55 5.55 4.35 3.55.8 5.45 1.95 5.45 4.7 0 2.85-2.45 4.65-5.65 4.65-2.15 0-4.3-.75-5.85-2.2"
      />
      <path strokeWidth="1.75" d="M16 3.75v24.5" />
    </svg>
  );
}

function JewelrySketchbookIcon(
  props: SVGProps<SVGSVGElement>,
) {
  return (
    <svg viewBox="0 0 32 32" {...sharedProps} {...props}>
      <rect
        x="8"
        y="5"
        width="17"
        height="22"
        rx="1.6"
        strokeWidth="1.55"
      />
      <path strokeWidth="1.4" d="M11.5 5v22" />
      <path strokeWidth="1.3" d="M6.5 9h5M6.5 14h5M6.5 19h5M6.5 24h5" />
      <path strokeWidth="1.45" d="M15 21.5l6.8-7.1 2.1 2-7 7.1-3 .9z" />
      <path strokeWidth="1.25" d="M20.8 15.5l2.1 2" />
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
      return <JewelryGearIcon {...iconProps} />;
  }
}
