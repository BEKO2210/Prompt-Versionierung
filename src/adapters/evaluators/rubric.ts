import type { Evaluator, EvaluatorInput, EvaluatorOutput } from "./types";

// Rubric evaluator. Placeholder semantics for MVP: if a human rubric is
// attached, the evaluator does not score automatically — it stages the
// criteria so the UI can collect human scores. That keeps humans
// authoritative for rubric evals and lets the same code path be reused by
// the LLM-judge evaluator (M1) which fills the scores programmatically.

export const rubricEvaluator: Evaluator = {
  kind: "rubric",
  async run({ rubric }: EvaluatorInput): Promise<EvaluatorOutput> {
    if (!rubric) {
      return {
        evaluatorKind: "rubric",
        score: null,
        passed: null,
        notes: "No rubric attached — rubric evaluator skipped.",
      };
    }
    const criteriaScores: Record<string, { score: number; note?: string }> = {};
    for (const c of rubric.criteria) {
      criteriaScores[c.name] = { score: 0, note: "awaiting human or llm_judge" };
    }
    return {
      evaluatorKind: "rubric",
      score: null,
      passed: null,
      notes: "Rubric staged for scoring.",
      criteriaScores,
    };
  },
};
