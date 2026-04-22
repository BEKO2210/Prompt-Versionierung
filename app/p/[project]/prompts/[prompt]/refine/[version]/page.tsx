import Link from "next/link";
import { Shell } from "../../../../../../../src/ui/common/Shell";
import { defaultContext } from "../../../../../../../src/services/context";
import { getProjectBySlug } from "../../../../../../../src/services/projectService";
import { getPromptBySlug } from "../../../../../../../src/services/promptService";
import { getVersionDetail } from "../../../../../../../src/services/versionService";
import { listSuggestions } from "../../../../../../../src/services/refinementService";
import {
  diagnoseAction,
  acceptSuggestionAction,
  rejectSuggestionAction,
} from "../../../../../../actions/refine";

export default async function RefinePage({
  params,
}: {
  params: Promise<{ project: string; prompt: string; version: string }>;
}) {
  const { project: projectSlug, prompt: promptSlug, version: versionId } = await params;
  const project = await getProjectBySlug(defaultContext(), projectSlug);
  const prompt = await getPromptBySlug(defaultContext(), project.id, promptSlug);
  const version = await getVersionDetail(defaultContext(), versionId);
  const suggestions = await listSuggestions(defaultContext(), versionId);

  const boundDiagnose = diagnoseAction.bind(null, projectSlug, promptSlug, versionId);

  return (
    <Shell
      projectSlug={projectSlug}
      title={`Refine · ${prompt.name} · v${version.number}`}
      actions={
        <div className="flex gap-2">
          <form action={boundDiagnose}>
            <button className="rounded bg-ink-900 dark:bg-ink-100 text-ink-50 dark:text-ink-900 px-3 py-1.5 text-sm font-medium">
              Re-analyze
            </button>
          </form>
          <Link href={`/p/${projectSlug}/prompts/${promptSlug}/v/${versionId}`} className="rounded border border-ink-300/70 dark:border-ink-700 px-2.5 py-1 text-sm">← version</Link>
        </div>
      }
    >
      {suggestions.length === 0 ? (
        <p className="text-sm text-ink-500">
          No suggestions yet. Click <em>Re-analyze</em> to diagnose this version.
        </p>
      ) : (
        <ul className="space-y-6">
          {suggestions.map((s) => {
            const diag = safeJson<Array<{ code: string; severity: string; detail: string; analyzer: string }>>(s.diagnosis) ?? [];
            const boundAccept = acceptSuggestionAction.bind(null, projectSlug, promptSlug, s.id);
            const boundReject = rejectSuggestionAction.bind(null, projectSlug, promptSlug, versionId, s.id);
            return (
              <li key={s.id} className="rounded border border-ink-200/70 dark:border-ink-800 p-4">
                <div className="flex items-baseline gap-3 text-xs text-ink-500 mb-3">
                  <span>{new Date(s.createdAt).toISOString().slice(0, 16).replace("T", " ")}</span>
                  <span className="font-mono">{s.status}</span>
                </div>

                <div className="grid grid-cols-[1fr_2fr] gap-4">
                  <section>
                    <h3 className="text-xs uppercase tracking-wider text-ink-500 mb-2">Diagnostics</h3>
                    {diag.length === 0 ? (
                      <p className="text-sm text-ink-500">No findings.</p>
                    ) : (
                      <ul className="space-y-1.5 text-sm">
                        {diag.map((f, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span
                              className={`inline-block mt-1 h-1.5 w-1.5 rounded-full ${
                                f.severity === "error"
                                  ? "bg-rose-500"
                                  : f.severity === "warn"
                                    ? "bg-amber-500"
                                    : "bg-ink-400"
                              }`}
                            />
                            <span>
                              <div className="font-mono text-xs text-ink-500">{f.code}</div>
                              <div>{f.detail}</div>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  <section>
                    <h3 className="text-xs uppercase tracking-wider text-ink-500 mb-2">Proposed body</h3>
                    <pre className="code whitespace-pre-wrap rounded border border-ink-200/70 dark:border-ink-800 p-3 bg-ink-100/30 dark:bg-ink-900/40 mb-3">{s.proposedBody}</pre>
                    <div className="text-xs text-ink-500 mb-4">
                      <strong>Rationale:</strong> {s.rationale}
                    </div>

                    {s.status === "pending" && (
                      <div className="grid grid-cols-2 gap-3">
                        <form action={boundAccept} className="space-y-2">
                          <input name="changeSummary" required placeholder="change summary *" className={inputCls} />
                          <input name="expectedImprovement" placeholder="expected improvement" className={inputCls} />
                          <button className="rounded-md bg-emerald-600 text-white px-3 py-1.5 text-sm font-medium">Accept → fork new version</button>
                        </form>
                        <form action={boundReject} className="space-y-2">
                          <input name="reason" placeholder="reason (optional)" className={inputCls} />
                          <button className="rounded-md border border-rose-400 text-rose-700 dark:text-rose-300 px-3 py-1.5 text-sm font-medium">Reject</button>
                        </form>
                      </div>
                    )}
                  </section>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Shell>
  );
}

const inputCls =
  "w-full rounded border border-ink-300/70 dark:border-ink-700 bg-transparent px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ink-500";

function safeJson<T>(s: string | null | undefined): T | null {
  if (!s) return null;
  try { return JSON.parse(s) as T; } catch { return null; }
}
