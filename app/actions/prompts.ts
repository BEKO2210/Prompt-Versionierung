"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { defaultContext } from "../../src/services/context";
import { createPrompt } from "../../src/services/promptService";
import { createVersion, pointerPromote, squashedPromote, transitionStatus } from "../../src/services/versionService";
import { createBranch } from "../../src/services/branchService";
import type { VersionStatus } from "../../src/domain/status";

export async function createPromptAction(
  projectId: string,
  projectSlug: string,
  formData: FormData,
): Promise<void> {
  const name = String(formData.get("name") ?? "").trim();
  const purpose = String(formData.get("purpose") ?? "").trim();
  const title = String(formData.get("title") ?? "Initial version").trim() || "Initial version";
  const body = String(formData.get("body") ?? "").trim();
  if (!name || !body) return;

  const prompt = await createPrompt(defaultContext(), {
    projectId,
    name,
    purpose: purpose || undefined,
    initialVersion: { title, body, variables: [] },
  });
  revalidatePath(`/p/${projectSlug}/prompts`);
  redirect(`/p/${projectSlug}/prompts/${prompt.slug}`);
}

export async function createVersionAction(
  projectSlug: string,
  promptSlug: string,
  promptId: string,
  parentVersionId: string,
  branchId: string,
  formData: FormData,
): Promise<void> {
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "");
  const changeSummary = String(formData.get("changeSummary") ?? "").trim();
  const rationale = String(formData.get("rationale") ?? "").trim();
  const expectedImprovement = String(formData.get("expectedImprovement") ?? "").trim();
  if (!title || !body || !changeSummary) return;
  const v = await createVersion(defaultContext(), {
    promptId,
    parentVersionId,
    branchId,
    title,
    body,
    variables: [],
    status: "draft",
    changeSummary,
    rationale: rationale || null,
    expectedImprovement: expectedImprovement || null,
  });
  revalidatePath(`/p/${projectSlug}/prompts/${promptSlug}`);
  redirect(`/p/${projectSlug}/prompts/${promptSlug}/v/${v.id}`);
}

export async function forkBranchAction(
  projectSlug: string,
  promptSlug: string,
  promptId: string,
  fromVersionId: string,
  formData: FormData,
): Promise<void> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  await createBranch(defaultContext(), {
    promptId,
    name,
    fromVersionId,
  });
  revalidatePath(`/p/${projectSlug}/prompts/${promptSlug}`);
}

export async function transitionStatusAction(
  projectSlug: string,
  promptSlug: string,
  versionId: string,
  to: VersionStatus,
): Promise<void> {
  await transitionStatus(defaultContext(), versionId, to);
  revalidatePath(`/p/${projectSlug}/prompts/${promptSlug}`);
  revalidatePath(`/p/${projectSlug}/prompts/${promptSlug}/v/${versionId}`);
}

export async function promoteAction(
  projectSlug: string,
  promptSlug: string,
  versionId: string,
  formData: FormData,
): Promise<void> {
  const rationale = String(formData.get("rationale") ?? "").trim();
  const mode = String(formData.get("mode") ?? "pointer");
  if (!rationale) return;
  if (mode === "squashed") {
    await squashedPromote(defaultContext(), versionId, rationale);
  } else {
    await pointerPromote(defaultContext(), versionId, rationale);
  }
  revalidatePath(`/p/${projectSlug}/prompts/${promptSlug}`);
}
