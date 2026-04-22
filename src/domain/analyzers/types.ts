// Refinement analyzers are pure functions. Each takes the prompt content
// and returns zero or more diagnostic findings. Adding an analyzer is
// registering one file in `index.ts`.

export type DiagnosticSeverity = "info" | "warn" | "error";

export interface DiagnosticSpan {
  start: number;
  end: number;
}

export interface DiagnosticFinding {
  code: string;           // stable identifier, e.g. "ambiguity.vague_verb"
  severity: DiagnosticSeverity;
  detail: string;         // human-readable
  span?: DiagnosticSpan | undefined;
  analyzer: string;       // analyzer id (for attribution)
}

export interface AnalyzerInput {
  title: string;
  body: string;
  messages?: ReadonlyArray<{ role: string; content: string }> | null;
  variables: ReadonlyArray<{ name: string; type: string; required: boolean }>;
}

export interface Analyzer {
  id: string;
  description: string;
  run(input: AnalyzerInput): DiagnosticFinding[];
}
