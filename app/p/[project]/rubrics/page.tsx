import { Shell } from "../../../../src/ui/common/Shell";
import { defaultContext } from "../../../../src/services/context";
import { getProjectBySlug } from "../../../../src/services/projectService";
import { createRubric, listRubrics } from "../../../../src/services/rubricService";
import { revalidatePath } from "next/cache";

async function createRubricAction(projectId: string, projectSlug: string, formData: FormData) {
  "use server";
  const name = String(formData.get("name") ?? "").trim();
  const rawCriteria = String(formData.get("criteria") ?? "[]");
  if (!name) return;
  let criteria: Array<{ name: string; description?: string; weight?: number; scale?: { min: number; max: number } }> = [];
  try { criteria = JSON.parse(rawCriteria); } catch { return; }
  await createRubric(defaultContext(), {
    projectId,
    name,
    description: String(formData.get("description") ?? "").trim() || undefined,
    criteria: criteria.map((c) => ({
      name: c.name,
      description: c.description ?? "",
      weight: c.weight ?? 1,
      scale: c.scale ?? { min: 0, max: 1 },
    })),
  });
  revalidatePath(`/p/${projectSlug}/rubrics`);
}

export default async function RubricsPage({
  params,
}: {
  params: Promise<{ project: string }>;
}) {
  const { project: slug } = await params;
  const project = await getProjectBySlug(defaultContext(), slug);
  const rubrics = await listRubrics(defaultContext(), project.id);
  const bound = createRubricAction.bind(null, project.id, slug);

  return (
    <Shell projectSlug={slug} title="Rubrics">
      <div className="grid grid-cols-[2fr_1fr] gap-6">
        <section>
          {rubrics.length === 0 ? (
            <p className="text-sm text-ink-500">No rubrics yet.</p>
          ) : (
            <ul className="space-y-3">
              {rubrics.map((r) => {
                let crit: Array<{ name: string; description: string; weight: number }> = [];
                try { crit = JSON.parse(r.criteria); } catch { /* ignore */ }
                return (
                  <li key={r.id} className="rounded border border-ink-200/70 dark:border-ink-800 p-3">
                    <div className="font-medium">{r.name}</div>
                    {r.description && <p className="text-sm text-ink-500">{r.description}</p>}
                    <ul className="mt-2 text-xs text-ink-500 space-y-0.5">
                      {crit.map((c, i) => (
                        <li key={i} className="flex gap-3">
                          <span className="font-mono">×{c.weight}</span>
                          <span>{c.name}</span>
                          <span className="text-ink-400 truncate">{c.description}</span>
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <section>
          <form action={bound} className="space-y-2 rounded border border-ink-200/70 dark:border-ink-800 p-4 text-sm">
            <h3 className="text-xs uppercase tracking-wider text-ink-500">New rubric</h3>
            <input name="name" placeholder="name" required className={inputCls} />
            <input name="description" placeholder="description" className={inputCls} />
            <textarea
              name="criteria"
              rows={8}
              defaultValue={JSON.stringify(
                [
                  { name: "correctness", weight: 2, scale: { min: 0, max: 1 } },
                  { name: "clarity", weight: 1, scale: { min: 0, max: 1 } },
                ],
                null,
                2,
              )}
              className={`${inputCls} font-mono`}
            />
            <button className="rounded-md bg-ink-900 dark:bg-ink-100 text-ink-50 dark:text-ink-900 px-3 py-1.5 font-medium">
              Create rubric
            </button>
          </form>
        </section>
      </div>
    </Shell>
  );
}

const inputCls = "w-full rounded border border-ink-300/70 dark:border-ink-700 bg-transparent px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-ink-500";
