// Read-only share view — rehydrates a `prompt-tree-share/1` slice from
// the URL hash and renders it with no editing surfaces. The slice is
// treated as untrusted input: `validateShare` rejects malformed shapes
// and every string flows through `escapeHtml`.
//
// This view never calls `services.*`, never writes to the store, never
// touches IDB. It only paints. The workspace state is left untouched so
// the viewer can navigate away and pick up their own workspace intact.

import { html, escapeHtml, escapeAttr, icon, brandMark, statusPill, relTime, toast } from "../ui/components.js";
import { decodeSlice } from "../share.js";
import { md as renderMarkdown } from "../vendor.js";
import { navigate } from "../router.js";

// Per-render cache so re-renders don't re-decode. Keyed by the encoded
// payload string; `null` means "decode failed, show the error we stored".
let _cache = null;

export function renderShareView(route) {
  const encoded = route?.query?.d || "";
  if (!encoded) return renderError("This share link is empty.");
  if (_cache && _cache.encoded === encoded) {
    return _cache.error ? renderError(_cache.error) : renderSlice(_cache.slice);
  }
  // First render: we can't await in a sync render fn. Kick off the
  // decode and come back once it resolves; show a skeleton meanwhile.
  // `bindShareView` will trigger a re-render once the decode lands.
  return html`
    ${renderTopbar(null)}
    <div class="main" data-share-root>
      <div class="empty" data-share-loading>
        <div class="ttl">Unpacking share link…</div>
        <div class="sub">Verifying the payload.</div>
      </div>
    </div>
  `;
}

export function bindShareView(root, route) {
  const encoded = route?.query?.d || "";
  root.querySelector('[data-act="import"]')?.addEventListener("click", (e) => {
    e.preventDefault();
    toast("Import into workspace — coming with D3 (fork-to-clipboard)");
  });
  root.querySelector('[data-act="copy-link"]')?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      toast("Share link copied");
    } catch { toast("Copy failed — select the URL bar instead"); }
  });
  // Wire version-tree click → rerender with a different target version.
  root.querySelectorAll("[data-share-version]").forEach((el) => {
    el.addEventListener("click", () => {
      const id = el.dataset.shareVersion;
      if (!_cache?.slice) return;
      const slice = _cache.slice;
      if (id && slice.versions.some((v) => v.id === id)) {
        // Local-only redirect: we swap the targetVersionId in memory and
        // re-render. The URL stays the same so sharing with "?v=..." isn't
        // needed — the payload is self-contained.
        _cache = { ..._cache, slice: { ...slice, targetVersionId: id } };
        // Force main.js to paint us again.
        const app = document.getElementById("app");
        if (app) {
          app.innerHTML = renderShareView({ query: { d: encoded } });
          bindShareView(app, { query: { d: encoded } });
        }
      }
    });
  });

  if (!encoded) return;
  if (_cache && _cache.encoded === encoded) return;   // already decoded

  // Decode asynchronously, then trigger a re-render by swapping the HTML.
  decodeSlice(encoded).then((slice) => {
    _cache = { encoded, slice, error: null };
    const host = document.getElementById("app");
    if (!host) return;
    host.innerHTML = renderShareView({ query: { d: encoded } });
    bindShareView(host, { query: { d: encoded } });
  }).catch((err) => {
    _cache = { encoded, slice: null, error: err?.message || String(err) };
    const host = document.getElementById("app");
    if (!host) return;
    host.innerHTML = renderShareView({ query: { d: encoded } });
    bindShareView(host, { query: { d: encoded } });
  });
}

function renderTopbar(slice) {
  return `
    <div class="topbar">
      <a class="topbar-logo" href="#/">
        <span class="mark">${brandMark(22)}</span>
        Prompt Tree
      </a>
      ${slice ? `
        <span class="topbar-crumb">
          <span class="sep">/</span>
          <span class="current">${escapeHtml(slice.project.name)}</span>
          <span class="sep">/</span>
          <span class="current">${escapeHtml(slice.prompt.name)}</span>
        </span>` : ""}
      <span class="topbar-spacer"></span>
      <span class="topbar-counters">
        <span class="ct" style="color:var(--accent)">${icon("info", { size: 13 })} read-only share</span>
      </span>
      <a class="topbar-action" href="#/">Back to workspace</a>
    </div>
  `;
}

function renderError(msg) {
  return html`
    ${renderTopbar(null)}
    <div class="main">
      <div class="empty">
        <div class="ttl">This share link can't be opened</div>
        <div class="sub">${escapeHtml(msg)}</div>
        <a class="btn" href="#/">Back to workspace</a>
      </div>
    </div>
  `;
}

function renderSlice(slice) {
  const target = slice.versions.find((v) => v.id === slice.targetVersionId)
    || slice.versions[slice.versions.length - 1];
  const branch = slice.branches.find((b) => b.id === target.createdOnBranchId);
  const parent = target.parentVersionId
    ? slice.versions.find((v) => v.id === target.parentVersionId)
    : null;
  const hash7 = (target.contentHash || "").slice(0, 7);

  return html`
    ${renderTopbar(slice)}
    <div class="workspace">
      <aside class="rail">
        <div class="rail-content">
          ${renderPromptCard(slice)}
          ${renderBranches(slice, target)}
          ${renderVersionList(slice, target)}
          ${renderShareMeta(slice)}
        </div>
      </aside>
      <section class="main" data-share-root>
        <div class="main-head">
          <div style="min-width:0">
            <div class="crumbs">
              <span class="br">${escapeHtml(branch?.name || "?")}</span>
              <span class="vno">v${target.number}</span>
              ${statusPill(target.status)}
              ${hash7 ? `<span class="hash-chip">${escapeHtml(hash7)}</span>` : ""}
            </div>
            <h1>${escapeHtml(target.title)}</h1>
            ${target.changeSummary
              ? `<div class="subtitle">${escapeHtml(target.changeSummary)}</div>`
              : ""}
          </div>
          <div class="actions">
            <button class="btn" data-act="copy-link">${icon("download", { size: 13 })} Copy link</button>
            <button class="btn accent" data-act="import">${icon("plus", { size: 13 })} Import into workspace</button>
          </div>
        </div>

        <div class="section">
          <div class="section-head">
            <div class="eyebrow">Prompt body</div>
            <div class="meta">${target.body.length} chars · ${target.body.split(/\r?\n/).length} lines</div>
          </div>
          <div class="code-frame"><pre>${escapeHtml(target.body)}</pre></div>
        </div>

        ${target.messages && target.messages.length ? `
          <div class="section" style="margin-top:24px">
            <div class="section-head"><div class="eyebrow">Messages</div></div>
            <div class="messages">
              ${target.messages.map((m) => `
                <div class="message">
                  <div class="role mono">${escapeHtml(m.role)}</div>
                  <pre>${escapeHtml(m.content)}</pre>
                </div>
              `).join("")}
            </div>
          </div>` : ""}

        <div class="split" style="margin-top:24px">
          <div class="subblock">
            <div class="eyebrow">Metadata</div>
            <div class="kv">
              ${hash7 ? `<div class="row"><div class="k">Content hash</div><div class="v mono">${escapeHtml(hash7)}</div></div>` : ""}
              ${target.createdAt ? `<div class="row"><div class="k">Created</div><div class="v">${escapeHtml(relTime(target.createdAt))}</div></div>` : ""}
              <div class="row"><div class="k">Parent</div><div class="v">${parent ? `v${parent.number} · ${escapeHtml(parent.title)}` : "<span style=\"color:var(--fg-faint)\">root</span>"}</div></div>
              ${target.rationale ? `<div class="row"><div class="k">Rationale</div><div class="v">${escapeHtml(target.rationale)}</div></div>` : ""}
            </div>
          </div>
          <div class="subblock">
            <div class="eyebrow">About this link</div>
            <div class="kv">
              <div class="row"><div class="k">Shared on</div><div class="v">${escapeHtml(new Date(slice.generatedAt).toISOString().slice(0, 10))}</div></div>
              <div class="row"><div class="k">Includes</div><div class="v">${slice.versions.length} version${slice.versions.length === 1 ? "" : "s"} · ${slice.branches.length} branch${slice.branches.length === 1 ? "" : "es"}</div></div>
              <div class="row"><div class="k">Read-only</div><div class="v">Nothing here writes to your workspace.</div></div>
            </div>
          </div>
        </div>

        ${slice.prompt.readme ? `
          <div class="section" style="margin-top:24px">
            <div class="section-head"><div class="eyebrow">Readme</div></div>
            ${renderMarkdown(slice.prompt.readme)}
          </div>` : ""}
      </section>
    </div>
  `;
}

function renderPromptCard(slice) {
  const desc = slice.prompt.description || slice.prompt.purpose || "";
  return `
    <section class="rail-section">
      <div class="eyebrow" style="margin-bottom:8px">Prompt</div>
      <div class="prompt-card">
        <div class="name">${escapeHtml(slice.prompt.name)}</div>
        <span class="slug">${escapeHtml(slice.prompt.slug)}</span>
        ${desc ? `<div class="desc">${escapeHtml(desc)}</div>` : ""}
      </div>
    </section>
  `;
}

function renderBranches(slice, target) {
  if (!slice.branches.length) return "";
  const currentBranchId = target.createdOnBranchId;
  return `
    <section class="rail-section">
      <div class="eyebrow" style="margin-bottom:8px">Branches in this slice</div>
      <div class="branch-list">
        ${slice.branches.map((b) => {
          const isCanonical = b.id === slice.canonicalBranchId;
          const isActive = b.id === currentBranchId;
          return `
            <div class="branch-row ${isActive ? "active" : ""}">
              <span class="swatch" style="background:${escapeAttr(b.color || "#6366f1")}"></span>
              <span class="name">${escapeHtml(b.name)} ${isCanonical ? `<span class="crown" title="canonical">${icon("crown", { size: 11 })}</span>` : ""}</span>
            </div>`;
        }).join("")}
      </div>
    </section>
  `;
}

function renderVersionList(slice, target) {
  return `
    <section class="rail-section">
      <div class="eyebrow" style="margin-bottom:8px">Version chain</div>
      <div class="tree">
        ${slice.versions.map((v) => {
          const selected = v.id === target.id;
          return `
            <div class="tree-node ${selected ? "selected" : ""}" data-share-version="${escapeAttr(v.id)}" style="padding-left:12px;position:relative;cursor:pointer">
              <span class="glyph ${selected ? "head" : ""}"></span>
              <span class="label">
                <span class="v">v${v.number}</span>
                <span class="t">${escapeHtml(v.title)}</span>
              </span>
            </div>`;
        }).join("")}
      </div>
    </section>
  `;
}

function renderShareMeta(slice) {
  return `
    <section class="rail-section">
      <div class="eyebrow" style="margin-bottom:8px">Shared from</div>
      <div class="kv" style="padding:10px 12px;border:1px solid var(--border);border-radius:10px;background:var(--bg-raised)">
        <div class="row"><div class="k">Project</div><div class="v">${escapeHtml(slice.project.name)}</div></div>
        <div class="row"><div class="k">Prompt</div><div class="v">${escapeHtml(slice.prompt.name)}</div></div>
      </div>
    </section>
  `;
}
