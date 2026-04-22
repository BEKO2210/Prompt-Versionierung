import type { Analyzer, DiagnosticFinding } from "./types";

// Flags a prompt that asks for structured output without specifying the
// shape, or produces free-form text without length/format constraints.

const JSON_WORDS = ["json", "object", "schema", "structured"];
const LIST_WORDS = ["list", "bullet", "items", "array"];

function mentions(body: string, words: readonly string[]): boolean {
  const b = body.toLowerCase();
  return words.some((w) => b.includes(w));
}

function hasLengthConstraint(body: string): boolean {
  return /\b(at most|no more than|at least|between|exactly)\b/i.test(body)
    || /\b\d+\s+(words?|sentences?|items?|bullets?|tokens?|characters?)\b/i.test(body);
}

function hasJsonSchemaHint(body: string): boolean {
  return /```/.test(body) || /[{}\[\]]/.test(body) || /\b(schema|shape|fields?)\b/i.test(body);
}

export const missingConstraintsAnalyzer: Analyzer = {
  id: "missingConstraints",
  description: "Detects structured-output requests without shape hints, and free-text without length bounds.",
  run({ body }): DiagnosticFinding[] {
    const findings: DiagnosticFinding[] = [];

    if (mentions(body, JSON_WORDS) && !hasJsonSchemaHint(body)) {
      findings.push({
        code: "constraints.missing_schema",
        severity: "warn",
        detail: "Prompt mentions JSON/structured output but does not describe the schema. Add an explicit shape (fields, types, required keys).",
        analyzer: "missingConstraints",
      });
    }

    if (mentions(body, LIST_WORDS) && !hasLengthConstraint(body)) {
      findings.push({
        code: "constraints.missing_length",
        severity: "info",
        detail: "Prompt asks for a list but does not bound its length. Add 'at most N items' or similar.",
        analyzer: "missingConstraints",
      });
    }

    // No output-format hint at all in a long prompt.
    if (body.length > 400 && !/format|output|respond with|return/i.test(body)) {
      findings.push({
        code: "constraints.missing_output_format",
        severity: "info",
        detail: "Long prompt without an explicit output-format instruction.",
        analyzer: "missingConstraints",
      });
    }

    return findings;
  },
};
