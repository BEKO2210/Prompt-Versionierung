import Link from "next/link";
import { Shell } from "../../../../src/ui/common/Shell";
import { Card } from "../../../../src/ui/common/Card";
import { Button } from "../../../../src/ui/common/Button";
import { Field, Input, Textarea } from "../../../../src/ui/common/Input";
import { Eyebrow } from "../../../../src/ui/common/Eyebrow";
import { IconArrow, IconPlus } from "../../../../src/ui/common/Icon";
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
    <Shell
      projectSlug={slug}
      currentPath={`/p/${slug}/prompts`}
      title="Prompts"
      subtitle={`${prompts.length} prompt${prompts.length === 1 ? "" : "s"} in ${project.name}`}
    >
      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-8">
        <section>
          {prompts.length === 0 ? (
            <Card className="p-8 border-dashed text-center">
              <div className="mx-auto w-10 h-10 rounded-full bg-ink-100 dark:bg-ink-800 flex items-center justify-center mb-3">
                <IconPlus size={16} className="text-ink-500" />
              </div>
              <div className="font-medium text-ink-800 dark:text-ink-100">No prompts yet</div>
              <p className="text-sm text-ink-500 mt-1 max-w-md mx-auto">
                Create your first prompt on the right. It becomes the root of a
                versioned tree with its own `main` branch.
              </p>
            </Card>
          ) : (
            <ul className="space-y-2.5">
              {prompts.map((p) => (
                <li key={p.id}>
                  <Link href={`/p/${slug}/prompts/${p.slug}`} className="group block">
                    <Card className="transition-shadow hover:shadow-pop">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-3">
                            <span className="font-semibold text-ink-900 dark:text-ink-50">
                              {p.name}
                            </span>
                            <span className="text-xs text-ink-500 font-mono">{p.slug}</span>
                          </div>
                          {p.description && (
                            <p className="text-sm text-ink-500 dark:text-ink-400 mt-1.5 line-clamp-2">
                              {p.description}
                            </p>
                          )}
                          <div className="flex items-center gap-3 mt-3 text-[11px] text-ink-500">
                            <span><strong className="text-ink-700 dark:text-ink-300">{p._count.versions}</strong> versions</span>
                            <span className="text-ink-300 dark:text-ink-700">·</span>
                            <span><strong className="text-ink-700 dark:text-ink-300">{p._count.branches}</strong> branches</span>
                            {p.canonicalBranch?.head && (
                              <>
                                <span className="text-ink-300 dark:text-ink-700">·</span>
                                <span>head: <code className="text-ink-700 dark:text-ink-300">v{p.canonicalBranch.head.number}</code></span>
                              </>
                            )}
                          </div>
                        </div>
                        <IconArrow size={15} className="text-ink-400 group-hover:text-ink-700 dark:group-hover:text-ink-200 transition-colors mt-1" />
                      </div>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <Card>
            <Eyebrow className="mb-3">Create prompt</Eyebrow>
            <form action={boundCreate} className="space-y-3">
              <Field label="Name" required>
                <Input name="name" required placeholder="Ticket classifier" />
              </Field>
              <Field label="Purpose" hint="What is this prompt supposed to do?">
                <Input name="purpose" placeholder="Classify support tickets into billing | account | product | other." />
              </Field>
              <Field label="Initial version title">
                <Input name="title" placeholder="First cut" defaultValue="First cut" />
              </Field>
              <Field label="Body" required hint="Use {{name}} for variables.">
                <Textarea
                  name="body"
                  required
                  rows={7}
                  placeholder={`Classify the following support ticket into one of: billing, account, product, other.\n\nTicket:\n{{ticket}}`}
                />
              </Field>
              <Button variant="accent" type="submit">
                <IconPlus size={14} /> Create prompt
              </Button>
            </form>
          </Card>
        </section>
      </div>
    </Shell>
  );
}
