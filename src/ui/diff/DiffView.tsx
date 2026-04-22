import type { TextDiff } from "../../domain/diff";

export function DiffView({ diff }: { diff: TextDiff }) {
  return (
    <div className="rounded border border-ink-200/60 dark:border-ink-800 overflow-hidden">
      <table className="w-full code">
        <tbody>
          {diff.lines.map((d, i) => (
            <tr key={i} className="align-top">
              <td className="w-10 text-right pr-2 text-ink-400 select-none border-r border-ink-200/60 dark:border-ink-800 bg-ink-100/40 dark:bg-ink-900/40">
                {d.leftIndex !== undefined ? d.leftIndex + 1 : ""}
              </td>
              <td
                className={`px-3 whitespace-pre-wrap ${
                  d.op === "removed" ? "diff-removed" : d.op === "modified" ? "diff-modified-left" : d.op === "added" ? "bg-ink-100/20" : ""
                }`}
              >
                {renderSide(d, "left")}
              </td>
              <td className="w-10 text-right pr-2 text-ink-400 select-none border-x border-ink-200/60 dark:border-ink-800 bg-ink-100/40 dark:bg-ink-900/40">
                {d.rightIndex !== undefined ? d.rightIndex + 1 : ""}
              </td>
              <td
                className={`px-3 whitespace-pre-wrap ${
                  d.op === "added" ? "diff-added" : d.op === "modified" ? "diff-modified-right" : d.op === "removed" ? "bg-ink-100/20" : ""
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
