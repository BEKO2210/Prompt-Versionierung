// Token + cost helpers built on top of the vendored js-tiktoken.
//
// js-tiktoken is OpenAI-specific; for Anthropic/Gemini we fall back to a
// chars/4 estimator. Either way the result is annotated with `method`
// so the UI can label estimates as "≈" rather than "exact".

import { countTokens, estimateTokens } from "./vendor.js";
import { costFor, priceOf } from "./pricing.js";

// Cache by (modelId|text). Texts are short for prompts; identity by
// reference would be ideal but reference instability is the norm in
// reactive UIs. We hash by length+first/last chars to keep the cache
// key tiny without paying for a real digest.
const _cache = new Map();
const CACHE_MAX = 200;

function cacheKey(text, modelId) {
  if (!text) return `${modelId}|0|`;
  const n = text.length;
  const head = text.slice(0, 24).replace(/\s/g, "·");
  const tail = text.slice(-24).replace(/\s/g, "·");
  return `${modelId}|${n}|${head}|${tail}`;
}

function trimCache() {
  if (_cache.size <= CACHE_MAX) return;
  // Drop the oldest 25% — Map preserves insertion order.
  const drop = Math.floor(_cache.size * 0.25);
  let i = 0;
  for (const k of _cache.keys()) {
    _cache.delete(k);
    if (++i >= drop) break;
  }
}

// Async accurate count when the model uses tiktoken; estimator otherwise.
export async function tokensFor(text, modelId) {
  if (!text) return { tokens: 0, method: "estimate" };
  const k = cacheKey(text, modelId);
  if (_cache.has(k)) return _cache.get(k);
  const r = await countTokens(text, modelId);
  _cache.set(k, r);
  trimCache();
  return r;
}

// Synchronous cheap estimator for first-paint UI ("loading…" alternative).
export function tokensForSync(text) {
  return { tokens: estimateTokens(text), method: "estimate" };
}

// USD formatter that matches engineering instinct: tiny costs render in
// scientific shorthand, normal costs in 2 decimals, big costs in dollars.
export function formatCost(usd) {
  if (usd == null) return "—";
  if (usd === 0) return "$0";
  if (usd < 0.0001) return "<$0.0001";
  if (usd < 0.01)   return `$${usd.toFixed(4)}`;
  if (usd < 1)      return `$${usd.toFixed(3)}`;
  if (usd < 100)    return `$${usd.toFixed(2)}`;
  return `$${Math.round(usd)}`;
}

// One-shot cost: compute price for a (provider, modelId, inputTokens, outputTokens).
export function priceLine({ provider, modelId, inputTokens, outputTokens }) {
  const c = costFor({ provider, modelId, inputTokens, outputTokens });
  const p = priceOf(provider, modelId);
  return {
    total: c.total,
    formatted: formatCost(c.total),
    breakdown: {
      input: { tokens: inputTokens || 0,  cost: c.in,  rate: p.in },
      output:{ tokens: outputTokens || 0, cost: c.out, rate: p.out },
    },
    rateSource: p.source,           // "exact" | "family" | "default" | "zero"
  };
}
