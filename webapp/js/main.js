// Entry point — wires router + store + views + keyboard + palette.

import { loadState, subscribe as subscribeStore, startMultiTabSync, getState, undo as storeUndo, canUndo, commit } from "./store.js";
import { start as startRouter, subscribe as subscribeRoute, route as currentRoute, navigate } from "./router.js";
import * as services from "./services.js";
import { icon, toast } from "./ui/components.js";

import { renderWorkspace,     bindWorkspace }     from "./views/workspace.js";
import { renderProjectView,   bindProjectView }   from "./views/project.js";
import { renderPromptView,    bindPromptView, promptShortcuts } from "./views/prompt.js";
import { renderCompareView,   bindCompareView }   from "./views/compare.js";
import { renderRefineView,    bindRefineView }    from "./views/refine.js";
import { renderProposalView,  bindProposalView }  from "./views/proposal.js";
import { renderSettingsView,  bindSettingsView }  from "./views/settings.js";
import { renderHelpView,      bindHelpView }      from "./views/help.js";
import { renderSearchView,    bindSearchView }    from "./views/search.js";
import { renderShareView,     bindShareView }     from "./views/share.js";
import { renderTemplatesView, bindTemplatesView } from "./views/templates.js";
import {
  renderDatasetsView, bindDatasetsView,
  renderModelsView,   bindModelsView,
  renderRubricsView,  bindRubricsView,
} from "./views/meta.js";

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
(async function boot() {
  // Restore theme preference.
  try {
    const t = localStorage.getItem("prompt-tree:theme");
    if (t) document.documentElement.dataset.theme = t;
  } catch {}

  // Load state (IDB) or fall back to seed.
  const seed = await loadSeed();
  await loadState({ defaults: seed });

  startRouter();
  startMultiTabSync();
  subscribeRoute(() => render());
  subscribeStore(() => render());
  render();

  setupGlobalKeyboard();
  hideSplash();

  // First-visit onboarding: open the spotlight tour over real data.
  // Skipped if the user has completed it before (localStorage marker).
  // Wait a tick so the first paint has finished; then defer to the tour.
  setTimeout(async () => {
    const tour = await import("./tour.js");
    tour.maybeAutoStart();
    // Expose for the workspace topbar's "Tutorial" link.
    window.__startTour = () => tour.start({ force: true });
  }, 300);
})();

async function loadSeed() {
  try {
    const res = await fetch("./data/seed.json");
    if (!res.ok) throw new Error("no seed");
    return await res.json();
  } catch {
    return {
      meta: { updatedAt: Date.now(), revision: 0, schemaVersion: 1, author: null },
      projects: [],
    };
  }
}

function hideSplash() {
  const el = document.getElementById("splash");
  if (!el) return;
  el.classList.add("hidden");
  setTimeout(() => el.remove(), 300);
}

// ---------------------------------------------------------------------------
// Render cycle: one view at a time into #app
// ---------------------------------------------------------------------------
let lastRouteKey = null;
function render() {
  const route = currentRoute();
  const app = document.getElementById("app");
  if (!app) return;

  const { markup, bind } = pickView(route);
  app.innerHTML = markup;
  // Scroll to top only on actual navigation, not on re-render of same URL.
  const key = JSON.stringify(route);
  if (key !== lastRouteKey) {
    lastRouteKey = key;
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  bind?.(app, route);
}

function pickView(route) {
  switch (route.name) {
    case "workspace": return { markup: renderWorkspace(),             bind: bindWorkspace };
    case "project":   return { markup: renderProjectView(route),      bind: bindProjectView };
    case "prompts":   return { markup: renderProjectView(route),      bind: bindProjectView };
    case "prompt":    return { markup: renderPromptView(route),       bind: bindPromptView };
    case "compare":   return { markup: renderCompareView(route),      bind: bindCompareView };
    case "refine":    return { markup: renderRefineView(route),       bind: bindRefineView };
    case "proposal":  return { markup: renderProposalView(route),     bind: bindProposalView };
    case "settings":  return { markup: renderSettingsView(),          bind: bindSettingsView };
    case "help":      return { markup: renderHelpView(),              bind: bindHelpView };
    case "share":     return { markup: renderShareView(route),        bind: bindShareView };
    case "templates": return { markup: renderTemplatesView(),         bind: bindTemplatesView };
    case "search":    return { markup: renderSearchView(route),       bind: bindSearchView };
    case "datasets":  return { markup: renderDatasetsView(route),     bind: bindDatasetsView };
    case "models":    return { markup: renderModelsView(route),       bind: bindModelsView };
    case "rubrics":   return { markup: renderRubricsView(route),      bind: bindRubricsView };
    default:          return { markup: `<div class="main"><div class="empty"><div class="ttl">404</div><div class="sub">This path doesn't exist.</div><a class="btn" href="#/">Back to workspace</a></div></div>`, bind: null };
  }
}

// ---------------------------------------------------------------------------
// Keyboard: ⌘K palette, E/F/R per-view, ? overlay.
// ---------------------------------------------------------------------------
function setupGlobalKeyboard() {
  document.addEventListener("keydown", (e) => {
    // Escape MUST be handled regardless of focus so the palette / modals
    // can close while their input is focused.
    if (e.key === "Escape") {
      const paletteOpen = !!document.querySelector("#palette-root .palette");
      const modalOpen = !!document.querySelector("#modal-root .modal");
      if (paletteOpen || modalOpen) {
        e.preventDefault();
        if (paletteOpen) closePalette();
        if (modalOpen) document.getElementById("modal-root").innerHTML = "";
      }
      return;
    }

    // Ignore typing in inputs/textareas except for ⌘K.
    const inField = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName) ||
      document.activeElement?.isContentEditable;

    const isCmdK = (e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey);
    if (isCmdK) {
      e.preventDefault();
      openPalette();
      return;
    }

    // Cmd/Ctrl+Z — undo the last mutation. Works from ANY view; ignored
    // while typing in an input/textarea (browsers handle native text undo
    // there). Shift+Cmd+Z is intentionally NOT bound — we don't support
    // redo yet; forking a new action after an undo clears the future.
    const isUndo = (e.key === "z" || e.key === "Z") && (e.metaKey || e.ctrlKey) && !e.shiftKey;
    if (isUndo && !inField) {
      e.preventDefault();
      if (canUndo()) {
        storeUndo();
        commit();
        toast("Undone");
      } else {
        toast("Nothing to undo");
      }
      return;
    }
    if (inField) return;

    if (e.key === "/") { e.preventDefault(); openPalette(); return; }

    // Per-view shortcuts (E/F/R on the prompt view).
    const route = currentRoute();
    if (route.name === "prompt") {
      const map = promptShortcuts(route) || {};
      const fn = map[e.key.toUpperCase()];
      if (fn) { e.preventDefault(); fn(); }
    }
  });
}

// ---------------------------------------------------------------------------
// Command palette
// ---------------------------------------------------------------------------
let paletteState = { open: false, q: "", active: 0, items: [] };
function openPalette() {
  const root = document.getElementById("palette-root");
  paletteState = { open: true, q: "", active: 0, items: buildPaletteItems("") };
  root.innerHTML = paletteMarkup();
  wirePalette(root);
  setTimeout(() => root.querySelector(".palette-input")?.focus(), 0);
  // Warm Fuse asynchronously so the *next* keystroke ranks fuzzily.
  warmPalette().catch(() => {});
}
function closePalette() {
  paletteState.open = false;
  document.getElementById("palette-root").innerHTML = "";
}
function paletteMarkup() {
  const { q, items, active } = paletteState;
  return `
    <div class="modal-backdrop" data-palette>
      <div class="palette">
        <input class="palette-input" placeholder="Jump to a prompt, version, or note…" value="${q.replace(/"/g, "&quot;")}" />
        <div class="palette-list">
          ${items.length === 0 ? `<div class="palette-empty">Type to search across all projects.</div>` :
            items.map((it, i) => `
              <div class="palette-item ${i === active ? "active" : ""}" data-idx="${i}">
                <span class="kind">${it.kind}</span>
                <span class="label">${escape(it.title)}<span class="snip">${escape(it.snippet || "")}</span></span>
              </div>`).join("")}
        </div>
        <div class="palette-foot">
          <span><span class="kbd">↑</span> <span class="kbd">↓</span> move</span>
          <span><span class="kbd">↵</span> open</span>
          <span><span class="kbd">Esc</span> close</span>
        </div>
      </div>
    </div>`;
}
function escape(s) { return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }

function wirePalette(root) {
  const input = root.querySelector(".palette-input");
  input.addEventListener("input", async () => {
    paletteState.q = input.value;
    paletteState.active = 0;
    paletteState.items = buildPaletteItems(input.value);
    rerenderPalette(root);
    // After the first keystroke, the index is loaded; refresh once more
    // so the substring fallback we showed gets replaced by the proper
    // fuzzy ranking. No-op if Fuse was already ready.
    if (paletteState.q && paletteState.q.length >= 2) {
      const before = _fuse;
      await warmPalette();
      if (_fuse !== before) {
        paletteState.items = buildPaletteItems(paletteState.q);
        rerenderPalette(root);
      }
    }
  });
  root.addEventListener("click", (e) => {
    if (e.target.matches("[data-palette]")) { closePalette(); return; }
    const row = e.target.closest(".palette-item");
    if (!row) return;
    const it = paletteState.items[Number(row.dataset.idx)];
    if (it) openItem(it);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); paletteState.active = Math.min(paletteState.items.length - 1, paletteState.active + 1); rerenderPalette(root); }
    if (e.key === "ArrowUp")   { e.preventDefault(); paletteState.active = Math.max(0, paletteState.active - 1); rerenderPalette(root); }
    if (e.key === "Enter")     { e.preventDefault(); const it = paletteState.items[paletteState.active]; if (it) openItem(it); }
  });
}
function rerenderPalette(root) {
  root.innerHTML = paletteMarkup();
  wirePalette(root);
  root.querySelector(".palette-input")?.focus();
}
// All searchable items in the workspace, in the same shape regardless
// of source. Built fresh per query so newly-created items show up
// immediately. Cheap; even thousands of versions is fast to enumerate.
function paletteCorpus() {
  const s = getState();
  const items = [];
  for (const p of s.projects) {
    items.push({
      kind: "project",
      title: p.name,
      snippet: p.description || "",
      // Side fields searched too (lower weight) so a slug match still wins.
      slug: p.slug, projectName: p.name,
      href: `#/p/${p.slug}`,
    });
    for (const pr of p.prompts) {
      items.push({
        kind: "prompt",
        title: pr.name,
        snippet: pr.purpose || pr.description || "",
        slug: pr.slug, projectName: p.name,
        href: `#/p/${p.slug}/p/${pr.slug}`,
      });
      for (const v of pr.versions) {
        items.push({
          kind: "version",
          title: `v${v.number} — ${v.title}`,
          snippet: (v.body || "").slice(0, 200),
          slug: pr.slug, projectName: p.name,
          href: `#/p/${p.slug}/p/${pr.slug}/v/${v.id}`,
        });
      }
    }
  }
  return items;
}

// Cached Fuse index. Rebuild when the workspace state revision bumps.
let _fuse = null;
let _fuseRev = -1;
async function getFuse() {
  const s = getState();
  const rev = s?.meta?.revision ?? 0;
  if (_fuse && rev === _fuseRev) return _fuse;
  const { buildFuse } = await import("./vendor.js");
  _fuse = buildFuse(paletteCorpus(), {
    keys: [
      { name: "title",       weight: 0.55 },
      { name: "slug",        weight: 0.15 },
      { name: "projectName", weight: 0.10 },
      { name: "snippet",     weight: 0.20 },
    ],
    threshold: 0.4,
  });
  _fuseRev = rev;
  return _fuse;
}

function buildPaletteItems(q) {
  // Empty query: surface a recent slice (still useful as a directory).
  if (!q || q.trim().length < 2) {
    return paletteCorpus().slice(0, 20);
  }
  // Fuse is async-loaded the first time. Until it's ready, fall back to
  // a substring filter so the user never sees a blank list during the
  // first keystroke.
  if (!_fuse) {
    void getFuse(); // warm cache for next call
    const needle = q.toLowerCase();
    return paletteCorpus().filter((it) =>
      it.title.toLowerCase().includes(needle) || (it.snippet || "").toLowerCase().includes(needle)
    ).slice(0, 50);
  }
  const matches = _fuse.search(q, { limit: 50 });
  return matches.map((m) => m.item);
}

// Refresh whenever the palette opens — keeps it cheap and accurate.
async function warmPalette() { await getFuse(); }

function openItem(it) { closePalette(); navigate(it.href.replace(/^#/, "")); }
