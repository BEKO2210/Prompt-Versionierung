// Prompt detail view — the primary screen.
// Laid out to match the reference screenshot: topbar (breadcrumb + counters
// + keyboard hints + reset), left rail (prompt card, branches, version
// tree, legend), main pane (version crumbs, title, action bar, tabs,
// content: body + variables + metadata, analyzer signals).

import { html, escapeHtml, icon, brandMark, modal, toast, drawer, statusPill, hashChip, scoreCell, relTime, avatar, authorInline, resolveMember } from "../ui/components.js";
import { getState, commit } from "../store.js";
import * as services from "../services.js";
import { buildTree, canTransition, STATUSES, analyze, blame } from "../domain.js";
import { navigate } from "../router.js";
import { timeline } from "../ui/timeline.js";
import { lineChart, bindChartTooltips } from "../ui/chart.js";
import { md as renderMarkdown } from "../vendor.js";
import {
  serializeRun, serializeRunsForVersion,
  downloadJSON, copyJSON, fileNameForRun, fileNameForRunsBundle,
} from "../runFormat.js";
import { packShare, buildShareUrl } from "../share.js";
import { packFork, fileNameForFork } from "../templates.js";

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
        <span class="mark">${brandMark(22)}</span>
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
// Branch-based depth: a version's column equals the number of branch
// changes between it and the root. Same-branch descendants stay at the
// same x-position; forking to a different branch steps right by one.
// Connector lines are drawn by L-shaped absolutely-positioned borders.
function renderTree({ prompt, version }) {
  const byId = new Map(prompt.versions.map((v) => [v.id, v]));

  // Branch depth per version, memoised.
  const branchDepth = new Map();
  function depthOf(v) {
    if (branchDepth.has(v.id)) return branchDepth.get(v.id);
    if (!v.parentVersionId) { branchDepth.set(v.id, 0); return 0; }
    const parent = byId.get(v.parentVersionId);
    if (!parent) { branchDepth.set(v.id, 0); return 0; }
    const d = parent.createdOnBranchId === v.createdOnBranchId
      ? depthOf(parent)
      : depthOf(parent) + 1;
    branchDepth.set(v.id, d);
    return d;
  }
  for (const v of prompt.versions) depthOf(v);

  // Linear order for display: DFS from each root, sorted by version number.
  const roots = prompt.versions.filter((v) => !v.parentVersionId || !byId.has(v.parentVersionId));
  const childrenOf = new Map();
  for (const v of prompt.versions) {
    if (v.parentVersionId) {
      const list = childrenOf.get(v.parentVersionId) || [];
      list.push(v); childrenOf.set(v.parentVersionId, list);
    }
  }
  for (const k of childrenOf.keys()) childrenOf.get(k).sort((a, b) => a.number - b.number);
  const ordered = [];
  (function walk(v) {
    ordered.push(v);
    for (const c of childrenOf.get(v.id) || []) walk(c);
  })(roots.sort((a, b) => a.number - b.number)[0] || prompt.versions[0]);

  const branchHeadIds = new Set(prompt.branches.map((b) => b.headVersionId));
  const canonicalHeadId = prompt.branches.find((b) => b.id === prompt.canonicalBranchId)?.headVersionId;
  const refinementEdgesTo = new Set(
    (prompt.lineageEdges || []).filter((e) => e.kind === "refinement").map((e) => e.toVersionId),
  );

  const ROW_PX = 18;                // column stride
  const BASE   = 12;                // left margin of column 0
  const GLYPH  = 6;                 // half glyph width

  const rows = ordered.map((v) => {
    const parent = v.parentVersionId ? byId.get(v.parentVersionId) : null;
    const myDepth = branchDepth.get(v.id) ?? 0;
    const parentDepth = parent ? (branchDepth.get(parent.id) ?? 0) : 0;
    const isCanonicalHead = v.id === canonicalHeadId;
    const isBranchHead = branchHeadIds.has(v.id);
    const isSelected = version && version.id === v.id;
    const isRefinement = refinementEdgesTo.has(v.id);

    const glyphCls = [
      isCanonicalHead ? "canonical" : "",
      !isCanonicalHead && isBranchHead ? "exp" : "",
      isRefinement ? "refine" : "",
      isSelected ? "head" : "",
    ].filter(Boolean).join(" ");

    const paddingLeft = BASE + myDepth * ROW_PX;

    // Connector from parent. Two cases:
    //   same branch: straight vertical line in parent's column, continuing
    //     down to this row's glyph center.
    //   different branch: vertical from parent's column going down to this
    //     row, then horizontal into this row's column (L-shape).
    const connectors = [];
    if (parent) {
      if (myDepth === parentDepth) {
        // Straight vertical in the parent's column.
        const x = BASE + parentDepth * ROW_PX + GLYPH;
        connectors.push(`<span class="tree-connector ${isRefinement ? "dashed" : ""}" style="left:${x}px;top:-50%;bottom:50%;"></span>`);
      } else {
        // L-shape: vertical in parent's column + horizontal into mine.
        const xParent = BASE + parentDepth * ROW_PX + GLYPH;
        const xMine   = BASE + myDepth  * ROW_PX + GLYPH;
        connectors.push(
          `<span class="tree-connector ${isRefinement ? "dashed" : ""}" style="left:${xParent}px;top:-50%;bottom:50%;"></span>`,
          `<span class="tree-connector horiz ${isRefinement ? "dashed" : ""}" style="left:${xParent}px;top:50%;width:${xMine - xParent}px;"></span>`,
        );
      }
    }

    return `
      <div class="tree-node ${isSelected ? "selected" : ""}" data-version-id="${escapeHtml(v.id)}"
           style="padding-left:${paddingLeft}px;position:relative">
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
        <button class="btn" data-act="batch">${icon("beaker", { size: 13 })} Batch</button>
        <button class="btn ghost-accent" data-act="refine">${icon("spark", { size: 13 })} Refine</button>
        <button class="btn" data-act="compare">${icon("compare", { size: 13 })} Compare</button>
        <button class="btn" data-act="share">${icon("upload", { size: 13 })} Share</button>
        <button class="btn" data-act="copy-json">${icon("download", { size: 13 })} Copy JSON</button>
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
  const openProposals = (prompt.proposals || []).filter((p) => p.status === "open").length;
  const releases = (prompt.releases || []).length;
  const activities = (prompt.activities || []).length;
  const hasReadme = !!(prompt.readme && prompt.readme.trim());

  const mk = (k, label, count, badgeCls) => `
    <div class="tab ${tab === k ? "active" : ""}" data-tab="${k}">
      <span>${label}</span>${count ? `<span class="badge${badgeCls ? " " + badgeCls : ""}">${count}</span>` : ""}
    </div>`;
  return `
    <nav class="tabs">
      ${mk("content", "Content")}
      ${hasReadme ? mk("readme", "README") : ""}
      ${mk("runs", "Runs &amp; Evidence", runs)}
      ${mk("trend", "Trend")}
      ${mk("proposals", "Proposals", openProposals, "open")}
      ${mk("releases", "Releases", releases)}
      ${mk("activity", "Activity", activities)}
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
    case "readme":    return renderReadmeTab(ctx);
    case "runs":      return renderRunsTab(ctx);
    case "trend":     return renderTrendTab(ctx);
    case "proposals": return renderProposalsTab(ctx);
    case "releases":  return renderReleasesTab(ctx);
    case "activity":  return renderActivityTab(ctx);
    case "lineage":   return renderLineageTab(ctx);
    case "decisions": return renderDecisionsTab(ctx);
    case "notes":     return renderNotesTab(ctx);
    case "content":
    default:          return renderContentTab(ctx);
  }
}

// --- Tab: README ---
function renderReadmeTab({ project, prompt }) {
  if (!prompt.readme) {
    return `<div class="empty">
      <div class="ttl">No README yet</div>
      <div class="sub">A README is the place to document what this prompt does, its contract, and its shipping policy.</div>
      <button class="btn accent" data-act="edit-readme">${icon("pencil", { size: 13 })} Write README</button>
    </div>`;
  }
  return `
    <div class="section-head">
      <div class="eyebrow">Readme</div>
      <button class="btn" data-act="edit-readme">${icon("pencil", { size: 13 })} Edit</button>
    </div>
    <div class="form-card">${renderMarkdown(prompt.readme)}</div>`;
}

// --- Tab: Activity ---
function renderActivityTab({ project, prompt }) {
  const events = services.listPromptActivity(prompt, { limit: 100 });
  const ctx = {
    projectSlug: project.slug, promptSlug: prompt.slug,
    versionById: new Map(prompt.versions.map((v) => [v.id, v])),
    branchNameById: new Map(prompt.branches.map((b) => [b.id, b.name])),
  };
  return `
    <div class="section-head">
      <div class="eyebrow">Activity</div>
      <div class="meta">${events.length} event${events.length === 1 ? "" : "s"}</div>
    </div>
    ${timeline(events, ctx, project)}`;
}

// --- Tab: Releases ---
function renderReleasesTab({ project, prompt }) {
  const releases = services.listReleases(prompt);
  const byId = new Map(prompt.versions.map((v) => [v.id, v]));
  return `
    <div class="section-head">
      <div class="eyebrow">Releases</div>
      <button class="btn accent" data-act="new-release">${icon("plus", { size: 13 })} New release</button>
    </div>
    ${releases.length === 0
      ? `<div class="empty">
          <div class="ttl">No releases yet</div>
          <div class="sub">Tag a canonical version to mark a milestone. Release notes are auto-drafted from change summaries.</div>
        </div>`
      : releases.map((r) => {
          const v = byId.get(r.versionId);
          const author = resolveMember(project, r.createdBy);
          return `
          <div class="release-card" style="margin-bottom:12px">
            <div class="date">
              <div class="tag">${icon("crown", { size: 11 })} ${v ? `v${v.number}` : "?"}</div>
              <div>${escapeHtml(relTime(r.createdAt))}</div>
              <div style="margin-top:6px">${authorInline(author, 18)}</div>
            </div>
            <div>
              <div class="name">${escapeHtml(r.name)}</div>
              ${r.notes ? `<div class="notes">${escapeHtml(r.notes)}</div>` : ""}
            </div>
          </div>`;
        }).join("")}`;
}

// --- Tab: Proposals ---
function renderProposalsTab({ project, prompt }) {
  const proposals = services.listProposals(prompt);
  const byId = new Map(prompt.versions.map((v) => [v.id, v]));
  return `
    <div class="section-head">
      <div class="eyebrow">Proposed changes</div>
      <button class="btn accent" data-act="new-proposal">${icon("plus", { size: 13 })} New proposal</button>
    </div>
    ${proposals.length === 0
      ? `<div class="empty">
          <div class="ttl">No proposals yet</div>
          <div class="sub">Instead of promoting directly, open a proposal to collect review and evidence before merging to <code>main</code>.</div>
        </div>`
      : `<div style="display:flex;flex-direction:column;gap:10px">
          ${proposals.map((p) => {
            const src = byId.get(p.sourceVersionId);
            const author = resolveMember(project, p.openedBy);
            const commentCount = (p.comments?.length || 0) + (p.reviewComments?.length || 0);
            return `
              <a class="prop-card" href="#/p/${escapeHtml(project.slug)}/p/${escapeHtml(prompt.slug)}/proposals/${escapeHtml(p.id)}" style="display:block">
                <div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px">
                  <div style="min-width:0">
                    <span class="prop-state ${escapeHtml(p.status)}">${escapeHtml(p.status)}</span>
                    <span style="font-weight:600;font-size:14px;margin-left:8px">${escapeHtml(p.title)}</span>
                  </div>
                  <span class="prop-meta">${commentCount} comment${commentCount === 1 ? "" : "s"}</span>
                </div>
                <div class="prop-meta" style="margin-top:6px">
                  ${authorInline(author, 16)}
                  <span>opened ${escapeHtml(relTime(p.openedAt))}</span>
                  <span>·</span>
                  <span>source ${src ? `v${src.number} — ${escapeHtml(src.title)}` : "?"}</span>
                </div>
              </a>`;
          }).join("")}
        </div>`}`;
}

// --- Tab: Content (matches the screenshot exactly) ---
function renderContentTab(ctx) {
  const { prompt, version, project } = ctx;
  const parent = version.parentVersionId
    ? prompt.versions.find((v) => v.id === version.parentVersionId)
    : null;
  const findings = analyze({
    title: version.title, body: version.body,
    messages: version.messages, variables: version.variables || [],
  });
  const findingsByAnalyzer = groupBy(findings, (f) => f.analyzer);
  // ?blame=1 in the hash query toggles the blame view. Browser-only check.
  const blameActive = (location.hash.split("?")[1] || "").split("&").includes("blame=1");

  const baseUrl = `/p/${escapeHtml(project.slug)}/p/${escapeHtml(prompt.slug)}/v/${escapeHtml(version.id)}`;
  const toggleHref = blameActive
    ? `#${baseUrl}`
    : `#${baseUrl}?blame=1`;
  const toggleLabel = blameActive ? "Hide blame" : "Show blame";

  return `
    <div class="section">
      <div class="section-head">
        <div class="eyebrow">Prompt body</div>
        <div style="display:flex;align-items:center;gap:10px">
          <a href="${toggleHref}" class="btn sm" data-blame-toggle>${icon(blameActive ? "tree" : "fork", { size: 12 })} ${toggleLabel}</a>
          <div class="meta">${version.body.length} chars · ${version.body.split(/\r?\n/).length} lines</div>
        </div>
      </div>
      ${blameActive
        ? renderBlameBody(prompt, project, version)
        : `<div class="code-frame"><pre>${escapeHtml(version.body)}</pre></div>`}
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
          <div class="row"><div class="k">Created</div><div class="v">${escapeHtml(relTime(version.createdAt))} ${version.createdBy ? "· " + authorInline(resolveMember(ctx.project, version.createdBy), 16) : ""}</div></div>
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

// ---------------------------------------------------------------------------
// Blame body — table with one row per body line.
// Consecutive lines from the same source version share a gutter cell
// (rowspan-style by collapsing into one rendered row), so a block of
// 30 unchanged lines doesn't repeat the same author 30 times.
// ---------------------------------------------------------------------------
function renderBlameBody(prompt, project, version) {
  const attribution = blame(prompt.versions, version.id);
  if (!attribution.length) {
    return `<div class="code-frame"><pre>${escapeHtml(version.body)}</pre></div>`;
  }
  const versionById = new Map(prompt.versions.map((v) => [v.id, v]));

  // Group consecutive same-source lines into runs.
  const runs = [];
  let cur = null;
  attribution.forEach((line, idx) => {
    if (cur && cur.sourceVersionId === line.sourceVersionId) {
      cur.lines.push({ ...line, lineNo: idx + 1 });
    } else {
      cur = {
        sourceVersionId: line.sourceVersionId,
        sourceVersionNumber: line.sourceVersionNumber,
        lines: [{ ...line, lineNo: idx + 1 }],
      };
      runs.push(cur);
    }
  });

  return `
    <div class="blame">
      <table>
        <colgroup>
          <col class="blame-gutter-col" />
          <col class="blame-lineno-col" />
          <col />
        </colgroup>
        <tbody>
          ${runs.map((run) => renderBlameRun(run, versionById, project, prompt)).join("")}
        </tbody>
      </table>
    </div>`;
}

function renderBlameRun(run, versionById, project, prompt) {
  const sv = versionById.get(run.sourceVersionId);
  const author = sv ? resolveMember(project, sv.createdBy) : null;
  const isCurrent = false;
  const blockSize = run.lines.length;
  const summary = sv?.changeSummary || "(no change summary)";
  const tooltip = sv
    ? `v${sv.number} · ${author?.name || "?"} · ${escapeHtml(sv.changeSummary || "(no summary)")}`
    : "?";
  const href = sv
    ? `#/p/${escapeHtml(project.slug)}/p/${escapeHtml(prompt.slug)}/v/${escapeHtml(sv.id)}`
    : "#";
  const gutter = `
    <a class="blame-gutter ${isCurrent ? "self" : ""}" href="${href}" title="${escapeAttr(tooltip)}">
      ${author ? avatar(author, 18) : ""}
      <span class="vno">v${run.sourceVersionNumber}</span>
      <span class="why">${escapeHtml(summary)}</span>
    </a>`;

  return run.lines.map((l, i) => {
    const cellGutter = i === 0
      ? `<td class="gutter-cell" rowspan="${blockSize}">${gutter}</td>`
      : "";
    return `<tr>
      ${cellGutter}
      <td class="lineno">${l.lineNo}</td>
      <td class="content"><pre>${escapeHtml(l.text || " ")}</pre></td>
    </tr>`;
  }).join("");
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
  const headerRight = runs.length
    ? `<div style="display:flex;gap:6px;align-items:center">
         <span class="meta" style="margin-right:6px">${runs.length} run${runs.length === 1 ? "" : "s"}</span>
         <button class="btn sm" data-act="export-runs">${icon("download", { size: 12 })} Export all (JSON)</button>
       </div>`
    : "";
  if (!runs.length) {
    return `
      <div class="section-head">
        <div class="eyebrow">Runs &amp; evidence</div>
      </div>
      <div class="empty">
        <div class="ttl">No runs on this version yet</div>
        <div class="sub">Use the <strong>Run</strong> button above to execute this version against a test case.</div>
      </div>`;
  }
  return `
    <div class="section-head">
      <div class="eyebrow">Runs &amp; evidence</div>
      ${headerRight}
    </div>
    <table class="table">
      <thead>
        <tr>
          <th>When</th><th>Test case</th><th>Model</th><th>Status</th>
          <th class="right">Latency</th><th class="right">Tokens</th>
          <th class="right">Cost</th><th class="right">Score</th><th></th>
        </tr>
      </thead>
      <tbody>
        ${runs.map((r) => {
          const tc = findTestCase(project, r.testCaseId);
          const mp = project.modelProfiles.find((m) => m.id === r.modelProfileId);
          const score = services.aggregateRunScore(prompt, r.id);
          const mockBadge = r.mocked
            ? `<span title="${escapeAttr(r.mockedReason || 'Mock fallback used')}" style="display:inline-block;margin-left:6px;padding:1px 6px;border-radius:4px;background:var(--amber-50);color:var(--amber-700);border:1px solid var(--amber-200);font-size:10px;font-weight:600;letter-spacing:.04em;text-transform:uppercase">mock</span>`
            : "";
          const errorRow = r.status === "failed" && r.error
            ? `<tr><td></td><td colspan="8" style="color:var(--rose-700);font-size:12px;padding-top:0">${escapeHtml(r.error)}</td></tr>`
            : "";
          // Cost cell: filled async by the post-render pass below.
          // Falls back to "—" when we can't compute (no model resolved).
          return `
            <tr class="run-row" data-run-id="${escapeAttr(r.id)}">
              <td class="mono">${escapeHtml(relTime(r.createdAt))}</td>
              <td>${tc ? escapeHtml(tc.name) : '<span style="color:var(--fg-faint)">ad-hoc</span>'}</td>
              <td>${mp ? escapeHtml(mp.name) : "—"}${mockBadge}</td>
              <td>${runStatusPill(r.status)}</td>
              <td class="right">${r.latencyMs ?? "—"} ms</td>
              <td class="right" data-cell="tokens-${escapeAttr(r.id)}">${(r.inputTokens ?? "?")}/${(r.outputTokens ?? "?")}</td>
              <td class="right" data-cell="cost-${escapeAttr(r.id)}"><span style="color:var(--fg-faint)">…</span></td>
              <td class="right">${scoreCell(score)}</td>
              <td class="right" style="color:var(--fg-faint);font-size:11px">open ↗</td>
            </tr>${errorRow}`;
        }).join("")}
      </tbody>
    </table>`;
}

// --- Tab: Trend ---
//
// X-axis = version number (only versions with at least one run, in
// chronological order). Y-axis = mean evaluation score, 0..100%.
//
// Series:
//   - one bold "Mean" line across all evaluations of each version
//   - one finer line per (test case) — surfaces regressions that
//     average-out at the aggregate level.
function renderTrendTab({ project, prompt }) {
  const trend = services.scoreTrend(prompt, project);
  if (!trend.length) {
    return `
      <div class="section-head">
        <div class="eyebrow">Score trend</div>
      </div>
      <div class="empty">
        <div class="ttl">No scored runs yet</div>
        <div class="sub">Run a few versions against your test cases — the trend chart appears as soon as evaluator scores accumulate.</div>
      </div>`;
  }

  // Per-test-case series (always include "ad-hoc" if present).
  const tcKeys = new Set();
  for (const t of trend) for (const k of Object.keys(t.byTestCase)) tcKeys.add(k);
  const tcList = [...tcKeys];

  // Distinct, friendly colours per series (consistent across renders).
  const palette = ["#0891b2", "#10b981", "#f59e0b", "#ec4899", "#0ea5e9", "#14b8a6", "#22c55e", "#f43f5e"];
  const colorOf = (i) => palette[i % palette.length];

  const baseHref = `#/p/${project.slug}/p/${prompt.slug}/v/`;

  const meanSeries = {
    name: "Mean (all evals)",
    color: "var(--ink-950)",
    points: trend.map((t) => ({
      x: t.number,
      y: t.mean,
      label: `v${t.number} · ${(t.mean * 100).toFixed(0)}% (${t.runCount} run${t.runCount === 1 ? "" : "s"})`,
      href: baseHref + t.versionId,
    })),
  };

  const tcSeries = tcList.map((key, i) => {
    const points = trend
      .filter((t) => t.byTestCase[key] != null)
      .map((t) => {
        const cell = t.byTestCase[key];
        return {
          x: t.number,
          y: cell.score,
          label: `v${t.number} · ${cell.name} · ${(cell.score * 100).toFixed(0)}%`,
          href: baseHref + t.versionId,
        };
      });
    return {
      name: trend.find((t) => t.byTestCase[key])?.byTestCase[key]?.name || key,
      color: colorOf(i),
      points,
    };
  });

  const xTicks = trend.map((t) => ({ x: t.number, label: `v${t.number}` }));

  // Compose chart. Mean series rendered last so it sits on top.
  const chart = lineChart({
    width: 720, height: 240,
    xAxis: { label: "Version", ticks: xTicks },
    yAxis: { label: "Score", min: 0, max: 1, format: (v) => Math.round(v * 100) + "%" },
    series: [...tcSeries, meanSeries],
  });

  // Sidebar: latest mean + delta vs previous.
  const last = trend[trend.length - 1];
  const prev = trend.length >= 2 ? trend[trend.length - 2] : null;
  const delta = prev ? (last.mean - prev.mean) : null;
  const deltaCls = delta == null ? "" : delta > 0 ? "good" : delta < 0 ? "bad" : "";
  const deltaLabel = delta == null
    ? "first scored version"
    : `${delta >= 0 ? "+" : ""}${(delta * 100).toFixed(0)}% vs v${prev.number}`;

  return `
    <div class="section-head">
      <div class="eyebrow">Score trend across versions</div>
      <div class="meta">${trend.length} version${trend.length === 1 ? "" : "s"} with runs</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 200px;gap:18px;align-items:flex-start">
      <div data-trend-chart>${chart}</div>
      <div class="form-card">
        <div class="eyebrow" style="margin-bottom:6px">Latest</div>
        <div style="font-size:22px;font-weight:600;letter-spacing:-0.01em">${(last.mean * 100).toFixed(0)}%</div>
        <div style="font-size:12px;color:var(--fg-muted)">v${last.number} · ${last.runCount} run${last.runCount === 1 ? "" : "s"}</div>
        <div class="score ${deltaCls}" style="margin-top:8px;font-family:var(--font-mono);font-size:12.5px">${escapeHtml(deltaLabel)}</div>
        ${tcList.length > 1 ? `
          <div class="eyebrow" style="margin-top:14px;margin-bottom:6px">Per test case</div>
          <ul style="list-style:none;padding:0;margin:0;font-size:12.5px;color:var(--fg-muted);display:flex;flex-direction:column;gap:4px">
            ${tcList.map((k, i) => {
              const cell = last.byTestCase[k];
              if (!cell) return "";
              return `<li style="display:flex;align-items:center;gap:6px">
                <span style="width:10px;height:10px;border-radius:50%;background:${colorOf(i)};display:inline-block"></span>
                <span style="flex:1;color:var(--fg)">${escapeHtml(cell.name)}</span>
                <span class="score ${cell.score >= 0.8 ? "good" : cell.score >= 0.5 ? "mid" : "bad"}" style="font-family:var(--font-mono)">${(cell.score * 100).toFixed(0)}%</span>
              </li>`;
            }).join("")}
          </ul>` : ""}
      </div>
    </div>`;
}

function findTestCase(project, id) {
  if (!id) return null;
  for (const d of project.datasets || [])
    for (const tc of d.testCases || []) if (tc.id === id) return tc;
  return null;
}

// Small pill for run statuses (distinct palette from version statuses).
function runStatusPill(status) {
  const map = {
    succeeded: ["var(--green-50)",  "var(--green-200)", "var(--green-700)"],
    running:   ["var(--blue-50)",   "var(--blue-200)",  "var(--blue-700)"],
    queued:    ["var(--bg-sunk)",   "var(--border)",    "var(--fg-muted)"],
    failed:    ["var(--rose-50)",   "var(--rose-200)",  "var(--rose-700)"],
  };
  const [bg, bd, fg] = map[status] || map.queued;
  return `<span style="display:inline-flex;align-items:center;gap:4px;font-size:10.5px;font-weight:500;padding:2px 8px;border-radius:999px;background:${bg};border:1px solid ${bd};color:${fg}"><span style="width:5px;height:5px;border-radius:50%;background:${fg}"></span>${escapeHtml(status)}</span>`;
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
  root.querySelector('[data-act="batch"]')?.addEventListener("click", () => openBatchModal(ctx));
  root.querySelector('[data-act="refine"]')?.addEventListener("click", () =>
    navigate(`/p/${ctx.project.slug}/p/${ctx.prompt.slug}/refine/${ctx.version.id}`));
  root.querySelector('[data-act="compare"]')?.addEventListener("click", () =>
    navigate(`/p/${ctx.project.slug}/p/${ctx.prompt.slug}/compare`, { b: ctx.version.id }));
  root.querySelector('[data-act="share"]')?.addEventListener("click", () => openShareModal(ctx));
  root.querySelector('.main-head [data-act="copy-json"]')?.addEventListener("click", () => openCopyJsonModal(ctx));
  root.querySelector('[data-act="promote"]')?.addEventListener("click", () => openPromoteModal(ctx));

  // --- notes tab quick add ---
  root.querySelector('[data-act="add-note"]')?.addEventListener("click", () => openNoteModal(ctx));

  // --- readme ---
  root.querySelector('[data-act="edit-readme"]')?.addEventListener("click", () => openReadmeModal(ctx));

  // --- releases ---
  root.querySelector('[data-act="new-release"]')?.addEventListener("click", () => openReleaseModal(ctx));

  // --- proposals ---
  root.querySelector('[data-act="new-proposal"]')?.addEventListener("click", () => openProposalModal(ctx));

  // --- runs tab: row click → drawer; export-all button ---
  root.querySelectorAll(".run-row").forEach((row) => {
    row.addEventListener("click", () => openRunDrawer(ctx, row.dataset.runId));
  });
  root.querySelector('[data-act="export-runs"]')?.addEventListener("click", () => exportRunsBundle(ctx));

  // --- runs tab: fill in the async cost cells ---
  fillRunCostCells(ctx, root).catch((err) => console.warn("cost fill failed:", err));

  // --- trend chart tooltips ---
  const chartHost = root.querySelector("[data-trend-chart]");
  if (chartHost) bindChartTooltips(chartHost);
}

// Walks the visible runs table and writes a real-or-estimated cost into
// each `[data-cell="cost-<runId>"]` cell, plus an "≈ in/out" badge into
// the tokens cell when the row had no provider-reported tokens.
async function fillRunCostCells(ctx, root) {
  const cells = root.querySelectorAll('[data-cell^="cost-"]');
  if (!cells.length) return;
  const { tokensFor, formatCost } = await import("../tokens.js");
  const { costFor } = await import("../pricing.js");
  const { prompt, project, version } = ctx;
  const runs = (prompt.runs || []).filter((r) => r.versionId === version.id);
  for (const r of runs) {
    const profile = project.modelProfiles.find((m) => m.id === r.modelProfileId);
    if (!profile) continue;
    let inT = r.inputTokens, outT = r.outputTokens;
    let estimated = false;
    if (inT == null && r.renderedPrompt) {
      const t = await tokensFor(r.renderedPrompt, profile.modelId);
      inT = t.tokens; estimated = true;
    }
    if (outT == null && r.rawOutput) {
      const t = await tokensFor(r.rawOutput, profile.modelId);
      outT = t.tokens; estimated = true;
    }
    const tokenCell = root.querySelector(`[data-cell="tokens-${r.id}"]`);
    if (tokenCell) {
      tokenCell.innerHTML = (inT != null || outT != null)
        ? `${estimated ? "≈ " : ""}${(inT ?? "?")}/${(outT ?? "?")}`
        : "—";
    }
    const costCell = root.querySelector(`[data-cell="cost-${r.id}"]`);
    if (!costCell) continue;
    const c = costFor({
      provider: profile.provider, modelId: profile.modelId,
      inputTokens: inT || 0, outputTokens: outT || 0,
    });
    costCell.innerHTML = c.total === 0 && profile.provider === "mock"
      ? `<span style="color:var(--fg-faint)">$0</span>`
      : `<span title="in ${formatCost(c.in)} · out ${formatCost(c.out)}">${formatCost(c.total)}</span>`;
  }
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
    "B": () => openBatchModal(ctx),
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

  // Bind two live hints inside the modal:
  //   1. provider status (real vs mock fallback)
  //   2. token + cost estimate of the rendered prompt with the current
  //      bindings — recomputes on every keystroke / model change.
  setTimeout(async () => {
    const sel = document.getElementById("run-profile");
    const status = document.getElementById("provider-status");
    const cost = document.getElementById("cost-estimate");
    const bindingsEl = document.querySelector('textarea[name="bindings"]');
    const tcSel = document.querySelector('select[name="testCaseId"]');
    if (!sel) return;

    const { describeProvider } = await import("../adapters/models/registry.js");
    const { tokensFor, formatCost } = await import("../tokens.js");
    const { costFor } = await import("../pricing.js");
    const { render } = await import("../domain.js");

    const updateProvider = async () => {
      if (!status) return;
      const opt = sel.selectedOptions[0];
      const provider = opt?.dataset.provider || "mock";
      const desc = await describeProvider(provider);
      status.innerHTML = desc.real
        ? `<span style="color:var(--green-700)">●</span> ${escapeHtml(desc.label)}`
        : `<span style="color:var(--amber-700)">●</span> ${escapeHtml(desc.label)} <a href="#/settings" style="color:var(--accent-fg);text-decoration:underline">Open Settings →</a>`;
    };

    let pending = 0;
    const updateCost = async () => {
      if (!cost) return;
      const opt = sel.selectedOptions[0];
      const profileId = sel.value;
      const profile = (project.modelProfiles || []).find((m) => m.id === profileId);
      if (!profile) { cost.textContent = ""; return; }

      // Build effective bindings: test case's inputVariables overlaid by
      // the textarea (so the user can override).
      let bindings = {};
      const tcId = tcSel?.value;
      if (tcId) {
        const tc = (project.datasets || []).flatMap((d) => d.testCases || []).find((c) => c.id === tcId);
        if (tc?.inputVariables) bindings = { ...tc.inputVariables };
      }
      try {
        const extra = bindingsEl?.value ? JSON.parse(bindingsEl.value) : {};
        bindings = { ...bindings, ...extra };
      } catch { /* invalid JSON — ignore for the estimate */ }

      let rendered;
      try { rendered = render(version.body, version.variables || [], bindings); }
      catch { rendered = version.body; }

      const myToken = ++pending;
      cost.innerHTML = `<span style="color:var(--fg-faint)">estimating…</span>`;
      const r = await tokensFor(rendered, profile.modelId);
      if (myToken !== pending) return; // stale — newer request in flight
      const c = costFor({
        provider: profile.provider, modelId: profile.modelId,
        inputTokens: r.tokens, outputTokens: 0,
      });
      const methodLabel = r.method === "tiktoken" ? "" : "≈ ";
      cost.innerHTML =
        `<span>${methodLabel}<strong>${r.tokens.toLocaleString()}</strong> input tokens</span>` +
        `<span style="margin-left:8px;color:var(--fg-faint)">~${formatCost(c.in)} in · output billed at ${formatCost(c.rate.out / 1_000_000)} / token</span>`;
    };

    sel.addEventListener("change", () => { updateProvider(); updateCost(); });
    bindingsEl?.addEventListener("input", () => updateCost());
    tcSel?.addEventListener("change", () => updateCost());
    await updateProvider();
    await updateCost();
  }, 0);

  modal({
    title: `Run v${version.number}`,
    sub: "Renders the prompt, calls the model, and attaches evaluations.",
    body: `
      <div class="row"><label>Model profile <span class="req">*</span></label>
        <select name="modelProfileId" required id="run-profile">
          ${profiles.map((m) => `<option value="${escapeAttr(m.id)}" data-provider="${escapeAttr(m.provider)}">${escapeHtml(m.name)} · ${escapeHtml(m.provider)}:${escapeHtml(m.modelId)}</option>`).join("")}
        </select>
        <div id="provider-status" class="helper" style="margin-top:6px">Checking provider…</div>
      </div>
      <div class="row"><label>Test case</label>
        <select name="testCaseId">
          <option value="">— ad-hoc (use bindings below) —</option>
          ${cases.map((c) => `<option value="${escapeAttr(c.id)}">${escapeHtml(c.datasetName)} · ${escapeHtml(c.name)}</option>`).join("")}
        </select></div>
      <div class="row"><label>Variable bindings (JSON)</label>
        <textarea name="bindings" placeholder='{"ticket":"I was charged twice."}'>${escapeHtml(JSON.stringify(suggested, null, 2))}</textarea>
        <div id="cost-estimate" class="helper" style="margin-top:6px;font-size:12px"></div></div>
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
      // Navigate first so the user sees the running row appear, then await
      // the run to resolve. If it fails, surface the provider's error.
      navigate(`/p/${project.slug}/p/${prompt.slug}/v/${version.id}`, { tab: "runs" });
      const runId = await services.createRun({
        promptId: prompt.id, versionId: version.id,
        modelProfileId: data.modelProfileId,
        testCaseId: data.testCaseId || null,
        variableBindings: bindings, evaluators,
      });
      await commit();
      const s2 = getState();
      const freshPrompt = s2?.projects?.flatMap((p) => p.prompts).find((p) => p.id === prompt.id);
      const finalRun = freshPrompt?.runs?.find((r) => r.id === runId);
      if (finalRun?.status === "failed") {
        toast(`Run failed: ${finalRun.error || "unknown error"}`);
      } else if (finalRun?.mocked) {
        toast(`Run completed (mock fallback) — see Settings`);
      } else {
        toast("Run completed");
      }
    },
  });
}

// Matrix run: |profiles| × |test cases| runs on one version. Each child
// run is an ordinary row — the Runs tab, Trend chart, Compare evidence
// all pick them up automatically.
function openBatchModal({ project, prompt, version }) {
  const profiles = project.modelProfiles || [];
  const cases = (project.datasets || []).flatMap(
    (d) => (d.testCases || []).map((tc) => ({ ...tc, datasetName: d.name })));

  if (!profiles.length) {
    modal({
      title: "Batch run — needs model profiles",
      body: `<p style="color:var(--fg-muted);font-size:13px">Add model profiles under the Models tab. The <code>mock</code> provider works with no API key and is perfect for offline use.</p>`,
      primary: "OK",
      onSubmit: () => {},
    });
    return;
  }

  const profileRows = profiles.map((m) => `
    <label class="batch-row">
      <input type="checkbox" data-kind="profile" value="${escapeAttr(m.id)}" data-provider="${escapeAttr(m.provider)}" data-model-id="${escapeAttr(m.modelId)}" checked />
      <span class="batch-row-label">
        <strong>${escapeHtml(m.name)}</strong>
        <span class="batch-row-meta">${escapeHtml(m.provider)}:${escapeHtml(m.modelId)}</span>
      </span>
    </label>`).join("");

  const caseRows = cases.length ? cases.map((c) => `
    <label class="batch-row">
      <input type="checkbox" data-kind="case" value="${escapeAttr(c.id)}" checked />
      <span class="batch-row-label">
        <strong>${escapeHtml(c.name)}</strong>
        <span class="batch-row-meta">${escapeHtml(c.datasetName)}</span>
      </span>
    </label>`).join("")
    : `<div class="empty" style="padding:14px"><div class="sub">No test cases in this project. The batch will use ad-hoc variable bindings from the version defaults.</div></div>`;

  // Live totals: profiles × cases, plus a cost estimate that sums each
  // profile's input cost (the rendered prompt is identical per test case
  // modulo variable substitution — we approximate with defaults so the
  // user sees a ballpark before launching).
  setTimeout(async () => {
    const root = document.getElementById("modal-root");
    if (!root) return;
    const { tokensFor, formatCost } = await import("../tokens.js");
    const { costFor } = await import("../pricing.js");
    const { render } = await import("../domain.js");

    // Pre-render once with version defaults — good enough for a cost
    // estimate. Per-test-case rendering would overwhelm the modal and
    // differ only in the variable values.
    let rendered;
    try {
      const bindings = {};
      for (const v of version.variables || []) bindings[v.name] = v.defaultValue ?? "";
      rendered = render(version.body, version.variables || [], bindings);
    } catch { rendered = version.body; }

    // Token count per profile caches across changes.
    const tokenCache = new Map();
    async function tokensForProfile(profile) {
      const k = profile.modelId;
      if (tokenCache.has(k)) return tokenCache.get(k);
      const r = await tokensFor(rendered, profile.modelId);
      tokenCache.set(k, r);
      return r;
    }

    const totals = root.querySelector("[data-batch-totals]");
    async function refresh() {
      if (!totals) return;
      const profIds = [...root.querySelectorAll('[data-kind="profile"]:checked')].map((i) => i.value);
      const caseIds = [...root.querySelectorAll('[data-kind="case"]:checked')].map((i) => i.value);
      const nProfiles = profIds.length;
      const nCases = Math.max(1, caseIds.length); // ad-hoc = 1 cell per profile
      const count = nProfiles * nCases;

      if (nProfiles === 0) {
        totals.innerHTML = `<span style="color:var(--rose-700)">Select at least one model profile.</span>`;
        return;
      }

      let totalCost = 0;
      let approx = false;
      for (const id of profIds) {
        const p = profiles.find((m) => m.id === id);
        if (!p) continue;
        const tok = await tokensForProfile(p);
        if (tok.method !== "tiktoken") approx = true;
        const c = costFor({ provider: p.provider, modelId: p.modelId, inputTokens: tok.tokens, outputTokens: 0 });
        totalCost += c.in * nCases;
      }
      const prefix = approx ? "≈ " : "";
      totals.innerHTML = `
        <strong>${count}</strong> run${count === 1 ? "" : "s"}
        <span style="color:var(--fg-faint)">(${nProfiles} model${nProfiles === 1 ? "" : "s"} × ${nCases} ${cases.length ? `case${nCases === 1 ? "" : "s"}` : "ad-hoc"})</span>
        <span style="margin-left:10px">${prefix}<strong>${formatCost(totalCost)}</strong> input cost · output billed per-token</span>`;
    }

    // Wire Select all / none and per-checkbox listeners.
    root.querySelectorAll("[data-batch-group]").forEach((group) => {
      const kind = group.getAttribute("data-batch-group");
      group.querySelectorAll(`[data-sel]`).forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          const mode = btn.getAttribute("data-sel");
          root.querySelectorAll(`[data-kind="${kind}"]`).forEach((cb) => {
            cb.checked = mode === "all";
          });
          refresh();
        });
      });
    });
    root.querySelectorAll('[data-kind="profile"], [data-kind="case"]').forEach((cb) => {
      cb.addEventListener("change", refresh);
    });
    refresh();
  }, 0);

  modal({
    title: `Batch run v${version.number}`,
    sub: `Runs this version across every selected (model × test case) pair. Each cell is an ordinary run — it shows up in the Runs tab and feeds the Trend chart.`,
    body: `
      <div class="batch-grid">
        <div data-batch-group="profile">
          <div class="batch-head">
            <label>Model profiles</label>
            <span class="batch-selectors">
              <button type="button" class="batch-sel" data-sel="all">all</button>
              <span style="color:var(--ink-300)">·</span>
              <button type="button" class="batch-sel" data-sel="none">none</button>
            </span>
          </div>
          <div class="batch-list">${profileRows}</div>
        </div>
        <div data-batch-group="case">
          <div class="batch-head">
            <label>Test cases</label>
            <span class="batch-selectors">
              <button type="button" class="batch-sel" data-sel="all">all</button>
              <span style="color:var(--ink-300)">·</span>
              <button type="button" class="batch-sel" data-sel="none">none</button>
            </span>
          </div>
          <div class="batch-list">${caseRows}</div>
        </div>
      </div>
      <div class="row" style="margin-top:10px"><label>Evaluators</label>
        <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:13px">
          <label><input type="checkbox" name="ev_regex" checked> Regex / contains</label>
          <label><input type="checkbox" name="ev_schema"> JSON schema</label>
          <label><input type="checkbox" name="ev_similarity"> Similarity</label>
        </div>
      </div>
      <div class="batch-totals" data-batch-totals></div>`,
    primary: "Launch batch", secondary: "Cancel",
    onSubmit: async (data) => {
      const root = document.getElementById("modal-root");
      const modelProfileIds = [...root.querySelectorAll('[data-kind="profile"]:checked')].map((i) => i.value);
      const testCaseIds     = [...root.querySelectorAll('[data-kind="case"]:checked')].map((i) => i.value);
      if (!modelProfileIds.length) throw new Error("Select at least one model profile.");

      const evaluators = [];
      if (data.ev_regex) evaluators.push("regex");
      if (data.ev_schema) evaluators.push("schema");
      if (data.ev_similarity) evaluators.push("similarity");

      // Switch to Runs tab so the user sees the running rows appear.
      navigate(`/p/${project.slug}/p/${prompt.slug}/v/${version.id}`, { tab: "runs" });

      const { runIds, errors, total } = await services.batchRun({
        promptId: prompt.id, versionId: version.id,
        modelProfileIds, testCaseIds,
        evaluators,
      });
      await commit();

      // Summarise outcome. Per-cell failures are already visible as
      // "failed" rows — we just count them here.
      const s2 = getState();
      const freshPrompt = s2?.projects?.flatMap((p) => p.prompts).find((p) => p.id === prompt.id);
      const mine = (freshPrompt?.runs || []).filter((r) => runIds.includes(r.id));
      const failed = mine.filter((r) => r.status === "failed").length + errors.length;
      const mocked = mine.filter((r) => r.mocked).length;
      if (failed > 0)      toast(`Batch finished: ${total - failed}/${total} ok · ${failed} failed`);
      else if (mocked > 0) toast(`Batch finished: ${total} runs (${mocked} mock fallback — see Settings)`);
      else                 toast(`Batch finished: ${total} runs`);
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

// --- Share: builds a read-only link encoding a minimum prompt slice.
// The payload lives in the URL hash (#/share?d=<base64url>), never
// leaves the browser, and — like everything else in the app — never
// carries secrets (readme, body, decisions yes; API keys never). ---
async function openShareModal({ project, prompt, version }) {
  let slice, url, err;
  try {
    slice = packShare({ project, prompt, versionId: version.id });
    url = await buildShareUrl(slice);
  } catch (e) {
    err = e?.message || String(e);
  }
  const includes = slice
    ? `${slice.versions.length} version${slice.versions.length === 1 ? "" : "s"} · ${slice.branches.length} branch${slice.branches.length === 1 ? "" : "es"}`
    : "—";
  modal({
    title: "Share this version",
    sub: "The full prompt slice is encoded into the link. Open it in any browser — no account required.",
    body: err
      ? `<div class="modal-error" style="display:block">${escapeHtml(err)}</div>`
      : `
        <div class="row">
          <label>Shareable URL</label>
          <textarea readonly style="min-height:96px;font-family:var(--mono);font-size:12px" data-share-url>${escapeHtml(url)}</textarea>
        </div>
        <div class="kv" style="margin-top:8px">
          <div class="row"><div class="k">Includes</div><div class="v">${escapeHtml(includes)}</div></div>
          <div class="row"><div class="k">Target</div><div class="v">v${version.number} — ${escapeHtml(version.title)}</div></div>
          <div class="row"><div class="k">Length</div><div class="v">${url ? url.length.toLocaleString() + " chars" : "—"}</div></div>
        </div>
        <div class="helper">Anyone with this link can read the prompt body, version chain, and README. Nothing is sent to a server.</div>`,
    primary: "Copy link", secondary: "Close",
    onSubmit: async () => {
      if (!url) return;
      try {
        await navigator.clipboard.writeText(url);
        toast("Share link copied", {
          actionLabel: "Open preview",
          onAction: () => { window.open(url, "_blank", "noopener"); },
        });
      } catch {
        toast("Copy failed — select the text manually");
      }
    },
  });
  // Auto-select the URL so ⌘C works immediately.
  setTimeout(() => {
    const ta = document.querySelector("[data-share-url]");
    if (ta) { ta.focus(); ta.select(); }
  }, 50);
}

// --- Copy-JSON (D3 fork-to-clipboard): produces a portable
// prompt-tree-template/1 payload with a `source` provenance block. The
// same payload re-imports cleanly through the templates library, so a
// fork and a curated starter walk the exact same consumer path. ---
function openCopyJsonModal({ project, prompt, version }) {
  let payload, err;
  try {
    payload = packFork({ project, prompt, version });
  } catch (e) {
    err = e?.message || String(e);
  }
  const json = payload ? JSON.stringify(payload, null, 2) : "";
  const sizeKb = json ? (new TextEncoder().encode(json).byteLength / 1024).toFixed(1) : "0";
  modal({
    title: "Copy prompt as portable JSON",
    sub: "prompt-tree-template/1 envelope with a source provenance block. Paste into another Prompt Tree workspace to re-import.",
    body: err
      ? `<div class="modal-error" style="display:block">${escapeHtml(err)}</div>`
      : `
        <div class="row">
          <label>JSON payload</label>
          <textarea readonly style="min-height:220px;font-family:var(--mono);font-size:12px" data-fork-json>${escapeHtml(json)}</textarea>
        </div>
        <div class="kv" style="margin-top:8px">
          <div class="row"><div class="k">Source</div><div class="v">${escapeHtml(project.name)} / ${escapeHtml(prompt.name)} · v${version.number}</div></div>
          <div class="row"><div class="k">Hash</div><div class="v mono">${escapeHtml((version.contentHash || "").slice(0, 7))}</div></div>
          <div class="row"><div class="k">Size</div><div class="v">${sizeKb} KB · ${json.length.toLocaleString()} chars</div></div>
        </div>
        <div class="actions" style="margin-top:8px;justify-content:flex-end;display:flex;gap:8px">
          <button type="button" class="btn" data-act="fork-download">${icon("download", { size: 13 })} Download .json</button>
        </div>
        <div class="helper">Forks never carry runs, proposals, decisions, or API keys — just the version's content, variables, and README with provenance.</div>`,
    primary: "Copy JSON", secondary: "Close",
    onSubmit: async () => {
      if (!json) return;
      try {
        await navigator.clipboard.writeText(json);
        toast("Copied portable JSON to clipboard");
      } catch {
        toast("Copy failed — select the textarea manually");
      }
    },
  });
  setTimeout(() => {
    const ta = document.querySelector("[data-fork-json]");
    if (ta) { ta.focus(); ta.select(); }
    const dl = document.querySelector('[data-act="fork-download"]');
    dl?.addEventListener("click", () => {
      if (!payload) return;
      downloadJSON(fileNameForFork(payload), payload);
      toast("Downloaded fork JSON");
    });
  }, 50);
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

// ---------------------------------------------------------------------------
// README / Release / Proposal modals
// ---------------------------------------------------------------------------
function openReadmeModal({ project, prompt }) {
  const current = prompt.readme || "";
  modal({
    title: "Edit README",
    sub: "Supports markdown: headings, lists, **bold**, `code`, [links](#).",
    body: `
      <div class="row"><label>README (markdown)</label>
        <textarea name="readme" style="min-height:280px">${escapeHtml(current)}</textarea></div>
      <div class="helper">Tip: describe the contract, the shipping policy, and any special rules a new contributor must know.</div>`,
    primary: "Save README", secondary: "Cancel",
    onSubmit: async (data) => {
      services.setPromptReadme({ promptId: prompt.id, readme: data.readme });
      await commit();
      toast("README saved");
    },
  });
}

function openReleaseModal({ project, prompt, version }) {
  // Default name = next semver-ish. Notes auto-drafted from change summaries
  // since the last release's version.
  const releases = services.listReleases(prompt);
  const lastReleaseVersionId = releases[0]?.versionId ?? null;
  const suggestedNotes = services.draftReleaseNotes(prompt, version.id, lastReleaseVersionId)
    || `- v${version.number}: ${version.changeSummary || "(no summary)"}`;
  const suggestedName = releases.length
    ? `v0.${releases.length + 1}`
    : "v0.1";

  modal({
    title: `Release v${version.number}`,
    sub: "Tag this version as a milestone. Release notes are auto-drafted from the change summaries since the last release.",
    body: `
      <div class="row"><label>Name <span class="req">*</span></label>
        <input name="name" required value="${escapeAttr(suggestedName)}" placeholder="v1.0 — Production launch" /></div>
      <div class="row"><label>Notes</label>
        <textarea name="notes" style="min-height:160px">${escapeHtml(suggestedNotes)}</textarea></div>`,
    primary: "Publish release", secondary: "Cancel",
    onSubmit: async (data) => {
      services.createRelease({
        promptId: prompt.id, versionId: version.id,
        name: data.name, notes: data.notes || "",
      });
      await commit();
      toast("Release published");
    },
  });
}

function openProposalModal({ project, prompt, version }) {
  const existing = (prompt.proposals || []).find(
    (p) => p.status === "open" && p.sourceVersionId === version.id,
  );
  if (existing) {
    toast("An open proposal already exists for this version");
    navigate(`/p/${project.slug}/p/${prompt.slug}/proposals/${existing.id}`);
    return;
  }
  modal({
    title: "Open proposed change",
    sub: `Proposes merging v${version.number} into the canonical branch. Review + evidence collects here before merge.`,
    body: `
      <div class="row"><label>Title <span class="req">*</span></label>
        <input name="title" required value="${escapeAttr(`Promote v${version.number} — ${version.title}`)}" /></div>
      <div class="row"><label>Description</label>
        <textarea name="description" style="min-height:140px" placeholder="What changes? What evidence supports shipping it? Any risks?"></textarea></div>`,
    primary: "Open proposal", secondary: "Cancel",
    onSubmit: async (data) => {
      const id = services.openProposal({
        promptId: prompt.id, sourceVersionId: version.id,
        title: data.title, description: data.description,
      });
      await commit();
      toast("Proposal opened");
      navigate(`/p/${project.slug}/p/${prompt.slug}/proposals/${id}`);
    },
  });
}

// ---------------------------------------------------------------------------
// Run detail drawer + JSON exports
// ---------------------------------------------------------------------------
function openRunDrawer(ctx, runId) {
  const env = serializeRun(getState(), runId);
  if (!env) { toast("Run not found"); return; }

  const evalsHtml = env.evaluations.length
    ? `<div class="drawer-kv" style="grid-template-columns:120px 1fr 80px 60px">
         ${env.evaluations.map((e) => `
           <div class="k">${escapeHtml(e.evaluatorKind)}</div>
           <div class="v" style="font-family:inherit">${escapeHtml(e.notes || "")}</div>
           <div class="v" style="text-align:right">${e.score == null ? "—" : Math.round(e.score * 100) + "%"}</div>
           <div class="v" style="text-align:right">${e.passed === true ? "✓" : e.passed === false ? "✗" : "—"}</div>
         `).join("")}
       </div>`
    : `<div style="color:var(--fg-faint);font-size:12.5px">No evaluations attached.</div>`;

  const tcLine = env.input.testCase
    ? `<span>${escapeHtml(env.input.testCase.name)}</span>
       <span style="color:var(--fg-faint);margin-left:6px">expected (${escapeHtml(env.input.testCase.expectedKind)}):
       <code>${escapeHtml(env.input.testCase.expectedOutput || "—")}</code></span>`
    : `<span style="color:var(--fg-faint)">ad-hoc (no test case)</span>`;

  const headerMeta = `${escapeHtml(env.run.id)} · v${env.version?.number ?? "?"}`;

  // Tokens row: show real numbers when the provider returned them; mark
  // the cell as `data-tokens-row` so we can fill in an estimate
  // asynchronously when they are missing.
  const tokensValue =
    (env.usage.inputTokens != null || env.usage.outputTokens != null)
      ? `in ${env.usage.inputTokens ?? "?"} · out ${env.usage.outputTokens ?? "?"}`
      : `<span style="color:var(--fg-faint)">computing estimate…</span>`;

  const body = `
    <div class="drawer-section">
      <div class="drawer-kv">
        <div class="k">Status</div><div class="v">${escapeHtml(env.run.status)}${env.run.mocked ? " · mock fallback" : ""}</div>
        <div class="k">Started</div><div class="v">${escapeHtml(env.run.startedAt || "?")}</div>
        <div class="k">Latency</div><div class="v">${env.run.latencyMs ?? "—"} ms</div>
        <div class="k">Tokens</div><div class="v" data-tokens-row>${tokensValue}</div>
        <div class="k">Cost</div><div class="v" data-cost-row><span style="color:var(--fg-faint)">computing…</span></div>
        <div class="k">Provider</div><div class="v">${escapeHtml(env.model.provider || "?")} · ${escapeHtml(env.model.modelId || "?")}</div>
        <div class="k">Settings</div><div class="v">T=${env.model.temperature ?? "?"} · max=${env.model.maxTokens ?? "?"}</div>
        ${env.run.providerResponseId ? `<div class="k">Response id</div><div class="v">${escapeHtml(env.run.providerResponseId)}</div>` : ""}
        ${env.run.error ? `<div class="k">Error</div><div class="v" style="color:var(--rose-700)">${escapeHtml(env.run.error)}</div>` : ""}
      </div>
    </div>

    <div class="drawer-section">
      <div class="label">Test case</div>
      <div style="font-size:12.5px">${tcLine}</div>
    </div>

    <div class="drawer-section">
      <div class="label">Variable bindings</div>
      <pre>${escapeHtml(JSON.stringify(env.input.variableBindings ?? {}, null, 2))}</pre>
    </div>

    <div class="drawer-section">
      <div class="label">Rendered prompt
        <span class="meta">${env.input.renderedPrompt ? env.input.renderedPrompt.length + " chars" : ""}</span>
      </div>
      <pre>${escapeHtml(env.input.renderedPrompt || "")}</pre>
    </div>

    <div class="drawer-section">
      <div class="label">Raw output
        <span class="meta">${env.output.raw ? env.output.raw.length + " chars" : "no output"}</span>
      </div>
      <pre>${escapeHtml(env.output.raw || "(empty)")}</pre>
    </div>

    ${env.output.structured ? `
      <div class="drawer-section">
        <div class="label">Parsed structured output</div>
        <pre>${escapeHtml(JSON.stringify(env.output.structured, null, 2))}</pre>
      </div>` : ""}

    <div class="drawer-section">
      <div class="label">Evaluations</div>
      ${evalsHtml}
    </div>
  `;

  const actions = `
    <button class="btn" data-act="copy-json">${icon("download", { size: 13 })} Copy JSON</button>
    <button class="btn primary" data-act="download-json">${icon("download", { size: 13 })} Download JSON</button>
    <span style="margin-left:auto;color:var(--fg-faint);font-size:11px">schema: ${escapeHtml(env.schema)}</span>
  `;

  drawer({
    title: `Run · v${env.version?.number ?? "?"} — ${escapeHtml(env.version?.title || "")}`,
    meta: headerMeta,
    body, actions,
    onOpen: (root) => {
      root.querySelector('[data-act="copy-json"]')?.addEventListener("click", async () => {
        const ok = await copyJSON(env);
        toast(ok ? "Copied JSON to clipboard" : "Copy failed");
      });
      root.querySelector('[data-act="download-json"]')?.addEventListener("click", () => {
        downloadJSON(fileNameForRun(env), env);
        toast("Downloaded run JSON");
      });
      // Fill in token + cost rows asynchronously. Real numbers when the
      // provider returned them; tiktoken / chars-4 estimate otherwise.
      (async () => {
        const { tokensFor, formatCost } = await import("../tokens.js");
        const { costFor } = await import("../pricing.js");
        const tokenRow = root.querySelector("[data-tokens-row]");
        const costRow  = root.querySelector("[data-cost-row]");
        if (!tokenRow || !costRow) return;

        let inT = env.usage.inputTokens;
        let outT = env.usage.outputTokens;
        let inMethod = "real", outMethod = "real";
        if (inT == null && env.input.renderedPrompt) {
          const r = await tokensFor(env.input.renderedPrompt, env.model.modelId);
          inT = r.tokens; inMethod = r.method;
        }
        if (outT == null && env.output.raw) {
          const r = await tokensFor(env.output.raw, env.model.modelId);
          outT = r.tokens; outMethod = r.method;
        }
        const isExact = inMethod === "real" && outMethod === "real";
        const isTiktoken = (inMethod === "tiktoken" || inMethod === "real")
                       && (outMethod === "tiktoken" || outMethod === "real");
        const tokenLabel = isExact
          ? `in ${inT?.toLocaleString() ?? "?"} · out ${outT?.toLocaleString() ?? "?"}`
          : `<span>${(isTiktoken ? "" : "≈ ") + (inT?.toLocaleString() ?? "?")} in · ${(outT?.toLocaleString() ?? "?")} out</span>` +
            ` <span style="color:var(--fg-faint);font-size:11px;margin-left:6px">${isTiktoken ? "tiktoken" : "estimated"}</span>`;
        tokenRow.innerHTML = tokenLabel;

        const c = costFor({
          provider: env.model.provider, modelId: env.model.modelId,
          inputTokens: inT || 0, outputTokens: outT || 0,
        });
        const tag = c.rate.source === "exact" ? "" : ` · <span style="color:var(--fg-faint)">rate: ${c.rate.source}</span>`;
        costRow.innerHTML =
          `<span><strong>${formatCost(c.total)}</strong> total</span>` +
          ` <span style="color:var(--fg-faint);margin-left:6px">${formatCost(c.in)} in + ${formatCost(c.out)} out${tag}</span>`;
      })().catch((err) => console.warn("token/cost fill failed:", err));
    },
  });
}

function exportRunsBundle({ prompt, version }) {
  const bundle = serializeRunsForVersion(getState(), prompt.id, version.id);
  if (!bundle || !bundle.runs.length) { toast("No runs to export"); return; }
  downloadJSON(fileNameForRunsBundle(bundle), bundle);
  toast(`Exported ${bundle.runs.length} run${bundle.runs.length === 1 ? "" : "s"}`);
}
