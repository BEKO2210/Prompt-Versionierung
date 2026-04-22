"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { defaultContext } from "../../src/services/context";
import { createProject } from "../../src/services/projectService";
import { slugify } from "../../src/lib/slug";

export async function createProjectAction(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!name) return;
  const project = await createProject(defaultContext(), {
    name,
    description: description || undefined,
  });
  revalidatePath("/");
  redirect(`/p/${slugify(project.slug)}`);
}
