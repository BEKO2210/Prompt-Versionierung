import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const STYLES: Record<Variant, string> = {
  primary:   "bg-ink-900 text-ink-50 hover:bg-ink-800 dark:bg-ink-100 dark:text-ink-900 dark:hover:bg-ink-200",
  secondary: "border border-ink-300/80 dark:border-ink-700 hover:bg-ink-100 dark:hover:bg-ink-800",
  ghost:     "text-ink-700 hover:bg-ink-100 dark:text-ink-200 dark:hover:bg-ink-800",
  danger:    "bg-rose-600 text-white hover:bg-rose-500",
};

export function Button({
  children,
  variant = "secondary",
  className = "",
  ...rest
}: { children: ReactNode; variant?: Variant } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition ${STYLES[variant]} ${className}`}
    >
      {children}
    </button>
  );
}
