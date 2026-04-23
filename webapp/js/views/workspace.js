import { html, escapeHtml, icon, brandMark, modal, toast } from "../ui/components.js";
import { getState, exportJSON, importJSON, commit } from "../store.js";
import * as services from "../services.js";
import { navigate } from "../router.js";

export function renderWorkspace() {
  const s = getState();
  // Hide both archived and soft-deleted projects from the main grid.
  // Archive = "I'm done with this for now"; delete = "purge-candidate".
  // Both can still be restored from Settings (or via Ctrl/Cmd+Z right after).
  const projects = (s.projects || []).filter((p) => !p.archivedAt && !p.deletedAt);

  return html`
    <div class="topbar">
      <a class="topbar-logo" href="#/">
        <span class="mark">${brandMark(22)}</span>
        Prompt Tree
      </a>
      <span class="topbar-spacer"></span>
      <button class="topbar-action" data-act="tour">${icon("info", { size: 13 })} Tutorial</button>
      <a class="topbar-action" href="#/help">${icon("info", { size: 13 })} Help</a>
      <a class="topbar-action" href="#/settings">${icon("cog", { size: 13 })} Settings</a>
      <button class="topbar-action" data-act="export">${icon("download", { size: 13 })} Export</button>
      <button class="topbar-action" data-act="import">${icon("upload", { size: 13 })} Import</button>
      <button class="topbar-action" data-act="reset">${icon("reset", { size: 13 })} Reset demo</button>
      <button class="topbar-action" data-act="theme">${icon(currentTheme() === "dark" ? "sun" : "moon", { size: 13 })}</button>
    </div>

    <div class="main center">
      <div class="main-head">
        <div>
          <div class="eyebrow">Workspace</div>
          <h1>Projects</h1>
          <div class="subtitle">Each project is its own world: prompts, branches, runs, evidence.</div>
        </div>
        <div class="actions">
          <button class="btn accent" data-act="new-project">${icon("plus", { size: 13 })} New project</button>
        </div>
      </div>

      ${projects.length === 0 ? emptyProjects() : projectsGrid(projects)}
    </div>
  `;
}

function emptyProjects() {
  return `
    <div class="empty">
      <div class="ttl">No projects yet</div>
      <div class="sub">Create one to start branching, diffing, and evaluating prompts. Everything stays in your browser.</div>
      <button class="btn accent" data-act="new-project">${icon("plus", { size: 13 })} New project</button>
    </div>`;
}

function projectsGrid(projects) {
  return `<div class="cards-grid">${projects.map((p) => `
    <a class="card" href="#/p/${escapeHtml(p.slug)}">
      <div class="ttl">${escapeHtml(p.name)}</div>
      <div class="sub">${escapeHtml(p.slug)}</div>
      ${p.description ? `<div class="desc">${escapeHtml(p.description)}</div>` : ""}
      <div class="stats">
        <span><strong>${p.prompts.length}</strong> prompts</span>
        <span>·</span>
        <span><strong>${p.prompts.reduce((n, x) => n + x.versions.length, 0)}</strong> versions</span>
      </div>
    </a>`).join("")}</div>`;
}

export function bindWorkspace(root) {
  root.querySelector('[data-act="new-project"]')?.addEventListener("click", () => {
    modal({
      title: "New project",
      sub: "Projects scope all prompts, branches, runs and evidence.",
      body: `
        <div class="row"><label>Name <span class="req">*</span></label><input name="name" required placeholder="Customer support" /></div>
        <div class="row"><label>Description</label><input name="description" placeholder="What is this workspace about?" /></div>`,
      primary: "Create project", secondary: "Cancel",
      onSubmit: async (data) => {
        const id = services.createProject({ name: data.name, description: data.description });
        await commit();
        toast("Project created");
        const s = getState(); const p = s.projects.find((x) => x.id === id);
        navigate(`/p/${p.slug}`);
      },
    });
  });

  root.querySelector('[data-act="export"]')?.addEventListener("click", async () => {
    const payload = await exportJSON();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    a.href = url; a.download = `prompt-tree-${stamp}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast("Exported workspace as JSON");
  });

  root.querySelector('[data-act="import"]')?.addEventListener("click", () => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = "application/json,.json";
    input.addEventListener("change", async () => {
      const file = input.files?.[0]; if (!file) return;
      try {
        const text = await file.text();
        await importJSON(JSON.parse(text));
        toast("Imported workspace");
        navigate("/");
      } catch (err) {
        toast("Import failed: " + err.message);
      }
    });
    input.click();
  });

  root.querySelector('[data-act="reset"]')?.addEventListener("click", async () => {
    if (!confirm("Reset workspace to the seeded demo? Local changes will be lost.")) return;
    const seed = await fetch("./data/seed.json").then((r) => r.json());
    const { resetTo } = await import("../store.js");
    await resetTo(seed);
    toast("Reset to demo");
    navigate("/");
  });

  root.querySelector('[data-act="theme"]')?.addEventListener("click", () => toggleTheme());

  root.querySelector('[data-act="tour"]')?.addEventListener("click", async () => {
    const t = await import("../tour.js");
    t.start({ force: true });
  });
}

function currentTheme() {
  return document.documentElement.dataset.theme || "light";
}
function toggleTheme() {
  const next = currentTheme() === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem("prompt-tree:theme", next); } catch {}
}
