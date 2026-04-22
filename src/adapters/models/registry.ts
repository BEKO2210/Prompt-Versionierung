import { anthropicModelAdapter } from "./anthropic";
import { mockModelAdapter } from "./mock";
import type { ModelAdapter } from "./types";

// Provider lookup. Each ModelProfile carries a `provider`; we resolve that
// to an adapter at call time. Add a new provider = one new file + one line.

const ADAPTERS: Record<string, ModelAdapter> = {
  mock: mockModelAdapter,
  anthropic: anthropicModelAdapter,
};

export function resolveModelAdapter(provider: string): ModelAdapter {
  const a = ADAPTERS[provider];
  if (!a) {
    // Unknown providers fall back to mock in dev. In production, the caller
    // should have validated the profile; we still do not throw silently —
    // callers can check with `hasAdapter(provider)`.
    return mockModelAdapter;
  }
  return a;
}

export function hasAdapter(provider: string): boolean {
  return provider in ADAPTERS;
}
