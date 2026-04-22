import { Shell } from "../../../../src/ui/common/Shell";
import { Card } from "../../../../src/ui/common/Card";
import { Button } from "../../../../src/ui/common/Button";
import { Field, Input, Select } from "../../../../src/ui/common/Input";
import { Eyebrow } from "../../../../src/ui/common/Eyebrow";
import { IconModel, IconPlus } from "../../../../src/ui/common/Icon";
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
    <Shell
      projectSlug={slug}
      currentPath={`/p/${slug}/models`}
      title="Model profiles"
      subtitle="Named presets used by runs. The `mock` provider needs no API key."
    >
      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-6">
        <section>
          {models.length === 0 ? (
            <Card className="p-6 border-dashed text-center">
              <div className="mx-auto w-10 h-10 rounded-full bg-ink-100 dark:bg-ink-800 flex items-center justify-center mb-2">
                <IconModel size={16} className="text-ink-500" />
              </div>
              <div className="font-medium text-ink-800 dark:text-ink-100">No model profiles</div>
              <p className="text-sm text-ink-500 mt-1">
                Add one on the right. Start with `provider=mock` for a zero-setup
                dev loop.
              </p>
            </Card>
          ) : (
            <ul className="space-y-2.5">
              {models.map((m) => (
                <li key={m.id}>
                  <Card className="flex items-center gap-4">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink-100 dark:bg-ink-800 text-ink-600 dark:text-ink-300">
                      <IconModel size={15} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-ink-900 dark:text-ink-50">{m.name}</div>
                      <div className="text-[11px] font-mono text-ink-500">
                        {m.provider}:{m.modelId}
                      </div>
                    </div>
                    <div className="text-[11px] text-ink-500 text-right shrink-0">
                      T={m.defaultTemperature}
                      <br />
                      max={m.defaultMaxTokens}
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <Card>
            <Eyebrow className="mb-3">Add profile</Eyebrow>
            <form action={bound} className="space-y-3">
              <Field label="Name" required>
                <Input name="name" required placeholder="opus-default" />
              </Field>
              <Field label="Provider">
                <Select name="provider" defaultValue="mock">
                  <option value="mock">mock (no API key)</option>
                  <option value="anthropic">anthropic</option>
                  <option value="openai">openai</option>
                  <option value="custom">custom</option>
                </Select>
              </Field>
              <Field label="Model ID" required>
                <Input name="modelId" required placeholder="claude-opus-4-7" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Temperature">
                  <Input name="temperature" type="number" step="0.1" defaultValue="0.7" />
                </Field>
                <Field label="Max tokens">
                  <Input name="maxTokens" type="number" defaultValue="1024" />
                </Field>
              </div>
              <Button type="submit" variant="accent">
                <IconPlus size={14} /> Create profile
              </Button>
            </form>
          </Card>
        </section>
      </div>
    </Shell>
  );
}
