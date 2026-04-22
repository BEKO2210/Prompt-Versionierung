import type { Analyzer, DiagnosticFinding } from "./types";

// Flags prompts that reference variables whose descriptions are missing
// or empty, or declare required variables without default values and
// without saying what they represent.

export const underspecificationAnalyzer: Analyzer = {
  id: "underspecification",
  description: "Detects variables without descriptions and missing failure-mode instructions.",
  run({ body, variables }): DiagnosticFinding[] {
    const findings: import("./types").DiagnosticFinding[] = [];

    for (const v of variables) {
      if (v.required && !("description" in v && (v as { description?: string }).description)) {
        findings.push({
          code: "underspec.variable_no_description",
          severity: "info",
          detail: `Required variable "${v.name}" has no description. Document what the caller should pass.`,
          analyzer: "underspecification",
        });
      }
    }

    if (!/\b(if|when|unless)\b/i.test(body)) {
      findings.push({
        code: "underspec.no_edge_cases",
        severity: "info",
        detail: "Prompt has no conditional clauses. Consider specifying behavior for edge cases (missing input, ambiguity, refusal).",
        analyzer: "underspecification",
      });
    }

    return findings;
  },
};
