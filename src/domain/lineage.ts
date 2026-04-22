// Lineage DAG helpers. All functions are pure — they take a `nodes`
// snapshot and return results.

export interface VersionNode {
  id: string;
  parentVersionId: string | null;
  number: number;
  createdOnBranchId: string;
  status: string;
}

export interface LineageEdge {
  fromVersionId: string;
  toVersionId: string;
  kind: "branch" | "merge" | "cherry_pick" | "refinement";
}

export interface TreeNode<T extends VersionNode> {
  node: T;
  children: Array<TreeNode<T>>;
}

/** Build a forest keyed by parent pointer. Roots have null parent. */
export function buildTree<T extends VersionNode>(nodes: ReadonlyArray<T>): Array<TreeNode<T>> {
  const byId = new Map<string, TreeNode<T>>();
  for (const n of nodes) byId.set(n.id, { node: n, children: [] });

  const roots: Array<TreeNode<T>> = [];
  for (const n of nodes) {
    const wrap = byId.get(n.id)!;
    if (n.parentVersionId && byId.has(n.parentVersionId)) {
      byId.get(n.parentVersionId)!.children.push(wrap);
    } else {
      roots.push(wrap);
    }
  }

  // Stable ordering: by version number ascending.
  const sortRec = (t: TreeNode<T>) => {
    t.children.sort((a, b) => a.node.number - b.node.number);
    t.children.forEach(sortRec);
  };
  roots.sort((a, b) => a.node.number - b.node.number);
  roots.forEach(sortRec);

  return roots;
}

/** All ancestors of a version, nearest first (excludes the version itself). */
export function ancestors<T extends VersionNode>(
  nodes: ReadonlyArray<T>,
  id: string,
): T[] {
  const byId = new Map(nodes.map((n) => [n.id, n] as const));
  const out: T[] = [];
  let cur = byId.get(id);
  while (cur && cur.parentVersionId) {
    const parent = byId.get(cur.parentVersionId);
    if (!parent) break;
    out.push(parent);
    cur = parent;
  }
  return out;
}

/** All descendants of a version (BFS, excludes the version itself). */
export function descendants<T extends VersionNode>(
  nodes: ReadonlyArray<T>,
  id: string,
): T[] {
  const children = new Map<string, T[]>();
  for (const n of nodes) {
    if (n.parentVersionId) {
      const bucket = children.get(n.parentVersionId) ?? [];
      bucket.push(n);
      children.set(n.parentVersionId, bucket);
    }
  }
  const out: T[] = [];
  const queue: string[] = [id];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const c of children.get(cur) ?? []) {
      out.push(c);
      queue.push(c.id);
    }
  }
  return out;
}

/** True iff `maybeDescendant` is in the parentVersionId chain of `of`. */
export function isDescendant<T extends VersionNode>(
  nodes: ReadonlyArray<T>,
  maybeDescendant: string,
  of: string,
): boolean {
  if (maybeDescendant === of) return false;
  const byId = new Map(nodes.map((n) => [n.id, n] as const));
  let cur = byId.get(maybeDescendant);
  while (cur?.parentVersionId) {
    if (cur.parentVersionId === of) return true;
    cur = byId.get(cur.parentVersionId);
  }
  return false;
}

/** Lowest common ancestor of two versions, or null if unrelated. */
export function lca<T extends VersionNode>(
  nodes: ReadonlyArray<T>,
  a: string,
  b: string,
): T | null {
  const aAncestors = new Set([a, ...ancestors(nodes, a).map((n) => n.id)]);
  const byId = new Map(nodes.map((n) => [n.id, n] as const));

  // Walk up from b until we hit a node in aAncestors.
  let cur = byId.get(b);
  while (cur) {
    if (aAncestors.has(cur.id)) return cur;
    if (!cur.parentVersionId) break;
    cur = byId.get(cur.parentVersionId);
  }
  return null;
}

/** All versions on a given branch (any version whose createdOnBranchId matches). */
export function versionsOnBranch<T extends VersionNode>(
  nodes: ReadonlyArray<T>,
  branchId: string,
): T[] {
  return nodes.filter((n) => n.createdOnBranchId === branchId);
}
