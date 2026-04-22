// Help / reference page — every concept, every shortcut, every format,
// in one place. Rendered through `marked` (vendored) so we get proper
// tables and link handling.

import { html, escapeHtml, icon, brandMark } from "../ui/components.js";
import { md } from "../vendor.js";

const HELP = `
# Prompt Tree — concepts, shortcuts, formats

A single page that documents what every word in this app means and how
each surface works. Bookmark it. **Press the question-mark key from
anywhere to jump back.**

---

## What this app is, in three sentences

Prompt Tree is a **git-style operating system for prompts**, running
entirely in your browser with no backend. Every edit is a permanent
version, every change has a diff, every change-of-record has receipts.
It exists because prompts are too important to live in a Notion page.

If you came from a code-hosting workflow: project = repo, prompt = file,
branch = branch, version = commit, proposed change = pull request,
release = tag, evaluation = test result.

---

## Concepts

### Project
Top-level workspace. All retrieval and tooling is project-scoped.
A seeded **Demo** project ships with the app so you can poke around
before building anything yourself.

### Prompt
The logical identity of one prompt — for example, "Ticket classifier".
A prompt has a name, a slug, a *purpose*, an optional README, and any
number of branches and versions.

### Branch
A named, mutable pointer into the version DAG, just like in git.
The **canonical** branch for each prompt (default \`main\`) is what gets
shipped. Branch names must match \`^[a-z][a-z0-9-]{0,63}$\`.

### Version
A frozen snapshot of a prompt's body, variables, status, change
summary, rationale and content hash. **Versions are immutable.** Only
\`status\` may transition; the body, parent and number are write-once.
Editing a prompt always *creates a new version* — the old one stays
addressable forever via its permalink.

### Status
A version moves through this state machine:

\`\`\`
draft → experimental → candidate → approved
                                 ↘ deprecated → archived
\`\`\`

You can always archive (with the exception of an approved version,
which must be deprecated first).

### Lineage edge
The parent pointer covers most relationships. The explicit
\`PromptLineageEdge\` rows cover the rest:

| Kind | When written |
|---|---|
| \`branch\` | When forking a branch from a different version |
| \`merge\` | When two parents are folded into one (V2) |
| \`cherry_pick\` | When a squashed promotion copies a version onto canonical |
| \`refinement\` | When an OptimizationSuggestion is accepted |

### Decision
An auditable governance record: promote, deprecate, archive,
set-canonical-branch. Every promotion writes one with a required
rationale. Decisions are append-only.

### Run
One execution of one version against one model and (optionally) one
test case. Stores the **whole envelope**: rendered prompt, raw output,
parsed JSON, tokens, latency, cost, status, error. Each run can have
multiple evaluations attached.

### Evaluation
A score on a run. Can come from regex / contains / exact / JSON-shape
/ token-similarity / a rubric / an LLM-as-judge / a human. Attribution
is required (\`evaluatorKind\` + optional \`evaluatorRef\`).

### Proposal (Proposed Change)
The pull-request equivalent. Open a proposal from a candidate version,
collect a description + evidence + line-anchored review comments + a
discussion thread, then **merge** (which calls promote and writes a
decision) or **decline**. While open, proposals show in the prompt's
Proposals tab with a green badge.

### Release
A named tag on a canonical version with release notes. Release notes
are auto-drafted from the change-summaries since the previous release.

### Refinement suggestion
Output of the local analyzer engine. Five analyzers (ambiguity, missing
constraints, unclear role, redundancy, under-specification) scan a
version and propose a rewrite. Accepting a suggestion forks a new
branch and writes a \`refinement\` lineage edge so the chain stays
auditable.

### Member / actor
Each project has a list of members with name, initials and color. The
**current actor** is whoever the workspace is acting as — every
mutation is attributed to them.

---

## Workflow — a typical session

1. **Start** in the workspace. Pick a project (or create one).
2. **Open a prompt**. The left rail shows the version tree; the main
   pane shows whichever version is selected.
3. **Edit → Commit**: opens an *Edit → new version* modal. Required:
   a one-line change summary. Optional but encouraged: rationale and
   expected improvement.
4. **Fork** if you need to try a different direction without disturbing
   the current branch.
5. **Run** against a test case + model profile. The run modal previews
   your input-token count and cost before the call leaves the browser.
6. **Refine** to get diagnostics + an auto-proposed rewrite.
7. **Compare** to see two versions side-by-side with paired evidence.
8. **Open a proposal** when a candidate is ready to ship. Discuss in
   the thread, leave inline review comments on the diff, then merge.
9. **Release**: tag the new canonical head with a name and a note.
   Release notes are auto-drafted from the change summaries since the
   last release.

---

## Keyboard shortcuts

| Keys | Where | What |
|---|---|---|
| \`⌘K\` / \`Ctrl-K\` / \`/\` | Anywhere | Open the command palette |
| \`E\` | Prompt view | Edit → new version |
| \`F\` | Prompt view | Fork a new branch |
| \`R\` | Prompt view | Run against a model + test case |
| \`Esc\` | Modal · drawer · palette · tour | Close |
| \`←\` / \`→\` | Tour | Previous / next step |

The palette searches across **all** projects: prompts, versions, notes.
Hit Enter to jump.

---

## Providers — how runs reach the model

Profiles say *which provider* to call. The current adapters:

| Provider | What gets called | Auth |
|---|---|---|
| \`mock\` | A deterministic in-process fake. Reproducible by seed. | none |
| \`anthropic\` | \`api.anthropic.com/v1/messages\` from the browser | \`anthropic-dangerous-direct-browser-access: true\` header |
| \`openai\` | \`api.openai.com/v1/chat/completions\` from the browser | \`Authorization: Bearer <key>\` |
| \`google\` | \`generativelanguage.googleapis.com\` Gemini REST | \`x-goog-api-key\` header |

**No API key configured?** The run silently falls back to mock and the
run row is annotated with an amber **MOCK** badge plus a tooltip
explaining why. You can always tell a real run from a mock substitute
in the runs table and in the run drawer.

---

## API keys — where they live

Open *Settings* (gear icon, top right of the workspace).

- Keys are stored in your browser's IndexedDB under
  \`prompt-tree → secrets\`, encrypted at rest with AES-GCM derived from
  this origin.
- Keys are **never** part of an *Export*, **never** broadcast over the
  cross-tab BroadcastChannel, **never** logged.
- Clearing browser data wipes them — there is no remote copy.
- Removing a key takes effect on the very next run (the adapter reads
  the key freshly each call).

---

## Cost estimation — how it works

We ship a small per-(provider, modelId) price table in
\`webapp/js/pricing.js\`, in USD per 1M tokens (input / output). The
prices are list rates around April 2026 and are illustrative — your
contracted rate may differ. Lookup order:

1. Exact model id match
2. **Longest-prefix family match** (\`claude-opus-4-7\` resolves to
   the \`claude-opus\` family)
3. Provider default
4. Zero

Token counting uses the vendored **js-tiktoken** for OpenAI families
(cl100k_base / o200k_base, lazy-loaded on first call). For Anthropic
and Gemini we fall back to a chars/4 estimator and label it as
*estimated* in the UI.

The Run modal previews input tokens + cost before you submit. The Run
drawer fills in real numbers after the call (or the estimator if the
provider didn't report tokens).

---

## Run JSON format

Every run can be exported as a single self-contained JSON document via
the *Copy JSON* / *Download JSON* buttons in the Run drawer. The whole
schema is documented in \`docs/run-format.md\` (in the repo). The TL;DR:

- Schema id: \`prompt-tree-run/1\`
- Self-contained: project + prompt + version + body + bindings +
  rendered prompt + raw output + evaluations + actor — all in one doc.
- **Never** includes API keys.
- Stable within a major version: additions are free, renames /
  type-changes / drops require a version bump.

The *Export all (JSON)* button on the Runs tab gives you a
\`prompt-tree-runs/1\` bundle of every run for the current version.
Perfect for diff vs baseline regressions.

---

## Privacy & data location

- All your work lives in IndexedDB on **this device, this browser**.
  There is no remote copy, no backend, no telemetry.
- Cross-tab sync uses BroadcastChannel and only carries a "state
  changed" signal — not the state itself; tabs reload from local IDB.
- Export gives you a JSON snapshot you can email yourself, commit to
  a repo, share with a teammate. Import replaces local state with the
  loaded snapshot (use *Reset demo* to restore the seeded baseline).

---

## How to extend

Adding a new analyzer, evaluator, or model provider is one new file
plus one line in a registry. The shape rules are in
\`CLAUDE.md\` §5 ("How we work"). Open it before changing domain code.

---

## Why we built it this way

Three opinions, in order of importance:

1. **Prompts are too important to live in a Notion page.** Once a
   prompt is in production, every change should be reviewable,
   reversible and explainable.
2. **Receipts beat opinions.** "We promoted this version" is worth
   nothing without "and here are the runs that backed the decision."
3. **Tools, not telemetry.** You shouldn't have to send your prompts
   to a SaaS dashboard to version them. Your data should leave only
   when *you* press *Export*.

---

## Help, this is broken

The fastest path: hit *Reset demo* in the workspace topbar — it
restores the seeded project so you can confirm the app itself is
fine. Then *Export* your real workspace as a JSON snapshot before
poking further.

If a new version was created but the UI is showing the old one, the
URL of the new version is permanent: navigate to it manually. Every
\`#/p/<project>/p/<prompt>/v/<id>\` is forever-resolvable.

If a run failed, open the Run drawer — the typed error from the
provider is shown there with the matching HTTP status, so you can
tell rate-limited from auth-failed from network-error.
`;

const TOC = [
  ["What this app is",          "what-this-app-is-in-three-sentences"],
  ["Concepts",                  "concepts"],
  ["Workflow",                  "workflow--a-typical-session"],
  ["Keyboard shortcuts",        "keyboard-shortcuts"],
  ["Providers",                 "providers--how-runs-reach-the-model"],
  ["API keys",                  "api-keys--where-they-live"],
  ["Cost estimation",           "cost-estimation--how-it-works"],
  ["Run JSON format",           "run-json-format"],
  ["Privacy",                   "privacy--data-location"],
  ["Extending",                 "how-to-extend"],
  ["Why",                       "why-we-built-it-this-way"],
  ["Help, this is broken",      "help-this-is-broken"],
];

export function renderHelpView() {
  return html`
    <div class="topbar">
      <a class="topbar-logo" href="#/"><span class="mark">${brandMark(22)}</span>Prompt Tree</a>
      <span class="topbar-crumb">
        <span class="sep">/</span><span class="current">Help</span>
      </span>
      <span class="topbar-spacer"></span>
      <button class="topbar-action" data-act="replay-tour">${icon("info", { size: 13 })} Replay tour</button>
    </div>

    <div class="main center help-page">
      <div class="help-grid">
        <aside class="help-toc">
          <div class="eyebrow" style="margin-bottom:8px">On this page</div>
          <nav>${TOC.map(([label, id]) =>
            `<a href="#/help#${id}" data-jump="${escapeHtml(id)}">${escapeHtml(label)}</a>`).join("")}</nav>
        </aside>
        <div class="help-content">
          ${md(HELP)}
        </div>
      </div>
    </div>
  `;
}

export function bindHelpView(root) {
  // Tour replay button.
  root.querySelector('[data-act="replay-tour"]')?.addEventListener("click", async () => {
    const t = await import("../tour.js");
    t.start({ force: true });
  });

  // Add anchor ids to headings (marked produces ids; we add a sluggable
  // fallback for h2/h3 so the TOC links jump correctly).
  const slugify = (s) => s.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  root.querySelectorAll(".help-content h2, .help-content h3").forEach((h) => {
    if (!h.id) h.id = slugify(h.textContent);
  });

  // TOC clicks: smooth-scroll to the target.
  root.querySelectorAll("[data-jump]").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const id = a.dataset.jump;
      const el = root.querySelector(`#${CSS.escape(id)}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  // ?-key from anywhere → scroll to top of help / no-op outside help.
  document.addEventListener("keydown", onHelpHotkey, { passive: true });
}

function onHelpHotkey(e) {
  if (e.key !== "?" || e.shiftKey === false) return;
  if (["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
  if (!location.hash.startsWith("#/help")) location.hash = "#/help";
}
