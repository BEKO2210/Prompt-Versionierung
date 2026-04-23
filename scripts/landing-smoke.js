#!/usr/bin/env node
// Landing-page smoke test — verifies that when the workspace is empty
// (no visible projects), `/` renders the E1 landing surface, and that
// both CTAs behave:
//
//   1. With the seed pre-deleted, `/` shows the landing hero (not the
//      project grid). Topbar is the minimal "landing" variant.
//   2. "Explore with the demo" loads the seed + redirects back to `/`
//      which then paints the populated grid.
//   3. "Create your first project" opens the New-project modal.
//   4. Zero console errors throughout.

const { chromium } = require("playwright");
const { spawn } = require("child_process");
const server = spawn("python3", ["-m", "http.server", "4497", "--directory", "webapp"],
  { stdio: ["ignore", "ignore", "ignore"] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function emptyWorkspacePage(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  // Block the seed fetch so boot lands with zero projects.
  await ctx.route("**/data/seed.json", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        meta: { updatedAt: 0, revision: 0, schemaVersion: 1, author: null },
        projects: [],
      }),
    });
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

  // ───────────── Test 1: empty workspace → landing page paints ─────────
  {
    const page = await emptyWorkspacePage(browser);
    await page.goto("http://localhost:4497/", { waitUntil: "networkidle" });
    await wait(400);

    const hero = await page.$(".landing-hero");
    if (!hero) fail("landing hero section missing");
    const title = await page.$eval(".landing-title", (el) => el.textContent.trim());
    if (title !== "Prompt Tree") fail(`hero title mismatch: ${title}`);
    const pillarCount = await page.$$eval(".landing-pillar", (xs) => xs.length);
    if (pillarCount !== 3) fail(`expected 3 pillars, got ${pillarCount}`);
    const featureCols = await page.$$eval(".landing-feature-col", (xs) => xs.length);
    if (featureCols !== 2) fail(`expected 2 feature columns, got ${featureCols}`);
    // Topbar should NOT carry the populated-workspace action row.
    const resetBtn = await page.$('.topbar [data-act="reset"]');
    if (resetBtn) fail("landing topbar should not carry 'Reset demo' (only on populated workspace)");

    if (page.errs.length) fail("test 1 console errors: " + page.errs.join(" | "));
    console.log("✓ test 1: empty workspace paints the landing surface");
    await page.context().close();
  }

  // ───────────── Test 2: "Explore with the demo" loads the seed ────────
  {
    const page = await emptyWorkspacePage(browser);
    await page.goto("http://localhost:4497/", { waitUntil: "networkidle" });
    await wait(400);

    // Second navigation of seed.json should land on the real file — we only
    // want the *initial* boot to see an empty list. Route is ctx-level so
    // we unroute on the ctx (page.unroute would only match page-level routes).
    await page.context().unroute("**/data/seed.json");

    await page.click('[data-act="load-demo"]');
    await wait(900);

    const promptCount = await page.evaluate(async () => {
      const store = await import("/js/store.js");
      return (store.getState().projects || []).reduce(
        (n, p) => n + (p.prompts?.length || 0), 0,
      );
    });
    if (promptCount < 1) fail(`demo didn't load: ${promptCount} prompts in state`);

    // After loading the demo, `/` should paint the grid, not the landing.
    const gridCards = await page.$$eval(".cards-grid > .card", (xs) => xs.length);
    if (gridCards < 1) fail(`expected grid cards after demo load, got ${gridCards}`);

    if (page.errs.length) fail("test 2 console errors: " + page.errs.join(" | "));
    console.log("✓ test 2: Explore-with-the-demo loads the seed + renders the grid");
    await page.context().close();
  }

  // ───────────── Test 3: Create-project CTA opens the modal ───────────
  {
    const page = await emptyWorkspacePage(browser);
    await page.goto("http://localhost:4497/", { waitUntil: "networkidle" });
    await wait(400);

    await page.click('[data-act="new-project"]');
    await wait(300);
    const modalTitle = await page.$eval(".modal h2", (el) => el.textContent.trim()).catch(() => "");
    if (!/new project/i.test(modalTitle)) fail(`expected New-project modal, got title: ${modalTitle}`);
    if (page.errs.length) fail("test 3 console errors: " + page.errs.join(" | "));
    console.log("✓ test 3: Create-your-first-project opens the New-project modal");
    await page.context().close();
  }

  console.log("\nAll landing-page tests passed.");
  await browser.close();
  server.kill();
  process.exit(0);
})();
