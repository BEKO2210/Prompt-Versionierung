import type { ServiceContext } from "./context";

// MVP search: SQL LIKE over name/title/body/description. Full-text index
// is planned (see docs/04-architecture.md §4.6); swapping this
// implementation does not change the call sites.

export interface SearchFilters {
  projectId?: string;
  status?: string;
  branchId?: string;
  includeArchived?: boolean;
}

export interface SearchHit {
  kind: "prompt" | "version" | "note";
  id: string;
  title: string;
  snippet: string;
  projectId: string;
  promptId: string;
  versionId?: string;
}

export async function search(
  ctx: ServiceContext,
  query: string,
  filters: SearchFilters = {},
): Promise<SearchHit[]> {
  const q = `%${query.toLowerCase()}%`;
  const hits: SearchHit[] = [];

  const prompts = await ctx.prisma.prompt.findMany({
    where: {
      ...(filters.projectId ? { projectId: filters.projectId } : {}),
      ...(filters.includeArchived ? {} : { archivedAt: null }),
      OR: [
        { name: { contains: query } },
        { description: { contains: query } },
        { purpose: { contains: query } },
      ],
    },
    take: 40,
    include: { project: true },
  });
  for (const p of prompts) {
    hits.push({
      kind: "prompt",
      id: p.id,
      title: p.name,
      snippet: p.description ?? p.purpose ?? "",
      projectId: p.projectId,
      promptId: p.id,
    });
  }

  const versions = await ctx.prisma.promptVersion.findMany({
    where: {
      ...(filters.projectId ? { prompt: { projectId: filters.projectId } } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.branchId ? { createdOnBranchId: filters.branchId } : {}),
      OR: [
        { title: { contains: query } },
        { body: { contains: query } },
        { rationale: { contains: query } },
        { changeSummary: { contains: query } },
      ],
    },
    include: { prompt: true },
    take: 60,
  });
  for (const v of versions) {
    hits.push({
      kind: "version",
      id: v.id,
      title: `v${v.number} — ${v.title}`,
      snippet: (v.body || "").slice(0, 160),
      projectId: v.prompt.projectId,
      promptId: v.promptId,
      versionId: v.id,
    });
  }

  const notes = await ctx.prisma.promptNote.findMany({
    where: {
      ...(filters.projectId
        ? { version: { prompt: { projectId: filters.projectId } } }
        : {}),
      body: { contains: query },
    },
    include: { version: { include: { prompt: true } } },
    take: 40,
  });
  for (const n of notes) {
    hits.push({
      kind: "note",
      id: n.id,
      title: `Note on v${n.version.number}`,
      snippet: n.body.slice(0, 160),
      projectId: n.version.prompt.projectId,
      promptId: n.version.promptId,
      versionId: n.versionId,
    });
  }

  void q; // keep the variable for future FTS impl
  return hits;
}
