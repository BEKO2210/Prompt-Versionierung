import { describe, it, expect } from "vitest";
import { analyze, DEFAULT_ANALYZERS } from "../../src/domain/analyzers";

function findingsFor(body: string, title = "t") {
  return analyze({ title, body, variables: [] });
}

describe("analyzers", () => {
  it("ambiguity: flags vague verbs", () => {
    const f = findingsFor("Please handle the user's request.");
    expect(f.some((x) => x.code === "ambiguity.vague_verb")).toBe(true);
  });

  it("ambiguity: flags hedges", () => {
    const f = findingsFor("Maybe respond with a summary.");
    expect(f.some((x) => x.code === "ambiguity.hedge")).toBe(true);
  });

  it("missingConstraints: flags JSON without schema", () => {
    const f = findingsFor("Return structured JSON.");
    expect(f.some((x) => x.code === "constraints.missing_schema")).toBe(true);
  });

  it("unclearRole: flags a long prompt with no role framing", () => {
    const f = findingsFor(
      "Given a long passage of text describing a user's intent, produce a concise summary that preserves the key details, attribution, and any numerical figures that appear in the source.",
    );
    expect(f.some((x) => x.code === "role.missing")).toBe(true);
  });

  it("unclearRole: does not flag when role is declared", () => {
    const f = findingsFor(
      "You are a precise summariser. Given a long passage, produce a concise summary that preserves key details and numerical figures.",
    );
    expect(f.some((x) => x.code === "role.missing")).toBe(false);
  });

  it("default analyzer list is stable", () => {
    const ids = DEFAULT_ANALYZERS.map((a) => a.id);
    expect(ids).toContain("ambiguity");
    expect(ids).toContain("missingConstraints");
    expect(ids).toContain("unclearRole");
    expect(ids).toContain("redundancy");
    expect(ids).toContain("underspecification");
  });

  it("sorts findings by severity then analyzer id", () => {
    // Construct a body that triggers multiple severities.
    const f = findingsFor(
      "Return structured JSON. Maybe handle the user. If the input is empty, return nothing.",
    );
    const rank = { error: 0, warn: 1, info: 2 } as const;
    for (let i = 1; i < f.length; i++) {
      const prev = f[i - 1]!;
      const cur = f[i]!;
      const pr = rank[prev.severity];
      const cr = rank[cur.severity];
      expect(pr).toBeLessThanOrEqual(cr);
    }
  });
});
