# Prompt Tree

A prompt versioning, branching, testing, and refinement operating system.

**What it is.** Prompt Tree treats every prompt as an immutable versioned
artifact with lineage, evidence, and decisions — not a text blob. You can
fork branches like git, diff any two versions, run them against test cases,
attach evaluations, and promote winners into a canonical branch. Nothing is
overwritten; everything is retrievable.

## Why

- Prompts drift silently. Edits overwrite history. Good phrasings get lost.
- "Improvements" are unverified. Nobody runs the new version against the old
  one on the same inputs.
- Branching is implicit (`prompt_v2_final_FINAL_use_this.txt`). Promotion is
  a vibe, not a record.
- Retrieval is weak. Three weeks later nobody can find "the version we used
  for the customer-support tone experiment".

Prompt Tree addresses these directly and keeps the receipts.

## Reading order

Before touching code, read the design docs in `docs/`:

1. [`docs/01-product.md`](docs/01-product.md) — product thesis, personas, requirements
2. [`docs/02-domain.md`](docs/02-domain.md) — **the contract**: entities, lineage, promotion, status rules
3. [`docs/03-ux.md`](docs/03-ux.md) — screens, flows, keyboard UX
4. [`docs/04-architecture.md`](docs/04-architecture.md) — stack, layering rule, services, indexing
5. [`docs/05-roadmap.md`](docs/05-roadmap.md) — milestones, MVP scope, risks

The docs are the source of truth. If code disagrees with them, the code is
wrong.

## Stack

- Next.js 15 (App Router) + React 19 + TypeScript (strict)
- Prisma + SQLite for dev; Postgres-compatible
- Tailwind CSS
- Vitest for unit tests
- Zero-setup dev: a deterministic **mock model provider** is default, so the
  whole product loop works without an API key.

## Layering rule

```
app/           ← Next.js UI + server actions (calls services only)
src/services   ← application services (owns DB writes; calls domain + adapters)
src/domain     ← pure TypeScript (no I/O, no Prisma) — invariants live here
src/adapters   ← DB (prisma), model providers, evaluators
```

Never import Prisma from UI code. Never call model providers from domain
code. These are enforced by review; future CI will encode them as lint rules.

## Local setup

```bash
# 1. install deps
npm install

# 2. init the database (SQLite file in prisma/dev.db)
cp .env.example .env
npx prisma generate
npx prisma db push

# 3. seed a demo project (optional but recommended)
npm run db:seed

# 4. run the app
npm run dev
```

Open http://localhost:3000, pick the `demo` project, open the
`ticket-classifier` prompt. Use the tree panel on the left; fork, edit,
run, refine, compare from any version.

## Running tests

```bash
npm run test         # run once
npm run test:watch   # watch mode
npm run typecheck    # strict tsc, no emit
npm run lint         # eslint (next/core-web-vitals)
```

The test suite is pure: it exercises `src/domain/**` and
`src/adapters/evaluators/**` with no database.

## CI

`.github/workflows/ci.yml` runs four jobs on every push:

| Job | Purpose |
|---|---|
| `domain-tests` | `npm run test` — pure unit tests |
| `typecheck` | `tsc --noEmit` |
| `lint` | `next lint` |
| `build` | `prisma db push` + `next build` against a SQLite CI db |

## Using a real model provider

By default, every run uses the mock provider. To call Anthropic:

1. Set `MODEL_PROVIDER=anthropic` and `ANTHROPIC_API_KEY=sk-...` in `.env`.
2. Create a `ModelProfile` with `provider="anthropic"` and a real model id.

Swapping providers does not touch domain or service code — new providers
are one new file under `src/adapters/models/` plus one line in `registry.ts`.

## Conceptual glossary

| Term | What it means in Prompt Tree |
|---|---|
| **Prompt** | The *logical identity* of a prompt (e.g. "ticket classifier"). All branches and versions live under it. |
| **Branch** | A named mutable pointer into the version DAG. `main` is canonical. |
| **Version** | An immutable snapshot. Every edit creates a new version. `contentHash` is part of it. |
| **Canonical branch** | Per-prompt, exactly one. Its head answers "what should I ship?". |
| **Run** | One execution envelope: rendered prompt, raw output, tokens, latency. |
| **Evaluation** | A score on a run. Multiple per run are normal. Evaluators are pluggable. |
| **Decision** | A governance artifact for promote/deprecate/archive. Append-only. |
| **Suggestion** | A refinement proposal. Accepting it forks a new version with a `refinement` lineage edge. |

## Non-goals (MVP)

- No auth. `createdBy`/`decidedBy` exist but are optional.
- No streaming run output in the UI.
- No vector search. FTS is SQL LIKE; swap for FTS5/pgvector in M4.
- No scheduling, no CRON, no LLM-judge evaluator (M3).

See `docs/05-roadmap.md` for the full milestone plan.
