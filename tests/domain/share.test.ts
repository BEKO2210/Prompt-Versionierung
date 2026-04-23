import { describe, it, expect } from "vitest";
import { ancestorChain, packShare, validateShare, ShareSlice, ShareVersion } from "../../src/domain/share";
import { ValidationError } from "../../src/domain/errors";

const v = (overrides: Partial<ShareVersion>): ShareVersion => ({
  id: "v1",
  number: 1,
  parentVersionId: null,
  createdOnBranchId: "b_main",
  title: "root",
  body: "hello",
  messages: null,
  status: "draft",
  ...overrides,
});

const mkPrompt = () => ({
  slug: "cls",
  name: "Classifier",
  description: "Ticket classifier",
  canonicalBranchId: "b_main",
  branches: [
    { id: "b_main", name: "main",  color: "#0891b2", headVersionId: "v3" },
    { id: "b_exp",  name: "exp-a", color: "#f59e0b", headVersionId: "v2b" },
    { id: "b_unused", name: "dead", color: "#ef4444", headVersionId: "v9" },
  ],
  versions: [
    v({ id: "v1", number: 1, parentVersionId: null, title: "root",    body: "root body" }),
    v({ id: "v2", number: 2, parentVersionId: "v1", title: "tweak",   body: "tweak body" }),
    v({ id: "v2b",number: 3, parentVersionId: "v1", title: "sidefork",body: "fork body", createdOnBranchId: "b_exp" }),
    v({ id: "v3", number: 4, parentVersionId: "v2", title: "head",    body: "head body", contentHash: "deadbeef", changeSummary: "cs", rationale: "because" }),
  ],
});

const mkProject = () => ({
  slug: "demo",
  name: "Demo",
  prompts: [mkPrompt()],
});

describe("ancestorChain", () => {
  it("returns root-first chain for a leaf", () => {
    const versions = mkPrompt().versions;
    const chain = ancestorChain(versions, "v3");
    expect(chain.map((x) => x.id)).toEqual(["v1", "v2", "v3"]);
  });
  it("returns just the root for root id", () => {
    const chain = ancestorChain(mkPrompt().versions, "v1");
    expect(chain.map((x) => x.id)).toEqual(["v1"]);
  });
  it("stops on a missing parent rather than throwing", () => {
    const chain = ancestorChain(
      [v({ id: "x", parentVersionId: "nope" })],
      "x",
    );
    expect(chain.map((x) => x.id)).toEqual(["x"]);
  });
  it("breaks cycles defensively", () => {
    const chain = ancestorChain(
      [v({ id: "a", parentVersionId: "b" }), v({ id: "b", parentVersionId: "a" })],
      "a",
    );
    expect(chain.length).toBe(2);
  });
});

describe("packShare", () => {
  it("includes only the ancestor chain of the target, not siblings", () => {
    const prompt = mkPrompt();
    const slice = packShare({ project: mkProject(), prompt, versionId: "v3" });
    const ids = slice.versions.map((x) => x.id);
    expect(ids).toEqual(["v1", "v2", "v3"]);
    expect(ids).not.toContain("v2b");
  });

  it("keeps only branches that the chain actually touches", () => {
    const prompt = mkPrompt();
    const slice = packShare({ project: mkProject(), prompt, versionId: "v3" });
    const names = slice.branches.map((b) => b.name).sort();
    expect(names).toEqual(["main"]);
  });

  it("captures project + prompt metadata and the target id", () => {
    const slice = packShare({ project: mkProject(), prompt: mkPrompt(), versionId: "v2" });
    expect(slice.format).toBe("prompt-tree-share/1");
    expect(slice.project).toEqual({ slug: "demo", name: "Demo" });
    expect(slice.prompt.slug).toBe("cls");
    expect(slice.targetVersionId).toBe("v2");
    expect(typeof slice.generatedAt).toBe("number");
  });

  it("rejects a version id that is not on the prompt", () => {
    expect(() => packShare({ project: mkProject(), prompt: mkPrompt(), versionId: "nope" }))
      .toThrow(ValidationError);
  });

  it("strips missing optional prompt fields rather than emitting empty strings", () => {
    const p = mkPrompt();
    delete (p as any).description;
    const slice = packShare({ project: mkProject(), prompt: p, versionId: "v1" });
    expect("description" in slice.prompt).toBe(false);
  });
});

describe("validateShare", () => {
  const valid = () => packShare({ project: mkProject(), prompt: mkPrompt(), versionId: "v3" });

  it("accepts a slice that packShare produced", () => {
    const s = valid();
    const round = validateShare(JSON.parse(JSON.stringify(s)));
    expect(round.targetVersionId).toBe("v3");
    expect(round.versions.map((x) => x.id)).toEqual(["v1", "v2", "v3"]);
  });

  it("rejects a non-object payload", () => {
    expect(() => validateShare("nope")).toThrow(ValidationError);
    expect(() => validateShare(null)).toThrow(ValidationError);
    expect(() => validateShare([1, 2])).toThrow(ValidationError);
  });

  it("rejects an unknown format version", () => {
    const s = valid() as unknown as Record<string, unknown>;
    s.format = "prompt-tree-share/99";
    expect(() => validateShare(s)).toThrow(/Unsupported share format/);
  });

  it("rejects payloads where the target is not in versions", () => {
    const s = valid() as ShareSlice;
    s.targetVersionId = "not-included";
    expect(() => validateShare(s)).toThrow(/targetVersionId/);
  });

  it("rejects malformed version entries", () => {
    const s = valid() as unknown as { versions: unknown[] };
    s.versions[0] = { id: "v1" };
    expect(() => validateShare(s)).toThrow(/malformed version/);
  });

  it("rejects malformed messages", () => {
    const s = valid() as ShareSlice;
    (s.versions[0] as unknown as { messages: unknown[] }).messages = [{ role: "user" }];
    expect(() => validateShare(s)).toThrow(/malformed message/);
  });

  it("keeps optional rationale / changeSummary / contentHash when present", () => {
    const s = validateShare(JSON.parse(JSON.stringify(valid())));
    const head = s.versions.find((x) => x.id === "v3")!;
    expect(head.contentHash).toBe("deadbeef");
    expect(head.changeSummary).toBe("cs");
    expect(head.rationale).toBe("because");
  });
});
