import { z } from "zod";
import { NotFoundError, ValidationError } from "../domain/errors";
import { render, type VariableDecl } from "../domain/rendering";
import { resolveModelAdapter } from "../adapters/models/registry";
import { resolveEvaluator } from "../adapters/evaluators/registry";
import type { ServiceContext } from "./context";

export const CreateRunSchema = z.object({
  versionId: z.string(),
  modelProfileId: z.string(),
  testCaseId: z.string().optional().nullable(),
  variableBindings: z.record(z.unknown()).default({}),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(200_000).optional(),
  evaluators: z.array(z.enum(["regex", "schema", "similarity", "rubric"])).default([]),
  rubricId: z.string().optional().nullable(),
});

export type CreateRunInput = z.infer<typeof CreateRunSchema>;

/**
 * Render, execute, and evaluate — all in one service call. MVP is synchronous
 * because the default model adapter is the mock. Swap to background queue
 * in M1 by returning the run row in `queued` and dispatching a job.
 */
export async function createRun(ctx: ServiceContext, input: CreateRunInput) {
  const parsed = CreateRunSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.message);

  const version = await ctx.prisma.promptVersion.findUnique({
    where: { id: parsed.data.versionId },
    include: { variables: true },
  });
  if (!version) throw new NotFoundError("Version", parsed.data.versionId);

  const model = await ctx.prisma.modelProfile.findUnique({
    where: { id: parsed.data.modelProfileId },
  });
  if (!model) throw new NotFoundError("ModelProfile", parsed.data.modelProfileId);

  let expectedOutput: string | null = null;
  let expectedKind = "none";
  let assertions: unknown = null;
  let bindings: Record<string, unknown> = parsed.data.variableBindings;
  if (parsed.data.testCaseId) {
    const tc = await ctx.prisma.promptTestCase.findUnique({
      where: { id: parsed.data.testCaseId },
    });
    if (!tc) throw new NotFoundError("TestCase", parsed.data.testCaseId);
    try {
      bindings = { ...JSON.parse(tc.inputVariables), ...bindings };
    } catch {
      throw new ValidationError("Test case inputVariables is not valid JSON");
    }
    expectedOutput = tc.expectedOutput;
    expectedKind = tc.expectedKind;
    if (tc.assertions) {
      try {
        assertions = JSON.parse(tc.assertions);
      } catch {
        throw new ValidationError("Test case assertions is not valid JSON");
      }
    }
  }

  const decls: VariableDecl[] = version.variables.map((v) => ({
    name: v.name,
    type: v.type as VariableDecl["type"],
    required: v.required,
    defaultValue: v.defaultValue ? JSON.parse(v.defaultValue) : undefined,
    enumValues: v.enumValues ? (JSON.parse(v.enumValues) as string[]) : undefined,
  }));

  const rendered = render(version.body, decls, bindings);

  const temperature = parsed.data.temperature ?? model.defaultTemperature;
  const maxTokens = parsed.data.maxTokens ?? model.defaultMaxTokens;

  const run = await ctx.prisma.promptRun.create({
    data: {
      versionId: version.id,
      modelProfileId: model.id,
      testCaseId: parsed.data.testCaseId ?? null,
      renderedPrompt: rendered.rendered,
      variableBindings: JSON.stringify(rendered.usedBindings),
      status: "running",
      temperature,
      maxTokens,
      startedAt: ctx.now(),
    },
  });

  const adapter = resolveModelAdapter(model.provider);
  const start = Date.now();
  try {
    const result = await adapter.call({
      prompt: rendered.rendered,
      modelId: model.modelId,
      temperature,
      maxTokens,
      messages: version.messages ? JSON.parse(version.messages) : null,
    });
    await ctx.prisma.promptRun.update({
      where: { id: run.id },
      data: {
        status: "succeeded",
        rawOutput: result.rawOutput,
        inputTokens: result.inputTokens ?? null,
        outputTokens: result.outputTokens ?? null,
        latencyMs: result.latencyMs,
        costEstimate: result.costEstimate ?? null,
        finishedAt: ctx.now(),
      },
    });

    // Resolve rubric if referenced.
    let rubric: { criteria: Array<{ name: string; description: string; weight: number; scale: { min: number; max: number } }> } | null = null;
    if (parsed.data.rubricId) {
      const r = await ctx.prisma.promptRubric.findUnique({
        where: { id: parsed.data.rubricId },
      });
      if (r) {
        try {
          rubric = { criteria: JSON.parse(r.criteria) };
        } catch {
          rubric = null;
        }
      }
    }

    for (const evk of parsed.data.evaluators) {
      const ev = resolveEvaluator(evk);
      if (!ev) continue;
      const out = await ev.run({
        renderedPrompt: rendered.rendered,
        rawOutput: result.rawOutput,
        expectedOutput,
        expectedKind,
        assertions,
        rubric,
      });
      await ctx.prisma.promptEvaluation.create({
        data: {
          runId: run.id,
          evaluatorKind: out.evaluatorKind,
          evaluatorRef: null,
          rubricId: evk === "rubric" ? parsed.data.rubricId ?? null : null,
          score: out.score,
          passed: out.passed,
          notes: out.notes,
          criteriaScores: out.criteriaScores ? JSON.stringify(out.criteriaScores) : null,
        },
      });
    }
  } catch (err) {
    await ctx.prisma.promptRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        error: (err as Error).message,
        latencyMs: Date.now() - start,
        finishedAt: ctx.now(),
      },
    });
  }

  return ctx.prisma.promptRun.findUniqueOrThrow({
    where: { id: run.id },
    include: { evaluations: true, modelProfile: true, testCase: true },
  });
}

export async function listRuns(ctx: ServiceContext, versionId: string) {
  return ctx.prisma.promptRun.findMany({
    where: { versionId },
    orderBy: { createdAt: "desc" },
    include: { evaluations: true, modelProfile: true, testCase: true },
  });
}
