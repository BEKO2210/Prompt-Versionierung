import Link from "next/link";
import { listProjects } from "../src/services/projectService";
import { defaultContext } from "../src/services/context";
import { Shell } from "../src/ui/common/Shell";
import { createProjectAction } from "./actions/projects";

export default async function HomePage() {
  const projects = await listProjects(defaultContext()).catch(() => []);
  return (
    <Shell title="Workspace">
      <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-8">
        <section>
          <h2 className="text-sm uppercase tracking-wider text-ink-500 mb-3">Projects</h2>
          {projects.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className="space-y-2">
              {projects.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/p/${p.slug}`}
                    className="block rounded-md border border-ink-200/70 dark:border-ink-800 px-4 py-3 hover:bg-ink-100/70 dark:hover:bg-ink-900"
                  >
                    <div className="flex items-baseline justify-between">
                      <span className="font-medium">{p.name}</span>
                      <span className="text-xs text-ink-500">{p.slug}</span>
                    </div>
                    {p.description && (
                      <p className="mt-1 text-sm text-ink-500 line-clamp-2">{p.description}</p>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h2 className="text-sm uppercase tracking-wider text-ink-500 mb-3">New project</h2>
          <form action={createProjectAction} className="space-y-3 rounded-md border border-ink-200/70 dark:border-ink-800 p-4">
            <Field label="Name" name="name" required />
            <Field label="Description" name="description" />
            <button
              type="submit"
              className="rounded-md bg-ink-900 dark:bg-ink-100 text-ink-50 dark:text-ink-900 px-3 py-1.5 text-sm font-medium"
            >
              Create project
            </button>
          </form>
        </section>
      </div>
    </Shell>
  );
}

function EmptyState() {
  return (
    <div className="rounded-md border border-dashed border-ink-300/80 dark:border-ink-700 p-6 text-sm text-ink-500">
      No projects yet. Create one on the right to start modelling prompts.
    </div>
  );
}

function Field({ label, name, required }: { label: string; name: string; required?: boolean }) {
  return (
    <label className="block">
      <span className="block text-xs text-ink-500 mb-1">{label}{required && " *"}</span>
      <input
        name={name}
        required={required}
        className="w-full rounded border border-ink-300/70 dark:border-ink-700 bg-transparent px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ink-500"
      />
    </label>
  );
}
