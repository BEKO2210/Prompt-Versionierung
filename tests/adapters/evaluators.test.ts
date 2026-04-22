import { describe, it, expect } from "vitest";
import { regexEvaluator } from "../../src/adapters/evaluators/regex";
import { schemaEvaluator } from "../../src/adapters/evaluators/schema";
import { similarityEvaluator } from "../../src/adapters/evaluators/similarity";
import { rubricEvaluator } from "../../src/adapters/evaluators/rubric";

const base = {
  renderedPrompt: "",
  assertions: null,
  rubric: null,
};

describe("regexEvaluator", () => {
  it("passes on substring match with expectedKind=contains", async () => {
    const r = await regexEvaluator.run({
      ...base,
      rawOutput: "The answer is 42.",
      expectedOutput: "42",
      expectedKind: "contains",
    });
    expect(r.passed).toBe(true);
    expect(r.score).toBe(1);
  });

  it("fails on substring miss", async () => {
    const r = await regexEvaluator.run({
      ...base,
      rawOutput: "no",
      expectedOutput: "42",
      expectedKind: "contains",
    });
    expect(r.passed).toBe(false);
  });

  it("handles regex expected kind", async () => {
    const r = await regexEvaluator.run({
      ...base,
      rawOutput: "abc123",
      expectedOutput: "^abc\\d+$",
      expectedKind: "regex",
    });
    expect(r.passed).toBe(true);
  });

  it("returns null score when no expectation", async () => {
    const r = await regexEvaluator.run({
      ...base,
      rawOutput: "x",
      expectedOutput: null,
      expectedKind: "none",
    });
    expect(r.score).toBeNull();
  });
});

describe("schemaEvaluator", () => {
  it("fails on non-JSON", async () => {
    const r = await schemaEvaluator.run({
      ...base,
      rawOutput: "not json",
      expectedOutput: null,
      expectedKind: "schema",
    });
    expect(r.passed).toBe(false);
  });

  it("passes on valid JSON with no expected shape", async () => {
    const r = await schemaEvaluator.run({
      ...base,
      rawOutput: '{"a":1}',
      expectedOutput: null,
      expectedKind: "schema",
    });
    expect(r.passed).toBe(true);
  });

  it("checks shape against example", async () => {
    const r = await schemaEvaluator.run({
      ...base,
      rawOutput: '{"a":1,"b":"x"}',
      expectedOutput: '{"a":0,"b":""}',
      expectedKind: "schema",
    });
    expect(r.passed).toBe(true);
  });

  it("fails on shape mismatch (wrong type)", async () => {
    const r = await schemaEvaluator.run({
      ...base,
      rawOutput: '{"a":"1"}',
      expectedOutput: '{"a":0}',
      expectedKind: "schema",
    });
    expect(r.passed).toBe(false);
  });
});

describe("similarityEvaluator", () => {
  it("returns 1 for identical strings", async () => {
    const r = await similarityEvaluator.run({
      ...base,
      rawOutput: "the quick brown fox",
      expectedOutput: "the quick brown fox",
      expectedKind: "contains",
    });
    expect(r.score).toBe(1);
  });

  it("returns a low score for unrelated strings", async () => {
    const r = await similarityEvaluator.run({
      ...base,
      rawOutput: "abc def",
      expectedOutput: "xyz pqr",
      expectedKind: "contains",
    });
    expect(r.score ?? 0).toBeLessThan(0.5);
  });
});

describe("rubricEvaluator", () => {
  it("stages criteria scores when a rubric is attached", async () => {
    const r = await rubricEvaluator.run({
      ...base,
      rawOutput: "x",
      expectedOutput: null,
      expectedKind: "rubric",
      rubric: {
        criteria: [
          { name: "clarity", description: "", weight: 1, scale: { min: 0, max: 1 } },
        ],
      },
    });
    expect(r.criteriaScores).toBeTruthy();
    expect(r.criteriaScores!.clarity).toBeDefined();
  });

  it("skips cleanly when no rubric", async () => {
    const r = await rubricEvaluator.run({
      ...base,
      rawOutput: "x",
      expectedOutput: null,
      expectedKind: "rubric",
    });
    expect(r.score).toBeNull();
    expect(r.passed).toBeNull();
  });
});
