import { describe, it, expect } from "vitest";
import {
  ancestors,
  buildTree,
  descendants,
  isDescendant,
  lca,
  versionsOnBranch,
  type VersionNode,
} from "../../src/domain/lineage";

//   1
//   ├── 2
//   │   └── 4
//   └── 3
//       └── 5
const nodes: VersionNode[] = [
  { id: "1", parentVersionId: null, number: 1, createdOnBranchId: "main", status: "approved" },
  { id: "2", parentVersionId: "1", number: 2, createdOnBranchId: "main", status: "candidate" },
  { id: "3", parentVersionId: "1", number: 3, createdOnBranchId: "exp", status: "experimental" },
  { id: "4", parentVersionId: "2", number: 4, createdOnBranchId: "main", status: "draft" },
  { id: "5", parentVersionId: "3", number: 5, createdOnBranchId: "exp", status: "draft" },
];

describe("lineage", () => {
  it("buildTree returns roots with nested children", () => {
    const t = buildTree(nodes);
    expect(t.length).toBe(1);
    expect(t[0]!.node.id).toBe("1");
    expect(t[0]!.children.map((c) => c.node.id).sort()).toEqual(["2", "3"]);
  });

  it("ancestors walks up", () => {
    expect(ancestors(nodes, "4").map((n) => n.id)).toEqual(["2", "1"]);
  });

  it("descendants walks down (BFS)", () => {
    expect(descendants(nodes, "1").map((n) => n.id).sort()).toEqual(["2", "3", "4", "5"]);
  });

  it("isDescendant respects direction", () => {
    expect(isDescendant(nodes, "4", "1")).toBe(true);
    expect(isDescendant(nodes, "1", "4")).toBe(false);
    expect(isDescendant(nodes, "5", "2")).toBe(false);
  });

  it("lca finds nearest common ancestor", () => {
    expect(lca(nodes, "4", "5")!.id).toBe("1");
    expect(lca(nodes, "4", "2")!.id).toBe("2");
    expect(lca(nodes, "4", "4")!.id).toBe("4");
  });

  it("versionsOnBranch filters", () => {
    expect(versionsOnBranch(nodes, "main").map((n) => n.id).sort()).toEqual(["1", "2", "4"]);
    expect(versionsOnBranch(nodes, "exp").map((n) => n.id).sort()).toEqual(["3", "5"]);
  });
});
