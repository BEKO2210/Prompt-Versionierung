// Approval gate on proposals.
//
// A proposal collects zero or more approvals, one per member (idempotent).
// The project carries a threshold (`approvalsRequired`, default 1) and the
// merge gate is simply `approvals.length >= approvalsRequired`.
//
// This module is pure: it computes the gate state from already-loaded
// records. Writes (approve / unapprove / set-threshold) live in the
// service layer. Keeping the read-side here lets us test the exact
// state machine the UI paints.

export interface Approval {
  id: string;
  author: string | null;
  createdAt: number;
}

export interface ProposalLike {
  status: "open" | "merged" | "closed";
  approvals?: readonly Approval[];
  openedBy?: string | null;
}

export interface ProjectLike {
  approvalsRequired?: number;
}

export interface ApprovalStatus {
  /** Number of approvals currently on the proposal. */
  have: number;
  /** Configured threshold, clamped to ≥ 0. Defaults to 1 when unset. */
  required: number;
  /** `required - have`, never negative. */
  remaining: number;
  /** True iff the merge gate is open. */
  canMerge: boolean;
  /** True iff the currently-acting member has approved. */
  approvedByCurrent: boolean;
  /** True iff the current member MAY approve (is set, hasn't approved yet,
      and is not the proposal's opener — self-approval is rejected). */
  canApprove: boolean;
}

/** Normalise a possibly-missing threshold. Default is 1 — reviewers are
    still required to act, but a single +1 is enough. */
export function approvalsRequired(project: ProjectLike): number {
  const n = project?.approvalsRequired;
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return 1;
  return Math.floor(n);
}

/** Whether `actorId` has already approved this proposal. */
export function hasApproved(
  proposal: ProposalLike,
  actorId: string | null | undefined,
): boolean {
  if (!actorId) return false;
  return (proposal.approvals || []).some((a) => a.author === actorId);
}

export function approvalStatus(
  proposal: ProposalLike,
  project: ProjectLike,
  currentActor: string | null | undefined,
): ApprovalStatus {
  const have = (proposal.approvals || []).length;
  const required = approvalsRequired(project);
  const remaining = Math.max(0, required - have);
  const canMerge = have >= required && proposal.status === "open";
  const approvedByCurrent = hasApproved(proposal, currentActor);
  const canApprove = Boolean(
    currentActor &&
    !approvedByCurrent &&
    proposal.status === "open" &&
    proposal.openedBy !== currentActor, // no self-approval
  );
  return { have, required, remaining, canMerge, approvedByCurrent, canApprove };
}
