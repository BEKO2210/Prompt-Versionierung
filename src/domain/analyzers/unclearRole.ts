import type { Analyzer, DiagnosticFinding } from "./types";

// Flags prompts that dive straight into a task without establishing the
// model's role/persona or the user's context. Role framing consistently
// improves instruction-following on complex tasks.

const ROLE_PATTERNS = [
  /\byou are\b/i,
  /\byour role\b/i,
  /\bact as\b/i,
  /\byou will\b/i,
  /\bas an? [a-z]+\b/i,
];

export const unclearRoleAnalyzer: Analyzer = {
  id: "unclearRole",
  description: "Flags prompts that lack a role/persona framing.",
  run({ body, messages }): DiagnosticFinding[] {
    const text = messages?.find((m) => m.role === "system")?.content ?? body;
    const hasRole = ROLE_PATTERNS.some((re) => re.test(text));
    if (hasRole) return [];
    if (text.length < 80) return []; // trivial prompts don't need role framing
    return [
      {
        code: "role.missing",
        severity: "info",
        detail: "No explicit role framing detected. Consider opening with 'You are a …' to sharpen instruction-following.",
        analyzer: "unclearRole",
      },
    ];
  },
};
