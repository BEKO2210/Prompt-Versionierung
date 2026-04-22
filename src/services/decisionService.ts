import { z } from "zod";
import { ValidationError } from "../domain/errors";
import type { ServiceContext } from "./context";

const DecisionKinds = z.enum([
  "promote",
  "demote",
  "approve",
  "deprecate",
  "archive",
  "set_canonical_branch",
]);

export const CreateDecisionSchema = z.object({
  promptId: z.string(),
  versionId: z.string().optional().nullable(),
  kind: DecisionKinds,
  rationale: z.string().min(1).max(2000),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * Generic decision log entry. The specific decision types (promote, archive)
 * are written by the corresponding services, but this endpoint is useful for
 * ad-hoc governance notes (e.g. "deprecating v5 because it leaked PII").
 */
export async function writeDecision(
  ctx: ServiceContext,
  input: z.infer<typeof CreateDecisionSchema>,
) {
  const parsed = CreateDecisionSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.message);
  return ctx.prisma.promptDecision.create({
    data: {
      promptId: parsed.data.promptId,
      versionId: parsed.data.versionId ?? null,
      kind: parsed.data.kind,
      rationale: parsed.data.rationale,
      metadata: parsed.data.metadata ? JSON.stringify(parsed.data.metadata) : null,
      decidedBy: ctx.actor ?? null,
    },
  });
}

export async function listDecisions(ctx: ServiceContext, promptId: string) {
  return ctx.prisma.promptDecision.findMany({
    where: { promptId },
    orderBy: { decidedAt: "desc" },
  });
}
