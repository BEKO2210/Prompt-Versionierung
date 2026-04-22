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
    prompt.versions.push({
      id: versionId, promptId, parentVersionId, createdOnBranchId: branchId,
      number: nextVersionNumber(prompt), contentHash: hash,
      title: title.trim(), body, messages,
      variables, status,
      changeSummary, rationale, expectedImprovement,
      createdAt: now, createdBy: s.meta?.author || null,
    });
    branch.headVersionId = versionId;
    prompt.updatedAt = now;
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
      p.decisions = p.decisions || [];
      p.decisions.push({
        id: newId("dec"), kind: "promote", versionId, rationale,
        metadata: { mode: "pointer", branchId: cb.id, previousHead: prevHead },
        decidedAt: Date.now(), decidedBy: d.meta?.author || null,
      });
      p.updatedAt = Date.now();
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
    p.versions.push({
      id: newId_, promptId, parentVersionId: cb.headVersionId, createdOnBranchId: cb.id,
      number: nextVersionNumber(p), contentHash: hash,
      title: target.title, body: target.body, messages: target.messages,
      status: "approved",
      variables: structuredClone(target.variables),
      changeSummary: `Promoted from v${target.number} (squashed)`,
      rationale, expectedImprovement: "",
      createdAt: now, createdBy: d.meta?.author || null,
    });
    cb.headVersionId = newId_;
    p.lineageEdges = p.lineageEdges || [];
    p.lineageEdges.push({ id: newId("edge"), fromVersionId: target.id, toVersionId: newId_, kind: "cherry_pick" });
    p.decisions = p.decisions || [];
    p.decisions.push({
      id: newId("dec"), kind: "promote", versionId: newId_, rationale,
      metadata: { mode: "squashed", sourceVersionId: target.id },
      decidedAt: now, decidedBy: d.meta?.author || null,
    });
    p.updatedAt = now;
  });
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------
export function addNote({ promptId, versionId, kind = "observation", body, author }) {
  if (!body?.trim()) throw new Error("Note body required");
  mutate((s) => {
    const { prompt } = findPrompt(s, promptId);
    prompt.notes = prompt.notes || [];
    prompt.notes.push({
      id: newId("note"), versionId, kind, body: body.trim(),
      author: author || s.meta?.author || null,
      createdAt: Date.now(),
    });
  });
}

// ---------------------------------------------------------------------------
// Runs (synchronous mock; the model adapter is local & deterministic)
// ---------------------------------------------------------------------------
export function createRun({ promptId, versionId, modelProfileId, testCaseId = null,
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

  const t0 = performance.now();
  const result = mockModelCall({ prompt: renderedPrompt, modelId: profile.modelId, temperature: T, maxTokens: M });
  const elapsed = Math.max(1, Math.round(performance.now() - t0));

  const evals = evaluators.map((kind) => evaluate(kind, {
    rawOutput: result.rawOutput, expectedOutput, expectedKind,
  }));

  const runId = newId("run");
  mutate((s) => {
    const { prompt: p } = findPrompt(s, promptId);
    p.runs = p.runs || [];
    p.runs.push({
      id: runId, versionId, modelProfileId, testCaseId,
      renderedPrompt, variableBindings: bindings,
      rawOutput: result.rawOutput, structuredOutput: tryParseJSON(result.rawOutput),
      status: "succeeded", error: null,
      temperature: T, maxTokens: M,
      latencyMs: elapsed,
      inputTokens: result.inputTokens, outputTokens: result.outputTokens,
      costEstimate: 0,
      startedAt: Date.now() - elapsed, finishedAt: Date.now(), createdAt: Date.now(),
    });
    for (const e of evals) {
      p.evaluations = p.evaluations || [];
      p.evaluations.push({
        id: newId("eval"), runId, evaluatorKind: e.kind,
        evaluatorRef: null, rubricId: null,
        score: e.score, passed: e.passed, notes: e.notes,
        createdAt: Date.now(),
      });
    }
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
