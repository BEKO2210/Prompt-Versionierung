import { z } from "zod";
import {
  ConflictError,
  NotFoundError,
  PromotionError,
  ValidationError,
} from "../domain/errors";
import { validateBranchName } from "../domain/branching";
import type { ServiceContext } from "./context";

export const CreateBranchSchema = z.object({
  promptId: z.string().min(1),
  name: z.string().min(1),
  fromVersionId: z.string().min(1),
});

export async function createBranch(
  ctx: ServiceContext,
  input: z.infer<typeof CreateBranchSchema>,
) {
  const parsed = CreateBranchSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.message);
  validateBranchName(parsed.data.name);

  return ctx.prisma.$transaction(async (tx) => {
    const forkPoint = await tx.promptVersion.findUnique({
      where: { id: parsed.data.fromVersionId },
    });
    if (!forkPoint || forkPoint.promptId !== parsed.data.promptId) {
      throw new NotFoundError("Version", parsed.data.fromVersionId);
    }

    const existing = await tx.promptBranch.findUnique({
      where: {
        promptId_name: { promptId: parsed.data.promptId, name: parsed.data.name },
      },
    });
    if (existing) throw new ConflictError(`Branch already exists: ${parsed.data.name}`);

    return tx.promptBranch.create({
      data: {
        promptId: parsed.data.promptId,
        name: parsed.data.name,
        headVersionId: forkPoint.id,
        createdFromVersionId: forkPoint.id,
        status: "active",
      },
    });
  });
}

export async function listBranches(ctx: ServiceContext, promptId: string) {
  return ctx.prisma.promptBranch.findMany({
    where: { promptId },
    include: { head: true, createdFrom: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function archiveBranch(ctx: ServiceContext, branchId: string, rationale: string) {
  return ctx.prisma.$transaction(async (tx) => {
    const branch = await tx.promptBranch.findUnique({
      where: { id: branchId },
      include: { canonicalOf: true },
    });
    if (!branch) throw new NotFoundError("Branch", branchId);
    if (branch.canonicalOf) {
      throw new PromotionError("Cannot archive the canonical branch");
    }
    const updated = await tx.promptBranch.update({
      where: { id: branchId },
      data: { status: "archived" },
    });
    await tx.promptDecision.create({
      data: {
        promptId: branch.promptId,
        versionId: null,
        kind: "archive",
        rationale,
        metadata: JSON.stringify({ branchId }),
      },
    });
    return updated;
  });
}
