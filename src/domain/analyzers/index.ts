import { ambiguityAnalyzer } from "./ambiguity";
import { missingConstraintsAnalyzer } from "./missingConstraints";
import { unclearRoleAnalyzer } from "./unclearRole";
import { redundancyAnalyzer } from "./redundancy";
import { underspecificationAnalyzer } from "./underspecification";
import type { Analyzer, AnalyzerInput, DiagnosticFinding } from "./types";

export * from "./types";

export const DEFAULT_ANALYZERS: readonly Analyzer[] = [
  ambiguityAnalyzer,
  missingConstraintsAnalyzer,
  unclearRoleAnalyzer,
  redundancyAnalyzer,
  underspecificationAnalyzer,
];

/**
 * Run all analyzers and return a flat list of findings sorted by severity
 * (error > warn > info) then by analyzer id for stable ordering.
 */
export function analyze(
  input: AnalyzerInput,
  analyzers: readonly Analyzer[] = DEFAULT_ANALYZERS,
): DiagnosticFinding[] {
  const severityRank = { error: 0, warn: 1, info: 2 } as const;
  const all: DiagnosticFinding[] = [];
  for (const a of analyzers) {
    try {
      all.push(...a.run(input));
    } catch (err) {
      // Never let one analyzer break the pipeline.
      all.push({
        code: "analyzer.error",
        severity: "warn",
        detail: `Analyzer "${a.id}" failed: ${(err as Error).message}`,
        analyzer: a.id,
      });
    }
  }
  return all.sort((x, y) => {
    const sv = severityRank[x.severity] - severityRank[y.severity];
    if (sv !== 0) return sv;
    return x.analyzer.localeCompare(y.analyzer);
  });
}
