# Notes for AI agents working on this repository

This file is for AI agents (e.g. Claude Code) that may be asked to make
changes to the codebase. Human contributors should read `README.md` and
`docs/` first.

## Ground rules

1. **Read `docs/02-domain.md` before changing any domain code.** The domain
   rules there are invariants, not suggestions.
2. **Respect the layering rule** (see `docs/04-architecture.md §4.2`):
   - `src/domain/**` is pure. No Prisma. No fetch. No env access.
   - `src/services/**` owns all writes. It imports domain + adapters/db.
   - `src/adapters/**` is pluggable I/O. It never imports services.
   - `app/**` never imports Prisma directly. It calls services via server
     actions.
3. **Versions are immutable.** Never write an `UPDATE` against a
   `PromptVersion` row that changes content, parent, number, or
   `contentHash`. Only `status` may transition.
4. **Every governance action is a `PromptDecision`.** Promotion,
   deprecation, archiving a branch — write the decision row atomically.
5. **Every lineage-changing operation writes a `PromptLineageEdge`** when
   it cannot be represented by a single `parentVersionId` (merge,
   cherry-pick, refinement).

## Where to add things

| You want to add… | Go to… |
|---|---|
| A new analyzer (refinement diagnostic) | `src/domain/analyzers/<name>.ts`, add to `index.ts` |
| A new evaluator | `src/adapters/evaluators/<name>.ts`, add to `registry.ts` |
| A new model provider | `src/adapters/models/<name>.ts`, add to `registry.ts` |
| A new entity | Prisma schema + a new service file + docs update |
| A new screen | `app/p/[project]/...`, call services via server actions |

## Testing expectations

Any change to `src/domain/**` or `src/adapters/evaluators/**` must come
with unit tests in `tests/` (Vitest). These are fast, pure, and cover the
invariants — keep them passing.

## Commit style

Small, focused commits. Commit messages explain *why*, not *what*. If you
change a domain rule, update `docs/02-domain.md` in the same commit.

## Things you should not do

- Do not weaken the version immutability rule.
- Do not add a "save" button that silently overwrites a version.
- Do not collapse distinct concepts (prompt content vs run envelope vs
  evaluation vs decision) into one table.
- Do not reach into Prisma from UI code to "just fix this one thing".
- Do not introduce a package without a clear domain need.
