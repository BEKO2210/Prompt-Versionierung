import Link from "next/link";
import { Shell } from "../../../../src/ui/common/Shell";
import { defaultContext } from "../../../../src/services/context";
import { getProjectBySlug } from "../../../../src/services/projectService";
import { listPrompts } from "../../../../src/services/promptService";
import { createPromptAction } from "../../../actions/prompts";

export default async function PromptListPage({
  params,
}: {
  params: Promise<{ project: string }>;
}) {
  const { project: slug } = await params;
  const project = await getProjectBySlug(defaultContext(), slug);
  const prompts = await listPrompts(defaultContext(), project.id);

  const boundCreate = createPromptAction.bind(null, project.id, slug);

  return (
    <Shell projectSlug={slug} title="Prompts">
      <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-8">
        <section>
          {prompts.length === 0 ? (
            <p className="text-sm text-ink-500">No prompts. Create one on the right.</p>
          ) : (
            <ul className="space-y-1.5">
              {prompts.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/p/${slug}/prompts/${p.slug}`}
                    className="block rounded border border-ink-200/70 dark:border-ink-800 px-3 py-2 hover:bg-ink-100/60 dark:hover:bg-ink-800/60"
                  >
                    <div className="flex items-baseline justify-between">
                      <span className="font-medium">{p.name}</span>
                      <span className="text-xs text-ink-500">{p.slug}</span>
                    </div>
                    {p.description && <p className="text-sm text-ink-500">{p.description}</p>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h2 className="text-sm uppercase tracking-wider text-ink-500 mb-3">New prompt</h2>
          <form action={boundCreate} className="space-y-3 rounded-md border border-ink-200/70 dark:border-ink-800 p-4">
            <Field label="Name" name="name" required />
            <Field label="Purpose (what this prompt is for)" name="purpose" />
            <Field label="Initial version title" name="title" placeholder="v1" />
            <label className="block">
              <span className="block text-xs text-ink-500 mb-1">Body *</span>
              <textarea
                name="body"
                required
                rows={8}
                className="w-full rounded border border-ink-300/70 dark:border-ink-700 bg-transparent px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ink-500"
              />
            </label>
            <button
              type="submit"
              className="rounded-md bg-ink-900 dark:bg-ink-100 text-ink-50 dark:text-ink-900 px-3 py-1.5 text-sm font-medium"
            >
              Create prompt
            </button>
          </form>
        </section>
      </div>
    </Shell>
  );
}

function Field({ label, name, required, placeholder }: { label: string; name: string; required?: boolean; placeholder?: string }) {
  return (
    <label className="block">
      <span className="block text-xs text-ink-500 mb-1">{label}{required && " *"}</span>
      <input
        name={name}
        required={required}
        placeholder={placeholder}
        className="w-full rounded border border-ink-300/70 dark:border-ink-700 bg-transparent px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ink-500"
      />
    </label>
  );
}
