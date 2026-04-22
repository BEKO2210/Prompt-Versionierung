// Model adapter registry.
//
// Resolution rule: pick the adapter matching `provider`. If that adapter
// requires an API key and none is configured, the run service is told to
// fall back to mock — but loudly: the run row is annotated so the user
// can see that "this run was a mock substitute, not your real provider".
//
// Adding a new provider is two steps:
//   1. drop a new file under adapters/models/ exporting an adapter
//   2. add it to ADAPTERS below

import { mockAdapter } from "./mock.js";
import { anthropicAdapter } from "./anthropic.js";
import { openaiAdapter } from "./openai.js";
import { hasApiKey } from "../../secrets.js";

const ADAPTERS = {
  mock: mockAdapter,
  anthropic: anthropicAdapter,
  openai: openaiAdapter,
  // google:  → B1.4
  // custom:  → user-defined endpoint, future
};

export function getAdapter(provider) {
  return ADAPTERS[provider] || null;
}

// Resolve the adapter that should actually be called for a run.
// Returns:
//   { adapter, willMock, reason? }
//     adapter   — the resolved ModelAdapter
//     willMock  — true if we substituted with the mock provider
//     reason    — short string explaining why we mocked, when willMock=true
export async function resolveForRun(provider) {
  const a = getAdapter(provider);
  if (!a) {
    return { adapter: mockAdapter, willMock: true,
             reason: `Unknown provider "${provider}"; using mock.` };
  }
  if (a.requiresKey) {
    const has = await hasApiKey(provider);
    if (!has) {
      return { adapter: mockAdapter, willMock: true,
               reason: `No API key for ${provider}; using mock. Add a key in Settings to use the real provider.` };
    }
  }
  return { adapter: a, willMock: false };
}

// Synchronous "would this profile use the real provider right now?" check
// for the run dialog UI. Reads secrets store async though, so callers
// should await it.
export async function describeProvider(provider) {
  const a = getAdapter(provider);
  if (!a) return { real: false, label: `unknown · ${provider}`, reason: "Unknown provider" };
  if (!a.requiresKey) return { real: true, label: `mock · deterministic`, reason: null };
  const has = await hasApiKey(provider);
  return has
    ? { real: true,  label: `${provider} · real API`, reason: null }
    : { real: false, label: `${provider} · key not set → will mock`, reason: "Add a key in Settings to use the real API." };
}
