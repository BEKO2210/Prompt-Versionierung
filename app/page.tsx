import Link from "next/link";
import { listProjects } from "../src/services/projectService";
import { defaultContext } from "../src/services/context";
import { Shell } from "../src/ui/common/Shell";
import { Card } from "../src/ui/common/Card";
import { Button } from "../src/ui/common/Button";
import { Field, Input } from "../src/ui/common/Input";
import { Eyebrow } from "../src/ui/common/Eyebrow";
import { IconArrow, IconBeaker, IconGitFork, IconSpark, IconTree } from "../src/ui/common/Icon";
import { createProjectAction } from "./actions/projects";

export default async function HomePage() {
  const projects = await listProjects(defaultContext()).catch(() => []);
  return (
    <Shell title="Workspace" subtitle="Projects and their prompts, branches, runs.">
      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-8">
        <section>
          {projects.length === 0 ? (
            <Hero />
          ) : (
            <>
              <div className="flex items-baseline justify-between mb-3">
                <Eyebrow>Projects</Eyebrow>
                <span className="text-xs text-ink-500">{projects.length} total</span>
              </div>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {projects.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/p/${p.slug}`}
                      className="group block"
                    >
                      <Card className="h-full transition-shadow hover:shadow-pop">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-ink-900 dark:text-ink-50 truncate">
                              {p.name}
                            </div>
                            <div className="text-xs text-ink-500 font-mono mt-0.5">{p.slug}</div>
                          </div>
                          <IconArrow size={16} className="text-ink-400 group-hover:text-ink-700 dark:group-hover:text-ink-200 transition-colors" />
                        </div>
                        {p.description && (
                          <p className="text-sm text-ink-500 dark:text-ink-400 mt-3 line-clamp-2">
                            {p.description}
                          </p>
                        )}
                      </Card>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section className="space-y-6">
          <Card>
            <Eyebrow className="mb-3">Create project</Eyebrow>
            <form action={createProjectAction} className="space-y-3">
              <Field label="Name" required>
                <Input name="name" required placeholder="Customer support" />
              </Field>
              <Field label="Description" hint="Optional. What is this workspace about?">
                <Input name="description" placeholder="Prompts for tickets, billing, onboarding…" />
              </Field>
              <Button type="submit" variant="accent">
                Create project
              </Button>
            </form>
          </Card>

          <Card>
            <Eyebrow className="mb-3">How it works</Eyebrow>
            <ul className="space-y-3 text-sm">
              <Step icon={<IconTree size={14} />} title="Every edit is a new version">
                Old versions stay addressable forever. Hashes detect reverts.
              </Step>
              <Step icon={<IconGitFork size={14} />} title="Branches like git">
                Experiments live on their own branch. The canonical branch is per prompt.
              </Step>
              <Step icon={<IconSpark size={14} />} title="Refinement keeps receipts">
                Analyzers flag weaknesses, propose a variant, record why.
              </Step>
              <Step icon={<IconBeaker size={14} />} title="Evidence over opinions">
                Runs capture the whole envelope. Diffs show paired scores.
              </Step>
            </ul>
          </Card>
        </section>
      </div>
    </Shell>
  );
}

function Hero() {
  return (
    <Card className="p-8">
      <Eyebrow className="mb-4">Get started</Eyebrow>
      <h2 className="text-2xl font-semibold tracking-tight text-ink-900 dark:text-ink-50 max-w-lg">
        Treat prompts like code you can branch, diff, and justify.
      </h2>
      <p className="text-ink-500 dark:text-ink-400 mt-3 max-w-xl">
        Prompt Tree stores every version permanently, captures the evidence for
        changes, and makes old ideas retrievable. Create a project on the right
        to begin.
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-8">
        <FeatureChip label="Immutable versions" />
        <FeatureChip label="Named branches" />
        <FeatureChip label="Test + evaluate" />
        <FeatureChip label="Decisions logged" />
      </div>
    </Card>
  );
}

function FeatureChip({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-ink-200/70 dark:border-ink-800 bg-white/50 dark:bg-ink-900/40 px-3 py-2 text-xs font-medium text-ink-700 dark:text-ink-200">
      {label}
    </div>
  );
}

function Step({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-md bg-accent-50 text-accent-700 dark:bg-accent-500/10 dark:text-accent-400">
        {icon}
      </span>
      <span>
        <div className="font-medium text-ink-800 dark:text-ink-100">{title}</div>
        <div className="text-ink-500 dark:text-ink-400 text-[13px] leading-snug">{children}</div>
      </span>
    </li>
  );
}
