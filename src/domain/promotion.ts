import { PromotionError } from "./errors";
import { isDescendant, type VersionNode } from "./lineage";

/**
 * Promotion compatibility (Rule B5, docs/02-domain.md §2.5).
 *
 * Pointer-promotion is allowed iff:
 *   - the canonical branch has no head yet (initial state), OR
 *   - the target version equals the current head, OR
 *   - the target version is a descendant of the current head.
 *
 * Otherwise, the caller must perform a squashed promotion and explicitly
 * acknowledge overwriting the canonical line.
 */

export type PromotionMode = "pointer" | "squashed";

export interface PromotionCheck {
  allowedPointer: boolean;
  reason: string | null;
}

export function checkPointerPromotion<T extends VersionNode>(
  nodes: ReadonlyArray<T>,
  canonicalHeadId: string | null,
  targetVersionId: string,
): PromotionCheck {
  if (!canonicalHeadId) {
    return { allowedPointer: true, reason: null };
  }
  if (canonicalHeadId === targetVersionId) {
    return { allowedPointer: true, reason: null };
  }
  if (isDescendant(nodes, targetVersionId, canonicalHeadId)) {
    return { allowedPointer: true, reason: null };
  }
  return {
    allowedPointer: false,
    reason:
      "Target version is not a descendant of the canonical head. Use squashed promotion and acknowledge overwriting the canonical line.",
  };
}

export function requirePointerPromotion<T extends VersionNode>(
  nodes: ReadonlyArray<T>,
  canonicalHeadId: string | null,
  targetVersionId: string,
): void {
  const check = checkPointerPromotion(nodes, canonicalHeadId, targetVersionId);
  if (!check.allowedPointer) {
    throw new PromotionError(check.reason ?? "Pointer promotion not allowed");
  }
}
