// Per-model pricing in USD per 1M tokens (input, output).
//
// These rates are illustrative and meant for in-app cost prediction —
// they reflect public list prices around April 2026. They are NOT a
// substitute for your provider's invoice. Override locally if you have
// a contracted price.
//
// Resolution order in priceOf():
//   1. exact modelId match
//   2. longest-prefix family match within the same provider
//   3. provider's "default" entry
//   4. zero-cost fallback (so the UI can still render)

export const PRICING = {
  anthropic: {
    default:               { in: 3.00,  out: 15.00 },  // sonnet-tier baseline
    "claude-haiku":        { in: 0.80,  out: 4.00 },
    "claude-sonnet":       { in: 3.00,  out: 15.00 },
    "claude-opus":         { in: 15.00, out: 75.00 },
  },
  openai: {
    default:               { in: 2.50,  out: 10.00 },  // gpt-4o-tier baseline
    "gpt-4o-mini":         { in: 0.15,  out: 0.60 },
    "gpt-4o":              { in: 2.50,  out: 10.00 },
    "gpt-4.1":             { in: 2.00,  out: 8.00 },
    "gpt-4.1-mini":        { in: 0.15,  out: 0.60 },
    "gpt-4.1-nano":        { in: 0.10,  out: 0.40 },
    "o1":                  { in: 15.00, out: 60.00 },
    "o1-mini":             { in: 1.10,  out: 4.40 },
    "o3":                  { in: 10.00, out: 40.00 },
    "o3-mini":             { in: 1.10,  out: 4.40 },
    "o4-mini":             { in: 1.10,  out: 4.40 },
  },
  google: {
    default:               { in: 0.075, out: 0.30 },   // flash baseline
    "gemini-2.5-flash":    { in: 0.075, out: 0.30 },
    "gemini-2.5-pro":      { in: 1.25,  out: 5.00 },
    "gemini-2.0-flash":    { in: 0.10,  out: 0.40 },
    "gemini-1.5-pro":      { in: 1.25,  out: 5.00 },
    "gemini-1.5-flash":    { in: 0.075, out: 0.30 },
  },
  mock: {
    default: { in: 0, out: 0 },
  },
};

// Look up the rate for a (provider, modelId) pair. Returns
// { in, out, source } where `source` is "exact" | "family" | "default" |
// "zero".  `in`/`out` are USD per 1M tokens.
export function priceOf(provider, modelId) {
  const table = PRICING[provider];
  if (!table) return { in: 0, out: 0, source: "zero" };
  const m = (modelId || "").toLowerCase().trim();
  if (table[m]) return { ...table[m], source: "exact" };
  // Longest-prefix match: walk through the keys and pick the one that
  // matches the most leading characters.
  let best = null;
  for (const k of Object.keys(table)) {
    if (k === "default") continue;
    if (m.startsWith(k) && (!best || k.length > best.length)) best = k;
  }
  if (best) return { ...table[best], source: "family" };
  if (table.default) return { ...table.default, source: "default" };
  return { in: 0, out: 0, source: "zero" };
}

// Convenience: cost in USD for a given run shape.
//   inputTokens, outputTokens may be null → contribute 0.
export function costFor({ provider, modelId, inputTokens, outputTokens }) {
  const p = priceOf(provider, modelId);
  const inCost  = ((inputTokens  || 0) / 1_000_000) * p.in;
  const outCost = ((outputTokens || 0) / 1_000_000) * p.out;
  return { total: inCost + outCost, in: inCost, out: outCost, rate: p };
}
