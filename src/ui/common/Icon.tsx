// Minimal inline SVG icons. No dependency; each icon is a small component
// so tree-shaking is trivial and rendering cost is zero.

import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base(size = 16): SVGProps<SVGSVGElement> {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  };
}

export function IconTree({ size, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <circle cx="6" cy="5" r="2" />
      <circle cx="6" cy="19" r="2" />
      <circle cx="18" cy="12" r="2" />
      <path d="M6 7v10" />
      <path d="M6 12h10" />
    </svg>
  );
}

export function IconSearch({ size, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.2-3.2" />
    </svg>
  );
}

export function IconPrompt({ size, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M4 6h16" />
      <path d="M4 12h10" />
      <path d="M4 18h16" />
    </svg>
  );
}

export function IconDataset({ size, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <ellipse cx="12" cy="6" rx="8" ry="3" />
      <path d="M4 6v6c0 1.66 3.58 3 8 3s8-1.34 8-3V6" />
      <path d="M4 12v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
    </svg>
  );
}

export function IconModel({ size, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M8 9h8" />
      <path d="M8 13h5" />
      <path d="M8 17h3" />
    </svg>
  );
}

export function IconRubric({ size, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h7" />
      <path d="M9 17h5" />
    </svg>
  );
}

export function IconBeaker({ size, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M9 3v5L4 20a1 1 0 0 0 .9 1.4h14.2A1 1 0 0 0 20 20L15 8V3" />
      <path d="M7 14h10" />
      <path d="M8 3h8" />
    </svg>
  );
}

export function IconSpark({ size, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M12 3v4" />
      <path d="M12 17v4" />
      <path d="M3 12h4" />
      <path d="M17 12h4" />
      <path d="M6 6l2.5 2.5" />
      <path d="M15.5 15.5 18 18" />
      <path d="M6 18l2.5-2.5" />
      <path d="M15.5 8.5 18 6" />
    </svg>
  );
}

export function IconGitFork({ size, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <circle cx="6" cy="5" r="2" />
      <circle cx="18" cy="5" r="2" />
      <circle cx="12" cy="19" r="2" />
      <path d="M6 7v2a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V7" />
      <path d="M12 12v5" />
    </svg>
  );
}

export function IconCrown({ size, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M3 18h18" />
      <path d="M3 18 5 8l5 4 2-6 2 6 5-4 2 10" />
    </svg>
  );
}

export function IconCompare({ size, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M12 3v18" />
      <path d="M5 8l-2 2 2 2" />
      <path d="M19 16l2-2-2-2" />
      <path d="M3 10h7" />
      <path d="M14 14h7" />
    </svg>
  );
}

export function IconPlus({ size, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

export function IconArrow({ size, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

export function IconCheck({ size, ...rest }: IconProps) {
  return (
    <svg {...base(size)} {...rest}>
      <path d="m5 12 5 5 9-10" />
    </svg>
  );
}
