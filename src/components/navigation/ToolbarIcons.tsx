import type { SVGProps } from "react";

export type ToolbarIconName =
  | "dashboard"
  | "tasks"
  | "sketchbook"
  | "profile";

export type ToolbarIconVariant =
  | "jewelry"
  | "naturalist";

interface ToolbarIconProps extends SVGProps<SVGSVGElement> {
  name: ToolbarIconName;
  variant: ToolbarIconVariant;
  size?: number;
}

const sharedProps = {
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function JewelryDashboardIcon(
  props: SVGProps<SVGSVGElement>,
) {
  return (
    <svg viewBox="0 0 32 32" {...sharedProps} {...props}>
      <path strokeWidth="1.55" d="M5 26.5h22" />
      <path strokeWidth="1.65" d="M7.5 24V16.5h4V24" />
      <path strokeWidth="1.65" d="M14 24V11h4v13" />
      <path strokeWidth="1.65" d="M20.5 24V7.5h4V24" />
      <path
        strokeWidth="1.45"
        d="M7.5 12.5l6-4.5 5 1.5 6-5"
      />
      <circle
        cx="24.5"
        cy="4.5"
        r="1.35"
        fill="currentColor"
        stroke="none"
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
      <path strokeWidth="1.1" d="M7 5.5h3M22 26.5h3" />
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
      />
      <path
        strokeWidth="1.55"
        d="M7.5 27c.6-5 3.6-7.5 8.5-7.5s7.9 2.5 8.5 7.5"
      />
      <path strokeWidth="1.3" d="M25.5 7.5v-3M24 6h3" />
      <circle
        cx="25.5"
        cy="6"
        r="3.25"
        strokeWidth="1.2"
      />
    </svg>
  );
}

function NaturalistDashboardIcon(
  props: SVGProps<SVGSVGElement>,
) {
  return (
    <svg viewBox="0 0 32 32" {...sharedProps} {...props}>
      <circle
        cx="16"
        cy="16"
        r="10.5"
        strokeWidth="1.25"
      />
      <circle
        cx="16"
        cy="16"
        r="3.1"
        strokeWidth="1.15"
      />
      <path
        strokeWidth="1.25"
        d="M16 3.5l2.2 10.3L28.5 16l-10.3 2.2L16 28.5l-2.2-10.3L3.5 16l10.3-2.2z"
      />
      <path strokeWidth="1" d="M8.6 8.6l4.9 4.9M23.4 8.6l-4.9 4.9M8.6 23.4l4.9-4.9M23.4 23.4l-4.9-4.9" />
    </svg>
  );
}

function NaturalistTasksIcon(
  props: SVGProps<SVGSVGElement>,
) {
  return (
    <svg viewBox="0 0 32 32" {...sharedProps} {...props}>
      <path
        strokeWidth="1.55"
        d="M20.5 8.5c-1.1-1.1-2.75-1.75-4.55-1.75-2.8 0-5.1 1.55-5.1 4.05 0 2.3 1.9 3.35 5.25 4.15 3.4.8 5.15 1.85 5.15 4.45 0 2.7-2.3 4.4-5.35 4.4-2.05 0-4-.7-5.45-2"
      />
      <path strokeWidth="1.45" d="M16 4.25v23.5" />
      <path
        strokeWidth=".9"
        d="M8 6.25c1.2-.9 2.35-1.45 3.45-1.7M20.65 27.15c1.25-.35 2.4-.9 3.35-1.7"
      />
    </svg>
  );
}

function NaturalistSketchbookIcon(
  props: SVGProps<SVGSVGElement>,
) {
  return (
    <svg viewBox="0 0 32 32" {...sharedProps} {...props}>
      <path
        strokeWidth="1.3"
        d="M4.5 7.5c4.15-1.15 7.9-.6 11.5 1.65v17.1c-3.6-2.2-7.35-2.75-11.5-1.65z"
      />
      <path
        strokeWidth="1.3"
        d="M27.5 7.5c-4.15-1.15-7.9-.6-11.5 1.65v17.1c3.6-2.2 7.35-2.75 11.5-1.65z"
      />
      <path strokeWidth="1" d="M7.5 11.5c2.2-.35 4.1-.05 5.7.9M7.5 15c2.2-.35 4.1-.05 5.7.9" />
      <path
        strokeWidth="1.15"
        d="M21.8 11.4c2.65 2.2 2.1 6.35-1.65 9.7M21.8 11.4c-1.85.3-3.2 1.5-3.75 3.45M21.8 11.4c1.15.7 1.8 1.85 1.9 3.35"
      />
      <path strokeWidth="1.1" d="M18.3 21.7l5.8-8.3" />
    </svg>
  );
}

function NaturalistProfileIcon(
  props: SVGProps<SVGSVGElement>,
) {
  return (
    <svg viewBox="0 0 32 32" {...sharedProps} {...props}>
      <circle
        cx="16"
        cy="16"
        r="11"
        strokeWidth="1.2"
      />
      <path
        strokeWidth="1.25"
        d="M13 13.25c0-2.25 1.35-4.25 3.55-4.25 2.1 0 3.45 1.7 3.45 3.85 0 2.25-1.4 4.15-3.55 4.15-2.05 0-3.45-1.55-3.45-3.75z"
      />
      <path
        strokeWidth="1.25"
        d="M9.3 24.1c1.15-3.45 3.4-5.15 6.75-5.15 3.3 0 5.55 1.7 6.65 5.15"
      />
      <path strokeWidth=".95" d="M23.1 7.7l1.2-1.2M7.7 23.1l-1.2 1.2" />
    </svg>
  );
}

export function ToolbarIcon({
  name,
  variant,
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

  if (variant === "naturalist") {
    switch (name) {
      case "dashboard":
        return <NaturalistDashboardIcon {...iconProps} />;
      case "tasks":
        return <NaturalistTasksIcon {...iconProps} />;
      case "sketchbook":
        return <NaturalistSketchbookIcon {...iconProps} />;
      case "profile":
        return <NaturalistProfileIcon {...iconProps} />;
    }
  }

  switch (name) {
    case "dashboard":
      return <JewelryDashboardIcon {...iconProps} />;
    case "tasks":
      return <JewelryTasksIcon {...iconProps} />;
    case "sketchbook":
      return <JewelrySketchbookIcon {...iconProps} />;
    case "profile":
      return <JewelryProfileIcon {...iconProps} />;
  }
}
