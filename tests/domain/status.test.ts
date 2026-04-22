import { describe, it, expect } from "vitest";
import { assertTransition, canTransition, type VersionStatus } from "../../src/domain/status";
import { IllegalTransitionError } from "../../src/domain/errors";

describe("status transitions", () => {
  it("allows draft → experimental", () => {
    expect(canTransition("draft", "experimental")).toBe(true);
  });
  it("allows candidate → approved", () => {
    expect(canTransition("candidate", "approved")).toBe(true);
  });
  it("forbids approved → archived directly", () => {
    expect(canTransition("approved", "archived")).toBe(false);
  });
  it("requires approved → deprecated → archived", () => {
    expect(canTransition("approved", "deprecated")).toBe(true);
    expect(canTransition("deprecated", "archived")).toBe(true);
  });
  it("forbids draft → approved (must go through candidate)", () => {
    expect(canTransition("draft", "approved")).toBe(false);
  });
  it("treats identical status as a no-op", () => {
    const all: VersionStatus[] = ["draft", "experimental", "candidate", "approved", "deprecated", "archived"];
    for (const s of all) expect(canTransition(s, s)).toBe(true);
  });
  it("throws IllegalTransitionError for disallowed moves", () => {
    expect(() => assertTransition("archived", "draft")).toThrow(IllegalTransitionError);
  });
});
