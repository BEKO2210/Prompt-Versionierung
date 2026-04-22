// runFormat.js — canonical JSON envelope for a Prompt Tree run.
//
// One run produces one self-contained document. A reader who only has
// this document can reproduce the call (same prompt body, same bindings,
// same model + settings), can score the output (expectedOutput +
// expectedKind are present), and can attribute it (project, prompt,
// version, author, branch, content hash, all here).
//
// Schema is VERSIONED so we can evolve it without breaking external
// tooling. See docs/run-format.md for the full reference.

export const RUN_SCHEMA = "prompt-tree-run/1";
export const RUNS_BUNDLE_SCHEMA = "prompt-tree-runs/1";

function iso(t) {
  return (t == null) ? null : new Date(t).toISOString();
}

function findRun(state, runId) {
  for (const project of state.projects || []) {
    for (const prompt of project.prompts || []) {
      const run = (prompt.runs || []).find((r) => r.id === runId);
      if (run) return { project, prompt, run };
    }
  }
  return null;
}

function findContext(state, promptId, versionId) {
  for (const project of state.projects || []) {
    const prompt = project.prompts.find((p) => p.id === promptId);
    if (!prompt) continue;
    const version = prompt.versions.find((v) => v.id === versionId) || null;
    return { project, prompt, version };
  }
  return null;
}

function memberOf(project, id) {
  if (!id) return null;
  const m = (project.members || []).find((x) => x.id === id);
  return m ? { id: m.id, name: m.name } : { id, name: id };
}

function findTestCase(project, id) {
  if (!id) return null;
  for (const d of project.datasets || []) {
    for (const tc of d.testCases || []) if (tc.id === id) {
      return {
        id: tc.id,
        name: tc.name,
        expectedOutput: tc.expectedOutput,
        expectedKind: tc.expectedKind,
        datasetId: d.id, datasetName: d.name,
      };
    }
  }
  return null;
}

// Build the canonical envelope for a single run. Returns null if the run
// can't be located in the state.
export function serializeRun(state, runId) {
  const found = findRun(state, runId);
  if (!found) return null;
  const { project, prompt, run } = found;
  const version = prompt.versions.find((v) => v.id === run.versionId) || null;
  const profile = (project.modelProfiles || []).find((m) => m.id === run.modelProfileId) || null;
  const branch  = version ? prompt.branches.find((b) => b.id === version.createdOnBranchId) : null;
  const tc = findTestCase(project, run.testCaseId);
  const evals = (prompt.evaluations || []).filter((e) => e.runId === run.id);

  return {
    schema: RUN_SCHEMA,
    exportedAt: new Date().toISOString(),

    run: {
      id: run.id,
      createdAt: iso(run.createdAt),
      startedAt: iso(run.startedAt),
      finishedAt: iso(run.finishedAt),
      status: run.status,
      error: run.error ?? null,
      latencyMs: run.latencyMs ?? null,
      mocked: !!run.mocked,
      mockedReason: run.mockedReason ?? null,
      providerResponseId: run.providerResponseId ?? null,
    },

    project: { id: project.id, slug: project.slug, name: project.name },
    prompt:  { id: prompt.id, slug: prompt.slug, name: prompt.name, purpose: prompt.purpose ?? null },
    version: version ? {
      id: version.id,
      number: version.number,
      title: version.title,
      branch: branch?.name ?? null,
      branchId: version.createdOnBranchId,
      contentHash: version.contentHash,
      status: version.status,
      body: version.body,
      messages: version.messages ?? null,
      variables: (version.variables || []).map((v) => ({
        name: v.name, type: v.type, required: !!v.required,
        description: v.description ?? null,
        defaultValue: v.defaultValue ?? null,
        enumValues: v.enumValues ?? null,
      })),
      changeSummary: version.changeSummary ?? null,
      rationale: version.rationale ?? null,
      expectedImprovement: version.expectedImprovement ?? null,
      createdAt: iso(version.createdAt),
      author: memberOf(project, version.createdBy),
    } : null,

    input: {
      renderedPrompt: run.renderedPrompt ?? null,
      variableBindings: run.variableBindings ?? null,
      testCase: tc,
    },

    model: profile ? {
      profileId: profile.id,
      profileName: profile.name,
      provider: profile.provider,
      modelId: profile.modelId,
      temperature: run.temperature ?? profile.defaultTemperature ?? null,
      maxTokens: run.maxTokens ?? profile.defaultMaxTokens ?? null,
    } : {
      profileId: run.modelProfileId,
      profileName: null,
      provider: run.provider ?? null,
      modelId: null,
      temperature: run.temperature ?? null,
      maxTokens: run.maxTokens ?? null,
    },

    output: {
      raw: run.rawOutput ?? null,
      structured: run.structuredOutput ?? null,
    },

    usage: {
      inputTokens:  run.inputTokens ?? null,
      outputTokens: run.outputTokens ?? null,
      costEstimate: run.costEstimate ?? null,
    },

    evaluations: evals.map((e) => ({
      id: e.id,
      evaluatorKind: e.evaluatorKind,
      score: e.score,
      passed: e.passed,
      notes: e.notes,
      criteriaScores: e.criteriaScores ?? null,
      rubricId: e.rubricId ?? null,
      createdAt: iso(e.createdAt),
    })),

    actor: memberOf(project, run.createdBy ?? state.meta?.currentActor),
  };
}

// Bundle: every run for a single version, in the same canonical envelope.
// Useful for "export all runs of this version" — downstream tools can
// process each entry independently.
export function serializeRunsForVersion(state, promptId, versionId) {
  const ctx = findContext(state, promptId, versionId);
  if (!ctx) return null;
  const runs = (ctx.prompt.runs || [])
    .filter((r) => r.versionId === versionId)
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((r) => serializeRun(state, r.id))
    .filter(Boolean);
  return {
    schema: RUNS_BUNDLE_SCHEMA,
    exportedAt: new Date().toISOString(),
    context: {
      project: { id: ctx.project.id, slug: ctx.project.slug, name: ctx.project.name },
      prompt:  { id: ctx.prompt.id, slug: ctx.prompt.slug, name: ctx.prompt.name },
      version: ctx.version
        ? { id: ctx.version.id, number: ctx.version.number, title: ctx.version.title,
            contentHash: ctx.version.contentHash }
        : null,
    },
    runs,
  };
}

// Tiny convenience for browser download.
export function downloadJSON(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

// Filename that is sortable + human-readable + safe.
export function fileNameForRun(envelope) {
  const v = envelope.version?.number ? `v${envelope.version.number}` : "vN";
  const stamp = (envelope.run?.startedAt || envelope.exportedAt).replace(/[:.]/g, "-").slice(0, 19);
  return `run_${envelope.prompt.slug}_${v}_${envelope.run.id}_${stamp}.json`;
}
export function fileNameForRunsBundle(bundle) {
  const v = bundle.context?.version?.number ? `v${bundle.context.version.number}` : "vN";
  const stamp = bundle.exportedAt.replace(/[:.]/g, "-").slice(0, 19);
  return `runs_${bundle.context.prompt.slug}_${v}_${stamp}.json`;
}

// Cheap in-browser clipboard copy.
export async function copyJSON(payload) {
  const text = JSON.stringify(payload, null, 2);
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  // Fallback for older browsers.
  const ta = document.createElement("textarea");
  ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
  document.body.appendChild(ta); ta.select();
  let ok = false; try { ok = document.execCommand("copy"); } catch {}
  ta.remove(); return ok;
}
