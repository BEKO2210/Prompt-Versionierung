// Small statistics module for A/B comparison of binomial pass-rates.
//
// Why Wilson instead of the textbook normal approximation?
//   The normal (Wald) interval degenerates at p near 0 or 1 — it can extend
//   below 0 or above 1 and gives terrible coverage for small n. Wilson fixes
//   both failure modes at zero cost. We're routinely comparing prompt
//   versions with n ∈ [3, 50] paired trials, exactly the regime where
//   Wald lies and Wilson tells the truth.
//
// Why Newcombe's method 10 for the difference?
//   It is the standard Wilson-based CI for (p_B − p_A) on unpaired proportions
//   (Newcombe 1998, Stat Med 17). Simple, closed-form, well-calibrated
//   coverage, and composes cleanly from two per-side Wilson intervals.

export interface WilsonInterval {
  /** Point estimate, successes/n. Undefined if n=0 (returned as NaN). */
  p: number;
  lower: number;
  upper: number;
  n: number;
  successes: number;
}

/**
 * Wilson score interval for a single binomial proportion.
 * `z` defaults to 1.96 (two-sided α=0.05, 95% CI).
 * Returns {p:NaN, lower:NaN, upper:NaN} when n=0.
 */
export function wilsonInterval(
  successes: number,
  n: number,
  z: number = 1.96,
): WilsonInterval {
  if (n <= 0) return { p: NaN, lower: NaN, upper: NaN, n: 0, successes: 0 };
  const k = Math.max(0, Math.min(n, successes));
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return {
    p,
    lower: Math.max(0, center - margin),
    upper: Math.min(1, center + margin),
    n,
    successes: k,
  };
}

export interface WilsonDiffResult {
  /** p_B - p_A */
  diff: number;
  /** Lower bound of the CI for (p_B - p_A). */
  lower: number;
  /** Upper bound of the CI for (p_B - p_A). */
  upper: number;
  /** +1 if B significantly beats A, -1 if A beats B, 0 if not significant. */
  direction: 1 | -1 | 0;
  /** True iff 0 is outside [lower, upper]. */
  significant: boolean;
  /** Per-side Wilson intervals, exposed for display. */
  a: WilsonInterval;
  b: WilsonInterval;
}

/**
 * Newcombe's method 10 (1998) — confidence interval for the difference of
 * two independent binomial proportions, built from the two per-side Wilson
 * intervals.
 *
 * Significance: the difference is called significant at α when 0 ∉ CI.
 */
export function wilsonDiff(
  aSuccesses: number, aN: number,
  bSuccesses: number, bN: number,
  z: number = 1.96,
): WilsonDiffResult {
  const a = wilsonInterval(aSuccesses, aN, z);
  const b = wilsonInterval(bSuccesses, bN, z);
  if (aN === 0 || bN === 0) {
    return { diff: NaN, lower: NaN, upper: NaN, direction: 0, significant: false, a, b };
  }
  const d = b.p - a.p;
  // Method 10: bounds derived from the tails of each side's Wilson interval
  // that "point toward" zero.
  const lowerPart = Math.sqrt((a.p - a.lower) ** 2 + (b.upper - b.p) ** 2);
  const upperPart = Math.sqrt((a.upper - a.p) ** 2 + (b.p - b.lower) ** 2);
  // The difference of proportions is mathematically bounded to [-1, +1];
  // Newcombe's raw formula can spill beyond, so we clamp. Significance is
  // decided on the UNCLAMPED bounds so tight wins near the boundary still
  // register correctly.
  const rawLower = d - lowerPart;
  const rawUpper = d + upperPart;
  const significant = rawLower > 0 || rawUpper < 0;
  const lower = Math.max(-1, rawLower);
  const upper = Math.min(1, rawUpper);
  const direction: 1 | -1 | 0 = significant ? (d > 0 ? 1 : -1) : 0;
  return { diff: d, lower, upper, direction, significant, a, b };
}

/**
 * Convenience: given paired per-trial scores in [0,1], count how many
 * passed a threshold per side, then run the full A/B analysis.
 * `null` scores are ignored on that side (treated as missing, not failing).
 */
export function abFromScores(
  pairs: ReadonlyArray<{ a: number | null; b: number | null }>,
  threshold: number = 0.5,
  z: number = 1.96,
): WilsonDiffResult {
  let aN = 0, aK = 0, bN = 0, bK = 0;
  for (const p of pairs) {
    if (p.a != null) { aN += 1; if (p.a >= threshold) aK += 1; }
    if (p.b != null) { bN += 1; if (p.b >= threshold) bK += 1; }
  }
  return wilsonDiff(aK, aN, bK, bN, z);
}
