import type { HTMLAttributes, ReactNode } from "react";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  padded?: boolean;
};

export function Card({ className = "", padded = true, children, ...rest }: CardProps) {
  return (
    <div
      {...rest}
      className={`rounded-xl bg-white dark:bg-ink-900/80 border border-ink-200/70 dark:border-ink-800/70 shadow-soft ${
        padded ? "p-4" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  eyebrow,
  title,
  right,
}: {
  eyebrow?: string;
  title: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between mb-2">
      <div>
        {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
        <div className="text-sm font-medium text-ink-800 dark:text-ink-100">{title}</div>
      </div>
      {right}
    </div>
  );
}
