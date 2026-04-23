// Share slice — the minimum portable bundle that recreates one prompt at
// one version in a read-only surface. Mirrors `src/domain/share.ts`.
//
// The codec (base64url + gzip via CompressionStream) lives here too
// because it is strictly browser-side; the pack/validate logic is pure
// and called from both sides.
//
// Threat model: a share payload rides in the URL fragment. It is never
// sent to a server, but it *is* user-editable — any render path must
// treat the decoded slice as untrusted input. `validateShare` rejects
// malformed shapes; the view escapes every string through `escapeHtml`.
//
// The link is stable: `prompt-tree-share/1` is a versioned envelope, and
// older clients that don't recognise a future bump get an "unsupported
// share format" error instead of silently garbled output.

export const SHARE_FORMAT = "prompt-tree-share/1";

// ---------------------------------------------------------------------------
// Ancestor chain: parent pointers walked root-first.
// ---------------------------------------------------------------------------
export function ancestorChain(versions, targetId) {
  const byId = new Map(versions.map((v) => [v.id, v]));
  const chain = [];
  const seen = new Set();
  let id = targetId;
  while (id) {
    if (seen.has(id)) break;
    seen.add(id);
    const v = byId.get(id);
    if (!v) break;
    chain.push(v);
    id = v.parentVersionId;
  }
  return chain.reverse();
}

// ---------------------------------------------------------------------------
// Pack / Validate — mirrors src/domain/share.ts exactly.
// ---------------------------------------------------------------------------
export function packShare({ project, prompt, versionId, now = Date.now() }) {
  if (!prompt.versions.some((v) => v.id === versionId)) {
    throw new Error("Target version is not on this prompt");
  }
  const versions = ancestorChain(prompt.versions, versionId);
  if (!versions.length) {
    throw new Error("Target version could not be resolved");
  }
  const branchIds = new Set(versions.map((v) => v.createdOnBranchId));
  const branches = prompt.branches
    .filter((b) => branchIds.has(b.id))
    .map(({ id, name, color, headVersionId }) => ({ id, name, color, headVersionId }));
  return {
    format: SHARE_FORMAT,
    generatedAt: now,
    project: { slug: project.slug, name: project.name },
    prompt: stripEmpty({
      slug: prompt.slug,
      name: prompt.name,
      description: prompt.description || undefined,
      purpose: prompt.purpose || undefined,
      readme: prompt.readme || undefined,
    }),
    targetVersionId: versionId,
    ...(prompt.canonicalBranchId ? { canonicalBranchId: prompt.canonicalBranchId } : {}),
    branches,
    versions: versions.map(normaliseVersion),
  };
}

function stripEmpty(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out;
}

function normaliseVersion(v) {
  return stripEmpty({
    id: v.id,
    number: v.number,
    parentVersionId: v.parentVersionId ?? null,
    createdOnBranchId: v.createdOnBranchId,
    title: v.title,
    body: v.body,
    messages: v.messages ?? null,
    status: v.status,
    contentHash: v.contentHash || undefined,
    changeSummary: v.changeSummary || undefined,
    rationale: v.rationale || undefined,
    author: v.author ?? undefined,
    createdAt: v.createdAt,
  });
}

const isObj  = (x) => typeof x === "object" && x !== null && !Array.isArray(x);
const isStr  = (x) => typeof x === "string";

export function validateShare(raw) {
  if (!isObj(raw)) throw new Error("Share payload is not an object");
  if (raw.format !== SHARE_FORMAT) throw new Error(`Unsupported share format: ${String(raw.format)}`);
  if (typeof raw.generatedAt !== "number" || !Number.isFinite(raw.generatedAt)) {
    throw new Error("Share payload is missing generatedAt");
  }
  if (!isObj(raw.project) || !isStr(raw.project.slug) || !isStr(raw.project.name)) {
    throw new Error("Share payload has malformed project metadata");
  }
  if (!isObj(raw.prompt) || !isStr(raw.prompt.slug) || !isStr(raw.prompt.name)) {
    throw new Error("Share payload has malformed prompt metadata");
  }
  if (!isStr(raw.targetVersionId)) throw new Error("Share payload is missing targetVersionId");
  if (!Array.isArray(raw.branches)) throw new Error("Share payload is missing branches array");
  if (!Array.isArray(raw.versions) || raw.versions.length === 0) {
    throw new Error("Share payload must include at least one version");
  }
  const versions = raw.versions.map(validateVersion);
  if (!versions.some((v) => v.id === raw.targetVersionId)) {
    throw new Error("Share payload targetVersionId is not included in versions");
  }
  const branches = raw.branches.map(validateBranch);
  return {
    format: SHARE_FORMAT,
    generatedAt: raw.generatedAt,
    project: { slug: raw.project.slug, name: raw.project.name },
    prompt: stripEmpty({
      slug: raw.prompt.slug,
      name: raw.prompt.name,
      description: isStr(raw.prompt.description) ? raw.prompt.description : undefined,
      purpose: isStr(raw.prompt.purpose) ? raw.prompt.purpose : undefined,
      readme: isStr(raw.prompt.readme) ? raw.prompt.readme : undefined,
    }),
    targetVersionId: raw.targetVersionId,
    ...(isStr(raw.canonicalBranchId) ? { canonicalBranchId: raw.canonicalBranchId } : {}),
    branches,
    versions,
  };
}

function validateBranch(raw) {
  if (!isObj(raw) || !isStr(raw.id) || !isStr(raw.name)) {
    throw new Error("Share payload has malformed branch entry");
  }
  return stripEmpty({
    id: raw.id,
    name: raw.name,
    color: isStr(raw.color) ? raw.color : undefined,
    headVersionId: isStr(raw.headVersionId) ? raw.headVersionId : undefined,
  });
}

function validateVersion(raw) {
  if (!isObj(raw)) throw new Error("Share payload has malformed version entry");
  if (!isStr(raw.id) || typeof raw.number !== "number" || !isStr(raw.title) ||
      !isStr(raw.body) || !isStr(raw.createdOnBranchId) || !isStr(raw.status)) {
    throw new Error("Share payload has malformed version entry");
  }
  const parent = raw.parentVersionId;
  if (parent !== null && parent !== undefined && !isStr(parent)) {
    throw new Error("Share payload has malformed parentVersionId");
  }
  let messages = null;
  if (Array.isArray(raw.messages)) {
    messages = raw.messages.map((m) => {
      if (!isObj(m) || !isStr(m.role) || !isStr(m.content)) {
        throw new Error("Share payload has malformed message");
      }
      return { role: m.role, content: m.content };
    });
  }
  return stripEmpty({
    id: raw.id,
    number: raw.number,
    parentVersionId: parent ?? null,
    createdOnBranchId: raw.createdOnBranchId,
    title: raw.title,
    body: raw.body,
    messages,
    status: raw.status,
    contentHash: isStr(raw.contentHash) ? raw.contentHash : undefined,
    changeSummary: isStr(raw.changeSummary) ? raw.changeSummary : undefined,
    rationale: isStr(raw.rationale) ? raw.rationale : undefined,
    author: (raw.author === null || isStr(raw.author)) ? raw.author : undefined,
    createdAt: typeof raw.createdAt === "number" && Number.isFinite(raw.createdAt) ? raw.createdAt : undefined,
  });
}

// ---------------------------------------------------------------------------
// Codec: base64url (+ gzip when CompressionStream is available).
//
// Wire format: `<algo>.<base64url>` where algo ∈ { "gz", "raw" }.
// Prefix keeps decoders forward-compatible and readable; if we ever add
// brotli, a "br." prefix slots in without breaking old links.
// ---------------------------------------------------------------------------

const CAN_GZIP = typeof CompressionStream !== "undefined"
  && typeof DecompressionStream !== "undefined";

export async function encodeSlice(slice) {
  const json = JSON.stringify(slice);
  const bytes = new TextEncoder().encode(json);
  if (CAN_GZIP) {
    try {
      const compressed = await gzip(bytes);
      // Only use gzip when it actually wins — a 20-byte payload gzipped
      // is bigger than raw, so compare the post-base64 length.
      const gzB64 = bytesToBase64Url(compressed);
      const rawB64 = bytesToBase64Url(bytes);
      return gzB64.length < rawB64.length ? `gz.${gzB64}` : `raw.${rawB64}`;
    } catch {
      // fall through to raw
    }
  }
  return `raw.${bytesToBase64Url(bytes)}`;
}

export async function decodeSlice(encoded) {
  if (!encoded || typeof encoded !== "string") {
    throw new Error("Share payload is empty");
  }
  const dot = encoded.indexOf(".");
  if (dot < 0) throw new Error("Share payload is missing algorithm prefix");
  const algo = encoded.slice(0, dot);
  const b64  = encoded.slice(dot + 1);
  let bytes  = base64UrlToBytes(b64);
  if (algo === "gz") {
    if (!CAN_GZIP) throw new Error("This browser cannot decode gzipped share links");
    bytes = await gunzip(bytes);
  } else if (algo !== "raw") {
    throw new Error(`Unsupported share compression: ${algo}`);
  }
  const json = new TextDecoder().decode(bytes);
  let obj;
  try { obj = JSON.parse(json); }
  catch { throw new Error("Share payload is not valid JSON"); }
  return validateShare(obj);
}

// ---- byte helpers --------------------------------------------------------

function bytesToBase64Url(bytes) {
  // Chunked to avoid "too many arguments" on big arrays.
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(b64url) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function gzip(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}
async function gunzip(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

// ---------------------------------------------------------------------------
// Full one-shot URL builder. Returns an absolute URL anchored at the
// current page — the payload lives in a query parameter inside the hash
// because the router matches on the path part first.
// ---------------------------------------------------------------------------
export async function buildShareUrl(slice, { base = location.href } = {}) {
  const encoded = await encodeSlice(slice);
  const origin = base.split("#")[0];
  return `${origin}#/share?d=${encoded}`;
}
