// Minimal, dependency-free line-level diff with word-level highlight on
// modified lines. Good enough for prompt bodies (hundreds of lines).
//
// Algorithm: classic LCS table, O(n·m) time/space. Prompts are small.

export type LineOp = "equal" | "added" | "removed" | "modified";

export interface LineDelta {
  op: LineOp;
  left?: string;  // content on the left (removed/equal/modified)
  right?: string; // content on the right (added/equal/modified)
  leftIndex?: number;
  rightIndex?: number;
  words?: WordDelta[]; // populated when op=modified
}

export interface WordDelta {
  op: LineOp;
  text: string;
}

function lcs<T>(a: readonly T[], b: readonly T[], eq: (x: T, y: T) => boolean): number[][] {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const ai = a[i - 1]!;
      const bj = b[j - 1]!;
      if (eq(ai, bj)) dp[i]![j] = dp[i - 1]![j - 1]! + 1;
      else dp[i]![j] = Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
    }
  }
  return dp;
}

function backtrack<T>(
  dp: number[][],
  a: readonly T[],
  b: readonly T[],
  eq: (x: T, y: T) => boolean,
): Array<{ op: LineOp; ai?: number; bi?: number }> {
  const ops: Array<{ op: LineOp; ai?: number; bi?: number }> = [];
  let i = a.length, j = b.length;
  while (i > 0 && j > 0) {
    if (eq(a[i - 1]!, b[j - 1]!)) {
      ops.push({ op: "equal", ai: i - 1, bi: j - 1 });
      i--; j--;
    } else if (dp[i - 1]![j]! >= dp[i]![j - 1]!) {
      ops.push({ op: "removed", ai: i - 1 });
      i--;
    } else {
      ops.push({ op: "added", bi: j - 1 });
      j--;
    }
  }
  while (i > 0) { ops.push({ op: "removed", ai: i - 1 }); i--; }
  while (j > 0) { ops.push({ op: "added", bi: j - 1 }); j--; }
  ops.reverse();
  return ops;
}

function tokenize(line: string): string[] {
  // Split on word boundaries while keeping whitespace tokens so the output
  // is reconstructible.
  return line.match(/\w+|\s+|[^\w\s]/g) ?? [];
}

function wordDiff(left: string, right: string): WordDelta[] {
  const la = tokenize(left);
  const rb = tokenize(right);
  const dp = lcs(la, rb, (x, y) => x === y);
  const ops = backtrack(dp, la, rb, (x, y) => x === y);
  // Collapse adjacent same-op runs.
  const out: WordDelta[] = [];
  for (const o of ops) {
    const text = o.op === "added" ? rb[o.bi!]! : la[o.ai!]!;
    const last = out[out.length - 1];
    if (last && last.op === o.op) last.text += text;
    else out.push({ op: o.op, text });
  }
  return out;
}

export interface TextDiff {
  lines: LineDelta[];
  stats: {
    added: number;
    removed: number;
    modified: number;
    equal: number;
  };
}

/**
 * Pair adjacent (removed, added) ops into a single modified delta with
 * word-level highlighting. Keeps pure equal/added/removed lines as-is.
 */
export function diffText(left: string, right: string): TextDiff {
  const la = left.split(/\r?\n/);
  const rb = right.split(/\r?\n/);
  const dp = lcs(la, rb, (x, y) => x === y);
  const ops = backtrack(dp, la, rb, (x, y) => x === y);

  const out: LineDelta[] = [];
  for (let k = 0; k < ops.length; k++) {
    const o = ops[k]!;
    const next = ops[k + 1];
    // Pair adjacent removed+added (either order) into a modified delta.
    const isPair =
      (o.op === "removed" && next?.op === "added") ||
      (o.op === "added" && next?.op === "removed");
    if (isPair) {
      const removed = o.op === "removed" ? o : next!;
      const added = o.op === "added" ? o : next!;
      const l = la[removed.ai!]!;
      const r = rb[added.bi!]!;
      out.push({
        op: "modified",
        left: l,
        right: r,
        leftIndex: removed.ai!,
        rightIndex: added.bi!,
        words: wordDiff(l, r),
      });
      k++;
    } else if (o.op === "equal") {
      out.push({
        op: "equal",
        left: la[o.ai!]!,
        right: rb[o.bi!]!,
        leftIndex: o.ai!,
        rightIndex: o.bi!,
      });
    } else if (o.op === "added") {
      out.push({ op: "added", right: rb[o.bi!]!, rightIndex: o.bi! });
    } else if (o.op === "removed") {
      out.push({ op: "removed", left: la[o.ai!]!, leftIndex: o.ai! });
    }
  }

  const stats = { added: 0, removed: 0, modified: 0, equal: 0 };
  for (const d of out) stats[d.op]++;
  return { lines: out, stats };
}

// ---------------------------------------------------------------------------
// Variable diff
// ---------------------------------------------------------------------------

export interface VariableDiffEntry {
  name: string;
  op: "added" | "removed" | "changed" | "unchanged";
  left?: { type: string; required: boolean; defaultValue?: unknown };
  right?: { type: string; required: boolean; defaultValue?: unknown };
}

export function diffVariables(
  left: ReadonlyArray<{ name: string; type: string; required: boolean; defaultValue?: unknown }>,
  right: ReadonlyArray<{ name: string; type: string; required: boolean; defaultValue?: unknown }>,
): VariableDiffEntry[] {
  const map = new Map<string, VariableDiffEntry>();
  for (const v of left) {
    map.set(v.name, { name: v.name, op: "removed", left: v });
  }
  for (const v of right) {
    const existing = map.get(v.name);
    if (!existing) {
      map.set(v.name, { name: v.name, op: "added", right: v });
    } else {
      const changed =
        existing.left!.type !== v.type ||
        existing.left!.required !== v.required ||
        JSON.stringify(existing.left!.defaultValue) !== JSON.stringify(v.defaultValue);
      existing.op = changed ? "changed" : "unchanged";
      existing.right = v;
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Metadata diff
// ---------------------------------------------------------------------------

export interface MetadataDiff {
  titleChanged: boolean;
  statusChanged: boolean;
  modelHintChanged: boolean;
  rationaleChanged: boolean;
}

export function diffMetadata(
  left: { title: string; status: string; modelHintId?: string | null; rationale?: string | null },
  right: { title: string; status: string; modelHintId?: string | null; rationale?: string | null },
): MetadataDiff {
  return {
    titleChanged: left.title !== right.title,
    statusChanged: left.status !== right.status,
    modelHintChanged: (left.modelHintId ?? null) !== (right.modelHintId ?? null),
    rationaleChanged: (left.rationale ?? "") !== (right.rationale ?? ""),
  };
}
