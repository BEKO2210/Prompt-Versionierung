import Link from "next/link";
import { Shell } from "../../../../../src/ui/common/Shell";
import { Card } from "../../../../../src/ui/common/Card";
import { Button } from "../../../../../src/ui/common/Button";
import { Eyebrow } from "../../../../../src/ui/common/Eyebrow";
import { IconCompare, IconGitFork, IconSpark } from "../../../../../src/ui/common/Icon";
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
  const branchNames: Record<string, string> = {};
  for (const b of prompt.branches) {
    branchHeads[b.id] = b.headVersionId ?? null;
    branchNames[b.id] = b.name;
  }
  const treeVersions = prompt.versions.map((v) => ({
    id: v.id,
    parentVersionId: v.parentVersionId,
    number: v.number,
    createdOnBranchId: v.createdOnBranchId,
    status: v.status,
    title: v.title,
  }));

  const headVersion = prompt.canonicalBranch?.headVersionId ?? prompt.versions.at(-1)?.id ?? "";

  return (
    <Shell
      projectSlug={projectSlug}
      currentPath={`/p/${projectSlug}/prompts`}
      title={prompt.name}
      subtitle={prompt.purpose ?? `${prompt.versions.length} versions, ${prompt.branches.length} branches`}
      actions={
        <div className="flex items-center gap-2">
          <Link href={`/p/${projectSlug}/prompts/${promptSlug}/compare`}>
            <Button variant="secondary" size="md">
              <IconCompare size={14} /> Compare
            </Button>
          </Link>
          <Link href={`/p/${projectSlug}/prompts/${promptSlug}/refine/${headVersion}`}>
            <Button variant="accent" size="md">
              <IconSpark size={14} /> Refine
            </Button>
          </Link>
        </div>
      }
    >
      <div className="grid grid-cols-1 xl:grid-cols-[1.3fr_1fr] gap-6">
        <section className="min-w-0 space-y-5">
          <BranchList
            branches={prompt.branches}
            canonicalBranchId={prompt.canonicalBranchId}
          />
          <div>
            <Eyebrow className="mb-2">Version tree</Eyebrow>
            <PromptTree
              versions={treeVersions}
              canonicalHeadId={prompt.canonicalBranch?.headVersionId ?? null}
              branchHeads={branchHeads}
              branchNames={branchNames}
              projectSlug={projectSlug}
              promptSlug={promptSlug}
            />
          </div>
        </section>

        <aside className="min-w-0 space-y-4">
          <Card>
            <Eyebrow className="mb-3">Overview</Eyebrow>
            <dl className="space-y-1.5 text-[13px]">
              <Row label="Canonical branch" value={prompt.canonicalBranch?.name ?? "—"} mono />
              <Row
                label="Canonical head"
                value={
                  prompt.canonicalBranch?.headVersionId
                    ? `v${prompt.versions.find((v) => v.id === prompt.canonicalBranch!.headVersionId)?.number ?? "?"}`
                    : "—"
                }
                mono
              />
              <Row label="Versions" value={String(prompt.versions.length)} />
              <Row label="Branches" value={String(prompt.branches.length)} />
              <Row
                label="Created"
                value={new Date(prompt.createdAt).toISOString().slice(0, 10)}
                mono
              />
            </dl>
          </Card>

          {prompt.purpose && (
            <Card>
              <Eyebrow className="mb-2">Purpose</Eyebrow>
              <p className="text-sm text-ink-700 dark:text-ink-200 leading-relaxed">
                {prompt.purpose}
              </p>
            </Card>
          )}

          <Card className="bg-accent-50/40 dark:bg-accent-500/5 border-accent-200/50 dark:border-accent-500/20">
            <div className="flex gap-3">
              <span className="mt-0.5 text-accent-600 dark:text-accent-400">
                <IconGitFork size={18} />
              </span>
              <div className="text-[13px] leading-relaxed">
                <div className="font-medium text-ink-800 dark:text-ink-100 mb-0.5">
                  Pick a version
                </div>
                <p className="text-ink-500 dark:text-ink-400">
                  Click any node in the tree to open its detail page — edit,
                  fork, run tests, or promote.
                </p>
              </div>
            </div>
          </Card>
        </aside>
      </div>
    </Shell>
  );
}

function BranchList({
  branches,
  canonicalBranchId,
}: {
  branches: Array<{ id: string; name: string; status: string; headVersionId: string | null }>;
  canonicalBranchId: string | null;
}) {
  return (
    <div>
      <Eyebrow className="mb-2">Branches</Eyebrow>
      <ul className="flex flex-wrap gap-2">
        {branches.map((b) => {
          const isCanon = b.id === canonicalBranchId;
          return (
            <li key={b.id}>
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[12px] font-mono ${
                  isCanon
                    ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-400/20"
                    : b.status === "archived"
                      ? "bg-ink-100 text-ink-400 dark:bg-ink-800 dark:text-ink-500"
                      : "bg-ink-100 text-ink-700 ring-1 ring-ink-200 dark:bg-ink-800 dark:text-ink-200 dark:ring-ink-700"
                }`}
              >
                <IconGitFork size={11} />
                {b.name}
                {isCanon && <span className="text-[10px] opacity-70">canonical</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-500">{label}</dt>
      <dd className={`text-ink-800 dark:text-ink-100 truncate ${mono ? "font-mono text-[12px]" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
