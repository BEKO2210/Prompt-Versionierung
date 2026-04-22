import { z } from "zod";
import { ConflictError, NotFoundError, ValidationError } from "../domain/errors";
import { ROOT_BRANCH_NAME } from "../domain/branching";
import { prepareVersion } from "../domain/versioning";
import { slugify } from "../lib/slug";
import type { ServiceContext } from "./context";

export const CreatePromptSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(64).optional(),
  description: z.string().max(500).optional(),
  purpose: z.string().max(2000).optional(),
  initialVersion: z.object({
    title: z.string().min(1).max(160),
    body: z.string(),
    messages: z
      .array(z.object({ role: z.string(), content: z.string() }))
      .optional()
      .nullable(),
    variables: z
      .array(
        z.object({
          name: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/),
          description: z.string().optional(),
          type: z.enum(["string", "number", "boolean", "enum", "json"]),
          required: z.boolean().default(true),
          defaultValue: z.unknown().optional(),
          enumValues: z.array(z.string()).optional(),
        }),
      )
      .default([]),
  }),
});

export type CreatePromptInput = z.infer<typeof CreatePromptSchema>;

/**
 * Create a prompt, its root branch, the first version, and wire the
 * canonical-branch pointer. All in one transaction; partial state is not
 * observable.
 */
export async function createPrompt(ctx: ServiceContext, input: CreatePromptInput) {
  const parsed = CreatePromptSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.message);

  const slug = parsed.data.slug ? slugify(parsed.data.slug) : slugify(parsed.data.name);

  return ctx.prisma.$transaction(async (tx) => {
    const project = await tx.promptProject.findUnique({ where: { id: parsed.data.projectId } });
    if (!project) throw new NotFoundError("Project", parsed.data.projectId);

    const dup = await tx.prompt.findUnique({
      where: { projectId_slug: { projectId: parsed.data.projectId, slug } },
    });
    if (dup) throw new ConflictError(`Prompt slug already exists in project: ${slug}`);

    const prompt = await tx.prompt.create({
      data: {
        projectId: parsed.data.projectId,
        slug,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        purpose: parsed.data.purpose ?? null,
      },
    });

    const branch = await tx.promptBranch.create({
      data: {
        promptId: prompt.id,
        name: ROOT_BRANCH_NAME,
        status: "active",
      },
    });

    const prepared = prepareVersion({
      promptId: prompt.id,
      parentVersionId: null,
      createdOnBranchId: branch.id,
      title: parsed.data.initialVersion.title,
      body: parsed.data.initialVersion.body,
      messages: parsed.data.initialVersion.messages ?? null,
      variables: parsed.data.initialVersion.variables,
      status: "draft",
      changeSummary: "Initial version",
    });

    const version = await tx.promptVersion.create({
      data: {
        promptId: prepared.promptId,
        parentVersionId: prepared.parentVersionId,
        createdOnBranchId: prepared.createdOnBranchId,
        number: 1,
        contentHash: prepared.contentHash,
        title: prepared.title,
        body: prepared.body,
        messages: prepared.messages ? JSON.stringify(prepared.messages) : null,
        status: prepared.status,
        modelHintId: prepared.modelHintId,
        changeSummary: prepared.changeSummary,
        rationale: prepared.rationale,
        expectedImprovement: prepared.expectedImprovement,
        createdBy: prepared.createdBy,
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
    });

    await tx.promptBranch.update({
      where: { id: branch.id },
      data: { headVersionId: version.id },
    });

    await tx.prompt.update({
      where: { id: prompt.id },
      data: { canonicalBranchId: branch.id },
    });

    return tx.prompt.findUniqueOrThrow({
      where: { id: prompt.id },
      include: {
        canonicalBranch: true,
        branches: true,
        versions: { orderBy: { number: "asc" } },
      },
    });
  });
}

export async function getPromptBySlug(
  ctx: ServiceContext,
  projectId: string,
  slug: string,
) {
  const p = await ctx.prisma.prompt.findUnique({
    where: { projectId_slug: { projectId, slug } },
    include: {
      canonicalBranch: true,
      branches: { orderBy: { createdAt: "asc" } },
      versions: {
        orderBy: { number: "asc" },
        include: { variables: true },
      },
    },
  });
  if (!p) throw new NotFoundError("Prompt", `${projectId}/${slug}`);
  return p;
}

export async function listPrompts(
  ctx: ServiceContext,
  projectId: string,
  opts: { includeArchived?: boolean } = {},
) {
  return ctx.prisma.prompt.findMany({
    where: {
      projectId,
      ...(opts.includeArchived ? {} : { archivedAt: null }),
    },
    orderBy: { updatedAt: "desc" },
    include: {
      canonicalBranch: { include: { head: true } },
      _count: { select: { versions: true, branches: true } },
    },
  });
}
