import { z } from "zod";
import { ValidationError } from "../domain/errors";
import type { ServiceContext } from "./context";

export const CreateModelProfileSchema = z.object({
  projectId: z.string(),
  name: z.string().min(1).max(100),
  provider: z.enum(["anthropic", "openai", "mock", "custom"]),
  modelId: z.string().min(1),
  defaultTemperature: z.number().min(0).max(2).default(0.7),
  defaultMaxTokens: z.number().int().min(1).max(200_000).default(1024),
  settings: z.record(z.unknown()).optional(),
});

export async function createModelProfile(
  ctx: ServiceContext,
  input: z.infer<typeof CreateModelProfileSchema>,
) {
  const parsed = CreateModelProfileSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.message);
  return ctx.prisma.modelProfile.create({
    data: {
      projectId: parsed.data.projectId,
      name: parsed.data.name,
      provider: parsed.data.provider,
      modelId: parsed.data.modelId,
      defaultTemperature: parsed.data.defaultTemperature,
      defaultMaxTokens: parsed.data.defaultMaxTokens,
      settings: parsed.data.settings ? JSON.stringify(parsed.data.settings) : null,
    },
  });
}

export async function listModelProfiles(ctx: ServiceContext, projectId: string) {
  return ctx.prisma.modelProfile.findMany({
    where: { projectId },
    orderBy: { name: "asc" },
  });
}
