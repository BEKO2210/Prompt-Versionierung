// Vendor wrappers — single import surface for the third-party libs we
// vendor under webapp/vendor/. Views import from this file, never from
// vendor/ directly, so swapping a library is a one-file change.

import { marked } from "../vendor/marked/marked.esm.js";
import Fuse from "../vendor/fuse/fuse.mjs";

// ---------------------------------------------------------------------------
// Markdown — `marked` configured for our README + proposal description shape.
// We keep it stricter than default: GFM on, breaks off (no surprise <br>),
// and headings get sluggable ids.
// ---------------------------------------------------------------------------
marked.use({
  gfm: true,
  breaks: false,
  pedantic: false,
});

export function md(src) {
  if (!src) return "";
  // marked already escapes HTML; output is wrapped for our `.markdown` styles.
  return `<div class="markdown">${marked.parse(src)}</div>`;
}

// ---------------------------------------------------------------------------
// Fuzzy search — Fuse.js. Build a Fuse instance over a uniform shape:
//   { kind, title, snippet, projectSlug, promptSlug, versionId? }
// Used by the command palette + project search.
// ---------------------------------------------------------------------------
export function buildFuse(items, { keys = ["title", "snippet"], threshold = 0.35 } = {}) {
  return new Fuse(items, {
    keys, threshold,
    ignoreLocation: true,
    useExtendedSearch: true,
    minMatchCharLength: 2,
    includeScore: true,
  });
}

// ---------------------------------------------------------------------------
// Token counting — js-tiktoken. Heavy; lazy-load on first call.
// Anthropic models do NOT use a tiktoken-compatible tokenizer; for those we
// either fall back to a chars/4 estimator or use Anthropic's own
// /messages/count_tokens endpoint (when an API key is configured).
// ---------------------------------------------------------------------------
let _tiktokenCache = new Map();

async function loadEncoding(name) {
  if (_tiktokenCache.has(name)) return _tiktokenCache.get(name);
  const [{ Tiktoken }, ranks] = await Promise.all([
    import("../vendor/tiktoken/lite.js"),
    import(`../vendor/tiktoken/ranks/${name}.js`),
  ]);
  const enc = new Tiktoken(ranks.default || ranks);
  _tiktokenCache.set(name, enc);
  return enc;
}

// Map model id → tiktoken encoding name. Conservative default = cl100k_base.
function encodingForModel(modelId) {
  const m = (modelId || "").toLowerCase();
  if (m.startsWith("gpt-4o") || m.startsWith("gpt-4.1") || m.startsWith("o1") || m.startsWith("o3"))
    return "o200k_base";
  if (m.startsWith("gpt-") || m.startsWith("text-") || m.startsWith("davinci"))
    return "cl100k_base";
  return null;  // unknown / non-tiktoken model
}

// Count tokens for a string against a model. Returns:
//   { tokens, method }   method ∈ "tiktoken" | "estimate"
export async function countTokens(text, modelId) {
  if (!text) return { tokens: 0, method: "estimate" };
  const encName = encodingForModel(modelId);
  if (!encName) {
    // Estimator: ~4 characters per token for English-leaning text.
    return { tokens: Math.ceil(text.length / 4), method: "estimate" };
  }
  try {
    const enc = await loadEncoding(encName);
    return { tokens: enc.encode(text).length, method: "tiktoken" };
  } catch (err) {
    console.warn("Token counting failed, falling back:", err);
    return { tokens: Math.ceil(text.length / 4), method: "estimate" };
  }
}

// Synchronous cheap estimate — never loads tiktoken.
export function estimateTokens(text) {
  return Math.ceil((text || "").length / 4);
}
