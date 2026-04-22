import { describe, it, expect } from "vitest";
import { prepareVersion } from "../../src/domain/versioning";
import { ValidationError } from "../../src/domain/errors";

describe("prepareVersion", () => {
  const base = {
    promptId: "p1",
    parentVersionId: null,
    createdOnBranchId: "b1",
  };

  it("requires a title", () => {
    expect(() =>
      prepareVersion({ ...base, title: "   ", body: "x", variables: [] }),
    ).toThrow(ValidationError);
  });

  it("requires body or messages", () => {
    expect(() =>
      // @ts-expect-error we deliberately omit body/messages
      prepareVersion({ ...base, title: "t", variables: [] }),
    ).toThrow();
  });

  it("rejects undeclared variables in body", () => {
    expect(() =>
      prepareVersion({
        ...base,
        title: "t",
        body: "Hi {{name}}",
        variables: [],
      }),
    ).toThrow(ValidationError);
  });

  it("rejects duplicate variable declarations", () => {
    expect(() =>
      prepareVersion({
        ...base,
        title: "t",
        body: "Hi {{a}}",
        variables: [
          { name: "a", type: "string", required: true },
          { name: "a", type: "string", required: true },
        ],
      }),
    ).toThrow(ValidationError);
  });

  it("requires enumValues for enum variables", () => {
    expect(() =>
      prepareVersion({
        ...base,
        title: "t",
        body: "x",
        variables: [{ name: "role", type: "enum", required: true }],
      }),
    ).toThrow(ValidationError);
  });

  it("assigns a deterministic content hash", () => {
    const a = prepareVersion({ ...base, title: "t", body: "hello", variables: [] });
    const b = prepareVersion({ ...base, title: "t", body: "hello", variables: [] });
    expect(a.contentHash).toBe(b.contentHash);
  });

  it("defaults status to draft", () => {
    const v = prepareVersion({ ...base, title: "t", body: "x", variables: [] });
    expect(v.status).toBe("draft");
  });
});
