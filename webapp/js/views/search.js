// Search view — full-text within a project.

import { html, escapeHtml, icon } from "../ui/components.js";
import { getState } from "../store.js";
import * as services from "../services.js";

export function renderSearchView(route) {
  const s = getState();
  const project = s.projects.find((p) => p.slug === route.path.projectSlug);
  if (!project) return `<div class="main">Project not found.</div>`;
  const q = route.query.q || "";
  const hits = q ? services.search(project.id, q) : [];

  return html`
    <div class="topbar">
      <a class="topbar-logo" href="#/"><span class="mark">${icon("prompt", { size: 13, stroke: 1.6 })}</span>Prompt Tree</a>
      <span class="topbar-crumb">
        <span class="sep">/</span><a href="#/p/${escapeHtml(project.slug)}">${escapeHtml(project.name)}</a>
        <span class="sep">/</span><span class="current">search</span>
      </span>
      <span class="topbar-spacer"></span>
    </div>
    <div class="main">
      <div class="main-head">
        <div>
          <div class="eyebrow">Search</div>
          <h1>${icon("search", { size: 16 })} ${escapeHtml(project.name)}</h1>
          <div class="subtitle">Full-text over prompts, versions, and notes.</div>
        </div>
      </div>

      <form id="search-form" style="margin-bottom:16px">
        <input name="q" placeholder="Search…" value="${escapeHtml(q)}" autofocus
          style="width:100%;padding:10px 14px;border:1px solid var(--border-strong);border-radius:var(--radius-md);background:var(--bg-elev);font-size:14px;outline:none" />
      </form>

      ${!q ? `<div class="empty"><div class="sub">Type a query to search within ${escapeHtml(project.name)}.</div></div>`
           : hits.length === 0 ? `<div class="empty"><div class="sub">No results for <code>${escapeHtml(q)}</code>.</div></div>`
           : `<div class="eyebrow" style="margin-bottom:8px">${hits.length} result${hits.length === 1 ? "" : "s"}</div>
              <div style="display:flex;flex-direction:column;gap:8px">
                ${hits.map(renderHit).join("")}
              </div>`}
    </div>
  `;
}

function renderHit(h) {
  const href = h.kind === "version"
    ? `#/p/${h.projectSlug}/p/${h.promptSlug}/v/${h.versionId}`
    : `#/p/${h.projectSlug}/p/${h.promptSlug}`;
  return `
    <a class="card" href="${href}">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        <span style="font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;padding:1px 6px;border-radius:4px;background:var(--bg-sunk);color:var(--fg-muted)">${escapeHtml(h.kind)}</span>
        <span style="font-weight:600;color:var(--fg)">${escapeHtml(h.title)}</span>
      </div>
      <div style="color:var(--fg-muted);font-size:12.5px">${escapeHtml(h.snippet)}</div>
    </a>`;
}

export function bindSearchView(root, route) {
  root.querySelector("#search-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = e.currentTarget.elements.q.value;
    location.hash = `#/p/${route.path.projectSlug}/search?q=${encodeURIComponent(q)}`;
  });
}
