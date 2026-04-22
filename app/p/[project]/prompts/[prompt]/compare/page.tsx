import Link from "next/link";
import { Shell } from "../../../../../../src/ui/common/Shell";
import { Card } from "../../../../../../src/ui/common/Card";
import { Button } from "../../../../../../src/ui/common/Button";
import { Select } from "../../../../../../src/ui/common/Input";
import { Eyebrow } from "../../../../../../src/ui/common/Eyebrow";
import { StatusPill } from "../../../../../../src/ui/common/StatusPill";
import { IconArrow, IconCompare } from "../../../../../../src/ui/common/Icon";
import { defaultContext } from "../../../../../../src/services/context";
import { getProjectBySlug } from "../../../../../../src/services/projectService";
import { getPromptBySlug } from "../../../../../../src/services/promptService";
import { compare } from "../../../../../../src/services/comparisonService";
import { DiffView } from "../../../../../../src/ui/diff/DiffView";

export default async function ComparePage({
  params,
  searchParams,
}: {
  params: Promise<{ project: string; prompt: string }>;
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const { project: projectSlug, prompt: promptSlug } = await params;
  const { a, b } = await searchParams;
  const project = await getProjectBySlug(defaultContext(), projectSlug);
  const prompt = await getPromptBySlug(defaultContext(), project.id, promptSlug);

  const versions = prompt.versions;
  const leftId = a ?? versions[0]?.id ?? null;
  const rightId = b ?? versions.at(-1)?.id ?? null;

  return (
    <Shell
      projectSlug={projectSlug}
      currentPath={`/p/${projectSlug}/prompts`}
      title={
        <span className="flex items-center gap-2">
          <IconCompare size={14} />
          Compare · <Link href={`/p/${projectSlug}/prompts/${promptSlug}`} className="text-ink-500 hover:text-ink-800 dark:hover:text-ink-100">{prompt.name}</Link>
        </span>
      }
    >
      <Card className="mb-5">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px]">
            <label className="block text-xs font-medium text-ink-600 dark:text-ink-300 mb-1">Left (A)</label>
            <Select name="a" defaultValue={leftId ?? ""}>
              {versions.map((v) => (
                <option key={v.id} value={v.id}>v{v.number} — {v.title}</option>
              ))}
            </Select>
          </div>
          <IconArrow size={16} className="text-ink-400 mb-2.5" />
          <div className="flex-1 min-w-[220px]">
            <label className="block text-xs font-medium text-ink-600 dark:text-ink-300 mb-1">Right (B)</label>
            <Select name="b" defaultValue={rightId ?? ""}>
              {versions.map((v) => (
                <option key={v.id} value={v.id}>v{v.number} — {v.title}</option>
              ))}
            </Select>
          </div>
          <Button type="submit" variant="primary">Diff</Button>
        </form>
      </Card>

      {leftId && rightId && leftId !== rightId ? (
        <DiffPanel projectSlug={projectSlug} promptSlug={promptSlug} a={leftId} b={rightId} />
      ) : (
        <Card className="p-6 text-sm text-ink-500 text-center border-dashed">
          Pick two different versions to compare.
        </Card>
      )}
    </Shell>
  );
}

async function DiffPanel({
  projectSlug,
  promptSlug,
  a,
  b,
}: {
  projectSlug: string;
  promptSlug: string;
  a: string;
  b: string;
}) {
  const cmp = await compare(defaultContext(), a, b);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <SideHeader label="A" number={cmp.a.number} title={cmp.a.title} status={cmp.a.status} />
        <SideHeader label="B" number={cmp.b.number} title={cmp.b.title} status={cmp.b.status} />
      </div>

      <section>
        <div className="flex items-baseline justify-between mb-2">
          <Eyebrow>Body</Eyebrow>
          <div className="text-[11px] font-mono text-ink-500">
            <span className="text-emerald-600 dark:text-emerald-400">+{cmp.text.stats.added}</span>
            {" "}
            <span className="text-rose-600 dark:text-rose-400">−{cmp.text.stats.removed}</span>
            {" "}
            <span className="text-amber-600 dark:text-amber-400">~{cmp.text.stats.modified}</span>
          </div>
        </div>
        <DiffView diff={cmp.text} />
      </section>

      <section>
        <Eyebrow className="mb-2">Variables</Eyebrow>
        {cmp.variables.length === 0 ? (
          <Card className="text-sm text-ink-500">No variables on either side.</Card>
        ) : (
          <Card padded={false}>
            <ul className="divide-y divide-ink-200/70 dark:divide-ink-800/70 text-sm">
              {cmp.variables.map((v) => (
                <li key={v.name} className="px-4 py-2 flex items-center gap-3">
                  <span className="font-mono text-ink-800 dark:text-ink-100">{v.name}</span>
                  <VarOpBadge op={v.op} />
                  <span className="text-[11px] text-ink-500 ml-auto font-mono">
                    {v.left?.type ?? "∅"} → {v.right?.type ?? "∅"}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      <section>
        <Eyebrow className="mb-2">Run evidence</Eyebrow>
        {cmp.runEvidence.length === 0 ? (
          <Card className="text-sm text-ink-500 border-dashed">
            No overlapping (test case, model) runs on both sides. Run the same
            tests on A and B and re-open this view.
          </Card>
        ) : (
          <Card padded={false}>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-ink-500 bg-ink-50/50 dark:bg-ink-950/40">
                  <th className="px-4 py-2 font-medium">Test case</th>
                  <th className="px-4 py-2 font-medium">Model</th>
                  <th className="px-4 py-2 font-medium text-right">A</th>
                  <th className="px-4 py-2 font-medium text-right">B</th>
                  <th className="px-4 py-2 font-medium text-right">Δ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-200/70 dark:divide-ink-800/70">
                {cmp.runEvidence.map((r) => {
                  const delta = r.scoreA != null && r.scoreB != null ? r.scoreB - r.scoreA : null;
                  return (
                    <tr key={r.key}>
                      <td className="px-4 py-2">{r.testCase}</td>
                      <td className="px-4 py-2 text-ink-500">{r.model}</td>
                      <td className="px-4 py-2 text-right font-mono">
                        {r.scoreA == null ? <span className="text-ink-400">—</span> : (r.scoreA * 100).toFixed(0) + "%"}
                      </td>
                      <td className="px-4 py-2 text-right font-mono">
                        {r.scoreB == null ? <span className="text-ink-400">—</span> : (r.scoreB * 100).toFixed(0) + "%"}
                      </td>
                      <td className="px-4 py-2 text-right font-mono">
                        {delta === null ? (
                          <span className="text-ink-400">—</span>
                        ) : (
                          <span
                            className={
                              delta > 0
                                ? "text-emerald-600 dark:text-emerald-400"
                                : delta < 0
                                  ? "text-rose-600 dark:text-rose-400"
                                  : "text-ink-500"
                            }
                          >
                            {delta > 0 ? "+" : ""}
                            {(delta * 100).toFixed(0)}%
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
        <p className="mt-2 text-xs text-ink-500">
          A diff without receipts is guessing. Add runs on both sides and the
          evidence row shows which version actually improved.
        </p>
      </section>

      <div className="flex gap-4 text-sm">
        <Link
          href={`/p/${projectSlug}/prompts/${promptSlug}/v/${a}`}
          className="text-ink-700 dark:text-ink-200 hover:text-accent-600 dark:hover:text-accent-400"
        >
          → Open A
        </Link>
        <Link
          href={`/p/${projectSlug}/prompts/${promptSlug}/v/${b}`}
          className="text-ink-700 dark:text-ink-200 hover:text-accent-600 dark:hover:text-accent-400"
        >
          → Open B
        </Link>
      </div>
    </div>
  );
}

function SideHeader({
  label,
  number,
  title,
  status,
}: {
  label: "A" | "B";
  number: number;
  title: string;
  status: string;
}) {
  return (
    <Card>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center h-5 w-5 rounded-md bg-ink-900 dark:bg-ink-100 text-ink-50 dark:text-ink-900 text-[10px] font-mono font-semibold">
            {label}
          </span>
          <span className="font-mono text-xs text-ink-500">v{number}</span>
        </div>
        <StatusPill status={status} size="sm" />
      </div>
      <div className="text-sm font-medium text-ink-800 dark:text-ink-100 truncate">{title}</div>
    </Card>
  );
}

function VarOpBadge({ op }: { op: string }) {
  const map: Record<string, string> = {
    added:     "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-200",
    removed:   "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-200",
    changed:   "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200",
    unchanged: "bg-ink-100 text-ink-500 ring-ink-200 dark:bg-ink-800 dark:text-ink-400",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ${map[op] ?? map.unchanged}`}>
      {op}
    </span>
  );
}
