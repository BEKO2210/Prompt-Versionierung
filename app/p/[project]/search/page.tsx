import Link from "next/link";
import { Shell } from "../../../../src/ui/common/Shell";
import { Card } from "../../../../src/ui/common/Card";
import { Input } from "../../../../src/ui/common/Input";
import { Eyebrow } from "../../../../src/ui/common/Eyebrow";
import { IconSearch } from "../../../../src/ui/common/Icon";
import { defaultContext } from "../../../../src/services/context";
import { getProjectBySlug } from "../../../../src/services/projectService";
import { search } from "../../../../src/services/searchService";

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ project: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { project: slug } = await params;
  const { q } = await searchParams;
  const project = await getProjectBySlug(defaultContext(), slug);
  const hits = q ? await search(defaultContext(), q, { projectId: project.id }) : [];

  return (
    <Shell
      projectSlug={slug}
      currentPath={`/p/${slug}/search`}
      title="Search"
      subtitle="Full-text over prompts, versions, notes."
    >
      <form method="get" className="mb-5">
        <div className="relative">
          <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" />
          <Input
            name="q"
            defaultValue={q ?? ""}
            autoFocus
            placeholder="Search prompts, versions, notes…"
            className="pl-9"
          />
        </div>
      </form>

      {!q ? (
        <Card className="p-6 text-sm text-ink-500 border-dashed text-center">
          Type a query to search within {project.name}.
        </Card>
      ) : hits.length === 0 ? (
        <Card className="p-6 text-sm text-ink-500 border-dashed text-center">
          No matches for <code className="font-mono text-ink-700 dark:text-ink-200">{q}</code>.
        </Card>
      ) : (
        <>
          <Eyebrow className="mb-2">
            {hits.length} result{hits.length === 1 ? "" : "s"}
          </Eyebrow>
          <ul className="space-y-2">
            {hits.map((h) => (
              <li key={`${h.kind}-${h.id}`}>
                <Link
                  href={
                    h.kind === "version"
                      ? `/p/${slug}/prompts/_/v/${h.versionId}`
                      : `/p/${slug}/prompts`
                  }
                  className="block"
                >
                  <Card className="transition-shadow hover:shadow-pop">
                    <div className="flex items-baseline gap-3 mb-1">
                      <KindBadge kind={h.kind} />
                      <span className="font-medium text-ink-900 dark:text-ink-50">{h.title}</span>
                    </div>
                    <p className="text-[13px] text-ink-500 dark:text-ink-400 line-clamp-2">
                      {h.snippet}
                    </p>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </Shell>
  );
}

function KindBadge({ kind }: { kind: "prompt" | "version" | "note" }) {
  const map: Record<string, string> = {
    prompt:  "bg-accent-50 text-accent-700 ring-accent-200 dark:bg-accent-500/10 dark:text-accent-200",
    version: "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-200",
    note:    "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ${map[kind]}`}>
      {kind}
    </span>
  );
}
