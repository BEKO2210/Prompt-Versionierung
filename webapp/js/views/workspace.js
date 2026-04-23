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

  // When the workspace is empty (truly-new install or after delete-all),
  // show the proper landing page instead of the grid chrome. This is the
  // E1 surface — marketing-grade first impression.
  if (projects.length === 0) return renderLanding();

  return html`
    ${renderChromeTopbar()}
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

      ${projectsGrid(projects)}
    </div>
  `;
}

// The populated topbar — same action row the app has always had, kept
// out of the landing page so the first-impression surface stays focused.
function renderChromeTopbar() {
  return `
    <div class="topbar">
      <a class="topbar-logo" href="#/">
        <span class="mark">${brandMark(22)}</span>
        Prompt Tree
      </a>
      <span class="topbar-spacer"></span>
      <button class="topbar-action" data-act="tour">${icon("info", { size: 13 })} Tutorial</button>
      <a class="topbar-action" href="#/templates">${icon("rubric", { size: 13 })} Templates</a>
      <a class="topbar-action" href="#/help">${icon("info", { size: 13 })} Help</a>
      <a class="topbar-action" href="#/settings">${icon("cog", { size: 13 })} Settings</a>
      <button class="topbar-action" data-act="export">${icon("download", { size: 13 })} Export</button>
      <button class="topbar-action" data-act="import">${icon("upload", { size: 13 })} Import</button>
      <button class="topbar-action" data-act="reset">${icon("reset", { size: 13 })} Reset demo</button>
      <button class="topbar-action" data-act="theme">${icon(currentTheme() === "dark" ? "sun" : "moon", { size: 13 })}</button>
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

// ---------------------------------------------------------------------------
// Landing page (E1) — only reachable when projects.length === 0. Sells what
// the app is, directly; two CTAs (create project, load the seeded demo) +
// a Templates link. No topbar action row — we want the first impression
// uncluttered.
// ---------------------------------------------------------------------------
function renderLanding() {
  return html`
    <div class="topbar topbar-landing">
      <a class="topbar-logo" href="#/">
        <span class="mark">${brandMark(22)}</span>
        Prompt Tree
      </a>
      <span class="topbar-spacer"></span>
      <a class="topbar-action" href="#/templates">${icon("rubric", { size: 13 })} Templates</a>
      <a class="topbar-action" href="#/help">${icon("info", { size: 13 })} Help</a>
      <button class="topbar-action" data-act="theme">${icon(currentTheme() === "dark" ? "sun" : "moon", { size: 13 })}</button>
    </div>

    <main class="landing">
      <section class="landing-hero">
        <img class="landing-mark" src="./assets/mark-hero.svg" width="160" height="160" alt="Prompt Tree" data-hero-mark />
        <h1 class="landing-title reveal reveal-title">Prompt Tree</h1>
        <div class="landing-tagline" aria-label="Branch. Prove. Ship.">
          <span class="reveal reveal-word reveal-word-1">Branch.</span>
          <span class="reveal reveal-word reveal-word-2">Prove.</span>
          <span class="reveal reveal-word reveal-word-3">Ship.</span>
        </div>
        <p class="landing-pitch reveal reveal-pitch">
          Prompt Tree is the place where prompts grow up — versioned,
          peer-reviewed, evaluated, and shippable. Runs entirely in your
          browser. No backend, no telemetry, no lock-in.
        </p>
        <div class="landing-ctas reveal reveal-ctas">
          <button class="btn accent lg" data-act="new-project">${icon("plus", { size: 14 })} Create your first project</button>
          <button class="btn lg" data-act="load-demo">${icon("play", { size: 14 })} Explore with the demo</button>
        </div>
        <div class="landing-subcta reveal reveal-subcta">
          Or <a href="#/templates">browse the template library</a> — six curated starter prompts ready to import.
        </div>
      </section>

      <section class="landing-pillars">
        ${pillar("fork", "Branch", "A real version DAG — forks, merges, refinement edges, cherry-picks. Every change has a parent, every path is addressable.")}
        ${pillar("beaker", "Prove", "Evaluators, A/B with Wilson CIs, blame view, score trend. Ship a prompt because the evidence says so, not because someone remembered.")}
        ${pillar("crown", "Ship", "Promote to canonical with a written rationale, a release tag, a decision row. Every governance move is an audit record, append-only.")}
      </section>

      <section class="landing-features">
        <div class="landing-feature-col">
          <div class="eyebrow">Authoring</div>
          <ul class="landing-list">
            <li><strong>Immutable versions.</strong> Only <code>status</code> transitions; body, parent, hash are write-once.</li>
            <li><strong>Branches + proposals.</strong> PR-style review on prompts; configurable approval gate before merge.</li>
            <li><strong>Five analyzers</strong> flag ambiguity, missing constraints, unclear role, redundancy, under-specification.</li>
            <li><strong>Refinement suggestions</strong> produce branched candidates with lineage edges and expected-improvement notes.</li>
          </ul>
        </div>
        <div class="landing-feature-col">
          <div class="eyebrow">Evidence</div>
          <ul class="landing-list">
            <li><strong>Three real providers</strong> — Anthropic, OpenAI, Gemini — behind one adapter; deterministic mock fallback.</li>
            <li><strong>Secure key storage</strong> — AES-GCM in a separate IDB store, never exported, never broadcast.</li>
            <li><strong>Token + cost prediction</strong> live in the Run modal; tiktoken where it applies, chars/4 elsewhere.</li>
            <li><strong>Portable JSON</strong> for share links, run bundles, forks. Versioned envelopes, stable across releases.</li>
          </ul>
        </div>
      </section>

      <section class="landing-foot">
        <span>Runs entirely in your browser.</span>
        <span class="dot">·</span>
        <span>Git-style, not SaaS.</span>
        <span class="dot">·</span>
        <span>Your data, your device.</span>
      </section>
    </main>
  `;
}

function pillar(iconName, title, copy) {
  return `
    <div class="landing-pillar">
      <div class="landing-pillar-icon" aria-hidden="true">${icon(iconName, { size: 22 })}</div>
      <div class="landing-pillar-title">${escapeHtml(title)}</div>
      <div class="landing-pillar-copy">${escapeHtml(copy)}</div>
    </div>`;
}

export function bindWorkspace(root) {
  // Reduced-motion fallback: swap the animated hero SVG for the static
  // mark and add a body-level flag the CSS picks up to collapse the
  // sequential word/title reveals to an instant paint. SMIL itself is
  // out of the stylesheet's reach, so the asset swap is the only way to
  // actually silence the animation.
  const hero = root.querySelector("[data-hero-mark]");
  if (hero && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    hero.src = "./assets/mark.svg";
    document.documentElement.dataset.reducedMotion = "1";
  }

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

  // Landing-page specific: load the seeded demo into an empty workspace.
  // Reuses the same `resetTo` path the topbar "Reset demo" uses; no
  // confirm dialog because there's literally nothing to lose.
  root.querySelector('[data-act="load-demo"]')?.addEventListener("click", async () => {
    const seed = await fetch("./data/seed.json").then((r) => r.json());
    const { resetTo } = await import("../store.js");
    await resetTo(seed);
    toast("Loaded the demo");
    navigate("/");
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
