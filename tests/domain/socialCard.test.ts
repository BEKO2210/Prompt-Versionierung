import { describe, it, expect } from "vitest";
import {
  renderSocialCard, pickTitleSize, escapeText, escapeAttr, truncate,
} from "../../src/domain/socialCard";

const baseInput = {
  projectName: "Demo",
  promptName: "Ticket classifier",
  versionTitle: "With output format",
  versionNumber: 3,
  status: "approved",
  contentHashShort: "b5dfa91",
  changeSummary: "Added structured JSON output.",
  branches: 4,
  versions: 6,
  runs: 5,
};

describe("renderSocialCard — shape", () => {
  it("produces a well-formed SVG at 1200×630 by default", () => {
    const svg = renderSocialCard(baseInput);
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    expect(svg).toContain(`viewBox="0 0 1200 630"`);
    expect(svg).toContain(`width="1200"`);
    expect(svg).toContain(`height="630"`);
    expect(svg.trim().endsWith("</svg>")).toBe(true);
  });

  it("honours width/height/theme overrides deterministically", () => {
    const a = renderSocialCard(baseInput, { width: 800, height: 420, theme: "light" });
    const b = renderSocialCard(baseInput, { width: 800, height: 420, theme: "light" });
    expect(a).toBe(b);
    expect(a).toContain(`viewBox="0 0 800 420"`);
    expect(a).toContain(`stop-color="#ffffff"`); // light-theme background
  });

  it("embeds the core metadata so a reader can parse intent from the SVG alone", () => {
    const svg = renderSocialCard(baseInput);
    expect(svg).toContain("Ticket classifier");
    expect(svg).toContain("With output format");
    expect(svg).toContain("DEMO");         // project name uppercased in the eyebrow
    expect(svg).toContain("v3");
    expect(svg).toContain("APPROVED");
    expect(svg).toContain("b5dfa91");
    expect(svg).toContain(">4<");          // branches stat
    expect(svg).toContain(">6<");          // versions stat
    expect(svg).toContain(">5<");          // runs stat
  });

  it("never leaves user text unescaped — attribute or body surfaces", () => {
    const svg = renderSocialCard({
      ...baseInput,
      projectName: `Evil & "co"`,
      promptName: `<script>alert(1)</script>`,
    });
    expect(svg).not.toContain("<script>");
    expect(svg).not.toContain("alert(1)</script>");
    expect(svg).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    // aria-label uses escapeAttr so quotes become &quot;
    expect(svg).toMatch(/aria-label="[^"]*&lt;script&gt;/);
  });

  it("swallows missing optional fields gracefully (no undefined / NaN in output)", () => {
    const svg = renderSocialCard({
      ...baseInput,
      contentHashShort: undefined,
      changeSummary: "",
    });
    expect(svg).not.toContain("undefined");
    expect(svg).not.toContain("NaN");
    // No hash segment when contentHashShort is absent
    expect(svg).not.toMatch(/ · [a-f0-9]{7}</);
  });

  it("falls back to the brand tagline when none is provided", () => {
    const svg = renderSocialCard(baseInput);
    expect(svg).toContain("BRANCH. PROVE. SHIP.");
  });

  it("accepts a tagline override", () => {
    const svg = renderSocialCard({ ...baseInput, tagline: "Ship with receipts." });
    expect(svg).toContain("SHIP WITH RECEIPTS.");
  });
});

describe("pickTitleSize", () => {
  it("uses the biggest size for short names", () => {
    expect(pickTitleSize("short")).toBe(108);
  });
  it("scales down monotonically", () => {
    const sizes = [
      pickTitleSize("x".repeat(12)),
      pickTitleSize("x".repeat(20)),
      pickTitleSize("x".repeat(30)),
      pickTitleSize("x".repeat(60)),
    ];
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]!).toBeLessThanOrEqual(sizes[i - 1]!);
    expect(sizes[3]).toBe(58);
  });
});

describe("escape / truncate helpers", () => {
  it("escapeText handles the XML-sensitive trio", () => {
    expect(escapeText(`< & > — "ok"`)).toBe(`&lt; &amp; &gt; — "ok"`);
  });
  it("escapeAttr also escapes quotes", () => {
    expect(escapeAttr(`"Evil & co"`)).toBe(`&quot;Evil &amp; co&quot;`);
  });
  it("truncate keeps short strings untouched and adds ellipsis on overflow", () => {
    expect(truncate("hello", 10)).toBe("hello");
    // trailing whitespace before the ellipsis reads like a typo, so we
    // trim the cut edge before appending the glyph.
    expect(truncate("Hello, world!", 8)).toBe("Hello,…");
  });
  it("truncate handles the zero-max edge without throwing", () => {
    expect(truncate("anything", 0)).toBe("…");
  });
});
