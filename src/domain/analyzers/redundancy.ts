import type { Analyzer, DiagnosticFinding } from "./types";

// Flags near-duplicate sentences — a common artifact of iterative editing
// where two instructions overlap without either being removed.

function sentences(body: string): string[] {
  return body
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20);
}

function jaccardTokens(a: string, b: string): number {
  const ta = new Set(a.toLowerCase().match(/\w+/g) ?? []);
  const tb = new Set(b.toLowerCase().match(/\w+/g) ?? []);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  return inter / union;
}

export const redundancyAnalyzer: Analyzer = {
  id: "redundancy",
  description: "Detects near-duplicate sentences that likely contradict or repeat each other.",
  run({ body }): DiagnosticFinding[] {
    const sents = sentences(body);
    const findings: import("./types").DiagnosticFinding[] = [];
    for (let i = 0; i < sents.length; i++) {
      for (let j = i + 1; j < sents.length; j++) {
        const a = sents[i]!;
        const b = sents[j]!;
        const sim = jaccardTokens(a, b);
        if (sim > 0.65) {
          findings.push({
            code: "redundancy.near_duplicate",
            severity: "info",
            detail: `Two sentences are highly similar (Jaccard=${sim.toFixed(2)}). Consider merging:\n  A: "${a}"\n  B: "${b}"`,
            analyzer: "redundancy",
          });
        }
      }
    }
    return findings;
  },
};
