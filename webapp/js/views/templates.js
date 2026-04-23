// Templates library — browsable grid of curated starter-pack prompts.
// Clicking a card opens a preview modal; Import instantiates into a
// chosen project via services.createPromptFromTemplate.
//
// The library JSON is static under webapp/data/templates.json and is
// loaded once per session via `templates.loadLibrary`. The view itself
// never mutates the workspace on its own — only the explicit Import
// action does, and it runs through the service layer like any other
// mutation so Ctrl+Z unwinds it.

import { html, escapeHtml, escapeAttr, icon, brandMark, modal, toast } from "../ui/components.js";
import { md as renderMarkdown } from "../vendor.js";
import { getState, commit } from "../store.js";
import * as services from "../services.js";
import { loadLibrary, groupByCategory, validateTemplate } from "../templates.js";
import { navigate } from "../router.js";

let _libraryCache = null;
let _libraryError = null;

export function renderTemplatesView() {
  if (_libraryCache) return renderLibrary(_libraryCache);
  if (_libraryError) return renderError(_libraryError);
  return html`
    ${renderTopbar()}
    <div class="main center">
      <div class="empty" data-templates-loading>
        <div class="ttl">Loading templates…</div>
        <div class="sub">Fetching the curated starter pack.</div>
      </div>
    </div>
  `;
}

export function bindTemplatesView(root) {
  // Topbar actions (always present).
  root.querySelector('[data-act="back"]')?.addEventListener("click", () => navigate("/"));
  root.querySelector('[data-act="paste-import"]')?.addEventListener("click", () => openPasteImport());

  // Card clicks → preview modal.
  root.querySelectorAll("[data-template-id]").forEach((card) => {
    card.addEventListener("click", () => {
      const id = card.dataset.templateId;
      const t = _libraryCache?.templates.find((x) => x.id === id);
      if (t) openPreview(t);
    });
  });

  // First paint: library wasn't loaded yet. Kick the fetch and re-render.
  if (_libraryCache || _libraryError) return;
  loadLibrary().then((lib) => {
    _libraryCache = lib;
    repaint();
  }).catch((err) => {
    _libraryError = err?.message || String(err);
    repaint();
  });
}

function repaint() {
  const host = document.getElementById("app");
  if (!host) return;
  host.innerHTML = renderTemplatesView();
  bindTemplatesView(host);
}

// ---------------------------------------------------------------------------
// Topbar + shell
// ---------------------------------------------------------------------------
function renderTopbar() {
  return `
    <div class="topbar">
      <a class="topbar-logo" href="#/">
        <span class="mark">${brandMark(22)}</span>
        Prompt Tree
      </a>
      <span class="topbar-crumb">
        <span class="sep">/</span>
        <span class="current">Templates</span>
      </span>
      <span class="topbar-spacer"></span>
      <button class="topbar-action" data-act="paste-import">${icon("upload", { size: 13 })} Import JSON</button>
      <a class="topbar-action" href="#/">Back to workspace</a>
    </div>
  `;
}

function renderError(msg) {
  return html`
    ${renderTopbar()}
    <div class="main center">
      <div class="empty">
        <div class="ttl">Could not load templates</div>
        <div class="sub">${escapeHtml(msg)}</div>
        <a class="btn" href="#/">Back to workspace</a>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Library grid, grouped by category.
// ---------------------------------------------------------------------------
function renderLibrary(lib) {
  const groups = groupByCategory(lib.templates);
  const total = lib.templates.length;
  return html`
    ${renderTopbar()}
    <div class="main center">
      <div class="main-head">
        <div>
          <div class="eyebrow">Library</div>
          <h1>Prompt templates</h1>
          <div class="subtitle">${total} starter${total === 1 ? "" : "s"} across ${groups.length} categor${groups.length === 1 ? "y" : "ies"}. Pick one to start a new prompt with the body, README, and suggested tests already wired.</div>
        </div>
      </div>

      ${groups.map(renderGroup).join("")}
    </div>
  `;
}

function renderGroup({ category, templates }) {
  return `
    <section class="tmpl-group" style="margin-top:24px">
      <div class="eyebrow" style="margin-bottom:10px">${escapeHtml(category)}</div>
      <div class="cards-grid">
        ${templates.map(renderCard).join("")}
      </div>
    </section>`;
}

function renderCard(t) {
  const tags = (t.tags || []).slice(0, 3).map((tg) =>
    `<span class="pill" style="background:var(--bg-raised);border:1px solid var(--border);color:var(--fg-mute)">${escapeHtml(tg)}</span>`
  ).join(" ");
  const varCount = (t.prompt.variables || []).length;
  const tcCount = (t.suggestedTestCases || []).length;
  return `
    <button class="card tmpl-card" type="button" data-template-id="${escapeAttr(t.id)}" style="text-align:left;cursor:pointer;font:inherit;width:100%;border:1px solid var(--border);background:var(--bg-raised)">
      <div class="ttl">${escapeHtml(t.name)}</div>
      <div class="desc" style="margin-top:6px">${escapeHtml(t.description)}</div>
      <div class="stats" style="margin-top:10px;gap:8px;display:flex;align-items:center;flex-wrap:wrap">
        ${tags}
        <span style="flex:1"></span>
        <span style="color:var(--fg-faint);font-size:12px">${varCount} var${varCount === 1 ? "" : "s"} · ${tcCount} test${tcCount === 1 ? "" : "s"}</span>
      </div>
    </button>`;
}

// ---------------------------------------------------------------------------
// Preview modal — read-only-ish look at the template, then Import.
// ---------------------------------------------------------------------------
function openPreview(template) {
  const s = getState();
  const projects = (s.projects || []).filter((p) => !p.archivedAt && !p.deletedAt);
  const hasProjects = projects.length > 0;
  const vars = template.prompt.variables || [];
  const tcs = template.suggestedTestCases || [];

  const projectOptions = projects.map((p, i) =>
    `<option value="${escapeAttr(p.id)}"${i === 0 ? " selected" : ""}>${escapeHtml(p.name)}</option>`
  ).join("");

  const body = `
    <div class="row">
      <label>Description</label>
      <div style="color:var(--fg-mute)">${escapeHtml(template.description)}</div>
    </div>

    <div class="row">
      <label>Prompt body</label>
      <div class="code-frame" style="max-height:220px;overflow:auto"><pre>${escapeHtml(template.prompt.body)}</pre></div>
    </div>

    ${vars.length ? `
      <div class="row">
        <label>Variables</label>
        <div style="display:flex;flex-direction:column;gap:4px">
          ${vars.map((v) => `
            <div style="display:flex;gap:8px;align-items:baseline;font-size:13px">
              <span class="mono" style="color:var(--accent)">{{${escapeHtml(v.name)}}}</span>
              <span style="color:var(--fg-faint)">${escapeHtml(v.type)}${v.required ? " · required" : " · optional"}</span>
              ${v.description ? `<span style="color:var(--fg-mute)">${escapeHtml(v.description)}</span>` : ""}
            </div>`).join("")}
        </div>
      </div>` : ""}

    ${tcs.length ? `
      <div class="row">
        <label>Suggested test cases</label>
        <div style="color:var(--fg-faint);font-size:12px;margin-bottom:6px">Reference only — not imported automatically.</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${tcs.map((tc) => `
            <div style="border:1px solid var(--border);border-radius:6px;padding:8px 10px;background:var(--bg-raised)">
              <div style="font-weight:600;font-size:13px">${escapeHtml(tc.name)}</div>
              ${tc.expectedKind ? `<div style="color:var(--fg-faint);font-size:12px;margin-top:2px">expects: ${escapeHtml(tc.expectedKind)}</div>` : ""}
            </div>`).join("")}
        </div>
      </div>` : ""}

    ${hasProjects ? `
      <div class="row">
        <label>Import into project <span class="req">*</span></label>
        <select name="projectId" required>${projectOptions}</select>
      </div>
      <div class="row">
        <label>Prompt name</label>
        <input name="name" value="${escapeAttr(template.name)}" placeholder="${escapeAttr(template.name)}" />
      </div>
      <div class="helper">The prompt is created with the body, variables, and README wired. You can edit any of it after import — every change creates a new version on <code>main</code>.</div>
    ` : `
      <div class="modal-error" style="display:block">
        You don't have a project yet. Create one first, then import a template into it.
      </div>`}
  `;

  modal({
    title: `Template · ${template.name}`,
    sub: `${template.category} — ${template.description}`,
    body,
    primary: hasProjects ? "Import into workspace" : "Close",
    secondary: hasProjects ? "Close" : null,
    onSubmit: async (data) => {
      if (!hasProjects) return;
      const projectId = data.projectId;
      const project = s.projects.find((p) => p.id === projectId);
      if (!project) throw new Error("Project not found");
      const name = (data.name || "").trim() || template.name;
      if (project.prompts.some((p) => p.slug === slugifyLike(name))) {
        throw new Error(`A prompt called "${name}" already exists in ${project.name}.`);
      }
      const promptId = await services.createPromptFromTemplate({
        projectId, template, name,
      });
      await commit();
      toast(`Imported "${name}" into ${project.name}`);
      const freshProject = getState().projects.find((p) => p.id === projectId);
      const freshPrompt  = freshProject?.prompts.find((p) => p.id === promptId);
      if (freshProject && freshPrompt) {
        navigate(`/p/${freshProject.slug}/p/${freshPrompt.slug}`);
      }
    },
  });
}

// Slug preview used for the duplicate check. We don't import the real
// slugify from domain.js because that's a different surface; instead
// we match the same shape so the precheck stays accurate. The actual
// slug is produced by services.createPrompt.
function slugifyLike(name) {
  return (name || "")
    .toLowerCase().trim()
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "untitled";
}

// ---------------------------------------------------------------------------
// Paste-JSON import (D3 consumer side). Accepts any
// `prompt-tree-template/1` payload — curated bundle entries and forks
// alike — validates it, and routes into the exact same preview modal the
// library uses. One importer, one validator, one service call.
// ---------------------------------------------------------------------------
function openPasteImport() {
  modal({
    title: "Import prompt JSON",
    sub: "Paste a prompt-tree-template/1 payload (a curated template or a fork). You'll get the normal preview before anything is written.",
    body: `
      <div class="row">
        <label>JSON</label>
        <textarea name="json" required placeholder='{"format": "prompt-tree-template/1", ...}' style="min-height:220px;font-family:var(--mono);font-size:12px" data-paste-json></textarea>
      </div>
      <div class="helper">The payload is validated locally. Nothing touches your workspace until you confirm the import on the preview screen.</div>`,
    primary: "Validate & preview", secondary: "Cancel",
    onSubmit: async (data) => {
      let parsed;
      try { parsed = JSON.parse(data.json); }
      catch { throw new Error("That isn't valid JSON. Check for stray commas or a truncated paste."); }
      const template = validateTemplate(parsed);
      // Give a small delay so the submit modal closes before the preview
      // one opens — otherwise the second .modal backdrop stacks on top.
      setTimeout(() => openPreview(template), 60);
    },
  });
  setTimeout(() => document.querySelector("[data-paste-json]")?.focus(), 60);
}
