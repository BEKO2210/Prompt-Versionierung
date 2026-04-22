// Project dashboard — prompts grid for a given project.

import { html, escapeHtml, icon, modal, toast } from "../ui/components.js";
import { getState, commit } from "../store.js";
import * as services from "../services.js";
import { navigate } from "../router.js";

export function renderProjectView(route) {
  const s = getState();
  const project = s.projects.find((p) => p.slug === route.path.projectSlug);
  if (!project) return `<div class="main">Project not found.</div>`;

  const prompts = (project.prompts || []).filter((p) => !p.archivedAt);
  const totalVersions = prompts.reduce((n, p) => n + p.versions.length, 0);
  const totalBranches = prompts.reduce((n, p) => n + p.branches.length, 0);

  return html`
    ${renderProjectTopbar(project)}
    <div class="main center">
      <div class="main-head">
        <div>
          <div class="eyebrow">Project</div>
          <h1>${escapeHtml(project.name)}</h1>
          ${project.description ? `<div class="subtitle">${escapeHtml(project.description)}</div>` : ""}
        </div>
        <div class="actions">
          <button class="btn" data-act="datasets">${icon("dataset", { size: 13 })} Datasets</button>
          <button class="btn" data-act="models">${icon("model", { size: 13 })} Models</button>
          <button class="btn accent" data-act="new-prompt">${icon("plus", { size: 13 })} New prompt</button>
        </div>
      </div>

      <div class="cards-grid" style="margin-bottom:22px">
        <div class="card"><div class="sub">Prompts</div><div style="font-size:28px;font-weight:600">${prompts.length}</div></div>
        <div class="card"><div class="sub">Versions</div><div style="font-size:28px;font-weight:600">${totalVersions}</div></div>
        <div class="card"><div class="sub">Branches</div><div style="font-size:28px;font-weight:600">${totalBranches}</div></div>
      </div>

      <div class="eyebrow" style="margin-bottom:10px">Prompts</div>
      ${prompts.length === 0 ? empty() : grid(project, prompts)}
    </div>
  `;
}

function renderProjectTopbar(project) {
  return `
    <div class="topbar">
      <a class="topbar-logo" href="#/">
        <span class="mark">${icon("prompt", { size: 13, stroke: 1.6 })}</span>
        Prompt Tree
      </a>
      <span class="topbar-crumb">
        <span class="sep">/</span>
        <span class="current">${escapeHtml(project.name)}</span>
      </span>
      <span class="topbar-spacer"></span>
      <a href="#/p/${escapeHtml(project.slug)}/search" class="topbar-action">${icon("search", { size: 13 })} Search</a>
    </div>`;
}

function empty() {
  return `
    <div class="empty">
      <div class="ttl">No prompts yet</div>
      <div class="sub">A prompt is a logical identity. Its versions are the artifacts that ship.</div>
      <button class="btn accent" data-act="new-prompt">${icon("plus", { size: 13 })} New prompt</button>
    </div>`;
}

function grid(project, prompts) {
  return `<div class="cards-grid">
    ${prompts.map((p) => {
      const canon = p.branches.find((b) => b.id === p.canonicalBranchId);
      const head = p.versions.find((v) => v.id === canon?.headVersionId);
      return `
        <a class="card" href="#/p/${escapeHtml(project.slug)}/p/${escapeHtml(p.slug)}">
          <div class="ttl">${escapeHtml(p.name)}</div>
          <div class="sub">${escapeHtml(p.slug)}</div>
          ${p.description ? `<div class="desc">${escapeHtml(p.description)}</div>` : ""}
          <div class="stats">
            <span><strong>${p.versions.length}</strong> versions</span>
            <span>·</span>
            <span><strong>${p.branches.length}</strong> branches</span>
            ${head ? `<span>·</span><span>head v${head.number}</span>` : ""}
          </div>
        </a>`;
    }).join("")}
  </div>`;
}

export function bindProjectView(root, route) {
  const s = getState();
  const project = s.projects.find((p) => p.slug === route.path.projectSlug);
  if (!project) return;

  root.querySelector('[data-act="new-prompt"]')?.addEventListener("click", () => openNewPromptModal(project));
  root.querySelector('[data-act="datasets"]')?.addEventListener("click", () => navigate(`/p/${project.slug}/datasets`));
  root.querySelector('[data-act="models"]')?.addEventListener("click", () => navigate(`/p/${project.slug}/models`));
}

function openNewPromptModal(project) {
  modal({
    title: "New prompt",
    sub: "Creates the prompt, a `main` branch, and its initial version — all at once.",
    body: `
      <div class="row"><label>Name <span class="req">*</span></label><input name="name" required placeholder="Ticket classifier" /></div>
      <div class="row"><label>Purpose</label><input name="purpose" placeholder="What should this prompt do?" /></div>
      <div class="row"><label>Initial version title</label><input name="title" value="First cut" /></div>
      <div class="row"><label>Body <span class="req">*</span></label><textarea name="body" required placeholder="You are a careful assistant that …"></textarea></div>`,
    primary: "Create prompt", secondary: "Cancel",
    onSubmit: async (data) => {
      const id = await services.createPrompt({
        projectId: project.id, name: data.name, purpose: data.purpose,
        initialVersion: { title: data.title || "First cut", body: data.body, variables: [] },
      });
      await commit();
      toast("Prompt created");
      const s = getState(); const p = s.projects.find((x) => x.id === project.id).prompts.find((pr) => pr.id === id);
      navigate(`/p/${project.slug}/p/${p.slug}`);
    },
  });
}
