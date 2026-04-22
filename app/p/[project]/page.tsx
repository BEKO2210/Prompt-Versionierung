import Link from "next/link";
import { Shell } from "../../../src/ui/common/Shell";
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

  return (
    <Shell
      projectSlug={slug}
      title={project.name}
      actions={
        <Link
          className="rounded bg-ink-900 dark:bg-ink-100 text-ink-50 dark:text-ink-900 px-3 py-1.5 text-sm font-medium"
          href={`/p/${slug}/prompts`}
        >
          + Prompt
        </Link>
      }
    >
      {project.description && <p className="text-ink-500 mb-6 max-w-2xl">{project.description}</p>}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <Stat label="Prompts" value={prompts.length} />
        <Stat label="Versions" value={prompts.reduce((n, p) => n + p._count.versions, 0)} />
        <Stat label="Branches" value={prompts.reduce((n, p) => n + p._count.branches, 0)} />
        <Stat label="Archived" value={prompts.filter((p) => p.archivedAt).length} />
      </div>
      <h2 className="text-sm uppercase tracking-wider text-ink-500 mb-3">Recent prompts</h2>
      {prompts.length === 0 ? (
        <p className="text-sm text-ink-500">
          No prompts yet. Head to the Prompts tab to create one.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {prompts.slice(0, 8).map((p) => (
            <li key={p.id}>
              <Link
                href={`/p/${slug}/prompts/${p.slug}`}
                className="flex items-baseline justify-between rounded px-3 py-2 hover:bg-ink-100/60 dark:hover:bg-ink-800/60 border border-transparent hover:border-ink-200/70 dark:hover:border-ink-700"
              >
                <span>
                  <span className="font-medium">{p.name}</span>
                  <span className="ml-3 text-xs text-ink-500">{p.slug}</span>
                </span>
                <span className="text-xs text-ink-500">
                  {p._count.versions} version{p._count.versions === 1 ? "" : "s"} ·{" "}
                  {p._count.branches} branch{p._count.branches === 1 ? "" : "es"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-ink-200/70 dark:border-ink-800 p-3">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-ink-500 uppercase tracking-wide">{label}</div>
    </div>
  );
}
