import Link from "next/link";
import { Shell } from "../../../../src/ui/common/Shell";
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
    <Shell projectSlug={slug} title="Search">
      <form method="get" className="mb-4">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search prompts, versions, notes…"
          className="w-full rounded border border-ink-300/70 dark:border-ink-700 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ink-500"
        />
      </form>
      {!q ? (
        <p className="text-sm text-ink-500">Type a query to search within this project.</p>
      ) : hits.length === 0 ? (
        <p className="text-sm text-ink-500">No hits.</p>
      ) : (
        <ul className="space-y-2">
          {hits.map((h) => (
            <li key={`${h.kind}-${h.id}`}>
              <Link
                href={
                  h.kind === "version"
                    ? `/p/${slug}/prompts/_/v/${h.versionId}`
                    : `/p/${slug}/prompts`
                }
                className="block rounded border border-ink-200/70 dark:border-ink-800 px-3 py-2 hover:bg-ink-100/60 dark:hover:bg-ink-800/60"
              >
                <div className="flex items-baseline gap-3">
                  <span className="text-[10px] uppercase text-ink-500 font-mono">{h.kind}</span>
                  <span className="font-medium">{h.title}</span>
                </div>
                <p className="text-sm text-ink-500 mt-1 line-clamp-2">{h.snippet}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}
