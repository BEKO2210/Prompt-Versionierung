import { Shell } from "../../../../src/ui/common/Shell";
import { Card } from "../../../../src/ui/common/Card";
import { Button } from "../../../../src/ui/common/Button";
import { Field, Input, Textarea } from "../../../../src/ui/common/Input";
import { Eyebrow } from "../../../../src/ui/common/Eyebrow";
import { IconPlus, IconRubric } from "../../../../src/ui/common/Icon";
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
    <Shell
      projectSlug={slug}
      currentPath={`/p/${slug}/rubrics`}
      title="Rubrics"
      subtitle="Reusable scoring criteria for structured evaluations."
    >
      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-6">
        <section>
          {rubrics.length === 0 ? (
            <Card className="p-6 border-dashed text-center">
              <div className="mx-auto w-10 h-10 rounded-full bg-ink-100 dark:bg-ink-800 flex items-center justify-center mb-2">
                <IconRubric size={16} className="text-ink-500" />
              </div>
              <div className="font-medium text-ink-800 dark:text-ink-100">No rubrics yet</div>
              <p className="text-sm text-ink-500 mt-1">
                Define weighted criteria once, then reuse them across runs.
              </p>
            </Card>
          ) : (
            <ul className="space-y-3">
              {rubrics.map((r) => {
                let crit: Array<{ name: string; description: string; weight: number }> = [];
                try { crit = JSON.parse(r.criteria); } catch { /* ignore */ }
                return (
                  <li key={r.id}>
                    <Card>
                      <div className="flex items-center gap-2 mb-1">
                        <IconRubric size={14} className="text-ink-500" />
                        <span className="font-semibold text-ink-900 dark:text-ink-50">{r.name}</span>
                      </div>
                      {r.description && (
                        <p className="text-[13px] text-ink-500 mb-2">{r.description}</p>
                      )}
                      <ul className="divide-y divide-ink-200/70 dark:divide-ink-800/70 -mx-4">
                        {crit.map((c, i) => (
                          <li key={i} className="px-4 py-1.5 flex items-center gap-3 text-[13px]">
                            <span className="font-mono text-[11px] text-ink-500 w-8">×{c.weight}</span>
                            <span className="font-medium text-ink-800 dark:text-ink-100">{c.name}</span>
                            <span className="text-ink-500 dark:text-ink-400 truncate">{c.description}</span>
                          </li>
                        ))}
                      </ul>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section>
          <Card>
            <Eyebrow className="mb-3">New rubric</Eyebrow>
            <form action={bound} className="space-y-3">
              <Field label="Name" required>
                <Input name="name" required placeholder="answer-quality" />
              </Field>
              <Field label="Description">
                <Input name="description" placeholder="General quality rubric for short answers" />
              </Field>
              <Field label="Criteria (JSON)" hint="Array of {name, description, weight, scale}">
                <Textarea
                  name="criteria"
                  rows={10}
                  defaultValue={JSON.stringify(
                    [
                      { name: "correctness", description: "Factually correct", weight: 2, scale: { min: 0, max: 1 } },
                      { name: "clarity",     description: "Easy to read",      weight: 1, scale: { min: 0, max: 1 } },
                    ],
                    null,
                    2,
                  )}
                />
              </Field>
              <Button type="submit" variant="accent">
                <IconPlus size={13} /> Create rubric
              </Button>
            </form>
          </Card>
        </section>
      </div>
    </Shell>
  );
}
