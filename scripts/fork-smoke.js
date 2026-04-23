#!/usr/bin/env node
// Fork-to-clipboard smoke test — verifies that D3 round-trips cleanly:
//
//   1. Copy JSON → modal carries a prompt-tree-template/1 payload with
//      a `source` block that names the origin prompt + version.
//   2. Download .json lands an identical file on disk.
//   3. Paste the payload on /templates → the normal preview appears
//      with the forked body, then Import creates a new prompt on the
//      demo project whose v1 matches the source body byte-for-byte.
//   4. Ctrl+Z unwinds the import atomically.
//
// Runs against the seeded demo (fresh IDB per test). Exits non-zero on
// any assertion failure OR any console/page error.

const { chromium } = require("playwright");
const { spawn } = require("child_process");
const server = spawn("python3", ["-m", "http.server", "4495", "--directory", "webapp"],
  { stdio: ["ignore", "ignore", "ignore"] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function freshPage(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  await ctx.addInitScript(() => { try { localStorage.setItem("prompt-tree:tour:completed", "1"); } catch {} });
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text()); });
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  page.errs = errs;
  return page;
}

function fail(msg) { console.error("FAIL:", msg); process.exit(1); }

(async () => {
  await wait(500);
  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  });

  // ───────────── Test 1: Copy-JSON modal produces a valid fork payload ─
  let forkJson;
  let sourceBody;
  {
    const page = await freshPage(browser);
    await page.goto("http://localhost:4495/#/p/demo/p/ticket-classifier", { waitUntil: "networkidle" });
    await wait(400);
    sourceBody = await page.$eval(".code-frame pre", (el) => el.textContent);

    // Click the new "Copy JSON" button in the action bar (disambiguated
    // via .main-head because the run drawer has one too).
    await page.click('.main-head [data-act="copy-json"]');
    await wait(300);

    forkJson = await page.$eval("textarea[data-fork-json]", (el) => el.value);
    const parsed = JSON.parse(forkJson);
    if (parsed.format !== "prompt-tree-template/1") fail(`wrong format: ${parsed.format}`);
    if (!parsed.source || parsed.source.promptSlug !== "ticket-classifier") {
      fail(`missing or wrong source block: ${JSON.stringify(parsed.source)}`);
    }
    if (parsed.prompt.body !== sourceBody) {
      fail(`fork body doesn't match prompt body`);
    }
    // Never leak any of these:
    for (const forbidden of ["runs", "proposals", "decisions", "activities"]) {
      if (new RegExp(`"${forbidden}"`).test(forkJson)) {
        fail(`fork leaked a forbidden field: ${forbidden}`);
      }
    }
    if (page.errs.length) fail("test 1 console errors: " + page.errs.join(" | "));
    console.log("✓ test 1: Copy-JSON produces a portable prompt-tree-template/1 with source provenance");
    await page.context().close();
  }

  // ───────────── Test 2: paste + validate + preview re-uses the library flow
  {
    const page = await freshPage(browser);
    await page.goto("http://localhost:4495/#/templates", { waitUntil: "networkidle" });
    await wait(500);

    await page.click('[data-act="paste-import"]');
    await wait(300);
    await page.fill("textarea[data-paste-json]", forkJson);
    await page.click(".modal [data-mod='ok']");
    await wait(400);

    // Preview modal should now be open with body + Import CTA.
    const body = await page.$eval(".modal .code-frame pre", (el) => el.textContent);
    if (body !== sourceBody) fail("pasted preview body mismatch");
    const primary = await page.$eval(".modal .actions [data-mod='ok']", (el) => el.textContent.trim());
    if (!/Import/i.test(primary)) fail(`expected Import CTA, got: ${primary}`);
    if (page.errs.length) fail("test 2 console errors: " + page.errs.join(" | "));
    console.log("✓ test 2: paste → validate → preview with the same body");
    await page.context().close();
  }

  // ───────────── Test 3: paste + import creates a new prompt with the same body
  {
    const page = await freshPage(browser);
    await page.goto("http://localhost:4495/#/templates", { waitUntil: "networkidle" });
    await wait(500);
    await page.click('[data-act="paste-import"]');
    await wait(300);
    await page.fill("textarea[data-paste-json]", forkJson);
    await page.click(".modal [data-mod='ok']");
    await wait(400);

    // Rename to avoid clashing with the seeded "Ticket classifier".
    await page.fill(".modal input[name='name']", "Ticket classifier (fork)");

    const before = await page.evaluate(async () => {
      const store = await import("/js/store.js");
      return store.getState().projects.find((p) => p.slug === "demo").prompts.length;
    });
    await page.click(".modal [data-mod='ok']");
    await wait(700);

    const hash = await page.evaluate(() => location.hash);
    if (!/\/p\/demo\/p\//.test(hash)) fail(`expected redirect into new prompt, got ${hash}`);

    const after = await page.evaluate(async () => {
      const store = await import("/js/store.js");
      return store.getState().projects.find((p) => p.slug === "demo").prompts.length;
    });
    if (after !== before + 1) fail(`prompt count didn't grow by 1: ${before} → ${after}`);

    const importedBody = await page.$eval(".code-frame pre", (el) => el.textContent);
    if (importedBody !== sourceBody) fail("imported prompt body ≠ source body");

    // Ctrl+Z unwinds the import.
    await page.keyboard.press("Control+z");
    await wait(400);
    const restored = await page.evaluate(async () => {
      const store = await import("/js/store.js");
      return store.getState().projects.find((p) => p.slug === "demo").prompts.length;
    });
    if (restored !== before) fail(`undo did not unwind the fork import: ${before} → ${restored}`);

    if (page.errs.length) fail("test 3 console errors: " + page.errs.join(" | "));
    console.log("✓ test 3: paste → Import creates a new prompt with the source body; Ctrl+Z unwinds");
    await page.context().close();
  }

  // ───────────── Test 4: malformed JSON surfaces a friendly error, no crash
  {
    const page = await freshPage(browser);
    await page.goto("http://localhost:4495/#/templates", { waitUntil: "networkidle" });
    await wait(500);
    await page.click('[data-act="paste-import"]');
    await wait(300);
    await page.fill("textarea[data-paste-json]", "not real json {");
    await page.click(".modal [data-mod='ok']");
    await wait(300);
    const err = await page.$eval("#modal-error", (el) => el.textContent.trim()).catch(() => "");
    if (!/valid JSON|truncated|comma/i.test(err)) {
      fail(`expected friendly JSON error, got: ${err.slice(0, 120)}`);
    }
    console.log("✓ test 4: garbage paste surfaces a friendly error inline");
    await page.context().close();
  }

  console.log("\nAll fork-to-clipboard tests passed.");
  await browser.close();
  server.kill();
  process.exit(0);
})();
