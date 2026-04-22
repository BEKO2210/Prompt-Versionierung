import { z } from "zod";
import { NotFoundError, ValidationError } from "../domain/errors";
import { analyze } from "../domain/analyzers";
import { suggestRefineBranchName } from "../domain/branching";
import type { VariableDecl } from "../domain/rendering";
import { createBranch } from "./branchService";
import { createVersion } from "./versionService";
import type { ServiceContext } from "./context";

/**
 * Refinement service pipeline:
 *   diagnose(versionId) → produces OptimizationSuggestion rows
 *   accept(suggestionId) → forks a branch (if needed), creates a new
 *                          version whose parent is the source, and writes
 *                          a `refinement` lineage edge.
 */

export async function diagnose(ctx: ServiceContext, versionId: string) {
  const v = await ctx.prisma.promptVersion.findUnique({
    where: { id: versionId },
    include: { variables: true },
  });
  if (!v) throw new NotFoundError("Version", versionId);

  const findings = analyze({
    title: v.title,
    body: v.body,
    messages: v.messages ? JSON.parse(v.messages) : null,
    variables: v.variables.map((vv) => ({
      name: vv.name,
      type: vv.type,
      required: vv.required,
    })),
  });

  // Heuristic proposer: prepend a role if missing; append an output-format
  // instruction if missing; gently rewrite vague verbs via comment.
  let proposedBody = v.body;
  const notes: string[] = [];

  if (findings.some((f) => f.code === "role.missing")) {
    proposedBody = "You are a careful, precise assistant.\n\n" + proposedBody;
    notes.push("Prepended role framing.");
  }
  if (findings.some((f) => f.code === "constraints.missing_output_format")) {
    proposedBody = proposedBody.trimEnd() + "\n\nRespond in plain text. Keep your answer focused and bounded.";
    notes.push("Appended explicit output-format instruction.");
  }
  if (findings.some((f) => f.code === "constraints.missing_schema")) {
    proposedBody = proposedBody.trimEnd() + "\n\nReturn a JSON object with the following fields: <fields>. Return valid JSON only.";
    notes.push("Added a JSON schema hint (to be filled in by the author).");
  }

  const suggestion = await ctx.prisma.optimizationSuggestion.create({
    data: {
      versionId,
      diagnosis: JSON.stringify(findings),
      proposedBody,
      proposedVariables: JSON.stringify(
        v.variables.map((vv) => ({
          name: vv.name,
          description: vv.description,
          type: vv.type,
          required: vv.required,
        })),
      ),
      proposedTitle: v.title,
      rationale: notes.length > 0
        ? notes.join(" ")
        : "No systematic weaknesses detected; suggestion is a no-op placeholder. Author-driven edits welcome.",
      status: "pending",
    },
  });

  return { findings, suggestion };
}

export const AcceptSchema = z.object({
  suggestionId: z.string(),
  changeSummary: z.string().min(1).max(500),
  rationale: z.string().max(2000).optional().nullable(),
  expectedImprovement: z.string().max(1000).optional().nullable(),
  forkToNewBranch: z.boolean().default(true),
});

export async function acceptSuggestion(
  ctx: ServiceContext,
  input: z.infer<typeof AcceptSchema>,
) {
  const parsed = AcceptSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.message);

  const suggestion = await ctx.prisma.optimizationSuggestion.findUnique({
    where: { id: parsed.data.suggestionId },
    include: { version: true },
  });
  if (!suggestion) throw new NotFoundError("Suggestion", parsed.data.suggestionId);
  if (suggestion.status !== "pending") {
    throw new ValidationError(`Suggestion already ${suggestion.status}`);
  }

  let branchId: string;
  if (parsed.data.forkToNewBranch) {
    const branch = await createBranch(ctx, {
      promptId: suggestion.version.promptId,
      name: suggestRefineBranchName(suggestion.version.number),
      fromVersionId: suggestion.versionId,
    });
    branchId = branch.id;
  } else {
    branchId = suggestion.version.createdOnBranchId;
  }

  const rawVariables: VariableDecl[] = suggestion.proposedVariables
    ? JSON.parse(suggestion.proposedVariables)
    : [];
  const variables = rawVariables.map((v) => ({
    name: v.name,
    type: v.type,
    required: v.required,
    defaultValue: v.defaultValue,
    enumValues: v.enumValues ? [...v.enumValues] : undefined,
  }));

  const newVersion = await createVersion(ctx, {
    promptId: suggestion.version.promptId,
    parentVersionId: suggestion.versionId,
    branchId,
    title: suggestion.proposedTitle ?? suggestion.version.title,
    body: suggestion.proposedBody,
    variables,
    changeSummary: parsed.data.changeSummary,
    rationale: parsed.data.rationale ?? null,
    expectedImprovement: parsed.data.expectedImprovement ?? null,
    status: "experimental",
  });

  await ctx.prisma.promptLineageEdge.create({
    data: {
      fromVersionId: suggestion.versionId,
      toVersionId: newVersion.id,
      kind: "refinement",
      metadata: JSON.stringify({ suggestionId: suggestion.id }),
    },
  });

  await ctx.prisma.optimizationSuggestion.update({
    where: { id: suggestion.id },
    data: { status: "accepted", createdVersionId: newVersion.id },
  });

  return { version: newVersion, branchId };
}

export async function rejectSuggestion(ctx: ServiceContext, suggestionId: string, reason?: string) {
  return ctx.prisma.optimizationSuggestion.update({
    where: { id: suggestionId },
    data: {
      status: "rejected",
      rationale: reason ? `REJECTED: ${reason}` : "rejected",
    },
  });
}

export async function listSuggestions(ctx: ServiceContext, versionId: string) {
  return ctx.prisma.optimizationSuggestion.findMany({
    where: { versionId },
    orderBy: { createdAt: "desc" },
  });
}
