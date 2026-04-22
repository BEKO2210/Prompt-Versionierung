import Link from "next/link";
import { Shell } from "../../../../../../../src/ui/common/Shell";
import { Card } from "../../../../../../../src/ui/common/Card";
import { Button } from "../../../../../../../src/ui/common/Button";
import { Field, Input, Select, Textarea } from "../../../../../../../src/ui/common/Input";
import { Eyebrow } from "../../../../../../../src/ui/common/Eyebrow";
import { StatusPill } from "../../../../../../../src/ui/common/StatusPill";
import {
  IconArrow,
  IconBeaker,
  IconCompare,
  IconCrown,
  IconGitFork,
  IconSpark,
} from "../../../../../../../src/ui/common/Icon";
import { defaultContext } from "../../../../../../../src/services/context";
import { getProjectBySlug } from "../../../../../../../src/services/projectService";
import { getPromptBySlug } from "../../../../../../../src/services/promptService";
import { getVersionDetail } from "../../../../../../../src/services/versionService";
import { listModelProfiles } from "../../../../../../../src/services/modelProfileService";
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

  const isCanonicalHead = prompt.canonicalBranch?.headVersionId === version.id;

  return (
    <Shell
      projectSlug={projectSlug}
      currentPath={`/p/${projectSlug}/prompts`}
      title={
        <span className="flex items-center gap-2.5">
          <Link href={`/p/${projectSlug}/prompts/${promptSlug}`} className="text-ink-500 hover:text-ink-800 dark:hover:text-ink-100">
            {prompt.name}
          </Link>
          <IconArrow size={12} className="text-ink-300" />
          <span className="font-mono text-ink-600 dark:text-ink-300">v{version.number}</span>
          <IconArrow size={12} className="text-ink-300" />
          <span className="truncate">{version.title}</span>
        </span>
      }
      subtitle={
        <span className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1">
            <IconGitFork size={11} /> {version.createdOnBranch.name}
          </span>
          <span className="text-ink-300">·</span>
          <span>{new Date(version.createdAt).toISOString().slice(0, 16).replace("T", " ")}</span>
          {isCanonicalHead && (
            <>
              <span className="text-ink-300">·</span>
              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <IconCrown size={11} /> canonical head
              </span>
            </>
          )}
        </span>
      }
      actions={<StatusPill status={version.status} />}
    >
      <div className="grid grid-cols-1 xl:grid-cols-[1.6fr_1fr] gap-6">
        <div className="space-y-6 min-w-0">
          {/* Body */}
          <Card padded={false}>
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-ink-200/70 dark:border-ink-800/70">
              <div className="flex items-center gap-3">
                <Eyebrow>Body</Eyebrow>
                <span className="text-[11px] text-ink-500 font-mono">
                  sha256:{version.contentHash.slice(0, 10)}
                </span>
              </div>
              <span className="text-[11px] text-ink-500">
                {version.body.length} chars · {version.body.split(/\r?\n/).length} lines
              </span>
            </div>
            <pre className="codeblock px-4 py-4 text-ink-800 dark:text-ink-100 bg-ink-50/40 dark:bg-ink-950/40">
              {version.body}
            </pre>
          </Card>

          {/* Variables */}
          {version.variables.length > 0 && (
            <Card padded={false}>
              <div className="px-4 py-2.5 border-b border-ink-200/70 dark:border-ink-800/70">
                <Eyebrow>Variables</Eyebrow>
              </div>
              <ul className="divide-y divide-ink-200/70 dark:divide-ink-800/70">
                {version.variables.map((v) => (
                  <li key={v.id} className="px-4 py-2.5 flex items-baseline gap-3 text-sm">
                    <span className="font-mono text-ink-900 dark:text-ink-100">{v.name}</span>
                    <span className="text-[11px] text-ink-500 px-1.5 py-0.5 rounded bg-ink-100 dark:bg-ink-800">
                      {v.type}
                    </span>
                    {v.required && (
                      <span className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">
                        required
                      </span>
                    )}
                    {v.description && (
                      <span className="text-ink-500 dark:text-ink-400 ml-auto truncate">
                        {v.description}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Runs */}
          <Card padded={false}>
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-ink-200/70 dark:border-ink-800/70">
              <div className="flex items-center gap-2">
                <IconBeaker size={13} className="text-ink-500" />
                <Eyebrow>Runs</Eyebrow>
              </div>
              <span className="text-[11px] text-ink-500">{version.runs.length} total</span>
            </div>
            {version.runs.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-ink-500">
                No runs yet. Use the Run panel on the right to add evidence.
              </div>
            ) : (
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wider text-ink-500 bg-ink-50/50 dark:bg-ink-950/40">
                    <th className="px-4 py-2 font-medium">When</th>
                    <th className="px-4 py-2 font-medium">Test case</th>
                    <th className="px-4 py-2 font-medium">Model</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium text-right">Latency</th>
                    <th className="px-4 py-2 font-medium text-right">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-200/70 dark:divide-ink-800/70">
                  {version.runs.map((r) => {
                    const scores = r.evaluations.map((e) => e.score).filter((s): s is number => s != null);
                    const mean = scores.length > 0 ? scores.reduce((x, y) => x + y, 0) / scores.length : null;
                    return (
                      <tr key={r.id}>
                        <td className="px-4 py-2 font-mono text-[11px] text-ink-500 whitespace-nowrap">
                          {new Date(r.createdAt).toISOString().slice(5, 16).replace("T", " ")}
                        </td>
                        <td className="px-4 py-2">{r.testCase?.name ?? <span className="text-ink-400">ad-hoc</span>}</td>
                        <td className="px-4 py-2 text-ink-500">{r.modelProfile.name}</td>
                        <td className="px-4 py-2">
                          <RunStatusBadge status={r.status} />
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-[12px] text-ink-500">
                          {r.latencyMs != null ? `${r.latencyMs}ms` : "—"}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-[12px]">
                          {mean === null ? (
                            <span className="text-ink-400">—</span>
                          ) : (
                            <ScoreCell score={mean} />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Card>

          {/* Change metadata */}
          {(version.changeSummary || version.rationale || version.expectedImprovement) && (
            <Card>
              <Eyebrow className="mb-2">Why this version exists</Eyebrow>
              <dl className="space-y-2 text-[13px]">
                {version.changeSummary && (
                  <Info label="Change summary" value={version.changeSummary} />
                )}
                {version.rationale && <Info label="Rationale" value={version.rationale} />}
                {version.expectedImprovement && (
                  <Info label="Expected improvement" value={version.expectedImprovement} />
                )}
              </dl>
            </Card>
          )}
        </div>

        {/* Right column: actions */}
        <aside className="space-y-4 min-w-0">
          <Card>
            <Eyebrow className="mb-3">Edit → new version</Eyebrow>
            <form action={boundNewVersion} className="space-y-3">
              <Field label="Title">
                <Input name="title" defaultValue={version.title} required />
              </Field>
              <Field label="Body" required>
                <Textarea name="body" defaultValue={version.body} rows={8} required />
              </Field>
              <Field label="Change summary" required hint="One line. What changed.">
                <Input name="changeSummary" required placeholder="Tightened output format" />
              </Field>
              <Field label="Rationale">
                <Input name="rationale" placeholder="Why is this change being made" />
              </Field>
              <Field label="Expected improvement">
                <Input name="expectedImprovement" placeholder="Hypothesis you can test against" />
              </Field>
              <Button type="submit" variant="primary">Commit version</Button>
            </form>
          </Card>

          <Card>
            <Eyebrow className="mb-3">Fork branch from this version</Eyebrow>
            <form action={boundFork} className="flex gap-2">
              <Input name="name" required placeholder="experiment-tone" />
              <Button type="submit" variant="secondary">
                <IconGitFork size={13} /> Fork
              </Button>
            </form>
          </Card>

          <Card>
            <div className="flex items-center gap-2 mb-3">
              <IconBeaker size={13} className="text-ink-500" />
              <Eyebrow>Run</Eyebrow>
            </div>
            <form action={boundRun} className="space-y-3">
              <Field label="Model profile" required>
                <Select name="modelProfileId" required defaultValue="">
                  <option value="">— choose —</option>
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} · {m.provider}:{m.modelId}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Variable bindings" hint='JSON like {"name":"value"}'>
                <Textarea name="bindings" rows={3} placeholder='{"ticket":"I was charged twice"}' />
              </Field>
              <div>
                <div className="text-xs font-medium text-ink-600 dark:text-ink-300 mb-1.5">
                  Evaluators
                </div>
                <div className="grid grid-cols-2 gap-1.5 text-xs">
                  <Check name="evaluators" value="regex" label="Regex / contains" />
                  <Check name="evaluators" value="schema" label="JSON schema" />
                  <Check name="evaluators" value="similarity" label="Similarity" />
                  <Check name="evaluators" value="rubric" label="Rubric (stage)" />
                </div>
              </div>
              <Button type="submit" variant="accent">
                <IconBeaker size={13} /> Run
              </Button>
            </form>
          </Card>

          <Card>
            <div className="flex items-center gap-2 mb-3">
              <IconCrown size={13} className="text-emerald-600 dark:text-emerald-400" />
              <Eyebrow>Promote to canonical</Eyebrow>
            </div>
            <form action={boundPromote} className="space-y-3">
              <Field label="Rationale" required>
                <Input name="rationale" required placeholder="Why promote?" />
              </Field>
              <Field label="Mode">
                <Select name="mode" defaultValue="pointer">
                  <option value="pointer">Pointer (fast-forward)</option>
                  <option value="squashed">Squashed (copy onto canonical)</option>
                </Select>
              </Field>
              <Button type="submit" variant="secondary">Promote</Button>
            </form>
          </Card>

          <Card>
            <div className="flex items-center gap-2 mb-3">
              <IconSpark size={13} className="text-accent-600 dark:text-accent-400" />
              <Eyebrow>Status transitions</Eyebrow>
            </div>
            <StatusGrid
              projectSlug={projectSlug}
              promptSlug={promptSlug}
              versionId={version.id}
              current={version.status as VersionStatus}
            />
          </Card>

          <Card>
            <Eyebrow className="mb-3">Quick links</Eyebrow>
            <div className="flex flex-col gap-2">
              <Link
                href={`/p/${projectSlug}/prompts/${promptSlug}/compare?b=${version.id}`}
                className="text-sm text-ink-700 dark:text-ink-200 hover:text-accent-600 dark:hover:text-accent-400 flex items-center gap-2"
              >
                <IconCompare size={13} /> Compare against another version
              </Link>
              <Link
                href={`/p/${projectSlug}/prompts/${promptSlug}/refine/${version.id}`}
                className="text-sm text-ink-700 dark:text-ink-200 hover:text-accent-600 dark:hover:text-accent-400 flex items-center gap-2"
              >
                <IconSpark size={13} /> Open refinement workspace
              </Link>
            </div>
          </Card>
        </aside>
      </div>
    </Shell>
  );
}

function Check({ name, value, label }: { name: string; value: string; label: string }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none rounded-md px-2 py-1 hover:bg-ink-50 dark:hover:bg-ink-800/60">
      <input type="checkbox" name={name} value={value} className="accent-accent-600" />
      <span className="text-ink-700 dark:text-ink-300">{label}</span>
    </label>
  );
}

function RunStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    succeeded: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-200",
    running:   "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-200",
    queued:    "bg-ink-100 text-ink-600 ring-ink-200 dark:bg-ink-800 dark:text-ink-300",
    failed:    "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-200",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ${map[status] ?? map.queued}`}>
      {status}
    </span>
  );
}

function ScoreCell({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color =
    score >= 0.8
      ? "text-emerald-600 dark:text-emerald-400"
      : score >= 0.5
        ? "text-amber-600 dark:text-amber-400"
        : "text-rose-600 dark:text-rose-400";
  return <span className={color}>{pct}%</span>;
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wider text-ink-500">{label}</dt>
      <dd className="text-ink-800 dark:text-ink-100 leading-relaxed">{value}</dd>
    </div>
  );
}

function StatusGrid({
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
        const isCurrent = s === current;
        return (
          <form key={s} action={bound}>
            <button
              className={`text-[11px] px-2 py-0.5 rounded-md border transition-colors ${
                isCurrent
                  ? "border-ink-900 bg-ink-900 text-ink-50 dark:border-ink-100 dark:bg-ink-100 dark:text-ink-900"
                  : "border-ink-200 hover:bg-ink-50 text-ink-700 dark:border-ink-700 dark:hover:bg-ink-800/60 dark:text-ink-300"
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
