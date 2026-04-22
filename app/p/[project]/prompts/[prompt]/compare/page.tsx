import Link from "next/link";
import { Shell } from "../../../../../../src/ui/common/Shell";
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
    <Shell projectSlug={projectSlug} title={`Compare · ${prompt.name}`}>
      <form method="get" className="flex gap-2 items-center mb-4 text-sm">
        <span className="text-ink-500 text-xs">A</span>
        <select name="a" defaultValue={leftId ?? ""} className="rounded border border-ink-300/70 dark:border-ink-700 bg-transparent px-2 py-1">
          {versions.map((v) => (
            <option key={v.id} value={v.id}>v{v.number} — {v.title}</option>
          ))}
        </select>
        <span className="text-ink-500 text-xs">B</span>
        <select name="b" defaultValue={rightId ?? ""} className="rounded border border-ink-300/70 dark:border-ink-700 bg-transparent px-2 py-1">
          {versions.map((v) => (
            <option key={v.id} value={v.id}>v{v.number} — {v.title}</option>
          ))}
        </select>
        <button className="rounded border border-ink-300/70 dark:border-ink-700 px-2.5 py-1">Diff</button>
        <Link href={`/p/${projectSlug}/prompts/${promptSlug}`} className="ml-auto text-xs text-ink-500">← back</Link>
      </form>

      {leftId && rightId && leftId !== rightId ? (
        <DiffPanel projectSlug={projectSlug} promptSlug={promptSlug} a={leftId} b={rightId} />
      ) : (
        <p className="text-sm text-ink-500">Pick two different versions.</p>
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
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 text-xs">
        <HeaderCard label={`A — v${cmp.a.number}`} title={cmp.a.title} status={cmp.a.status} />
        <HeaderCard label={`B — v${cmp.b.number}`} title={cmp.b.title} status={cmp.b.status} />
      </div>

      <section>
        <h3 className="text-xs uppercase tracking-wider text-ink-500 mb-2">
          Body · +{cmp.text.stats.added} −{cmp.text.stats.removed} ~{cmp.text.stats.modified}
        </h3>
        <DiffView diff={cmp.text} />
      </section>

      <section>
        <h3 className="text-xs uppercase tracking-wider text-ink-500 mb-2">Variables</h3>
        {cmp.variables.length === 0 ? (
          <p className="text-sm text-ink-500">No variables on either side.</p>
        ) : (
          <ul className="text-sm rounded border border-ink-200/70 dark:border-ink-800 divide-y divide-ink-200/70 dark:divide-ink-800">
            {cmp.variables.map((v) => (
              <li key={v.name} className="px-3 py-1.5 flex items-center gap-3">
                <span className="font-mono">{v.name}</span>
                <span
                  className={`text-xs px-1.5 py-0.5 rounded ${
                    v.op === "added"
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200"
                      : v.op === "removed"
                        ? "bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-200"
                        : v.op === "changed"
                          ? "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200"
                          : "text-ink-500"
                  }`}
                >
                  {v.op}
                </span>
                <span className="text-ink-500 text-xs ml-auto">
                  {v.left?.type ?? "—"} → {v.right?.type ?? "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="text-xs uppercase tracking-wider text-ink-500 mb-2">Run evidence</h3>
        {cmp.runEvidence.length === 0 ? (
          <p className="text-sm text-ink-500">No overlapping (test case, model) runs. Add some and compare again.</p>
        ) : (
          <table className="text-sm w-full rounded border border-ink-200/70 dark:border-ink-800">
            <thead>
              <tr className="text-left text-xs text-ink-500">
                <th className="px-3 py-1.5">Test case</th>
                <th className="px-3 py-1.5">Model</th>
                <th className="px-3 py-1.5 text-right">Score A</th>
                <th className="px-3 py-1.5 text-right">Score B</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-200/70 dark:divide-ink-800">
              {cmp.runEvidence.map((r) => (
                <tr key={r.key}>
                  <td className="px-3 py-1.5">{r.testCase}</td>
                  <td className="px-3 py-1.5 text-ink-500">{r.model}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{r.scoreA == null ? "—" : r.scoreA.toFixed(2)}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{r.scoreB == null ? "—" : r.scoreB.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <p className="text-xs text-ink-500">
        Looking at a diff without receipts is guessing. Add runs on both sides, then re-open this view.
      </p>
      <div className="flex gap-3 text-xs text-ink-500">
        <Link className="hover:underline" href={`/p/${projectSlug}/prompts/${promptSlug}/v/${a}`}>Open A</Link>
        <Link className="hover:underline" href={`/p/${projectSlug}/prompts/${promptSlug}/v/${b}`}>Open B</Link>
      </div>
    </div>
  );
}

function HeaderCard({ label, title, status }: { label: string; title: string; status: string }) {
  return (
    <div className="rounded border border-ink-200/70 dark:border-ink-800 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-ink-500">{label}</div>
      <div className="text-sm">{title}</div>
      <div className="text-xs text-ink-500 mt-1">{status}</div>
    </div>
  );
}
