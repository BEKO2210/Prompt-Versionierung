// Prompt detail view — the primary screen.
// Laid out to match the reference screenshot: topbar (breadcrumb + counters
// + keyboard hints + reset), left rail (prompt card, branches, version
// tree, legend), main pane (version crumbs, title, action bar, tabs,
// content: body + variables + metadata, analyzer signals).

import { html, escapeHtml, icon, modal, toast, statusPill, hashChip, scoreCell, relTime } from "../ui/components.js";
import { getState, commit } from "../store.js";
import * as services from "../services.js";
import { buildTree, canTransition, STATUSES, analyze } from "../domain.js";
import { navigate } from "../router.js";

// --- entry points ---
export function renderPromptView(route) {
  const s = getState();
  const ctx = resolveContext(s, route);
  if (!ctx) return `<div class="main">Prompt not found.</div>`;

  return html`
    ${renderTopbar(ctx)}
    <div class="workspace">
      <aside class="rail">
        <div class="rail-content">
          ${renderPromptCard(ctx)}
          ${renderBranches(ctx)}
          ${renderTree(ctx)}
        </div>
        ${renderLegend()}
      </aside>
      <section class="main">
        ${renderMainHead(ctx)}
        ${renderTabs(ctx)}
        <div id="tab-body">${renderTabContent(ctx)}</div>
      </section>
    </div>
  `;
}

// Resolve project/prompt/version from the current route. If no version is
// in the URL, fall back to the canonical head.
function resolveContext(s, route) {
  const { projectSlug, promptSlug, versionId } = route.path;
  const project = s.projects.find((p) => p.slug === projectSlug);
  if (!project) return null;
  const prompt = project.prompts.find((p) => p.slug === promptSlug);
  if (!prompt) return null;
  const canonBranch = prompt.branches.find((b) => b.id === prompt.canonicalBranchId);
  const fallbackId = canonBranch?.headVersionId ?? prompt.versions.at(-1)?.id;
  const id = versionId || fallbackId;
  const version = prompt.versions.find((v) => v.id === id) || null;
  const tab = route.query.tab || "content";
  return { s, project, prompt, version, canonBranch, tab };
}

// --- topbar ---
function renderTopbar({ project, prompt }) {
  const branches = prompt.branches.length;
  const versions = prompt.versions.length;
  const runs = (prompt.runs || []).length;
  return `
    <div class="topbar">
      <a class="topbar-logo" href="#/">
        <span class="mark">${icon("prompt", { size: 13, stroke: 1.6 })}</span>
        Prompt Tree
      </a>
      <span class="topbar-crumb">
        <span class="sep">/</span>
        <a href="#/p/${escapeHtml(project.slug)}">${escapeHtml(project.name)}</a>
        <span class="sep">/</span>
        <span class="current">${escapeHtml(prompt.slug)}</span>
      </span>
      <span class="topbar-counters">
        <span class="ct">${icon("fork", { size: 13 })} ${branches} branches</span>
        <span class="ct">${icon("tree", { size: 13 })} ${versions} versions</span>
        <span class="ct">${icon("beaker", { size: 13 })} ${runs} runs</span>
      </span>
      <span class="topbar-spacer"></span>
      <span class="topbar-shortcuts">
        <span class="kbd-group"><span class="kbd">⌘</span><span class="kbd">K</span><span class="label">search</span></span>
        <span class="kbd-group"><span class="kbd">E</span><span class="label">edit</span></span>
        <span class="kbd-group"><span class="kbd">R</span><span class="label">run</span></span>
        <span class="kbd-group"><span class="kbd">F</span><span class="label">fork</span></span>
      </span>
      <button class="topbar-action" data-act="reset-demo">Reset demo</button>
    </div>
  `;
}

// --- rail: prompt card ---
function renderPromptCard({ prompt }) {
  return `
    <section class="rail-section">
      <div class="eyebrow" style="margin-bottom:8px">Prompt</div>
      <div class="prompt-card">
        <div class="name">${escapeHtml(prompt.name)}</div>
        <span class="slug">${escapeHtml(prompt.slug)}</span>
        ${prompt.description || prompt.purpose
          ? `<div class="desc">${escapeHtml(prompt.description || prompt.purpose)}</div>`
          : ""}
      </div>
    </section>
  `;
}

// --- rail: branches list ---
function renderBranches({ prompt, version }) {
  const currentBranchId = version?.createdOnBranchId;
  return `
    <section class="rail-section">
      <div class="eyebrow" style="margin-bottom:8px">Branches</div>
      <div class="branch-list">
        ${prompt.branches.map((b) => {
          const isCanonical = b.id === prompt.canonicalBranchId;
          const isActive = b.id === currentBranchId;
          const head = prompt.versions.find((v) => v.id === b.headVersionId);
          const hashDisp = head?.contentHash ? head.contentHash.slice(0, 7) : "";
          return `
            <div class="branch-row ${isActive ? "active" : ""}" data-branch-id="${escapeHtml(b.id)}" data-head="${escapeHtml(head?.id || "")}">
              <span class="swatch" style="background:${escapeHtml(b.color || "#6366f1")}"></span>
              <span class="name">${escapeHtml(b.name)} ${isCanonical ? `<span class="crown" title="canonical">${icon("crown", { size: 11 })}</span>` : ""}</span>
              <span class="hash">${escapeHtml(hashDisp)}</span>
            </div>`;
        }).join("")}
      </div>
    </section>
  `;
}

// --- rail: version tree ---
// Matches the screenshot: each node is glyph + label, connected by
// L-shaped lines using absolutely-positioned borders. Canonical nodes
// have a filled green glyph, refinement nodes get a dashed purple ring.
function renderTree({ prompt, version }) {
  const tree = buildTree(prompt.versions);
  // Flatten with depth so we can lay out absolute connectors.
  const flat = [];
  (function walk(nodes, depth) {
    for (const t of nodes) {
      flat.push({ node: t.node, depth, children: t.children });
      walk(t.children, depth + 1);
    }
  })(tree, 0);

  const branchHeadIds = new Set(prompt.branches.map((b) => b.headVersionId));
  const refinementEdgesTo = new Set(
    (prompt.lineageEdges || []).filter((e) => e.kind === "refinement").map((e) => e.toVersionId),
  );

  const rows = flat.map((f) => {
    const v = f.node;
    const isCanonicalHead = v.id === (prompt.branches.find((b) => b.id === prompt.canonicalBranchId)?.headVersionId);
    const isBranchHead = branchHeadIds.has(v.id);
    const isSelected = version && version.id === v.id;
    const isRefinement = refinementEdgesTo.has(v.id);
    const glyphCls = [
      isCanonicalHead ? "canonical" : "",
      !isCanonicalHead && isBranchHead ? "exp" : "",
      isRefinement ? "refine" : "",
      isSelected ? "head" : "",
    ].filter(Boolean).join(" ");
    const indent = 12 + f.depth * 18;

    // Vertical connector from parent (drawn above this row's glyph).
    const connectors = [];
    if (f.depth > 0) {
      const x = 12 + (f.depth - 1) * 18 + 6;
      connectors.push(
        `<span class="tree-connector ${isRefinement ? "dashed" : ""}"
               style="left:${x}px;top:0;bottom:50%;"></span>`,
        `<span class="tree-connector horiz ${isRefinement ? "dashed" : ""}"
               style="left:${x}px;top:50%;width:12px;"></span>`,
      );
    }
    return `
      <div class="tree-node ${isSelected ? "selected" : ""}" data-version-id="${escapeHtml(v.id)}"
           style="padding-left:${indent}px;position:relative">
        ${connectors.join("")}
        <span class="glyph ${glyphCls}"></span>
        <span class="label">
          <span class="v">v${v.number}</span>
          <span class="t">${escapeHtml(v.title)}</span>
        </span>
      </div>`;
  }).join("");

  return `
    <section class="rail-section">
      <div class="tree">${rows}</div>
    </section>
  `;
}

function renderLegend() {
  return `
    <div class="legend">
      <span class="item"><span class="dot canonical"></span> canonical</span>
      <span class="item"><span class="dot refinement"></span> refinement</span>
      <span class="item"><span class="head">∿</span> head</span>
    </div>`;
}

// --- main head (crumbs + title + actions) ---
function renderMainHead({ project, prompt, version }) {
  if (!version) return `<div class="main-head"><h1>No version selected</h1></div>`;
  const branch = prompt.branches.find((b) => b.id === version.createdOnBranchId);
  const hash7 = version.contentHash?.slice(0, 7) || "";
  return `
    <div class="main-head">
      <div style="min-width:0">
        <div class="crumbs">
          <span class="br">${escapeHtml(branch?.name || "?")}</span>
          <span class="vno">v${version.number}</span>
          ${statusPill(version.status)}
          <span class="hash-chip">${escapeHtml(hash7)}</span>
        </div>
        <h1>${escapeHtml(version.title)}</h1>
        ${version.changeSummary
          ? `<div class="subtitle">${escapeHtml(version.changeSummary)}</div>`
          : ""}
      </div>
      <div class="actions">
        <button class="btn" data-act="edit">${icon("pencil", { size: 13 })} Edit → new version</button>
        <button class="btn" data-act="fork">${icon("fork", { size: 13 })} Fork</button>
        <button class="btn" data-act="run">${icon("play", { size: 13 })} Run</button>
        <button class="btn ghost-accent" data-act="refine">${icon("spark", { size: 13 })} Refine</button>
        <button class="btn" data-act="compare">${icon("compare", { size: 13 })} Compare</button>
        <button class="btn accent" data-act="promote">${icon("crown", { size: 13 })} Promote</button>
      </div>
    </div>
  `;
}

// --- tabs ---
function renderTabs({ prompt, version, tab }) {
  const runs = (prompt.runs || []).filter((r) => r.versionId === version?.id).length;
  const lineageEdges = (prompt.lineageEdges || []).filter(
    (e) => e.fromVersionId === version?.id || e.toVersionId === version?.id,
  ).length;
  const decisions = (prompt.decisions || []).filter((d) => d.versionId === version?.id).length;
  const notes = (prompt.notes || []).filter((n) => n.versionId === version?.id).length;
  const mk = (k, label, count) => `
    <div class="tab ${tab === k ? "active" : ""}" data-tab="${k}">
      <span>${label}</span>${count ? `<span class="badge">${count}</span>` : ""}
    </div>`;
  return `
    <nav class="tabs">
      ${mk("content", "Content")}
      ${mk("runs", "Runs &amp; Evidence", runs)}
      ${mk("lineage", "Lineage", lineageEdges)}
      ${mk("decisions", "Decisions", decisions)}
      ${mk("notes", "Notes", notes)}
    </nav>
  `;
}

// --- tab content dispatch ---
function renderTabContent(ctx) {
  if (!ctx.version) return "";
  switch (ctx.tab) {
    case "runs":      return renderRunsTab(ctx);
    case "lineage":   return renderLineageTab(ctx);
    case "decisions": return renderDecisionsTab(ctx);
    case "notes":     return renderNotesTab(ctx);
    case "content":
    default:          return renderContentTab(ctx);
  }
}

// --- Tab: Content (matches the screenshot exactly) ---
function renderContentTab(ctx) {
  const { prompt, version } = ctx;
  const parent = version.parentVersionId
    ? prompt.versions.find((v) => v.id === version.parentVersionId)
    : null;
  const findings = analyze({
    title: version.title, body: version.body,
    messages: version.messages, variables: version.variables || [],
  });
  const findingsByAnalyzer = groupBy(findings, (f) => f.analyzer);

  return `
    <div class="section">
      <div class="section-head">
        <div class="eyebrow">Prompt body</div>
        <div class="meta">${version.body.length} chars · ${version.body.split(/\r?\n/).length} lines</div>
      </div>
      <div class="code-frame">
        <pre>${escapeHtml(version.body)}</pre>
      </div>
    </div>

    <div class="split">
      <div class="subblock">
        <div class="eyebrow">Variables</div>
        ${(version.variables || []).length
          ? (version.variables || []).map(renderVarRow).join("")
          : `<div class="empty" style="padding:18px"><div class="sub">No declared variables.</div></div>`}
      </div>
      <div class="subblock">
        <div class="eyebrow">Metadata</div>
        <div class="kv">
          <div class="row"><div class="k">Content hash</div><div class="v mono">${escapeHtml((version.contentHash || "").slice(0, 7))}</div></div>
          <div class="row"><div class="k">Created</div><div class="v">${escapeHtml(relTime(version.createdAt))} ${version.createdBy ? "· " + escapeHtml(version.createdBy) : ""}</div></div>
          <div class="row"><div class="k">Parent</div><div class="v">${parent ? `v${parent.number} · ${escapeHtml(parent.title)}` : "<span style=\"color:var(--fg-faint)\">root</span>"}</div></div>
          ${version.rationale ? `<div class="row"><div class="k">Rationale</div><div class="v">${escapeHtml(version.rationale)}</div></div>` : ""}
          ${version.expectedImprovement ? `<div class="row"><div class="k">Expected</div><div class="v">${escapeHtml(version.expectedImprovement)}</div></div>` : ""}
        </div>
      </div>
    </div>

    ${findings.length ? `
      <div class="section" style="margin-top:24px">
        <div class="signals">
          <div class="head">
            ${icon("spark", { size: 13 })}
            <span class="title">Analyzer signals</span>
            <span class="eyebrow" style="margin-left:auto">${findings.length} finding${findings.length === 1 ? "" : "s"}</span>
          </div>
          ${Object.entries(findingsByAnalyzer).map(([analyzer, items]) => `
            <div class="signal">
              <div class="head-row">
                <span class="sev-dot ${escapeAttr(items[0].severity)}"></span>
                <span class="name">${escapeHtml(prettyAnalyzer(analyzer))}</span>
                <span class="code">${escapeHtml(analyzer)}</span>
              </div>
              <ul>${items.map((f) => `<li>${escapeHtml(f.detail)}</li>`).join("")}</ul>
            </div>`).join("")}
        </div>
      </div>` : ""}
  `;
}

function renderVarRow(v) {
  return `
    <div class="var-row">
      <span class="name">{{${escapeHtml(v.name)}}}</span>
      <span class="type">${escapeHtml(v.type)}</span>
      ${v.required ? `<span class="req">required</span>` : `<span class="type" style="color:var(--fg-faint)">optional</span>`}
      <span class="desc">${escapeHtml(v.description || "")}</span>
    </div>`;
}

function prettyAnalyzer(a) {
  return ({
    ambiguity: "Ambiguity",
    missingConstraints: "Missing constraints",
    unclearRole: "Unclear role",
    redundancy: "Redundancy",
    underspecification: "Underspecification",
  })[a] || a;
}

function escapeAttr(s) { return escapeHtml(s); }
function groupBy(arr, keyFn) {
  const out = {};
  for (const x of arr) {
    const k = keyFn(x);
    (out[k] = out[k] || []).push(x);
  }
  return out;
}

// --- Tab: Runs & Evidence ---
function renderRunsTab({ project, prompt, version }) {
  const runs = (prompt.runs || []).filter((r) => r.versionId === version.id)
    .sort((a, b) => b.createdAt - a.createdAt);
  if (!runs.length) {
    return `<div class="empty">
      <div class="ttl">No runs on this version yet</div>
      <div class="sub">Use the <strong>Run</strong> button above to execute this version against a test case.</div>
    </div>`;
  }
  return `
    <table class="table">
      <thead>
        <tr>
          <th>When</th><th>Test case</th><th>Model</th><th>Status</th>
          <th class="right">Latency</th><th class="right">Tokens</th><th class="right">Score</th>
        </tr>
      </thead>
      <tbody>
        ${runs.map((r) => {
          const tc = findTestCase(project, r.testCaseId);
          const mp = project.modelProfiles.find((m) => m.id === r.modelProfileId);
          const score = services.aggregateRunScore(prompt, r.id);
          return `
            <tr>
              <td class="mono">${escapeHtml(relTime(r.createdAt))}</td>
              <td>${tc ? escapeHtml(tc.name) : '<span style="color:var(--fg-faint)">ad-hoc</span>'}</td>
              <td>${mp ? escapeHtml(mp.name) : "—"}</td>
              <td>${statusPill(r.status)}</td>
              <td class="right">${r.latencyMs ?? "—"} ms</td>
              <td class="right">${(r.inputTokens ?? "?")}/${(r.outputTokens ?? "?")}</td>
              <td class="right">${scoreCell(score)}</td>
            </tr>`;
        }).join("")}
      </tbody>
    </table>`;
}
function findTestCase(project, id) {
  if (!id) return null;
  for (const d of project.datasets || [])
    for (const tc of d.testCases || []) if (tc.id === id) return tc;
  return null;
}

// --- Tab: Lineage ---
function renderLineageTab({ prompt, version }) {
  const byId = new Map(prompt.versions.map((v) => [v.id, v]));
  const up = version.parentVersionId ? byId.get(version.parentVersionId) : null;
  const down = prompt.versions.filter((v) => v.parentVersionId === version.id);
  const edges = (prompt.lineageEdges || []).filter(
    (e) => e.fromVersionId === version.id || e.toVersionId === version.id,
  );

  return `
    <div class="split">
      <div class="subblock">
        <div class="eyebrow">Ancestry</div>
        <div class="kv">
          <div class="row">
            <div class="k">Parent</div>
            <div class="v">${up
              ? `<a href="#/p/${escapeHtml(findProjectSlug(prompt))}/p/${escapeHtml(prompt.slug)}/v/${escapeHtml(up.id)}">v${up.number} · ${escapeHtml(up.title)}</a>`
              : '<span style="color:var(--fg-faint)">root</span>'}</div>
          </div>
          <div class="row">
            <div class="k">Branch</div>
            <div class="v mono">${escapeHtml(prompt.branches.find((b) => b.id === version.createdOnBranchId)?.name || "?")}</div>
          </div>
          <div class="row">
            <div class="k">Descendants</div>
            <div class="v">${down.length ? down.map((v) => `v${v.number}`).join(", ") : '<span style="color:var(--fg-faint)">none</span>'}</div>
          </div>
        </div>
      </div>
      <div class="subblock">
        <div class="eyebrow">Explicit edges</div>
        ${edges.length ? `
          <div class="kv">${edges.map((e) => {
            const from = byId.get(e.fromVersionId); const to = byId.get(e.toVersionId);
            return `<div class="row"><div class="k mono">${escapeHtml(e.kind)}</div><div class="v">v${from?.number ?? "?"} → v${to?.number ?? "?"}</div></div>`;
          }).join("")}</div>` : `<div class="empty" style="padding:18px"><div class="sub">No merge / cherry-pick / refinement edges.</div></div>`}
      </div>
    </div>`;
}
function findProjectSlug(prompt) {
  const s = getState();
  for (const p of s.projects) if (p.prompts.some((pr) => pr.id === prompt.id)) return p.slug;
  return "";
}

// --- Tab: Decisions ---
function renderDecisionsTab({ prompt, version }) {
  const decisions = (prompt.decisions || []).filter((d) => d.versionId === version.id || (d.kind === "set_canonical_branch"));
  if (!decisions.length) {
    return `<div class="empty"><div class="ttl">No decisions recorded yet</div><div class="sub">Promotions, deprecations and canonical-branch changes will appear here.</div></div>`;
  }
  return `<div class="kv">${decisions.map((d) => `
    <div class="row">
      <div class="k mono">${escapeHtml(d.kind)} · ${escapeHtml(relTime(d.decidedAt))}</div>
      <div class="v">${escapeHtml(d.rationale || "(no rationale)")}</div>
    </div>`).join("")}</div>`;
}

// --- Tab: Notes ---
function renderNotesTab({ prompt, version }) {
  const notes = (prompt.notes || []).filter((n) => n.versionId === version.id)
    .sort((a, b) => b.createdAt - a.createdAt);
  return `
    <button class="btn" data-act="add-note" style="margin-bottom:12px">${icon("plus", { size: 13 })} Add note</button>
    ${notes.length ? `<div class="kv">${notes.map((n) => `
      <div class="row">
        <div class="k mono">${escapeHtml(n.kind)} · ${escapeHtml(relTime(n.createdAt))}</div>
        <div class="v">${escapeHtml(n.body)}</div>
      </div>`).join("")}</div>` : `<div class="empty"><div class="sub">No notes yet. Capture quick observations here.</div></div>`}
  `;
}

// ===========================================================================
// Bindings
// ===========================================================================
export function bindPromptView(root, route) {
  const s = getState();
  const ctx = resolveContext(s, route);
  if (!ctx) return;

  // --- topbar reset ---
  root.querySelector('[data-act="reset-demo"]')?.addEventListener("click", async () => {
    if (!confirm("Reset workspace to the seeded demo? Local changes will be lost.")) return;
    const seed = await fetch("./data/seed.json").then((r) => r.json());
    const { resetTo } = await import("../store.js");
    await resetTo(seed);
    toast("Reset to demo");
    navigate("/");
  });

  // --- branch rows → select head version ---
  root.querySelectorAll(".branch-row").forEach((row) => {
    row.addEventListener("click", () => {
      const head = row.dataset.head;
      if (head) navigate(`/p/${ctx.project.slug}/p/${ctx.prompt.slug}/v/${head}`);
    });
  });

  // --- tree nodes → select version ---
  root.querySelectorAll(".tree-node").forEach((n) => {
    n.addEventListener("click", () => {
      const id = n.dataset.versionId;
      navigate(`/p/${ctx.project.slug}/p/${ctx.prompt.slug}/v/${id}`, ctx.tab === "content" ? null : { tab: ctx.tab });
    });
  });

  // --- tabs ---
  root.querySelectorAll(".tab").forEach((t) => {
    t.addEventListener("click", () => {
      const k = t.dataset.tab;
      const q = k === "content" ? null : { tab: k };
      navigate(`/p/${ctx.project.slug}/p/${ctx.prompt.slug}/v/${ctx.version.id}`, q);
    });
  });

  // --- action bar ---
  root.querySelector('[data-act="edit"]')?.addEventListener("click", () => openEditModal(ctx));
  root.querySelector('[data-act="fork"]')?.addEventListener("click", () => openForkModal(ctx));
  root.querySelector('[data-act="run"]')?.addEventListener("click", () => openRunModal(ctx));
  root.querySelector('[data-act="refine"]')?.addEventListener("click", () =>
    navigate(`/p/${ctx.project.slug}/p/${ctx.prompt.slug}/refine/${ctx.version.id}`));
  root.querySelector('[data-act="compare"]')?.addEventListener("click", () =>
    navigate(`/p/${ctx.project.slug}/p/${ctx.prompt.slug}/compare`, { b: ctx.version.id }));
  root.querySelector('[data-act="promote"]')?.addEventListener("click", () => openPromoteModal(ctx));

  // --- notes tab quick add ---
  root.querySelector('[data-act="add-note"]')?.addEventListener("click", () => openNoteModal(ctx));
}

// Expose a shortcut map for main.js keyboard handler.
export function promptShortcuts(route) {
  const s = getState();
  const ctx = resolveContext(s, route);
  if (!ctx) return null;
  return {
    "E": () => openEditModal(ctx),
    "F": () => openForkModal(ctx),
    "R": () => openRunModal(ctx),
  };
}

// ---------------------------------------------------------------------------
// Modals
// ---------------------------------------------------------------------------
function openEditModal({ project, prompt, version }) {
  modal({
    title: `Edit v${version.number} → new version`,
    sub: "Versions are immutable. Saving creates a new version on the current branch.",
    body: `
      <div class="row"><label>Title <span class="req">*</span></label><input name="title" required value="${escapeAttr(version.title)}" /></div>
      <div class="row"><label>Body <span class="req">*</span></label><textarea name="body" required>${escapeHtml(version.body)}</textarea></div>
      <div class="row"><label>Change summary <span class="req">*</span></label><input name="changeSummary" required placeholder="What did you change?" /></div>
      <div class="row"><label>Rationale</label><input name="rationale" placeholder="Why the change?" /></div>
      <div class="row"><label>Expected improvement</label><input name="expectedImprovement" placeholder="Testable hypothesis" /></div>`,
    primary: "Commit new version", secondary: "Cancel",
    onSubmit: async (data) => {
      const id = await services.createVersion({
        promptId: prompt.id, parentVersionId: version.id,
        branchId: version.createdOnBranchId,
        title: data.title, body: data.body,
        variables: version.variables || [],
        changeSummary: data.changeSummary,
        rationale: data.rationale, expectedImprovement: data.expectedImprovement,
        status: "draft",
      });
      await commit();
      toast("Committed new version");
      navigate(`/p/${project.slug}/p/${prompt.slug}/v/${id}`);
    },
  });
}

function openForkModal({ project, prompt, version }) {
  modal({
    title: "Fork branch",
    sub: `The new branch will start at v${version.number}. First commit on it creates a version with v${version.number} as its parent.`,
    body: `
      <div class="row"><label>Branch name <span class="req">*</span></label>
        <input name="name" required pattern="[a-z][a-z0-9-]{0,63}"
          title="lowercase, start with a letter, hyphens allowed"
          placeholder="experiment-tone" /></div>
      <div class="helper">Name rule: lowercase, start with a letter, hyphens allowed.</div>`,
    primary: "Fork", secondary: "Cancel",
    onSubmit: async (data) => {
      const id = services.createBranch({
        promptId: prompt.id, name: data.name, fromVersionId: version.id,
      });
      await commit();
      toast(`Forked branch ${data.name}`);
      // stay on current version — the branch now exists but HEAD==current version
      void id;
    },
  });
}

function openRunModal({ project, prompt, version }) {
  const profiles = project.modelProfiles || [];
  const cases = (project.datasets || []).flatMap((d) => (d.testCases || []).map((tc) => ({ ...tc, datasetName: d.name })));
  const suggested = {};
  for (const v of version.variables || []) suggested[v.name] = v.defaultValue ?? "";

  if (!profiles.length) {
    modal({
      title: "Run — needs a model profile",
      body: `<p style="color:var(--fg-muted);font-size:13px">Add a model profile under the Models tab. The <code>mock</code> provider works with no API key and is perfect for offline use.</p>`,
      primary: "OK",
      onSubmit: () => {},
    });
    return;
  }

  modal({
    title: `Run v${version.number}`,
    sub: "Renders the prompt, calls the model, and attaches evaluations.",
    body: `
      <div class="row"><label>Model profile <span class="req">*</span></label>
        <select name="modelProfileId" required>
          ${profiles.map((m) => `<option value="${escapeAttr(m.id)}">${escapeHtml(m.name)} · ${escapeHtml(m.provider)}:${escapeHtml(m.modelId)}</option>`).join("")}
        </select></div>
      <div class="row"><label>Test case</label>
        <select name="testCaseId">
          <option value="">— ad-hoc (use bindings below) —</option>
          ${cases.map((c) => `<option value="${escapeAttr(c.id)}">${escapeHtml(c.datasetName)} · ${escapeHtml(c.name)}</option>`).join("")}
        </select></div>
      <div class="row"><label>Variable bindings (JSON)</label>
        <textarea name="bindings" placeholder='{"ticket":"I was charged twice."}'>${escapeHtml(JSON.stringify(suggested, null, 2))}</textarea></div>
      <div class="row"><label>Evaluators</label>
        <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:13px">
          <label><input type="checkbox" name="ev_regex" checked> Regex / contains</label>
          <label><input type="checkbox" name="ev_schema"> JSON schema</label>
          <label><input type="checkbox" name="ev_similarity"> Similarity</label>
        </div></div>`,
    primary: "Run now", secondary: "Cancel",
    onSubmit: async (data) => {
      let bindings = {};
      try { bindings = data.bindings ? JSON.parse(data.bindings) : {}; }
      catch { throw new Error("Bindings must be valid JSON."); }
      const evaluators = [];
      if (data.ev_regex) evaluators.push("regex");
      if (data.ev_schema) evaluators.push("schema");
      if (data.ev_similarity) evaluators.push("similarity");
      services.createRun({
        promptId: prompt.id, versionId: version.id,
        modelProfileId: data.modelProfileId,
        testCaseId: data.testCaseId || null,
        variableBindings: bindings, evaluators,
      });
      await commit();
      toast("Run completed");
      navigate(`/p/${project.slug}/p/${prompt.slug}/v/${version.id}`, { tab: "runs" });
    },
  });
}

function openPromoteModal({ project, prompt, version }) {
  modal({
    title: "Promote to canonical",
    sub: "Every promotion records a decision with a rationale.",
    body: `
      <div class="row"><label>Mode</label>
        <select name="mode">
          <option value="pointer">Pointer (fast-forward)</option>
          <option value="squashed">Squashed (copy onto canonical)</option>
        </select></div>
      <div class="row"><label>Rationale <span class="req">*</span></label><input name="rationale" required placeholder="Why is this the right version to ship?" /></div>
      <div class="helper">Pointer is only allowed when this version is a descendant of the current canonical head.</div>`,
    primary: "Promote", secondary: "Cancel",
    onSubmit: async (data) => {
      await services.promote({
        promptId: prompt.id, versionId: version.id,
        mode: data.mode, rationale: data.rationale,
      });
      await commit();
      toast("Promoted");
    },
  });
}

function openNoteModal({ prompt, version }) {
  modal({
    title: "Add note",
    body: `
      <div class="row"><label>Kind</label>
        <select name="kind">
          <option value="observation">observation</option>
          <option value="issue">issue</option>
          <option value="idea">idea</option>
          <option value="warning">warning</option>
        </select></div>
      <div class="row"><label>Body <span class="req">*</span></label><textarea name="body" required placeholder="Quick note…"></textarea></div>`,
    primary: "Add note", secondary: "Cancel",
    onSubmit: async (data) => {
      services.addNote({ promptId: prompt.id, versionId: version.id, kind: data.kind, body: data.body });
      await commit();
      toast("Note added");
    },
  });
}
