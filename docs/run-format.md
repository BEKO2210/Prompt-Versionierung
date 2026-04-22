# Prompt Tree run format

Every Prompt Tree run can be exported as a single self-contained JSON
document. This document is the source of truth for that format.

The schema is **versioned**. The current versions are:

- `prompt-tree-run/1` — one run, fully self-contained.
- `prompt-tree-runs/1` — a bundle of runs sharing one
  (project, prompt, version) context.

Schema versions are bumped only when the shape changes incompatibly.
Adding new optional fields is *not* a version bump.

## Why a single envelope per run?

A reader who only has this document can:

1. **Reproduce the call** — same prompt body, same variable bindings,
   same model + settings.
2. **Score the output** — `expectedOutput` + `expectedKind` are present
   when the run was attached to a test case.
3. **Attribute it** — project, prompt, version, branch, content hash,
   author, member id are all here.

That self-containment is what makes runs comparable across versions,
across providers, and across tools.

## How to get one

- Per-run drawer (open by clicking a row in *Runs & Evidence*) →
  **Copy JSON** or **Download JSON**.
- Whole-version bundle: *Runs & Evidence* tab header →
  **Export all (JSON)**.

## `prompt-tree-run/1` — top-level shape

```jsonc
{
  "schema": "prompt-tree-run/1",
  "exportedAt": "2026-04-22T18:42:00.000Z",

  "run": {
    "id": "run_xxx",
    "createdAt": "ISO-8601",
    "startedAt": "ISO-8601",
    "finishedAt": "ISO-8601 | null",
    "status": "queued | running | succeeded | failed",
    "error": "string | null",
    "latencyMs": 0,
    "mocked": false,             // true when mock fallback was used
    "mockedReason": "string | null",
    "providerResponseId": "string | null"
  },

  "project": { "id": "...", "slug": "...", "name": "..." },

  "prompt":  { "id": "...", "slug": "...", "name": "...", "purpose": "..." | null },

  "version": {
    "id": "ver_xxx",
    "number": 5,
    "title": "string",
    "branch": "string | null",          // branch name
    "branchId": "string",
    "contentHash": "sha256-hex",         // 64 chars
    "status": "draft | experimental | candidate | approved | deprecated | archived",
    "body": "string",                    // template, with {{variables}}
    "messages": null | [ { "role": "system | user | assistant", "content": "..." } ],
    "variables": [
      {
        "name": "ticket",
        "type": "string | number | boolean | enum | json",
        "required": true,
        "description": "string | null",
        "defaultValue": null,
        "enumValues": null
      }
    ],
    "changeSummary": "string | null",
    "rationale": "string | null",
    "expectedImprovement": "string | null",
    "createdAt": "ISO-8601",
    "author": { "id": "mem_xxx", "name": "Belkis" } | null
  },

  "input": {
    "renderedPrompt": "string",          // exactly what was sent to the model
    "variableBindings": { "<name>": "..." } | null,
    "testCase": {
      "id": "tc_xxx",
      "name": "billing-refund",
      "expectedOutput": "billing",
      "expectedKind": "contains | exact | regex | schema | rubric | none",
      "datasetId": "ds_xxx",
      "datasetName": "support-tickets"
    } | null
  },

  "model": {
    "profileId": "mp_xxx",
    "profileName": "openai-gpt4o",
    "provider": "mock | anthropic | openai | google",
    "modelId": "claude-sonnet-4-6 | gpt-4o-mini | gemini-2.5-flash | …",
    "temperature": 0.2,
    "maxTokens": 1024
  },

  "output": {
    "raw": "string",                      // assistant text reply
    "structured": null | <any JSON>       // populated when raw parses as JSON
  },

  "usage": {
    "inputTokens": 210,                   // null if unknown
    "outputTokens": 25,
    "costEstimate": 0
  },

  "evaluations": [
    {
      "id": "ev_xxx",
      "evaluatorKind": "regex | schema | similarity | rubric | llm_judge | human",
      "score": 1,                         // normalised 0..1, or null
      "passed": true,                     // boolean or null
      "notes": "contains 'billing'",
      "criteriaScores": null | { "<criterion>": { "score": 0..1, "note": "..." } },
      "rubricId": "rub_xxx | null",
      "createdAt": "ISO-8601"
    }
  ],

  "actor": { "id": "mem_xxx", "name": "Belkis" } | null
}
```

### Field rules

- All timestamps are ISO-8601 UTC.
- `score` is normalised to `[0,1]`. `null` means the evaluator did not
  produce a numeric score (e.g. it was a structural check that only sets
  `passed`).
- `mocked: true` means the configured provider needed a key that was
  not present and the run was substituted with the deterministic mock.
  Treat `mocked: true` outputs as engineering placeholders, not
  evidence.
- `model.modelId` is the model the *profile* asked for; some providers
  also return a more specific resolved model in the response — when
  that's present, it overwrites `model.modelId` here so the document
  reflects what actually ran.
- The envelope **never** includes API keys.

## `prompt-tree-runs/1` — bundle shape

```jsonc
{
  "schema": "prompt-tree-runs/1",
  "exportedAt": "ISO-8601",
  "context": {
    "project": { "id": "...", "slug": "...", "name": "..." },
    "prompt":  { "id": "...", "slug": "...", "name": "..." },
    "version": { "id": "...", "number": 5, "title": "...", "contentHash": "..." } | null
  },
  "runs": [ /* prompt-tree-run/1 envelopes */ ]
}
```

The bundle keeps each run **fully self-contained** (the same shape as
single-run export) — `context` is a redundancy for human readers who
open the file directly. Downstream tooling can ignore `context` and
stream-process `runs[]`.

## What you can do with the JSON

- **Diff two runs** (different version, same test case + model) by
  picking `output.raw`, `usage.inputTokens`, `usage.outputTokens`, and
  `evaluations[*].score`. The evidence panel in the *Compare* view does
  exactly this.
- **Replay a run elsewhere**: read `input.renderedPrompt`, `model.*`,
  send it to your own client, compare your output to `output.raw`.
- **Build a regression suite**: for every approved canonical version,
  export the bundle, commit it to a `runs/` folder, then on every new
  proposal compare the new run's score to the recorded baseline.
- **Audit production decisions**: paste the JSON into a PR description
  to show *exactly* which prompt body, which test inputs, and which
  evaluations supported the decision.

## Stability guarantee

Within a major schema version we will:

- **add** optional fields freely;
- never **rename** an existing field;
- never **change the type** of an existing field;
- never **drop** a field unless it has been deprecated for at least one
  release.

Anything that breaks those rules bumps the schema version
(`prompt-tree-run/1` → `prompt-tree-run/2`) and the old version remains
exportable until at least the next major release.
