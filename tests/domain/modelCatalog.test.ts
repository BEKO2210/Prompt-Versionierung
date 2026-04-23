import { describe, it, expect } from "vitest";
import {
  MODEL_CATALOG, getProvider, defaultModelFor, findModel, openaiParamShape,
} from "../../src/domain/modelCatalog";

describe("MODEL_CATALOG shape", () => {
  it("lists all four providers with non-empty model rosters", () => {
    const ids = MODEL_CATALOG.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(["openai", "anthropic", "google", "mock"]));
    for (const p of MODEL_CATALOG) expect(p.models.length).toBeGreaterThan(0);
  });

  it("only the mock provider skips the API-key requirement", () => {
    const keyless = MODEL_CATALOG.filter((p) => !p.requiresKey);
    expect(keyless.map((p) => p.id)).toEqual(["mock"]);
  });

  it("defaultModelFor returns the first entry, which stays stable on each provider", () => {
    expect(defaultModelFor("openai")?.id).toBe("gpt-5");
    expect(defaultModelFor("anthropic")?.id).toBe("claude-opus-4-7");
    expect(defaultModelFor("google")?.id).toBe("gemini-2.5-pro");
    expect(defaultModelFor("mock")?.id).toBe("mock-echo");
    expect(defaultModelFor("nonexistent")).toBeUndefined();
  });

  it("findModel is case-insensitive", () => {
    expect(findModel("openai", "GPT-5")?.id).toBe("gpt-5");
    expect(findModel("openai", "typo")).toBeUndefined();
  });
});

describe("openaiParamShape — the fix for the user-reported 400", () => {
  it("modern flagship (gpt-5) uses max_completion_tokens + supports temperature", () => {
    const r = openaiParamShape("gpt-5");
    expect(r.maxTokensField).toBe("max_completion_tokens");
    expect(r.supportsTemperature).toBe(true);
  });

  it("gpt-5-mini routes the same way as gpt-5", () => {
    expect(openaiParamShape("gpt-5-mini").maxTokensField).toBe("max_completion_tokens");
  });

  it("gpt-4.1 family is modern (max_completion_tokens)", () => {
    expect(openaiParamShape("gpt-4.1").maxTokensField).toBe("max_completion_tokens");
    expect(openaiParamShape("gpt-4.1-mini").maxTokensField).toBe("max_completion_tokens");
  });

  it("reasoning models pin temperature off AND use max_completion_tokens", () => {
    for (const id of ["o1", "o3", "o4-mini"]) {
      const r = openaiParamShape(id);
      expect(r.maxTokensField).toBe("max_completion_tokens");
      expect(r.supportsTemperature).toBe(false);
    }
  });

  it("legacy gpt-4o family still accepts max_tokens (explicit catalog opt-in)", () => {
    expect(openaiParamShape("gpt-4o").maxTokensField).toBe("max_tokens");
    expect(openaiParamShape("gpt-4o-mini").maxTokensField).toBe("max_tokens");
  });

  it("truly-legacy gpt-4 / gpt-3.5 keep the legacy key (heuristic branch)", () => {
    expect(openaiParamShape("gpt-3.5-turbo").maxTokensField).toBe("max_tokens");
    expect(openaiParamShape("gpt-4").maxTokensField).toBe("max_tokens");
    expect(openaiParamShape("gpt-4-turbo").maxTokensField).toBe("max_tokens");
    expect(openaiParamShape("gpt-4-0613").maxTokensField).toBe("max_tokens");
  });

  it("unknown model ids default to the MODERN key (safe everywhere)", () => {
    // Future models we haven't put in the catalog yet shouldn't send
    // the legacy `max_tokens` and trip the 400 the user reported.
    expect(openaiParamShape("some-future-gpt").maxTokensField).toBe("max_completion_tokens");
    expect(openaiParamShape("gpt-5-2025-07-30").maxTokensField).toBe("max_completion_tokens");
    expect(openaiParamShape("").maxTokensField).toBe("max_completion_tokens");
  });

  it("case doesn't matter", () => {
    expect(openaiParamShape("GPT-5").maxTokensField).toBe("max_completion_tokens");
    expect(openaiParamShape("O3").maxTokensField).toBe("max_completion_tokens");
    expect(openaiParamShape("O3").supportsTemperature).toBe(false);
  });
});

describe("getProvider", () => {
  it("returns the entry by id and undefined for unknowns", () => {
    expect(getProvider("openai")?.label).toBe("OpenAI");
    expect(getProvider("gemini")).toBeUndefined(); // id is "google", not "gemini"
    expect(getProvider("google")?.label).toMatch(/Gemini/);
  });
});
