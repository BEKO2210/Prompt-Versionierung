import { describe, it, expect } from "vitest";
import {
  validateTemplate, validateLibrary, instantiateTemplate, groupByCategory,
  PromptTemplate, TemplateLibrary,
} from "../../src/domain/templates";
import { ValidationError } from "../../src/domain/errors";
import fs from "node:fs";
import path from "node:path";

const mkTemplate = (over: Partial<PromptTemplate> = {}): PromptTemplate => ({
  format: "prompt-tree-template/1",
  id: "demo",
  name: "Demo",
  description: "A demo template.",
  category: "classification",
  tags: ["demo"],
  prompt: {
    title: "Demo title",
    body: "Hello {{name}}",
    purpose: "Say hi.",
    messages: null,
    variables: [{ name: "name", type: "string", required: true }],
  },
  ...over,
});

describe("validateTemplate", () => {
  it("accepts a minimal well-formed template", () => {
    const t = validateTemplate(mkTemplate());
    expect(t.id).toBe("demo");
    expect(t.prompt.variables?.[0]?.required).toBe(true);
  });

  it("rejects unknown format", () => {
    expect(() => validateTemplate({ ...mkTemplate(), format: "x/1" })).toThrow(ValidationError);
  });

  it("requires id + name + description + category", () => {
    expect(() => validateTemplate({ ...mkTemplate(), id: "" })).toThrow(/id/);
    expect(() => validateTemplate({ ...mkTemplate(), name: "" })).toThrow(/name/);
    expect(() => validateTemplate({ ...mkTemplate(), description: "" })).toThrow(/description/);
    expect(() => validateTemplate({ ...mkTemplate(), category: "" })).toThrow(/category/);
  });

  it("requires prompt.title + body", () => {
    const t = mkTemplate();
    expect(() => validateTemplate({ ...t, prompt: { ...t.prompt, title: "" } })).toThrow(/title/);
    expect(() => validateTemplate({ ...t, prompt: { ...t.prompt, body: "" } })).toThrow(/body/);
  });

  it("rejects malformed variables", () => {
    const t = mkTemplate();
    expect(() => validateTemplate({ ...t, prompt: { ...t.prompt, variables: [{ name: "x", type: "weird", required: true }] as any } })).toThrow(/unknown type/);
    expect(() => validateTemplate({ ...t, prompt: { ...t.prompt, variables: [{ name: "", type: "string", required: true }] as any } })).toThrow(/variable/);
  });

  it("rejects malformed messages", () => {
    const t = mkTemplate();
    expect(() => validateTemplate({ ...t, prompt: { ...t.prompt, messages: [{ role: "user" }] as any } })).toThrow(/message/);
  });

  it("rejects malformed test cases", () => {
    expect(() => validateTemplate({ ...mkTemplate(), suggestedTestCases: [{ name: "", bindings: {} }] as any })).toThrow(/name/);
    expect(() => validateTemplate({ ...mkTemplate(), suggestedTestCases: [{ name: "ok", bindings: "nope" }] as any })).toThrow(/bindings/);
  });

  it("strips unknown optional fields but preserves declared ones", () => {
    const t = validateTemplate({ ...mkTemplate(), author: "Alex" });
    expect(t.author).toBe("Alex");
    const t2 = validateTemplate({ ...mkTemplate() });
    expect("author" in t2).toBe(false);
  });
});

describe("validateLibrary", () => {
  const okLib = (over: Partial<TemplateLibrary> = {}): TemplateLibrary => ({
    format: "prompt-tree-template-library/1",
    generatedAt: 1,
    templates: [mkTemplate()],
    ...over,
  });

  it("accepts a well-formed library", () => {
    const lib = validateLibrary(okLib());
    expect(lib.templates.length).toBe(1);
  });

  it("rejects duplicate template ids", () => {
    expect(() => validateLibrary(okLib({ templates: [mkTemplate(), mkTemplate()] }))).toThrow(/Duplicate/);
  });

  it("rejects non-array templates", () => {
    expect(() => validateLibrary({ ...okLib(), templates: {} as any })).toThrow(/array/);
  });

  it("rejects missing generatedAt", () => {
    expect(() => validateLibrary({ ...okLib(), generatedAt: NaN })).toThrow(/generatedAt/);
  });
});

describe("instantiateTemplate", () => {
  it("produces createPrompt-shaped args from a template", () => {
    const args = instantiateTemplate(mkTemplate());
    expect(args.name).toBe("Demo");
    expect(args.initialVersion.body).toBe("Hello {{name}}");
    expect(args.initialVersion.variables?.[0]?.name).toBe("name");
    expect(args.readme).toBe(null);
  });

  it("honours a name override", () => {
    const args = instantiateTemplate(mkTemplate(), { name: "  My own  " });
    expect(args.name).toBe("My own");
  });

  it("rejects empty name overrides", () => {
    expect(() => instantiateTemplate(mkTemplate(), { name: "   " })).toThrow(ValidationError);
  });

  it("uses description as purpose fallback when none set", () => {
    const t = mkTemplate();
    delete (t.prompt as { purpose?: string }).purpose;
    const args = instantiateTemplate(t);
    expect(args.purpose).toBe("A demo template.");
  });

  it("passes the readme through when present", () => {
    const args = instantiateTemplate(mkTemplate({ prompt: { ...mkTemplate().prompt, readme: "# hi" } }));
    expect(args.readme).toBe("# hi");
  });
});

describe("groupByCategory", () => {
  it("preserves first-appearance order of categories", () => {
    const a = mkTemplate({ id: "a", category: "classification" });
    const b = mkTemplate({ id: "b", category: "extraction" });
    const c = mkTemplate({ id: "c", category: "classification" });
    const groups = groupByCategory([a, b, c]);
    expect(groups.map((g) => g.category)).toEqual(["classification", "extraction"]);
    expect(groups[0]!.templates.map((t) => t.id)).toEqual(["a", "c"]);
  });
});

describe("the bundled webapp/data/templates.json", () => {
  it("validates and carries ≥ 3 distinct templates", () => {
    const raw = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, "..", "..", "webapp", "data", "templates.json"), "utf8"),
    );
    const lib = validateLibrary(raw);
    expect(lib.templates.length).toBeGreaterThanOrEqual(3);
    const ids = new Set(lib.templates.map((t) => t.id));
    expect(ids.size).toBe(lib.templates.length);
    for (const t of lib.templates) {
      // Every starter must have at least one suggested test case —
      // the whole point of the library is to get people past a blank run.
      expect((t.suggestedTestCases ?? []).length).toBeGreaterThanOrEqual(1);
    }
  });
});
