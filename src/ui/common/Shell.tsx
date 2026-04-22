import Link from "next/link";
import type { ReactNode } from "react";
import {
  IconTree,
  IconSearch,
  IconDataset,
  IconModel,
  IconRubric,
  IconBeaker,
  IconPrompt,
} from "./Icon";

type NavItem = { href: string; label: string; icon: ReactNode };

export function Shell({
  projectSlug,
  currentPath,
  children,
  title,
  subtitle,
  actions,
}: {
  projectSlug?: string;
  currentPath?: string; // e.g. "/p/demo/prompts"
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const nav: NavItem[] = projectSlug
    ? [
        { href: `/p/${projectSlug}`,          label: "Overview", icon: <IconTree size={15} /> },
        { href: `/p/${projectSlug}/prompts`,  label: "Prompts",  icon: <IconPrompt size={15} /> },
        { href: `/p/${projectSlug}/search`,   label: "Search",   icon: <IconSearch size={15} /> },
        { href: `/p/${projectSlug}/datasets`, label: "Datasets", icon: <IconDataset size={15} /> },
        { href: `/p/${projectSlug}/models`,   label: "Models",   icon: <IconModel size={15} /> },
        { href: `/p/${projectSlug}/rubrics`,  label: "Rubrics",  icon: <IconRubric size={15} /> },
      ]
    : [];

  return (
    <div className="flex min-h-screen bg-ink-50 dark:bg-[#0e1018]">
      <aside className="w-60 shrink-0 border-r border-ink-200/60 dark:border-ink-800/60 bg-white/60 dark:bg-ink-900/40 backdrop-blur px-3 py-5 flex flex-col">
        <Link href="/" className="flex items-center gap-2 px-2 mb-6 group">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-900 dark:bg-ink-100 text-ink-50 dark:text-ink-900">
            <IconBeaker size={16} />
          </span>
          <span className="font-semibold tracking-tight text-ink-900 dark:text-ink-50">
            Prompt Tree
          </span>
        </Link>

        {projectSlug ? (
          <>
            <div className="eyebrow px-2 mb-2">Project</div>
            <div className="mb-4 px-2 text-sm font-medium text-ink-800 dark:text-ink-100 truncate">
              {projectSlug}
            </div>
            <nav className="flex flex-col gap-0.5">
              {nav.map((item) => (
                <NavLink
                  key={item.href}
                  {...item}
                  active={isActive(currentPath, item.href)}
                />
              ))}
            </nav>
          </>
        ) : (
          <div className="px-2 text-sm text-ink-500">
            Pick a project to start.
          </div>
        )}

        <div className="mt-auto px-2 pt-4 border-t border-ink-200/70 dark:border-ink-800/70">
          <p className="text-[11px] text-ink-500 leading-relaxed">
            Versions are immutable. Decisions are recorded. Nothing is lost.
          </p>
        </div>
      </aside>

      <main className="flex-1 min-w-0">
        <header className="sticky top-0 z-10 bg-ink-50/80 dark:bg-[#0e1018]/80 backdrop-blur border-b border-ink-200/60 dark:border-ink-800/60 px-8 py-4 flex items-center justify-between gap-6">
          <div className="min-w-0">
            {title && (
              <h1 className="text-[15px] font-semibold tracking-tight text-ink-900 dark:text-ink-50 truncate">
                {title}
              </h1>
            )}
            {subtitle && (
              <p className="text-xs text-ink-500 mt-0.5 truncate">{subtitle}</p>
            )}
          </div>
          <div className="flex items-center gap-2">{actions}</div>
        </header>
        <div className="px-8 py-6 max-w-[1400px]">{children}</div>
      </main>
    </div>
  );
}

function NavLink({ href, label, icon, active }: NavItem & { active: boolean }) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
        active
          ? "bg-ink-900 text-ink-50 dark:bg-ink-100 dark:text-ink-900"
          : "text-ink-700 dark:text-ink-300 hover:bg-ink-100 dark:hover:bg-ink-800/60"
      }`}
    >
      <span className="opacity-80">{icon}</span>
      {label}
    </Link>
  );
}

function isActive(current: string | undefined, href: string): boolean {
  if (!current) return false;
  if (href === current) return true;
  // Highlight "Overview" only on the exact /p/<slug> path.
  if (href.split("/").length === 3) return current === href;
  return current.startsWith(href);
}
