import { regexEvaluator } from "./regex";
import { schemaEvaluator } from "./schema";
import { similarityEvaluator } from "./similarity";
import { rubricEvaluator } from "./rubric";
import type { Evaluator } from "./types";

const EVALUATORS: Record<string, Evaluator> = {
  regex: regexEvaluator,
  schema: schemaEvaluator,
  similarity: similarityEvaluator,
  rubric: rubricEvaluator,
};

export function resolveEvaluator(kind: string): Evaluator | null {
  return EVALUATORS[kind] ?? null;
}

export function listEvaluators(): Evaluator[] {
  return Object.values(EVALUATORS);
}
