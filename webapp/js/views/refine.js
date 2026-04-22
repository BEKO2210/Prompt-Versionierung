// Refinement workspace — runs analyzers, produces a suggestion,
// accept creates a new version on a new branch.

import { html, escapeHtml, icon, modal, toast } from "../ui/components.js";
import { getState, commit } from "../store.js";
import * as services from "../services.js";
import { navigate } from "../router.js";

export function renderRefineView(route) {
  const s = getState();
  const project = s.projects.find((p) => p.slug === route.path.projectSlug);
  const prompt = project?.prompts.find((p) => p.slug === route.path.promptSlug);
  const version = prompt?.versions.find((v) => v.id === route.path.versionId);
  if (!version) return `<div class="main">Version not found.</div>`;

  const suggestions = (prompt.suggestions || [])
    .filter((s_) => s_.versionId === version.id)
    .sort((a, b) => b.createdAt - a.createdAt);

  return html`
    ${renderTopbar(project, prompt, version)}
    <div class="main">
      <div class="main-head">
        <div>
          <div class="eyebrow">Refine</div>
          <h1>${icon("spark", { size: 16 })} v${version.number} · ${escapeHtml(version.title)}</h1>
          <div class="subtitle">Analyzers scan the body. Accepted suggestions fork a new branch and record a <code>refinement</code> lineage edge.</div>
        </div>
        <div class="actions">
          <button class="btn accent" data-act="analyze">${icon("spark", { size: 13 })} Re-analyze</button>
          <a class="btn" href="#/p/${escapeHtml(project.slug)}/p/${escapeHtml(prompt.slug)}/v/${escapeHtml(version.id)}">${icon("back", { size: 13 })} Back</a>
        </div>
      </div>

      ${suggestions.length === 0
        ? `<div class="empty"><div class="ttl">No suggestions yet</div><div class="sub">Click <strong>Re-analyze</strong> to run the five built-in analyzers.</div></div>`
        : suggestions.map((s_) => renderSuggestion(s_)).join("")}
    </div>
  `;
}

function renderTopbar(project, prompt, version) {
  return `
    <div class="topbar">
      <a class="topbar-logo" href="#/"><span class="mark">${icon("prompt", { size: 13, stroke: 1.6 })}</span>Prompt Tree</a>
      <span class="topbar-crumb">
        <span class="sep">/</span>
        <a href="#/p/${escapeHtml(project.slug)}">${escapeHtml(project.name)}</a>
        <span class="sep">/</span>
        <a href="#/p/${escapeHtml(project.slug)}/p/${escapeHtml(prompt.slug)}">${escapeHtml(prompt.slug)}</a>
        <span class="sep">/</span>
        <span class="current">refine v${version.number}</span>
      </span>
      <span class="topbar-spacer"></span>
    </div>`;
}

function renderSuggestion(s) {
  const SEV_CLS = { error: "error", warn: "warn", info: "info" };
  return `
    <div class="form-card" data-sug="${escapeHtml(s.id)}" style="margin-bottom:14px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
        <div class="eyebrow">Suggestion</div>
        <span class="hash-chip">${escapeHtml(new Date(s.createdAt).toISOString().slice(0, 16).replace("T", " "))}</span>
        <span class="pill ${s.status === "accepted" ? "approved" : s.status === "rejected" ? "deprecated" : "candidate"}" style="margin-left:auto">${escapeHtml(s.status)}</span>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1.6fr;gap:14px">
        <div>
          <div class="eyebrow" style="margin-bottom:6px">Diagnostics (${s.diagnosis.length})</div>
          ${s.diagnosis.length === 0 ? `<div style="color:var(--fg-muted);font-size:12.5px">No findings.</div>` : `
            <ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:8px">
              ${s.diagnosis.map((f) => `
                <li style="display:flex;gap:8px">
                  <span class="sev-dot ${SEV_CLS[f.severity] || "info"}" style="margin-top:6px"></span>
                  <div>
                    <div style="font-family:var(--font-mono);font-size:11px;color:var(--fg-faint)">${escapeHtml(f.code)}</div>
                    <div style="font-size:12.5px">${escapeHtml(f.detail)}</div>
                  </div>
                </li>`).join("")}
            </ul>`}
        </div>
        <div>
          <div class="eyebrow" style="margin-bottom:6px">Proposed body</div>
          <div class="code-frame"><pre>${escapeHtml(s.proposedBody)}</pre></div>
          <div style="margin-top:10px;padding:10px 12px;background:var(--accent-soft);border:1px solid transparent;border-radius:var(--radius-md);font-size:12.5px">
            <div class="eyebrow" style="color:var(--accent-fg)">Rationale</div>
            <div style="margin-top:4px">${escapeHtml(s.rationale)}</div>
          </div>

          ${s.status === "pending" ? `
            <div style="display:flex;gap:10px;margin-top:12px">
              <button class="btn accent" data-act="accept" data-sug="${escapeHtml(s.id)}">${icon("check", { size: 13 })} Accept → fork version</button>
              <button class="btn" data-act="reject" data-sug="${escapeHtml(s.id)}">Reject</button>
            </div>` : ""}
        </div>
      </div>
    </div>`;
}

export function bindRefineView(root, route) {
  const { projectSlug, promptSlug, versionId } = route.path;

  root.querySelector('[data-act="analyze"]')?.addEventListener("click", async () => {
    const s = getState();
    const pr = s.projects.find((p) => p.slug === projectSlug).prompts.find((p) => p.slug === promptSlug);
    services.diagnoseAndPropose(pr.id, versionId);
    await commit();
    toast("Analyzed");
  });

  root.querySelectorAll('[data-act="accept"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const sugId = btn.dataset.sug;
      modal({
        title: "Accept suggestion",
        sub: "Creates a new branch, new version, and a `refinement` lineage edge.",
        body: `
          <div class="row"><label>Change summary <span class="req">*</span></label><input name="changeSummary" required value="Accept refinement" /></div>
          <div class="row"><label>Expected improvement</label><input name="expectedImprovement" placeholder="Hypothesis you can test" /></div>`,
        primary: "Accept", secondary: "Cancel",
        onSubmit: async (data) => {
          const s = getState();
          const pr = s.projects.find((p) => p.slug === projectSlug).prompts.find((p) => p.slug === promptSlug);
          const { versionId: newId } = await services.acceptSuggestion({
            promptId: pr.id, suggestionId: sugId,
            changeSummary: data.changeSummary,
            expectedImprovement: data.expectedImprovement,
          });
          await commit();
          toast("Accepted — new version created");
          navigate(`/p/${projectSlug}/p/${promptSlug}/v/${newId}`);
        },
      });
    });
  });

  root.querySelectorAll('[data-act="reject"]').forEach((btn) => {
    btn.addEventListener("click", async () => {
      const sugId = btn.dataset.sug;
      const reason = prompt("Optional reason:") || "";
      const s = getState();
      const pr = s.projects.find((p) => p.slug === projectSlug).prompts.find((p) => p.slug === promptSlug);
      services.rejectSuggestion({ promptId: pr.id, suggestionId: sugId, reason });
      await commit();
      toast("Rejected");
    });
  });
}
