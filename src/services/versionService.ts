import { z } from "zod";
import {
  ConflictError,
  ImmutableViolationError,
  NotFoundError,
  ValidationError,
} from "../domain/errors";
import { prepareVersion, type NewVersionInput } from "../domain/versioning";
import { assertTransition, type VersionStatus } from "../domain/status";
import { checkPointerPromotion } from "../domain/promotion";
import type { ServiceContext } from "./context";

const VariableDeclSchema = z.object({
  name: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/),
  description: z.string().optional(),
  type: z.enum(["string", "number", "boolean", "enum", "json"]),
  required: z.boolean().default(true),
  defaultValue: z.unknown().optional(),
  enumValues: z.array(z.string()).optional(),
});

export const CreateVersionSchema = z.object({
  promptId: z.string(),
  parentVersionId: z.string(),
  branchId: z.string(),
  title: z.string().min(1).max(160),
  body: z.string(),
  messages: z.array(z.object({ role: z.string(), content: z.string() })).optional().nullable(),
  variables: z.array(VariableDeclSchema).default([]),
  modelHintId: z.string().optional().nullable(),
  changeSummary: z.string().min(1).max(500),
  rationale: z.string().max(2000).optional().nullable(),
  expectedImprovement: z.string().max(1000).optional().nullable(),
  status: z
    .enum(["draft", "experimental", "candidate", "approved", "deprecated", "archived"])
    .default("draft"),
  createdBy: z.string().optional().nullable(),
});

export type CreateVersionInput = z.infer<typeof CreateVersionSchema>;

/**
 * Insert a new version on an existing branch. The new version's parent is
 * `parentVersionId`; the branch head advances to the new version.
 *
 * Invariants (see docs/02-domain.md §2.3):
 *   V2 `number = max(number)+1` for the prompt.
 *   V3 `contentHash` is set.
 *   V4 `createdOnBranchId` is set; branch head advances atomically.
 */
export async function createVersion(ctx: ServiceContext, input: CreateVersionInput) {
  const parsed = CreateVersionSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.message);

  const prepared = prepareVersion({
    promptId: parsed.data.promptId,
    parentVersionId: parsed.data.parentVersionId,
    createdOnBranchId: parsed.data.branchId,
    title: parsed.data.title,
    body: parsed.data.body,
    messages: parsed.data.messages ?? null,
    variables: parsed.data.variables.map((v) => ({
      name: v.name,
      type: v.type,
      required: v.required,
      defaultValue: v.defaultValue,
      enumValues: v.enumValues,
    })),
    status: parsed.data.status,
    modelHintId: parsed.data.modelHintId ?? null,
    changeSummary: parsed.data.changeSummary,
    rationale: parsed.data.rationale ?? null,
    expectedImprovement: parsed.data.expectedImprovement ?? null,
    createdBy: parsed.data.createdBy ?? null,
  });

  return ctx.prisma.$transaction(async (tx) => {
    const branch = await tx.promptBranch.findUnique({ where: { id: parsed.data.branchId } });
    if (!branch) throw new NotFoundError("Branch", parsed.data.branchId);
    if (branch.promptId !== parsed.data.promptId) {
      throw new ValidationError("Branch does not belong to this prompt");
    }
    if (branch.status !== "active") {
      throw new ConflictError("Cannot commit to an archived branch");
    }

    const parent = await tx.promptVersion.findUnique({
      where: { id: parsed.data.parentVersionId },
    });
    if (!parent || parent.promptId !== parsed.data.promptId) {
      throw new NotFoundError("Parent version", parsed.data.parentVersionId);
    }

    const latest = await tx.promptVersion.findFirst({
      where: { promptId: parsed.data.promptId },
      orderBy: { number: "desc" },
      select: { number: true },
    });
    const nextNumber = (latest?.number ?? 0) + 1;

    const version = await tx.promptVersion.create({
      data: {
        promptId: prepared.promptId,
        parentVersionId: prepared.parentVersionId,
        createdOnBranchId: prepared.createdOnBranchId,
        number: nextNumber,
        contentHash: prepared.contentHash,
        title: prepared.title,
        body: prepared.body,
        messages: prepared.messages ? JSON.stringify(prepared.messages) : null,
        status: prepared.status,
        modelHintId: prepared.modelHintId,
        changeSummary: prepared.changeSummary,
        rationale: prepared.rationale,
        expectedImprovement: prepared.expectedImprovement,
        createdBy: prepared.createdBy ?? ctx.actor ?? null,
        variables: {
          create: prepared.variables.map((v) => ({
            name: v.name,
            description: ("description" in v ? (v as { description?: string }).description : null) ?? null,
            type: v.type,
            required: v.required,
            defaultValue: v.defaultValue !== undefined ? JSON.stringify(v.defaultValue) : null,
            enumValues: v.enumValues ? JSON.stringify(v.enumValues) : null,
          })),
        },
      },
      include: { variables: true },
    });

    await tx.promptBranch.update({
      where: { id: branch.id },
      data: { headVersionId: version.id },
    });

    return version;
  });
}

/**
 * Transition a version's status. This is the only permitted mutation on an
 * existing version row. Illegal transitions throw.
 */
export async function transitionStatus(
  ctx: ServiceContext,
  versionId: string,
  to: VersionStatus,
) {
  const v = await ctx.prisma.promptVersion.findUnique({ where: { id: versionId } });
  if (!v) throw new NotFoundError("Version", versionId);
  assertTransition(v.status as VersionStatus, to);
  return ctx.prisma.promptVersion.update({
    where: { id: versionId },
    data: { status: to },
  });
}

/**
 * Promote a version to the canonical branch head. Pointer-promotion where
 * possible; squashed promotion is a separate service (squashedPromote) that
 * creates a new canonical version by copying content.
 */
export async function pointerPromote(
  ctx: ServiceContext,
  versionId: string,
  rationale: string,
) {
  return ctx.prisma.$transaction(async (tx) => {
    const version = await tx.promptVersion.findUnique({ where: { id: versionId } });
    if (!version) throw new NotFoundError("Version", versionId);

    const prompt = await tx.prompt.findUnique({
      where: { id: version.promptId },
      include: { canonicalBranch: true },
    });
    if (!prompt?.canonicalBranch) throw new NotFoundError("Canonical branch");

    const allNodes = await tx.promptVersion.findMany({
      where: { promptId: version.promptId },
      select: {
        id: true,
        parentVersionId: true,
        number: true,
        createdOnBranchId: true,
        status: true,
      },
    });

    const check = checkPointerPromotion(
      allNodes,
      prompt.canonicalBranch.headVersionId ?? null,
      versionId,
    );
    if (!check.allowedPointer) {
      throw new ValidationError(
        check.reason ?? "Pointer promotion not allowed — use squashed promotion",
      );
    }

    await tx.promptBranch.update({
      where: { id: prompt.canonicalBranch.id },
      data: { headVersionId: versionId },
    });

    await tx.promptDecision.create({
      data: {
        promptId: prompt.id,
        versionId,
        kind: "promote",
        rationale,
        metadata: JSON.stringify({
          mode: "pointer",
          branchId: prompt.canonicalBranch.id,
          previousHead: prompt.canonicalBranch.headVersionId,
        }),
        decidedBy: ctx.actor ?? null,
      },
    });

    return tx.promptVersion.findUniqueOrThrow({ where: { id: versionId } });
  });
}

/**
 * Squashed promotion: create a new version on the canonical branch whose
 * content equals the source version, parent = canonical head. Write a
 * `cherry_pick` lineage edge.
 */
export async function squashedPromote(
  ctx: ServiceContext,
  sourceVersionId: string,
  rationale: string,
) {
  return ctx.prisma.$transaction(async (tx) => {
    const source = await tx.promptVersion.findUnique({
      where: { id: sourceVersionId },
      include: { variables: true },
    });
    if (!source) throw new NotFoundError("Version", sourceVersionId);

    const prompt = await tx.prompt.findUnique({
      where: { id: source.promptId },
      include: { canonicalBranch: true },
    });
    if (!prompt?.canonicalBranch) throw new NotFoundError("Canonical branch");

    const latest = await tx.promptVersion.findFirst({
      where: { promptId: source.promptId },
      orderBy: { number: "desc" },
      select: { number: true },
    });
    const nextNumber = (latest?.number ?? 0) + 1;

    const newVersion = await tx.promptVersion.create({
      data: {
        promptId: source.promptId,
        parentVersionId: prompt.canonicalBranch.headVersionId,
        createdOnBranchId: prompt.canonicalBranch.id,
        number: nextNumber,
        contentHash: source.contentHash,
        title: source.title,
        body: source.body,
        messages: source.messages,
        status: "approved",
        modelHintId: source.modelHintId,
        changeSummary: `Promoted from v${source.number} (squashed)`,
        rationale,
        variables: {
          create: source.variables.map((v) => ({
            name: v.name,
            description: v.description,
            type: v.type,
            required: v.required,
            defaultValue: v.defaultValue,
            enumValues: v.enumValues,
          })),
        },
      },
    });

    await tx.promptBranch.update({
      where: { id: prompt.canonicalBranch.id },
      data: { headVersionId: newVersion.id },
    });

    await tx.promptLineageEdge.create({
      data: {
        fromVersionId: source.id,
        toVersionId: newVersion.id,
        kind: "cherry_pick",
        metadata: JSON.stringify({ reason: "squashed_promotion" }),
      },
    });

    await tx.promptDecision.create({
      data: {
        promptId: prompt.id,
        versionId: newVersion.id,
        kind: "promote",
        rationale,
        metadata: JSON.stringify({
          mode: "squashed",
          sourceVersionId: source.id,
        }),
        decidedBy: ctx.actor ?? null,
      },
    });

    return newVersion;
  });
}

/**
 * Fetch a version with all auxiliary data useful for the detail view.
 * NOTE: The rule is clear — this never mutates; reads are unrestricted.
 */
export async function getVersionDetail(ctx: ServiceContext, versionId: string) {
  const v = await ctx.prisma.promptVersion.findUnique({
    where: { id: versionId },
    include: {
      variables: true,
      notes: { orderBy: { createdAt: "desc" } },
      runs: {
        orderBy: { createdAt: "desc" },
        include: { evaluations: true, testCase: true, modelProfile: true },
      },
      parentVersion: true,
      childVersions: { select: { id: true, number: true, title: true, status: true } },
      outgoingEdges: true,
      incomingEdges: true,
      createdOnBranch: true,
    },
  });
  if (!v) throw new NotFoundError("Version", versionId);
  return v;
}

/**
 * Prevent direct update to content fields. If any caller tries it, we throw.
 * This is a runtime safety net; the service API doesn't expose the mutation.
 */
export async function assertNotContentMutation(_: unknown) {
  throw new ImmutableViolationError("PromptVersion content");
}
