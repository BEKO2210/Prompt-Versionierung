// services.js — operations on the in-memory state. Every mutation goes
// through here. Versions are append-only (only `status` may transition).

import { mutate, getState } from "./store.js";
import {
  newId, slugify, contentHash, validateBranchName, suggestRefineBranchName,
  canTransition, analyze, propose, render, mockModelCall, evaluate,
  checkPointerPromotion, isDescendant,
} from "./domain.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function findProject(s, projectId) {
  const p = s.projects.find((x) => x.id === projectId);
  if (!p) throw new Error("Project not found: " + projectId);
  return p;
}
function findPrompt(s, promptId) {
  for (const p of s.projects) {
    const pr = p.prompts.find((x) => x.id === promptId);
    if (pr) return { project: p, prompt: pr };
  }
  throw new Error("Prompt not found: " + promptId);
}
function nextVersionNumber(prompt) {
  let max = 0;
  for (const v of prompt.versions) if (v.number > max) max = v.number;
  return max + 1;
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------
export function createProject({ name, description }) {
  let id;
  mutate((s) => {
    const slug = slugify(name);
    if (s.projects.some((p) => p.slug === slug)) throw new Error("Slug exists: " + slug);
    id = newId("prj");
    s.projects.push({
      id, slug, name: name.trim(),
      description: description?.trim() || "",
      createdAt: Date.now(), updatedAt: Date.now(),
      prompts: [], modelProfiles: [], datasets: [], rubrics: [],
      tags: [], decisions: [],
    });
  });
  return id;
}

export function archiveProject(projectId) {
  mutate((s) => { findProject(s, projectId).archivedAt = Date.now(); });
}

export function deleteProject(projectId) {
  mutate((s) => { s.projects = s.projects.filter((p) => p.id !== projectId); });
}

// ---------------------------------------------------------------------------
// Prompts (creates the prompt + main branch + initial version atomically)
// ---------------------------------------------------------------------------
export async function createPrompt({ projectId, name, purpose, description, initialVersion }) {
  const hash = await contentHash({
    title: initialVersion.title, body: initialVersion.body, messages: initialVersion.messages || null,
  });
  let promptId;
  mutate((s) => {
    const project = findProject(s, projectId);
    const slug = slugify(name);
    if (project.prompts.some((p) => p.slug === slug)) throw new Error("Prompt slug exists in project: " + slug);
    promptId = newId("prm");
    const branchId = newId("br");
    const versionId = newId("ver");
    const now = Date.now();
    project.prompts.push({
      id: promptId, slug, name: name.trim(),
      description: description?.trim() || "",
      purpose: purpose?.trim() || "",
      canonicalBranchId: branchId,
      createdAt: now, updatedAt: now,
      branches: [
        { id: branchId, name: "main", headVersionId: versionId, createdFromVersionId: null, status: "active", createdAt: now, color: pickColor(0) },
      ],
      versions: [{
        id: versionId, promptId, parentVersionId: null, createdOnBranchId: branchId,
        number: 1, contentHash: hash,
        title: initialVersion.title.trim(),
        body: initialVersion.body, messages: initialVersion.messages || null,
        status: "draft",
        variables: initialVersion.variables || [],
        changeSummary: "Initial version", rationale: "", expectedImprovement: "",
        createdAt: now, createdBy: s.meta?.author || null,
      }],
      runs: [], evaluations: [], notes: [], suggestions: [], comparisons: [], lineageEdges: [],
    });
  });
  return promptId;
}

export function archivePrompt(promptId) {
  mutate((s) => { findPrompt(s, promptId).prompt.archivedAt = Date.now(); });
}
export function deletePrompt(promptId) {
  mutate((s) => {
    for (const p of s.projects) p.prompts = p.prompts.filter((pr) => pr.id !== promptId);
  });
}

// ---------------------------------------------------------------------------
// Branches
// ---------------------------------------------------------------------------
export function createBranch({ promptId, name, fromVersionId }) {
  validateBranchName(name);
  let branchId;
  mutate((s) => {
    const { prompt } = findPrompt(s, promptId);
    if (prompt.branches.some((b) => b.name === name)) throw new Error("Branch exists: " + name);
    const fork = prompt.versions.find((v) => v.id === fromVersionId);
    if (!fork) throw new Error("Fork version not found");
    branchId = newId("br");
    prompt.branches.push({
      id: branchId, name, headVersionId: fork.id, createdFromVersionId: fork.id,
      status: "active", createdAt: Date.now(), color: pickColor(prompt.branches.length),
    });
    prompt.updatedAt = Date.now();
    pushActivity(prompt, "branch_created", { branchId, fromVersionId: fork.id, name }, s.meta?.currentActor);
  });
  return branchId;
}

export function archiveBranch({ promptId, branchId, rationale }) {
  mutate((s) => {
    const { prompt } = findPrompt(s, promptId);
    if (prompt.canonicalBranchId === branchId) throw new Error("Cannot archive canonical branch");
    const b = prompt.branches.find((x) => x.id === branchId);
    if (!b) throw new Error("Branch not found");
    b.status = "archived";
    prompt.decisions = prompt.decisions || [];
    prompt.decisions.push({
      id: newId("dec"), kind: "archive", versionId: null, branchId, rationale: rationale || "",
      decidedAt: Date.now(), decidedBy: s.meta?.author || null,
    });
  });
}

const PALETTE = ["#6366f1","#10b981","#f59e0b","#a855f7","#ec4899","#0ea5e9","#22c55e","#f43f5e","#14b8a6","#eab308"];
function pickColor(i) { return PALETTE[i % PALETTE.length]; }

// ---------------------------------------------------------------------------
// Activity log — single append-only list per prompt. Every state-changing
// service records one entry. Readers render it as a timeline.
// ---------------------------------------------------------------------------
function pushActivity(prompt, kind, metadata, actorId) {
  prompt.activities = prompt.activities || [];
  prompt.activities.push({
    id: newId("act"), kind,
    actorId: actorId || null,
    timestamp: Date.now(),
    metadata: metadata || {},
  });
}

export function listProjectActivity(project, { limit = 25 } = {}) {
  const out = [];
  for (const pr of project.prompts || []) {
    for (const a of pr.activities || []) {
      out.push({ ...a, promptId: pr.id, promptSlug: pr.slug, promptName: pr.name });
    }
  }
  out.sort((a, b) => b.timestamp - a.timestamp);
  return out.slice(0, limit);
}

export function listPromptActivity(prompt, { limit = 80 } = {}) {
  const out = [...(prompt.activities || [])];
  out.sort((a, b) => b.timestamp - a.timestamp);
  return out.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Versions
// ---------------------------------------------------------------------------
export async function createVersion({
  promptId, parentVersionId, branchId,
  title, body, messages = null, variables = [],
  status = "draft", changeSummary = "", rationale = "", expectedImprovement = "",
}) {
  if (!title?.trim()) throw new Error("title required");
  if (!body && !messages) throw new Error("body or messages required");
  if (!changeSummary?.trim()) throw new Error("changeSummary required");
  const hash = await contentHash({ title, body, messages });

  let versionId;
  mutate((s) => {
    const { prompt } = findPrompt(s, promptId);
    const branch = prompt.branches.find((b) => b.id === branchId);
    if (!branch) throw new Error("Branch not found");
    if (branch.status !== "active") throw new Error("Cannot commit to archived branch");
    const parent = prompt.versions.find((v) => v.id === parentVersionId);
    if (!parent) throw new Error("Parent version not found");

    versionId = newId("ver");
    const now = Date.now();
    const actor = s.meta?.currentActor || null;
    prompt.versions.push({
      id: versionId, promptId, parentVersionId, createdOnBranchId: branchId,
      number: nextVersionNumber(prompt), contentHash: hash,
      title: title.trim(), body, messages,
      variables, status,
      changeSummary, rationale, expectedImprovement,
      createdAt: now, createdBy: actor,
    });
    branch.headVersionId = versionId;
    prompt.updatedAt = now;
    pushActivity(prompt, "version_created",
      { versionId, branchId, number: prompt.versions.at(-1).number, title: title.trim(), changeSummary },
      actor);
  });
  return versionId;
}

export function transitionStatus({ promptId, versionId, to }) {
  mutate((s) => {
    const { prompt } = findPrompt(s, promptId);
    const v = prompt.versions.find((x) => x.id === versionId);
    if (!v) throw new Error("Version not found");
    if (!canTransition(v.status, to)) throw new Error(`Illegal transition: ${v.status} → ${to}`);
    v.status = to;
    prompt.updatedAt = Date.now();
  });
}

// Promotion (pointer or squashed). Always writes a decision.
export async function promote({ promptId, versionId, mode = "pointer", rationale }) {
  if (!rationale?.trim()) throw new Error("Rationale is required for any promotion");
  const s = getState();
  const { prompt } = findPrompt(s, promptId);
  const target = prompt.versions.find((v) => v.id === versionId);
  if (!target) throw new Error("Target version not found");
  const canon = prompt.branches.find((b) => b.id === prompt.canonicalBranchId);
  if (!canon) throw new Error("Canonical branch missing");

  if (mode === "pointer") {
    const c = checkPointerPromotion(prompt.versions, canon.headVersionId, versionId);
    if (!c.allowedPointer) throw new Error(c.reason);
    mutate((d) => {
      const { prompt: p } = findPrompt(d, promptId);
      const cb = p.branches.find((b) => b.id === p.canonicalBranchId);
      const prevHead = cb.headVersionId;
      cb.headVersionId = versionId;
      const actor = d.meta?.currentActor || null;
      p.decisions = p.decisions || [];
      p.decisions.push({
        id: newId("dec"), kind: "promote", versionId, rationale,
        metadata: { mode: "pointer", branchId: cb.id, previousHead: prevHead },
        decidedAt: Date.now(), decidedBy: actor,
      });
      p.updatedAt = Date.now();
      pushActivity(p, "version_promoted", { versionId, mode: "pointer", rationale }, actor);
    });
    return;
  }

  // squashed: create a new version on the canonical branch with copied content
  const hash = await contentHash({ title: target.title, body: target.body, messages: target.messages });
  mutate((d) => {
    const { prompt: p } = findPrompt(d, promptId);
    const cb = p.branches.find((b) => b.id === p.canonicalBranchId);
    const newId_ = newId("ver");
    const now = Date.now();
    const actor = d.meta?.currentActor || null;
    p.versions.push({
      id: newId_, promptId, parentVersionId: cb.headVersionId, createdOnBranchId: cb.id,
      number: nextVersionNumber(p), contentHash: hash,
      title: target.title, body: target.body, messages: target.messages,
      status: "approved",
      variables: structuredClone(target.variables),
      changeSummary: `Promoted from v${target.number} (squashed)`,
      rationale, expectedImprovement: "",
      createdAt: now, createdBy: actor,
    });
    cb.headVersionId = newId_;
    p.lineageEdges = p.lineageEdges || [];
    p.lineageEdges.push({ id: newId("edge"), fromVersionId: target.id, toVersionId: newId_, kind: "cherry_pick" });
    p.decisions = p.decisions || [];
    p.decisions.push({
      id: newId("dec"), kind: "promote", versionId: newId_, rationale,
      metadata: { mode: "squashed", sourceVersionId: target.id },
      decidedAt: now, decidedBy: actor,
    });
    p.updatedAt = now;
    pushActivity(p, "version_promoted",
      { versionId: newId_, mode: "squashed", sourceVersionId: target.id, rationale }, actor);
  });
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------
export function addNote({ promptId, versionId, kind = "observation", body, author }) {
  if (!body?.trim()) throw new Error("Note body required");
  mutate((s) => {
    const { prompt } = findPrompt(s, promptId);
    const actor = author || s.meta?.currentActor || null;
    prompt.notes = prompt.notes || [];
    const noteId = newId("note");
    prompt.notes.push({
      id: noteId, versionId, kind, body: body.trim(),
      author: actor, createdAt: Date.now(),
    });
    pushActivity(prompt, "note_added",
      { noteId, versionId, kind, excerpt: body.trim().slice(0, 80) }, actor);
  });
}

// ---------------------------------------------------------------------------
// Runs — two-phase: insert a `running` row, call the provider adapter,
// then update to `succeeded` or `failed` and attach evaluations.
//
// The function is async because real providers are network-bound. The
// returned promise resolves after the run row reaches a terminal state.
// Callers that want optimistic UX can `commit()` after each mutate to
// surface the running state immediately.
// ---------------------------------------------------------------------------
export async function createRun({ promptId, versionId, modelProfileId, testCaseId = null,
  variableBindings = {}, evaluators = [], temperature, maxTokens }) {
  const s = getState();
  const { project, prompt } = findPrompt(s, promptId);
  const v = prompt.versions.find((x) => x.id === versionId);
  if (!v) throw new Error("Version not found");
  const profile = project.modelProfiles.find((m) => m.id === modelProfileId);
  if (!profile) throw new Error("Model profile not found");

  let bindings = { ...variableBindings };
  let expectedOutput = null, expectedKind = "none";
  if (testCaseId) {
    const tc = (project.datasets || []).flatMap((d) => d.testCases || [])
      .find((c) => c.id === testCaseId);
    if (!tc) throw new Error("Test case not found");
    bindings = { ...tc.inputVariables, ...bindings };
    expectedOutput = tc.expectedOutput; expectedKind = tc.expectedKind;
  }

  const renderedPrompt = render(v.body, v.variables, bindings);
  const T = temperature ?? profile.defaultTemperature;
  const M = maxTokens ?? profile.defaultMaxTokens;

  // PHASE 1 — insert run as "running" so the UI can paint a spinner.
  const runId = newId("run");
  const startedAt = Date.now();
  mutate((d) => {
    const { prompt: p } = findPrompt(d, promptId);
    p.runs = p.runs || [];
    p.runs.push({
      id: runId, versionId, modelProfileId, testCaseId,
      renderedPrompt, variableBindings: bindings,
      rawOutput: null, structuredOutput: null,
      status: "running", error: null,
      temperature: T, maxTokens: M,
      latencyMs: null, inputTokens: null, outputTokens: null, costEstimate: 0,
      provider: profile.provider, providerResponseId: null, mocked: false, mockedReason: null,
      startedAt, finishedAt: null, createdAt: startedAt,
    });
  });

  // PHASE 2 — pick adapter, perform the call.
  // resolveForRun() falls back to mock if the configured provider needs a
  // key and none is set — the run row is then annotated `mocked=true`.
  const { adapter, willMock, reason } =
    await (await import("./adapters/models/registry.js")).resolveForRun(profile.provider);

  let result, error;
  try {
    result = await adapter.call({
      prompt: renderedPrompt,
      messages: v.messages || null,
      modelId: profile.modelId,
      temperature: T,
      maxTokens: M,
    });
  } catch (err) {
    error = err;
  }

  // PHASE 3 — write outcome + evaluations atomically.
  mutate((d) => {
    const { prompt: p } = findPrompt(d, promptId);
    const run = (p.runs || []).find((r) => r.id === runId);
    if (!run) return;
    const now = Date.now();
    if (error) {
      run.status = "failed";
      run.error = error.message || String(error);
      run.finishedAt = now;
      run.latencyMs = now - startedAt;
      run.mocked = willMock;
      run.mockedReason = willMock ? reason : null;
      pushActivity(p, "run_completed",
        { runId, versionId, score: null, testCaseId, failed: true, error: run.error },
        d.meta?.currentActor);
      return;
    }
    run.status = "succeeded";
    run.rawOutput = result.rawOutput;
    run.structuredOutput = tryParseJSON(result.rawOutput);
    run.latencyMs = result.latencyMs ?? (now - startedAt);
    run.inputTokens = result.inputTokens;
    run.outputTokens = result.outputTokens;
    run.providerResponseId = result.providerResponseId || null;
    run.finishedAt = now;
    run.mocked = willMock;
    run.mockedReason = willMock ? reason : null;

    // Run evaluators against the real raw output.
    let meanScore = null;
    const scored = [];
    for (const kind of evaluators) {
      const e = evaluate(kind, { rawOutput: result.rawOutput, expectedOutput, expectedKind });
      p.evaluations = p.evaluations || [];
      p.evaluations.push({
        id: newId("eval"), runId, evaluatorKind: e.kind,
        evaluatorRef: null, rubricId: null,
        score: e.score, passed: e.passed, notes: e.notes,
        createdAt: now,
      });
      if (e.score != null) scored.push(e.score);
    }
    if (scored.length) meanScore = scored.reduce((a, b) => a + b, 0) / scored.length;
    pushActivity(p, "run_completed",
      { runId, versionId, score: meanScore, testCaseId, mocked: willMock },
      d.meta?.currentActor);
  });
  return runId;
}
function tryParseJSON(s) { try { return JSON.parse(s); } catch { return null; } }

// ---------------------------------------------------------------------------
// Refinement: diagnose → suggest → accept/reject
// ---------------------------------------------------------------------------
export function diagnoseAndPropose(promptId, versionId) {
  const s = getState();
  const { prompt } = findPrompt(s, promptId);
  const v = prompt.versions.find((x) => x.id === versionId);
  if (!v) throw new Error("Version not found");
  const findings = analyze({ title: v.title, body: v.body, messages: v.messages, variables: v.variables });
  const proposal = propose({ title: v.title, body: v.body, variables: v.variables, findings });
  let suggestionId;
  mutate((d) => {
    const { prompt: p } = findPrompt(d, promptId);
    p.suggestions = p.suggestions || [];
    suggestionId = newId("sug");
    p.suggestions.push({
      id: suggestionId, versionId, diagnosis: findings,
      proposedTitle: proposal.proposedTitle, proposedBody: proposal.proposedBody,
      proposedVariables: proposal.proposedVariables, rationale: proposal.rationale,
      status: "pending", createdVersionId: null,
      createdAt: Date.now(),
    });
  });
  return { suggestionId, findings };
}

export async function acceptSuggestion({ promptId, suggestionId, changeSummary, rationale = "", expectedImprovement = "" }) {
  const s = getState();
  const { prompt } = findPrompt(s, promptId);
  const sug = (prompt.suggestions || []).find((x) => x.id === suggestionId);
  if (!sug) throw new Error("Suggestion not found");
  if (sug.status !== "pending") throw new Error("Suggestion already " + sug.status);
  const sourceV = prompt.versions.find((v) => v.id === sug.versionId);
  if (!sourceV) throw new Error("Source version missing");
  // Fork a new branch and create the version on it.
  const branchName = suggestRefineBranchName(sourceV.number);
  const branchId = createBranch({ promptId, name: branchName, fromVersionId: sourceV.id });
  const versionId = await createVersion({
    promptId, parentVersionId: sourceV.id, branchId,
    title: sug.proposedTitle, body: sug.proposedBody,
    variables: sug.proposedVariables,
    changeSummary, rationale, expectedImprovement,
    status: "experimental",
  });
  mutate((d) => {
    const { prompt: p } = findPrompt(d, promptId);
    const ss = p.suggestions.find((x) => x.id === suggestionId);
    if (ss) { ss.status = "accepted"; ss.createdVersionId = versionId; }
    p.lineageEdges = p.lineageEdges || [];
    p.lineageEdges.push({ id: newId("edge"), fromVersionId: sourceV.id, toVersionId: versionId, kind: "refinement" });
  });
  return { branchId, versionId };
}

export function rejectSuggestion({ promptId, suggestionId, reason }) {
  mutate((s) => {
    const { prompt } = findPrompt(s, promptId);
    const ss = (prompt.suggestions || []).find((x) => x.id === suggestionId);
    if (!ss) throw new Error("Suggestion not found");
    ss.status = "rejected"; ss.rationale = reason ? `REJECTED: ${reason}` : "rejected";
  });
}

// ---------------------------------------------------------------------------
// Datasets / test cases / model profiles / rubrics
// ---------------------------------------------------------------------------
export function createDataset({ projectId, name, description }) {
  let id;
  mutate((s) => {
    const p = findProject(s, projectId);
    if ((p.datasets || []).some((d) => d.name === name)) throw new Error("Dataset exists");
    id = newId("ds");
    p.datasets = p.datasets || [];
    p.datasets.push({ id, name: name.trim(), description: description?.trim() || "", testCases: [] });
  });
  return id;
}
export function createTestCase({ projectId, datasetId, name, inputVariables, expectedOutput, expectedKind }) {
  let id;
  mutate((s) => {
    const p = findProject(s, projectId);
    const ds = (p.datasets || []).find((d) => d.id === datasetId);
    if (!ds) throw new Error("Dataset not found");
    id = newId("tc");
    ds.testCases.push({
      id, name: name.trim(), inputVariables: inputVariables || {},
      expectedOutput: expectedOutput || null, expectedKind: expectedKind || "none",
      assertions: null, createdAt: Date.now(),
    });
  });
  return id;
}
export function createModelProfile({ projectId, name, provider = "mock", modelId,
  defaultTemperature = 0.7, defaultMaxTokens = 1024 }) {
  let id;
  mutate((s) => {
    const p = findProject(s, projectId);
    if ((p.modelProfiles || []).some((m) => m.name === name)) throw new Error("Profile exists");
    id = newId("mp");
    p.modelProfiles = p.modelProfiles || [];
    p.modelProfiles.push({ id, name, provider, modelId, defaultTemperature, defaultMaxTokens });
  });
  return id;
}
export function createRubric({ projectId, name, description, criteria }) {
  let id;
  mutate((s) => {
    const p = findProject(s, projectId);
    if ((p.rubrics || []).some((r) => r.name === name)) throw new Error("Rubric exists");
    id = newId("rub");
    p.rubrics = p.rubrics || [];
    p.rubrics.push({ id, name, description: description || "", criteria });
  });
  return id;
}

// ---------------------------------------------------------------------------
// Search (cheap full-text scan, scoped per project)
// ---------------------------------------------------------------------------
export function search(projectId, q) {
  if (!q) return [];
  const needle = q.toLowerCase();
  const s = getState();
  const project = projectId ? findProject(s, projectId) : null;
  const projects = project ? [project] : s.projects;
  const out = [];
  for (const p of projects) {
    for (const pr of p.prompts) {
      if (matches(pr.name, needle) || matches(pr.description, needle) || matches(pr.purpose, needle)) {
        out.push({ kind: "prompt", projectId: p.id, projectSlug: p.slug, promptId: pr.id, promptSlug: pr.slug,
          title: pr.name, snippet: pr.purpose || pr.description || "" });
      }
      for (const v of pr.versions) {
        if (matches(v.title, needle) || matches(v.body, needle) || matches(v.changeSummary, needle) || matches(v.rationale, needle)) {
          out.push({ kind: "version", projectId: p.id, projectSlug: p.slug, promptId: pr.id, promptSlug: pr.slug,
            versionId: v.id, title: `v${v.number} — ${v.title}`,
            snippet: snippetAround(v.body, needle) });
        }
      }
      for (const n of pr.notes || []) {
        if (matches(n.body, needle)) {
          out.push({ kind: "note", projectId: p.id, projectSlug: p.slug, promptId: pr.id, promptSlug: pr.slug,
            versionId: n.versionId, title: `Note (${n.kind})`, snippet: n.body.slice(0, 160) });
        }
      }
    }
  }
  return out.slice(0, 80);
}
function matches(s, needle) { return (s || "").toLowerCase().includes(needle); }
function snippetAround(text, needle) {
  if (!text) return "";
  const i = text.toLowerCase().indexOf(needle);
  if (i < 0) return text.slice(0, 160);
  const start = Math.max(0, i - 40), end = Math.min(text.length, i + 120);
  return (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "");
}

// ---------------------------------------------------------------------------
// Aggregations used by views
// ---------------------------------------------------------------------------
export function aggregateRunScore(prompt, runId) {
  const evals = (prompt.evaluations || []).filter((e) => e.runId === runId && e.score != null);
  if (!evals.length) return null;
  return evals.reduce((a, b) => a + b.score, 0) / evals.length;
}
export function pairedRunEvidence(prompt, aId, bId) {
  function agg(versionId) {
    const out = new Map();
    for (const r of (prompt.runs || []).filter((x) => x.versionId === versionId)) {
      const key = `${r.testCaseId ?? "ad-hoc"}:${r.modelProfileId}`;
      if (!out.has(key)) out.set(key, { run: r, score: aggregateRunScore(prompt, r.id) });
    }
    return out;
  }
  const A = agg(aId), B = agg(bId);
  const keys = new Set([...A.keys(), ...B.keys()]);
  return [...keys].map((k) => ({ key: k, a: A.get(k) ?? null, b: B.get(k) ?? null }));
}

// ---------------------------------------------------------------------------
// Proposed Changes (PR-like flow): open a proposal from a source version,
// collect discussion + inline review comments, then merge (promotes) or
// decline (logs a decision). All mutations record activity.
// ---------------------------------------------------------------------------
export function openProposal({ promptId, sourceVersionId, title, description }) {
  if (!title?.trim()) throw new Error("title required");
  if (!sourceVersionId) throw new Error("sourceVersionId required");
  let proposalId;
  mutate((s) => {
    const { prompt } = findPrompt(s, promptId);
    const src = prompt.versions.find((v) => v.id === sourceVersionId);
    if (!src) throw new Error("Source version not found");
    if ((prompt.proposals || []).some((p) =>
      p.status === "open" && p.sourceVersionId === sourceVersionId)) {
      throw new Error("An open proposal already exists for this version");
    }
    const actor = s.meta?.currentActor || null;
    proposalId = newId("prop");
    prompt.proposals = prompt.proposals || [];
    prompt.proposals.push({
      id: proposalId, sourceVersionId,
      targetBranchId: prompt.canonicalBranchId,
      title: title.trim(), description: (description || "").trim(),
      status: "open", openedAt: Date.now(), openedBy: actor,
      closedAt: null, closedBy: null, createdVersionId: null,
      comments: [], reviewComments: [],
    });
    pushActivity(prompt, "proposal_opened", { proposalId, sourceVersionId, title: title.trim() }, actor);
  });
  return proposalId;
}

export function addProposalComment({ promptId, proposalId, body }) {
  if (!body?.trim()) throw new Error("Comment body required");
  mutate((s) => {
    const { prompt } = findPrompt(s, promptId);
    const prop = (prompt.proposals || []).find((p) => p.id === proposalId);
    if (!prop) throw new Error("Proposal not found");
    const actor = s.meta?.currentActor || null;
    prop.comments = prop.comments || [];
    prop.comments.push({
      id: newId("pc"), author: actor, createdAt: Date.now(), body: body.trim(),
    });
    pushActivity(prompt, "proposal_commented",
      { proposalId, excerpt: body.trim().slice(0, 120) }, actor);
  });
}

export function addReviewComment({ promptId, proposalId, side, lineIndex, body }) {
  if (!body?.trim()) throw new Error("Comment body required");
  if (side !== "a" && side !== "b") throw new Error("side must be 'a' or 'b'");
  mutate((s) => {
    const { prompt } = findPrompt(s, promptId);
    const prop = (prompt.proposals || []).find((p) => p.id === proposalId);
    if (!prop) throw new Error("Proposal not found");
    prop.reviewComments = prop.reviewComments || [];
    prop.reviewComments.push({
      id: newId("rc"), side, lineIndex,
      author: s.meta?.currentActor || null, createdAt: Date.now(),
      body: body.trim(), resolvedAt: null,
    });
  });
}

export function resolveReviewComment({ promptId, proposalId, commentId }) {
  mutate((s) => {
    const { prompt } = findPrompt(s, promptId);
    const prop = (prompt.proposals || []).find((p) => p.id === proposalId);
    if (!prop) throw new Error("Proposal not found");
    const rc = (prop.reviewComments || []).find((c) => c.id === commentId);
    if (rc) rc.resolvedAt = Date.now();
  });
}

// Merge a proposal: calls promote, then marks the proposal merged.
export async function mergeProposal({ promptId, proposalId, mode = "squashed", rationale }) {
  if (!rationale?.trim()) throw new Error("Merge rationale required");
  const s0 = getState();
  const { prompt: p0 } = findPrompt(s0, promptId);
  const prop = (p0.proposals || []).find((p) => p.id === proposalId);
  if (!prop) throw new Error("Proposal not found");
  if (prop.status !== "open") throw new Error("Proposal already " + prop.status);

  await promote({ promptId, versionId: prop.sourceVersionId, mode, rationale });

  mutate((s) => {
    const { prompt } = findPrompt(s, promptId);
    const pp = (prompt.proposals || []).find((p) => p.id === proposalId);
    if (!pp) return;
    const actor = s.meta?.currentActor || null;
    pp.status = "merged";
    pp.closedAt = Date.now();
    pp.closedBy = actor;
    // For squashed promotion, the new canonical head id is the newly-created
    // version — take it from the canonical branch head set by promote().
    const canon = prompt.branches.find((b) => b.id === prompt.canonicalBranchId);
    pp.createdVersionId = canon?.headVersionId || null;
    pushActivity(prompt, "proposal_merged",
      { proposalId, mode, createdVersionId: pp.createdVersionId, rationale }, actor);
  });
}

export function declineProposal({ promptId, proposalId, reason }) {
  mutate((s) => {
    const { prompt } = findPrompt(s, promptId);
    const prop = (prompt.proposals || []).find((p) => p.id === proposalId);
    if (!prop) throw new Error("Proposal not found");
    if (prop.status !== "open") throw new Error("Proposal already " + prop.status);
    const actor = s.meta?.currentActor || null;
    prop.status = "closed";
    prop.closedAt = Date.now();
    prop.closedBy = actor;
    if (reason) {
      prop.comments = prop.comments || [];
      prop.comments.push({
        id: newId("pc"), author: actor, createdAt: Date.now(),
        body: `Declined: ${reason.trim()}`,
      });
    }
    pushActivity(prompt, "proposal_declined", { proposalId, reason: reason || "" }, actor);
  });
}

export function listProposals(prompt, { status } = {}) {
  let list = [...(prompt.proposals || [])];
  if (status) list = list.filter((p) => p.status === status);
  list.sort((a, b) => b.openedAt - a.openedAt);
  return list;
}

// ---------------------------------------------------------------------------
// Releases (tagged canonical versions with release notes)
// ---------------------------------------------------------------------------
export function createRelease({ promptId, versionId, name, notes }) {
  if (!name?.trim()) throw new Error("Release name required");
  let releaseId;
  mutate((s) => {
    const { prompt } = findPrompt(s, promptId);
    const v = prompt.versions.find((x) => x.id === versionId);
    if (!v) throw new Error("Version not found");
    const actor = s.meta?.currentActor || null;
    releaseId = newId("rel");
    prompt.releases = prompt.releases || [];
    prompt.releases.push({
      id: releaseId, versionId, name: name.trim(),
      notes: (notes || "").trim(),
      createdAt: Date.now(), createdBy: actor,
    });
    pushActivity(prompt, "release_published",
      { releaseId, versionId, name: name.trim() }, actor);
  });
  return releaseId;
}

export function listReleases(prompt) {
  return [...(prompt.releases || [])].sort((a, b) => b.createdAt - a.createdAt);
}

// Generate release notes automatically from change summaries between two
// versions along the parent chain (or from the root if `sinceId` is null).
export function draftReleaseNotes(prompt, versionId, sinceId = null) {
  const byId = new Map(prompt.versions.map((v) => [v.id, v]));
  const chain = [];
  let cur = byId.get(versionId);
  while (cur && cur.id !== sinceId) {
    chain.push(cur);
    if (!cur.parentVersionId) break;
    cur = byId.get(cur.parentVersionId);
  }
  chain.reverse();
  return chain.map((v) => `- v${v.number}: ${v.changeSummary || "(no summary)"}`).join("\n");
}

// ---------------------------------------------------------------------------
// Prompt README
// ---------------------------------------------------------------------------
export function setPromptReadme({ promptId, readme }) {
  mutate((s) => {
    const { prompt } = findPrompt(s, promptId);
    prompt.readme = readme;
    prompt.updatedAt = Date.now();
  });
}

// ---------------------------------------------------------------------------
// Members / actor switching
// ---------------------------------------------------------------------------
export function listProjectMembers(project) { return project.members || []; }

export function setCurrentActor(memberId) {
  mutate((s) => { s.meta = s.meta || {}; s.meta.currentActor = memberId; });
}

export function getCurrentActor() {
  const s = getState();
  return s?.meta?.currentActor || null;
}

// ---------------------------------------------------------------------------
// Score trend over versions.
//
// Returns one record per version that has at least one scored run, in
// chronological order (by version number). Each record carries:
//   { versionId, number, title, status, branch, runCount,
//     mean: 0..1 | null,
//     byTestCase: { [testCaseId-or-"ad-hoc"]: { score, runCount, name } }
//   }
//
// `mean` is the arithmetic mean of all scored evaluations attached to
// runs on this version. Per-test-case score is the mean across runs of
// that test case (latest run wins per (testCase, modelProfile)).
//
// The chart picks: mean line + per-test-case lines.
// ---------------------------------------------------------------------------
export function scoreTrend(prompt, project) {
  const versions = (prompt.versions || []).slice().sort((a, b) => a.number - b.number);
  const runs = prompt.runs || [];
  const evals = prompt.evaluations || [];
  const byRun = new Map();
  for (const e of evals) {
    if (e.score == null) continue;
    if (!byRun.has(e.runId)) byRun.set(e.runId, []);
    byRun.get(e.runId).push(e.score);
  }
  const tcName = (id) => {
    if (!id) return "ad-hoc";
    for (const ds of (project?.datasets || []))
      for (const tc of ds.testCases || []) if (tc.id === id) return tc.name;
    return id;
  };

  const out = [];
  for (const v of versions) {
    const versionRuns = runs.filter((r) => r.versionId === v.id);
    if (!versionRuns.length) continue;
    let totalScores = [], byTC = new Map();
    for (const r of versionRuns) {
      const scores = byRun.get(r.id);
      if (!scores || !scores.length) continue;
      const m = scores.reduce((a, b) => a + b, 0) / scores.length;
      totalScores.push(m);
      const key = r.testCaseId || "ad-hoc";
      if (!byTC.has(key)) byTC.set(key, { name: tcName(key), runs: [] });
      byTC.get(key).runs.push(m);
    }
    if (!totalScores.length) continue;
    const byTestCase = {};
    for (const [k, v] of byTC) {
      const s = v.runs.reduce((a, b) => a + b, 0) / v.runs.length;
      byTestCase[k] = { score: s, runCount: v.runs.length, name: v.name };
    }
    const branch = (prompt.branches || []).find((b) => b.id === v.createdOnBranchId);
    out.push({
      versionId: v.id,
      number: v.number,
      title: v.title,
      status: v.status,
      branch: branch?.name ?? null,
      runCount: versionRuns.length,
      mean: totalScores.reduce((a, b) => a + b, 0) / totalScores.length,
      byTestCase,
    });
  }
  return out;
}
