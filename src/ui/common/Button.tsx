import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "accent";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-ink-900 text-ink-50 hover:bg-ink-800 shadow-soft dark:bg-ink-100 dark:text-ink-900 dark:hover:bg-white",
  accent:
    "bg-accent-600 text-white hover:bg-accent-700 shadow-soft",
  secondary:
    "bg-white text-ink-700 border border-ink-200 hover:bg-ink-50 dark:bg-ink-900 dark:text-ink-100 dark:border-ink-800 dark:hover:bg-ink-800/60",
  ghost:
    "text-ink-700 hover:bg-ink-100 dark:text-ink-200 dark:hover:bg-ink-800/60",
  danger:
    "bg-rose-600 text-white hover:bg-rose-500 shadow-soft",
};

const SIZES: Record<Size, string> = {
  sm: "text-xs px-2 py-1",
  md: "text-sm px-2.5 py-1.5",
};

export function Button({
  children,
  variant = "secondary",
  size = "md",
  className = "",
  ...rest
}: {
  children: ReactNode;
  variant?: Variant;
  size?: Size;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center gap-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    >
      {children}
    </button>
  );
}
