import type { Evaluator, EvaluatorInput, EvaluatorOutput } from "./types";

// Validates that rawOutput parses as JSON and, optionally, matches a shape
// described by the expected output (a JSON example — we check key set and
// primitive types, not a full JSON-Schema).
//
// This is deliberately lightweight: full JSON-Schema validation is one file
// away (Ajv), but belongs to V2 where rubric schemas carry formal schemas.

function shapeMatches(expected: unknown, actual: unknown, path = "$"): string | null {
  if (expected === null) return actual === null ? null : `${path}: expected null`;
  const te = Array.isArray(expected) ? "array" : typeof expected;
  const ta = Array.isArray(actual) ? "array" : typeof actual;
  if (te !== ta) return `${path}: expected ${te}, got ${ta}`;
  if (te === "object") {
    for (const k of Object.keys(expected as object)) {
      if (!(k in (actual as object))) return `${path}.${k}: missing`;
      const child = shapeMatches(
        (expected as Record<string, unknown>)[k],
        (actual as Record<string, unknown>)[k],
        `${path}.${k}`,
      );
      if (child) return child;
    }
  }
  return null;
}

export const schemaEvaluator: Evaluator = {
  kind: "schema",
  async run({ rawOutput, expectedOutput }: EvaluatorInput): Promise<EvaluatorOutput> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawOutput);
    } catch (err) {
      return {
        evaluatorKind: "schema",
        score: 0,
        passed: false,
        notes: `Output is not valid JSON: ${(err as Error).message}`,
      };
    }
    if (!expectedOutput) {
      return {
        evaluatorKind: "schema",
        score: 1,
        passed: true,
        notes: "Output parsed as JSON.",
      };
    }
    let expected: unknown;
    try {
      expected = JSON.parse(expectedOutput);
    } catch {
      return {
        evaluatorKind: "schema",
        score: 0,
        passed: false,
        notes: "expectedOutput is not valid JSON.",
      };
    }
    const err = shapeMatches(expected, parsed);
    return err
      ? { evaluatorKind: "schema", score: 0, passed: false, notes: err }
      : { evaluatorKind: "schema", score: 1, passed: true, notes: "Shape matches expected example." };
  },
};
