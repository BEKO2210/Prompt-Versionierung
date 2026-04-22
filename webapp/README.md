# Prompt Tree — offline web app

A fully offline, single-page version of Prompt Tree that runs on GitHub
Pages (or any static host). No backend, no build step.

## What's in here

| File | Role |
|---|---|
| `index.html` | Single-page shell. |
| `css/app.css` | Design tokens + all styles. |
| `js/store.js` | **IndexedDB-backed** store (localStorage fallback). One "state" document is the source of truth; writes are debounced, saves are atomic. |
| `js/domain.js` | Pure domain: content-hashing (WebCrypto SHA-256), template rendering, LCS diff with word-level highlight, lineage DAG, five analyzers, mock model runner, regex / schema / similarity evaluators. |
| `js/services.js` | Every mutation goes through here. Versions are append-only, status transitions are gated, promotions record decisions, refinement acceptance writes a `refinement` lineage edge. |
| `js/router.js` | Hash-based router with deep links (every version has a stable URL). |
| `js/main.js` | Wiring: boot, render cycle, command palette (⌘K), per-view shortcuts (E / F / R), cross-tab sync via BroadcastChannel. |
| `js/icons.js` | Inline-SVG icons, zero dependencies. |
| `js/views/*.js` | One file per screen. |
| `data/seed.json` | Pre-populated demo project (matches the reference screenshot). |

## Feels like a backend, but isn't

- **IndexedDB** gives you a real local database with atomic writes. Every
  service call mutates a structured-cloned draft, then commits in one
  transaction.
- **BroadcastChannel** sync: open the app in two tabs, edit in one, watch
  the other update.
- **SHA-256 content hashes** via WebCrypto — identical to the server
  implementation.
- **Immutable versions** are enforced in `services.js`. Old versions are
  only ever read, never overwritten.
- **Append-only decision log**, full lineage DAG with explicit edge kinds
  (`refinement`, `cherry_pick`), refinement analyzers, paired
  run-evidence in diff view.
- **Command palette** (`⌘K` / `Ctrl-K`) searches all projects /
  prompts / versions by substring.
- **Keyboard shortcuts** shown in the topbar: `E` edit → new version,
  `F` fork branch, `R` run.

## Export / import

Top-right of the workspace screen: **Export** downloads a JSON snapshot
of the entire state (schema-versioned). **Import** uploads one and
replaces local state atomically. Use it to share your workspace or back
up before a risky change.

## Deploying on GitHub Pages

The workflow `.github/workflows/pages.yml` publishes `webapp/` to Pages
on every push to `main`. Enable Pages under **Settings → Pages →
Source: GitHub Actions**. That's it.

If you prefer serving from the `/docs` branch instead, copy
`webapp/*` into `docs/` and point Pages at `main / /docs`.

## Local preview

```bash
# any static server works. Two examples:
python3 -m http.server --directory webapp 4000
# or
npx http-server webapp -p 4000
```

Open http://localhost:4000.

## Keyboard shortcuts

| Keys | Action |
|---|---|
| ⌘K / Ctrl-K | Command palette (jump to prompt / version) |
| `/` | Same as ⌘K |
| `E` | Edit → new version (on the prompt view) |
| `F` | Fork branch (on the prompt view) |
| `R` | Run (on the prompt view) |
| `Esc` | Close modal / palette |

## Where data lives

Your data lives in IndexedDB under the database name `prompt-tree`,
object store `kv`, key `state`. Clear it with your browser's devtools
or use **Reset demo** to restore the seed.
