import { z } from "zod";
import { ValidationError } from "../domain/errors";
import type { ServiceContext } from "./context";

export const CreateDatasetSchema = z.object({
  projectId: z.string(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});

export async function createDataset(
  ctx: ServiceContext,
  input: z.infer<typeof CreateDatasetSchema>,
) {
  const parsed = CreateDatasetSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.message);
  return ctx.prisma.promptDataset.create({
    data: {
      projectId: parsed.data.projectId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
    },
  });
}

export const CreateTestCaseSchema = z.object({
  datasetId: z.string().optional().nullable(),
  name: z.string().min(1).max(120),
  inputVariables: z.record(z.unknown()),
  expectedOutput: z.string().optional().nullable(),
  expectedKind: z.enum(["contains", "regex", "exact", "schema", "rubric", "none"]).default("none"),
  assertions: z.array(z.unknown()).optional(),
});

export async function createTestCase(
  ctx: ServiceContext,
  input: z.infer<typeof CreateTestCaseSchema>,
) {
  const parsed = CreateTestCaseSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.message);
  return ctx.prisma.promptTestCase.create({
    data: {
      datasetId: parsed.data.datasetId ?? null,
      name: parsed.data.name,
      inputVariables: JSON.stringify(parsed.data.inputVariables),
      expectedOutput: parsed.data.expectedOutput ?? null,
      expectedKind: parsed.data.expectedKind,
      assertions: parsed.data.assertions ? JSON.stringify(parsed.data.assertions) : null,
    },
  });
}

export async function listDatasets(ctx: ServiceContext, projectId: string) {
  return ctx.prisma.promptDataset.findMany({
    where: { projectId },
    include: { testCases: true },
    orderBy: { name: "asc" },
  });
}

export async function listTestCases(ctx: ServiceContext, projectId: string) {
  return ctx.prisma.promptTestCase.findMany({
    where: { OR: [{ dataset: { projectId } }, { datasetId: null }] },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}
