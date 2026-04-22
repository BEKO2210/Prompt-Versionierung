"use client";
import Link from "next/link";
import { useMemo } from "react";
import { buildTree, type VersionNode } from "../../domain/lineage";
import { StatusPill } from "../common/StatusPill";

export interface PromptTreeVersion extends VersionNode {
  title: string;
  number: number;
}

export function PromptTree({
  versions,
  canonicalHeadId,
  branchHeads,
  projectSlug,
  promptSlug,
  selectedId,
}: {
  versions: ReadonlyArray<PromptTreeVersion>;
  canonicalHeadId: string | null;
  branchHeads: Record<string, string | null>; // branchId -> headVersionId
  projectSlug: string;
  promptSlug: string;
  selectedId?: string | null;
}) {
  const tree = useMemo(() => buildTree(versions), [versions]);
  const isBranchHead = useMemo(() => {
    const ids = new Set<string>();
    for (const h of Object.values(branchHeads)) if (h) ids.add(h);
    return (id: string) => ids.has(id);
  }, [branchHeads]);

  if (tree.length === 0) {
    return <p className="text-sm text-ink-500">No versions yet.</p>;
  }

  return (
    <ul className="font-mono text-[13px] leading-6">
      {tree.map((n) => (
        <TreeNode
          key={n.node.id}
          node={n}
          depth={0}
          canonicalHeadId={canonicalHeadId}
          isBranchHead={isBranchHead}
          projectSlug={projectSlug}
          promptSlug={promptSlug}
          selectedId={selectedId ?? null}
        />
      ))}
    </ul>
  );
}

function TreeNode({
  node,
  depth,
  canonicalHeadId,
  isBranchHead,
  projectSlug,
  promptSlug,
  selectedId,
}: {
  node: { node: PromptTreeVersion; children: Array<{ node: PromptTreeVersion; children: Array<unknown> }> };
  depth: number;
  canonicalHeadId: string | null;
  isBranchHead: (id: string) => boolean;
  projectSlug: string;
  promptSlug: string;
  selectedId: string | null;
}) {
  const isSelected = selectedId === node.node.id;
  const isCanonical = canonicalHeadId === node.node.id;
  const isHead = isBranchHead(node.node.id);
  return (
    <li>
      <Link
        href={`/p/${projectSlug}/prompts/${promptSlug}/v/${node.node.id}`}
        className={`flex items-center gap-2 rounded px-2 py-0.5 hover:bg-ink-100 dark:hover:bg-ink-800 ${
          isSelected ? "bg-ink-200/70 dark:bg-ink-800/70" : ""
        }`}
      >
        <span style={{ paddingLeft: depth * 14 }} className="text-ink-400">
          {depth === 0 ? "●" : "├─"}
        </span>
        <span className="text-ink-700 dark:text-ink-200 truncate">
          v{node.node.number}
        </span>
        <span className="truncate text-ink-500">{node.node.title}</span>
        <span className="ml-auto flex items-center gap-1.5">
          {isCanonical && <span title="Canonical head">👑</span>}
          {isHead && !isCanonical && <span title="Branch head">⚑</span>}
          <StatusPill status={node.node.status} />
        </span>
      </Link>
      {node.children.length > 0 && (
        <ul>
          {node.children.map((c) => (
            <TreeNode
              key={c.node.id}
              node={c as typeof node}
              depth={depth + 1}
              canonicalHeadId={canonicalHeadId}
              isBranchHead={isBranchHead}
              projectSlug={projectSlug}
              promptSlug={promptSlug}
              selectedId={selectedId}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
