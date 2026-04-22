# Phase 2 — Domain Architecture

This document is the **source of truth** for the domain model. If code disagrees
with this document, the code is wrong.

## 2.1 Entity overview

```
Project ─┬─< Prompt ─┬─< Branch ──► head ──► Version
         │           ├─< Version ──< Version (parent_version_id)
         │           ├─< Tag assignments
         │           ├─< Decision
         │           └─< Comparison
         ├─< Tag
         ├─< Dataset ─< TestCase
         ├─< ModelProfile
         └─< Rubric

Version ─┬─< TemplateVariable
         ├─< Note
         ├─< OptimizationSuggestion
         └─< Run ─< Evaluation

LineageEdge: from_version_id → to_version_id  (kind = branch|merge|cherry_pick|refinement)
```

## 2.2 Entities

### 2.2.1 `PromptProject`
**Purpose**: Workspace boundary. Groups prompts, tags, datasets, rubrics, model
profiles. All retrieval and permissions (future) are scoped by project.

Fields: `id`, `slug`, `name`, `description`, `createdAt`, `updatedAt`.

Constraints: `slug` unique.

Lifecycle: created → (optionally) archived. No hard delete in MVP.

### 2.2.2 `Prompt`
**Purpose**: Logical prompt identity. "The customer-support greeting prompt" is
one `Prompt`. All its branches and versions live under it.

Fields: `id`, `projectId`, `slug`, `name`, `description`, `purpose` (the
*intent* — what this prompt is supposed to do), `canonicalBranchId`,
`createdAt`, `updatedAt`, `archivedAt`.

Constraints: `(projectId, slug)` unique. Exactly one branch per prompt is
canonical at any time (enforced by service, not schema, because branch
creation precedes the canonical pointer).

Lifecycle: created → active → archived (soft). Canonical branch can change
via a promotion decision, never by silent field flip.

### 2.2.3 `PromptBranch`
**Purpose**: Named mutable pointer into the version DAG, analogous to a git
branch. Enables parallel exploration.

Fields: `id`, `promptId`, `name`, `headVersionId`, `createdFromVersionId`
(nullable for the root branch), `status` (`active` | `archived`),
`isCanonical` (derived from `Prompt.canonicalBranchId`, surfaced here for
query ergonomics), `createdAt`, `updatedAt`.

Constraints: `(promptId, name)` unique. `headVersionId` must belong to the
same prompt.

Lifecycle: `active` → `archived`. Archived branches are hidden from default
views but remain in search and lineage. The canonical branch cannot be
archived.

### 2.2.4 `PromptVersion`
**Purpose**: The immutable unit. Every edit to a prompt produces a new version.

Fields:
- `id`, `promptId`, `parentVersionId` (nullable → root), `createdOnBranchId`
  (which branch the edit was made on), `number` (monotonic per prompt,
  starting at 1), `contentHash` (sha-256 of canonicalised content).
- `title` (short label), `body` (the template text), `messages` (optional
  JSON array of role-tagged messages; when present, `body` is derived).
- `status`: `draft` | `experimental` | `candidate` | `approved` |
  `deprecated` | `archived`.
- `modelHintId` (suggested `ModelProfile`, optional).
- `changeSummary` (what changed in this edit — short), `rationale` (why),
  `expectedImprovement` (hypothesis, optional).
- `createdAt`, `createdBy` (nullable).

Constraints: `(promptId, number)` unique. `parentVersionId` must reference a
version of the same prompt, or be null exactly once (the root). `contentHash`
is informational; identical hashes across versions are allowed (a revert
produces a new version with the same hash and different lineage).

Lifecycle:
```
draft → experimental → candidate → approved
                                 ↘  deprecated → archived
```
Allowed transitions are enforced in `domain/status.ts`. A version never moves
backwards except `approved → deprecated` (when a newer version supersedes it).

### 2.2.5 `PromptTemplateVariable`
**Purpose**: Declare a variable that the prompt body references as `{{name}}`.

Fields: `id`, `versionId`, `name`, `description`, `type` (`string` | `number`
| `boolean` | `enum` | `json`), `required`, `defaultValue` (JSON),
`enumValues` (JSON array, when `type = enum`).

Constraints: `(versionId, name)` unique. Every `{{name}}` reference in `body`
must have a declared variable; the service layer rejects versions that
violate this.

Lifecycle: immutable with its version.

### 2.2.6 `PromptLineageEdge`
**Purpose**: Explicit edge in the version DAG. Parent-child is already on
`PromptVersion.parentVersionId`; `PromptLineageEdge` captures additional
relationships that cannot be expressed with a single parent pointer:
- `merge`: two parents folded into one version.
- `cherry_pick`: a version derived by adopting changes from an unrelated
  branch.
- `refinement`: the new version was produced by accepting an
  `OptimizationSuggestion`.

Fields: `id`, `fromVersionId`, `toVersionId`, `kind`, `metadata` (JSON),
`createdAt`.

Constraints: `(fromVersionId, toVersionId, kind)` unique.

### 2.2.7 `PromptTag`
**Purpose**: Project-scoped label for retrieval and grouping.

Fields: `id`, `projectId`, `name`, `color`, `description`.

Constraints: `(projectId, name)` unique.

Tag assignments attach a tag to either a `Prompt` or a `PromptVersion`.
Separate join tables (`PromptTagAssignment`, `PromptVersionTagAssignment`)
keep the target unambiguous.

### 2.2.8 `PromptNote`
**Purpose**: Freeform annotation on a version. Cheap, unstructured capture.

Fields: `id`, `versionId`, `kind` (`observation` | `issue` | `idea` |
`warning`), `body`, `author` (nullable), `createdAt`.

### 2.2.9 `PromptDecision`
**Purpose**: Auditable record of a governance action on a prompt or version.

Fields: `id`, `promptId`, `versionId` (nullable — some decisions are
prompt-scoped, e.g. change canonical branch), `kind` (`promote` |
`demote` | `approve` | `deprecate` | `archive` | `set_canonical_branch`),
`rationale`, `decidedAt`, `decidedBy` (nullable), `metadata` (JSON — e.g.
`{ fromBranchId, toBranchId }`).

Constraints: decisions are append-only. Never deleted.

### 2.2.10 `ModelProfile`
**Purpose**: Named configuration for calling a model. Keeps model settings
out of the prompt.

Fields: `id`, `projectId`, `name`, `provider` (`anthropic` | `openai` |
`mock` | `custom`), `modelId` (string, e.g. `claude-opus-4-7`),
`defaultTemperature`, `defaultMaxTokens`, `settings` (JSON for
provider-specific options).

Constraints: `(projectId, name)` unique.

### 2.2.11 `PromptDataset` and `PromptTestCase`
**Purpose**: Reusable test input bundles.

`PromptDataset`: `id`, `projectId`, `name`, `description`.

`PromptTestCase`: `id`, `datasetId` (nullable — ad-hoc cases are allowed),
`name`, `inputVariables` (JSON, the variable bindings), `expectedOutput`
(nullable string), `expectedKind` (`contains` | `regex` | `exact` | `schema`
| `rubric` | `none`), `assertions` (JSON array of additional checks).

### 2.2.12 `PromptRun`
**Purpose**: One execution of one version with one test case and one model
profile. The full envelope, not just the output.

Fields: `id`, `versionId`, `testCaseId` (nullable), `modelProfileId`,
`renderedPrompt` (the string actually sent to the model), `variableBindings`
(JSON), `rawOutput` (string), `structuredOutput` (JSON, when parsed),
`status` (`queued` | `running` | `succeeded` | `failed`), `error` (nullable),
`temperature`, `maxTokens`, `latencyMs`, `inputTokens`, `outputTokens`,
`costEstimate` (nullable), `startedAt`, `finishedAt`.

Constraints: a run's `versionId` and the referenced model/test-case must
belong to the same project.

Lifecycle: `queued` → `running` → (`succeeded` | `failed`). No further
transitions.

### 2.2.13 `PromptEvaluation`
**Purpose**: A score on a run. Multiple evaluations per run are allowed
(e.g. human + LLM-judge + regex).

Fields: `id`, `runId`, `evaluatorKind` (`human` | `llm_judge` | `regex` |
`schema` | `similarity` | `rubric`), `evaluatorRef` (nullable — e.g.
`modelProfileId` for llm-judge, `rubricId` for rubric), `score` (0..1,
nullable for pass/fail-only evaluators), `passed` (nullable), `notes`,
`criteriaScores` (JSON — for rubric evaluators), `createdAt`, `createdBy`.

### 2.2.14 `PromptRubric`
**Purpose**: A reusable scoring rubric.

Fields: `id`, `projectId`, `name`, `description`, `criteria` (JSON array
of `{ name, description, weight, scale: { min, max } }`).

### 2.2.15 `PromptComparison`
**Purpose**: A saved side-by-side comparison with a preference.

Fields: `id`, `promptId`, `versionAId`, `versionBId`, `notes`,
`preferredVersionId` (nullable), `createdAt`, `createdBy`.

### 2.2.16 `OptimizationSuggestion`
**Purpose**: Output of the refinement engine. A proposed next version with
diagnosis and rationale, not yet accepted.

Fields: `id`, `versionId` (the version being refined), `diagnosis` (JSON:
array of `{ code, severity, detail }`), `proposedBody`, `proposedVariables`
(JSON), `rationale`, `status` (`pending` | `accepted` | `rejected`),
`createdVersionId` (nullable — set when accepted), `createdAt`.

## 2.3 Versioning logic

**Rule V1 — Immutability.** A `PromptVersion` row is append-only. Update
statements are forbidden except for `status` transitions (enforced in
`domain/status.ts`). `body`, `messages`, `title`, `parentVersionId`,
`number`, `contentHash`, `changeSummary`, `rationale`,
`expectedImprovement`, `createdAt`, `createdBy` are set at insert and never
mutated.

**Rule V2 — Monotonic numbering.** `number` is assigned per-prompt at
insert time as `max(number)+1`. The root version is `1`.

**Rule V3 — Canonical content hash.** `contentHash = sha256(NFC(title) || 0x1f
|| NFC(body) || 0x1f || JSON.stringify(sortedMessages))`. Equal hashes across
versions are allowed (reverts).

**Rule V4 — Every version has a branch.** A version is created *on* a
branch; `createdOnBranchId` is never null. The branch's `headVersionId`
advances to the new version atomically with the insert.

## 2.4 Branching logic

**Rule B1 — Fork point.** A branch is created from a specific version
(`createdFromVersionId`). The branch's initial `headVersionId` is that same
version; the first edit on the new branch produces a new version whose
`parentVersionId` is the fork point.

**Rule B2 — Branch naming.** Branch names are project-scoped-to-prompt and
must match `^[a-z][a-z0-9-]{0,63}$`. The root branch is always named
`main`.

**Rule B3 — No branch orphans.** Archiving a branch never removes its
versions. They remain addressable.

**Rule B4 — Canonical branch invariant.** Exactly one branch per prompt is
canonical. Changing canonical branch requires a `set_canonical_branch`
decision record with rationale.

## 2.5 Promotion semantics

Promotion moves a version into the canonical branch's head, preserving
history. It is *not* a merge in the git sense; it is a recorded copy of a
pointer plus an optional new version on the canonical branch when content
needs to advance.

Two modes:

1. **Pointer promotion**: the canonical branch's `headVersionId` is set to
   an existing version (only valid if that version's lineage is reachable
   from or compatible with the canonical branch's current head — see B5).
2. **Squashed promotion**: a new version is created *on the canonical
   branch* whose content is copied from the promoted version and whose
   parent is the canonical branch's previous head. A `LineageEdge` with
   kind `cherry_pick` links the source version to the new canonical
   version.

**Rule P1 — Every promotion records a decision.** `PromptDecision` with
kind `promote` is inserted atomically with the pointer/version change.

**Rule P2 — Promotion never archives automatically.** The previous
canonical version becomes `deprecated` only if explicitly chosen; by
default it stays `approved` so rollback is trivial.

**Rule B5 — Compatibility check.** Pointer promotion is allowed when the
target version is a descendant of the canonical head, or the canonical
branch has no head (initial state). Otherwise the system requires
squashed promotion, forcing the user to acknowledge they are overwriting
the canonical line with a foreign one.

## 2.6 Evaluation logic

**Rule E1 — Evaluations attach to runs, not versions.** Comparing versions
means comparing runs on matched `(testCase, modelProfile)` pairs.

**Rule E2 — Evaluations are additive.** Multiple evaluations per run are
normal. A "final score" is a computed aggregation, never stored as truth.

**Rule E3 — Attribution required.** Every evaluation records
`evaluatorKind` and (when applicable) `evaluatorRef`. Human evaluations
carry `createdBy` when available.

**Rule E4 — Rubric scoring is structured.** Rubric evaluations store
`criteriaScores` as `{ [criterionName]: { score, note } }`. The aggregate
`score` is weighted-average computed at insert time and stored for query
speed (but re-derivable).

## 2.7 Retrieval logic

**Full-text**: SQLite FTS5 (Postgres: `tsvector`) over
`prompt.name + description + purpose`, `version.title + body +
changeSummary + rationale`, `note.body`, `tag.name`.

**Lineage-scoped queries** operate on the transitive closure of
`parentVersionId` within a prompt. Because the DAG is small per prompt
(hundreds, not millions), recursive CTEs are fine; no denormalised
ancestry table in MVP.

**"Best for intent"**: semantic search over `prompt.purpose` +
`version.body` is planned; the domain layer exposes
`searchService.findByIntent(query, filters)` with a pluggable backend.
MVP falls back to trigram/FTS.

**Archived-aware**: default queries exclude archived prompts/branches.
All retrieval APIs accept `includeArchived: boolean`.

## 2.8 Refinement logic

The refinement engine is a pipeline:

1. **Diagnose** (`refinementService.diagnose(versionId)`): runs a set of
   heuristic analyzers over the version content. Each analyzer emits
   zero or more `DiagnosticFinding` records: `{ code, severity, detail,
   span? }`. Analyzers are pure functions; adding one is one file.
2. **Propose**: given diagnostics, produce one or more
   `OptimizationSuggestion` rows. The default proposer is heuristic; an
   `llm_proposer` is pluggable but not required for the domain to work.
3. **Accept/Reject**: an accept action atomically creates a new version
   (via `versionService.createVersion`), a `LineageEdge` with kind
   `refinement`, and updates the suggestion status.

**Rule R1 — Refinement never destroys.** Rejecting a suggestion marks it
`rejected` but keeps the record for retrieval ("show me ideas we
considered and discarded").

**Rule R2 — Accepted suggestions must produce lineage.** The edge
`refinement: fromVersionId → createdVersionId` is written in the same
transaction as the version insert.
