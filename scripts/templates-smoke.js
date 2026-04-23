#!/usr/bin/env node
// Template-library smoke test — verifies that:
//   1. Navigating to #/templates shows cards with real template names
//   2. Clicking a card opens a preview modal with body + variables
//   3. Importing into the demo project creates a new prompt AND
//      navigates to it, with the template body preserved on v1
//   4. Ctrl+Z unwinds the import so nothing is one-way
//
// Runs against the seeded demo (fresh IDB per test). Exits non-zero on
// any assertion failure OR any console/page error.

const { chromium } = require("playwright");
const { spawn } = require("child_process");
const server = spawn("python3", ["-m", "http.server", "4493", "--directory", "webapp"],
  { stdio: ["ignore", "ignore", "ignore"] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function freshPage(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem("prompt-tree:tour:completed", "1"); localStorage.setItem("prompt-tree:landing-seen", "1"); } catch {} });
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

  // ───────────────── Test 1: library paints with real cards ─────────────
  {
    const page = await freshPage(browser);
    await page.goto("http://localhost:4493/#/templates", { waitUntil: "networkidle" });
    await wait(500);
    const cardCount = await page.$$eval(".tmpl-card", (cs) => cs.length);
    if (cardCount < 3) fail(`expected ≥ 3 template cards, got ${cardCount}`);
    const firstName = await page.$eval(".tmpl-card .ttl", (el) => el.textContent.trim());
    if (!firstName) fail("first template card has no title");
    if (page.errs.length) fail("test 1 console errors: " + page.errs.join(" | "));
    console.log(`✓ test 1: library paints ${cardCount} cards (first: ${firstName})`);
    await page.context().close();
  }

  // ───────────────── Test 2: preview modal carries body + import CTA ────
  {
    const page = await freshPage(browser);
    await page.goto("http://localhost:4493/#/templates", { waitUntil: "networkidle" });
    await wait(500);
    await page.click(".tmpl-card");
    await wait(300);
    const body = await page.$eval(".modal .code-frame pre", (el) => el.textContent);
    if (!body || body.length < 10) fail(`preview body too short: ${JSON.stringify(body).slice(0,80)}`);
    const hasProjectSelect = await page.$('.modal select[name="projectId"]');
    if (!hasProjectSelect) fail("preview modal is missing project selector");
    const primaryText = await page.$eval(".modal .actions [data-mod='ok']", (el) => el.textContent.trim());
    if (!/Import/i.test(primaryText)) fail(`primary CTA should be Import, got: ${primaryText}`);
    if (page.errs.length) fail("test 2 console errors: " + page.errs.join(" | "));
    console.log("✓ test 2: preview modal shows body + Import CTA");
    await page.context().close();
  }

  // ───────────────── Test 3: import creates a prompt and navigates ───────
  {
    const page = await freshPage(browser);
    await page.goto("http://localhost:4493/#/templates", { waitUntil: "networkidle" });
    await wait(500);

    // Pick the Ticket classifier by id so we can assert on a known name.
    const targetCard = await page.$("[data-template-id='ticket-classifier']");
    if (!targetCard) fail("ticket-classifier card missing from library");
    await targetCard.click();
    await wait(300);

    // The library ships with a default name that *clashes* with the demo's
    // existing "Ticket classifier" prompt. Rename to avoid the guard.
    const uniqueName = "Ticket classifier (imported)";
    await page.fill(".modal input[name='name']", uniqueName);

    const promptsBefore = await page.evaluate(async () => {
      const store = await import("/js/store.js");
      return store.getState().projects.find((p) => p.slug === "demo").prompts.length;
    });

    await page.click(".modal [data-mod='ok']");
    await wait(700);

    // After import we expect to be on the new prompt page.
    const hash = await page.evaluate(() => location.hash);
    if (!/\/p\/demo\/p\//.test(hash)) fail(`expected /p/demo/p/... redirect, got: ${hash}`);

    const promptsAfter = await page.evaluate(async () => {
      const store = await import("/js/store.js");
      return store.getState().projects.find((p) => p.slug === "demo").prompts.length;
    });
    if (promptsAfter !== promptsBefore + 1) {
      fail(`expected prompt count +1, got ${promptsBefore} → ${promptsAfter}`);
    }

    // And the imported body should match the template's.
    const head = await page.$eval(".code-frame pre", (el) => el.textContent);
    if (!/support-ticket triage/i.test(head)) {
      fail(`imported body doesn't look like the ticket-classifier template: ${head.slice(0, 120)}`);
    }

    if (page.errs.length) fail("test 3 console errors: " + page.errs.join(" | "));
    console.log("✓ test 3: import creates a new prompt with the template body");
    await page.context().close();
  }

  // ───────────────── Test 4: Ctrl+Z unwinds the import ──────────────────
  {
    const page = await freshPage(browser);
    await page.goto("http://localhost:4493/#/templates", { waitUntil: "networkidle" });
    await wait(500);
    await page.click("[data-template-id='bullet-summarizer']");
    await wait(300);
    // Also rename to avoid any clash; the demo seed is conservative.
    await page.fill(".modal input[name='name']", "Bullet summarizer (imported)");
    const before = await page.evaluate(async () => {
      const store = await import("/js/store.js");
      return store.getState().projects.find((p) => p.slug === "demo").prompts.length;
    });
    await page.click(".modal [data-mod='ok']");
    await wait(600);
    const after = await page.evaluate(async () => {
      const store = await import("/js/store.js");
      return store.getState().projects.find((p) => p.slug === "demo").prompts.length;
    });
    if (after !== before + 1) fail(`expected +1 prompt, got ${before} → ${after}`);

    await page.keyboard.press("Control+z");
    await wait(400);
    const restored = await page.evaluate(async () => {
      const store = await import("/js/store.js");
      return store.getState().projects.find((p) => p.slug === "demo").prompts.length;
    });
    if (restored !== before) fail(`undo did not remove the import: ${before} → ${restored}`);

    if (page.errs.length) fail("test 4 console errors: " + page.errs.join(" | "));
    console.log("✓ test 4: Ctrl+Z unwinds a template import");
    await page.context().close();
  }

  console.log("\nAll template-library tests passed.");
  await browser.close();
  server.kill();
  process.exit(0);
})();
