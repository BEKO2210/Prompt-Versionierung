import Link from "next/link";
import type { ReactNode } from "react";

export function Shell({
  projectSlug,
  children,
  title,
  actions,
}: {
  projectSlug?: string;
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r border-ink-200/60 dark:border-ink-800/80 px-4 py-5 bg-ink-100/50 dark:bg-ink-950/60">
        <Link href="/" className="block mb-6 font-mono text-sm">
          <span className="text-ink-400">/</span>prompt-tree
        </Link>
        {projectSlug ? (
          <nav className="flex flex-col gap-1 text-sm">
            <NavLink href={`/p/${projectSlug}`} label="Overview" />
            <NavLink href={`/p/${projectSlug}/prompts`} label="Prompts" />
            <NavLink href={`/p/${projectSlug}/search`} label="Search" />
            <NavLink href={`/p/${projectSlug}/datasets`} label="Datasets" />
            <NavLink href={`/p/${projectSlug}/models`} label="Models" />
            <NavLink href={`/p/${projectSlug}/rubrics`} label="Rubrics" />
          </nav>
        ) : (
          <p className="text-xs text-ink-500">Pick a project to start.</p>
        )}
      </aside>
      <main className="flex-1 min-w-0">
        <header className="border-b border-ink-200/60 dark:border-ink-800/80 px-6 py-3 flex items-center justify-between">
          <h1 className="text-sm font-medium text-ink-700 dark:text-ink-200">{title}</h1>
          <div className="flex gap-2">{actions}</div>
        </header>
        <div className="px-6 py-5">{children}</div>
      </main>
    </div>
  );
}

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded px-2 py-1 text-ink-700 dark:text-ink-200 hover:bg-ink-200/70 dark:hover:bg-ink-800/60"
    >
      {label}
    </Link>
  );
}
