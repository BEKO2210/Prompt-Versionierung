import { describe, it, expect } from "vitest";
import { suggestRefineBranchName, validateBranchName } from "../../src/domain/branching";
import { ValidationError } from "../../src/domain/errors";

describe("validateBranchName", () => {
  it("accepts lowercase alphanumerics and hyphens", () => {
    expect(() => validateBranchName("main")).not.toThrow();
    expect(() => validateBranchName("refine-v3-202404")).not.toThrow();
  });

  it("rejects uppercase", () => {
    expect(() => validateBranchName("Main")).toThrow(ValidationError);
  });

  it("rejects reserved names", () => {
    expect(() => validateBranchName("HEAD")).toThrow(ValidationError);
    expect(() => validateBranchName("head")).toThrow(ValidationError);
  });

  it("rejects names starting with non-letter", () => {
    expect(() => validateBranchName("1-hot")).toThrow(ValidationError);
    expect(() => validateBranchName("-foo")).toThrow(ValidationError);
  });

  it("rejects empty", () => {
    expect(() => validateBranchName("")).toThrow(ValidationError);
  });

  it("rejects names longer than 64", () => {
    expect(() => validateBranchName("a".repeat(65))).toThrow(ValidationError);
  });
});

describe("suggestRefineBranchName", () => {
  it("produces a deterministic slug for a fixed date", () => {
    const fixed = new Date(Date.UTC(2024, 0, 1, 12, 30));
    expect(suggestRefineBranchName(7, fixed)).toBe("refine-v7-20240101-1230");
  });

  it("always matches the branch name regex", () => {
    const name = suggestRefineBranchName(123, new Date());
    expect(() => validateBranchName(name)).not.toThrow();
  });
});
