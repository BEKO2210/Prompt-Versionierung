// Google Gemini (Generative Language API) adapter — real network call
// from the browser.
//
// CORS: the public Gemini REST endpoint allows direct browser requests.
// Auth: passed via the `x-goog-api-key` request header (preferred over
// the `?key=…` query string so the key never appears in URLs, referrers,
// or DevTools network logs as plain query params).

import { getApiKey } from "../../secrets.js";
import { ProviderError, MissingKeyError } from "./types.js";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-2.5-flash";

// Translate our generic { messages?, prompt } into Gemini's
// { systemInstruction, contents } shape.
//
// Gemini specifics worth knowing:
//   - role names are "user" and "model" (NOT "assistant").
//   - each message uses `parts: [{ text }]` instead of plain string.
//   - system content goes into the top-level `systemInstruction`,
//     not into `contents`.
//   - the conversation must alternate user/model, starting with user.
function shape(req) {
  const sys = [];
  const turns = [];
  const src = (req.messages && req.messages.length)
    ? req.messages
    : [{ role: "user", content: req.prompt }];

  for (const m of src) {
    if (m.role === "system") { sys.push(m.content || ""); continue; }
    const role = (m.role === "assistant" || m.role === "model") ? "model" : "user";
    const text = m.content || "";
    const last = turns[turns.length - 1];
    if (last && last.role === role) {
      // Collapse consecutive same-role turns (Gemini requires alternation).
      const prevText = last.parts?.[0]?.text ?? "";
      last.parts = [{ text: prevText + "\n\n" + text }];
    } else {
      turns.push({ role, parts: [{ text }] });
    }
  }

  // Must start with a user turn.
  if (turns.length === 0 || turns[0].role !== "user") {
    turns.unshift({ role: "user", parts: [{ text: req.prompt || "" }] });
  }
  // Must end on a user turn for generateContent to produce a model reply.
  if (turns[turns.length - 1].role !== "user") {
    turns.push({ role: "user", parts: [{ text: "" }] });
  }

  const body = {
    contents: turns,
    generationConfig: {
      temperature: req.temperature ?? 0.7,
      maxOutputTokens: req.maxTokens ?? 1024,
    },
  };
  if (sys.length) {
    body.systemInstruction = { parts: [{ text: sys.join("\n\n") }] };
  }
  return body;
}

async function toError(res) {
  let body = null;
  try { body = await res.json(); } catch { /* not JSON */ }
  // Gemini errors come as { error: { code, message, status } }
  const apiMsg = body?.error?.message || body?.message || res.statusText;
  const apiStatus = body?.error?.status || null;
  const status = res.status;
  const code = apiStatus || `http_${status}`;
  const retryable = status === 429 || status >= 500;
  if (status === 401 || status === 403 || apiStatus === "PERMISSION_DENIED" || apiStatus === "UNAUTHENTICATED") {
    return new ProviderError(`Gemini rejected the API key (${status}). ${apiMsg}`,
      { status, retryable: false, code });
  }
  if (status === 429 || apiStatus === "RESOURCE_EXHAUSTED") {
    return new ProviderError(`Gemini rate-limited the request. ${apiMsg}`,
      { status, retryable: true, code });
  }
  if (status === 400 || apiStatus === "INVALID_ARGUMENT") {
    return new ProviderError(`Gemini rejected the request (400). ${apiMsg}`,
      { status, retryable: false, code });
  }
  if (status >= 500) {
    return new ProviderError(`Gemini service error (${status}). ${apiMsg}`,
      { status, retryable: true, code });
  }
  return new ProviderError(`Gemini error ${status}: ${apiMsg}`,
    { status, retryable, code });
}

export const geminiAdapter = {
  id: "google",
  requiresKey: true,

  async call(req) {
    const key = await getApiKey("google");
    if (!key) throw new MissingKeyError("google");

    const model = (req.modelId || DEFAULT_MODEL).trim();
    const body = shape(req);
    const start = performance.now();

    let res;
    try {
      res = await fetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": key,
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new ProviderError(`Network error reaching Gemini: ${err.message}`,
        { status: null, retryable: true, code: "network" });
    }

    if (!res.ok) throw await toError(res);

    let data;
    try { data = await res.json(); }
    catch (err) {
      throw new ProviderError(`Gemini returned invalid JSON: ${err.message}`,
        { status: res.status, retryable: false, code: "bad_response" });
    }

    // Gemini may return an empty `candidates` list when the prompt is
    // blocked by safety filters; surface that as a useful error.
    const cands = data?.candidates || [];
    if (cands.length === 0) {
      const blockReason = data?.promptFeedback?.blockReason;
      const safety = blockReason
        ? `Prompt blocked by Gemini safety filter: ${blockReason}`
        : "Gemini returned no candidates";
      throw new ProviderError(safety, { status: 200, retryable: false, code: "no_candidates" });
    }

    const choice = cands[0];
    const text = (choice?.content?.parts || [])
      .map((p) => p?.text || "")
      .join("");

    return {
      rawOutput: text,
      inputTokens:  data?.usageMetadata?.promptTokenCount      ?? null,
      outputTokens: data?.usageMetadata?.candidatesTokenCount  ?? null,
      latencyMs: Math.max(1, Math.round(performance.now() - start)),
      stopReason: choice?.finishReason ?? null,
      providerResponseId: data?.responseId ?? null,
      model: data?.modelVersion || model,
    };
  },
};
