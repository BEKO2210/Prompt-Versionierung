import { IllegalTransitionError } from "./errors";

// Version status state machine.
//
// Transitions (single source of truth — mirrors docs/02-domain.md §2.2.4):
//
//   draft ──► experimental ──► candidate ──► approved
//               │                 │              │
//               ▼                 ▼              ▼
//             archived         archived      deprecated ──► archived
//
// A version can always be archived (soft hide) except approved which must
// be deprecated first. This keeps "I archived the prompt we were shipping"
// from being a single-click mistake.

export type VersionStatus =
  | "draft"
  | "experimental"
  | "candidate"
  | "approved"
  | "deprecated"
  | "archived";

export const VERSION_STATUSES: readonly VersionStatus[] = [
  "draft",
  "experimental",
  "candidate",
  "approved",
  "deprecated",
  "archived",
] as const;

const TRANSITIONS: Record<VersionStatus, ReadonlyArray<VersionStatus>> = {
  draft:        ["experimental", "candidate", "archived"],
  experimental: ["candidate", "draft", "archived"],
  candidate:    ["approved", "experimental", "archived"],
  approved:     ["deprecated"],
  deprecated:   ["archived"],
  archived:     [],
};

export function canTransition(from: VersionStatus, to: VersionStatus): boolean {
  if (from === to) return true;
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: VersionStatus, to: VersionStatus): void {
  if (!canTransition(from, to)) {
    throw new IllegalTransitionError(from, to);
  }
}

export function isTerminal(status: VersionStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

// Branch status is simpler: active ↔ archived. The canonical branch cannot
// be archived (enforced in branchService).
export type BranchStatus = "active" | "archived";
