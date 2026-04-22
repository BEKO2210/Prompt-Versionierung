import { z } from "zod";
import { ConflictError, NotFoundError, ValidationError } from "../domain/errors";
import { slugify } from "../lib/slug";
import type { ServiceContext } from "./context";

export const CreateProjectSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(64).optional(),
  description: z.string().max(500).optional(),
});

export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;

export async function createProject(ctx: ServiceContext, input: CreateProjectInput) {
  const parsed = CreateProjectSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.message);

  const slug = parsed.data.slug ? slugify(parsed.data.slug) : slugify(parsed.data.name);
  const existing = await ctx.prisma.promptProject.findUnique({ where: { slug } });
  if (existing) throw new ConflictError(`Project slug already exists: ${slug}`);

  return ctx.prisma.promptProject.create({
    data: {
      slug,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
    },
  });
}

export async function listProjects(ctx: ServiceContext, opts: { includeArchived?: boolean } = {}) {
  return ctx.prisma.promptProject.findMany({
    where: opts.includeArchived ? undefined : { archivedAt: null },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getProjectBySlug(ctx: ServiceContext, slug: string) {
  const p = await ctx.prisma.promptProject.findUnique({ where: { slug } });
  if (!p) throw new NotFoundError("Project", slug);
  return p;
}

export async function archiveProject(ctx: ServiceContext, id: string) {
  return ctx.prisma.promptProject.update({
    where: { id },
    data: { archivedAt: ctx.now() },
  });
}
