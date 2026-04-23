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

    // Hero motion (E2): must use the tuned hero asset, and the tagline
    // must be broken into the three sequential reveal words so CSS can
    // time each one to the SVG's SMIL beats.
    const heroSrc = await page.$eval("[data-hero-mark]", (el) => el.getAttribute("src"));
    if (!/mark-hero\.svg/.test(heroSrc)) fail(`expected mark-hero.svg on default motion, got ${heroSrc}`);
    const words = await page.$$eval(".landing-tagline .reveal-word", (xs) => xs.map((x) => x.textContent.trim()));
    if (words.length !== 3 || words.join(" ") !== "Branch. Prove. Ship.") {
      fail(`tagline word split is wrong: ${JSON.stringify(words)}`);
    }

    if (page.errs.length) fail("test 1 console errors: " + page.errs.join(" | "));
    console.log("✓ test 1: empty workspace paints the landing surface with hero mark + 3 sequential words");
    await page.context().close();
  }

  // ───────────── Test 1b: prefers-reduced-motion swaps to static mark ──
  {
    const ctx = await browser.newContext({
      viewport: { width: 1400, height: 900 },
      reducedMotion: "reduce",
    });
    await ctx.route("**/data/seed.json", (r) => r.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ meta: { updatedAt: 0, revision: 0, schemaVersion: 1, author: null }, projects: [] }),
    }));
    await ctx.addInitScript(() => { try { localStorage.setItem("prompt-tree:tour:completed", "1"); } catch {} });
    const page = await ctx.newPage();
    const errs = [];
    page.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text()); });
    page.on("pageerror", (e) => errs.push("pageerror: " + e.message));

    await page.goto("http://localhost:4497/", { waitUntil: "networkidle" });
    await wait(400);
    const src = await page.$eval("[data-hero-mark]", (el) => el.getAttribute("src"));
    if (!/\/mark\.svg$/.test(src)) fail(`reduced-motion should use static mark.svg, got ${src}`);
    const flag = await page.evaluate(() => document.documentElement.dataset.reducedMotion);
    if (flag !== "1") fail(`expected html[data-reduced-motion="1"] flag`);
    // The reveal classes should have opacity 1 (animation bypassed) —
    // sample the tagline third word as a canary.
    const opacity = await page.$eval(".landing-tagline .reveal-word-3", (el) =>
      parseFloat(getComputedStyle(el).opacity));
    if (opacity < 0.99) fail(`reduced-motion: expected opacity ≈ 1, got ${opacity}`);

    if (errs.length) fail("test 1b console errors: " + errs.join(" | "));
    console.log("✓ test 1b: prefers-reduced-motion → static mark + instant reveal");
    await ctx.close();
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

  // ───────────── Test 4a: fresh visitor with real seed → landing first ──
  {
    // No marker preset, real seed auto-loads into IDB on boot. We
    // expect the landing FIRST (not the grid) because the visitor
    // hasn't acknowledged it. Because the visitor *has* projects
    // (the seed), the hero CTAs must be Go-to-workspace + New-project
    // — NOT Explore-with-the-demo (which would reset their data).
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    await ctx.addInitScript(() => { try { localStorage.setItem("prompt-tree:tour:completed", "1"); } catch {} });
    const page = await ctx.newPage();
    const errs = [];
    page.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text()); });

    await page.goto("http://localhost:4497/", { waitUntil: "networkidle" });
    await wait(500);
    if (!(await page.$(".landing-hero"))) fail("fresh visit with seeded demo should still show the landing first");

    // Safety: if the visitor has projects, the demo CTA must be hidden
    // and the go-to-workspace CTA must be present.
    if (await page.$('.landing-ctas [data-act="load-demo"]')) {
      fail("landing with existing projects must NOT show the Explore-with-the-demo CTA (would wipe data)");
    }
    if (!(await page.$('.landing-ctas [data-act="enter-workspace"]'))) {
      fail("landing with existing projects must show a Go-to-workspace CTA");
    }

    // Clicking Go-to-workspace flips the marker + shows the grid, with
    // the project list left intact.
    const countBefore = await page.evaluate(async () => {
      const s = await import("/js/store.js"); return (s.getState().projects || []).length;
    });
    await page.click('.landing-ctas [data-act="enter-workspace"]');
    await wait(500);
    const flag = await page.evaluate(() => localStorage.getItem("prompt-tree:landing-seen"));
    if (flag !== "1") fail(`expected landing-seen=1 after Go-to-workspace, got ${flag}`);
    const cards = await page.$$eval(".cards-grid > .card", (xs) => xs.length);
    if (cards < 1) fail(`Go-to-workspace did not paint the grid: ${cards} cards`);
    const countAfter = await page.evaluate(async () => {
      const s = await import("/js/store.js"); return (s.getState().projects || []).length;
    });
    if (countBefore !== countAfter) fail(`Go-to-workspace mutated state: ${countBefore} → ${countAfter}`);

    // Reload — the visitor should now land on the grid directly.
    await page.reload({ waitUntil: "networkidle" });
    await wait(400);
    if (await page.$(".landing-hero")) fail("returning visitor with marker should skip the landing");

    // The topbar "Welcome" action clears the marker and re-shows it.
    await page.click('[data-act="show-landing"]');
    await wait(400);
    if (!(await page.$(".landing-hero"))) fail("Welcome topbar action should re-reveal the landing");

    if (errs.length) fail("test 4a console errors: " + errs.join(" | "));
    console.log("✓ test 4a: seeded visitor lands on landing → Go-to-workspace keeps data + paints grid; Welcome re-reveals landing");
    await ctx.close();
  }

  // ───────────── Test 4b: empty seed + no marker → demo CTA works ──────
  {
    // Genuinely-new install path: no marker, empty seed. Clicking the
    // Explore-with-the-demo CTA MUST:
    //   - Fetch the real seed (we drop the stub after boot)
    //   - Populate state with ≥ 1 project
    //   - Set the marker
    //   - Navigate to the grid (landing gone, cards present)
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    let boot = true;
    await ctx.route("**/data/seed.json", (route) => {
      if (boot) {
        boot = false;
        route.fulfill({
          status: 200, contentType: "application/json",
          body: JSON.stringify({ meta: { updatedAt: 0, revision: 0, schemaVersion: 1, author: null }, projects: [] }),
        });
      } else {
        // Let the real file through for the CTA fetch.
        route.fallback();
      }
    });
    await ctx.addInitScript(() => { try { localStorage.setItem("prompt-tree:tour:completed", "1"); } catch {} });
    const page = await ctx.newPage();
    const errs = [];
    page.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text()); });

    await page.goto("http://localhost:4497/", { waitUntil: "networkidle" });
    await wait(400);
    if (!(await page.$(".landing-ctas [data-act=\"load-demo\"]"))) {
      fail("empty seed + no marker must render the Explore-with-the-demo CTA");
    }

    await page.click('[data-act="load-demo"]');
    await wait(900);
    const flag = await page.evaluate(() => localStorage.getItem("prompt-tree:landing-seen"));
    if (flag !== "1") fail(`load-demo must set the marker, got ${flag}`);
    const cards = await page.$$eval(".cards-grid > .card", (xs) => xs.length);
    if (cards < 1) fail(`load-demo must paint the grid: got ${cards} cards`);
    const projects = await page.evaluate(async () => {
      const s = await import("/js/store.js");
      return (s.getState().projects || []).map((p) => p.slug);
    });
    if (!projects.includes("demo")) fail(`load-demo must populate state with the demo project; got ${JSON.stringify(projects)}`);
    if (await page.$(".landing-hero")) fail("load-demo must leave the landing");

    if (errs.length) fail("test 4b console errors: " + errs.join(" | "));
    console.log("✓ test 4b: empty seed → load-demo CTA fetches real seed, sets marker, navigates to populated grid");
    await ctx.close();
  }

  // ───────────── Test 5: Explore-demo surfaces a clean error when seed is broken ─
  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    await ctx.addInitScript(() => { try { localStorage.setItem("prompt-tree:tour:completed", "1"); } catch {} });
    // First response on boot is OK so the landing paints. We'll switch
    // to the broken response for the CTA fetch.
    let boot = true;
    await ctx.route("**/data/seed.json", (route) => {
      if (boot) {
        boot = false;
        route.fulfill({
          status: 200, contentType: "application/json",
          body: JSON.stringify({ meta: { updatedAt: 0, revision: 0, schemaVersion: 1, author: null }, projects: [] }),
        });
      } else {
        route.fulfill({ status: 500, contentType: "text/plain", body: "boom" });
      }
    });
    const page = await ctx.newPage();
    await page.goto("http://localhost:4497/", { waitUntil: "networkidle" });
    await wait(400);

    await page.click('[data-act="load-demo"]');
    await wait(600);
    const toastText = await page.$eval("#toast", (el) => el.textContent.trim()).catch(() => "");
    if (!/Demo failed/i.test(toastText)) {
      fail(`expected a 'Demo failed' toast on broken seed, got: '${toastText}'`);
    }
    const flag = await page.evaluate(() => localStorage.getItem("prompt-tree:landing-seen"));
    if (flag === "1") fail("landing-seen must NOT be set when demo load fails");
    const stillOnLanding = !!(await page.$(".landing-hero"));
    if (!stillOnLanding) fail("broken demo fetch: visitor must stay on the landing");
    // Button must be re-enabled so the user can retry.
    const disabled = await page.$eval('[data-act="load-demo"]', (el) => el.disabled);
    if (disabled) fail("load-demo button stuck in disabled state after an error");

    console.log("✓ test 5: broken seed → error toast, landing stays, flag not set, button re-enabled");
    await ctx.close();
  }

  // ───────────── Test 6: tour never auto-starts while the landing is up ─
  // The spotlight tour is meant for the populated workspace (project
  // grid, activity feed, etc.). Opening it on the marketing surface
  // would aim tooltips at elements that don't exist there. The gate:
  // the autostart should only fire after the visitor has both taken
  // a landing CTA (marker set) AND is actually on the workspace route
  // with projects visible. This test drives the full handoff.
  {
    // Stub seed.json empty on the initial boot so the landing renders
    // the load-demo CTA (real seed would paint the has-projects
    // go-to-workspace CTA). The click then fetches the real seed.
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    let boot = true;
    await ctx.route("**/data/seed.json", (route) => {
      if (boot) {
        boot = false;
        route.fulfill({
          status: 200, contentType: "application/json",
          body: JSON.stringify({ meta: { updatedAt: 0, revision: 0, schemaVersion: 1, author: null }, projects: [] }),
        });
      } else route.fallback();
    });
    // NOTE: no tour-completed init script — a genuinely-fresh visitor.
    const page = await ctx.newPage();
    const errs = [];
    page.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text()); });

    await page.goto("http://localhost:4497/", { waitUntil: "networkidle" });
    await wait(800);                  // past the 300ms tour-autostart deferral

    if (!(await page.$(".landing-hero"))) fail("test 6 pre: landing should be up");
    if (await page.$("#tour-root .tour-tooltip")) {
      fail("tour tooltip must NOT appear while the landing is visible");
    }

    // Cross into the workspace — the autostart gate should open now.
    await page.click('[data-act="load-demo"]');
    await wait(1200);
    if (!(await page.$("#tour-root .tour-tooltip"))) {
      fail("tour tooltip must appear once the visitor lands on the populated workspace");
    }

    if (errs.length) fail("test 6 console errors: " + errs.join(" | "));
    console.log("✓ test 6: tour stays silent on the landing, auto-starts once the workspace paints");
    await ctx.close();
  }

  console.log("\nAll landing-page tests passed.");
  await browser.close();
  server.kill();
  process.exit(0);
})();
