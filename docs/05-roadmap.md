# Phase 5 — Implementation Plan & Roadmap

## 5.1 Milestones

### M0 — Foundations (this PR)
- Repo scaffold, tooling, CI.
- Design docs (phases 1-5).
- Prisma schema + migration.
- Pure domain layer (versioning, branching, lineage, promotion, diff,
  rendering, hashing, status, analyzers).
- Service layer (projects, prompts, branches, versions, runs,
  evaluations, refinement, search, comparisons, decisions, datasets,
  model profiles, rubrics).
- Adapters: mock model provider; regex/schema/similarity/rubric evaluators.
- Minimal UI: project list, prompt list, prompt tree, version detail,
  diff view, refinement workspace, search.
- Unit tests for domain and critical service paths.
- GitHub Actions workflow.

### M1 — Production-ready MVP
- Real model adapter (Anthropic) with streaming.
- Run history UI with filters.
- Rubric editor UI.
- Dataset / test-case CRUD UI.
- Notes UI.
- Decision log UI.
- Keyboard shortcuts and `Cmd-K` search.

### M2 — Team readiness
- Auth (NextAuth) + per-project membership.
- Role-based decision rights (only `maintainer+` can promote).
- Audit trail export (CSV / JSON).

### M3 — Evaluation depth
- LLM-as-judge evaluator with rubric binding.
- Batch suites (run all test cases against a set of versions).
- Benchmarks: track a metric over versions; time-series chart.

### M4 — Retrieval depth
- pgvector-backed semantic search.
- "Show best version for this intent" query.
- Similarity-based duplicate detection on create.

### M5 — Optimization loops
- Automatic refinement loop: propose → run → evaluate → propose until
  score plateaus. Every iteration is a new version.
- Multi-model adaptation: a "model family" abstraction that creates
  parallel versions optimised for different models.

## 5.2 Build order (M0)

1. Tooling & configs.
2. Prisma schema.
3. Domain types and errors.
4. Hashing + rendering + diff + status + lineage (pure, testable).
5. Analyzers.
6. Service context + projectService + promptService + branchService.
7. versionService (the hardest; depends on all of the above).
8. runService + mock model adapter.
9. evaluationService + regex/schema/similarity/rubric evaluators.
10. refinementService (wires analyzers + versionService + lineage edges).
11. searchService (FTS indexer + query).
12. decisionService, comparisonService.
13. UI: layouts, project list, prompt tree, version detail, diff, refine.
14. Tests and CI.

## 5.3 MVP feature set (explicit)

- Projects, prompts, branches, versions — all CRUD that preserves
  immutability.
- Fork, diff, promote with decision record.
- Variable declaration + deterministic rendering.
- Run with mock model, regex+schema+similarity+rubric eval.
- Refinement: heuristic analyzers → suggestions → accept creates lineage.
- FTS-backed search within a project.
- Prompt tree UI, version detail UI, diff UI, refinement UI.
- CI: typecheck, lint, test, build.

## 5.4 Strongest differentiators

1. **Separation of prompt content, rendered prompt, run envelope,
   evaluation, and decision.** Competitors collapse these into one row;
   we treat them as distinct first-class entities. Every "the prompt got
   better" claim has receipts attached to it.
2. **Explicit lineage DAG with edge kinds.** Not just parent pointers:
   merge, cherry-pick, and refinement edges. The refinement edge is what
   makes the optimization loop auditable.
3. **Decisions as artifacts.** Promote/approve/deprecate are rows, not
   status flips. The canonical branch can only change through a decision.
4. **Content hashing.** Duplicate versions are detected; reverts produce
   a new version with the old hash, keeping lineage honest.
5. **Pure domain layer.** Versioning, branching, promotion, and
   diagnostics are unit-tested without a database. Swapping stacks is
   bounded.

## 5.5 Biggest risks

| Risk | Mitigation |
|---|---|
| Feature creep turns MVP into a CRUD graveyard | Rigid layering rule; if it doesn't move the tree/version/run/eval loop forward, it's M1+ |
| UX for tree/diff is hard to get right | MVP ships a keyboard-first functional tree and defers visual polish; every action is also in a menu |
| Evaluator pluggability leaks Prisma types into domain | `EvaluatorAdapter` interface takes and returns plain DTOs; Prisma types never enter |
| Promotion semantics confuse users | Compatibility check + required rationale + decision log make the operation explicit and reversible (rollback = promote the previous version back) |
| Mock provider hides real-integration bugs | Anthropic adapter is implemented against the same interface in M1 and exercised by a smoke test in CI when a secret is available |
| Refinement engine produces low-value suggestions | Diagnostics are transparent; users see *why* a suggestion was made. Over time, analyzers are tuned; users can disable any analyzer. |

## 5.6 Next best expansions after MVP

1. **Collaboration & approvals** — auth, roles, PR-style approval for
   promotion.
2. **Benchmarks over time** — score a prompt against the same suite on
   every new version; show a trend line.
3. **Semantic search** — pgvector-backed retrieval.
4. **Model-family adaptations** — given one canonical prompt, maintain
   parallel branches per model with automatic cross-evaluation.
5. **Prompt packs** — reusable template components, imported across
   prompts with their own versioning.
6. **Public read-only links** — share a prompt tree with a customer or
   collaborator without giving write access.
