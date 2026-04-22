import { describe, it, expect } from "vitest";
import { diffText, diffVariables, diffMetadata } from "../../src/domain/diff";

describe("diffText", () => {
  it("reports equal lines when identical", () => {
    const d = diffText("a\nb\nc", "a\nb\nc");
    expect(d.stats.equal).toBe(3);
    expect(d.stats.added).toBe(0);
    expect(d.stats.removed).toBe(0);
    expect(d.stats.modified).toBe(0);
  });

  it("reports additions", () => {
    const d = diffText("a", "a\nb");
    expect(d.stats.added).toBe(1);
    expect(d.stats.equal).toBe(1);
  });

  it("reports removals", () => {
    const d = diffText("a\nb", "a");
    expect(d.stats.removed).toBe(1);
  });

  it("pairs remove+add into modified with word-diff", () => {
    const d = diffText("hello world", "hello there");
    expect(d.stats.modified).toBe(1);
    const line = d.lines.find((l) => l.op === "modified")!;
    expect(line.words).toBeDefined();
    const added = line.words!.find((w) => w.op === "added");
    const removed = line.words!.find((w) => w.op === "removed");
    expect(added?.text).toContain("there");
    expect(removed?.text).toContain("world");
  });
});

describe("diffVariables", () => {
  it("detects add/remove/change/unchanged", () => {
    const r = diffVariables(
      [
        { name: "a", type: "string", required: true },
        { name: "b", type: "number", required: true },
      ],
      [
        { name: "a", type: "string", required: true },
        { name: "b", type: "string", required: true },
        { name: "c", type: "boolean", required: false },
      ],
    );
    const byName = Object.fromEntries(r.map((x) => [x.name, x.op]));
    expect(byName.a).toBe("unchanged");
    expect(byName.b).toBe("changed");
    expect(byName.c).toBe("added");
  });
});

describe("diffMetadata", () => {
  it("reports changed flags", () => {
    const m = diffMetadata(
      { title: "a", status: "draft", modelHintId: null, rationale: "" },
      { title: "b", status: "draft", modelHintId: null, rationale: "r" },
    );
    expect(m.titleChanged).toBe(true);
    expect(m.statusChanged).toBe(false);
    expect(m.modelHintChanged).toBe(false);
    expect(m.rationaleChanged).toBe(true);
  });
});
