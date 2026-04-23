// Prompt templates — curated starter packs the user can instantiate
// into a project as a brand-new prompt. Mirrors `src/domain/templates.ts`.
//
// The library JSON ships statically under `webapp/data/templates.json`;
// `loadLibrary` fetches it at runtime. `validateLibrary` treats the
// result as untrusted — a template could also be imported from elsewhere
// in a later phase, so the parser is the same.

export const TEMPLATE_FORMAT = "prompt-tree-template/1";
export const LIBRARY_FORMAT  = "prompt-tree-template-library/1";

const VAR_TYPES = new Set(["string", "number", "boolean", "enum", "json"]);

const isObj = (x) => typeof x === "object" && x !== null && !Array.isArray(x);
const isStr = (x) => typeof x === "string";
const isNonEmptyStr = (x) => isStr(x) && x.trim().length > 0;

// ---------------------------------------------------------------------------
// Validation — every error message is short and specific.
// ---------------------------------------------------------------------------
export function validateTemplate(raw) {
  if (!isObj(raw)) throw new Error("Template is not an object");
  if (raw.format !== TEMPLATE_FORMAT) throw new Error(`Unsupported template format: ${String(raw.format)}`);
  if (!isNonEmptyStr(raw.id))          throw new Error("Template is missing id");
  if (!isNonEmptyStr(raw.name))        throw new Error("Template is missing name");
  if (!isNonEmptyStr(raw.description)) throw new Error("Template is missing description");
  if (!isNonEmptyStr(raw.category))    throw new Error("Template is missing category");
  if (!Array.isArray(raw.tags))        throw new Error("Template tags must be an array");
  if (!isObj(raw.prompt))              throw new Error("Template is missing prompt body");

  const p = raw.prompt;
  if (!isNonEmptyStr(p.title)) throw new Error("Template prompt is missing title");
  if (!isNonEmptyStr(p.body))  throw new Error("Template prompt is missing body");

  let messages = null;
  if (Array.isArray(p.messages)) {
    messages = p.messages.map((m) => {
      if (!isObj(m) || !isStr(m.role) || !isStr(m.content)) {
        throw new Error("Template message is malformed");
      }
      return { role: m.role, content: m.content };
    });
  } else if (p.messages !== undefined && p.messages !== null) {
    throw new Error("Template messages must be an array or null");
  }

  let variables;
  if (Array.isArray(p.variables)) {
    variables = p.variables.map(validateVariable);
  } else if (p.variables !== undefined) {
    throw new Error("Template variables must be an array");
  }

  let suggestedTestCases;
  if (Array.isArray(raw.suggestedTestCases)) {
    suggestedTestCases = raw.suggestedTestCases.map(validateTestCase);
  } else if (raw.suggestedTestCases !== undefined) {
    throw new Error("Template suggestedTestCases must be an array");
  }

  return {
    format: TEMPLATE_FORMAT,
    id: raw.id,
    name: raw.name,
    description: raw.description,
    category: raw.category,
    tags: raw.tags.filter(isStr),
    ...(isStr(raw.author) ? { author: raw.author } : {}),
    prompt: {
      title: p.title,
      body: p.body,
      ...(isStr(p.purpose) ? { purpose: p.purpose } : {}),
      ...(isStr(p.readme) ? { readme: p.readme } : {}),
      messages,
      ...(variables ? { variables } : {}),
    },
    ...(suggestedTestCases ? { suggestedTestCases } : {}),
  };
}

function validateVariable(raw) {
  if (!isObj(raw)) throw new Error("Template variable is malformed");
  if (!isNonEmptyStr(raw.name)) throw new Error("Template variable is missing name");
  if (!isStr(raw.type) || !VAR_TYPES.has(raw.type)) {
    throw new Error(`Template variable has unknown type: ${String(raw.type)}`);
  }
  const v = { name: raw.name, type: raw.type, required: Boolean(raw.required) };
  if (isStr(raw.description)) v.description = raw.description;
  if ("defaultValue" in raw)  v.defaultValue = raw.defaultValue;
  if (Array.isArray(raw.enumValues)) v.enumValues = raw.enumValues.filter(isStr);
  return v;
}

function validateTestCase(raw) {
  if (!isObj(raw)) throw new Error("Test case is malformed");
  if (!isNonEmptyStr(raw.name)) throw new Error("Test case is missing name");
  if (!isObj(raw.bindings))     throw new Error("Test case bindings must be an object");
  const tc = { name: raw.name, bindings: raw.bindings };
  if (isStr(raw.expectedKind))   tc.expectedKind = raw.expectedKind;
  if (isStr(raw.expectedOutput)) tc.expectedOutput = raw.expectedOutput;
  return tc;
}

export function validateLibrary(raw) {
  if (!isObj(raw)) throw new Error("Template library is not an object");
  if (raw.format !== LIBRARY_FORMAT) throw new Error(`Unsupported library format: ${String(raw.format)}`);
  if (typeof raw.generatedAt !== "number" || !Number.isFinite(raw.generatedAt)) {
    throw new Error("Template library is missing generatedAt");
  }
  if (!Array.isArray(raw.templates)) throw new Error("Template library must carry a templates array");
  const templates = raw.templates.map(validateTemplate);
  const ids = new Set();
  for (const t of templates) {
    if (ids.has(t.id)) throw new Error(`Duplicate template id: ${t.id}`);
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
// Library loader — single cached fetch. Tests + the view layer call it.
// ---------------------------------------------------------------------------
let _cache = null;

export async function loadLibrary({ force = false } = {}) {
  if (_cache && !force) return _cache;
  const res = await fetch("./data/templates.json", { cache: "no-cache" });
  if (!res.ok) throw new Error(`Template library HTTP ${res.status}`);
  const raw = await res.json();
  _cache = validateLibrary(raw);
  return _cache;
}

// ---------------------------------------------------------------------------
// Pure transform → createPrompt args. No IDs, no timestamps, no writes.
// ---------------------------------------------------------------------------
export function instantiateTemplate(template, { name } = {}) {
  const finalName = (name ?? template.name).trim();
  if (!finalName) throw new Error("Template instance needs a non-empty name");
  return {
    name: finalName,
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

// ---------------------------------------------------------------------------
// Presentation helper: group by category, preserving first-appearance order.
// ---------------------------------------------------------------------------
export function groupByCategory(templates) {
  const order = [];
  const bucket = new Map();
  for (const t of templates) {
    if (!bucket.has(t.category)) { bucket.set(t.category, []); order.push(t.category); }
    bucket.get(t.category).push(t);
  }
  return order.map((category) => ({ category, templates: bucket.get(category) }));
}
