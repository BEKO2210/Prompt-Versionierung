import { Shell } from "../../../../src/ui/common/Shell";
import { Card } from "../../../../src/ui/common/Card";
import { Button } from "../../../../src/ui/common/Button";
import { Field, Input, Select, Textarea } from "../../../../src/ui/common/Input";
import { Eyebrow } from "../../../../src/ui/common/Eyebrow";
import { IconDataset, IconPlus } from "../../../../src/ui/common/Icon";
import { defaultContext } from "../../../../src/services/context";
import { getProjectBySlug } from "../../../../src/services/projectService";
import {
  createDataset,
  createTestCase,
  listDatasets,
} from "../../../../src/services/datasetService";
import { revalidatePath } from "next/cache";

async function createDatasetAction(projectId: string, projectSlug: string, formData: FormData) {
  "use server";
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  await createDataset(defaultContext(), {
    projectId,
    name,
    description: String(formData.get("description") ?? "").trim() || undefined,
  });
  revalidatePath(`/p/${projectSlug}/datasets`);
}

async function createTestCaseAction(projectSlug: string, formData: FormData) {
  "use server";
  const datasetId = String(formData.get("datasetId") ?? "") || null;
  const name = String(formData.get("name") ?? "").trim();
  const rawVars = String(formData.get("inputVariables") ?? "{}");
  const expected = String(formData.get("expectedOutput") ?? "").trim() || null;
  const expectedKind = String(formData.get("expectedKind") ?? "none") as
    | "contains" | "regex" | "exact" | "schema" | "rubric" | "none";
  if (!name) return;
  let inputVariables: Record<string, unknown> = {};
  try { inputVariables = JSON.parse(rawVars); } catch { return; }
  await createTestCase(defaultContext(), {
    datasetId,
    name,
    inputVariables,
    expectedOutput: expected,
    expectedKind,
  });
  revalidatePath(`/p/${projectSlug}/datasets`);
}

export default async function DatasetsPage({
  params,
}: {
  params: Promise<{ project: string }>;
}) {
  const { project: slug } = await params;
  const project = await getProjectBySlug(defaultContext(), slug);
  const datasets = await listDatasets(defaultContext(), project.id);
  const boundDs = createDatasetAction.bind(null, project.id, slug);
  const boundTc = createTestCaseAction.bind(null, slug);

  return (
    <Shell
      projectSlug={slug}
      currentPath={`/p/${slug}/datasets`}
      title="Datasets & test cases"
      subtitle="Reusable inputs for runs. One dataset can have many cases."
    >
      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-6">
        <section>
          {datasets.length === 0 ? (
            <Card className="p-6 border-dashed text-center">
              <div className="mx-auto w-10 h-10 rounded-full bg-ink-100 dark:bg-ink-800 flex items-center justify-center mb-2">
                <IconDataset size={16} className="text-ink-500" />
              </div>
              <div className="font-medium text-ink-800 dark:text-ink-100">No datasets yet</div>
              <p className="text-sm text-ink-500 mt-1">
                Create one on the right, then attach test cases.
              </p>
            </Card>
          ) : (
            <ul className="space-y-3">
              {datasets.map((d) => (
                <li key={d.id}>
                  <Card>
                    <div className="flex items-baseline justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <IconDataset size={14} className="text-ink-500" />
                        <span className="font-semibold text-ink-900 dark:text-ink-50">{d.name}</span>
                      </div>
                      <span className="text-[11px] text-ink-500">
                        {d.testCases.length} case{d.testCases.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    {d.description && (
                      <p className="text-[13px] text-ink-500 dark:text-ink-400 mb-2">{d.description}</p>
                    )}
                    {d.testCases.length > 0 && (
                      <ul className="mt-2 divide-y divide-ink-200/70 dark:divide-ink-800/70 -mx-4">
                        {d.testCases.slice(0, 6).map((tc) => (
                          <li key={tc.id} className="px-4 py-1.5 flex items-center gap-3 text-[13px]">
                            <span className="font-mono text-[10px] bg-ink-100 dark:bg-ink-800 text-ink-600 dark:text-ink-300 px-1.5 py-0.5 rounded">
                              {tc.expectedKind}
                            </span>
                            <span>{tc.name}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-4">
          <Card>
            <Eyebrow className="mb-3">New dataset</Eyebrow>
            <form action={boundDs} className="space-y-3">
              <Field label="Name" required>
                <Input name="name" required placeholder="support-tickets" />
              </Field>
              <Field label="Description">
                <Input name="description" placeholder="Labelled inputs for classification tests" />
              </Field>
              <Button type="submit" variant="primary">
                <IconPlus size={13} /> Create dataset
              </Button>
            </form>
          </Card>

          <Card>
            <Eyebrow className="mb-3">New test case</Eyebrow>
            <form action={boundTc} className="space-y-3">
              <Field label="Dataset">
                <Select name="datasetId" defaultValue="">
                  <option value="">(orphan — no dataset)</option>
                  {datasets.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </Select>
              </Field>
              <Field label="Name" required>
                <Input name="name" required placeholder="billing-refund" />
              </Field>
              <Field label="Input variables (JSON)" hint='{"name":"value"} map used to render the prompt.'>
                <Textarea name="inputVariables" rows={3} defaultValue="{}" />
              </Field>
              <Field label="Expected output">
                <Textarea name="expectedOutput" rows={2} />
              </Field>
              <Field label="Expected kind">
                <Select name="expectedKind" defaultValue="none">
                  <option value="none">no automatic assertion</option>
                  <option value="contains">contains substring</option>
                  <option value="exact">exact match</option>
                  <option value="regex">regex</option>
                  <option value="schema">JSON shape</option>
                  <option value="rubric">rubric</option>
                </Select>
              </Field>
              <Button type="submit" variant="accent">
                <IconPlus size={13} /> Create test case
              </Button>
            </form>
          </Card>
        </section>
      </div>
    </Shell>
  );
}
