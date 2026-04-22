# Prompt Tree — master plan & contributor handbook

This is the single source of truth for *where we are*, *where we're going*,
and *how we work*. Every change should leave this file consistent.

---

## 1. The product, in one line

**Prompt Tree is the place where prompts grow up — versioned, peer-reviewed, evaluated, and shippable.**

Tagline: **Branch. Prove. Ship.**

We are the offline-first, browser-only, git-style operating system for
prompts. Where competitors collect prompts, we **graduate** them.

### 1.1 Brand DNA

| | |
|---|---|
| **Name** | Prompt Tree (one word visually possible: PromptTree) |
| **Mark** | Three-node sigil: open seed → small fork dot → crowned head, joined by a single continuous spline. φ-proportions, −8° rotation. The spline is one path because the line from seed to head **never breaks**. |
| **Voice** | Direct. Engineering-credible. No emoji clutter. Explains *why*, not just *what*. |
| **Color** | Indigo→Violet→Purple (#4338ca → #6d28d9 → #a855f7) for accent. Slate ink for substance. Status palette per state. |
| **Typography** | System UI for legibility everywhere. Mono for hashes, code, version numbers. |
| **Anti-positioning** | Not a prompt vault. Not a wrapper around one model. Not a SaaS dashboard. We're tools, not telemetry. |

### 1.2 Positioning vs the field (April 2026)

| Player | Wedge | Their gap (= our opening) |
|---|---|---|
| Maxim AI | end-to-end SaaS | Closed cloud, vendor lock-in |
| LangSmith | tied to LangChain | Framework-coupled, not portable |
| Promptfoo | CLI-first dev tool | No collaboration UI, no review |
| PromptLayer | non-technical users | Weak versioning, weak diffs |
| Langfuse | OSS observability | Run-time, not authoring |
| **Prompt Tree** | **git-for-prompts, browser-only** | **(this is the wedge)** |

### 1.3 Target user

1. **Solo prompt builder** that wants real history without setting up a backend.
2. **Small AI team** that wants pull-request-style review for prompts.
3. **Researcher / educator** that wants reproducible, exportable artifacts.

---

## 2. What is shipped (Phase A — done)

- Domain model: projects, prompts, branches, versions, lineage edges,
  decisions, runs, evaluations, suggestions, releases, proposals, members.
- Service layer that owns every write. Versions are immutable; only
  `status` may transition.
- Five refinement analyzers (ambiguity, missing constraints, unclear role,
  redundancy, under-specification) + heuristic proposer.
- Five evaluators (regex, schema, similarity, rubric, mock LLM judge).
- Mock model adapter (deterministic, offline).
- Two execution surfaces:
  - **Next.js + Prisma + SQLite** reference implementation (see `app/`,
    `src/`, `prisma/`, `tests/`).
  - **Offline web app** under `webapp/` running fully on IndexedDB.
- Domain unit tests (74 vitest cases).
- Premium brand mark + favicon + wordmark.
- GitHub-Pages deploy workflow.
- Collaboration layer (proposals, inline reviews, releases, activity feed,
  README, member avatars).
- Headless UI walkthrough (`scripts/ui-walkthrough.js`) capturing 22
  reference screenshots and asserting 0 console errors / overflows.

---

## 3. Where we're going

We work **one bullet at a time** and update §3 + §4 of this document on
every commit. If a bullet is bigger than one turn, we split it into
sub-bullets in place. Done items move to §2.

### 3.A Phase B — Real-world readiness *(active)*

| # | Item | Status | Notes |
|---|---|---|---|
| B1 | **Real LLM provider integration with secure key storage** | **done** | three real providers behind one adapter contract; mock fallback when key missing |
| B1.1 | Settings UI for API keys + per-provider secrets in IndexedDB | **done** | `/settings` route, AES-GCM at-rest, separate `secrets` IDB store, never exported |
| B1.2 | Real Anthropic adapter using `anthropic-dangerous-direct-browser-access` | **done** | adapter + registry under `webapp/js/adapters/models/`; `createRun` is two-phase async (running → succeeded/failed); run row records `mocked + mockedReason` when key missing; run modal shows live provider status |
| B1.3 | Real OpenAI adapter | **done** | `adapters/models/openai.js`; standard chat completions; o-series uses `max_completion_tokens` and folds `system` into a leading user header; error-mapping mirrors Anthropic |
| B1.4 | Real Google Gemini adapter | **done** | `adapters/models/gemini.js`; auth via `x-goog-api-key` header (never in URL); contents/parts shape; system → `systemInstruction`; safety-block → typed error |
| B2 | **Standardised run output format** | **done** | `webapp/js/runFormat.js` produces `prompt-tree-run/1` envelope per run + `prompt-tree-runs/1` bundle per version; right-side drawer for run detail with Copy/Download JSON; "Export all" on the Runs tab; full schema documented in `docs/run-format.md` (with stability guarantee) |
| B3 | **Token counting + cost prediction** | **done** | `pricing.js` per-model rates ($/M tokens) with longest-prefix family match; `tokens.js` wraps js-tiktoken with a cache + chars/4 fallback for non-OpenAI; live "≈ N input tokens · ~$X" in Run modal; retro Token + Cost in Run drawer + new Cost column in Runs table |
| B4 | **Tutorial onboarding** | next | first-run interactive tour over real demo data |
| B5 | **Info / Help page** | pending | one-page reference: every concept, every keyboard shortcut |

### 3.B Phase C — Differentiators

| # | Item |
|---|---|
| C1 | Blame view: each body line shows the version that introduced it |
| C2 | Eval-score trend chart per prompt (uses Chart.js or μPlot) |
| C3 | A/B testing with statistical significance markers (Wilson score) |
| C4 | Multi-model batch evaluation: run one version across N model profiles in one click |
| C5 | Markdown via marked for README + proposals |
| C6 | Fuzzy command palette via Fuse.js |
| C7 | Approval gate on proposals: configurable N approvals required to merge |

### 3.C Phase D — Network effects

| # | Item |
|---|---|
| D1 | Public read-only share links (encode minimum prompt slice into URL hash) |
| D2 | Prompt template library (curated starter packs, importable) |
| D3 | Fork-to-clipboard: one click copies a prompt as a portable JSON |

### 3.D Phase E — Brand & positioning

| # | Item |
|---|---|
| E1 | Marketing landing page on `/` (when no project exists) |
| E2 | Hero motion: animated mark assembly (seed → fork → head) |
| E3 | Social card SVG generator per prompt |

---

## 4. Vendored dependencies (added in this turn)

We deliberately keep the runtime dependency graph **tiny**. Every library
must satisfy:
- Pure ES module
- Works on GitHub Pages with no build step
- Zero peer deps that we don't already ship
- Public-domain or permissive licence (MIT/Apache/BSD)

| Library | Version | Why | License |
|---|---|---|---|
| `marked` | latest | Real markdown for READMEs and proposal descriptions | MIT |
| `fuse.js` | latest | Fuzzy command palette + search ranking | Apache-2.0 |
| `js-tiktoken` | latest | Token counting → cost prediction across providers | MIT |

Loading: vendored under `webapp/vendor/<name>/` and imported via relative
ES module URLs. No CDN at runtime so the app stays offline-capable.

---

## 5. How we work (rules)

### 5.1 Engineering rules

1. **Read `docs/02-domain.md` before changing domain code.** Invariants
   there are not suggestions.
2. **Layering rule** (`docs/04-architecture.md §4.2`):
   - `src/domain/**` is pure. No DB. No fetch. No env access.
   - `src/services/**` owns all writes. Imports domain + adapters/db.
   - `src/adapters/**` is pluggable I/O. Never imports services.
   - `app/**` never imports Prisma directly. It calls services.
   - The webapp mirrors the same layering: `webapp/js/domain.js`,
     `webapp/js/services.js`, `webapp/js/adapters/`, `webapp/js/views/`.
3. **Versions are immutable.** Never write an `UPDATE` against a version
   row that changes content, parent, number, or `contentHash`. Only
   `status` may transition.
4. **Every governance action is a `PromptDecision`.** Promote, deprecate,
   archive, set-canonical-branch — write the decision row atomically.
5. **Every lineage-changing operation writes a `PromptLineageEdge`** when
   it cannot be represented by a single `parentVersionId` (merge,
   cherry-pick, refinement).
6. **Every state-changing service records an activity event.** No silent
   mutations.

### 5.2 How to extend

| Goal | Where |
|---|---|
| New analyzer | `src/domain/analyzers/<name>.ts` and `webapp/js/domain.js`. Add to the analyzer list; write a test. |
| New evaluator | `src/adapters/evaluators/<name>.ts` and `webapp/js/domain.js`. Register in the evaluator registry. |
| New model provider | `src/adapters/models/<name>.ts` and `webapp/js/adapters/models/<name>.js`. Register in registry. |
| New entity | Prisma schema + a service file + state shape in webapp + docs update. |
| New screen | `app/p/[project]/...` for Next.js, `webapp/js/views/<name>.js` for the offline app, register in router + main. |

### 5.3 Roadmap discipline (this section is the rule that makes the others stick)

1. We work **one item from §3 per turn**. If it doesn't fit, split into
   numbered sub-items in place. Add to §3, then start the smallest one.
2. On commit: move the item to §2 (Done) with a one-line note. Update
   any sub-items.
3. Add screenshots / before-after to `scripts/screenshots/` if the change
   is UI-visible.
4. Run `node scripts/ui-walkthrough.js` and require **0 console errors**
   before pushing.
5. Update `webapp/data/seed.json` if the schema changes so the demo
   reflects the new feature.

### 5.4 Things we never do

- Weaken the version immutability rule.
- Add a "save" button that silently overwrites a version.
- Collapse distinct concepts (prompt content vs run envelope vs
  evaluation vs decision) into one table.
- Reach into Prisma from UI code "to just fix this one thing".
- Introduce a runtime dependency without a clear domain need *and*
  matching the bar in §4.
- Ship UI without a walkthrough check.

---

## 6. Files you'll touch most

```
docs/02-domain.md          domain invariants
prisma/schema.prisma       Next.js DB schema
src/services/              Next.js service layer
webapp/js/services.js      offline service layer
webapp/js/views/           offline UI
webapp/data/seed.json      demo data
CLAUDE.md                  this file
```
