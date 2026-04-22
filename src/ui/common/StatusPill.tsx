import type { VersionStatus } from "../../domain/status";

const STYLES: Record<VersionStatus, string> = {
  draft:        "bg-ink-100 text-ink-600 ring-ink-200/70 dark:bg-ink-800 dark:text-ink-200 dark:ring-ink-700/70",
  experimental: "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-200 dark:ring-blue-400/20",
  candidate:    "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-200 dark:ring-violet-400/20",
  approved:     "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-400/20",
  deprecated:   "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-400/20",
  archived:     "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-500/10 dark:text-slate-300 dark:ring-slate-400/20",
};

export function StatusPill({ status, size = "md" }: { status: VersionStatus | string; size?: "sm" | "md" }) {
  const s = (status as VersionStatus) in STYLES ? (status as VersionStatus) : "draft";
  const sz = size === "sm" ? "text-[10px] px-1.5 py-0.5" : "text-[11px] px-2 py-0.5";
  return (
    <span
      className={`inline-flex items-center rounded-full ring-1 font-medium tracking-wide uppercase ${sz} ${STYLES[s]}`}
    >
      {status}
    </span>
  );
}
