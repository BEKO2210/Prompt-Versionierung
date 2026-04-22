# Phase 4 — Technical Architecture

## 4.1 Stack choice

| Layer | Choice | Why |
|---|---|---|
| Frontend & server | **Next.js 15 (App Router) + React 19** | Single codebase, server actions for mutations, streaming, permanent URLs for immutable versions fit naturally. |
| Language | **TypeScript (strict)** | Domain model is the invariant; strict types enforce it across client/server. |
| Styling | **Tailwind CSS + @tailwindcss/typography** | Fast iteration on tree/diff UIs without a heavy component lib. |
| DB (dev) | **SQLite** via Prisma | Zero-setup local dev; FTS5 available. |
| DB (prod-ready) | **PostgreSQL** | Same Prisma schema; swap `provider`. |
| ORM | **Prisma** | Migration-friendly, strong types, clear schema file. |
| Background jobs | In-process queue (MVP) with swap-in adapter for BullMQ / QStash (V2) | Runs/evals can be sync-mock in MVP; real providers need async. |
| Testing | **Vitest** | Fast, ESM-native, TS-first. |
| Lint | **ESLint + @typescript-eslint + eslint-config-next** | Standard. |
| CI | **GitHub Actions** | `typecheck`, `lint`, `test`, `build` on every push. |

**What we deliberately did not choose:**
- No heavy UI kit (shadcn is fine to adopt later; MVP stays dependency-thin).
- No tRPC. Server actions + a handful of route handlers are enough for the
  domain; tRPC would duplicate Prisma's type generation.
- No Redux. React context for the compare basket, URL state for everything
  else. Server state from server components + mutations via server actions.
- No GraphQL. The domain is traversal-heavy but well-suited to typed service
  functions; GraphQL would bring schema duplication without a payoff.

## 4.2 Folder structure

```
/
├── .github/workflows/ci.yml
├── app/                          Next.js app router (routes + UI)
│   ├── layout.tsx
│   ├── page.tsx
│   ├── p/[project]/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── prompts/page.tsx
│   │   ├── prompts/[prompt]/page.tsx
│   │   ├── prompts/[prompt]/v/[version]/page.tsx
│   │   ├── prompts/[prompt]/compare/page.tsx
│   │   ├── prompts/[prompt]/refine/[version]/page.tsx
│   │   ├── datasets/page.tsx
│   │   ├── models/page.tsx
│   │   └── search/page.tsx
│   ├── actions/                  Server actions (thin wrappers over services)
│   └── api/                      Route handlers where actions don't fit
├── src/
│   ├── domain/                   Pure domain (no I/O, no Prisma)
│   │   ├── ids.ts                Branded IDs
│   │   ├── status.ts             Status transitions
│   │   ├── versioning.ts         Version creation rules
│   │   ├── branching.ts          Branch naming, fork rules
│   │   ├── lineage.ts            DAG helpers, BFS/DFS, LCA
│   │   ├── promotion.ts          Compatibility check
│   │   ├── diff.ts               Text + variable + metadata diff
│   │   ├── rendering.ts          Template variable substitution
│   │   ├── hashing.ts            contentHash canonicalisation
│   │   ├── analyzers/            Refinement diagnostics (pure)
│   │   │   ├── types.ts
│   │   │   ├── ambiguity.ts
│   │   │   ├── missingConstraints.ts
│   │   │   ├── unclearRole.ts
│   │   │   ├── redundancy.ts
│   │   │   ├── underspecification.ts
│   │   │   └── index.ts
│   │   └── errors.ts             Typed domain errors
│   ├── services/                 Application services (DB + domain)
│   │   ├── context.ts            Service context (prisma client)
│   │   ├── projectService.ts
│   │   ├── promptService.ts
│   │   ├── branchService.ts
│   │   ├── versionService.ts
│   │   ├── runService.ts
│   │   ├── evaluationService.ts
│   │   ├── refinementService.ts
│   │   ├── searchService.ts
│   │   ├── comparisonService.ts
│   │   ├── datasetService.ts
│   │   ├── modelProfileService.ts
│   │   ├── rubricService.ts
│   │   └── decisionService.ts
│   ├── adapters/
│   │   ├── db/prisma.ts          Prisma singleton
│   │   ├── models/               LLM provider adapters
│   │   │   ├── types.ts          ModelAdapter interface
│   │   │   ├── mock.ts           Deterministic mock (default)
│   │   │   ├── anthropic.ts      Real provider (stubbed if no API key)
│   │   │   └── registry.ts
│   │   └── evaluators/
│   │       ├── types.ts          EvaluatorAdapter interface
│   │       ├── regex.ts
│   │       ├── schema.ts
│   │       ├── similarity.ts
│   │       ├── rubric.ts
│   │       ├── llmJudge.ts
│   │       └── registry.ts
│   ├── ui/
│   │   ├── tree/PromptTree.tsx
│   │   ├── diff/DiffView.tsx
│   │   ├── editor/VersionEditor.tsx
│   │   ├── run/RunDialog.tsx
│   │   ├── refine/RefineWorkspace.tsx
│   │   └── common/ (Button, Badge, StatusPill, KeymapHint, ...)
│   └── lib/
│       ├── slug.ts
│       ├── id.ts
│       └── format.ts
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
├── tests/
│   ├── domain/
│   │   ├── versioning.test.ts
│   │   ├── branching.test.ts
│   │   ├── lineage.test.ts
│   │   ├── promotion.test.ts
│   │   ├── status.test.ts
│   │   ├── rendering.test.ts
│   │   ├── diff.test.ts
│   │   └── hashing.test.ts
│   └── services/
│       └── versionService.test.ts  (in-memory prisma)
├── docs/ (phase 1..5 docs)
├── package.json
├── tsconfig.json
├── next.config.mjs
├── tailwind.config.ts
├── postcss.config.mjs
├── vitest.config.ts
├── .eslintrc.json
├── .gitignore
├── CLAUDE.md
└── README.md
```

**Layering rule** (enforced by review; a lint rule is a v2 addition):
- `src/domain/**` imports nothing from `src/services`, `src/adapters`,
  `app/`, or Prisma. It is pure.
- `src/services/**` imports `src/domain` and `src/adapters/db`. It owns
  all DB writes.
- `src/adapters/**` imports `src/domain` types only.
- `app/**` imports services (via server actions). It never imports Prisma
  directly.

## 4.3 Database schema (summary)

Full schema in `prisma/schema.prisma`. Key indices:
- `PromptVersion`: `(promptId, number)` unique; `(promptId, parentVersionId)`;
  `contentHash`.
- `PromptBranch`: `(promptId, name)` unique.
- `PromptRun`: `(versionId, createdAt)`; `(testCaseId, modelProfileId)`.
- `PromptEvaluation`: `(runId)`.
- `PromptLineageEdge`: `(fromVersionId)`, `(toVersionId)`.

FTS: SQLite FTS5 virtual table populated by triggers (MVP). On Postgres,
swap for `tsvector` + GIN.

## 4.4 Service boundaries

All mutations go through a service function. Shape:

```ts
// Each service function takes a ServiceContext and a typed input.
export async function createVersion(
  ctx: ServiceContext,
  input: CreateVersionInput,
): Promise<PromptVersion> { ... }
```

Invariants enforced by services:
- Version numbering (V2).
- Branch head advancement (V4).
- Status transitions (domain/status).
- Decision record on promotion/archive (P1).
- Lineage edge on merge/cherry-pick/refinement (R2).

Services are the only code path permitted to call `prisma.*.create/update`
for domain tables. UI calls a server action, server action calls a service.

## 4.5 Background job design

Interface:

```ts
interface JobRunner {
  enqueue(job: Job): Promise<JobHandle>;
  onComplete(jobId: string, cb: (result: JobResult) => void): void;
}
```

MVP implementation: in-process synchronous runner. All calls to the mock
model provider are sync, so `createRun` returns the completed run.

V2: swap to BullMQ (Redis) or QStash. Because services own the persistence
and adapters own the model call, the swap is one file.

## 4.6 Indexing / search strategy

1. **FTS (MVP)**: on write, services call `searchIndexer.indexVersion(v)` /
   `indexPrompt(p)` / `indexNote(n)`. The indexer is an adapter; its MVP
   implementation upserts into the FTS5 virtual table.
2. **Structured filters (MVP)**: SQL over Prisma.
3. **Semantic search (V2)**: the same `searchService.findByIntent` call
   site uses a pluggable vector adapter (pgvector / Qdrant / local).

## 4.7 Security considerations (MVP)

- No auth in MVP; acknowledged. All routes behave as a single-user app.
  The schema carries `createdBy` / `decidedBy` so adding auth later is
  additive.
- Server actions validate all inputs with Zod schemas colocated with the
  service input types.
- Template rendering never executes user code. Variables are interpolated
  as strings; no eval, no `new Function`.
- LLM provider keys are read from `process.env` server-side only and are
  never exposed in server actions' responses.
- FTS inputs are parameterised; no string concatenation into SQL.

## 4.8 Performance considerations

- Per-prompt DAG is expected to be small (≤ thousands). We query the
  full version list per prompt and build the tree client-side; server
  round-trips are avoided for navigation within one prompt.
- Runs are the high-volume table. Queries are always filtered by
  `versionId` or `testCaseId`, both indexed.
- Diff is O(n) line diff, O(n·m) word diff on modified lines only.
- Content hashing is sha-256 of canonicalised content; cost is negligible
  on prompt-sized inputs.
- Avoids N+1 by shaping service return types to match UI needs (co-loaded
  relations declared in Prisma includes).

## 4.9 Error handling

Domain functions throw typed errors (`DomainError` subclasses in
`domain/errors.ts`). Services let them propagate; server actions map them
to HTTP-equivalent statuses and user-facing messages. No silent catches.

## 4.10 Observability (v2 placeholder)

Every service emits a structured log line with `{ op, actor, entity,
ids, ms, result }`. MVP writes to console; V2 plugs a sink.
