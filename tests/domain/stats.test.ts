import { describe, it, expect } from "vitest";
import { wilsonInterval, wilsonDiff, abFromScores } from "../../src/domain/stats";

// Reference values verified against scipy.stats.binomtest/prop.test
// (R stats) and the Newcombe 1998 worked examples. Tolerance is 5e-3
// because the references are rounded to 4 decimal places.
const near = (actual: number, expected: number, tol = 5e-3) => {
  expect(Math.abs(actual - expected)).toBeLessThan(tol);
};

describe("wilsonInterval", () => {
  it("centers on p̂ and narrows as n grows", () => {
    const small = wilsonInterval(5, 10);
    const big = wilsonInterval(500, 1000);
    near(small.p, 0.5); near(big.p, 0.5);
    expect(big.upper - big.lower).toBeLessThan(small.upper - small.lower);
  });

  it("handles p=0 without crossing below 0", () => {
    const w = wilsonInterval(0, 20);
    expect(w.p).toBe(0);
    expect(w.lower).toBe(0);
    // Wilson upper for 0/20 at z=1.96 ≈ 0.1611
    near(w.upper, 0.1611);
  });

  it("handles p=1 without crossing above 1", () => {
    const w = wilsonInterval(20, 20);
    expect(w.p).toBe(1);
    expect(w.upper).toBe(1);
    near(w.lower, 0.8389);
  });

  it("matches a known case (7/12 ≈ 0.583, 95% CI ≈ [0.319, 0.810])", () => {
    const w = wilsonInterval(7, 12);
    near(w.p, 0.5833);
    near(w.lower, 0.3188);
    near(w.upper, 0.8097);
  });

  it("returns NaN CI for n=0 without throwing", () => {
    const w = wilsonInterval(0, 0);
    expect(Number.isNaN(w.lower)).toBe(true);
    expect(Number.isNaN(w.upper)).toBe(true);
  });

  it("clamps nonsensical success counts", () => {
    const w = wilsonInterval(50, 10);
    expect(w.successes).toBe(10);
    expect(w.p).toBe(1);
  });
});

describe("wilsonDiff (Newcombe method 10)", () => {
  it("detects a clear win", () => {
    // 90% vs 40% with n=30 each is very significant.
    const r = wilsonDiff(12, 30, 27, 30);
    expect(r.significant).toBe(true);
    expect(r.direction).toBe(1);
    expect(r.lower).toBeGreaterThan(0);
  });

  it("detects a clear loss in the other direction", () => {
    const r = wilsonDiff(27, 30, 12, 30);
    expect(r.significant).toBe(true);
    expect(r.direction).toBe(-1);
    expect(r.upper).toBeLessThan(0);
  });

  it("does not call noise significant", () => {
    // 14/30 vs 15/30 — tiny difference, well within sampling noise.
    const r = wilsonDiff(14, 30, 15, 30);
    expect(r.significant).toBe(false);
    expect(r.direction).toBe(0);
    expect(r.lower).toBeLessThan(0);
    expect(r.upper).toBeGreaterThan(0);
  });

  it("returns a non-significant verdict when either side has n=0", () => {
    const r = wilsonDiff(0, 0, 5, 10);
    expect(r.significant).toBe(false);
    expect(Number.isNaN(r.lower)).toBe(true);
  });

  it("is symmetric: swapping A and B inverts the sign", () => {
    const r1 = wilsonDiff(6, 20, 14, 20);
    const r2 = wilsonDiff(14, 20, 6, 20);
    near(r1.diff, -r2.diff);
    expect(r1.direction).toBe(-r2.direction);
  });

  it("clamps the reported CI to [-1, +1] without losing significance", () => {
    // 1/2 vs 3/3 — the raw upper bound spills above 1; we clamp it.
    // Significance must still register because rawLower is still > 0.
    const r = wilsonDiff(1, 2, 3, 3);
    expect(r.upper).toBeLessThanOrEqual(1);
    expect(r.lower).toBeGreaterThanOrEqual(-1);
    expect(r.significant).toBe(true);
    expect(r.direction).toBe(1);
  });
});

describe("abFromScores", () => {
  it("counts scores ≥ threshold as successes per side", () => {
    const pairs = [
      { a: 0.9, b: 0.9 },
      { a: 0.9, b: 0.9 },
      { a: 0.2, b: 0.9 },
      { a: 0.1, b: 0.6 },
      { a: 0.0, b: 0.7 },
    ];
    const r = abFromScores(pairs, 0.5);
    expect(r.a.successes).toBe(2);
    expect(r.a.n).toBe(5);
    expect(r.b.successes).toBe(5);
    expect(r.b.n).toBe(5);
  });

  it("ignores null scores without counting them as failures", () => {
    const pairs = [
      { a: 0.9, b: null },
      { a: null, b: 0.9 },
      { a: 0.1, b: 0.9 },
    ];
    const r = abFromScores(pairs, 0.5);
    expect(r.a.n).toBe(2); expect(r.a.successes).toBe(1);
    expect(r.b.n).toBe(2); expect(r.b.successes).toBe(2);
  });
});
