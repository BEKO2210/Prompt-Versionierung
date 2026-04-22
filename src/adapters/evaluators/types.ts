// Evaluator adapters take a run's rendered prompt + output + expectation
// and produce a PromptEvaluation DTO. They are stateless.

export interface EvaluatorInput {
  renderedPrompt: string;
  rawOutput: string;
  expectedOutput: string | null;
  expectedKind: string;
  assertions: unknown; // JSON
  rubric?: {
    criteria: Array<{ name: string; description: string; weight: number; scale: { min: number; max: number } }>;
  } | null;
}

export interface EvaluatorOutput {
  evaluatorKind: "human" | "llm_judge" | "regex" | "schema" | "similarity" | "rubric";
  score: number | null;
  passed: boolean | null;
  notes: string;
  criteriaScores?: Record<string, { score: number; note?: string }> | null;
}

export interface Evaluator {
  readonly kind: EvaluatorOutput["evaluatorKind"];
  run(input: EvaluatorInput): Promise<EvaluatorOutput>;
}
