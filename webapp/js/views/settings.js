// Settings view — manage API keys (and, in future, default model
// preferences, telemetry opt-in, etc.). API keys live in their own
// IndexedDB store, encrypted-at-rest. They are NEVER part of an export.

import { html, escapeHtml, icon, brandMark, modal, toast } from "../ui/components.js";
import * as secrets from "../secrets.js";
import { navigate } from "../router.js";

const PROVIDERS = [
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    keyHint: "starts with sk-ant-…",
    docsHref: "https://docs.anthropic.com/en/api/getting-started",
    note: "Browser calls require the dangerous-direct-browser-access header (handled automatically). Your key never leaves this browser.",
  },
  {
    id: "openai",
    label: "OpenAI (GPT-4o, o-series)",
    keyHint: "starts with sk-…",
    docsHref: "https://platform.openai.com/docs/api-reference/authentication",
    note: "Direct browser calls are enabled with dangerouslyAllowBrowser. Your key never leaves this browser.",
  },
  {
    id: "google",
    label: "Google (Gemini)",
    keyHint: "starts with AIza…",
    docsHref: "https://ai.google.dev/gemini-api/docs/api-key",
    note: "Uses Gemini's REST API directly from the browser. Your key never leaves this browser.",
  },
];

let _statusCache = null;

export function renderSettingsView() {
  return html`
    <div class="topbar">
      <a class="topbar-logo" href="#/"><span class="mark">${brandMark(22)}</span>Prompt Tree</a>
      <span class="topbar-crumb">
        <span class="sep">/</span><span class="current">Settings</span>
      </span>
      <span class="topbar-spacer"></span>
    </div>
    <div class="main center">
      <div class="main-head">
        <div>
          <div class="eyebrow">Settings</div>
          <h1>${icon("cog", { size: 18 })} API keys &amp; preferences</h1>
          <div class="subtitle">
            Bring-your-own keys. Stored only in this browser, encrypted at rest. Never sent to a backend (there is no backend).
          </div>
        </div>
        <div class="actions">
          <button class="btn" data-act="clear-all">${icon("trash", { size: 13 })} Clear all keys</button>
        </div>
      </div>

      <div class="form-card" style="padding:0;overflow:hidden">
        ${PROVIDERS.map((p, i) => `
          <div data-provider="${escapeHtml(p.id)}" style="padding:16px 18px;${i > 0 ? "border-top:1px solid var(--border-soft);" : ""}">
            <div style="display:flex;align-items:flex-start;gap:14px">
              <div style="flex:1;min-width:0">
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px">
                  <strong style="font-size:14px">${escapeHtml(p.label)}</strong>
                  <span class="status-dot" data-status="${escapeHtml(p.id)}"
                        style="display:inline-flex;align-items:center;gap:4px;font-size:11px;padding:1px 6px;border-radius:999px;background:var(--bg-sunk);border:1px solid var(--border-soft);color:var(--fg-muted)">…</span>
                  <a href="${escapeHtml(p.docsHref)}" target="_blank" rel="noopener noreferrer"
                     style="font-size:11.5px;color:var(--fg-muted);margin-left:auto">${icon("arrow", { size: 11 })} get a key</a>
                </div>
                <div style="color:var(--fg-muted);font-size:12.5px;line-height:1.5;margin-bottom:10px">${escapeHtml(p.note)}</div>

                <form data-form="${escapeHtml(p.id)}" style="display:flex;gap:8px;align-items:center">
                  <input type="password" name="key" placeholder="${escapeHtml(p.keyHint)}"
                         autocomplete="off" spellcheck="false"
                         style="flex:1;padding:7px 10px;border:1px solid var(--border-strong);border-radius:var(--radius);background:var(--bg-elev);font-family:var(--font-mono);font-size:12.5px;color:var(--fg);outline:none" />
                  <button type="submit" class="btn primary">${icon("check", { size: 13 })} Save</button>
                  <button type="button" class="btn" data-act="remove" data-provider="${escapeHtml(p.id)}">Remove</button>
                </form>
                <div data-key-display="${escapeHtml(p.id)}" style="margin-top:8px;font-size:11.5px;color:var(--fg-faint)"></div>
              </div>
            </div>
          </div>`).join("")}
      </div>

      <div class="form-card" style="margin-top:16px">
        <div class="eyebrow" style="margin-bottom:6px">Privacy</div>
        <div style="font-size:12.5px;color:var(--fg-muted);line-height:1.6">
          Keys are stored in your browser's IndexedDB under <code>prompt-tree</code> → <code>secrets</code>, encrypted with AES-GCM bound to this origin.
          They are <strong>excluded</strong> from <em>Export</em>, <em>Import</em>, and the cross-tab activity broadcast.
          Clearing browser data deletes them — there is no remote copy.
        </div>
      </div>
    </div>
  `;
}

export function bindSettingsView(root) {
  // Status pills
  refreshStatus(root);

  // Save handlers
  for (const p of PROVIDERS) {
    const form = root.querySelector(`form[data-form="${p.id}"]`);
    form?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const value = new FormData(form).get("key");
      try {
        await secrets.setApiKey(p.id, value);
        form.querySelector('input[name="key"]').value = "";
        toast(`Saved ${p.label} key`);
        refreshStatus(root);
      } catch (err) {
        toast("Save failed: " + err.message);
      }
    });
  }

  // Per-row remove
  root.querySelectorAll('[data-act="remove"]').forEach((btn) => {
    btn.addEventListener("click", async () => {
      const p = btn.dataset.provider;
      await secrets.setApiKey(p, "");
      toast("Removed");
      refreshStatus(root);
    });
  });

  // Clear all
  root.querySelector('[data-act="clear-all"]')?.addEventListener("click", async () => {
    if (!confirm("Remove ALL stored API keys from this browser?")) return;
    await secrets.clearAllSecrets();
    toast("All keys cleared");
    refreshStatus(root);
  });
}

async function refreshStatus(root) {
  const status = await secrets.statusAll();
  for (const p of PROVIDERS) {
    const dot = root.querySelector(`[data-status="${p.id}"]`);
    const display = root.querySelector(`[data-key-display="${p.id}"]`);
    if (!dot) continue;
    if (status[p.id]) {
      dot.style.background = "var(--green-50)";
      dot.style.borderColor = "var(--green-200)";
      dot.style.color = "var(--green-700)";
      dot.textContent = "configured";
      const key = await secrets.getApiKey(p.id);
      if (display) display.textContent = `Stored: ${secrets.redact(key)}`;
    } else {
      dot.style.background = "var(--bg-sunk)";
      dot.style.borderColor = "var(--border-soft)";
      dot.style.color = "var(--fg-muted)";
      dot.textContent = "not set";
      if (display) display.textContent = "";
    }
  }
}
