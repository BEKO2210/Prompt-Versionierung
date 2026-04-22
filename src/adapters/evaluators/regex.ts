import type { Evaluator, EvaluatorInput, EvaluatorOutput } from "./types";

// Regex evaluator. The expected output is interpreted as a regex pattern.
// `contains` expectation uses a plain substring check.

export const regexEvaluator: Evaluator = {
  kind: "regex",
  async run(input: EvaluatorInput): Promise<EvaluatorOutput> {
    const { expectedOutput, expectedKind, rawOutput } = input;
    if (!expectedOutput) {
      return {
        evaluatorKind: "regex",
        score: null,
        passed: null,
        notes: "No expectedOutput provided — regex evaluator skipped.",
      };
    }
    if (expectedKind === "contains") {
      const passed = rawOutput.includes(expectedOutput);
      return {
        evaluatorKind: "regex",
        score: passed ? 1 : 0,
        passed,
        notes: passed ? `Output contains expected substring.` : `Expected substring not found.`,
      };
    }
    if (expectedKind === "exact") {
      const passed = rawOutput.trim() === expectedOutput.trim();
      return {
        evaluatorKind: "regex",
        score: passed ? 1 : 0,
        passed,
        notes: passed ? "Exact match." : "Output does not equal expected output.",
      };
    }
    // Default: interpret as regex.
    try {
      const re = new RegExp(expectedOutput, "m");
      const passed = re.test(rawOutput);
      return {
        evaluatorKind: "regex",
        score: passed ? 1 : 0,
        passed,
        notes: passed ? `Regex /${expectedOutput}/m matched.` : `Regex /${expectedOutput}/m did not match.`,
      };
    } catch (err) {
      return {
        evaluatorKind: "regex",
        score: 0,
        passed: false,
        notes: `Invalid regex: ${(err as Error).message}`,
      };
    }
  },
};
