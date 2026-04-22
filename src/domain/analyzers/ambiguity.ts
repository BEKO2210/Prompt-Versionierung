import type { Analyzer, DiagnosticFinding } from "./types";

// Flags common ambiguity patterns: vague verbs, hedge words, unspecified
// subjects. Catches the most frequent unclear instructions in prompts.

const VAGUE_VERBS = [
  "handle",
  "process",
  "deal with",
  "manage",
  "support",
  "work with",
  "take care of",
];
const HEDGES = ["maybe", "perhaps", "probably", "sort of", "kind of", "somewhat"];

function findAll(body: string, needle: string): number[] {
  const out: number[] = [];
  const lower = body.toLowerCase();
  const n = needle.toLowerCase();
  let i = lower.indexOf(n);
  while (i !== -1) {
    // Word-boundary check
    const before = lower[i - 1];
    const after = lower[i + n.length];
    const isBoundaryBefore = !before || /\W/.test(before);
    const isBoundaryAfter = !after || /\W/.test(after);
    if (isBoundaryBefore && isBoundaryAfter) out.push(i);
    i = lower.indexOf(n, i + 1);
  }
  return out;
}

export const ambiguityAnalyzer: Analyzer = {
  id: "ambiguity",
  description: "Flags vague verbs and hedge words that weaken instructions.",
  run({ body }): DiagnosticFinding[] {
    const findings: DiagnosticFinding[] = [];
    for (const v of VAGUE_VERBS) {
      for (const pos of findAll(body, v)) {
        findings.push({
          code: "ambiguity.vague_verb",
          severity: "warn",
          detail: `Vague verb "${v}" — specify the exact action (e.g. "extract", "summarize", "classify").`,
          span: { start: pos, end: pos + v.length },
          analyzer: "ambiguity",
        });
      }
    }
    for (const h of HEDGES) {
      for (const pos of findAll(body, h)) {
        findings.push({
          code: "ambiguity.hedge",
          severity: "info",
          detail: `Hedge word "${h}" weakens the instruction. Prefer deterministic language.`,
          span: { start: pos, end: pos + h.length },
          analyzer: "ambiguity",
        });
      }
    }
    return findings;
  },
};
