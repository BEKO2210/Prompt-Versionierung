import type { VersionStatus } from "../../domain/status";

const COLORS: Record<VersionStatus, string> = {
  draft:        "bg-ink-200/60 text-ink-700 dark:bg-ink-800 dark:text-ink-200",
  experimental: "bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-200",
  candidate:    "bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-200",
  approved:     "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200",
  deprecated:   "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200",
  archived:     "bg-slate-100 text-slate-700 dark:bg-slate-700/40 dark:text-slate-300",
};

export function StatusPill({ status }: { status: VersionStatus | string }) {
  const s = (status as VersionStatus) in COLORS ? (status as VersionStatus) : "draft";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium tracking-wide uppercase ${COLORS[s]}`}
    >
      {status}
    </span>
  );
}
