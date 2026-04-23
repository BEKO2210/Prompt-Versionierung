<div align="center">

# Prompt Tree

**Branch. Prove. Ship.**

The offline-first, browser-only, git-style operating system for prompts.
Where other tools *collect* prompts, Prompt Tree **graduates** them —
versioned, peer-reviewed, evaluated, and shippable.

[Quick start](#quick-start) · [Features](#what-it-does) · [AI providers](#ai-providers) · [Architecture](#architecture) · [Roadmap](#roadmap) · [The long vision — GitHub for Prompts](#the-long-vision--github-for-prompts)

</div>

---

## The one-line pitch

Prompt Tree treats every prompt as an **immutable versioned artifact** with
lineage, evidence, and decisions — not a text blob. Fork branches like git,
diff any two versions, run them against test cases, attach evaluations,
open pull-request-style proposals, and promote winners into a canonical
branch. **Nothing is overwritten; everything is retrievable.**

## The problem we fix

- **Prompts drift silently.** Edits overwrite history. Good phrasings get lost.
- **"Improvements" are unverified.** Nobody runs the new version against the old one on the same inputs.
- **Branching is implicit.** `prompt_v2_final_FINAL_use_this.txt` is a real file in a real repo somewhere.
- **Promotion is a vibe, not a record.** "We're using v3 now because Ada said so in Slack."
- **Retrieval is weak.** Three weeks later nobody can find "the version we used for the customer-support tone experiment".

Prompt Tree keeps the receipts.

## Why browser-first

The whole product runs on GitHub Pages. No backend, no sign-up, no vendor
lock-in. Your data lives in **IndexedDB** in your browser. Export the entire
workspace as JSON in one click; import it in another tab or on another
machine. When we eventually add a backend (see the [roadmap](#roadmap)), the
browser-only path stays the default — the server will *extend*, never
*replace*, local workflows.

---

## What it does

Everything listed below is **shipped and working in the demo** today. Press
`/` or <kbd>⌘ K</kbd> in the app to search; press <kbd>?</kbd> to open the
full reference.

### 1. Version-controlled prompts, git-style

- **Projects** contain many **prompts**; each prompt contains many **branches**, each a pointer into the **version DAG**.
- Every edit creates a new version — old ones are permanently addressable by id.
- `contentHash` is part of the version, so "is this the same prompt?" has a hard answer.
- One branch per prompt is **canonical** (default `main`) — it answers "what should I ship?".
- Fork a version into a new branch. Cherry-pick. Promote (pointer fast-forward *or* squash-onto-canonical). Deprecate. Archive. Every governance action writes a `PromptDecision` row with required rationale — never silent.

### 2. Line-level diffs + blame

- Compare **any two versions** side-by-side with per-line diffs and word-level highlight inside modified lines.
- **Blame view**: toggle the Content tab's *Show blame* button; every line shows which version introduced it, with an avatar and the change summary. Click the gutter to jump to that version.

### 3. Runs & evaluations

- A **run** is the full execution envelope: the rendered prompt (with variable substitution), the raw model output, structured output (if JSON), token counts, latency, provider, cost estimate, test-case reference, seed, model-profile id. Runs are never mutated.
- Pluggable **evaluators** — regex/contains, JSON-schema conformance, similarity (Jaccard-token), rubric (criterion × weight), mock LLM-judge. Multiple evaluators per run are normal.
- **Batch run**: one version across N model profiles × M test cases in one click (<kbd>B</kbd> hotkey). Every cell is an ordinary run, so the Trend chart and A/B summary pick it up automatically.
- **Export all runs** on a version as a stable `prompt-tree-runs/1` JSON bundle — schema is versioned and documented in [`docs/run-format.md`](docs/run-format.md).

### 4. Proposals (pull-requests for prompts)

- Instead of promoting directly, open a **proposal** from any version with a title + description.
- Proposal page shows the diff, **inline line-anchored review comments**, a discussion thread, and the paired run-evidence table.
- **Approval gate**: configurable N approvals required to merge. The merge button is truly disabled (dimmed + grayscale) until the gate opens; self-approval by the opener is blocked. Approvals are revocable.
- Merge = squashed (linear main) or pointer fast-forward. Decline = logged decision.

### 5. A/B testing with statistical significance

- The Compare view computes **Wilson score intervals** for the pass-rate on each side and a **Newcombe method-10 CI for the difference**.
- You get an honest "B > A at 95 %" / "A > B at 95 %" / "not significant" badge instead of eyeballing averages.
- Pass = evaluator score ≥ 0.5. Null scores are ignored (missing, not failing). CI is clamped to ±1 for display; significance is decided on the raw bounds.

### 6. Score trend chart

- Per-prompt SVG line chart of mean evaluator score over versions, plus a line per test case.
- Hover any dot for `vN · test case · X%`; click to jump to that version.
- Sidebar shows the latest mean and the delta vs. the previous version.

### 7. Refinement suggestions

- Five domain analyzers (ambiguity, missing constraints, unclear role, redundancy, under-specification) inspect the current version and return typed findings.
- A heuristic **proposer** drafts a refined version; accepting it **forks a new branch** named `refine-vN-XXXX` and writes a `refinement` lineage edge — not a silent overwrite.

### 8. Collaboration layer

- Per-project **members** with avatars + colour chips.
- **Activity feed** per prompt and per project. Every service writes an event: `version_created`, `version_promoted`, `branch_created`, `run_completed`, `proposal_opened`, `proposal_merged`, `release_published`, `proposal_approved`, `proposal_unapproved`, …
- **Releases**: tag a canonical version with release notes auto-drafted from intervening change summaries.
- **README per prompt**, rendered with [marked](https://github.com/markedjs/marked) (vendored).

### 9. Keyboard-first UX

- <kbd>⌘ K</kbd> / <kbd>/</kbd> — fuzzy command palette (Fuse.js) across all projects, prompts, versions
- <kbd>E</kbd> — edit → new version
- <kbd>F</kbd> — fork
- <kbd>R</kbd> — run
- <kbd>B</kbd> — batch run (matrix modal)
- <kbd>?</kbd> — open Help from anywhere
- <kbd>Esc</kbd> — close modal / palette / drawer

### 10. Offline & portable

- **IndexedDB** for state, **localStorage** for theme + tour flag, **separate IndexedDB store** for encrypted API keys (AES-GCM at-rest, never exported).
- **Export**: one JSON file with the entire workspace (prompts, versions, branches, runs, evaluations, proposals, decisions, readmes, activities). Secrets are excluded.
- **Import**: drop it in another browser or tab — state is restored byte-identical.
- **Cross-tab sync**: BroadcastChannel keeps every open tab in lockstep.
- **Reset demo** button in the topbar restores the seeded demo without touching your keys.

---

## Concepts glossary

If you came from code hosting, the mapping is clean:

| GitHub | Prompt Tree |
|---|---|
| Repository | Project |
| File | Prompt |
| Branch | Branch |
| Commit | Version |
| Pull request | Proposal |
| Tag | Release |
| Issue | *(coming in Phase F)* |
| CI check | Evaluation |
| Merge commit with rationale | PromptDecision |

Formal definitions live in [`docs/02-domain.md`](docs/02-domain.md). The
invariants there are not suggestions.

---

**→ Das war Teil 1. Sag „weiter" für Teil 2 (Quick start, AI-Provider, Architektur).**
