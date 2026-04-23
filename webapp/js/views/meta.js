// Datasets, models, rubrics — project-level "meta" pages sharing a layout.

import { html, escapeHtml, escapeAttr, icon, brandMark, modal, toast } from "../ui/components.js";
import { getState, commit } from "../store.js";
import * as services from "../services.js";
import { MODEL_CATALOG, getProvider, defaultModelFor, findModel } from "../adapters/models/catalog.js";

// Shared topbar
function topbar(project, kind) {
  return `
    <div class="topbar">
      <a class="topbar-logo" href="#/"><span class="mark">${brandMark(22)}</span>Prompt Tree</a>
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
          <div class="subtitle">Named presets used by runs. Pick a provider + model from the curated list, or type a custom id. The <code>mock</code> provider works offline without a key.</div></div>
        <div class="actions">
          <button class="btn" data-act="seed-defaults">${icon("spark", { size: 13 })} Seed defaults</button>
          ${profiles.length > 0 ? `<button class="btn" data-act="delete-all">${icon("trash", { size: 13 })} Delete all</button>` : ""}
          <button class="btn accent" data-act="new-profile">${icon("plus", { size: 13 })} New profile</button>
        </div>
      </div>
      ${profiles.length === 0 ? `
        <div class="empty">
          <div class="ttl">No profiles yet</div>
          <div class="sub">Seed the curated defaults (one profile per provider where you have a key) or add one manually.</div>
          <div style="display:flex;gap:8px;justify-content:center;margin-top:12px">
            <button class="btn" data-act="seed-defaults">${icon("spark", { size: 13 })} Seed defaults</button>
            <button class="btn accent" data-act="new-profile">${icon("plus", { size: 13 })} New profile</button>
          </div>
        </div>`
        : profiles.map((m) => `
          <div class="form-card" style="display:flex;align-items:center;gap:14px;margin-bottom:10px" data-profile-id="${escapeAttr(m.id)}">
            <span style="flex:1;min-width:0">
              <strong>${escapeHtml(m.name)}</strong>
              <span style="color:var(--fg-muted);font-size:12px;margin-left:8px">${escapeHtml(m.provider)}:${escapeHtml(m.modelId)}</span>
            </span>
            <span style="color:var(--fg-faint);font-size:11.5px;white-space:nowrap">T=${m.defaultTemperature} · max=${m.defaultMaxTokens}</span>
            <button type="button" class="btn sm" data-act="delete-profile" data-profile-id="${escapeAttr(m.id)}" title="Delete this profile">${icon("trash", { size: 12 })}</button>
          </div>`).join("")}
    </div>
  `;
}

// Produce the <option>-list HTML for a provider's known models, plus a
// trailing "(custom)" sentinel that reveals a freeform input in the
// modal. Keeping the list to known-good models avoids the "typed the
// wrong slug" 400s a free-text field invited.
function providerOptions(selectedProvider) {
  return MODEL_CATALOG.map((p) =>
    `<option value="${escapeAttr(p.id)}"${p.id === selectedProvider ? " selected" : ""}>${escapeHtml(p.label)}${p.requiresKey ? "" : " · no key"}</option>`
  ).join("");
}
function modelOptions(providerId, selectedModelId) {
  const prov = getProvider(providerId);
  const known = (prov?.models || []).map((m) =>
    `<option value="${escapeAttr(m.id)}"${m.id === selectedModelId ? " selected" : ""}>${escapeHtml(m.label)}${m.hint ? ` · ${escapeHtml(m.hint)}` : ""}</option>`
  ).join("");
  return `${known}<option value="__custom__">Custom — type a model id…</option>`;
}

export function bindModelsView(root, route) {
  const s = getState();
  const project = s.projects.find((p) => p.slug === route.path.projectSlug);
  if (!project) return;

  root.querySelector('[data-act="new-profile"]')?.addEventListener("click", () => {
    const initialProvider = "openai";
    const initialModel = defaultModelFor(initialProvider);
    const initialModelId = initialModel?.id || "";
    const suggestedTemperature = initialModel?.supportsTemperature === false ? 1 : 0.7;

    modal({
      title: "New model profile",
      sub: "Pick a provider + one of the curated models. Temperature + max-token defaults are tuned for that model.",
      body: `
        <div class="row"><label>Name <span class="req">*</span></label><input name="name" required placeholder="openai-default" /></div>
        <div class="row"><label>Provider</label>
          <select name="provider" data-provider-select>${providerOptions(initialProvider)}</select>
        </div>
        <div class="row"><label>Model</label>
          <select name="modelPick" data-model-select>${modelOptions(initialProvider, initialModelId)}</select>
        </div>
        <div class="row" data-custom-model-row hidden>
          <label>Custom model id <span class="req">*</span></label>
          <input name="modelIdCustom" placeholder="e.g. gpt-5-2025-07-30" />
          <div class="helper">Only needed for dated snapshots or preview models not yet in the dropdown.</div>
        </div>
        <div class="row"><label>Temperature</label><input name="defaultTemperature" type="number" step="0.1" value="${suggestedTemperature}" /></div>
        <div class="row"><label>Max tokens</label><input name="defaultMaxTokens" type="number" value="1024" /></div>
        <div class="helper" data-provider-hint></div>`,
      primary: "Create", secondary: "Cancel",
      onSubmit: async (data) => {
        const provider = data.provider;
        let modelId = data.modelPick;
        if (modelId === "__custom__") modelId = (data.modelIdCustom || "").trim();
        if (!modelId) throw new Error("Pick a model (or type a custom id).");
        const name = (data.name || "").trim() || `${provider}-default`;
        services.createModelProfile({
          projectId: project.id, name, provider, modelId,
          defaultTemperature: Number(data.defaultTemperature),
          defaultMaxTokens: Number(data.defaultMaxTokens),
        });
        await commit(); toast(`Profile "${name}" created`);
      },
    });

    // Wire the dependent selects after the modal paints.
    setTimeout(() => {
      const form = document.getElementById("modal-form");
      if (!form) return;
      const providerSel = form.querySelector("[data-provider-select]");
      const modelSel    = form.querySelector("[data-model-select]");
      const customRow   = form.querySelector("[data-custom-model-row]");
      const customInput = form.querySelector('[name="modelIdCustom"]');
      const tempInput   = form.querySelector('[name="defaultTemperature"]');
      const nameInput   = form.querySelector('[name="name"]');
      const hint        = form.querySelector("[data-provider-hint]");

      function updateHint() {
        const p = getProvider(providerSel.value);
        if (!p) { hint.textContent = ""; return; }
        hint.textContent = p.requiresKey
          ? `Needs an API key — add it in Settings. Runs without a key fall back to mock, clearly labelled.`
          : `No key required. Runs are deterministic and free.`;
      }
      function updateCustomRow() {
        const isCustom = modelSel.value === "__custom__";
        if (customRow) customRow.hidden = !isCustom;
        if (customInput) customInput.required = isCustom;
      }
      function updateTemperatureSuggestion() {
        const entry = findModel(providerSel.value, modelSel.value);
        if (!entry) return;
        tempInput.value = entry.supportsTemperature === false ? 1 : 0.7;
      }
      function refillModels() {
        const p = providerSel.value;
        modelSel.innerHTML = modelOptions(p, defaultModelFor(p)?.id || "");
        if (nameInput && !nameInput.dataset.userEdited) nameInput.value = `${p}-default`;
        updateCustomRow();
        updateTemperatureSuggestion();
        updateHint();
      }
      nameInput?.addEventListener("input", () => { nameInput.dataset.userEdited = "1"; });
      providerSel?.addEventListener("change", refillModels);
      modelSel?.addEventListener("change", () => {
        updateCustomRow();
        updateTemperatureSuggestion();
      });

      // Seed name + hint on open (name may still be empty placeholder).
      if (nameInput && !nameInput.value.trim()) nameInput.value = `${initialProvider}-default`;
      updateHint();
      updateCustomRow();
    }, 0);
  });

  // Per-row delete — soft click, undoable via Ctrl+Z.
  root.querySelectorAll('[data-act="delete-profile"]').forEach((btn) => {
    btn.addEventListener("click", async () => {
      const profileId = btn.dataset.profileId;
      const profile = (project.modelProfiles || []).find((m) => m.id === profileId);
      if (!profile) return;
      services.deleteModelProfile({ projectId: project.id, profileId });
      await commit();
      toast(`Deleted "${profile.name}"`, {
        actionLabel: "Undo",
        onAction: () => { services.undo?.(); commit(); },
      });
    });
  });

  // Delete-all — also undoable, single Ctrl+Z rolls the whole wipe back.
  root.querySelector('[data-act="delete-all"]')?.addEventListener("click", async () => {
    const n = (project.modelProfiles || []).length;
    if (!n) return;
    if (!confirm(`Delete all ${n} model profiles? Ctrl/⌘+Z will undo.`)) return;
    services.deleteAllModelProfiles({ projectId: project.id });
    await commit();
    toast(`Deleted ${n} profile${n === 1 ? "" : "s"}`, {
      actionLabel: "Undo",
      onAction: () => { services.undo?.(); commit(); },
    });
  });

  // Seed defaults — bulk-creates one profile per provider for which the
  // user already has a key configured, plus the mock fallback. Atomic.
  root.querySelectorAll('[data-act="seed-defaults"]').forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        const created = await services.seedDefaultModelProfiles({ projectId: project.id });
        await commit();
        if (!created.length) {
          toast("Everything was already seeded");
        } else {
          toast(`Seeded ${created.length} default profile${created.length === 1 ? "" : "s"}: ${created.join(", ")}`);
        }
      } catch (err) {
        toast("Seed failed: " + (err.message || err));
      }
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
