// Datasets, models, rubrics — project-level "meta" pages sharing a layout.

import { html, escapeHtml, icon, modal, toast } from "../ui/components.js";
import { getState, commit } from "../store.js";
import * as services from "../services.js";

// Shared topbar
function topbar(project, kind) {
  return `
    <div class="topbar">
      <a class="topbar-logo" href="#/"><span class="mark">${icon("prompt", { size: 13, stroke: 1.6 })}</span>Prompt Tree</a>
      <span class="topbar-crumb">
        <span class="sep">/</span><a href="#/p/${escapeHtml(project.slug)}">${escapeHtml(project.name)}</a>
        <span class="sep">/</span><span class="current">${kind}</span>
      </span>
      <span class="topbar-spacer"></span>
    </div>`;
}

// ---------- Datasets ----------
export function renderDatasetsView(route) {
  const s = getState();
  const project = s.projects.find((p) => p.slug === route.path.projectSlug);
  if (!project) return `<div class="main">Project not found.</div>`;
  const datasets = project.datasets || [];
  return html`
    ${topbar(project, "datasets")}
    <div class="main">
      <div class="main-head">
        <div><div class="eyebrow">Datasets</div><h1>${icon("dataset", { size: 16 })} Test cases</h1>
          <div class="subtitle">Reusable inputs for runs. One dataset can have many cases.</div></div>
        <div class="actions">
          <button class="btn" data-act="new-dataset">${icon("plus", { size: 13 })} Dataset</button>
          <button class="btn accent" data-act="new-case" ${datasets.length ? "" : "disabled"}>${icon("plus", { size: 13 })} Test case</button>
        </div>
      </div>
      ${datasets.length === 0 ? `<div class="empty"><div class="sub">No datasets. Add one to attach test cases.</div></div>`
        : datasets.map((d) => `
          <div class="form-card" style="margin-bottom:12px">
            <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:6px">
              <strong>${escapeHtml(d.name)}</strong>
              <span style="color:var(--fg-faint);font-size:11.5px">${(d.testCases || []).length} cases</span>
            </div>
            ${d.description ? `<div style="color:var(--fg-muted);font-size:12.5px;margin-bottom:8px">${escapeHtml(d.description)}</div>` : ""}
            ${(d.testCases || []).map((tc) => `
              <div style="display:flex;align-items:center;gap:10px;padding:4px 0;border-top:1px solid var(--border-soft);font-size:12.5px">
                <span class="hash-chip" style="font-size:10.5px">${escapeHtml(tc.expectedKind)}</span>
                <span>${escapeHtml(tc.name)}</span>
              </div>`).join("")}
          </div>`).join("")}
    </div>
  `;
}

export function bindDatasetsView(root, route) {
  const s = getState();
  const project = s.projects.find((p) => p.slug === route.path.projectSlug);
  if (!project) return;

  root.querySelector('[data-act="new-dataset"]')?.addEventListener("click", () => {
    modal({
      title: "New dataset",
      body: `
        <div class="row"><label>Name <span class="req">*</span></label><input name="name" required /></div>
        <div class="row"><label>Description</label><input name="description" /></div>`,
      primary: "Create", secondary: "Cancel",
      onSubmit: async (data) => {
        services.createDataset({ projectId: project.id, name: data.name, description: data.description });
        await commit(); toast("Dataset created");
      },
    });
  });

  root.querySelector('[data-act="new-case"]')?.addEventListener("click", () => {
    modal({
      title: "New test case",
      body: `
        <div class="row"><label>Dataset</label>
          <select name="datasetId">${(project.datasets || []).map((d) => `<option value="${escapeHtml(d.id)}">${escapeHtml(d.name)}</option>`).join("")}</select></div>
        <div class="row"><label>Name <span class="req">*</span></label><input name="name" required /></div>
        <div class="row"><label>Input variables (JSON)</label><textarea name="inputVariables">{}</textarea></div>
        <div class="row"><label>Expected output</label><textarea name="expectedOutput" style="min-height:60px"></textarea></div>
        <div class="row"><label>Expected kind</label>
          <select name="expectedKind">
            <option value="none">none</option><option value="contains">contains</option>
            <option value="exact">exact</option><option value="regex">regex</option>
            <option value="schema">schema</option><option value="rubric">rubric</option>
          </select></div>`,
      primary: "Create", secondary: "Cancel",
      onSubmit: async (data) => {
        let inputVariables = {};
        try { inputVariables = JSON.parse(data.inputVariables || "{}"); } catch { throw new Error("inputVariables must be JSON."); }
        services.createTestCase({ projectId: project.id, datasetId: data.datasetId, name: data.name,
          inputVariables, expectedOutput: data.expectedOutput || null, expectedKind: data.expectedKind });
        await commit(); toast("Test case added");
      },
    });
  });
}

// ---------- Models ----------
export function renderModelsView(route) {
  const s = getState();
  const project = s.projects.find((p) => p.slug === route.path.projectSlug);
  if (!project) return `<div class="main">Project not found.</div>`;
  const profiles = project.modelProfiles || [];
  return html`
    ${topbar(project, "models")}
    <div class="main">
      <div class="main-head">
        <div><div class="eyebrow">Models</div><h1>${icon("model", { size: 16 })} Model profiles</h1>
          <div class="subtitle">Named presets used by runs. The <code>mock</code> provider works offline.</div></div>
        <div class="actions">
          <button class="btn accent" data-act="new-profile">${icon("plus", { size: 13 })} New profile</button>
        </div>
      </div>
      ${profiles.length === 0 ? `<div class="empty"><div class="sub">No profiles. Add one to enable runs.</div></div>`
        : profiles.map((m) => `
          <div class="form-card" style="display:flex;align-items:center;gap:14px;margin-bottom:10px">
            <span style="flex:1">
              <strong>${escapeHtml(m.name)}</strong>
              <span style="color:var(--fg-muted);font-size:12px;margin-left:8px">${escapeHtml(m.provider)}:${escapeHtml(m.modelId)}</span>
            </span>
            <span style="color:var(--fg-faint);font-size:11.5px">T=${m.defaultTemperature} · max=${m.defaultMaxTokens}</span>
          </div>`).join("")}
    </div>
  `;
}

export function bindModelsView(root, route) {
  const s = getState();
  const project = s.projects.find((p) => p.slug === route.path.projectSlug);
  if (!project) return;
  root.querySelector('[data-act="new-profile"]')?.addEventListener("click", () => {
    modal({
      title: "New model profile",
      body: `
        <div class="row"><label>Name <span class="req">*</span></label><input name="name" required placeholder="mock-default" /></div>
        <div class="row"><label>Provider</label>
          <select name="provider">
            <option value="mock">mock (no API key, offline)</option>
            <option value="anthropic">anthropic</option>
            <option value="openai">openai</option>
            <option value="custom">custom</option>
          </select></div>
        <div class="row"><label>Model ID <span class="req">*</span></label><input name="modelId" required placeholder="claude-opus-4-7" /></div>
        <div class="row"><label>Temperature</label><input name="defaultTemperature" type="number" step="0.1" value="0.7" /></div>
        <div class="row"><label>Max tokens</label><input name="defaultMaxTokens" type="number" value="1024" /></div>`,
      primary: "Create", secondary: "Cancel",
      onSubmit: async (data) => {
        services.createModelProfile({
          projectId: project.id, name: data.name, provider: data.provider, modelId: data.modelId,
          defaultTemperature: Number(data.defaultTemperature), defaultMaxTokens: Number(data.defaultMaxTokens),
        });
        await commit(); toast("Profile created");
      },
    });
  });
}

// ---------- Rubrics ----------
export function renderRubricsView(route) {
  const s = getState();
  const project = s.projects.find((p) => p.slug === route.path.projectSlug);
  if (!project) return `<div class="main">Project not found.</div>`;
  const rubrics = project.rubrics || [];
  return html`
    ${topbar(project, "rubrics")}
    <div class="main">
      <div class="main-head">
        <div><div class="eyebrow">Rubrics</div><h1>${icon("rubric", { size: 16 })} Scoring criteria</h1></div>
        <div class="actions">
          <button class="btn accent" data-act="new-rubric">${icon("plus", { size: 13 })} New rubric</button>
        </div>
      </div>
      ${rubrics.length === 0 ? `<div class="empty"><div class="sub">No rubrics yet.</div></div>`
        : rubrics.map((r) => `
          <div class="form-card" style="margin-bottom:10px">
            <strong>${escapeHtml(r.name)}</strong>
            ${r.description ? `<div style="color:var(--fg-muted);font-size:12.5px">${escapeHtml(r.description)}</div>` : ""}
            <ul style="margin:6px 0 0;padding-left:18px;color:var(--fg-muted);font-size:12.5px">
              ${(r.criteria || []).map((c) => `<li><strong style="color:var(--fg)">${escapeHtml(c.name)}</strong> · w=${c.weight}</li>`).join("")}
            </ul>
          </div>`).join("")}
    </div>
  `;
}

export function bindRubricsView(root, route) {
  const s = getState();
  const project = s.projects.find((p) => p.slug === route.path.projectSlug);
  if (!project) return;
  root.querySelector('[data-act="new-rubric"]')?.addEventListener("click", () => {
    modal({
      title: "New rubric",
      body: `
        <div class="row"><label>Name <span class="req">*</span></label><input name="name" required /></div>
        <div class="row"><label>Description</label><input name="description" /></div>
        <div class="row"><label>Criteria (JSON)</label><textarea name="criteria">${escapeHtml(JSON.stringify([
          { name: "correctness", description: "Factually correct", weight: 2, scale: { min: 0, max: 1 } },
          { name: "clarity",     description: "Easy to read",      weight: 1, scale: { min: 0, max: 1 } },
        ], null, 2))}</textarea></div>`,
      primary: "Create", secondary: "Cancel",
      onSubmit: async (data) => {
        let criteria;
        try { criteria = JSON.parse(data.criteria); } catch { throw new Error("criteria must be JSON."); }
        services.createRubric({ projectId: project.id, name: data.name, description: data.description, criteria });
        await commit(); toast("Rubric created");
      },
    });
  });
}
