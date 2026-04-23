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
| B4 | **Tutorial onboarding** | **done** | `tour.js` 7-step spotlight over the real demo: workspace → activity feed → version tree → proposals → run modal → settings → keyboard shortcuts; navigates between routes, waits for selectors, dim+spotlight via box-shadow trick; auto-opens once on first visit (`localStorage` marker), Tutorial topbar button to replay |
| B5 | **Info / Help page** | **done** | `/help` route; `webapp/js/views/help.js` with sticky TOC + 12 sections (concepts, workflow, shortcuts, providers, API keys, cost, JSON format, privacy, extending, why, troubleshooting); rendered via `marked`; Help link in workspace topbar; `?` hotkey jumps to Help from anywhere; Replay-tour button |

**Phase B is complete.** All five items shipped. Three real LLM providers, secure key storage, schema-versioned JSON exports, token+cost prediction, onboarding tour, single-page reference.

### 3.B Phase C — Differentiators

| # | Item | Status |
|---|---|---|
| C1 | Blame view: each body line shows the version that introduced it | **done** | pure `blame(versions, targetId)` in `domain.js` walks the parent chain root→target, propagates per-line attribution through line-diffs; toggle in Content tab via `?blame=1`; renders gutter table with avatar + version + change summary, consecutive same-source lines collapse via rowspan; click gutter → jump to source version |
| C2 | Eval-score trend chart per prompt | **done** | hand-rolled SVG line chart in `webapp/js/ui/chart.js` (no Chart.js — single use, < 200 lines); `services.scoreTrend(prompt, project)` aggregates per (version, testCase); new "Trend" tab shows mean line + per-test-case lines, hover tooltips, click-to-jump-to-version, sidebar with latest score + delta-vs-previous |
| C3 | A/B testing with statistical significance markers (Wilson score) | **done** | pure `wilsonInterval` + `wilsonDiff` (Newcombe method 10) + `abFromScores` in `webapp/js/domain.js` mirrored to `src/domain/stats.ts`; Compare view `renderAbSummary` renders pass-rate per side with 95% Wilson CI, signed Δ with 95% Newcombe CI (clamped to ±1), and a green "B > A at 95%" / rose "A > B at 95%" / grey "not significant" badge; pass = score ≥ 0.5; 13 new vitest cases; stacks vertically below 720px. |
| C4 | Multi-model batch evaluation: run one version across N model profiles in one click | **done** | `services.batchRun` fans out to `createRun` for every (profile × test case) cell via `Promise.allSettled`; new Batch button + `B` hotkey on the prompt view open a 2-column checkbox matrix modal with Select-all/none per group, live total runs and summed input-cost estimate (tiktoken when available, chars/4 fallback), multi-evaluator selection, and navigates to the Runs tab before awaiting results so the running rows paint immediately; ad-hoc test-case bucket used when none selected; smoke test via `scripts/batch-smoke.js` presses B and asserts runs appear; native checkbox chrome restored so ☑ is visible. |
| C5 | Markdown via marked for README + proposals | **done** | swapped `renderMarkdown` → `vendor.md` (marked) on the README tab, proposal description, all proposal discussion comments and inline review comments. `.comment-text` CSS tightened so paragraphs sit naturally inside the comment chrome. |
| C6 | Fuzzy command palette via Fuse.js | **done** | `paletteCorpus()` builds a uniform record list; cached Fuse instance keyed on `meta.revision`; weighted keys (title 0.55 / slug 0.15 / projectName 0.10 / snippet 0.20); first keystroke uses substring fallback while Fuse warms, then re-ranks once loaded. |
| C7 | Approval gate on proposals: configurable N approvals required to merge | **done** | pure `approvalStatus` + `approvalsRequired` helpers in `src/domain/approval.ts` (mirrored in `webapp/js/domain.js`); services `approveProposal` / `unapproveProposal` / `setApprovalsRequired`; `mergeProposal` gets a precondition that throws with the exact remaining count; proposal page renders an approval bar with progress, approvers, Approve / Revoke CTA and inline "change" threshold editor; merge button is truly disabled (button[disabled] styled grayscale) until the gate opens; seed pre-loads `approvalsRequired: 2` + one Marco approval so the demo shows "1 of 2 · 1 more needed"; 13 new vitest cases; end-to-end `scripts/approval-smoke.js` approves → asserts merge enables → revokes → asserts gate closes. |

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

### 3.E Phase F — Backend: GitHub for Prompts

The long-term ambition. The browser-only app is the **wedge** — a complete
product that works offline for a solo prompt engineer. Phase F keeps every
offline workflow intact and adds the collaboration + discovery primitives
that make a shared platform.

| # | Item |
|---|---|
| F1 | Backend API (Next.js Route Handlers + Prisma/Postgres) that mirrors the webapp service layer one-for-one |
| F2 | Auth: email + OAuth (GitHub, Google). Per-user avatar + display name replaces the local `currentActor` |
| F3 | Organisations / teams with role-based membership (owner / maintainer / reviewer / viewer) |
| F4 | Remote repositories: `push` a project to the server, `pull` to sync. Conflict rule = same as git — the version DAG is append-only so conflicts can only happen on branch pointers |
| F5 | Public profiles + public prompts; `prompttree.com/<user>/<project>` read-only view of the UI |
| F6 | Forking across workspaces: one-click copy of a public project (or one prompt slice) into your own workspace, with a `forked_from` lineage edge that crosses project boundaries |
| F7 | Issues on prompts (bug reports, requests, discussion threads), same thread primitive the proposals already use |
| F8 | Server-side run cache: same (version, modelProfile, testCase, seed) hits never re-billed; sharable across a team |
| F9 | Pluggable run executors: browser-only stays default; teams can register a server-side executor that proxies to their own quota/rate-limited API keys |
| F10 | Search across public prompts (title, body, README, tags) |
| F11 | Stars, follows, activity feed per user — the social surface |
| F12 | Webhooks on `version_created`, `proposal_opened`, `proposal_merged`, `release_published` for CI/CD hooks into downstream systems |
| F13 | OAuth app + REST API (read-only v1) so third parties can build bots / linters / dashboards |

**Non-goals even at Phase F**: we do not store API keys on the server. BYOK-in-browser stays the primary path — Phase F8/F9 is opt-in team infrastructure, not a replacement.

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
