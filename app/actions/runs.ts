"use server";
import { revalidatePath } from "next/cache";
import { defaultContext } from "../../src/services/context";
import { createRun } from "../../src/services/runService";

export async function createRunAction(
  projectSlug: string,
  promptSlug: string,
  versionId: string,
  formData: FormData,
): Promise<void> {
  const modelProfileId = String(formData.get("modelProfileId") ?? "").trim();
  if (!modelProfileId) return;
  const evaluators = formData.getAll("evaluators").map(String) as Array<"regex" | "schema" | "similarity" | "rubric">;
  const testCaseId = String(formData.get("testCaseId") ?? "") || null;
  const rawBindings = String(formData.get("bindings") ?? "").trim();
  let bindings: Record<string, unknown> = {};
  if (rawBindings) {
    try { bindings = JSON.parse(rawBindings); } catch { return; }
  }
  await createRun(defaultContext(), {
    versionId,
    modelProfileId,
    testCaseId,
    variableBindings: bindings,
    evaluators,
    rubricId: null,
  });
  revalidatePath(`/p/${projectSlug}/prompts/${promptSlug}/v/${versionId}`);
}
