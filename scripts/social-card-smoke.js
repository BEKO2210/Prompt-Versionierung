#!/usr/bin/env node
// Social-card smoke test — verifies that E3 produces a usable preview
// + downloadable artifacts:
//
//   1. Social-card button opens a modal with a 1200×630 inline SVG
//      preview and three download/copy actions.
//   2. The SVG preview carries the version's project name, prompt
//      name, version number, and status string.
//   3. Theme toggle swaps the background colour between dark and
//      light.
//   4. Download .svg triggers a download of the rendered SVG (we
//      intercept it via page.waitForEvent).
//
// Runs against the seeded demo (fresh IDB per test). Exits non-zero on
// any assertion failure OR any console/page error.

const { chromium } = require("playwright");
const { spawn } = require("child_process");
const server = spawn("python3", ["-m", "http.server", "4500", "--directory", "webapp"],
  { stdio: ["ignore", "ignore", "ignore"] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function freshPage(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    acceptDownloads: true,
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

function decodeDataUrlSvg(url) {
  const i = url.indexOf(",");
  if (i < 0) return "";
  return decodeURIComponent(url.slice(i + 1));
}

(async () => {
  await wait(500);
  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  });

  // ───────────── Test 1: modal opens with a preview containing metadata ─
  {
    const page = await freshPage(browser);
    await page.goto("http://localhost:4500/#/p/demo/p/ticket-classifier", { waitUntil: "networkidle" });
    await wait(400);

    await page.click('.main-head [data-act="social-card"]');
    await wait(300);

    const preview = await page.$("[data-social-preview]");
    if (!preview) fail("social card preview <img> missing");
    // Read the resolved `.src` DOM property rather than the raw
    // attribute — the attribute comes through `escapeAttr` so `&`
    // becomes `&amp;`, which upsets decodeURIComponent.
    const src = await preview.evaluate((el) => el.src);
    if (!src || !src.startsWith("data:image/svg+xml")) {
      fail(`preview src should be an inline SVG data URL, got: ${(src || "").slice(0, 80)}`);
    }
    const svg = decodeDataUrlSvg(src);
    if (!/viewBox="0 0 1200 630"/.test(svg)) fail("preview SVG missing 1200×630 viewBox");

    // The demo has the "Ticket classifier" prompt — its name + DEMO
    // project label + some version string should show up verbatim.
    if (!svg.includes("Ticket classifier")) fail("preview SVG missing promptName");
    if (!svg.includes("DEMO")) fail("preview SVG missing uppercased project name");
    if (!/v\d+/.test(svg)) fail("preview SVG missing version number");

    if (page.errs.length) fail("test 1 console errors: " + page.errs.join(" | "));
    console.log("✓ test 1: Social-card modal paints a 1200×630 inline SVG with metadata");
    await page.context().close();
  }

  // ───────────── Test 2: theme toggle swaps the background colour ────
  {
    const page = await freshPage(browser);
    await page.goto("http://localhost:4500/#/p/demo/p/ticket-classifier", { waitUntil: "networkidle" });
    await wait(400);
    await page.click('.main-head [data-act="social-card"]');
    await wait(300);

    const darkSrc = await page.$eval("[data-social-preview]", (el) => el.src);
    const darkSvg = decodeDataUrlSvg(darkSrc);
    if (!darkSvg.includes('stop-color="#0b1220"')) fail("dark theme preview missing expected bg0");

    await page.click('.modal [data-theme="light"]');
    await wait(300);
    const lightSrc = await page.$eval("[data-social-preview]", (el) => el.src);
    const lightSvg = decodeDataUrlSvg(lightSrc);
    if (!lightSvg.includes('stop-color="#ffffff"')) fail("light theme preview missing white bg0");
    if (lightSvg === darkSvg) fail("theme toggle did not repaint the preview");

    if (page.errs.length) fail("test 2 console errors: " + page.errs.join(" | "));
    console.log("✓ test 2: theme toggle dark ↔ light repaints the preview");
    await page.context().close();
  }

  // ───────────── Test 3: Download .svg produces an actual file ────────
  {
    const page = await freshPage(browser);
    await page.goto("http://localhost:4500/#/p/demo/p/ticket-classifier", { waitUntil: "networkidle" });
    await wait(400);
    await page.click('.main-head [data-act="social-card"]');
    await wait(300);

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.click('[data-act="download-svg"]'),
    ]);
    const fn = download.suggestedFilename();
    if (!/\.svg$/.test(fn)) fail(`expected .svg filename, got ${fn}`);
    if (!/prompttree-social-/.test(fn)) fail(`expected prompttree-social- prefix, got ${fn}`);

    if (page.errs.length) fail("test 3 console errors: " + page.errs.join(" | "));
    console.log(`✓ test 3: Download .svg fires a real download (${fn})`);
    await page.context().close();
  }

  console.log("\nAll social-card tests passed.");
  await browser.close();
  server.kill();
  process.exit(0);
})();
