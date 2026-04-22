import { Shell } from "../../../../src/ui/common/Shell";
import { defaultContext } from "../../../../src/services/context";
import { getProjectBySlug } from "../../../../src/services/projectService";
import { createModelProfile, listModelProfiles } from "../../../../src/services/modelProfileService";
import { revalidatePath } from "next/cache";

async function createAction(projectId: string, projectSlug: string, formData: FormData) {
  "use server";
  const name = String(formData.get("name") ?? "").trim();
  const provider = String(formData.get("provider") ?? "mock") as "mock" | "anthropic" | "openai" | "custom";
  const modelId = String(formData.get("modelId") ?? "").trim();
  if (!name || !modelId) return;
  await createModelProfile(defaultContext(), {
    projectId,
    name,
    provider,
    modelId,
    defaultTemperature: Number(formData.get("temperature") ?? 0.7),
    defaultMaxTokens: Number(formData.get("maxTokens") ?? 1024),
  });
  revalidatePath(`/p/${projectSlug}/models`);
}

export default async function ModelsPage({
  params,
}: {
  params: Promise<{ project: string }>;
}) {
  const { project: slug } = await params;
  const project = await getProjectBySlug(defaultContext(), slug);
  const models = await listModelProfiles(defaultContext(), project.id);
  const bound = createAction.bind(null, project.id, slug);

  return (
    <Shell projectSlug={slug} title="Model profiles">
      <div className="grid grid-cols-[2fr_1fr] gap-6">
        <section>
          {models.length === 0 ? (
            <p className="text-sm text-ink-500">No model profiles yet. Add one on the right; the `mock` provider works with no API key.</p>
          ) : (
            <ul className="rounded border border-ink-200/70 dark:border-ink-800 divide-y divide-ink-200/70 dark:divide-ink-800">
              {models.map((m) => (
                <li key={m.id} className="px-3 py-2 text-sm flex items-center gap-3">
                  <span className="font-medium">{m.name}</span>
                  <span className="text-ink-500">{m.provider}:{m.modelId}</span>
                  <span className="ml-auto text-xs text-ink-500">
                    T={m.defaultTemperature} · max={m.defaultMaxTokens}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <form action={bound} className="space-y-2 rounded border border-ink-200/70 dark:border-ink-800 p-4 text-sm">
            <h3 className="text-xs uppercase tracking-wider text-ink-500">Add profile</h3>
            <Input name="name" placeholder="name (e.g. opus-default)" required />
            <select name="provider" className={inputCls}>
              <option value="mock">mock (no API key)</option>
              <option value="anthropic">anthropic</option>
              <option value="openai">openai</option>
              <option value="custom">custom</option>
            </select>
            <Input name="modelId" placeholder="model id (e.g. claude-opus-4-7)" required />
            <Input name="temperature" type="number" step="0.1" defaultValue="0.7" />
            <Input name="maxTokens" type="number" defaultValue="1024" />
            <button className="rounded-md bg-ink-900 dark:bg-ink-100 text-ink-50 dark:text-ink-900 px-3 py-1.5 font-medium">
              Create
            </button>
          </form>
        </section>
      </div>
    </Shell>
  );
}

const inputCls = "w-full rounded border border-ink-300/70 dark:border-ink-700 bg-transparent px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-ink-500";

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={inputCls} />;
}
