import type { ModelAdapter, ModelCallRequest, ModelCallResult } from "./types";

// Minimal Anthropic adapter using `fetch` against the Messages API. Kept
// dependency-free so it's a zero-install path; a real implementation would
// swap to @anthropic-ai/sdk for streaming, retries, etc.
//
// This adapter is only selected when MODEL_PROVIDER=anthropic and
// ANTHROPIC_API_KEY is set. Otherwise the registry falls back to mock.

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

export const anthropicModelAdapter: ModelAdapter = {
  provider: "anthropic",
  async call(req: ModelCallRequest): Promise<ModelCallResult> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is not set. Set MODEL_PROVIDER=mock or provide the key.");
    }
    const start = Date.now();
    const messages =
      req.messages && req.messages.length > 0
        ? req.messages
        : [{ role: "user" as const, content: req.prompt }];

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: req.modelId,
        max_tokens: req.maxTokens,
        temperature: req.temperature,
        messages: messages
          .filter((m) => m.role !== "system")
          .map((m) => ({ role: m.role, content: m.content })),
        system: messages.find((m) => m.role === "system")?.content,
      }),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`Anthropic error ${resp.status}: ${text}`);
    }
    const json = (await resp.json()) as AnthropicResponse;
    const text = (json.content ?? [])
      .map((c) => (c.type === "text" ? c.text ?? "" : ""))
      .join("");
    return {
      rawOutput: text,
      inputTokens: json.usage?.input_tokens ?? null,
      outputTokens: json.usage?.output_tokens ?? null,
      latencyMs: Date.now() - start,
      costEstimate: null,
    };
  },
};
