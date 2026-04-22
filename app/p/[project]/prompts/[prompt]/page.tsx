import Link from "next/link";
import { Shell } from "../../../../../src/ui/common/Shell";
import { defaultContext } from "../../../../../src/services/context";
import { getProjectBySlug } from "../../../../../src/services/projectService";
import { getPromptBySlug } from "../../../../../src/services/promptService";
import { PromptTree } from "../../../../../src/ui/tree/PromptTree";

export default async function PromptTreePage({
  params,
}: {
  params: Promise<{ project: string; prompt: string }>;
}) {
  const { project: projectSlug, prompt: promptSlug } = await params;
  const project = await getProjectBySlug(defaultContext(), projectSlug);
  const prompt = await getPromptBySlug(defaultContext(), project.id, promptSlug);

  const branchHeads: Record<string, string | null> = {};
  for (const b of prompt.branches) {
    branchHeads[b.id] = b.headVersionId ?? null;
  }
  const treeVersions = prompt.versions.map((v) => ({
    id: v.id,
    parentVersionId: v.parentVersionId,
    number: v.number,
    createdOnBranchId: v.createdOnBranchId,
    status: v.status,
    title: v.title,
  }));

  return (
    <Shell
      projectSlug={projectSlug}
      title={`${prompt.name}`}
      actions={
        <div className="flex gap-2 text-sm">
          <Link
            href={`/p/${projectSlug}/prompts/${promptSlug}/compare`}
            className="rounded border border-ink-300/70 dark:border-ink-700 px-2.5 py-1 hover:bg-ink-100 dark:hover:bg-ink-800"
          >
            Compare
          </Link>
          <Link
            href={`/p/${projectSlug}/prompts/${promptSlug}/refine/${prompt.canonicalBranch?.headVersionId ?? prompt.versions.at(-1)?.id ?? ""}`}
            className="rounded border border-ink-300/70 dark:border-ink-700 px-2.5 py-1 hover:bg-ink-100 dark:hover:bg-ink-800"
          >
            Refine
          </Link>
        </div>
      }
    >
      <div className="grid grid-cols-[1.3fr_2fr] gap-6">
        <section className="min-w-0">
          <h2 className="text-xs uppercase tracking-wider text-ink-500 mb-3">Branches & versions</h2>
          <div className="space-y-1.5 mb-3">
            {prompt.branches.map((b) => (
              <div key={b.id} className="flex items-center gap-2 text-xs">
                <span className={`font-mono ${b.id === prompt.canonicalBranchId ? "text-emerald-600 dark:text-emerald-400 font-semibold" : "text-ink-500"}`}>
                  {b.name}
                </span>
                <span className="text-ink-400">
                  {b.id === prompt.canonicalBranchId ? "canonical" : b.status}
                </span>
              </div>
            ))}
          </div>
          <PromptTree
            versions={treeVersions}
            canonicalHeadId={prompt.canonicalBranch?.headVersionId ?? null}
            branchHeads={branchHeads}
            projectSlug={projectSlug}
            promptSlug={promptSlug}
          />
        </section>
        <section className="min-w-0">
          <h2 className="text-xs uppercase tracking-wider text-ink-500 mb-3">Overview</h2>
          {prompt.purpose && (
            <p className="text-sm text-ink-600 dark:text-ink-300 mb-4 max-w-prose">{prompt.purpose}</p>
          )}
          <div className="rounded border border-ink-200/70 dark:border-ink-800 p-4 space-y-3">
            <Field label="Canonical branch" value={prompt.canonicalBranch?.name ?? "—"} />
            <Field label="Canonical head" value={prompt.canonicalBranch?.headVersionId ?? "—"} />
            <Field label="Versions" value={String(prompt.versions.length)} />
            <Field label="Branches" value={String(prompt.branches.length)} />
            <Field label="Created" value={new Date(prompt.createdAt).toISOString()} />
          </div>
          <p className="mt-4 text-xs text-ink-500">
            Click any node in the tree to open the version detail, edit, or run a test.
          </p>
        </section>
      </div>
    </Shell>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-ink-500">{label}</span>
      <span className="font-mono text-[13px] truncate">{value}</span>
    </div>
  );
}
