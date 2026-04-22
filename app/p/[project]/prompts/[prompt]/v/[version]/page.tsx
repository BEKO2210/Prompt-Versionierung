import Link from "next/link";
import { Shell } from "../../../../../../../src/ui/common/Shell";
import { defaultContext } from "../../../../../../../src/services/context";
import { getProjectBySlug } from "../../../../../../../src/services/projectService";
import { getPromptBySlug } from "../../../../../../../src/services/promptService";
import { getVersionDetail } from "../../../../../../../src/services/versionService";
import { listModelProfiles } from "../../../../../../../src/services/modelProfileService";
import { StatusPill } from "../../../../../../../src/ui/common/StatusPill";
import {
  createVersionAction,
  forkBranchAction,
  promoteAction,
  transitionStatusAction,
} from "../../../../../../actions/prompts";
import { createRunAction } from "../../../../../../actions/runs";
import type { VersionStatus } from "../../../../../../../src/domain/status";

export default async function VersionDetailPage({
  params,
}: {
  params: Promise<{ project: string; prompt: string; version: string }>;
}) {
  const { project: projectSlug, prompt: promptSlug, version: versionId } = await params;
  const project = await getProjectBySlug(defaultContext(), projectSlug);
  const prompt = await getPromptBySlug(defaultContext(), project.id, promptSlug);
  const version = await getVersionDetail(defaultContext(), versionId);
  const models = await listModelProfiles(defaultContext(), project.id);

  const boundNewVersion = createVersionAction.bind(
    null,
    projectSlug,
    promptSlug,
    prompt.id,
    version.id,
    version.createdOnBranchId,
  );
  const boundFork = forkBranchAction.bind(null, projectSlug, promptSlug, prompt.id, version.id);
  const boundRun = createRunAction.bind(null, projectSlug, promptSlug, version.id);
  const boundPromote = promoteAction.bind(null, projectSlug, promptSlug, version.id);

  return (
    <Shell
      projectSlug={projectSlug}
      title={
        <span>
          <Link href={`/p/${projectSlug}/prompts/${promptSlug}`} className="hover:underline">{prompt.name}</Link>
          <span className="text-ink-400"> · </span>
          <span className="font-mono">v{version.number}</span>
          <span className="text-ink-400"> · </span>
          <span className="text-ink-700 dark:text-ink-200">{version.title}</span>
        </span>
      }
      actions={<StatusPill status={version.status} />}
    >
      <div className="grid grid-cols-[3fr_2fr] gap-6">
        <section className="min-w-0">
          <h2 className="text-xs uppercase tracking-wider text-ink-500 mb-2">Body</h2>
          <pre className="code whitespace-pre-wrap rounded border border-ink-200/70 dark:border-ink-800 p-4 bg-ink-100/30 dark:bg-ink-900/40">{version.body}</pre>

          {version.variables.length > 0 && (
            <>
              <h3 className="mt-6 text-xs uppercase tracking-wider text-ink-500 mb-2">Variables</h3>
              <ul className="rounded border border-ink-200/70 dark:border-ink-800 divide-y divide-ink-200/70 dark:divide-ink-800">
                {version.variables.map((v) => (
                  <li key={v.id} className="px-3 py-2 text-sm flex items-baseline gap-3">
                    <span className="font-mono text-ink-800 dark:text-ink-100">{v.name}</span>
                    <span className="text-xs text-ink-500">{v.type}</span>
                    {v.required && <span className="text-xs text-rose-600 dark:text-rose-400">required</span>}
                    {v.description && <span className="text-ink-500 ml-auto truncate">{v.description}</span>}
                  </li>
                ))}
              </ul>
            </>
          )}

          <h3 className="mt-6 text-xs uppercase tracking-wider text-ink-500 mb-2">Runs</h3>
          {version.runs.length === 0 ? (
            <p className="text-sm text-ink-500">No runs yet.</p>
          ) : (
            <ul className="rounded border border-ink-200/70 dark:border-ink-800 divide-y divide-ink-200/70 dark:divide-ink-800">
              {version.runs.map((r) => {
                const scores = r.evaluations.map((e) => e.score).filter((s): s is number => s != null);
                const mean = scores.length > 0 ? scores.reduce((x, y) => x + y, 0) / scores.length : null;
                return (
                  <li key={r.id} className="px-3 py-2 text-sm flex items-center gap-3">
                    <span className="font-mono text-xs text-ink-500">{new Date(r.createdAt).toISOString().slice(0, 16).replace("T", " ")}</span>
                    <span>{r.testCase?.name ?? "ad-hoc"}</span>
                    <span className="text-ink-500">{r.modelProfile.name}</span>
                    <span className="ml-auto">
                      {r.status === "succeeded" ? `${r.latencyMs ?? "?"}ms` : r.status}
                    </span>
                    <span className="w-14 text-right">{mean === null ? "—" : mean.toFixed(2)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <aside className="min-w-0 space-y-6">
          <Card title="Metadata">
            <Row label="Number" value={`v${version.number}`} />
            <Row label="Branch" value={version.createdOnBranch.name} />
            <Row label="Parent" value={version.parentVersionId ? version.parentVersionId.slice(0, 10) + "…" : "root"} />
            <Row label="Hash" value={version.contentHash.slice(0, 12) + "…"} />
            <Row label="Created" value={new Date(version.createdAt).toISOString()} />
            {version.changeSummary && <Row label="Summary" value={version.changeSummary} />}
            {version.rationale && <Row label="Rationale" value={version.rationale} />}
            {version.expectedImprovement && <Row label="Hypothesis" value={version.expectedImprovement} />}
          </Card>

          <Card title="Edit (creates new version)">
            <form action={boundNewVersion} className="space-y-2 text-sm">
              <input name="title" defaultValue={version.title} className={inputCls} placeholder="title" />
              <textarea name="body" defaultValue={version.body} rows={8} className={`${inputCls} font-mono`} />
              <input name="changeSummary" required placeholder="change summary *" className={inputCls} />
              <input name="rationale" placeholder="rationale" className={inputCls} />
              <input name="expectedImprovement" placeholder="expected improvement (hypothesis)" className={inputCls} />
              <button className={btnPrimary}>Commit version</button>
            </form>
          </Card>

          <Card title="Fork branch">
            <form action={boundFork} className="flex items-center gap-2 text-sm">
              <input name="name" required placeholder="branch-name" className={inputCls} />
              <button className={btnSecondary}>Fork</button>
            </form>
          </Card>

          <Card title="Run">
            <form action={boundRun} className="space-y-2 text-sm">
              <select name="modelProfileId" required className={inputCls}>
                <option value="">-- model profile --</option>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>{m.name} · {m.provider}:{m.modelId}</option>
                ))}
              </select>
              <textarea
                name="bindings"
                rows={3}
                placeholder='{"name":"value"} variable bindings (JSON)'
                className={`${inputCls} font-mono`}
              />
              <label className="flex items-center gap-2"><input type="checkbox" name="evaluators" value="regex" /> regex</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="evaluators" value="schema" /> schema</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="evaluators" value="similarity" /> similarity</label>
              <button className={btnPrimary}>Run</button>
            </form>
          </Card>

          <Card title="Promote to canonical">
            <form action={boundPromote} className="space-y-2 text-sm">
              <input name="rationale" required placeholder="why promote? *" className={inputCls} />
              <select name="mode" className={inputCls}>
                <option value="pointer">Pointer promotion (fast-forward)</option>
                <option value="squashed">Squashed promotion (copy onto canonical)</option>
              </select>
              <button className={btnSecondary}>Promote</button>
            </form>
          </Card>

          <Card title="Status">
            <StatusActions
              projectSlug={projectSlug}
              promptSlug={promptSlug}
              versionId={version.id}
              current={version.status as VersionStatus}
            />
          </Card>
        </aside>
      </div>
    </Shell>
  );
}

const inputCls =
  "w-full rounded border border-ink-300/70 dark:border-ink-700 bg-transparent px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ink-500";
const btnPrimary =
  "rounded-md bg-ink-900 dark:bg-ink-100 text-ink-50 dark:text-ink-900 px-3 py-1.5 text-sm font-medium";
const btnSecondary =
  "rounded-md border border-ink-300/80 dark:border-ink-700 px-2.5 py-1 text-sm hover:bg-ink-100 dark:hover:bg-ink-800";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded border border-ink-200/70 dark:border-ink-800 p-3">
      <h3 className="text-[11px] uppercase tracking-wider text-ink-500 mb-2">{title}</h3>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-xs py-0.5">
      <span className="text-ink-500">{label}</span>
      <span className="font-mono truncate max-w-[60%]">{value}</span>
    </div>
  );
}

function StatusActions({
  projectSlug,
  promptSlug,
  versionId,
  current,
}: {
  projectSlug: string;
  promptSlug: string;
  versionId: string;
  current: VersionStatus;
}) {
  const all: VersionStatus[] = ["draft", "experimental", "candidate", "approved", "deprecated", "archived"];
  return (
    <div className="flex flex-wrap gap-1.5">
      {all.map((s) => {
        const bound = transitionStatusAction.bind(null, projectSlug, promptSlug, versionId, s);
        return (
          <form key={s} action={bound}>
            <button
              className={`text-xs px-2 py-0.5 rounded border ${
                s === current
                  ? "border-ink-900 dark:border-ink-100"
                  : "border-ink-300/70 dark:border-ink-700 hover:bg-ink-100 dark:hover:bg-ink-800"
              }`}
            >
              {s}
            </button>
          </form>
        );
      })}
    </div>
  );
}
