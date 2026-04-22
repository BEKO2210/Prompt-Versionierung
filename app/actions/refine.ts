"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { defaultContext } from "../../src/services/context";
import { acceptSuggestion, diagnose, rejectSuggestion } from "../../src/services/refinementService";

export async function diagnoseAction(
  projectSlug: string,
  promptSlug: string,
  versionId: string,
): Promise<void> {
  await diagnose(defaultContext(), versionId);
  revalidatePath(`/p/${projectSlug}/prompts/${promptSlug}/refine/${versionId}`);
}

export async function acceptSuggestionAction(
  projectSlug: string,
  promptSlug: string,
  suggestionId: string,
  formData: FormData,
): Promise<void> {
  const changeSummary = String(formData.get("changeSummary") ?? "").trim();
  const rationale = String(formData.get("rationale") ?? "").trim();
  const expectedImprovement = String(formData.get("expectedImprovement") ?? "").trim();
  if (!changeSummary) return;
  const { version } = await acceptSuggestion(defaultContext(), {
    suggestionId,
    changeSummary,
    rationale: rationale || null,
    expectedImprovement: expectedImprovement || null,
    forkToNewBranch: true,
  });
  revalidatePath(`/p/${projectSlug}/prompts/${promptSlug}`);
  redirect(`/p/${projectSlug}/prompts/${promptSlug}/v/${version.id}`);
}

export async function rejectSuggestionAction(
  projectSlug: string,
  promptSlug: string,
  versionId: string,
  suggestionId: string,
  formData: FormData,
): Promise<void> {
  const reason = String(formData.get("reason") ?? "").trim();
  await rejectSuggestion(defaultContext(), suggestionId, reason || undefined);
  revalidatePath(`/p/${projectSlug}/prompts/${promptSlug}/refine/${versionId}`);
}
