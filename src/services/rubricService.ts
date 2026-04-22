import { z } from "zod";
import { ValidationError } from "../domain/errors";
import type { ServiceContext } from "./context";

export const CriterionSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(""),
  weight: z.number().min(0).default(1),
  scale: z
    .object({ min: z.number(), max: z.number() })
    .default({ min: 0, max: 1 }),
});

export const CreateRubricSchema = z.object({
  projectId: z.string(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  criteria: z.array(CriterionSchema).min(1),
});

export async function createRubric(
  ctx: ServiceContext,
  input: z.infer<typeof CreateRubricSchema>,
) {
  const parsed = CreateRubricSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.message);
  return ctx.prisma.promptRubric.create({
    data: {
      projectId: parsed.data.projectId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      criteria: JSON.stringify(parsed.data.criteria),
    },
  });
}

export async function listRubrics(ctx: ServiceContext, projectId: string) {
  return ctx.prisma.promptRubric.findMany({
    where: { projectId },
    orderBy: { name: "asc" },
  });
}
