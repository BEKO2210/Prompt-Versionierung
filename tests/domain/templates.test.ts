import { describe, it, expect } from "vitest";
import {
  validateTemplate, validateLibrary, instantiateTemplate, groupByCategory,
  packFork,
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

describe("packFork", () => {
  const project = { slug: "demo", name: "Demo" };
  const prompt = {
    slug: "cls", name: "Classifier",
    description: "Routes tickets.",
    purpose: "Route support tickets to the right queue.",
    readme: "## Contract\nReturn JSON.",
  };
  const version = {
    id: "ver_abc", number: 4, title: "With format",
    body: "Classify {{ticket}} as billing | account | other.",
    messages: null,
    variables: [{ name: "ticket", type: "string" as const, required: true }],
    contentHash: "abcdef1234",
    createdBy: "mem_alice",
  };

  it("produces a prompt-tree-template/1 payload that validates", () => {
    const fork = packFork({ project, prompt, version, now: 100 });
    const round = validateTemplate(JSON.parse(JSON.stringify(fork)));
    expect(round.format).toBe("prompt-tree-template/1");
    expect(round.prompt.body).toBe(version.body);
    expect(round.prompt.variables?.[0]?.name).toBe("ticket");
    expect(round.source?.versionId).toBe("ver_abc");
    expect(round.source?.versionNumber).toBe(4);
    expect(round.source?.projectSlug).toBe("demo");
    expect(round.source?.contentHash).toBe("abcdef1234");
    expect(round.source?.forkedAt).toBe(100);
  });

  it("never leaks runs, proposals or any extraneous fields", () => {
    const fork = packFork({ project, prompt, version });
    const json = JSON.stringify(fork);
    // Anything the fork should explicitly NOT carry:
    for (const forbidden of ["runs", "proposals", "decisions", "activities", "apiKey", "secrets"]) {
      expect(json.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it("round-trips through instantiateTemplate producing createPrompt args", () => {
    const fork = packFork({ project, prompt, version });
    const args = instantiateTemplate(validateTemplate(JSON.parse(JSON.stringify(fork))));
    expect(args.name).toBe("Classifier");
    expect(args.initialVersion.body).toBe(version.body);
    expect(args.readme).toBe("## Contract\nReturn JSON.");
    expect(args.initialVersion.variables).toEqual(version.variables);
  });

  it("falls back to a synthetic description when none of description/purpose are set", () => {
    const bare = { slug: "p", name: "P" };
    const fork = packFork({ project, prompt: bare, version });
    expect(fork.description).toContain("Fork of P v4");
    expect(fork.description).toContain("Demo");
  });
});

describe("validateTemplate — source provenance", () => {
  const tplWith = (source: unknown): unknown => ({
    format: "prompt-tree-template/1",
    id: "x", name: "X", description: "d", category: "c", tags: [],
    prompt: { title: "t", body: "b" },
    source,
  });

  it("accepts a well-formed source block", () => {
    const t = validateTemplate(tplWith({
      projectSlug: "demo", promptSlug: "p", versionId: "v", versionNumber: 1, forkedAt: 1,
    }));
    expect(t.source?.projectSlug).toBe("demo");
  });

  it("rejects missing required source fields", () => {
    expect(() => validateTemplate(tplWith({ promptSlug: "p", versionId: "v", versionNumber: 1, forkedAt: 1 }))).toThrow(/projectSlug/);
    expect(() => validateTemplate(tplWith({ projectSlug: "d", versionId: "v", versionNumber: 1, forkedAt: 1 }))).toThrow(/promptSlug/);
    expect(() => validateTemplate(tplWith({ projectSlug: "d", promptSlug: "p", versionNumber: 1, forkedAt: 1 }))).toThrow(/versionId/);
    expect(() => validateTemplate(tplWith({ projectSlug: "d", promptSlug: "p", versionId: "v", forkedAt: 1 }))).toThrow(/versionNumber/);
    expect(() => validateTemplate(tplWith({ projectSlug: "d", promptSlug: "p", versionId: "v", versionNumber: 1 }))).toThrow(/forkedAt/);
  });

  it("tolerates a missing source (curated templates don't carry one)", () => {
    const t = validateTemplate({
      format: "prompt-tree-template/1",
      id: "x", name: "X", description: "d", category: "c", tags: [],
      prompt: { title: "t", body: "b" },
    });
    expect(t.source).toBeUndefined();
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
