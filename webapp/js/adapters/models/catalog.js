// Mirror of `src/domain/modelCatalog.ts`. Two jobs:
//   1. Drive the Models-view provider + model dropdowns with a curated
//      list (so users don't have to remember "gpt-5" vs "gpt-5-mini").
//   2. Give the OpenAI adapter a deterministic, testable decision for
//      whether to send `max_tokens` (legacy) or `max_completion_tokens`
//      (modern) — the fix for the user-reported 400 on newer models.
//
// Pure — no DOM, no fetch.

/** @typedef {"mock"|"openai"|"anthropic"|"google"} ProviderId */

export const MODEL_CATALOG = [
  {
    id: "openai",
    label: "OpenAI",
    requiresKey: true,
    models: [
      { id: "gpt-5",        label: "GPT-5",        hint: "latest flagship",         supportsTemperature: true },
      { id: "gpt-5-mini",   label: "GPT-5 mini",   hint: "cheap + fast",            supportsTemperature: true },
      { id: "gpt-4.1",      label: "GPT-4.1",      hint: "previous flagship",       supportsTemperature: true },
      { id: "gpt-4.1-mini", label: "GPT-4.1 mini", hint: "cheap + fast",            supportsTemperature: true },
      { id: "gpt-4o",       label: "GPT-4o",       hint: "legacy multimodal",       supportsTemperature: true, legacyMaxTokens: true },
      { id: "gpt-4o-mini",  label: "GPT-4o mini",  hint: "legacy cheap tier",       supportsTemperature: true, legacyMaxTokens: true },
      { id: "o3",           label: "o3",           hint: "reasoning, latest",       supportsTemperature: false },
      { id: "o4-mini",      label: "o4-mini",      hint: "reasoning, fast + cheap", supportsTemperature: false },
      { id: "o1",           label: "o1",           hint: "reasoning, original",     supportsTemperature: false },
    ],
  },
  {
    id: "anthropic",
    label: "Anthropic",
    requiresKey: true,
    models: [
      { id: "claude-opus-4-7",            label: "Claude Opus 4.7",   hint: "latest flagship", supportsTemperature: true },
      { id: "claude-sonnet-4-6",          label: "Claude Sonnet 4.6", hint: "balanced",        supportsTemperature: true },
      { id: "claude-haiku-4-5-20251001",  label: "Claude Haiku 4.5",  hint: "fast + cheap",    supportsTemperature: true },
      { id: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet", hint: "legacy",          supportsTemperature: true },
    ],
  },
  {
    id: "google",
    label: "Google (Gemini)",
    requiresKey: true,
    models: [
      { id: "gemini-2.5-pro",   label: "Gemini 2.5 Pro",   hint: "latest flagship", supportsTemperature: true },
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", hint: "fast + cheap",    supportsTemperature: true },
      { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", hint: "legacy",          supportsTemperature: true },
    ],
  },
  {
    id: "mock",
    label: "Mock (offline, no key)",
    requiresKey: false,
    models: [
      { id: "mock-echo", label: "Mock — echo", hint: "deterministic echo" },
      { id: "mock-json", label: "Mock — JSON", hint: "deterministic JSON stub" },
    ],
  },
];

export function getProvider(id) {
  return MODEL_CATALOG.find((p) => p.id === id);
}
export function defaultModelFor(providerId) {
  return getProvider(providerId)?.models[0];
}
export function findModel(providerId, modelId) {
  const p = getProvider(providerId);
  if (!p) return undefined;
  const needle = (modelId || "").toLowerCase();
  return p.models.find((m) => m.id.toLowerCase() === needle);
}

/** See `openaiParamShape` in src/domain/modelCatalog.ts. */
export function openaiParamShape(modelId) {
  const m = (modelId || "").toLowerCase();
  if (m.startsWith("o1") || m.startsWith("o3") || m.startsWith("o4")) {
    return { maxTokensField: "max_completion_tokens", supportsTemperature: false };
  }
  const entry = findModel("openai", m);
  if (entry) {
    return {
      maxTokensField: entry.legacyMaxTokens ? "max_tokens" : "max_completion_tokens",
      supportsTemperature: entry.supportsTemperature !== false,
    };
  }
  if (m.startsWith("gpt-3.5")) return { maxTokensField: "max_tokens", supportsTemperature: true };
  if (/^gpt-4($|-)/.test(m))   return { maxTokensField: "max_tokens", supportsTemperature: true };
  if (m === "gpt-4o" || m === "gpt-4o-mini" || m.startsWith("gpt-4o-2024")) {
    return { maxTokensField: "max_tokens", supportsTemperature: true };
  }
  return { maxTokensField: "max_completion_tokens", supportsTemperature: true };
}
