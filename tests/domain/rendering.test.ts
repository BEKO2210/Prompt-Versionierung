import { describe, it, expect } from "vitest";
import { extractReferences, findUndeclaredReferences, render } from "../../src/domain/rendering";
import { ValidationError } from "../../src/domain/errors";

describe("rendering", () => {
  it("extracts variable references", () => {
    expect(extractReferences("Hello {{name}}, you are {{role}}.")).toEqual(["name", "role"]);
  });

  it("ignores whitespace around names", () => {
    expect(extractReferences("{{ foo }} {{bar }} {{  baz}}")).toEqual(["foo", "bar", "baz"]);
  });

  it("finds undeclared references", () => {
    expect(findUndeclaredReferences("Hi {{name}}", [])).toEqual(["name"]);
    expect(
      findUndeclaredReferences(
        "Hi {{name}}",
        [{ name: "name", type: "string", required: true }],
      ),
    ).toEqual([]);
  });

  it("renders simple substitution", () => {
    const r = render(
      "Hello {{name}}, you are {{role}}.",
      [
        { name: "name", type: "string", required: true },
        { name: "role", type: "string", required: true },
      ],
      { name: "Ada", role: "builder" },
    );
    expect(r.rendered).toBe("Hello Ada, you are builder.");
    expect(r.warnings).toEqual([]);
  });

  it("throws on undeclared references", () => {
    expect(() => render("Hi {{x}}", [], {})).toThrow(ValidationError);
  });

  it("throws on missing required with no default", () => {
    expect(() =>
      render("Hi {{x}}", [{ name: "x", type: "string", required: true }], {}),
    ).toThrow(ValidationError);
  });

  it("uses default when value missing and non-required", () => {
    const r = render(
      "n={{x}}",
      [{ name: "x", type: "string", required: false, defaultValue: "fallback" }],
      {},
    );
    expect(r.rendered).toBe("n=fallback");
  });

  it("warns on unused bindings", () => {
    const r = render(
      "n={{x}}",
      [{ name: "x", type: "string", required: true }],
      { x: "a", unused: 3 },
    );
    expect(r.warnings).toContain("Unused binding: unused");
  });

  it("validates enum values", () => {
    expect(() =>
      render(
        "{{tier}}",
        [{ name: "tier", type: "enum", required: true, enumValues: ["free", "pro"] }],
        { tier: "gold" },
      ),
    ).toThrow(ValidationError);
  });

  it("coerces numbers", () => {
    const r = render(
      "n={{n}}",
      [{ name: "n", type: "number", required: true }],
      { n: "42" },
    );
    expect(r.rendered).toBe("n=42");
  });
});
