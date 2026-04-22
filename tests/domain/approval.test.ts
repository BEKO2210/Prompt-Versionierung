import { describe, it, expect } from "vitest";
import { approvalStatus, approvalsRequired, hasApproved } from "../../src/domain/approval";

const ap = (id: string, author: string) => ({ id, author, createdAt: 0 });
const openProp = (overrides: Partial<Parameters<typeof approvalStatus>[0]> = {}) => ({
  status: "open" as const,
  approvals: [],
  openedBy: "alice",
  ...overrides,
});

describe("approvalsRequired", () => {
  it("defaults to 1 when missing", () => {
    expect(approvalsRequired({})).toBe(1);
    expect(approvalsRequired({ approvalsRequired: undefined })).toBe(1);
  });
  it("floors and clamps to non-negative", () => {
    expect(approvalsRequired({ approvalsRequired: 2.9 })).toBe(2);
    expect(approvalsRequired({ approvalsRequired: -3 })).toBe(1);
    expect(approvalsRequired({ approvalsRequired: 0 })).toBe(0);
  });
  it("rejects non-numeric values", () => {
    expect(approvalsRequired({ approvalsRequired: Number.NaN })).toBe(1);
  });
});

describe("hasApproved", () => {
  it("is false for empty approvals", () => {
    expect(hasApproved(openProp(), "alice")).toBe(false);
  });
  it("is true when author matches", () => {
    expect(hasApproved(openProp({ approvals: [ap("a1", "bob")] }), "bob")).toBe(true);
  });
  it("is false for null actor", () => {
    expect(hasApproved(openProp({ approvals: [ap("a1", "bob")] }), null)).toBe(false);
  });
});

describe("approvalStatus", () => {
  it("gate is closed while below threshold", () => {
    const s = approvalStatus(openProp(), { approvalsRequired: 2 }, "carol");
    expect(s.have).toBe(0);
    expect(s.required).toBe(2);
    expect(s.remaining).toBe(2);
    expect(s.canMerge).toBe(false);
  });

  it("gate opens when approvals meet the threshold", () => {
    const s = approvalStatus(
      openProp({ approvals: [ap("a1", "bob"), ap("a2", "carol")] }),
      { approvalsRequired: 2 },
      "bob",
    );
    expect(s.have).toBe(2);
    expect(s.remaining).toBe(0);
    expect(s.canMerge).toBe(true);
  });

  it("gate stays closed for merged / closed proposals even if approvals suffice", () => {
    const s = approvalStatus(
      { status: "merged", approvals: [ap("a", "x"), ap("b", "y")], openedBy: "z" },
      { approvalsRequired: 1 }, "anyone",
    );
    expect(s.canMerge).toBe(false);
  });

  it("blocks self-approval: the opener cannot approve their own proposal", () => {
    const s = approvalStatus(openProp({ openedBy: "alice" }), { approvalsRequired: 1 }, "alice");
    expect(s.canApprove).toBe(false);
  });

  it("lets a non-opener approve exactly once", () => {
    const bobCan = approvalStatus(openProp(), { approvalsRequired: 1 }, "bob");
    expect(bobCan.canApprove).toBe(true);
    expect(bobCan.approvedByCurrent).toBe(false);

    const bobAlreadyApproved = approvalStatus(
      openProp({ approvals: [ap("a1", "bob")] }), { approvalsRequired: 1 }, "bob");
    expect(bobAlreadyApproved.canApprove).toBe(false);
    expect(bobAlreadyApproved.approvedByCurrent).toBe(true);
  });

  it("requires an actor to be able to approve", () => {
    const s = approvalStatus(openProp(), { approvalsRequired: 1 }, null);
    expect(s.canApprove).toBe(false);
  });

  it("with required=0, gate is always open on open proposals", () => {
    const s = approvalStatus(openProp(), { approvalsRequired: 0 }, "bob");
    expect(s.canMerge).toBe(true);
    expect(s.remaining).toBe(0);
  });
});
