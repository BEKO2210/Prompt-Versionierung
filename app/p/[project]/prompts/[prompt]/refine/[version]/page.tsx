import Link from "next/link";
import { Shell } from "../../../../../../../src/ui/common/Shell";
import { Card } from "../../../../../../../src/ui/common/Card";
import { Button } from "../../../../../../../src/ui/common/Button";
import { Field, Input } from "../../../../../../../src/ui/common/Input";
import { Eyebrow } from "../../../../../../../src/ui/common/Eyebrow";
import { IconArrow, IconSpark } from "../../../../../../../src/ui/common/Icon";
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
      currentPath={`/p/${projectSlug}/prompts`}
      title={
        <span className="flex items-center gap-2.5">
          <IconSpark size={14} className="text-accent-600 dark:text-accent-400" />
          Refine
          <IconArrow size={12} className="text-ink-300" />
          <Link href={`/p/${projectSlug}/prompts/${promptSlug}`} className="text-ink-500 hover:text-ink-800 dark:hover:text-ink-100">
            {prompt.name}
          </Link>
          <IconArrow size={12} className="text-ink-300" />
          <span className="font-mono text-ink-600 dark:text-ink-300">v{version.number}</span>
        </span>
      }
      subtitle="Analyzers flag weaknesses and propose a better variant. Accept forks a new version."
      actions={
        <div className="flex gap-2">
          <form action={boundDiagnose}>
            <Button type="submit" variant="accent">
              <IconSpark size={13} /> Re-analyze
            </Button>
          </form>
          <Link href={`/p/${projectSlug}/prompts/${promptSlug}/v/${versionId}`}>
            <Button variant="secondary">← Back to version</Button>
          </Link>
        </div>
      }
    >
      {suggestions.length === 0 ? (
        <Card className="p-10 text-center border-dashed">
          <div className="mx-auto w-10 h-10 rounded-full bg-accent-50 dark:bg-accent-500/10 text-accent-600 dark:text-accent-400 flex items-center justify-center mb-3">
            <IconSpark size={16} />
          </div>
          <div className="font-medium text-ink-800 dark:text-ink-100">No suggestions yet</div>
          <p className="text-sm text-ink-500 mt-1 max-w-md mx-auto">
            Click <em>Re-analyze</em> above. The five built-in analyzers scan
            this version for vague verbs, missing role, missing output format,
            redundancy, and under-specification.
          </p>
        </Card>
      ) : (
        <ul className="space-y-5">
          {suggestions.map((s) => {
            const diag = safeJson<Array<{ code: string; severity: "info" | "warn" | "error"; detail: string; analyzer: string }>>(s.diagnosis) ?? [];
            const boundAccept = acceptSuggestionAction.bind(null, projectSlug, promptSlug, s.id);
            const boundReject = rejectSuggestionAction.bind(null, projectSlug, promptSlug, versionId, s.id);
            return (
              <li key={s.id}>
                <Card padded={false}>
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-ink-200/70 dark:border-ink-800/70">
                    <div className="flex items-center gap-3">
                      <Eyebrow>Suggestion</Eyebrow>
                      <span className="font-mono text-[11px] text-ink-500">
                        {new Date(s.createdAt).toISOString().slice(0, 16).replace("T", " ")}
                      </span>
                    </div>
                    <SuggestionStatusBadge status={s.status} />
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.8fr]">
                    <section className="px-4 py-4 border-b lg:border-b-0 lg:border-r border-ink-200/70 dark:border-ink-800/70">
                      <Eyebrow className="mb-3">Diagnostics ({diag.length})</Eyebrow>
                      {diag.length === 0 ? (
                        <p className="text-sm text-ink-500">No findings.</p>
                      ) : (
                        <ul className="space-y-2.5 text-sm">
                          {diag.map((f, i) => (
                            <li key={i} className="flex gap-2.5">
                              <SeverityDot severity={f.severity} />
                              <span className="min-w-0">
                                <div className="font-mono text-[11px] text-ink-500">{f.code}</div>
                                <div className="text-ink-800 dark:text-ink-100 leading-snug">{f.detail}</div>
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>

                    <section className="px-4 py-4">
                      <Eyebrow className="mb-2">Proposed body</Eyebrow>
                      <pre className="codeblock rounded-lg border border-ink-200/70 dark:border-ink-800/70 bg-ink-50/40 dark:bg-ink-950/40 p-3 mb-3">
                        {s.proposedBody}
                      </pre>
                      <div className="rounded-lg bg-accent-50/60 dark:bg-accent-500/5 border border-accent-200/50 dark:border-accent-500/20 p-3 mb-4">
                        <div className="eyebrow mb-1">Rationale</div>
                        <p className="text-[13px] text-ink-800 dark:text-ink-100">{s.rationale}</p>
                      </div>

                      {s.status === "pending" && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <form action={boundAccept} className="space-y-2">
                            <Field label="Change summary" required>
                              <Input name="changeSummary" required placeholder="Accept refinement proposal" />
                            </Field>
                            <Field label="Expected improvement">
                              <Input name="expectedImprovement" placeholder="Hypothesis you can test" />
                            </Field>
                            <button className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-3 py-1.5 shadow-soft">
                              Accept → fork new version
                            </button>
                          </form>
                          <form action={boundReject} className="space-y-2">
                            <Field label="Reason">
                              <Input name="reason" placeholder="Why reject (optional)" />
                            </Field>
                            <button className="w-full rounded-lg border border-rose-300 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-500/10 text-sm font-medium px-3 py-1.5">
                              Reject suggestion
                            </button>
                          </form>
                        </div>
                      )}
                    </section>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </Shell>
  );
}

function SeverityDot({ severity }: { severity: "info" | "warn" | "error" }) {
  const color =
    severity === "error"
      ? "bg-rose-500"
      : severity === "warn"
        ? "bg-amber-500"
        : "bg-ink-400";
  return <span className={`mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${color}`} />;
}

function SuggestionStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending:  "bg-accent-50 text-accent-700 ring-accent-200 dark:bg-accent-500/10 dark:text-accent-200",
    accepted: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-200",
    rejected: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-200",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ring-1 ${map[status] ?? map.pending}`}>
      {status}
    </span>
  );
}

function safeJson<T>(s: string | null | undefined): T | null {
  if (!s) return null;
  try { return JSON.parse(s) as T; } catch { return null; }
}
