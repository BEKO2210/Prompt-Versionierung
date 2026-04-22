// Model adapter contract.
//
// Every provider (mock, anthropic, openai, google, …) exposes the same
// shape so the run service is provider-agnostic.
//
//   ModelAdapter.id          : string                — "mock" | "anthropic" | …
//   ModelAdapter.requiresKey : boolean               — does it need an API key?
//   ModelAdapter.call(req)   : Promise<ModelResult>
//
// ModelCallRequest:
//   { prompt, modelId, temperature, maxTokens, messages?, system? }
// where `messages` is an OpenAI-style array of { role, content } and
// `system` is hoisted out for providers that take it separately
// (Anthropic). If `messages` is omitted, providers wrap `prompt` as a
// single user turn.
//
// ModelResult — uniform envelope, providers normalise into this shape:
//   {
//     rawOutput,           // assistant's text reply
//     inputTokens,         // null if unknown
//     outputTokens,        // null if unknown
//     latencyMs,           // wall-clock ms
//     stopReason,          // provider's stop_reason (passed through)
//     providerResponseId,  // provider's message id (for traceability)
//     model,               // resolved model id (provider may rewrite)
//   }
//
// Providers MAY throw a typed Error; the run service catches and writes
// the message into the run's `error` column.

export class ProviderError extends Error {
  constructor(message, { status, retryable = false, code } = {}) {
    super(message);
    this.name = "ProviderError";
    this.status = status ?? null;
    this.retryable = retryable;
    this.code = code ?? null;
  }
}

export class MissingKeyError extends ProviderError {
  constructor(provider) {
    super(`No API key configured for ${provider}. Open Settings to add one, or pick the mock provider.`,
      { status: 401, retryable: false, code: "missing_key" });
    this.name = "MissingKeyError";
    this.provider = provider;
  }
}
