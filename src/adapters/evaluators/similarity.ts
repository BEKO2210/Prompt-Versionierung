import type { Evaluator, EvaluatorInput, EvaluatorOutput } from "./types";

// Token-level Jaccard similarity between rawOutput and expectedOutput.
// A lexical, not semantic, baseline. Semantic similarity is a v2 swap that
// implements the same interface.

function tokens(s: string): Set<string> {
  return new Set((s.toLowerCase().match(/\w+/g) ?? []).filter((t) => t.length > 1));
}

export const similarityEvaluator: Evaluator = {
  kind: "similarity",
  async run({ rawOutput, expectedOutput }: EvaluatorInput): Promise<EvaluatorOutput> {
    if (!expectedOutput) {
      return {
        evaluatorKind: "similarity",
        score: null,
        passed: null,
        notes: "No expectedOutput — similarity skipped.",
      };
    }
    const a = tokens(rawOutput);
    const b = tokens(expectedOutput);
    if (a.size === 0 && b.size === 0) {
      return { evaluatorKind: "similarity", score: 1, passed: true, notes: "Both outputs empty." };
    }
    let inter = 0;
    for (const t of a) if (b.has(t)) inter++;
    const union = a.size + b.size - inter;
    const score = union === 0 ? 1 : inter / union;
    return {
      evaluatorKind: "similarity",
      score,
      passed: score >= 0.5,
      notes: `Jaccard similarity: ${score.toFixed(3)}`,
    };
  },
};
