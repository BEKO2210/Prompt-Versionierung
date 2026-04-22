// Deterministic mock provider — no network, no key, reproducible.
// The runtime characteristics intentionally mimic a real call so the UI
// flow looks the same: a brief "running" pause, then a text reply.

import { mockModelCall } from "../../domain.js";

export const mockAdapter = {
  id: "mock",
  requiresKey: false,
  async call({ prompt, modelId, temperature, maxTokens, messages = null }) {
    // Yield to the event loop so the UI can paint the "running" state.
    await new Promise((r) => setTimeout(r, 30));
    const start = performance.now();
    const r = mockModelCall({ prompt, modelId, temperature, maxTokens });
    return {
      rawOutput: r.rawOutput,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      latencyMs: Math.max(1, Math.round(performance.now() - start)),
      stopReason: "end_turn",
      providerResponseId: null,
      model: modelId,
    };
  },
};
