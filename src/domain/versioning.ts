import { ValidationError } from "./errors";
import { contentHash, type HashableContent } from "./hashing";
import { extractReferences, type VariableDecl } from "./rendering";
import type { VersionStatus } from "./status";

/**
 * Invariants for creating a new version (V1..V4 in docs/02-domain.md §2.3):
 *
 *   V1 Immutability — this file is used at *insert time only*; subsequent
 *      updates to the returned shape are forbidden except status.
 *   V2 Monotonic numbering — number = max(number)+1, assigned in the tx.
 *   V3 Canonical content hash — contentHash is computed here.
 *   V4 Every version has a branch — createdOnBranchId is required.
 *
 * This module is pure: no DB access. It prepares a DTO the service inserts.
 */

export interface NewVersionInput {
  promptId: string;
  parentVersionId: string | null;
  createdOnBranchId: string;
  title: string;
  body: string;
  messages?: Array<{ role: string; content: string }> | null;
  variables: ReadonlyArray<VariableDecl>;
  status?: VersionStatus;
  modelHintId?: string | null;
  changeSummary?: string | null;
  rationale?: string | null;
  expectedImprovement?: string | null;
  createdBy?: string | null;
}

export interface PreparedVersion {
  promptId: string;
  parentVersionId: string | null;
  createdOnBranchId: string;
  title: string;
  body: string;
  messages: Array<{ role: string; content: string }> | null;
  contentHash: string;
  status: VersionStatus;
  modelHintId: string | null;
  changeSummary: string | null;
  rationale: string | null;
  expectedImprovement: string | null;
  createdBy: string | null;
  variables: ReadonlyArray<VariableDecl>;
}

function assertVariablesMatchBody(body: string, vars: ReadonlyArray<VariableDecl>) {
  const refs = new Set(extractReferences(body));
  const declared = new Set(vars.map((v) => v.name));
  const undeclared = [...refs].filter((r) => !declared.has(r));
  if (undeclared.length > 0) {
    throw new ValidationError(
      `Body references undeclared variable(s): ${undeclared.join(", ")}`,
      { variables: "undeclared_references" },
    );
  }
  // Duplicate declarations
  const seen = new Set<string>();
  for (const v of vars) {
    if (seen.has(v.name)) {
      throw new ValidationError(`Duplicate variable declaration: ${v.name}`);
    }
    seen.add(v.name);
    if (v.type === "enum" && (!v.enumValues || v.enumValues.length === 0)) {
      throw new ValidationError(`Enum variable ${v.name} requires enumValues`);
    }
  }
}

function assertMessagesValid(
  messages: NewVersionInput["messages"],
): asserts messages is Array<{ role: string; content: string }> | null | undefined {
  if (!messages) return;
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new ValidationError("messages must be a non-empty array when provided");
  }
  for (const m of messages) {
    if (!m.role || typeof m.role !== "string") {
      throw new ValidationError("message.role is required");
    }
    if (typeof m.content !== "string") {
      throw new ValidationError("message.content must be a string");
    }
  }
}

export function prepareVersion(input: NewVersionInput): PreparedVersion {
  if (!input.title || input.title.trim().length === 0) {
    throw new ValidationError("Version title is required");
  }
  if (!input.body && !input.messages) {
    throw new ValidationError("Version must have either body or messages");
  }

  assertMessagesValid(input.messages);
  assertVariablesMatchBody(input.body ?? "", input.variables);

  const hashable: HashableContent = {
    title: input.title,
    body: input.body ?? "",
    messages: input.messages ?? null,
  };

  return {
    promptId: input.promptId,
    parentVersionId: input.parentVersionId,
    createdOnBranchId: input.createdOnBranchId,
    title: input.title,
    body: input.body,
    messages: input.messages ?? null,
    contentHash: contentHash(hashable),
    status: input.status ?? "draft",
    modelHintId: input.modelHintId ?? null,
    changeSummary: input.changeSummary ?? null,
    rationale: input.rationale ?? null,
    expectedImprovement: input.expectedImprovement ?? null,
    createdBy: input.createdBy ?? null,
    variables: input.variables,
  };
}
