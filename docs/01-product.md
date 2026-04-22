# Phase 1 — Product Definition

## 1.1 Product thesis

**Prompt Tree** is a prompt engineering operating system. It treats every prompt
as a living artifact with lineage, evidence, and decisions — not a text blob in
a Notion page or a copy in a config file.

The core insight: a prompt's value is not the current string, it is the
**decision tree** that produced it. If you only keep the latest version, you
lose the reasoning, the alternatives, the failed experiments, and the evidence
that tied a change to an improvement. Prompt Tree preserves all of it and makes
it retrievable.

One-line positioning: *git + notebook + eval harness, specialised for prompts.*

## 1.2 Core problems solved

1. **Prompts drift silently.** Edits overwrite history. Good phrasings get lost.
2. **"Improvements" are unverified.** Nobody tests the new version against the
   old one on the same inputs.
3. **Branching is implicit.** People keep `prompt_v2_final_FINAL_use_this.txt`
   instead of named branches with a shared ancestor.
4. **Evaluation is ad-hoc.** Judgements live in Slack threads, not attached to
   the artifact they describe.
5. **Retrieval is weak.** Three weeks later, nobody can find "the version we
   used for the customer-support tone experiment".
6. **Lineage is opaque.** A prompt in production has no traceable path back to
   the experiment that justified it.

## 1.3 User personas

| Persona | Goal | Pain today |
|---|---|---|
| **Solo prompt engineer** | Iterate on one prompt across dozens of variants, promote the winner | Lost versions, no diff, can't recall what worked |
| **Applied AI engineer** | Ship prompts to production with confidence and rollback | No audit trail, no A/B evidence, no rollback unit |
| **Researcher / evaluator** | Compare prompts across models and test cases | Re-running tests by hand, spreadsheet hell |
| **Team lead** | Approve canonical prompts, ensure governance | No promotion workflow, no status model |

MVP targets the first two. The domain model is designed so the latter two are
reachable without a rewrite.

## 1.4 System capabilities (what it does)

- **Model**: projects → prompts → branches → versions, with immutable versions.
- **Edit**: creating a new version is cheap, always records rationale.
- **Branch**: any version can fork a named branch; branches are first-class.
- **Diff**: line-level and structural diff between any two versions.
- **Render**: template variables are declared, validated, and substituted.
- **Test**: run a version against a test case with a model profile; record the
  full execution envelope (rendered prompt, raw output, tokens, latency).
- **Evaluate**: score a run with a human rubric, regex/schema check, similarity
  metric, or LLM-as-judge. Every score is attributed and inspectable.
- **Refine**: an analysis pass on a version produces structured weaknesses and
  proposed variants. Accepting a proposal forks a new version with the
  rationale attached.
- **Promote**: a candidate can be promoted to the canonical branch without
  destroying the experimental history.
- **Search**: full-text + metadata + lineage-scoped filters.
- **Browse**: tree, timeline, lineage graph, run history.

## 1.5 Design principles

1. **Immutability of the past.** Versions are append-only. Edits create new
   versions, never mutate old ones.
2. **Explicit lineage.** Every version has a parent (except the root). Merges
   and cherry-picks are modelled as explicit edges.
3. **Separation of concerns.** Prompt content, rendered prompt, model config,
   raw output, structured output, evaluation, and decision are *distinct*
   entities. They are never collapsed into one row.
4. **Decisions are artifacts.** Promote/deprecate/archive is a recorded
   decision with rationale, not a silent field flip.
5. **Testing is central, not bolted on.** Test cases are first-class;
   evaluation is attached to runs, not to prompts directly.
6. **Retrieval over deletion.** Even weak branches stay recoverable —
   archiving hides, it does not delete.
7. **Deterministic identity.** A version has a content hash. Re-typing the
   same text into a "new version" is detected.
8. **Extensible but minimal.** The MVP commits to concepts that will not need
   to be renamed later (branch, version, run, evaluation, decision).

## 1.6 Functional requirements (MVP)

- F1. Create a project; inside it create a prompt with a root version.
- F2. Edit a prompt by creating a new version; the old one is preserved
      verbatim and still addressable by URL.
- F3. Fork any version into a new named branch.
- F4. View the full tree of versions for a prompt.
- F5. Diff any two versions textually and structurally.
- F6. Define template variables on a version and render the prompt.
- F7. Define model profiles and test cases.
- F8. Run a version against a test case with a model profile, storing the full
      run envelope.
- F9. Attach evaluations (human score + at least one automatic evaluator) to
      a run.
- F10. Promote a version to the canonical branch (records a `PromptDecision`).
- F11. Archive a branch (hidden from default views but still searchable).
- F12. Full-text search across prompts, versions, notes, and tags.
- F13. A refinement workflow: analyse → propose → accept → fork-version, with
       rationale preserved.

## 1.7 Non-functional requirements

- **Type safety end-to-end.** No implicit `any`. Domain types are shared between
  server and client.
- **Migration-friendly schema.** All mutations go through a service layer; no
  direct Prisma access from UI code.
- **Auditability.** Every state transition is recorded as a `PromptDecision` or
  a run/eval record.
- **Local-first.** Dev uses SQLite, no external service required. Mock LLM
  provider lets the full flow run offline.
- **Swappable storage.** Prisma schema is compatible with PostgreSQL; moving
  from SQLite to Postgres is a config change and a migration, not a rewrite.
- **Deterministic rendering.** Given the same version + variable bindings,
  the rendered prompt is byte-identical.
- **CI-verified.** Typecheck, lint, unit tests, and build run on every push.

## 1.8 Explicit assumptions

- Single-user MVP. Auth, roles, and collaboration are out of scope but the
  data model already carries `created_by` / `decided_by` fields (nullable).
- Vector search is optional. The domain does not depend on it; it is an
  index adapter that can be added.
- Model-calling cost is a concern. The default provider is a deterministic
  mock so users can exercise the full workflow without an API key.
- Evaluation is pluggable. We ship four evaluators (regex, schema, similarity,
  llm-judge) but the `EvaluatorAdapter` interface is the contract.
- "Canonical" is per-prompt. Each prompt has exactly one canonical branch
  (default: `main`) whose head is the answer to "what prompt should I ship?".
