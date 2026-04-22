import { Shell } from "../../../../src/ui/common/Shell";
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
    <Shell projectSlug={slug} title="Datasets & test cases">
      <div className="grid grid-cols-[2fr_1fr] gap-6">
        <section>
          {datasets.length === 0 ? (
            <p className="text-sm text-ink-500">No datasets yet.</p>
          ) : (
            <ul className="space-y-3">
              {datasets.map((d) => (
                <li key={d.id} className="rounded border border-ink-200/70 dark:border-ink-800 p-3">
                  <div className="flex items-baseline gap-2">
                    <span className="font-medium">{d.name}</span>
                    <span className="text-xs text-ink-500">{d.testCases.length} cases</span>
                  </div>
                  {d.description && <p className="text-sm text-ink-500">{d.description}</p>}
                  {d.testCases.length > 0 && (
                    <ul className="mt-2 text-xs text-ink-500 space-y-0.5">
                      {d.testCases.slice(0, 6).map((tc) => (
                        <li key={tc.id} className="flex gap-2">
                          <span className="font-mono">{tc.expectedKind}</span>
                          <span>{tc.name}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="space-y-6">
          <form action={boundDs} className="space-y-2 rounded border border-ink-200/70 dark:border-ink-800 p-4 text-sm">
            <h3 className="text-xs uppercase tracking-wider text-ink-500">New dataset</h3>
            <input name="name" placeholder="name" required className={inputCls} />
            <input name="description" placeholder="description" className={inputCls} />
            <button className="rounded-md bg-ink-900 dark:bg-ink-100 text-ink-50 dark:text-ink-900 px-3 py-1.5 font-medium">
              Create dataset
            </button>
          </form>
          <form action={boundTc} className="space-y-2 rounded border border-ink-200/70 dark:border-ink-800 p-4 text-sm">
            <h3 className="text-xs uppercase tracking-wider text-ink-500">New test case</h3>
            <select name="datasetId" className={inputCls} defaultValue="">
              <option value="">(orphan — no dataset)</option>
              {datasets.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <input name="name" placeholder="name" required className={inputCls} />
            <textarea name="inputVariables" placeholder='{"name":"value"} inputVariables JSON' rows={3} className={`${inputCls} font-mono`} defaultValue="{}" />
            <textarea name="expectedOutput" placeholder="expected output (optional)" rows={2} className={`${inputCls} font-mono`} />
            <select name="expectedKind" className={inputCls} defaultValue="none">
              <option value="none">no automatic assertion</option>
              <option value="contains">contains</option>
              <option value="exact">exact</option>
              <option value="regex">regex</option>
              <option value="schema">schema (JSON shape)</option>
              <option value="rubric">rubric</option>
            </select>
            <button className="rounded-md bg-ink-900 dark:bg-ink-100 text-ink-50 dark:text-ink-900 px-3 py-1.5 font-medium">
              Create test case
            </button>
          </form>
        </section>
      </div>
    </Shell>
  );
}

const inputCls = "w-full rounded border border-ink-300/70 dark:border-ink-700 bg-transparent px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-ink-500";
