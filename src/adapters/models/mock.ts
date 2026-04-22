import { createHash } from "node:crypto";
import type { ModelAdapter, ModelCallRequest, ModelCallResult } from "./types";

// Deterministic mock provider. Produces reproducible outputs from the
// prompt + modelId + temperature, so the entire product loop can be
// exercised without an API key. Used by default in dev and tests.

function seededPick<T>(seed: string, items: ReadonlyArray<T>): T {
  const h = createHash("sha256").update(seed).digest();
  const idx = h.readUInt32BE(0) % items.length;
  return items[idx]!;
}

const FLAVORS = [
  "Here is a concise response based on the rendered prompt.",
  "Understood. Producing a structured answer now.",
  "Mock reply: analyzed inputs and returning a synthesized response.",
  "(mock) A deterministic echo of the request, expanded into a short paragraph.",
];

export const mockModelAdapter: ModelAdapter = {
  provider: "mock",
  async call(req: ModelCallRequest): Promise<ModelCallResult> {
    const start = Date.now();
    const seed = `${req.modelId}|${req.temperature}|${req.prompt.slice(0, 2048)}`;
    const flavor = seededPick(seed, FLAVORS);
    const fingerprint = createHash("sha256").update(seed).digest("hex").slice(0, 12);
    const body = [
      flavor,
      "",
      `[mock model=${req.modelId} temp=${req.temperature} maxTokens=${req.maxTokens}]`,
      `[input-fingerprint=${fingerprint}]`,
      "",
      // Echo the first 240 chars of the rendered prompt so eval harnesses
      // have something stable to compare against in tests.
      `>>> ${req.prompt.slice(0, 240)}`,
    ].join("\n");

    // Small random delay-free latency so UI/tests don't wait.
    const latency = (body.length & 31) + 4;
    // touch `start` so it's not dropped — keeps call-site shape stable if a
    // future revision measures real elapsed time.
    const measured = Date.now() - start;
    return {
      rawOutput: body,
      inputTokens: Math.ceil(req.prompt.length / 4),
      outputTokens: Math.ceil(body.length / 4),
      latencyMs: latency > 0 ? latency : measured,
      costEstimate: 0,
    };
  },
};
