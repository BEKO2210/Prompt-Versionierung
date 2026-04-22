import { describe, it, expect } from "vitest";
import { contentHash, sameContent } from "../../src/domain/hashing";

describe("hashing", () => {
  it("is deterministic for identical content", () => {
    const a = { title: "t", body: "hello" };
    const b = { title: "t", body: "hello" };
    expect(contentHash(a)).toEqual(contentHash(b));
    expect(sameContent(a, b)).toBe(true);
  });

  it("is sensitive to title", () => {
    expect(contentHash({ title: "a", body: "x" })).not.toEqual(
      contentHash({ title: "b", body: "x" }),
    );
  });

  it("is sensitive to body", () => {
    expect(contentHash({ title: "t", body: "x" })).not.toEqual(
      contentHash({ title: "t", body: "y" })
    );
  });

  it("is sensitive to messages when present", () => {
    expect(
      contentHash({
        title: "t",
        body: "x",
        messages: [{ role: "system", content: "a" }],
      }),
    ).not.toEqual(
      contentHash({
        title: "t",
        body: "x",
        messages: [{ role: "system", content: "b" }],
      }),
    );
  });

  it("treats absent vs empty messages equivalently", () => {
    expect(
      contentHash({ title: "t", body: "x", messages: [] }),
    ).toEqual(contentHash({ title: "t", body: "x" }));
  });

  it("is NFC-normalised", () => {
    const nfd = "é"; // é decomposed
    const nfc = "é";
    expect(contentHash({ title: nfd, body: "" })).toEqual(
      contentHash({ title: nfc, body: "" }),
    );
  });
});
