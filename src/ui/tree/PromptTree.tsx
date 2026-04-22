"use client";
import Link from "next/link";
import { useMemo } from "react";
import { buildTree, type VersionNode } from "../../domain/lineage";
import { StatusPill } from "../common/StatusPill";
import { IconCrown, IconGitFork } from "../common/Icon";

export interface PromptTreeVersion extends VersionNode {
  title: string;
  number: number;
}

export function PromptTree({
  versions,
  canonicalHeadId,
  branchHeads,
  branchNames,
  projectSlug,
  promptSlug,
  selectedId,
}: {
  versions: ReadonlyArray<PromptTreeVersion>;
  canonicalHeadId: string | null;
  branchHeads: Record<string, string | null>;
  branchNames: Record<string, string>;
  projectSlug: string;
  promptSlug: string;
  selectedId?: string | null;
}) {
  const tree = useMemo(() => buildTree(versions), [versions]);
  const branchHeadToName = useMemo(() => {
    const m = new Map<string, string>();
    for (const [branchId, head] of Object.entries(branchHeads)) {
      if (head) m.set(head, branchNames[branchId] ?? "?");
    }
    return m;
  }, [branchHeads, branchNames]);

  if (tree.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-ink-200 dark:border-ink-800 p-6 text-sm text-ink-500 text-center">
        No versions yet.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-ink-200/70 dark:border-ink-800/70 bg-white dark:bg-ink-900/60 shadow-soft overflow-hidden">
      <ul className="py-2">
        {tree.map((n) => (
          <TreeNode
            key={n.node.id}
            node={n}
            depth={0}
            canonicalHeadId={canonicalHeadId}
            branchHeadToName={branchHeadToName}
            projectSlug={projectSlug}
            promptSlug={promptSlug}
            selectedId={selectedId ?? null}
          />
        ))}
      </ul>
    </div>
  );
}

function TreeNode({
  node,
  depth,
  canonicalHeadId,
  branchHeadToName,
  projectSlug,
  promptSlug,
  selectedId,
}: {
  node: { node: PromptTreeVersion; children: Array<{ node: PromptTreeVersion; children: Array<unknown> }> };
  depth: number;
  canonicalHeadId: string | null;
  branchHeadToName: Map<string, string>;
  projectSlug: string;
  promptSlug: string;
  selectedId: string | null;
}) {
  const isSelected = selectedId === node.node.id;
  const isCanonical = canonicalHeadId === node.node.id;
  const branchHeadLabel = branchHeadToName.get(node.node.id) ?? null;

  return (
    <li>
      <Link
        href={`/p/${projectSlug}/prompts/${promptSlug}/v/${node.node.id}`}
        className={`relative flex items-center gap-2 px-3 py-1.5 text-[13px] transition-colors ${
          isSelected
            ? "bg-accent-50 dark:bg-accent-500/10"
            : "hover:bg-ink-50 dark:hover:bg-ink-800/50"
        }`}
        style={{ paddingLeft: 12 + depth * 18 }}
      >
        {/* connector lines */}
        {depth > 0 && (
          <span
            aria-hidden
            className="absolute top-0 bottom-0 border-l border-ink-200 dark:border-ink-800"
            style={{ left: 12 + (depth - 1) * 18 + 6 }}
          />
        )}
        {depth > 0 && (
          <span
            aria-hidden
            className="absolute w-2.5 border-b border-ink-200 dark:border-ink-800"
            style={{ left: 12 + (depth - 1) * 18 + 6, top: "50%", width: 12 }}
          />
        )}

        <span
          className={`relative z-10 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-mono font-semibold ${
            isCanonical
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200"
              : isSelected
                ? "bg-accent-100 text-accent-700 dark:bg-accent-500/20 dark:text-accent-200"
                : "bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300"
          }`}
        >
          {node.node.number}
        </span>

        <span className="truncate text-ink-800 dark:text-ink-100 flex-1">
          {node.node.title}
        </span>

        <span className="flex items-center gap-1.5 shrink-0">
          {isCanonical && (
            <span
              title="Canonical head"
              className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400"
            >
              <IconCrown size={12} />
            </span>
          )}
          {branchHeadLabel && !isCanonical && (
            <span
              title={`Head of ${branchHeadLabel}`}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300"
            >
              <IconGitFork size={10} /> {branchHeadLabel}
            </span>
          )}
          <StatusPill status={node.node.status} size="sm" />
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
              branchHeadToName={branchHeadToName}
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
