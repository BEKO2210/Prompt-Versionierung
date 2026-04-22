// domain.js — pure functions: hashing, rendering, diff, lineage, analyzers.
// No DOM, no IDB. Mirrors src/domain in the Next.js app.

// ---------------------------------------------------------------------------
// IDs
// ---------------------------------------------------------------------------
let _seq = 0;
export function newId(prefix = "id") {
  // ULID-ish: time + counter + random (good enough for client-only IDs)
  const t = Date.now().toString(36);
  const c = (_seq++ & 0xffff).toString(36);
  const r = Math.floor(Math.random() * 0xffffff).toString(36);
  return `${prefix}_${t}${c}${r}`;
}
export function shortHash(s, n = 7) { return (s ?? "").slice(0, n); }

// ---------------------------------------------------------------------------
// Slugs
// ---------------------------------------------------------------------------
export function slugify(s) {
  return (s || "")
    .toLowerCase().trim()
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "untitled";
}

// ---------------------------------------------------------------------------
// Content hash — SHA-256 via WebCrypto.
// ---------------------------------------------------------------------------
const SEP = "";
function nfc(s) { return (s ?? "").normalize("NFC"); }
function canonMessages(messages) {
  if (!messages || !messages.length) return "";
  return messages.map((m) => `${nfc(m.role)}${SEP}${nfc(m.content)}`).join(SEP);
}
export async function contentHash({ title, body, messages = null }) {
  const buf = new TextEncoder().encode(
    nfc(title) + SEP + nfc(body) + SEP + canonMessages(messages),
  );
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Synchronous fallback (FNV-1a hex) for places that can't await — used as
// a non-cryptographic dedup hint only. Real contentHash is the SHA-256 above.
export function fastHash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

// ---------------------------------------------------------------------------
// Branch name validation
// ---------------------------------------------------------------------------
const BR_RE = /^[a-z][a-z0-9-]{0,63}$/;
export function validateBranchName(name) {
  if (!name) throw new Error("Branch name is required");
  if (/^head$/i.test(name)) throw new Error("Branch name 'HEAD' is reserved");
  if (!BR_RE.test(name)) throw new Error("Branch name must be lowercase, start with a letter, hyphens allowed");
}
export function suggestRefineBranchName(sourceVersionNumber) {
  const r = Math.floor(Math.random() * 9000 + 1000);
  return `refine-v${sourceVersionNumber}-${r}`;
}

// ---------------------------------------------------------------------------
// Status state machine — mirror of src/domain/status.ts
// ---------------------------------------------------------------------------
export const STATUSES = ["draft","experimental","candidate","approved","deprecated","archived"];
const TRANSITIONS = {
  draft:        ["experimental","candidate","archived"],
  experimental: ["candidate","draft","archived"],
  candidate:    ["approved","experimental","archived"],
  approved:     ["deprecated"],
  deprecated:   ["archived"],
  archived:     [],
};
export function canTransition(from, to) {
  return from === to || (TRANSITIONS[from] || []).includes(to);
}

// ---------------------------------------------------------------------------
// Variable rendering
// ---------------------------------------------------------------------------
const VAR_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

export function extractRefs(body) {
  const out = new Set();
  for (const m of (body || "").matchAll(VAR_RE)) out.add(m[1]);
  return [...out];
}
export function findUndeclared(body, decls) {
  const declared = new Set((decls || []).map((d) => d.name));
  return extractRefs(body).filter((r) => !declared.has(r));
}
export function render(body, decls, bindings) {
  const undecl = findUndeclared(body, decls);
  if (undecl.length) throw new Error(`Undeclared variable(s): ${undecl.join(", ")}`);
  const map = new Map((decls || []).map((d) => [d.name, d]));
  return body.replace(VAR_RE, (_m, name) => {
    const decl = map.get(name);
    let v = bindings ? bindings[name] : undefined;
    if (v === undefined || v === null) v = decl?.defaultValue ?? "";
    if (decl?.type === "json" && typeof v !== "string") v = JSON.stringify(v);
    return String(v);
  });
}

// ---------------------------------------------------------------------------
// Diff — line-level LCS with word-level highlight on modified pairs.
// ---------------------------------------------------------------------------
function lcs(a, b, eq) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Int32Array(n + 1));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (eq(a[i - 1], b[j - 1])) dp[i][j] = dp[i - 1][j - 1] + 1;
      else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp;
}
function backtrack(dp, a, b, eq) {
  const ops = []; let i = a.length, j = b.length;
  while (i > 0 && j > 0) {
    if (eq(a[i - 1], b[j - 1])) { ops.push({ op: "equal", ai: i-1, bi: j-1 }); i--; j--; }
    else if (dp[i-1][j] >= dp[i][j-1]) { ops.push({ op: "removed", ai: i-1 }); i--; }
    else { ops.push({ op: "added", bi: j-1 }); j--; }
  }
  while (i > 0) { ops.push({ op: "removed", ai: i-1 }); i--; }
  while (j > 0) { ops.push({ op: "added", bi: j-1 }); j--; }
  ops.reverse(); return ops;
}
function tokenize(s) { return s.match(/\w+|\s+|[^\w\s]/g) || []; }
function wordDiff(left, right) {
  const la = tokenize(left), rb = tokenize(right);
  const dp = lcs(la, rb, (x, y) => x === y);
  const ops = backtrack(dp, la, rb, (x, y) => x === y);
  const out = [];
  for (const o of ops) {
    const text = o.op === "added" ? rb[o.bi] : la[o.ai];
    const last = out[out.length - 1];
    if (last && last.op === o.op) last.text += text;
    else out.push({ op: o.op, text });
  }
  return out;
}
export function diffText(left, right) {
  const la = (left ?? "").split(/\r?\n/);
  const rb = (right ?? "").split(/\r?\n/);
  const dp = lcs(la, rb, (x, y) => x === y);
  const ops = backtrack(dp, la, rb, (x, y) => x === y);
  const out = []; const stats = { added: 0, removed: 0, modified: 0, equal: 0 };
  for (let k = 0; k < ops.length; k++) {
    const o = ops[k]; const next = ops[k+1];
    const isPair = (o.op === "removed" && next?.op === "added") || (o.op === "added" && next?.op === "removed");
    if (isPair) {
      const removed = o.op === "removed" ? o : next;
      const added   = o.op === "added"   ? o : next;
      const l = la[removed.ai]; const r = rb[added.bi];
      out.push({ op: "modified", left: l, right: r, leftIndex: removed.ai, rightIndex: added.bi, words: wordDiff(l, r) });
      stats.modified++;
      k++;
    } else if (o.op === "equal") {
      out.push({ op: "equal", left: la[o.ai], right: rb[o.bi], leftIndex: o.ai, rightIndex: o.bi });
      stats.equal++;
    } else if (o.op === "added") {
      out.push({ op: "added", right: rb[o.bi], rightIndex: o.bi });
      stats.added++;
    } else {
      out.push({ op: "removed", left: la[o.ai], leftIndex: o.ai });
      stats.removed++;
    }
  }
  return { lines: out, stats };
}

// ---------------------------------------------------------------------------
// Lineage helpers (tree + ancestors + descendants + LCA + isDescendant)
// ---------------------------------------------------------------------------
export function buildTree(versions) {
  const byId = new Map();
  for (const v of versions) byId.set(v.id, { node: v, children: [] });
  const roots = [];
  for (const v of versions) {
    const wrap = byId.get(v.id);
    if (v.parentVersionId && byId.has(v.parentVersionId)) {
      byId.get(v.parentVersionId).children.push(wrap);
    } else {
      roots.push(wrap);
    }
  }
  const sortRec = (t) => { t.children.sort((a, b) => a.node.number - b.node.number); t.children.forEach(sortRec); };
  roots.sort((a, b) => a.node.number - b.node.number);
  roots.forEach(sortRec);
  return roots;
}
export function ancestors(versions, id) {
  const byId = new Map(versions.map((v) => [v.id, v]));
  const out = []; let cur = byId.get(id);
  while (cur && cur.parentVersionId) {
    const p = byId.get(cur.parentVersionId);
    if (!p) break;
    out.push(p); cur = p;
  }
  return out;
}
export function isDescendant(versions, maybeDescendant, of) {
  if (maybeDescendant === of) return false;
  const byId = new Map(versions.map((v) => [v.id, v]));
  let cur = byId.get(maybeDescendant);
  while (cur?.parentVersionId) {
    if (cur.parentVersionId === of) return true;
    cur = byId.get(cur.parentVersionId);
  }
  return false;
}
// Promotion compatibility (mirror of src/domain/promotion.ts)
export function checkPointerPromotion(versions, canonicalHeadId, target) {
  if (!canonicalHeadId) return { allowedPointer: true, reason: null };
  if (canonicalHeadId === target) return { allowedPointer: true, reason: null };
  if (isDescendant(versions, target, canonicalHeadId)) return { allowedPointer: true, reason: null };
  return {
    allowedPointer: false,
    reason: "Target is not a descendant of the canonical head. Use squashed promotion.",
  };
}

// ---------------------------------------------------------------------------
// Analyzers — same five as the Next.js domain.
// ---------------------------------------------------------------------------
const VAGUE_VERBS = ["handle","process","deal with","manage","support","work with","take care of"];
const HEDGES = ["maybe","perhaps","probably","sort of","kind of","somewhat"];
function findAll(body, needle) {
  const out = []; const lower = body.toLowerCase(); const n = needle.toLowerCase();
  let i = lower.indexOf(n);
  while (i !== -1) {
    const before = lower[i - 1], after = lower[i + n.length];
    if ((!before || /\W/.test(before)) && (!after || /\W/.test(after))) out.push(i);
    i = lower.indexOf(n, i + 1);
  }
  return out;
}
function ambiguity(body) {
  const out = [];
  for (const v of VAGUE_VERBS) for (const pos of findAll(body, v))
    out.push({ code: "ambiguity.vague_verb", severity: "warn", analyzer: "ambiguity",
      detail: `Vague verb "${v}". Specify the exact action ("extract", "summarize", "classify").`, span: [pos, pos+v.length] });
  for (const h of HEDGES) for (const pos of findAll(body, h))
    out.push({ code: "ambiguity.hedge", severity: "info", analyzer: "ambiguity",
      detail: `Hedge "${h}" weakens the instruction.`, span: [pos, pos+h.length] });
  return out;
}
function missingConstraints(body) {
  const out = [];
  const t = body.toLowerCase();
  const mentionsJson = ["json","object","schema","structured"].some((w) => t.includes(w));
  const hasShape = /```/.test(body) || /[{}\[\]]/.test(body) || /\b(schema|shape|fields?)\b/i.test(body);
  if (mentionsJson && !hasShape) out.push({ code: "constraints.missing_schema", severity: "warn", analyzer: "missingConstraints",
    detail: "Mentions JSON but does not describe the shape (fields, types, required keys)." });
  const mentionsList = ["list","bullet","items","array"].some((w) => t.includes(w));
  const hasLen = /\b(at most|no more than|at least|between|exactly)\b/i.test(body) ||
                 /\b\d+\s+(words?|sentences?|items?|bullets?|tokens?|characters?)\b/i.test(body);
  if (mentionsList && !hasLen) out.push({ code: "constraints.missing_length", severity: "info", analyzer: "missingConstraints",
    detail: "Asks for a list but does not bound its length." });
  if (body.length > 400 && !/format|output|respond with|return/i.test(body)) {
    out.push({ code: "constraints.missing_output_format", severity: "info", analyzer: "missingConstraints",
      detail: "Long prompt without an explicit output-format instruction." });
  }
  return out;
}
function unclearRole(body, messages) {
  const text = (messages?.find((m) => m.role === "system")?.content) || body;
  const has = [/\byou are\b/i,/\byour role\b/i,/\bact as\b/i,/\byou will\b/i,/\bas an? [a-z]+\b/i].some((re) => re.test(text));
  if (has || text.length < 80) return [];
  return [{ code: "role.missing", severity: "info", analyzer: "unclearRole",
    detail: "No explicit role framing. Consider opening with 'You are a …'." }];
}
function redundancy(body) {
  const sents = (body.split(/(?<=[.!?])\s+/)).map((s) => s.trim()).filter((s) => s.length > 20);
  const out = [];
  for (let i = 0; i < sents.length; i++) {
    for (let j = i + 1; j < sents.length; j++) {
      const a = sents[i], b = sents[j];
      const ta = new Set((a.toLowerCase().match(/\w+/g) || []));
      const tb = new Set((b.toLowerCase().match(/\w+/g) || []));
      let inter = 0; for (const t of ta) if (tb.has(t)) inter++;
      const union = ta.size + tb.size - inter;
      const sim = union === 0 ? 0 : inter / union;
      if (sim > 0.65) out.push({ code: "redundancy.near_duplicate", severity: "info", analyzer: "redundancy",
        detail: `Near-duplicate (Jaccard=${sim.toFixed(2)}): "${a.slice(0,80)}…" vs "${b.slice(0,80)}…"` });
    }
  }
  return out;
}
function underspecification(body, variables) {
  const out = [];
  for (const v of variables || [])
    if (v.required && !v.description)
      out.push({ code: "underspec.variable_no_description", severity: "info", analyzer: "underspecification",
        detail: `Required variable "${v.name}" has no description.` });
  if (!/\b(if|when|unless)\b/i.test(body))
    out.push({ code: "underspec.no_edge_cases", severity: "info", analyzer: "underspecification",
      detail: "No conditional clauses. Specify behavior for edge cases (missing input, ambiguity, refusal)." });
  return out;
}
const SEV = { error: 0, warn: 1, info: 2 };
export function analyze({ title, body, messages = null, variables = [] }) {
  const all = [
    ...ambiguity(body),
    ...missingConstraints(body),
    ...unclearRole(body, messages),
    ...redundancy(body),
    ...underspecification(body, variables),
  ];
  return all.sort((a, b) => (SEV[a.severity] - SEV[b.severity]) || a.analyzer.localeCompare(b.analyzer));
}

// Heuristic proposal: builds a "proposed body" from findings.
export function propose({ title, body, variables, findings }) {
  let proposed = body; const notes = [];
  if (findings.some((f) => f.code === "role.missing")) {
    proposed = "You are a careful, precise assistant.\n\n" + proposed;
    notes.push("Prepended role framing.");
  }
  if (findings.some((f) => f.code === "constraints.missing_output_format")) {
    proposed = proposed.trimEnd() + "\n\nRespond in plain text. Keep the answer focused and bounded.";
    notes.push("Appended explicit output-format instruction.");
  }
  if (findings.some((f) => f.code === "constraints.missing_schema")) {
    proposed = proposed.trimEnd() +
      "\n\nReturn a JSON object with the following fields: <fields>. Return valid JSON only.";
    notes.push("Added a JSON schema hint (to be filled in by the author).");
  }
  return {
    proposedTitle: title,
    proposedBody: proposed,
    proposedVariables: variables,
    rationale: notes.join(" ") || "No systematic weaknesses detected; suggestion is a no-op placeholder.",
  };
}

// ---------------------------------------------------------------------------
// Mock model "runner" — deterministic, no network.
// ---------------------------------------------------------------------------
const FLAVORS = [
  "Mock model: classified the input deterministically.",
  "Mock reply: a synthetic response derived from the rendered prompt.",
  "(mock) Echo expansion of the request, bounded by a short paragraph.",
  "Mock model: returned a stable answer for the given seed.",
];
function pickSeeded(seed, items) {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return items[(h >>> 0) % items.length];
}
export function mockModelCall({ prompt, modelId, temperature, maxTokens }) {
  const seed = `${modelId}|${temperature}|${prompt.slice(0, 2048)}`;
  const flavor = pickSeeded(seed, FLAVORS);
  const fp = fastHash(seed).slice(0, 10);
  const body = [
    flavor,
    "",
    `[mock model=${modelId} temp=${temperature} maxTokens=${maxTokens}]`,
    `[input-fingerprint=${fp}]`,
    "",
    `>>> ${prompt.slice(0, 240)}`,
  ].join("\n");
  return {
    rawOutput: body,
    inputTokens: Math.ceil(prompt.length / 4),
    outputTokens: Math.ceil(body.length / 4),
    latencyMs: (body.length & 31) + 4,
  };
}

// ---------------------------------------------------------------------------
// Evaluators (regex / contains / exact / schema / similarity)
// ---------------------------------------------------------------------------
export function evaluate(kind, { rawOutput, expectedOutput, expectedKind }) {
  if (kind === "regex") {
    if (!expectedOutput) return { kind: "regex", score: null, passed: null, notes: "no expectation" };
    if (expectedKind === "contains") {
      const passed = rawOutput.includes(expectedOutput);
      return { kind: "regex", score: passed ? 1 : 0, passed, notes: passed ? "contains match" : "missing substring" };
    }
    if (expectedKind === "exact") {
      const passed = rawOutput.trim() === expectedOutput.trim();
      return { kind: "regex", score: passed ? 1 : 0, passed, notes: passed ? "exact match" : "differs" };
    }
    try {
      const re = new RegExp(expectedOutput, "m"); const passed = re.test(rawOutput);
      return { kind: "regex", score: passed ? 1 : 0, passed, notes: passed ? "regex matched" : "regex did not match" };
    } catch (err) { return { kind: "regex", score: 0, passed: false, notes: `invalid regex: ${err.message}` }; }
  }
  if (kind === "schema") {
    let parsed;
    try { parsed = JSON.parse(rawOutput); } catch (e) { return { kind: "schema", score: 0, passed: false, notes: `not JSON: ${e.message}` }; }
    if (!expectedOutput) return { kind: "schema", score: 1, passed: true, notes: "valid JSON" };
    let expected;
    try { expected = JSON.parse(expectedOutput); } catch { return { kind: "schema", score: 0, passed: false, notes: "expected is not JSON" }; }
    const err = shapeMatches(expected, parsed);
    return err
      ? { kind: "schema", score: 0, passed: false, notes: err }
      : { kind: "schema", score: 1, passed: true, notes: "shape matches" };
  }
  if (kind === "similarity") {
    if (!expectedOutput) return { kind: "similarity", score: null, passed: null, notes: "no expectation" };
    const ta = new Set((rawOutput.toLowerCase().match(/\w+/g) || []).filter((t) => t.length > 1));
    const tb = new Set((expectedOutput.toLowerCase().match(/\w+/g) || []).filter((t) => t.length > 1));
    if (!ta.size && !tb.size) return { kind: "similarity", score: 1, passed: true, notes: "both empty" };
    let inter = 0; for (const t of ta) if (tb.has(t)) inter++;
    const union = ta.size + tb.size - inter;
    const score = union === 0 ? 1 : inter / union;
    return { kind: "similarity", score, passed: score >= 0.5, notes: `Jaccard=${score.toFixed(3)}` };
  }
  return { kind, score: null, passed: null, notes: "evaluator not implemented" };
}
function shapeMatches(expected, actual, path = "$") {
  if (expected === null) return actual === null ? null : `${path}: expected null`;
  const te = Array.isArray(expected) ? "array" : typeof expected;
  const ta = Array.isArray(actual) ? "array" : typeof actual;
  if (te !== ta) return `${path}: expected ${te}, got ${ta}`;
  if (te === "object") {
    for (const k of Object.keys(expected)) {
      if (!(k in actual)) return `${path}.${k}: missing`;
      const child = shapeMatches(expected[k], actual[k], `${path}.${k}`);
      if (child) return child;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Blame: per-line attribution.
//
// Walk the parent chain from the root to the target version. At each
// transition, line-diff parent vs child and propagate attribution:
//   equal   → keep parent's attribution
//   added   → attributed to the child (this version introduced the line)
//   modified→ attributed to the child (the line's content is now new)
//   removed → drop (the line is no longer in the child)
//
// Returns an array, one entry per line of the target's body:
//   [{ text, sourceVersionId, sourceVersionNumber }]
//
// Pure. O(n·m) per transition where n,m are the line counts; for typical
// prompt sizes (hundreds of lines, dozens of versions in the chain) this
// is sub-millisecond.
// ---------------------------------------------------------------------------
export function blame(versions, targetVersionId) {
  const byId = new Map(versions.map((v) => [v.id, v]));
  const target = byId.get(targetVersionId);
  if (!target) return [];

  // Build the chain root → … → target.
  const chain = [];
  let cur = target;
  while (cur) {
    chain.unshift(cur);
    if (!cur.parentVersionId) break;
    const parent = byId.get(cur.parentVersionId);
    if (!parent || parent === cur) break; // defensive
    cur = parent;
  }

  // Initialize from the root: every line is attributed to the root version.
  const rootLines = (chain[0].body || "").split(/\r?\n/);
  let lines = rootLines.map((text) => ({
    text,
    sourceVersionId: chain[0].id,
    sourceVersionNumber: chain[0].number,
  }));

  // Walk transitions, propagating attribution.
  for (let i = 1; i < chain.length; i++) {
    const parent = chain[i - 1];
    const child  = chain[i];
    const d = diffText(parent.body || "", child.body || "");
    const next = [];
    for (const op of d.lines) {
      if (op.op === "equal") {
        const inherited = (op.leftIndex != null && lines[op.leftIndex])
          ? lines[op.leftIndex]
          : { sourceVersionId: child.id, sourceVersionNumber: child.number };
        next.push({
          text: op.right ?? op.left ?? "",
          sourceVersionId: inherited.sourceVersionId,
          sourceVersionNumber: inherited.sourceVersionNumber,
        });
      } else if (op.op === "added") {
        next.push({
          text: op.right ?? "",
          sourceVersionId: child.id,
          sourceVersionNumber: child.number,
        });
      } else if (op.op === "modified") {
        next.push({
          text: op.right ?? "",
          sourceVersionId: child.id,
          sourceVersionNumber: child.number,
        });
      }
      // op.op === "removed" → drop it; the child no longer has this line
    }
    lines = next;
  }

  return lines;
}

// ---------------------------------------------------------------------------
// A/B statistics: Wilson score + Newcombe's method 10 for the CI of a
// difference in two binomial proportions. Mirror of src/domain/stats.ts
// for use inside the offline webapp.
//
// Why Wilson: normal (Wald) intervals lie for small n and near p∈{0,1}.
// Why Newcombe 10: the standard Wilson-based CI for (p_B − p_A) on
// unpaired proportions (Newcombe 1998, Stat Med 17). Closed-form, well-
// calibrated, composes from two per-side Wilson intervals.
// ---------------------------------------------------------------------------

export function wilsonInterval(successes, n, z = 1.96) {
  if (n <= 0) return { p: NaN, lower: NaN, upper: NaN, n: 0, successes: 0 };
  const k = Math.max(0, Math.min(n, successes));
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return {
    p,
    lower: Math.max(0, center - margin),
    upper: Math.min(1, center + margin),
    n,
    successes: k,
  };
}

export function wilsonDiff(aSuccesses, aN, bSuccesses, bN, z = 1.96) {
  const a = wilsonInterval(aSuccesses, aN, z);
  const b = wilsonInterval(bSuccesses, bN, z);
  if (aN === 0 || bN === 0) {
    return { diff: NaN, lower: NaN, upper: NaN, direction: 0, significant: false, a, b };
  }
  const d = b.p - a.p;
  const lowerPart = Math.sqrt((a.p - a.lower) ** 2 + (b.upper - b.p) ** 2);
  const upperPart = Math.sqrt((a.upper - a.p) ** 2 + (b.p - b.lower) ** 2);
  // Clamp to the theoretical bound [-1, +1]. Significance uses the raw
  // bounds so a narrow win at the edge still registers correctly.
  const rawLower = d - lowerPart;
  const rawUpper = d + upperPart;
  const significant = rawLower > 0 || rawUpper < 0;
  const lower = Math.max(-1, rawLower);
  const upper = Math.min(1, rawUpper);
  const direction = significant ? (d > 0 ? 1 : -1) : 0;
  return { diff: d, lower, upper, direction, significant, a, b };
}

// Given paired per-trial scores in [0,1], count successes (score ≥ threshold)
// per side and run the full A/B analysis. Null scores are ignored on that
// side (missing, not failing).
export function abFromScores(pairs, threshold = 0.5, z = 1.96) {
  let aN = 0, aK = 0, bN = 0, bK = 0;
  for (const p of pairs) {
    if (p.a != null) { aN += 1; if (p.a >= threshold) aK += 1; }
    if (p.b != null) { bN += 1; if (p.b >= threshold) bK += 1; }
  }
  return wilsonDiff(aK, aN, bK, bN, z);
}

// ---------------------------------------------------------------------------
// Approval gate on proposals.
// Pure read-side — mirror of src/domain/approval.ts. Writes live in services.
// ---------------------------------------------------------------------------

// Normalise a possibly-missing threshold. Default 1 — reviewers must still
// act, but a single +1 suffices.
export function approvalsRequired(project) {
  const n = project?.approvalsRequired;
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return 1;
  return Math.floor(n);
}

export function hasApproved(proposal, actorId) {
  if (!actorId) return false;
  return (proposal.approvals || []).some((a) => a.author === actorId);
}

export function approvalStatus(proposal, project, currentActor) {
  const have = (proposal.approvals || []).length;
  const required = approvalsRequired(project);
  const remaining = Math.max(0, required - have);
  const canMerge = have >= required && proposal.status === "open";
  const approvedByCurrent = hasApproved(proposal, currentActor);
  const canApprove = Boolean(
    currentActor &&
    !approvedByCurrent &&
    proposal.status === "open" &&
    proposal.openedBy !== currentActor, // no self-approval
  );
  return { have, required, remaining, canMerge, approvedByCurrent, canApprove };
}
