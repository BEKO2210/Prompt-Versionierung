// OpenAI Chat Completions API adapter — real network call from the browser.
//
// CORS: the OpenAI API allows direct browser requests (it returns
// Access-Control-Allow-Origin: *). The official SDK requires an explicit
// `dangerouslyAllowBrowser: true` opt-in to acknowledge the BYO-key risk
// model — we honour the same intent by reading the key from our local
// secrets store (see secrets.js) and by NEVER letting a key cross the
// service boundary into the activity log or export.

import { getApiKey } from "../../secrets.js";
import { ProviderError, MissingKeyError } from "./types.js";

const ENDPOINT = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-4o-mini";

// o-series reasoning models (o1, o3, o4) do not accept the legacy
// `max_tokens` parameter; they take `max_completion_tokens` instead.
// They also currently ignore `temperature` (always = 1) and may not
// accept `system` role — the safer transformation is to fold any
// system content into the first user turn as a header.
function isReasoningModel(modelId) {
  const m = (modelId || "").toLowerCase();
  return m.startsWith("o1") || m.startsWith("o3") || m.startsWith("o4");
}

// Translate our generic { messages?, prompt } into OpenAI's chat
// completion `messages` array. OpenAI uses the same role names we do
// (system / user / assistant), so the mapping is mostly identity.
function shape(req) {
  const reasoning = isReasoningModel(req.modelId);
  const src = (req.messages && req.messages.length)
    ? req.messages
    : [{ role: "user", content: req.prompt }];

  let messages = src.map((m) => ({
    role: (m.role === "assistant" || m.role === "system" || m.role === "user")
      ? m.role
      : "user",
    content: m.content || "",
  }));

  if (reasoning) {
    // Fold any system messages into a leading user turn header.
    const sys = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const rest = messages.filter((m) => m.role !== "system");
    if (sys) {
      const header = `[Instructions]\n${sys}\n\n[Task]`;
      if (rest[0]?.role === "user") {
        rest[0] = { role: "user", content: `${header}\n${rest[0].content}` };
      } else {
        rest.unshift({ role: "user", content: header });
      }
    }
    messages = rest;
  }
  // Must end on a user turn for chat completion. If the last message is
  // an assistant turn, append an empty user "go ahead".
  if (messages.length === 0 || messages[messages.length - 1].role === "assistant") {
    messages.push({ role: "user", content: "" });
  }

  const body = {
    model: req.modelId || DEFAULT_MODEL,
    messages,
  };
  if (reasoning) {
    body.max_completion_tokens = req.maxTokens ?? 1024;
    // omit `temperature` — o-series ignores it
  } else {
    body.max_tokens = req.maxTokens ?? 1024;
    body.temperature = req.temperature ?? 0.7;
  }
  return body;
}

async function toError(res) {
  let body = null;
  try { body = await res.json(); } catch { /* not JSON */ }
  const apiMsg = body?.error?.message || body?.message || res.statusText;
  const status = res.status;
  const code = body?.error?.code || body?.error?.type || `http_${status}`;
  const retryable = status === 429 || status >= 500;
  if (status === 401 || status === 403) {
    return new ProviderError(`OpenAI rejected the API key (${status}). ${apiMsg}`,
      { status, retryable: false, code });
  }
  if (status === 429) {
    return new ProviderError(`OpenAI rate-limited the request. ${apiMsg}`,
      { status, retryable: true, code });
  }
  if (status === 400) {
    return new ProviderError(`OpenAI rejected the request (400). ${apiMsg}`,
      { status, retryable: false, code });
  }
  if (status >= 500) {
    return new ProviderError(`OpenAI service error (${status}). ${apiMsg}`,
      { status, retryable: true, code });
  }
  return new ProviderError(`OpenAI error ${status}: ${apiMsg}`,
    { status, retryable, code });
}

export const openaiAdapter = {
  id: "openai",
  requiresKey: true,

  async call(req) {
    const key = await getApiKey("openai");
    if (!key) throw new MissingKeyError("openai");

    const body = shape(req);
    const start = performance.now();

    let res;
    try {
      res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "authorization": `Bearer ${key}`,
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new ProviderError(`Network error reaching OpenAI: ${err.message}`,
        { status: null, retryable: true, code: "network" });
    }

    if (!res.ok) throw await toError(res);

    let data;
    try { data = await res.json(); }
    catch (err) {
      throw new ProviderError(`OpenAI returned invalid JSON: ${err.message}`,
        { status: res.status, retryable: false, code: "bad_response" });
    }

    const choice = (data?.choices || [])[0];
    const text = choice?.message?.content || "";

    return {
      rawOutput: text,
      inputTokens:  data?.usage?.prompt_tokens     ?? null,
      outputTokens: data?.usage?.completion_tokens ?? null,
      latencyMs: Math.max(1, Math.round(performance.now() - start)),
      stopReason: choice?.finish_reason ?? null,
      providerResponseId: data?.id ?? null,
      model: data?.model || body.model,
    };
  },
};
