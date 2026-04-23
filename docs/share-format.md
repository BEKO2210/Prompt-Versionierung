# Prompt Tree share-link format

Share links let anyone open a **read-only view** of one prompt at one
version without an account, backend, or network roundtrip. The slice is
packed into the URL fragment (`#/share?d=…`) which browsers never send
to servers.

The envelope is versioned so older readers refuse future bumps cleanly
rather than rendering garbled output.

- `prompt-tree-share/1` — the shape described here.

Schema versions are bumped only when the shape changes incompatibly.
Adding new optional fields is *not* a version bump.

## What's inside

A slice is deliberately narrow:

- **project**: `{ slug, name }` — just enough to show the breadcrumb.
- **prompt**: `{ slug, name, description?, purpose?, readme? }` —
  everything a reader needs to make sense of the prompt.
- **targetVersionId**: the version the URL originally pointed to.
- **canonicalBranchId** (optional): so the canonical crown renders.
- **branches[]**: only the branches the ancestor chain actually walks
  through. Sibling branches are not shared — they belong to the
  author, not this link.
- **versions[]**: the target plus its full ancestor chain (root-first).
  Each version carries `{ id, number, parentVersionId,
  createdOnBranchId, title, body, messages?, status, contentHash?,
  changeSummary?, rationale?, author?, createdAt? }`.

Things that are **not** included, on purpose:

- No runs, proposals, decisions, lineage edges, activity, members.
  Those are workspace artefacts, not "this prompt at this version".
- No API keys, secrets, model profiles. Shares never carry secrets.
- No sibling branches or future work — only the chain that produced
  the linked version.

## How the URL is built

```
<origin>#/share?d=<algo>.<base64url-payload>
```

- `<algo>` ∈ `{ gz, raw }`.
- When both `CompressionStream` and `DecompressionStream` are available
  (Chrome ≥ 80, Firefox ≥ 113, Safari ≥ 16.4), the JSON is gzipped and
  the smaller of `gz`/`raw` wins.
- Older browsers fall back to `raw` and refuse `gz.` payloads with a
  friendly error.

## Treating payloads as untrusted

A share payload is user-editable. On the consumer side we always:

1. `validateShare(obj)` — reject unknown `format`, malformed shapes,
   missing `targetVersionId`, version entries that aren't in
   `versions[]`.
2. Escape every string at the render boundary through `escapeHtml()`.
   The README is the only markdown surface, routed through the vendored
   `marked` (which escapes HTML by default).
3. Never write anything to IndexedDB, localStorage, or the workspace
   state. The read-only view is strictly paint-only.

## Example

```jsonc
{
  "format": "prompt-tree-share/1",
  "generatedAt": 1714000000000,
  "project":  { "slug": "demo", "name": "Demo" },
  "prompt":   { "slug": "ticket-classifier", "name": "Ticket classifier" },
  "targetVersionId": "v3",
  "canonicalBranchId": "b_main",
  "branches": [
    { "id": "b_main", "name": "main", "color": "#0891b2", "headVersionId": "v3" }
  ],
  "versions": [
    { "id": "v1", "number": 1, "parentVersionId": null,
      "createdOnBranchId": "b_main", "title": "root",
      "body": "You are a careful ticket triage assistant…",
      "messages": null, "status": "draft", "contentHash": "…" },
    { "id": "v3", "number": 3, "parentVersionId": "v2",
      "createdOnBranchId": "b_main", "title": "With output format",
      "body": "…", "messages": null, "status": "approved",
      "contentHash": "…", "changeSummary": "Added structured JSON output" }
  ]
}
```

## Stability guarantee

`prompt-tree-share/1` will stay readable by every future Prompt Tree
version until a `prompt-tree-share/2` ships *alongside* `1`. We add
optional fields freely; we never rename or remove a required one
without a schema bump.
