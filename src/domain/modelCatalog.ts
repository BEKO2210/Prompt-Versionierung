// Curated model catalog (E-extension, post-Phase E hygiene).
//
// Two jobs:
//   1. A per-provider list of known-good models the UI can render as a
//      dropdown so users don't have to remember "gpt-5" vs "gpt-5-mini"
//      vs "claude-opus-4-7".
//   2. A pure decision table for per-model parameter routing — the fix
//      for the user-reported "Unsupported parameter: 'max_tokens' is not
//      supported with this model. Use 'max_completion_tokens' instead."
//      OpenAI's modern models (gpt-4.1, gpt-5, every reasoning model)
//      reject the legacy `max_tokens` field; the *truly*-legacy ones
//      (gpt-3.5, the original gpt-4, gpt-4-turbo, first gpt-4o) still
//      take it. When in doubt we default to the modern key, because
//      OpenAI accepts the modern key on the legacy models too — there's
//      no downside.
//
// Pure module — no DOM, no fetch. The webapp mirror under
// `webapp/js/adapters/models/catalog.js` re-declares the same data so
// the offline bundle never imports from `src/`.

export type ProviderId = "mock" | "openai" | "anthropic" | "google";

export interface ModelEntry {
  /** API-facing model id passed to the provider. */
  id: string;
  /** Human label for the dropdown. */
  label: string;
  /** Short hint shown next to the label. */
  hint?: string;
  /** True when the provider accepts a `temperature` override.
   *  Reasoning models (o1/o3/o4) lock it to 1 and reject overrides. */
  supportsTemperature?: boolean;
  /** True when this model still wants `max_tokens` (legacy). */
  legacyMaxTokens?: boolean;
}

export interface ProviderEntry {
  id: ProviderId;
  label: string;
  requiresKey: boolean;
  models: ModelEntry[];
}

/** Single source of truth. Order matters — the first entry is the
 *  "default pick" the UI selects on profile creation. */
export const MODEL_CATALOG: ProviderEntry[] = [
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

export function getProvider(id: string): ProviderEntry | undefined {
  return MODEL_CATALOG.find((p) => p.id === id);
}

/** First known model for a provider — the dropdown default. */
export function defaultModelFor(providerId: string): ModelEntry | undefined {
  return getProvider(providerId)?.models[0];
}

/** Case-insensitive lookup of a model entry. Returns `undefined` when
 *  the caller passes a custom id not in the catalog. */
export function findModel(providerId: string, modelId: string): ModelEntry | undefined {
  const p = getProvider(providerId);
  if (!p) return undefined;
  const needle = (modelId || "").toLowerCase();
  return p.models.find((m) => m.id.toLowerCase() === needle);
}

/** Param-routing decision for OpenAI chat completions. Pure: input the
 *  model id, output which token-budget field to send. The adapter calls
 *  this so the same rule is used by Vitest cases and the live request. */
export function openaiParamShape(modelId: string): {
  maxTokensField: "max_tokens" | "max_completion_tokens";
  supportsTemperature: boolean;
} {
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
  // Heuristic for unknown ids. Defaults to modern — OpenAI accepts the
  // modern key on legacy models too, so this is always safe.
  if (m.startsWith("gpt-3.5")) return { maxTokensField: "max_tokens", supportsTemperature: true };
  if (/^gpt-4($|-)/.test(m))   return { maxTokensField: "max_tokens", supportsTemperature: true };
  if (m === "gpt-4o" || m === "gpt-4o-mini" || m.startsWith("gpt-4o-2024")) {
    return { maxTokensField: "max_tokens", supportsTemperature: true };
  }
  return { maxTokensField: "max_completion_tokens", supportsTemperature: true };
}
