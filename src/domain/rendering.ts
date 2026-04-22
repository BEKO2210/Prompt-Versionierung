import { ValidationError } from "./errors";

// Template rendering.
//
// Syntax: `{{ name }}` — whitespace around the name is allowed and ignored.
// Names match /^[a-zA-Z_][a-zA-Z0-9_]*$/. No computation, no conditionals —
// rendering is a pure textual substitution and never executes user code.
//
// Unknown references are an error; unused bindings are a warning (callers
// may choose to treat warnings as errors).

const VAR_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

export type VariableType = "string" | "number" | "boolean" | "enum" | "json";

export interface VariableDecl {
  name: string;
  type: VariableType;
  required: boolean;
  defaultValue?: unknown;
  enumValues?: ReadonlyArray<string>;
}

export interface RenderResult {
  rendered: string;
  usedBindings: Readonly<Record<string, unknown>>;
  warnings: ReadonlyArray<string>;
}

export function extractReferences(body: string): string[] {
  const names = new Set<string>();
  for (const m of body.matchAll(VAR_RE)) {
    const name = m[1];
    if (name) names.add(name);
  }
  return [...names];
}

/**
 * Validate that every `{{name}}` reference in `body` has a declared
 * variable. Returns the list of undeclared references.
 */
export function findUndeclaredReferences(
  body: string,
  decls: ReadonlyArray<VariableDecl>,
): string[] {
  const declared = new Set(decls.map((d) => d.name));
  const undeclared: string[] = [];
  for (const ref of extractReferences(body)) {
    if (!declared.has(ref)) undeclared.push(ref);
  }
  return undeclared;
}

function coerce(
  name: string,
  raw: unknown,
  decl: VariableDecl,
): string {
  if (raw === undefined || raw === null) {
    if (decl.required && decl.defaultValue === undefined) {
      throw new ValidationError(`Missing required variable: ${name}`);
    }
    raw = decl.defaultValue ?? "";
  }
  switch (decl.type) {
    case "string":
      return String(raw);
    case "number": {
      const n = typeof raw === "number" ? raw : Number(raw);
      if (Number.isNaN(n)) {
        throw new ValidationError(`Variable ${name} must be a number`);
      }
      return String(n);
    }
    case "boolean":
      return String(Boolean(raw));
    case "enum": {
      const v = String(raw);
      if (decl.enumValues && !decl.enumValues.includes(v)) {
        throw new ValidationError(
          `Variable ${name} must be one of: ${decl.enumValues.join(", ")}`,
        );
      }
      return v;
    }
    case "json":
      return typeof raw === "string" ? raw : JSON.stringify(raw);
    default:
      return String(raw);
  }
}

export function render(
  body: string,
  decls: ReadonlyArray<VariableDecl>,
  bindings: Readonly<Record<string, unknown>>,
): RenderResult {
  const undeclared = findUndeclaredReferences(body, decls);
  if (undeclared.length > 0) {
    throw new ValidationError(
      `Prompt references undeclared variable(s): ${undeclared.join(", ")}`,
    );
  }

  const declMap = new Map(decls.map((d) => [d.name, d] as const));
  const used: Record<string, unknown> = {};
  const warnings: string[] = [];

  const rendered = body.replace(VAR_RE, (_match, rawName: string) => {
    const name = rawName.trim();
    const decl = declMap.get(name);
    if (!decl) {
      // Defensive — findUndeclaredReferences should have caught this.
      throw new ValidationError(`Undeclared variable in template: ${name}`);
    }
    const value = bindings[name];
    const coerced = coerce(name, value, decl);
    used[name] = value ?? decl.defaultValue;
    return coerced;
  });

  // Warn on bindings that were never referenced.
  const references = new Set(extractReferences(body));
  for (const key of Object.keys(bindings)) {
    if (!references.has(key)) {
      warnings.push(`Unused binding: ${key}`);
    }
  }

  return { rendered, usedBindings: used, warnings };
}
