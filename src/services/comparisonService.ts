import { NotFoundError, ValidationError } from "../domain/errors";
import { diffText, diffVariables, diffMetadata } from "../domain/diff";
import type { ServiceContext } from "./context";

export async function compare(
  ctx: ServiceContext,
  versionAId: string,
  versionBId: string,
) {
  if (versionAId === versionBId) {
    throw new ValidationError("Cannot compare a version with itself");
  }
  const [a, b] = await Promise.all([
    ctx.prisma.promptVersion.findUnique({
      where: { id: versionAId },
      include: { variables: true, runs: { include: { evaluations: true, testCase: true, modelProfile: true } } },
    }),
    ctx.prisma.promptVersion.findUnique({
      where: { id: versionBId },
      include: { variables: true, runs: { include: { evaluations: true, testCase: true, modelProfile: true } } },
    }),
  ]);
  if (!a) throw new NotFoundError("Version", versionAId);
  if (!b) throw new NotFoundError("Version", versionBId);
  if (a.promptId !== b.promptId) {
    throw new ValidationError("Cannot compare versions from different prompts");
  }

  const aSafe = a;
  const bSafe = b;

  const text = diffText(aSafe.body, bSafe.body);
  const variables = diffVariables(
    aSafe.variables.map((v) => ({
      name: v.name,
      type: v.type,
      required: v.required,
      defaultValue: v.defaultValue ? JSON.parse(v.defaultValue) : undefined,
    })),
    bSafe.variables.map((v) => ({
      name: v.name,
      type: v.type,
      required: v.required,
      defaultValue: v.defaultValue ? JSON.parse(v.defaultValue) : undefined,
    })),
  );
  const metadata = diffMetadata(
    { title: aSafe.title, status: aSafe.status, modelHintId: aSafe.modelHintId, rationale: aSafe.rationale },
    { title: bSafe.title, status: bSafe.status, modelHintId: bSafe.modelHintId, rationale: bSafe.rationale },
  );

  // Pair runs by (testCaseId, modelProfileId). Aggregate score = mean of
  // non-null evaluation scores per run.
  function agg(runs: typeof aSafe.runs) {
    const byKey = new Map<string, { key: string; score: number | null; testCase: string; model: string }>();
    for (const r of runs) {
      const scores = r.evaluations.map((e) => e.score).filter((s): s is number => s != null);
      const mean = scores.length > 0 ? scores.reduce((x, y) => x + y, 0) / scores.length : null;
      const key = `${r.testCaseId ?? "ad-hoc"}:${r.modelProfileId}`;
      // Keep the latest run per pair.
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, {
          key,
          score: mean,
          testCase: r.testCase?.name ?? "ad-hoc",
          model: r.modelProfile.name,
        });
      }
    }
    return byKey;
  }
  const aAgg = agg(aSafe.runs);
  const bAgg = agg(bSafe.runs);
  const allKeys = new Set([...aAgg.keys(), ...bAgg.keys()]);
  const runEvidence = [...allKeys].map((k) => ({
    key: k,
    testCase: aAgg.get(k)?.testCase ?? bAgg.get(k)?.testCase ?? "?",
    model: aAgg.get(k)?.model ?? bAgg.get(k)?.model ?? "?",
    scoreA: aAgg.get(k)?.score ?? null,
    scoreB: bAgg.get(k)?.score ?? null,
  }));

  return { a: aSafe, b: bSafe, text, variables, metadata, runEvidence };
}

export async function savePreference(
  ctx: ServiceContext,
  input: {
    promptId: string;
    versionAId: string;
    versionBId: string;
    preferredVersionId: string;
    notes?: string;
  },
) {
  if (
    input.preferredVersionId !== input.versionAId &&
    input.preferredVersionId !== input.versionBId
  ) {
    throw new ValidationError("preferredVersionId must be one of the compared versions");
  }
  return ctx.prisma.promptComparison.create({
    data: {
      promptId: input.promptId,
      versionAId: input.versionAId,
      versionBId: input.versionBId,
      preferredVersionId: input.preferredVersionId,
      notes: input.notes ?? null,
      createdBy: ctx.actor ?? null,
    },
  });
}
