// Reusable rendering helpers and modal/palette/toast utilities.

import { icon, brandMark } from "../icons.js";

// ---------------------------------------------------------------------------
// Templating helpers
// ---------------------------------------------------------------------------
export function html(strings, ...values) {
  let out = "";
  for (let i = 0; i < strings.length; i++) {
    out += strings[i];
    if (i < values.length) {
      const v = values[i];
      if (v === null || v === undefined || v === false) continue;
      if (Array.isArray(v)) out += v.join("");
      else out += String(v);
    }
  }
  return out;
}
export function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
export function escapeAttr(s) { return escapeHtml(s); }

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------
let toastTimer;
export function toast(msg) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 1800);
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------
export function modal({ title, sub, body, primary, secondary, onSubmit, onCancel }) {
  const root = document.getElementById("modal-root");
  root.innerHTML = `
    <div class="modal-backdrop" data-backdrop>
      <form class="modal" id="modal-form">
        <h2>${escapeHtml(title)}</h2>
        ${sub ? `<div class="modal-sub">${escapeHtml(sub)}</div>` : ""}
        ${body || ""}
        <div class="modal-error" id="modal-error" hidden></div>
        <div class="actions">
          ${secondary ? `<button type="button" class="btn ghost" data-mod="cancel">${escapeHtml(secondary)}</button>` : ""}
          <button type="submit" class="btn accent" data-mod="ok">${escapeHtml(primary)}</button>
        </div>
      </form>
    </div>`;
  const form = root.querySelector("#modal-form");
  const err = root.querySelector("#modal-error");
  const backdrop = root.querySelector("[data-backdrop]");

  function close() { root.innerHTML = ""; }

  // Click on the backdrop (but not on the modal itself) cancels.
  backdrop?.addEventListener("mousedown", (e) => {
    if (e.target === backdrop) { close(); onCancel?.(); }
  });

  root.querySelector('[data-mod="cancel"]')?.addEventListener("click", () => { close(); onCancel?.(); });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    err.hidden = true; err.textContent = "";
    try {
      const data = Object.fromEntries(new FormData(form).entries());
      const r = onSubmit?.(data);
      if (r instanceof Promise) await r;
      close();
    } catch (ex) {
      err.textContent = ex.message || String(ex);
      err.hidden = false;
    }
  });

  // Auto-focus first input
  setTimeout(() => form.querySelector("input,textarea,select")?.focus(), 0);
}

// ---------------------------------------------------------------------------
// Pill helpers
// ---------------------------------------------------------------------------
export function statusPill(status) {
  return `<span class="pill ${escapeAttr(status)}">${escapeHtml(status)}</span>`;
}
export function hashChip(hash) {
  return `<span class="hash-chip">${escapeHtml(hash.slice(0, 7))}</span>`;
}

// ---------------------------------------------------------------------------
// Score cell
// ---------------------------------------------------------------------------
export function scoreCell(score) {
  if (score == null) return `<span class="score" style="color:var(--fg-faint)">—</span>`;
  const cls = score >= 0.8 ? "good" : score >= 0.5 ? "mid" : "bad";
  return `<span class="score ${cls}">${Math.round(score * 100)}%</span>`;
}

// ---------------------------------------------------------------------------
// Time formatter
// ---------------------------------------------------------------------------
export function relTime(t) {
  if (!t) return "";
  const diff = Date.now() - t;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return Math.floor(diff / 60_000) + "m ago";
  if (diff < 86_400_000) return Math.floor(diff / 3_600_000) + "h ago";
  if (diff < 7 * 86_400_000) return Math.floor(diff / 86_400_000) + "d ago";
  return new Date(t).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Member / avatar helpers
// ---------------------------------------------------------------------------
// Resolve a member by id from a project. Returns a synthetic unknown member
// if not found, so callers never have to null-check.
export function resolveMember(project, memberId) {
  if (!project || !memberId) return { id: memberId || "mem_unknown", name: "Unknown", initials: "??", color: "#9ba2b3" };
  const m = (project.members || []).find((x) => x.id === memberId);
  return m || { id: memberId, name: memberId, initials: memberId.slice(4, 6).toUpperCase() || "??", color: "#9ba2b3" };
}

// Render a circular avatar with initials. Size in px.
export function avatar(member, size = 20) {
  const m = member || { initials: "??", color: "#9ba2b3", name: "" };
  const fontSize = Math.max(9, Math.round(size * 0.42));
  return `<span class="avatar" title="${escapeAttr(m.name || "")}" style="--sz:${size}px;--fg:#fff;--bg:${escapeAttr(m.color || "#9ba2b3")};font-size:${fontSize}px">${escapeHtml(m.initials || "??")}</span>`;
}

// Inline "<avatar> <name>" lockup.
export function authorInline(member, size = 18) {
  return `<span class="author">${avatar(member, size)}<span class="author-name">${escapeHtml(member?.name || "Unknown")}</span></span>`;
}

// Re-export icon + brandMark + member helpers.
export { icon, brandMark };
