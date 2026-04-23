// Prompt templates — curated starter packs that the user can
// instantiate into a project as a brand-new prompt.
//
// A template is deliberately not a share slice: it has no ancestor
// chain, no project/prompt identity, no runs. It is *only* the thing
// you'd paste into "create prompt". The service-layer wrapper takes
// care of assigning IDs, slugs and the initial branch.
//
// Pure module — validation + instantiation only. The library JSON
// ships under `webapp/data/templates.json` and is fetched at runtime
// by the offline webapp; the Next.js mirror can read it from disk.
//
// `validateTemplate` treats input as *untrusted*: templates could be
// imported from elsewhere in future phases (D3 fork-to-clipboard,
// F5 public profiles). Fields with bad shapes are rejected with a
// typed error; unknown fields pass through for forward-compat.

import { ValidationError } from "./errors";

export interface TemplateVariable {
  name: string;
  type: "string" | "number" | "boolean" | "enum" | "json";
  required: boolean;
  description?: string;
  defaultValue?: unknown;
  enumValues?: string[];
}

export interface TemplateMessage {
  role: string;
  content: string;
}

export interface TemplateTestCase {
  name: string;
  bindings: Record<string, unknown>;
  expectedKind?: string;
  expectedOutput?: string;
}

/** Provenance marker added when a template is produced by forking a
 *  concrete prompt version (D3). Curated library entries omit this;
 *  forks always carry it. Purely descriptive — the import path never
 *  branches on it, so forks and curated templates walk the exact same
 *  codepath once validated. */
export interface TemplateSource {
  projectSlug: string;
  projectName?: string;
  promptSlug: string;
  promptName?: string;
  versionId: string;
  versionNumber: number;
  contentHash?: string;
  forkedAt: number;
  forkedBy?: string | null;
}

export interface PromptTemplate {
  format: "prompt-tree-template/1";
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  author?: string;
  prompt: {
    title: string;
    body: string;
    purpose?: string;
    readme?: string;
    messages?: TemplateMessage[] | null;
    variables?: TemplateVariable[];
  };
  suggestedTestCases?: TemplateTestCase[];
  source?: TemplateSource;
}

export interface TemplateLibrary {
  format: "prompt-tree-template-library/1";
  generatedAt: number;
  version?: string;
  templates: PromptTemplate[];
}

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);
const isStr = (x: unknown): x is string => typeof x === "string";
const isNonEmptyStr = (x: unknown): x is string => isStr(x) && x.trim().length > 0;

const VAR_TYPES = new Set(["string", "number", "boolean", "enum", "json"]);
const TEMPLATE_FORMAT = "prompt-tree-template/1";
const LIBRARY_FORMAT = "prompt-tree-template-library/1";

export function validateTemplate(raw: unknown): PromptTemplate {
  if (!isObj(raw)) throw new ValidationError("Template is not an object");
  if (raw.format !== TEMPLATE_FORMAT) {
    throw new ValidationError(`Unsupported template format: ${String(raw.format)}`);
  }
  if (!isNonEmptyStr(raw.id)) throw new ValidationError("Template is missing id");
  if (!isNonEmptyStr(raw.name)) throw new ValidationError("Template is missing name");
  if (!isNonEmptyStr(raw.description)) throw new ValidationError("Template is missing description");
  if (!isNonEmptyStr(raw.category)) throw new ValidationError("Template is missing category");
  if (!Array.isArray(raw.tags)) throw new ValidationError("Template tags must be an array");
  const tags = raw.tags.filter(isStr);
  if (!isObj(raw.prompt)) throw new ValidationError("Template is missing prompt body");

  const p = raw.prompt;
  if (!isNonEmptyStr(p.title)) throw new ValidationError("Template prompt is missing title");
  if (!isNonEmptyStr(p.body))  throw new ValidationError("Template prompt is missing body");

  let messages: TemplateMessage[] | null = null;
  if (Array.isArray(p.messages)) {
    messages = p.messages.map((m) => {
      if (!isObj(m) || !isStr(m.role) || !isStr(m.content)) {
        throw new ValidationError("Template message is malformed");
      }
      return { role: m.role, content: m.content };
    });
  } else if (p.messages !== undefined && p.messages !== null) {
    throw new ValidationError("Template messages must be an array or null");
  }

  let variables: TemplateVariable[] | undefined;
  if (Array.isArray(p.variables)) {
    variables = p.variables.map(validateVariable);
  } else if (p.variables !== undefined) {
    throw new ValidationError("Template variables must be an array");
  }

  let suggestedTestCases: TemplateTestCase[] | undefined;
  if (Array.isArray(raw.suggestedTestCases)) {
    suggestedTestCases = raw.suggestedTestCases.map(validateTestCase);
  } else if (raw.suggestedTestCases !== undefined) {
    throw new ValidationError("Template suggestedTestCases must be an array");
  }

  let source: TemplateSource | undefined;
  if (raw.source !== undefined && raw.source !== null) {
    source = validateSource(raw.source);
  }

  return {
    format: TEMPLATE_FORMAT,
    id: raw.id,
    name: raw.name,
    description: raw.description,
    category: raw.category,
    tags,
    ...(isStr(raw.author) ? { author: raw.author } : {}),
    prompt: {
      title: p.title,
      body: p.body,
      ...(isStr(p.purpose) ? { purpose: p.purpose } : {}),
      ...(isStr(p.readme) ? { readme: p.readme } : {}),
      ...(messages !== null ? { messages } : { messages: null }),
      ...(variables ? { variables } : {}),
    },
    ...(suggestedTestCases ? { suggestedTestCases } : {}),
    ...(source ? { source } : {}),
  };
}

function validateSource(raw: unknown): TemplateSource {
  if (!isObj(raw)) throw new ValidationError("Template source is malformed");
  if (!isNonEmptyStr(raw.projectSlug)) throw new ValidationError("Template source is missing projectSlug");
  if (!isNonEmptyStr(raw.promptSlug))  throw new ValidationError("Template source is missing promptSlug");
  if (!isNonEmptyStr(raw.versionId))   throw new ValidationError("Template source is missing versionId");
  if (typeof raw.versionNumber !== "number" || !Number.isFinite(raw.versionNumber)) {
    throw new ValidationError("Template source is missing versionNumber");
  }
  if (typeof raw.forkedAt !== "number" || !Number.isFinite(raw.forkedAt)) {
    throw new ValidationError("Template source is missing forkedAt");
  }
  return {
    projectSlug: raw.projectSlug,
    promptSlug: raw.promptSlug,
    versionId: raw.versionId,
    versionNumber: raw.versionNumber,
    forkedAt: raw.forkedAt,
    ...(isStr(raw.projectName) ? { projectName: raw.projectName } : {}),
    ...(isStr(raw.promptName)  ? { promptName: raw.promptName }   : {}),
    ...(isStr(raw.contentHash) ? { contentHash: raw.contentHash } : {}),
    ...((raw.forkedBy === null || isStr(raw.forkedBy)) ? { forkedBy: raw.forkedBy as string | null } : {}),
  };
}

function validateVariable(raw: unknown): TemplateVariable {
  if (!isObj(raw)) throw new ValidationError("Template variable is malformed");
  if (!isNonEmptyStr(raw.name)) throw new ValidationError("Template variable is missing name");
  const type = raw.type;
  if (!isStr(type) || !VAR_TYPES.has(type)) {
    throw new ValidationError(`Template variable has unknown type: ${String(type)}`);
  }
  const v: TemplateVariable = {
    name: raw.name,
    type: type as TemplateVariable["type"],
    required: Boolean(raw.required),
  };
  if (isStr(raw.description)) v.description = raw.description;
  if ("defaultValue" in raw) v.defaultValue = raw.defaultValue;
  if (Array.isArray(raw.enumValues)) v.enumValues = raw.enumValues.filter(isStr);
  return v;
}

function validateTestCase(raw: unknown): TemplateTestCase {
  if (!isObj(raw)) throw new ValidationError("Test case is malformed");
  if (!isNonEmptyStr(raw.name)) throw new ValidationError("Test case is missing name");
  if (!isObj(raw.bindings)) throw new ValidationError("Test case bindings must be an object");
  const tc: TemplateTestCase = { name: raw.name, bindings: raw.bindings };
  if (isStr(raw.expectedKind)) tc.expectedKind = raw.expectedKind;
  if (isStr(raw.expectedOutput)) tc.expectedOutput = raw.expectedOutput;
  return tc;
}

export function validateLibrary(raw: unknown): TemplateLibrary {
  if (!isObj(raw)) throw new ValidationError("Template library is not an object");
  if (raw.format !== LIBRARY_FORMAT) {
    throw new ValidationError(`Unsupported library format: ${String(raw.format)}`);
  }
  if (typeof raw.generatedAt !== "number" || !Number.isFinite(raw.generatedAt)) {
    throw new ValidationError("Template library is missing generatedAt");
  }
  if (!Array.isArray(raw.templates)) {
    throw new ValidationError("Template library must carry a templates array");
  }
  const templates = raw.templates.map(validateTemplate);
  const ids = new Set<string>();
  for (const t of templates) {
    if (ids.has(t.id)) throw new ValidationError(`Duplicate template id: ${t.id}`);
    ids.add(t.id);
  }
  return {
    format: LIBRARY_FORMAT,
    generatedAt: raw.generatedAt,
    ...(isStr(raw.version) ? { version: raw.version } : {}),
    templates,
  };
}

// ---------------------------------------------------------------------------
// Forking — D3: produce a portable template from a concrete prompt version.
// The result is a `prompt-tree-template/1` payload with a `source` block,
// so the consumer path stays identical: validateTemplate →
// instantiateTemplate → createPrompt. No new envelope, no new importer.
// ---------------------------------------------------------------------------

interface ForkProjectLike {
  slug: string;
  name: string;
}

interface ForkPromptLike {
  slug: string;
  name: string;
  description?: string;
  purpose?: string;
  readme?: string;
}

interface ForkVersionLike {
  id: string;
  number: number;
  title: string;
  body: string;
  messages?: TemplateMessage[] | null;
  variables?: TemplateVariable[];
  contentHash?: string;
  createdBy?: string | null;
}

export function packFork(args: {
  project: ForkProjectLike;
  prompt: ForkPromptLike;
  version: ForkVersionLike;
  now?: number;
  category?: string;
}): PromptTemplate {
  const { project, prompt, version, now = Date.now(), category = "forks" } = args;
  const id = `fork_${project.slug}_${prompt.slug}_v${version.number}_${now.toString(36)}`;
  const description = prompt.description?.trim()
    || prompt.purpose?.trim()
    || `Fork of ${prompt.name} v${version.number} from ${project.name}.`;
  return {
    format: TEMPLATE_FORMAT,
    id,
    name: prompt.name,
    description,
    category,
    tags: ["fork", project.slug],
    prompt: {
      title: version.title,
      body: version.body,
      ...(prompt.purpose ? { purpose: prompt.purpose } : {}),
      ...(prompt.readme  ? { readme:  prompt.readme  } : {}),
      messages: version.messages ?? null,
      ...(version.variables ? { variables: version.variables } : {}),
    },
    source: {
      projectSlug: project.slug,
      projectName: project.name,
      promptSlug: prompt.slug,
      promptName: prompt.name,
      versionId: version.id,
      versionNumber: version.number,
      ...(version.contentHash ? { contentHash: version.contentHash } : {}),
      forkedAt: now,
      ...(version.createdBy !== undefined ? { forkedBy: version.createdBy ?? null } : {}),
    },
  };
}

/** Produce the arguments that the service layer's `createPrompt` needs.
 *  Kept pure: no IDs allocated, no timestamps, no writes. */
export interface InstantiateArgs {
  name: string;
  description: string;
  purpose: string;
  readme: string | null;
  initialVersion: {
    title: string;
    body: string;
    messages: TemplateMessage[] | null;
    variables: TemplateVariable[];
  };
  suggestedTestCases: TemplateTestCase[];
}

export function instantiateTemplate(
  template: PromptTemplate,
  overrides: { name?: string } = {},
): InstantiateArgs {
  const name = (overrides.name ?? template.name).trim();
  if (!name) throw new ValidationError("Template instance needs a non-empty name");
  return {
    name,
    description: template.description,
    purpose: template.prompt.purpose ?? template.description,
    readme: template.prompt.readme ?? null,
    initialVersion: {
      title: template.prompt.title,
      body: template.prompt.body,
      messages: template.prompt.messages ?? null,
      variables: template.prompt.variables ?? [],
    },
    suggestedTestCases: template.suggestedTestCases ?? [],
  };
}

/** Group templates by `category`, ordered by first-appearance. Handy for
 *  the library view's rail grouping. */
export function groupByCategory(templates: readonly PromptTemplate[]): { category: string; templates: PromptTemplate[] }[] {
  const order: string[] = [];
  const bucket = new Map<string, PromptTemplate[]>();
  for (const t of templates) {
    if (!bucket.has(t.category)) { bucket.set(t.category, []); order.push(t.category); }
    bucket.get(t.category)!.push(t);
  }
  return order.map((category) => ({ category, templates: bucket.get(category)! }));
}
