#!/usr/bin/env node
// Models view smoke — covers the E-extension fixes:
//   1. The provider dropdown offers Anthropic / OpenAI / Google / Mock
//      (Gemini was missing before) and Model ID is a second dropdown.
//   2. Creating a profile with a catalog-picked model produces the
//      expected provider/modelId combo in state.
//   3. Per-row Delete removes the profile; Ctrl+Z restores it.
//   4. "Seed defaults" creates the mock-default profile atomically;
//      Ctrl+Z unwinds the whole seeding in one step.
//
// Runs against the seeded demo (fresh IDB per test). Exits non-zero on
// any assertion failure OR any console/page error.

const { chromium } = require("playwright");
const { spawn } = require("child_process");
const server = spawn("python3", ["-m", "http.server", "4530", "--directory", "webapp"],
  { stdio: ["ignore", "ignore", "ignore"] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function freshPage(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem("prompt-tree:tour:completed", "1");
      localStorage.setItem("prompt-tree:landing-seen", "1");
    } catch {}
  });
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

  // ───── Test 1: provider + model dropdowns are populated from the catalog ─
  {
    const page = await freshPage(browser);
    await page.goto("http://localhost:4530/#/p/demo/models", { waitUntil: "networkidle" });
    await wait(400);
    await page.click('[data-act="new-profile"]');
    await wait(300);
    const providers = await page.$$eval(
      "[data-provider-select] option", (opts) => opts.map((o) => o.value),
    );
    for (const expected of ["mock", "anthropic", "openai", "google"]) {
      if (!providers.includes(expected)) fail(`provider dropdown missing: ${expected}`);
    }
    const modelOpts = await page.$$eval(
      "[data-model-select] option", (opts) => opts.map((o) => o.value),
    );
    // OpenAI is the default initial provider; expect gpt-5 + custom.
    if (!modelOpts.includes("gpt-5")) fail("model dropdown missing gpt-5");
    if (!modelOpts.includes("__custom__")) fail("model dropdown missing Custom escape hatch");
    if (page.errs.length) fail("test 1 console errors: " + page.errs.join(" | "));
    console.log("✓ test 1: provider dropdown lists all four providers; model dropdown pulls from catalog + custom");
    await page.context().close();
  }

  // ───── Test 2: create a profile using catalog picks; state matches ─
  {
    const page = await freshPage(browser);
    await page.goto("http://localhost:4530/#/p/demo/models", { waitUntil: "networkidle" });
    await wait(400);
    await page.click('[data-act="new-profile"]');
    await wait(300);
    await page.fill('.modal input[name="name"]', "openai-flagship");
    await page.selectOption('.modal [data-provider-select]', "openai");
    await wait(150);
    await page.selectOption('.modal [data-model-select]', "gpt-5");
    await page.click('.modal [data-mod="ok"]');
    await wait(400);
    const profile = await page.evaluate(async () => {
      const s = await import("/js/store.js");
      const demo = s.getState().projects.find((p) => p.slug === "demo");
      return (demo.modelProfiles || []).find((m) => m.name === "openai-flagship") || null;
    });
    if (!profile) fail("profile was not created");
    if (profile.provider !== "openai" || profile.modelId !== "gpt-5") {
      fail(`wrong provider/modelId: ${JSON.stringify(profile)}`);
    }
    if (page.errs.length) fail("test 2 console errors: " + page.errs.join(" | "));
    console.log("✓ test 2: catalog-picked create stores {provider: openai, modelId: gpt-5}");
    await page.context().close();
  }

  // ───── Test 3: delete + Ctrl+Z restore (single profile) ─
  {
    const page = await freshPage(browser);
    await page.goto("http://localhost:4530/#/p/demo/models", { waitUntil: "networkidle" });
    await wait(400);
    const before = await page.$$eval(".form-card", (xs) => xs.length);
    if (before < 1) fail("no profiles in the seeded demo to delete");
    await page.click('[data-act="delete-profile"]');
    await wait(400);
    const after = await page.$$eval(".form-card", (xs) => xs.length);
    if (after !== before - 1) fail(`delete didn't remove one: ${before} → ${after}`);
    await page.keyboard.press("Control+z");
    await wait(400);
    const restored = await page.$$eval(".form-card", (xs) => xs.length);
    if (restored !== before) fail(`undo didn't restore the profile: got ${restored}`);
    if (page.errs.length) fail("test 3 console errors: " + page.errs.join(" | "));
    console.log("✓ test 3: per-row delete removes a profile; Ctrl+Z restores it");
    await page.context().close();
  }

  // ───── Test 4: seed-defaults creates mock-default atomically ─
  {
    const page = await freshPage(browser);
    // Register the confirm-dialog handler BEFORE the click so the
    // delete-all confirm is auto-accepted.
    page.on("dialog", (d) => d.accept());
    await page.goto("http://localhost:4530/#/p/demo/models", { waitUntil: "networkidle" });
    await wait(400);
    // Start from an empty list so the seed is observable.
    await page.click('[data-act="delete-all"]').catch(() => {});
    await wait(500);

    const afterWipe = await page.evaluate(async () => {
      const s = await import("/js/store.js");
      return (s.getState().projects.find((p) => p.slug === "demo").modelProfiles || []).length;
    });
    if (afterWipe !== 0) fail(`delete-all did not wipe: ${afterWipe} remain`);

    await page.click('[data-act="seed-defaults"]');
    await wait(500);
    const seeded = await page.evaluate(async () => {
      const s = await import("/js/store.js");
      return (s.getState().projects.find((p) => p.slug === "demo").modelProfiles || []).map((m) => m.name);
    });
    if (!seeded.includes("mock-default")) {
      fail(`seed-defaults must include mock-default; got ${JSON.stringify(seeded)}`);
    }
    // Ctrl+Z unwinds the seed atomically.
    await page.keyboard.press("Control+z");
    await wait(400);
    const unseeded = await page.evaluate(async () => {
      const s = await import("/js/store.js");
      return (s.getState().projects.find((p) => p.slug === "demo").modelProfiles || []).length;
    });
    if (unseeded !== 0) fail(`Ctrl+Z did not unwind seed-defaults: ${unseeded} remain`);
    if (page.errs.length) fail("test 4 console errors: " + page.errs.join(" | "));
    console.log("✓ test 4: seed-defaults writes mock-default and Ctrl+Z unwinds the whole seeding");
    await page.context().close();
  }

  console.log("\nAll models-view tests passed.");
  await browser.close();
  server.kill();
  process.exit(0);
})();
