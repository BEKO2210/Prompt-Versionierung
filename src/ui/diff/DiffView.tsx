import type { TextDiff } from "../../domain/diff";

export function DiffView({ diff }: { diff: TextDiff }) {
  return (
    <div className="rounded-xl border border-ink-200/70 dark:border-ink-800/70 shadow-soft overflow-hidden bg-white dark:bg-ink-900/60">
      <table className="w-full codeblock border-separate border-spacing-0">
        <tbody>
          {diff.lines.map((d, i) => (
            <tr key={i} className="align-top">
              <td className="w-10 text-right pr-2 text-ink-400 select-none border-r border-ink-200/70 dark:border-ink-800/70 bg-ink-50/40 dark:bg-ink-950/40 text-[11px]">
                {d.leftIndex !== undefined ? d.leftIndex + 1 : ""}
              </td>
              <td
                className={`px-3 py-0.5 whitespace-pre-wrap border-r border-ink-200/70 dark:border-ink-800/70 ${
                  d.op === "removed"
                    ? "diff-removed"
                    : d.op === "modified"
                      ? "diff-modified-left"
                      : d.op === "added"
                        ? "text-ink-300 bg-ink-50/60 dark:bg-ink-950/30"
                        : "diff-equal"
                }`}
              >
                {renderSide(d, "left")}
              </td>
              <td className="w-10 text-right pr-2 text-ink-400 select-none border-r border-ink-200/70 dark:border-ink-800/70 bg-ink-50/40 dark:bg-ink-950/40 text-[11px]">
                {d.rightIndex !== undefined ? d.rightIndex + 1 : ""}
              </td>
              <td
                className={`px-3 py-0.5 whitespace-pre-wrap ${
                  d.op === "added"
                    ? "diff-added"
                    : d.op === "modified"
                      ? "diff-modified-right"
                      : d.op === "removed"
                        ? "text-ink-300 bg-ink-50/60 dark:bg-ink-950/30"
                        : "diff-equal"
                }`}
              >
                {renderSide(d, "right")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderSide(d: TextDiff["lines"][number], side: "left" | "right") {
  if (d.op === "modified" && d.words) {
    return (
      <>
        {d.words
          .filter((w) => (side === "left" ? w.op !== "added" : w.op !== "removed"))
          .map((w, i) => (
            <span
              key={i}
              className={
                w.op === "added"
                  ? "diff-word-added"
                  : w.op === "removed"
                    ? "diff-word-removed"
                    : ""
              }
            >
              {w.text}
            </span>
          ))}
      </>
    );
  }
  const content = side === "left" ? d.left : d.right;
  return content ?? "";
}
