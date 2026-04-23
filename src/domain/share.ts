// Share slices — the minimum portable bundle needed to render a prompt at
// one version in a read-only surface (the public share link).
//
// The full workspace state is *not* shareable: it carries unrelated
// projects, run history, secrets, activity, proposals. A share slice is
// narrow on purpose: one prompt, one target version, its ancestor chain,
// the branches that chain walks through, and the project + prompt
// metadata the viewer needs to make sense of it.
//
// Pure module — no DOM, no IDB, no fetch. The codec (base64url + gzip
// via `CompressionStream`) lives in `webapp/js/share.js`; this file
// handles the pack/validate shape so both the Next.js app and the
// offline webapp mirror can use it.
//
// `validateShare` treats its input as *untrusted* — a share payload rides
// in a URL fragment and might be hand-edited. Fields with bad shapes are
// rejected with a typed error; unknown fields are allowed forward-compat.

import { ValidationError } from "./errors";

export interface ShareMessage {
  role: string;
  content: string;
}

export interface ShareVersion {
  id: string;
  number: number;
  parentVersionId: string | null;
  createdOnBranchId: string;
  title: string;
  body: string;
  messages: ShareMessage[] | null;
  status: string;
  contentHash?: string;
  changeSummary?: string;
  rationale?: string;
  author?: string | null;
  createdAt?: number;
}

export interface ShareBranch {
  id: string;
  name: string;
  color?: string;
  headVersionId?: string;
}

export interface ShareSlice {
  format: "prompt-tree-share/1";
  generatedAt: number;
  project: { slug: string; name: string };
  prompt: {
    slug: string;
    name: string;
    description?: string;
    purpose?: string;
    readme?: string;
  };
  targetVersionId: string;
  canonicalBranchId?: string;
  branches: ShareBranch[];
  versions: ShareVersion[];
}

interface ProjectLike {
  slug: string;
  name: string;
  prompts: PromptLike[];
}

interface PromptLike {
  slug: string;
  name: string;
  description?: string;
  purpose?: string;
  readme?: string;
  canonicalBranchId?: string;
  branches: ShareBranch[];
  versions: ShareVersion[];
}

/** Walk parent pointers from `targetId` up to the root. Stops on missing
 *  or cyclic parents. Returns root-first order so the tree renders
 *  top-down. */
export function ancestorChain(
  versions: readonly ShareVersion[],
  targetId: string,
): ShareVersion[] {
  const byId = new Map(versions.map((v) => [v.id, v]));
  const chain: ShareVersion[] = [];
  const seen = new Set<string>();
  let id: string | null = targetId;
  while (id) {
    if (seen.has(id)) break;      // cycle guard — malformed input
    seen.add(id);
    const v = byId.get(id);
    if (!v) break;
    chain.push(v);
    id = v.parentVersionId;
  }
  return chain.reverse();
}

/** Build a slice from live workspace objects. Throws if the target
 *  version isn't part of the prompt. */
export function packShare(args: {
  project: ProjectLike;
  prompt: PromptLike;
  versionId: string;
  now?: number;
}): ShareSlice {
  const { project, prompt, versionId, now = Date.now() } = args;
  if (!prompt.versions.some((v) => v.id === versionId)) {
    throw new ValidationError("Target version is not on this prompt");
  }
  const versions = ancestorChain(prompt.versions, versionId);
  if (!versions.length) {
    throw new ValidationError("Target version could not be resolved");
  }
  // Keep only the branches referenced by the chain. Tree rendering and
  // the canonical glyph only need those.
  const branchIds = new Set(versions.map((v) => v.createdOnBranchId));
  const branches = prompt.branches
    .filter((b) => branchIds.has(b.id))
    .map(({ id, name, color, headVersionId }) => ({ id, name, color, headVersionId }));
  return {
    format: "prompt-tree-share/1",
    generatedAt: now,
    project: { slug: project.slug, name: project.name },
    prompt: {
      slug: prompt.slug,
      name: prompt.name,
      ...(prompt.description ? { description: prompt.description } : {}),
      ...(prompt.purpose ? { purpose: prompt.purpose } : {}),
      ...(prompt.readme ? { readme: prompt.readme } : {}),
    },
    targetVersionId: versionId,
    ...(prompt.canonicalBranchId ? { canonicalBranchId: prompt.canonicalBranchId } : {}),
    branches,
    versions: versions.map(normaliseVersion),
  };
}

function normaliseVersion(v: ShareVersion): ShareVersion {
  return {
    id: v.id,
    number: v.number,
    parentVersionId: v.parentVersionId ?? null,
    createdOnBranchId: v.createdOnBranchId,
    title: v.title,
    body: v.body,
    messages: v.messages ?? null,
    status: v.status,
    ...(v.contentHash ? { contentHash: v.contentHash } : {}),
    ...(v.changeSummary ? { changeSummary: v.changeSummary } : {}),
    ...(v.rationale ? { rationale: v.rationale } : {}),
    ...(v.author !== undefined ? { author: v.author } : {}),
    ...(v.createdAt !== undefined ? { createdAt: v.createdAt } : {}),
  };
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}
function isString(x: unknown): x is string {
  return typeof x === "string";
}

/** Validate an untrusted payload and return it typed. Unknown extra
 *  fields are kept (forward compat); unknown required fields are
 *  rejected with ValidationError. */
export function validateShare(raw: unknown): ShareSlice {
  if (!isObject(raw)) throw new ValidationError("Share payload is not an object");
  if (raw.format !== "prompt-tree-share/1") {
    throw new ValidationError(`Unsupported share format: ${String(raw.format)}`);
  }
  if (typeof raw.generatedAt !== "number" || !Number.isFinite(raw.generatedAt)) {
    throw new ValidationError("Share payload is missing generatedAt");
  }
  if (!isObject(raw.project) || !isString(raw.project.slug) || !isString(raw.project.name)) {
    throw new ValidationError("Share payload has malformed project metadata");
  }
  if (!isObject(raw.prompt) || !isString(raw.prompt.slug) || !isString(raw.prompt.name)) {
    throw new ValidationError("Share payload has malformed prompt metadata");
  }
  if (!isString(raw.targetVersionId)) {
    throw new ValidationError("Share payload is missing targetVersionId");
  }
  if (!Array.isArray(raw.branches)) {
    throw new ValidationError("Share payload is missing branches array");
  }
  if (!Array.isArray(raw.versions) || raw.versions.length === 0) {
    throw new ValidationError("Share payload must include at least one version");
  }
  const versions = raw.versions.map(validateVersion);
  if (!versions.some((v) => v.id === raw.targetVersionId)) {
    throw new ValidationError("Share payload targetVersionId is not included in versions");
  }
  const branches = raw.branches.map(validateBranch);
  return {
    format: "prompt-tree-share/1",
    generatedAt: raw.generatedAt,
    project: { slug: raw.project.slug, name: raw.project.name },
    prompt: {
      slug: raw.prompt.slug,
      name: raw.prompt.name,
      ...(isString(raw.prompt.description) ? { description: raw.prompt.description } : {}),
      ...(isString(raw.prompt.purpose) ? { purpose: raw.prompt.purpose } : {}),
      ...(isString(raw.prompt.readme) ? { readme: raw.prompt.readme } : {}),
    },
    targetVersionId: raw.targetVersionId,
    ...(isString(raw.canonicalBranchId) ? { canonicalBranchId: raw.canonicalBranchId } : {}),
    branches,
    versions,
  };
}

function validateBranch(raw: unknown): ShareBranch {
  if (!isObject(raw) || !isString(raw.id) || !isString(raw.name)) {
    throw new ValidationError("Share payload has malformed branch entry");
  }
  return {
    id: raw.id,
    name: raw.name,
    ...(isString(raw.color) ? { color: raw.color } : {}),
    ...(isString(raw.headVersionId) ? { headVersionId: raw.headVersionId } : {}),
  };
}

function validateVersion(raw: unknown): ShareVersion {
  if (!isObject(raw)) throw new ValidationError("Share payload has malformed version entry");
  if (!isString(raw.id) || typeof raw.number !== "number" || !isString(raw.title) ||
      !isString(raw.body) || !isString(raw.createdOnBranchId) || !isString(raw.status)) {
    throw new ValidationError("Share payload has malformed version entry");
  }
  const parent = raw.parentVersionId;
  if (parent !== null && parent !== undefined && !isString(parent)) {
    throw new ValidationError("Share payload has malformed parentVersionId");
  }
  let messages: ShareMessage[] | null = null;
  if (Array.isArray(raw.messages)) {
    messages = raw.messages.map((m) => {
      if (!isObject(m) || !isString(m.role) || !isString(m.content)) {
        throw new ValidationError("Share payload has malformed message");
      }
      return { role: m.role, content: m.content };
    });
  }
  return {
    id: raw.id,
    number: raw.number,
    parentVersionId: (parent as string | null | undefined) ?? null,
    createdOnBranchId: raw.createdOnBranchId,
    title: raw.title,
    body: raw.body,
    messages,
    status: raw.status,
    ...(isString(raw.contentHash) ? { contentHash: raw.contentHash } : {}),
    ...(isString(raw.changeSummary) ? { changeSummary: raw.changeSummary } : {}),
    ...(isString(raw.rationale) ? { rationale: raw.rationale } : {}),
    ...(raw.author === null || isString(raw.author) ? { author: raw.author as string | null } : {}),
    ...(typeof raw.createdAt === "number" && Number.isFinite(raw.createdAt) ? { createdAt: raw.createdAt } : {}),
  };
}
