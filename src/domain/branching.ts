import { ValidationError } from "./errors";

const BRANCH_NAME_RE = /^[a-z][a-z0-9-]{0,63}$/;
const RESERVED_NAMES = new Set(["HEAD", "head"]);

/**
 * Validate a branch name. Rule B2 from docs/02-domain.md:
 *   - 1..64 chars
 *   - lowercase alphanumeric + hyphen
 *   - must start with a letter
 *   - case-insensitively not HEAD
 */
export function validateBranchName(name: string): void {
  if (!name || name.length === 0) {
    throw new ValidationError("Branch name is required");
  }
  if (RESERVED_NAMES.has(name)) {
    throw new ValidationError(`Branch name is reserved: ${name}`);
  }
  if (!BRANCH_NAME_RE.test(name)) {
    throw new ValidationError(
      "Branch name must match ^[a-z][a-z0-9-]{0,63}$ (lowercase, start with letter, hyphens allowed)",
    );
  }
}

export const ROOT_BRANCH_NAME = "main";

/**
 * Suggest a branch name for a refinement forked from a given version.
 * Example: `refine/v3-20240101T1200`.
 */
export function suggestRefineBranchName(sourceVersionNumber: number, now: Date = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  const stamp =
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}`;
  // Slug-safe: 'refine-v3-20240101-1200'
  return `refine-v${sourceVersionNumber}-${stamp}`;
}
