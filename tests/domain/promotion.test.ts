import { describe, it, expect } from "vitest";
import { checkPointerPromotion, requirePointerPromotion } from "../../src/domain/promotion";
import { PromotionError } from "../../src/domain/errors";
import type { VersionNode } from "../../src/domain/lineage";

// main: 1 → 2
// exp:  1 → 3 (exp branches from 1)
const nodes: VersionNode[] = [
  { id: "1", parentVersionId: null, number: 1, createdOnBranchId: "main", status: "approved" },
  { id: "2", parentVersionId: "1", number: 2, createdOnBranchId: "main", status: "candidate" },
  { id: "3", parentVersionId: "1", number: 3, createdOnBranchId: "exp", status: "experimental" },
];

describe("promotion", () => {
  it("allows pointer promotion when head is null (initial)", () => {
    expect(checkPointerPromotion(nodes, null, "1").allowedPointer).toBe(true);
  });

  it("allows pointer promotion to the same head (no-op)", () => {
    expect(checkPointerPromotion(nodes, "2", "2").allowedPointer).toBe(true);
  });

  it("allows fast-forward pointer promotion", () => {
    // Target "2" is a descendant of "1".
    expect(checkPointerPromotion(nodes, "1", "2").allowedPointer).toBe(true);
  });

  it("rejects pointer promotion when target is not a descendant", () => {
    // Canonical head is 2. Target 3 is on exp branch from 1 — not descendant of 2.
    const c = checkPointerPromotion(nodes, "2", "3");
    expect(c.allowedPointer).toBe(false);
    expect(c.reason).toMatch(/not a descendant/i);
  });

  it("requirePointerPromotion throws when not allowed", () => {
    expect(() => requirePointerPromotion(nodes, "2", "3")).toThrow(PromotionError);
  });
});
