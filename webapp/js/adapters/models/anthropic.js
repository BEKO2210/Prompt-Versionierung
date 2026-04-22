// Anthropic Messages API adapter — real network call from the browser.
//
// CORS: enabled via the `anthropic-dangerous-direct-browser-access: true`
// request header. See https://docs.anthropic.com/en/api/messages.
//
// This is BYO-key. The key is read from the secrets store on each call
// (no in-memory caching, so revoking via Settings takes immediate effect
// on the next run).

import { getApiKey } from "../../secrets.js";
import { ProviderError, MissingKeyError } from "./types.js";

const ENDPOINT = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

// Fallback when a profile says provider=anthropic but doesn't pin a model.
const DEFAULT_MODEL = "claude-sonnet-4-6";

// Translate our generic messages array into Anthropic's `system` + `messages`
// shape. We pull the first system turn (if any) into the top-level `system`
// field and pass the remaining turns through, joining adjacent same-role
// turns to satisfy Anthropic's strict turn-taking rule.
function shape(req) {
  const sys = [];
  const turns = [];
  const src = (req.messages && req.messages.length)
    ? req.messages
    : [{ role: "user", content: req.prompt }];

  for (const m of src) {
    if (m.role === "system") { sys.push(m.content); continue; }
    const role = (m.role === "assistant") ? "assistant" : "user";
    const last = turns[turns.length - 1];
    if (last && last.role === role) {
      last.content += "\n\n" + (m.content || "");
    } else {
      turns.push({ role, content: m.content || "" });
    }
  }
  // Anthropic requires at least one user turn — promote when missing.
  if (!turns.some((t) => t.role === "user")) {
    turns.unshift({ role: "user", content: req.prompt || "" });
  }
  // Anthropic requires turns to start with `user`.
  if (turns[0].role !== "user") {
    turns.unshift({ role: "user", content: "" });
  }

  return {
    model: req.modelId || DEFAULT_MODEL,
    max_tokens: req.maxTokens ?? 1024,
    temperature: req.temperature ?? 0.7,
    system: sys.length ? sys.join("\n\n") : undefined,
    messages: turns,
  };
}

// Map an HTTP error response into a typed ProviderError.
async function toError(res) {
  let body = null;
  try { body = await res.json(); } catch { /* not JSON */ }
  const apiMsg = body?.error?.message || body?.message || res.statusText;
  const status = res.status;
  const retryable = status === 429 || status >= 500;
  const code = body?.error?.type || `http_${status}`;
  if (status === 401 || status === 403) {
    return new ProviderError(`Anthropic rejected the API key (${status}). ${apiMsg}`,
      { status, retryable: false, code });
  }
  if (status === 429) {
    return new ProviderError(`Anthropic rate-limited the request. ${apiMsg}`,
      { status, retryable: true, code });
  }
  if (status >= 500) {
    return new ProviderError(`Anthropic service error (${status}). ${apiMsg}`,
      { status, retryable: true, code });
  }
  return new ProviderError(`Anthropic error ${status}: ${apiMsg}`,
    { status, retryable: false, code });
}

export const anthropicAdapter = {
  id: "anthropic",
  requiresKey: true,

  async call(req) {
    const key = await getApiKey("anthropic");
    if (!key) throw new MissingKeyError("anthropic");

    const body = shape(req);
    const start = performance.now();

    let res;
    try {
      res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": key,
          "anthropic-version": ANTHROPIC_VERSION,
          // The header that says: "yes, I know I'm in a browser."
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new ProviderError(`Network error reaching Anthropic: ${err.message}`,
        { status: null, retryable: true, code: "network" });
    }

    if (!res.ok) throw await toError(res);

    let data;
    try { data = await res.json(); }
    catch (err) {
      throw new ProviderError(`Anthropic returned invalid JSON: ${err.message}`,
        { status: res.status, retryable: false, code: "bad_response" });
    }

    // Concatenate text blocks (the typical case is exactly one text block).
    const text = (data.content || [])
      .filter((c) => c.type === "text")
      .map((c) => c.text || "")
      .join("");

    return {
      rawOutput: text,
      inputTokens:  data?.usage?.input_tokens  ?? null,
      outputTokens: data?.usage?.output_tokens ?? null,
      latencyMs: Math.max(1, Math.round(performance.now() - start)),
      stopReason: data?.stop_reason ?? null,
      providerResponseId: data?.id ?? null,
      model: data?.model || body.model,
    };
  },
};
