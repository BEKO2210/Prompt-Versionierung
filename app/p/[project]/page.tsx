import Link from "next/link";
import { Shell } from "../../../src/ui/common/Shell";
import { Card } from "../../../src/ui/common/Card";
import { Button } from "../../../src/ui/common/Button";
import { Eyebrow } from "../../../src/ui/common/Eyebrow";
import { IconArrow, IconGitFork, IconPlus, IconPrompt, IconTree } from "../../../src/ui/common/Icon";
import { defaultContext } from "../../../src/services/context";
import { getProjectBySlug } from "../../../src/services/projectService";
import { listPrompts } from "../../../src/services/promptService";

export default async function ProjectHomePage({
  params,
}: {
  params: Promise<{ project: string }>;
}) {
  const { project: slug } = await params;
  const project = await getProjectBySlug(defaultContext(), slug);
  const prompts = await listPrompts(defaultContext(), project.id);
  const totalVersions = prompts.reduce((n, p) => n + p._count.versions, 0);
  const totalBranches = prompts.reduce((n, p) => n + p._count.branches, 0);
  const archived = prompts.filter((p) => p.archivedAt).length;

  return (
    <Shell
      projectSlug={slug}
      currentPath={`/p/${slug}`}
      title={project.name}
      subtitle={project.description ?? undefined}
      actions={
        <Link href={`/p/${slug}/prompts`}>
          <Button variant="accent">
            <IconPlus size={14} /> New prompt
          </Button>
        </Link>
      }
    >
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <Stat label="Prompts" value={prompts.length} icon={<IconPrompt size={15} />} />
        <Stat label="Versions" value={totalVersions} icon={<IconTree size={15} />} />
        <Stat label="Branches" value={totalBranches} icon={<IconGitFork size={15} />} />
        <Stat label="Archived" value={archived} tone="muted" />
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-3">
          <Eyebrow>Recent prompts</Eyebrow>
          {prompts.length > 6 && (
            <Link href={`/p/${slug}/prompts`} className="text-xs text-ink-500 hover:text-ink-700 dark:hover:text-ink-200">
              View all →
            </Link>
          )}
        </div>
        {prompts.length === 0 ? (
          <EmptyState projectSlug={slug} />
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {prompts.slice(0, 6).map((p) => (
              <li key={p.id}>
                <Link href={`/p/${slug}/prompts/${p.slug}`} className="group block">
                  <Card className="transition-shadow hover:shadow-pop">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="font-medium text-ink-900 dark:text-ink-50 truncate">
                          {p.name}
                        </div>
                        <div className="text-xs text-ink-500 font-mono mt-0.5">{p.slug}</div>
                      </div>
                      <IconArrow size={15} className="text-ink-400 group-hover:text-ink-700 dark:group-hover:text-ink-200 transition-colors" />
                    </div>
                    {p.description && (
                      <p className="text-[13px] text-ink-500 dark:text-ink-400 mt-2 line-clamp-2">
                        {p.description}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-3 text-[11px] text-ink-500">
                      <span><strong className="text-ink-700 dark:text-ink-300">{p._count.versions}</strong> versions</span>
                      <span className="text-ink-300 dark:text-ink-700">·</span>
                      <span><strong className="text-ink-700 dark:text-ink-300">{p._count.branches}</strong> branches</span>
                    </div>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Shell>
  );
}

function Stat({
  label,
  value,
  icon,
  tone = "normal",
}: {
  label: string;
  value: number;
  icon?: React.ReactNode;
  tone?: "normal" | "muted";
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-2">
        {icon && <span className="text-ink-400">{icon}</span>}
        <span className="eyebrow">{label}</span>
      </div>
      <div
        className={`text-[28px] leading-none font-semibold tracking-tight ${
          tone === "muted" ? "text-ink-400" : "text-ink-900 dark:text-ink-50"
        }`}
      >
        {value}
      </div>
    </Card>
  );
}

function EmptyState({ projectSlug }: { projectSlug: string }) {
  return (
    <Card className="flex items-center justify-between gap-6 p-6 border-dashed">
      <div>
        <div className="font-medium text-ink-800 dark:text-ink-100">No prompts yet.</div>
        <p className="text-sm text-ink-500 mt-1 max-w-lg">
          A prompt is the logical identity. Its versions are the artifacts that
          ship. Create one to see the tree view.
        </p>
      </div>
      <Link href={`/p/${projectSlug}/prompts`}>
        <Button variant="accent">
          <IconPlus size={14} /> New prompt
        </Button>
      </Link>
    </Card>
  );
}
